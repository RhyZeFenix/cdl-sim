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
  /** A low wall you can see over (a window filled in for movement). */
  window?: boolean;
}
export interface Hill extends Pt {
  w: number;
  d: number;
}
/** A gap in a building wall: which side, where along it (0-1), and how wide. */
export interface Opening {
  side: "n" | "s" | "e" | "w";
  at: number;
  w: number;
}
/** A building you can walk into: walls on all four sides with doorways and windows. */
export interface Building {
  r: [number, number, number, number];
  h: number;
  doors?: Opening[];
  windows?: Opening[];
}
/** A raised floor players can stand on (balconies, rooftops, upper levels). */
export interface Platform {
  r: [number, number, number, number];
  /** Floor height. */
  h: number;
}
export interface Callout extends Pt {
  text: string;
}
/** Colours for a map's blockout. */
export interface MapTheme {
  floor: string;
  block: string;
  low: string;
  ground: string;
}
export interface Layout {
  map: string;
  /** Walkable floor, a union of rectangles. */
  floor: [number, number, number, number][];
  blocks: Block[];
  buildings?: Building[];
  platforms?: Platform[];
  /** Power positions players like to hold (beyond the automatic ones behind cover). */
  holds?: Pt[];
  callouts?: Callout[];
  theme?: MapTheme;
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
  /** "traced" (approximate real layout), "edited" (your map editor version) or "generic" (stand-in). */
  kind: "traced" | "edited" | "generic";
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

const WALL = 0.6;
const WINDOW_H = 1.1;

/** A building's walls as blocks: four sides with gaps for doors, and low walls in the windows. */
export function buildingWalls(b: Building): Block[] {
  const [x0, y0, x1, y1] = b.r;
  const out: Block[] = [];
  const side = (s: Opening["side"]) => {
    const horizontal = s === "n" || s === "s";
    const from = horizontal ? x0 : y0;
    const to = horizontal ? x1 : y1;
    const len = to - from;
    const fixed = s === "n" ? y0 : s === "s" ? y1 - WALL : s === "w" ? x0 : x1 - WALL;
    const seg = (a: number, z: number, h: number, window = false) => {
      if (z - a < 0.2) return;
      out.push(horizontal ? B(a, fixed, z, fixed + WALL, h, window ? { window } : {}) : B(fixed, a, fixed + WALL, z, h, window ? { window } : {}));
    };
    const gaps = [
      ...(b.doors ?? []).filter((o) => o.side === s).map((o) => ({ ...o, kind: "door" as const })),
      ...(b.windows ?? []).filter((o) => o.side === s).map((o) => ({ ...o, kind: "window" as const })),
    ]
      .map((o) => ({ a: from + o.at * len - o.w / 2, z: from + o.at * len + o.w / 2, kind: o.kind }))
      .sort((p, q) => p.a - q.a);
    let cur = from;
    for (const g of gaps) {
      seg(cur, Math.max(cur, g.a), b.h);
      if (g.kind === "window") seg(g.a, g.z, WINDOW_H, true);
      cur = Math.max(cur, g.z);
    }
    seg(cur, to, b.h);
  };
  (["n", "s", "w", "e"] as const).forEach(side);
  return out;
}

/** Every solid block in a layout, including building walls. */
export const allBlocks = (L: Layout): Block[] => [...L.blocks, ...(L.buildings ?? []).flatMap(buildingWalls)];

/** Floor height at a point (the highest platform under it, else ground). */
export function heightAt(L: Layout, x: number, y: number): number {
  let h = 0;
  for (const p of L.platforms ?? []) if (x >= p.r[0] && x <= p.r[2] && y >= p.r[1] && y <= p.r[3]) h = Math.max(h, p.h);
  return h;
}

/** A traced map: everything but the name and kind; Control zones are optional. */
export type Traced = Omit<Layout, "map" | "kind" | "control"> & { control?: Layout["control"] };
