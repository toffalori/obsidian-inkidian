import { describe, expect, it } from "vitest";
import { parseInkd } from "../src/inkd";
import { readSample, readSampleJson, sampleNames, type SampleJson } from "./samples";

const minimal = () => readSampleJson("minimal.inkd");
const parse = (json: unknown) => parseInkd(JSON.stringify(json));

describe("parseInkd", () => {
  it.each(sampleNames)("reads %s", (name) => {
    const text = readSample(name);
    const raw = readSampleJson(name);
    const result = parseInkd(text);
    if (!result.ok) throw new Error(result.message);
    expect(result.document.pages).toHaveLength(raw.pages.length);
    expect(result.document.pages.map((page) => page.strokes.length)).toEqual(raw.pages.map((page) => page.strokes.length));
    expect(result.document.width).toBe(raw.page.width);
  });

  it("explains files it can't show", () => {
    expect(parseInkd("not json")).toMatchObject({ ok: false, reason: "invalid" });
    expect(parse({ type: "excalidraw" })).toMatchObject({ ok: false, reason: "not-inkidian" });
    expect(parse({ ...minimal(), pages: [] })).toMatchObject({ ok: false, reason: "invalid" });
    expect(parse({ ...minimal(), page: {} })).toMatchObject({ ok: false, reason: "invalid" });

    const newer = parse({ ...minimal(), formatVersion: 2 });
    expect(newer).toMatchObject({ ok: false, reason: "newer-version" });
    expect(newer.ok ? "" : newer.message).toContain("newer version of Inkidian (format version 2)");
  });

  it("is lenient where SPEC §7 says so", () => {
    const json = minimal();
    json.pages[0].background = { type: "hexagons" };
    json.pages[0].strokes = [
      { tool: "brush", color: "red", opacity: 7, baseWidth: -1, points: [[1, 2], [3, 4, 0.8, 0.1, 0, 1.5, 99], ["x", 5], [6]] },
      { tool: "pen", color: "#112233", opacity: 1, baseWidth: 2, points: [] },
      "not a stroke",
    ] as unknown as SampleJson["pages"][number]["strokes"];
    json.pages.push({ background: { type: "dots", spacing: 20, color: "#ABCDEF" } } as SampleJson["pages"][number]);

    const result = parse(json);
    if (!result.ok) throw new Error(result.message);
    const [first, second] = result.document.pages;
    expect(first.background).toEqual({ type: "blank", spacing: 32, color: "#D0D7E2" });
    expect(first.strokes).toEqual([
      { tool: "pen", color: "#000000", opacity: 1, baseWidth: 1, points: [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4, pressure: 0.8 }] },
    ]);
    expect(second).toEqual({ background: { type: "dots", spacing: 20, color: "#ABCDEF" }, strokes: [] });
  });
});
