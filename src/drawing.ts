// A drawing is a list of strokes, each a flat run of integer coordinates
// [x0, y0, x1, y1, ...] on a fixed DRAW_WIDTH x DRAW_HEIGHT grid, stored as
// that JSON. The canvas sends it; the server re-checks every part of it here,
// and the wall only ever turns numbers that passed into SVG path data.
export const DRAW_WIDTH = 600;
export const DRAW_HEIGHT = 300;
export const MAX_POINTS = 1500;
export const MAX_STROKES = 200;
export const MAX_DRAWING_CHARS = 20_000;

export type Drawing = number[][];

const inRange = (n: unknown, max: number): boolean => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= max;

// The drawing, or null if `raw` isn't one: wrong shape, a coordinate off the
// grid or not an integer, too many strokes or points, or too long a string.
export function parseDrawing(raw: string): Drawing | null {
  if (raw.length > MAX_DRAWING_CHARS) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STROKES) return null;
  let points = 0;
  for (const stroke of value) {
    if (!Array.isArray(stroke) || stroke.length === 0 || stroke.length % 2 !== 0) return null;
    points += stroke.length / 2;
    if (points > MAX_POINTS) return null;
    for (let i = 0; i < stroke.length; i += 2) {
      if (!inRange(stroke[i], DRAW_WIDTH) || !inRange(stroke[i + 1], DRAW_HEIGHT)) return null;
    }
  }
  return value as Drawing;
}

// One subpath per stroke; a single tap is a zero-length segment, which round
// caps draw as a dot.
export function drawingPath(drawing: Drawing): string {
  return drawing
    .map((s) => {
      let d = `M${s[0]} ${s[1]}`;
      if (s.length === 2) d += "l0 0";
      for (let i = 2; i < s.length; i += 2) d += `L${s[i]} ${s[i + 1]}`;
      return d;
    })
    .join("");
}
