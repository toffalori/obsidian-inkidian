import { describe, expect, it } from "vitest";
import { parseInkd, type InkdStroke, type Tool } from "../src/inkd";
import { inkBounds, lineCount, renderBackground, renderEmbed, renderPage, renderStroke, strokeAlpha, strokeOutline } from "../src/render";
import { toSvgString } from "../src/svg";
import { readSample, sampleNames } from "./samples";

/** A straight horizontal stroke from x = 0 to 200 at y = 100. */
function line(tool: Tool, pressure: number, baseWidth = 4): InkdStroke {
  const points = Array.from({ length: 41 }, (_, i) => ({ x: i * 5, y: 100, pressure }));
  return { tool, color: "#000000", opacity: 1, baseWidth, points };
}

/** Thickness of the outline away from the caps. */
function thickness(stroke: InkdStroke): number {
  const middle = strokeOutline(stroke).filter(([x]) => x > 50 && x < 150);
  const ys = middle.map(([, y]) => y);
  return Math.max(...ys) - Math.min(...ys);
}

describe("stroke geometry (SPEC §8)", () => {
  it.each([0, 0.25, 0.5, 1])("pen width at pressure %s is baseWidth · (0.25 + 1.5·p)", (pressure) => {
    expect(thickness(line("pen", pressure))).toBeCloseTo(4 * (0.25 + 1.5 * pressure), 1);
  });

  it.each(["pencil", "marker"] as const)("%s keeps its base width", (tool) => {
    expect(thickness(line(tool, 0.1))).toBeCloseTo(4, 1);
    expect(thickness(line(tool, 0.9))).toBeCloseTo(4, 1);
  });

  it("draws a stroke without length as a dot as wide as the stroke", () => {
    const dot: InkdStroke = { tool: "pen", color: "#000000", opacity: 1, baseWidth: 6, points: [{ x: 50, y: 50, pressure: 0.5 }] };
    expect(renderStroke(dot)).toEqual({ tag: "circle", attrs: { cx: 50, cy: 50, r: 3, fill: "#000000" }, children: [] });
    const pressed = { ...dot, points: [{ x: 50, y: 50, pressure: 1 }, { x: 50, y: 50, pressure: 1 }] };
    expect(renderStroke(pressed).attrs.r).toBe(5.25);
  });

  it("derives alpha from tool, opacity and mean pressure", () => {
    expect(strokeAlpha({ ...line("pen", 0.2), opacity: 0.8 })).toBeCloseTo(0.8);
    expect(strokeAlpha(line("pencil", 0.5))).toBeCloseTo(0.775);
    expect(strokeAlpha({ ...line("marker", 1), opacity: 0.5 })).toBeCloseTo(0.45);
  });

  it("blends markers with multiply", () => {
    expect(renderStroke(line("marker", 0.5)).attrs.style).toBe("mix-blend-mode:multiply");
    expect(renderStroke(line("pen", 0.5)).attrs.style).toBeUndefined();
    expect(renderStroke(line("pen", 0.5)).attrs["fill-opacity"]).toBeUndefined();
  });
});

describe("backgrounds (SPEC §5)", () => {
  it("draws lines strictly inside the page", () => {
    expect(lineCount(1754, 32)).toBe(54);
    expect(lineCount(1760, 32)).toBe(54);
    const [lines] = renderBackground({ type: "lined", spacing: 32, color: "#D0D7E2" }, 1240, 1754, "p");
    const d = String(lines.attrs.d);
    expect(d.startsWith("M0 32H1240M0 64H1240")).toBe(true);
    expect(d.endsWith("M0 1728H1240")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(54);
  });

  it("adds vertical lines for grids", () => {
    const [lines] = renderBackground({ type: "grid", spacing: 40, color: "#D0D7E2" }, 1240, 1754, "p");
    expect(String(lines.attrs.d).match(/V1754/g)).toHaveLength(30);
  });

  it("places dots at the crossings", () => {
    const [defs, area] = renderBackground({ type: "dots", spacing: 24, color: "#B8C2D0" }, 1240, 1754, "p");
    expect(defs.children[0].attrs).toMatchObject({ id: "p", x: 12, y: 12, width: 24, height: 24 });
    expect(area.attrs).toMatchObject({ x: 12, y: 12, width: 51 * 24, height: 73 * 24, fill: "url(#p)" });
  });

  it("draws nothing on blank pages", () => {
    expect(renderBackground({ type: "blank", spacing: 32, color: "#D0D7E2" }, 1240, 1754, "p")).toEqual([]);
  });
});

describe("embeds", () => {
  const document = (strokes: InkdStroke[]) => ({ formatVersion: 1, width: 1240, height: 1754, pages: [{ background: { type: "lined" as const, spacing: 32, color: "#D0D7E2" }, strokes }] });

  it("crops the first page to its ink plus a margin", () => {
    const svg = renderEmbed(document([line("pen", 0.5, 4)]), "e");
    // The line runs from x 0 to 200 at y 100; the pen is at most 7 wide (1.75 × 4).
    expect(inkBounds([line("pen", 0.5, 4)])).toEqual({ x: -3.5, y: 96.5, width: 207, height: 7 });
    expect(svg.attrs.viewBox).toBe("0 64.5 235.5 71");
    expect(svg.attrs.width).toBe(235.5);
  });

  it("shows the whole page when there is no ink", () => {
    expect(renderEmbed(document([]), "e").attrs.viewBox).toBe("0 0 1240 1754");
  });

  it("crops a sample note", () => {
    const result = parseInkd(readSample("minimal.inkd"));
    if (!result.ok) throw new Error(result.message);
    const [x, y, width, height] = String(renderEmbed(result.document, "e").attrs.viewBox).split(" ").map(Number);
    expect(x).toBeGreaterThan(150);
    expect(y).toBeGreaterThan(180);
    expect(width).toBeLessThan(220);
    expect(height).toBeLessThan(200);
  });
});

describe("SVG snapshots of the shared samples", () => {
  it.each(sampleNames)("%s", async (name) => {
    const result = parseInkd(readSample(name));
    if (!result.ok) throw new Error(result.message);
    for (const [index, page] of result.document.pages.entries()) {
      const svg = toSvgString(renderPage(page, result.document, index, "sample"));
      await expect(svg + "\n").toMatchFileSnapshot(`__snapshots__/${name.replace(".inkd", "")}-page${index + 1}.svg`);
    }
  });
});
