// How many gunfights each player really takes: Hardpoint kills plus deaths per map
// (data/stats/{year}.fights.json, CoD Esports Wiki), relative to the league average.
// Entry players run well above 1 and anchors below; the sim uses it to pick who takes
// the next fight. The wiki has no AR/SMG labels, so this stands in for roles.
import fights2024 from "../../../data/stats/2024.fights.json";
import fights2025 from "../../../data/stats/2025.fights.json";
import fights2026 from "../../../data/stats/2026.fights.json";
import { playerKey } from "./form";
import type { SeasonId } from "./registry";

interface Row {
  PlayerLink: string;
  Gamemode: string;
  Maps: string;
  Kills: string;
  Deaths: string;
}

const RAW: Record<SeasonId, { rows: Row[] }> = { "2024": fights2024, "2025": fights2025, "2026": fights2026 };
/** Maps at which a player's own rate counts for half. */
const SHRINK = 20;

const cache = new Map<SeasonId, Map<string, number>>();

function table(id: SeasonId): Map<string, number> {
  const hit = cache.get(id);
  if (hit) return hit;
  const hp = RAW[id].rows.filter((r) => r.Gamemode === "Hardpoint" && Number(r.Maps) > 0);
  const maps = hp.reduce((s, r) => s + Number(r.Maps), 0);
  const mean = hp.reduce((s, r) => s + Number(r.Kills) + Number(r.Deaths), 0) / Math.max(1, maps);
  const out = new Map<string, number>();
  for (const r of hp) {
    const n = Number(r.Maps);
    const rate = (Number(r.Kills) + Number(r.Deaths)) / n / mean;
    const w = n / (n + SHRINK);
    out.set(playerKey(r.PlayerLink), Math.round((1 + (rate - 1) * w) * 1000) / 1000);
  }
  cache.set(id, out);
  return out;
}

/** A player's share of fights relative to the average player (1 when unknown). */
export function fightShare(id: SeasonId, playerId: string): number {
  return table(id).get(playerKey(playerId)) ?? 1;
}
