import { describe, expect, it } from "vitest";
import { clampZoom, stepZoom, wheelZoom } from "../src/zoom";

describe("zoom of the view", () => {
  it("steps between 50 % and 400 %", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(1.4, 1)).toBe(1.5);
    expect(stepZoom(1.4, -1)).toBe(1.25);
    expect(stepZoom(4, 1)).toBe(4);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });

  it("zooms by about a step per wheel notch, within the limits", () => {
    expect(wheelZoom(1, -100)).toBeCloseTo(Math.exp(0.5));
    expect(wheelZoom(1, 100)).toBeCloseTo(Math.exp(-0.5));
    expect(wheelZoom(1, -2)).toBeCloseTo(1.02);
    expect(wheelZoom(3.9, -100)).toBe(4);
    expect(clampZoom(0.1)).toBe(0.5);
  });
});
