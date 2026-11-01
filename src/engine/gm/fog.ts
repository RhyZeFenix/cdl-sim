// Scouting fog: in GM mode you don't know other teams' players exactly. Their ratings
// show as a range that narrows with a better analyst, with every map you play against
// them, and with scrims against their team. Your own roster is always exact.
import type { SeasonData } from "../data/registry";
import { nextStepDate, teamLineup, type SeasonState } from "../season/season";
import { analystLevel } from "./staff";

/** Range width, in rating points, with no analyst and no history. */
const BASE = 12;

export const fogOn = (state: SeasonState) => !!state.gm && state.gm.fog !== false;

export function gmSetFog(state: SeasonState, on: boolean): void {
  if (state.gm) state.gm.fog = on;
}

/** Maps a player has played against the GM team. */
export function mapsAgainst(state: SeasonState, id: string): number {
  const gm = state.gm;
  if (!gm) return 0;
  let n = 0;
  for (const r of Object.values(state.series)) {
    const side = r.teams.indexOf(gm.team);
    if (side < 0 || !r.lineups) continue;
    if (r.lineups[1 - side]!.includes(id)) n += r.maps.length;
  }
  return n;
}

/** How wide a player's rating range is (0 = known exactly). */
export function fogWidth(state: SeasonState, data: SeasonData, id: string): number {
  const gm = state.gm;
  if (!fogOn(state) || !gm || gm.roster.includes(id) || gm.prospects?.[id]) return 0;
  let w = BASE - 2 * analystLevel(state) - 0.5 * mapsAgainst(state, id);
  // Scrims against their current team.
  const date = nextStepDate(state, data);
  const team = data.season.teams.find((t) => teamLineup(state, data, t.id, date).includes(id))?.id;
  if (team && gm.familiarity?.[team] !== undefined) w -= 3;
  return Math.max(0, Math.round(w));
}

/** A stable number in [0, 1) for a player and rating, so ranges don't jump around. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** The range shown for a rating: it always contains the true value, but not in the middle. */
export function fogRange(value: number, width: number, key: string): [number, number] {
  if (width <= 0) return [Math.round(value), Math.round(value)];
  const u = 0.2 + 0.6 * hash01(key);
  return [Math.round(value - width * u), Math.round(value + width * (1 - u))];
}

/** "78" or "74–84". */
export function fogText(value: number, width: number, key: string): string {
  const [lo, hi] = fogRange(value, width, key);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}
