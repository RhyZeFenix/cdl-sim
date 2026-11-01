// Builds a map's replay timeline (shared by the 3D view, the 2D view and heatmaps).
import type { MapResult } from "../../engine";
import { layoutFor } from "./layouts";
import { buildTimeline, hillIndex, type Timeline } from "./timeline";

export const hillCountOf = (m: MapResult) => Math.max(1, ...m.events.map((e) => (e.k === "hill" ? hillIndex(e.label, e.n) + 1 : 0)));

export const timelineFor = (map: MapResult, seed: string): Timeline => buildTimeline(map, layoutFor(map.map, hillCountOf(map)), seed);

/** Hill index → its label ("P2 Balcony") from the map's events. */
export function hillLabelsOf(map: MapResult, hills: number): Map<number, string> {
  const out = new Map<number, string>();
  for (const e of map.events) if (e.k === "hill") out.set(hillIndex(e.label, e.n) % hills, e.label);
  return out;
}
