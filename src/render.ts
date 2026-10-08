// Renders `.inkd` pages as SVG following SPEC §5 (backgrounds) and §8 (ink).

import { getStroke } from "perfect-freehand";
import type { InkdBackground, InkdDocument, InkdPage, InkdStroke } from "./inkd";
import { h, SVG_NS, type SvgNode } from "./svg";

/** One `<svg>` per page. `idPrefix` keeps pattern ids unique in the document. */
export function renderPage(page: InkdPage, document: InkdDocument, index: number, idPrefix: string): SvgNode {
  const { width, height } = document;
  return h(
    "svg",
    {
      xmlns: SVG_NS,
      class: "inkidian-page",
      viewBox: `0 0 ${num(width)} ${num(height)}`,
      width: num(width),
      height: num(height),
      role: "img",
      "aria-label": `Page ${index + 1}`,
    },
    [
      h("rect", { class: "inkidian-paper", width: num(width), height: num(height), fill: "#FFFFFF" }),
      ...renderBackground(page.background, width, height, `${idPrefix}-dots-${index}`),
      h("g", { class: "inkidian-ink" }, page.strokes.map(renderStroke)),
    ],
  );
}

/**
 * The first page for an embed in a Markdown note, cropped to its ink plus a
 * margin, so a small sketch doesn't bring a whole empty page along.
 */
export function renderEmbed(document: InkdDocument, idPrefix: string, margin = 32): SvgNode {
  const svg = renderPage(document.pages[0], document, 0, idPrefix);
  const ink = inkBounds(document.pages[0].strokes);
  if (!ink) return svg;
  const x = Math.max(0, ink.x - margin);
  const y = Math.max(0, ink.y - margin);
  const width = Math.min(document.width, ink.x + ink.width + margin) - x;
  const height = Math.min(document.height, ink.y + ink.height + margin) - y;
  if (width <= 0 || height <= 0) return svg;
  svg.attrs.viewBox = `${num(x)} ${num(y)} ${num(width)} ${num(height)}`;
  svg.attrs.width = num(width);
  svg.attrs.height = num(height);
  return svg;
}

/** The area the ink covers, including half the widest stroke width; `null` without ink. */
export function inkBounds(strokes: InkdStroke[]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    const half = strokeWidth(stroke, 1) / 2;
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - half);
      minY = Math.min(minY, point.y - half);
      maxX = Math.max(maxX, point.x + half);
      maxY = Math.max(maxY, point.y + half);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Lines at k·spacing for k ≥ 1 and dots at their crossings, strictly inside the page. */
export function renderBackground(background: InkdBackground, width: number, height: number, patternId: string): SvgNode[] {
  const spacing = background.spacing;
  const rows = lineCount(height, spacing);
  const columns = lineCount(width, spacing);
  const horizontal = Array.from({ length: rows }, (_, k) => `M0 ${num((k + 1) * spacing)}H${num(width)}`);
  const vertical = Array.from({ length: columns }, (_, k) => `M${num((k + 1) * spacing)} 0V${num(height)}`);
  const lines = (commands: string[]) =>
    h("path", { class: "inkidian-pattern", d: commands.join(""), stroke: background.color, "stroke-width": 1, fill: "none" });

  switch (background.type) {
    case "blank":
      return [];
    case "lined":
      return rows > 0 ? [lines(horizontal)] : [];
    case "grid":
      return rows + columns > 0 ? [lines([...horizontal, ...vertical])] : [];
    case "dots": {
      // A tile shifted by half a spacing puts each dot at its center, so the
      // tiles inside the rectangle hold exactly the dots at (i·s, k·s), i, k ≥ 1.
      const half = num(spacing / 2);
      return [
        h("defs", {}, [
          h("pattern", { id: patternId, x: half, y: half, width: num(spacing), height: num(spacing), patternUnits: "userSpaceOnUse" }, [
            h("circle", { cx: half, cy: half, r: 1, fill: background.color }),
          ]),
        ]),
        h("rect", { class: "inkidian-pattern", x: half, y: half, width: num(columns * spacing), height: num(rows * spacing), fill: `url(#${patternId})` }),
      ];
    }
  }
}

export function lineCount(length: number, spacing: number): number {
  return Math.max(0, Math.ceil(length / spacing) - 1);
}

export function renderStroke(stroke: InkdStroke): SvgNode {
  const [first] = stroke.points;
  const isDot = stroke.points.every((point) => point.x === first.x && point.y === first.y);
  // A stroke without length is a dot as wide as the stroke (SPEC §8).
  const attrs: Record<string, string | number> = isDot
    ? { cx: num(first.x), cy: num(first.y), r: num(strokeWidth(stroke, first.pressure) / 2), fill: stroke.color }
    : { d: outlinePath(strokeOutline(stroke)), fill: stroke.color };
  const alpha = strokeAlpha(stroke);
  if (alpha < 1) attrs["fill-opacity"] = num(alpha, 3);
  if (stroke.tool === "marker") attrs.style = "mix-blend-mode:multiply";
  return h(isDot ? "circle" : "path", attrs);
}

export function strokeWidth(stroke: InkdStroke, pressure: number): number {
  return stroke.tool === "pen" ? stroke.baseWidth * (0.25 + 1.5 * pressure) : stroke.baseWidth;
}

/**
 * The stroke's outline. perfect-freehand with `size = baseWidth`, `thinning = 0.75`
 * and linear easing draws exactly `baseWidth · (0.25 + 1.5·p)` (SPEC §8); pencil and
 * marker keep their width.
 */
export function strokeOutline(stroke: InkdStroke): number[][] {
  return getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    {
      size: stroke.baseWidth,
      thinning: stroke.tool === "pen" ? 0.75 : 0,
      smoothing: 0.5,
      streamline: 0,
      easing: (pressure) => pressure,
      simulatePressure: false,
      last: true,
      start: { cap: true, taper: 0 },
      end: { cap: true, taper: 0 },
    },
  );
}

/** SPEC §8 alpha. An SVG path has one alpha, so pencil and marker use the mean pressure. */
export function strokeAlpha(stroke: InkdStroke): number {
  const pressure = stroke.points.reduce((sum, point) => sum + point.pressure, 0) / stroke.points.length;
  switch (stroke.tool) {
    case "pen":
      return stroke.opacity;
    case "pencil":
      return stroke.opacity * (0.55 + 0.45 * pressure);
    case "marker":
      return stroke.opacity * (0.45 + 0.45 * pressure);
  }
}

/** Closed path through the outline points, smoothed with quadratic curves. */
export function outlinePath(points: number[][]): string {
  if (points.length < 4) {
    return points.length === 0 ? "" : `M${points.map(([x, y]) => `${num(x)},${num(y)}`).join("L")}Z`;
  }
  const mid = (a: number[], b: number[]) => `${num((a[0] + b[0]) / 2)},${num((a[1] + b[1]) / 2)}`;
  let path = `M${num(points[0][0])},${num(points[0][1])}Q${num(points[1][0])},${num(points[1][1])} ${mid(points[1], points[2])}T`;
  for (let i = 2; i < points.length - 1; i++) {
    path += `${mid(points[i], points[i + 1])} `;
  }
  return `${path.trimEnd()}Z`;
}

function num(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
