// Approximate map blockouts for the 3D replay, in map units (0-100 on both axes, x to the
// right and y down the minimap). Traced by eye from public minimaps; no game art is used.
// Hill positions follow the published rotation diagrams. Bomb sites, Control zones and
// Overload goals are NOT published there, so they are placed by eye and are approximate.
// Maps without a traced layout get a generated stand-in so every map can be watched.
import { createRng } from "../../engine";

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

const P = (x: number, y: number): Pt => ({ x, y });
const H = (x: number, y: number, w: number, d: number): Hill => ({ x, y, w, d });
const B = (x0: number, y0: number, x1: number, y1: number, h: number, extra: Partial<Block> = {}): Block => ({ r: [x0, y0, x1, y1], h, ...extra });
/** A square post centred on (x, y). */
const post = (x: number, y: number, s = 1.6, h = 4) => B(x - s / 2, y - s / 2, x + s / 2, y + s / 2, h);
/** A rotated plank centred on (x, y). */
const plank = (x: number, y: number, len: number, wid: number, rot: number, h: number) =>
  B(x - len / 2, y - wid / 2, x + len / 2, y + wid / 2, h, { rot });

const SITE_NOTE = "Bomb sites, Control zones and Overload goals are placed by eye (not published).";

const TRACED: Record<string, Omit<Layout, "map" | "kind" | "control"> & { control?: Layout["control"] }> = {
  Den: {
    source: "https://www.gamesatlas.com/cod-black-ops-7/maps/den",
    note: SITE_NOTE,
    floor: [
      [35, 4, 68, 28],
      [29, 17, 36, 28],
      [25, 28, 71, 69],
      [35, 69, 68, 76],
      [41, 76, 60, 96],
    ],
    blocks: [
      B(59, 41, 71, 56, 6),
      B(35, 16, 42, 24, 5),
      B(26, 58, 36, 70, 5),
      B(48, 61, 55, 68, 4),
      B(59, 25, 68, 31, 5),
      B(58, 63, 61, 72, 4),
      B(48.2, 71.3, 51.2, 74.3, 1),
      // The courtyard around hill 1: four walls with a doorway in each.
      B(40.6, 38, 41.4, 46, 3),
      B(40.6, 52, 41.4, 59.5, 3),
      B(56.2, 38, 57, 45, 3),
      B(56.2, 53, 57, 59.5, 3),
      B(41, 37.2, 46, 38, 3),
      B(52, 37.2, 57, 38, 3),
      B(41, 59.2, 46, 60, 3),
      B(52, 59.2, 57, 60, 3),
      // Cover in the top street and the colonnade at the bottom.
      plank(50, 16, 4, 2, 30, 1.4),
      B(61, 17, 64, 20, 1.2),
      B(44, 22, 47, 24, 1.2),
      post(46.3, 79),
      post(52.9, 79),
      post(46.3, 84),
      post(52.9, 84),
      post(46.3, 89),
      post(52.9, 89),
    ],
    spawns: [
      [P(45, 8), P(52, 7), P(58, 9)],
      [P(46, 93), P(50, 94), P(54, 93)],
    ],
    hills: [H(49.7, 49, 8, 8), H(63.5, 34.6, 9, 5), H(32.8, 48.5, 7, 9), H(64.4, 72, 6, 7)],
    snd: { atk: P(50, 92), def: P(50, 8), A: P(32, 46), B: P(63.5, 35) },
    overload: { device: P(49.7, 49), goals: [P(50, 18), P(50, 84)] },
  },
  Raid: {
    source: "https://www.gamesatlas.com/cod-black-ops-7/maps/raid",
    note: SITE_NOTE,
    floor: [
      [14, 20, 58, 63],
      [58, 23.5, 85, 63],
      [85, 30, 96, 63],
      [2, 44, 15, 57],
      [27, 63, 73, 89],
    ],
    blocks: [
      B(53.7, 35.3, 80, 48.5, 7),
      B(26.5, 35.3, 47.8, 44, 6),
      B(25, 57.4, 47.8, 63, 5),
      B(54.4, 57.4, 67.6, 63, 5),
      B(60.3, 50, 76.5, 57.4, 5),
      B(36, 17.6, 61, 27, 0.3, { water: true }),
      B(26.5, 66, 29.4, 72, 3),
      B(76, 57, 80, 63, 4),
      B(16, 55, 18, 58, 1.2),
      B(22, 47, 24, 50, 1.2),
      // Tables around the courtyard fountain.
      post(45, 70, 1.4, 1),
      post(57, 70, 1.4, 1),
      post(45, 79, 1.4, 1),
      post(57, 79, 1.4, 1),
    ],
    spawns: [
      [P(46, 85), P(51, 87), P(56, 85)],
      [P(18, 25), P(24, 23), P(18, 32)],
    ],
    hills: [H(51, 74, 8, 8), H(35.3, 50.3, 8, 7), H(90.7, 50.3, 9, 18), H(21.6, 28, 12, 10), H(51, 51, 13, 7)],
    snd: { atk: P(51, 86), def: P(20, 26), A: P(35, 50), B: P(68, 29) },
    overload: { device: P(51, 51), goals: [P(51, 80), P(24, 32)] },
  },
  Scar: {
    source: "https://www.gamesatlas.com/cod-black-ops-7/maps/scar",
    note: SITE_NOTE,
    floor: [
      [3, 20, 31, 68],
      [31, 26.5, 74, 80],
      [47.8, 80, 74, 84.5],
      [74, 44, 97, 86],
    ],
    blocks: [
      B(25, 31, 31, 48, 6),
      B(33, 41, 43, 45.6, 4),
      B(47, 38, 68, 46, 6),
      B(38.2, 57.4, 59.6, 72, 6),
      B(69, 60, 82, 62, 4),
      B(69, 62, 71, 73, 4),
      B(67.6, 79.4, 73.5, 85, 4),
      plank(22.4, 53.2, 12, 2.4, 40, 1.4),
      plank(38.2, 53, 11, 2.4, -40, 1.4),
      B(18, 25.5, 20, 29, 1.5),
      B(19, 39, 21, 43, 1.5),
      B(16.6, 46, 18.6, 48, 1.2),
      B(63.5, 53.5, 66, 56.5, 1.4),
      B(71.5, 52, 74.5, 55, 1.4),
      B(61.5, 66, 63.5, 69.5, 1.4),
      B(85, 66, 87, 71, 1.4),
      B(76, 77.5, 78.5, 81, 1.4),
    ],
    spawns: [
      [P(8, 28), P(10, 40), P(7, 55)],
      [P(88, 62), P(92, 75), P(85, 82)],
    ],
    hills: [H(52.2, 51.5, 9, 10), H(39.3, 75.6, 14, 7), H(56.2, 29.4, 12, 5), H(75.4, 67.2, 10, 8), H(34.7, 35.7, 6, 10)],
    snd: { atk: P(8, 40), def: P(88, 72), A: P(40, 76), B: P(56, 30) },
    overload: { device: P(52.2, 51.5), goals: [P(16, 40), P(84, 62)] },
  },
};

/** Map names with an approximate real layout. */
export const TRACED_MAPS = Object.keys(TRACED);

const GENERIC_HILLS: Pt[] = [P(50, 50), P(30, 32), P(70, 68), P(70, 32), P(30, 68), P(50, 24), P(50, 76)];

/** A seeded, point-symmetric stand-in arena for maps without a traced layout. */
function generic(map: string): Omit<Layout, "map"> {
  const rng = createRng(`layout:${map}`);
  const keep: Pt[] = [...GENERIC_HILLS, P(8, 50), P(92, 50), P(62, 32), P(62, 68), P(18, 50), P(82, 50)];
  const blocks: Block[] = [];
  for (let tries = 0; blocks.length < 16 && tries < 200; tries++) {
    const w = rng.int(3, 12);
    const d = rng.int(3, 10);
    const x0 = rng.int(14, 84 - w);
    const y0 = rng.int(18, 82 - d);
    const clear = keep.every((p) => p.x < x0 - 6 || p.x > x0 + w + 6 || p.y < y0 - 6 || p.y > y0 + d + 6);
    if (!clear) continue;
    const h = rng.chance(0.3) ? 1.3 : rng.int(3, 6);
    blocks.push(B(x0, y0, x0 + w, y0 + d, h), B(100 - x0 - w, 100 - y0 - d, 100 - x0, 100 - y0, h));
  }
  return {
    kind: "generic",
    note: "No traced layout for this map yet: a generated stand-in arena.",
    floor: [[2, 15, 98, 85]],
    blocks,
    spawns: [
      [P(6, 42), P(6, 50), P(6, 58)],
      [P(94, 42), P(94, 50), P(94, 58)],
    ],
    hills: GENERIC_HILLS.map((p) => H(p.x, p.y, 7, 7)),
    snd: { atk: P(8, 50), def: P(92, 50), A: P(62, 32), B: P(62, 68) },
    control: { atk: P(8, 50), def: P(92, 50), A: P(48, 36), B: P(66, 62) },
    overload: { device: P(50, 50), goals: [P(18, 50), P(82, 50)] },
  };
}

/** The layout for a map, with enough hills for its rotation (extra ones come from the stand-in). */
export function layoutFor(map: string, hillCount = 4): Layout {
  const t = TRACED[map];
  const g = generic(map);
  if (!t) return { map, ...g, hills: g.hills.slice(0, Math.max(hillCount, 1)) };
  const hills = [...t.hills];
  for (let i = hills.length; i < hillCount; i++) hills.push(g.hills[i % g.hills.length]!);
  // Control isn't played on the traced BO7 maps; borrow two hills as zones if asked.
  const control = t.control ?? { atk: t.snd.atk, def: t.snd.def, A: hills[2] ?? hills[0]!, B: hills[1] ?? hills[0]! };
  return { map, kind: "traced", ...t, hills, control };
}
