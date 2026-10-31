// Shared types and shape helpers for the traced map layouts (see layouts.ts).
export interface Pt {
  x: number;
  y: number;
}
/** A solid block: [x0, y0, x1, y1] before rotation, height in metres-ish units. */
export interface Block {
  r: [number, number, number, number];
  h: number;
  /** Degrees around the block's centre. */
  rot?: number;
  water?: boolean;
}
export interface Hill extends Pt {
  w: number;
  d: number;
}
export interface Layout {
  map: string;
  /** Walkable floor, a union of rectangles. */
  floor: [number, number, number, number][];
  blocks: Block[];
  /** Respawn points per side at the start of the map (Hardpoint and Overload). */
  spawns: [Pt[], Pt[]];
  /** Hardpoint hills in rotation order. */
  hills: Hill[];
  /** SnD: attacker and defender spawns and the two bomb sites. */
  snd: { atk: Pt; def: Pt; A: Pt; B: Pt };
  /** Control: attacker and defender spawns and the two zones. */
  control: { atk: Pt; def: Pt; A: Pt; B: Pt };
  /** Overload: where the device spawns and the goal at each end (goal[k] is next to spawns[k]). */
  overload: { device: Pt; goals: [Pt, Pt] };
  /** "traced" (approximate real layout) or "generic" (stand-in). */
  kind: "traced" | "generic";
  source?: string;
  note?: string;
}

export const P = (x: number, y: number): Pt => ({ x, y });
export const H = (x: number, y: number, w: number, d: number): Hill => ({ x, y, w, d });
export const B = (x0: number, y0: number, x1: number, y1: number, h: number, extra: Partial<Block> = {}): Block => ({ r: [x0, y0, x1, y1], h, ...extra });
/** A square post centred on (x, y). */
export const post = (x: number, y: number, s = 1.6, h = 4) => B(x - s / 2, y - s / 2, x + s / 2, y + s / 2, h);
/** A rotated plank centred on (x, y). */
export const plank = (x: number, y: number, len: number, wid: number, rot: number, h: number) =>
  B(x - len / 2, y - wid / 2, x + len / 2, y + wid / 2, h, { rot });

export const SITE_NOTE = "Bomb sites, Control zones and Overload goals are placed by eye (not published).";


/** A traced map: everything but the name and kind; Control zones are optional. */
export type Traced = Omit<Layout, "map" | "kind" | "control"> & { control?: Layout["control"] };
