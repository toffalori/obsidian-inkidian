// Reader for `.inkd` notes (format/SPEC.md). Lenient as SPEC §7 asks: unknown
// tools draw as pens, unknown backgrounds as blank pages, unknown fields are ignored.

export const SUPPORTED_FORMAT_VERSION = 1;

export type Tool = "pen" | "pencil" | "marker";
export type BackgroundType = "blank" | "lined" | "grid" | "dots";

export interface InkdPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface InkdStroke {
  tool: Tool;
  color: string;
  opacity: number;
  baseWidth: number;
  points: InkdPoint[];
}

export interface InkdBackground {
  type: BackgroundType;
  spacing: number;
  color: string;
}

export interface InkdPage {
  background: InkdBackground;
  strokes: InkdStroke[];
}

export interface InkdDocument {
  formatVersion: number;
  width: number;
  height: number;
  pages: InkdPage[];
}

export type ParseResult =
  | { ok: true; document: InkdDocument }
  | { ok: false; reason: "invalid" | "not-inkidian" | "newer-version"; message: string };

const TOOLS: readonly string[] = ["pen", "pencil", "marker"];
const BACKGROUNDS: readonly string[] = ["blank", "lined", "grid", "dots"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseInkd(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return invalid("it is not valid JSON");
  }
  if (!isObject(json) || json.format !== "inkidian") {
    return { ok: false, reason: "not-inkidian", message: "This file is not an Inkidian note." };
  }
  const version = json.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return invalid("the format version is missing");
  }
  if (version > SUPPORTED_FORMAT_VERSION) {
    return {
      ok: false,
      reason: "newer-version",
      message: `This note was created with a newer version of Inkidian (format version ${version}). Update the Inkidian plugin to view it.`,
    };
  }
  const page = json.page;
  if (!isObject(page) || !isPositive(page.width) || !isPositive(page.height)) {
    return invalid("the page size is missing");
  }
  if (!Array.isArray(json.pages) || json.pages.length === 0) {
    return invalid("it has no pages");
  }
  const pages: InkdPage[] = json.pages.map((raw) => ({
    background: parseBackground(isObject(raw) ? raw.background : undefined),
    strokes: isObject(raw) && Array.isArray(raw.strokes) ? raw.strokes.flatMap(parseStroke) : [],
  }));
  return { ok: true, document: { formatVersion: version, width: page.width, height: page.height, pages } };
}

function parseBackground(raw: unknown): InkdBackground {
  const background = isObject(raw) ? raw : {};
  return {
    type: typeof background.type === "string" && BACKGROUNDS.includes(background.type) ? (background.type as BackgroundType) : "blank",
    spacing: isPositive(background.spacing) ? background.spacing : 32,
    color: isColor(background.color) ? background.color : "#D0D7E2",
  };
}

/** Strokes without a single usable point are dropped. */
function parseStroke(raw: unknown): InkdStroke[] {
  if (!isObject(raw) || !Array.isArray(raw.points)) return [];
  const points: InkdPoint[] = [];
  for (const point of raw.points) {
    if (!Array.isArray(point) || !isFiniteNumber(point[0]) || !isFiniteNumber(point[1])) continue;
    points.push({ x: point[0], y: point[1], pressure: isFiniteNumber(point[2]) ? clamp01(point[2]) : 0.5 });
  }
  if (points.length === 0) return [];
  return [
    {
      tool: typeof raw.tool === "string" && TOOLS.includes(raw.tool) ? (raw.tool as Tool) : "pen",
      color: isColor(raw.color) ? raw.color : "#000000",
      opacity: isFiniteNumber(raw.opacity) ? clamp01(raw.opacity) : 1,
      baseWidth: isPositive(raw.baseWidth) ? raw.baseWidth : 1,
      points,
    },
  ];
}

function invalid(detail: string): ParseResult {
  return { ok: false, reason: "invalid", message: `This note can't be displayed because ${detail}.` };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isFiniteNumber(value) && value > 0;
}

function isColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
