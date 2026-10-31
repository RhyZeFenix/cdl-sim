// Box scores and map scores are derived from events only, so they always reconcile
// with what happened on the map.
import type { Mode } from "../data/schema";
import type { MapEvent, Pair, PlayerLine } from "./types";

export const emptyLine = (): PlayerLine => ({
  kills: 0, deaths: 0, damage: 0, hillTime: 0, firstBloods: 0, plants: 0,
  defuses: 0, clutches: 0, zoneCaps: 0, pickups: 0, oCaps: 0,
});

export function boxScore(events: MapEvent[], players = 8): PlayerLine[] {
  const box = Array.from({ length: players }, emptyLine);
  for (const e of events) {
    switch (e.k) {
      case "kill":
        box[e.by]!.kills++;
        box[e.by]!.damage += e.dmg;
        box[e.on]!.deaths++;
        box[e.on]!.damage += e.vdmg;
        if (e.fb) box[e.by]!.firstBloods++;
        break;
      case "hold": {
        // Split the team's scoring seconds across the players on the hill.
        const share = Math.floor(e.secs / e.on.length);
        e.on.forEach((p, i) => (box[p]!.hillTime += share + (i < e.secs % e.on.length ? 1 : 0)));
        break;
      }
      case "plant": box[e.by]!.plants++; break;
      case "defuse": box[e.by]!.defuses++; break;
      case "clutch": box[e.by]!.clutches++; break;
      case "zone": box[e.by]!.zoneCaps++; break;
      case "pickup": box[e.by]!.pickups++; break;
      case "ocap": box[e.by]!.oCaps++; break;
    }
  }
  return box;
}

/** Recomputes a map score purely from its events. */
export function scoreFromEvents(mode: Mode, events: MapEvent[]): Pair {
  const s: Pair = [0, 0];
  for (const e of events) {
    if (mode === "hp" && e.k === "hold") s[e.team] += e.secs;
    if ((mode === "snd" || mode === "control") && e.k === "round") s[e.winner]++;
    if (mode === "overload" && e.k === "ocap") s[e.team]++;
  }
  return s;
}

/** Sums lines (e.g. a player's maps across a series). */
export function addLines(a: PlayerLine, b: PlayerLine): PlayerLine {
  const out = emptyLine();
  for (const k of Object.keys(out) as (keyof PlayerLine)[]) out[k] = a[k] + b[k];
  return out;
}
