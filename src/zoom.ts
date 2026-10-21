// Zoom of the .inkd view (INK-64): 1 is the width that fits, as before.

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function clampZoom(zoom: number): number {
  return Math.min(STEPS[STEPS.length - 1], Math.max(STEPS[0], zoom));
}

/** The next step up or down from `zoom`, for the + and − buttons. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const next = direction > 0 ? STEPS.find((step) => step > zoom + 0.01) : [...STEPS].reverse().find((step) => step < zoom - 0.01);
  return next ?? zoom;
}

/** Ctrl/Cmd + scroll and the trackpad's pinch: a mouse wheel's notch is about a step. */
export function wheelZoom(zoom: number, deltaY: number): number {
  return clampZoom(zoom * Math.exp(-Math.max(-50, Math.min(50, deltaY)) / 100));
}
