// Approximate map blockouts for the 3D replay, in map units (0-100 on both axes, x to the
// right and y down the minimap). Traced by eye from public minimaps; no game art is used.
// Hill positions follow the published rotation diagrams. Bomb sites, Control zones and
// Overload goals are NOT published there, so they are placed by eye and are approximate.
// Maps without a traced layout get a generated stand-in so every map can be watched.
import { createRng } from "../../engine";
import { BO6 } from "./maps-bo6";
import { MW3 } from "./maps-mw3";
import { BO7 } from "./maps-bo7";
import { B, H, P, type Block, type Layout, type Pt, type Traced } from "./shapes";
import { themeFor } from "./themes";

export type { Block, Building, Callout, Hill, Layout, MapTheme, Platform, Pt } from "./shapes";

const TRACED: Record<string, Traced> = { ...MW3, ...BO6, ...BO7 };

/** Layouts edited in the map editor (this browser only); they replace the traced ones. */
const OVERRIDES: Record<string, Traced> = {};
export function setLayoutOverride(map: string, t: Traced | null): void {
  if (t) OVERRIDES[map] = t;
  else delete OVERRIDES[map];
}
export const hasOverride = (map: string) => !!OVERRIDES[map];
/** The built-in traced layout, ignoring any edits. */
export const tracedLayout = (map: string): Traced | undefined => TRACED[map];


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
  const edited = OVERRIDES[map];
  const t = edited ?? TRACED[map];
  const g = generic(map);
  if (!t) return { map, ...g, hills: g.hills.slice(0, Math.max(hillCount, 1)), theme: themeFor(map) };
  const hills = [...t.hills];
  for (let i = hills.length; i < hillCount; i++) hills.push(g.hills[i % g.hills.length]!);
  // Control isn't played on the traced BO7 maps; borrow two hills as zones if asked.
  const control = t.control ?? { atk: t.snd.atk, def: t.snd.def, A: hills[2] ?? hills[0]!, B: hills[1] ?? hills[0]! };
  return { map, kind: edited ? "edited" : "traced", theme: themeFor(map), ...t, hills, control };
}
