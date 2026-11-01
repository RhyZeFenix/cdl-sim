// Morale, 0-100 per GM roster player (70 is neutral). It moves with results, playing
// time, personal form and the week's prep, drifts back toward 70, and adds a little
// skill: ±0.025 at the extremes, about half a map preference modifier.
import type { SeasonState, SeriesRecord } from "../season/season";
import type { MoraleChange } from "./types";
import { LEADER_LIFT, moraleScale, traitOf } from "./personality";

export const MORALE_START = 70;
export const moraleForm = (m: number) => ((m - MORALE_START) / 30) * 0.025;

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export function addMorale(state: SeasonState, change: MoraleChange): void {
  const gm = state.gm!;
  const morale = { ...(gm.morale ?? {}) };
  const applied: Record<string, number> = {};
  for (const [id, d] of Object.entries(change.deltas)) {
    if (!gm.roster.includes(id) || !d) continue;
    const before = morale[id] ?? MORALE_START;
    morale[id] = clamp(before + d);
    applied[id] = morale[id]! - before;
  }
  gm.morale = morale;
  if (Object.keys(applied).length) gm.moraleLog = [...(gm.moraleLog ?? []), { ...change, deltas: applied }].slice(-400);
}

/** Morale changes from one GM series: the result, each player's form, and who sat out. */
export function seriesMorale(state: SeasonState, rec: SeriesRecord): Record<string, number> {
  const gm = state.gm!;
  const side = rec.teams[0] === gm.team ? 0 : 1;
  const won = rec.winner === gm.team;
  const big = rec.phase.kind === "major" || rec.phase.kind === "championship";
  const result = (won ? 3 : -3) * (big ? 5 / 3 : 1);
  const kills = new Map<string, number>();
  const deaths = new Map<string, number>();
  for (const m of rec.maps) {
    for (let i = side * 4; i < side * 4 + 4; i++) {
      const id = m.lineup[i]!;
      kills.set(id, (kills.get(id) ?? 0) + m.box[i]!.kills);
      deaths.set(id, (deaths.get(id) ?? 0) + m.box[i]!.deaths);
    }
  }
  const deltas: Record<string, number> = {};
  for (const id of gm.roster) {
    if (!kills.has(id)) {
      deltas[id] = -2; // wants more playing time
      continue;
    }
    const kd = kills.get(id)! / Math.max(1, deaths.get(id)!);
    deltas[id] = Math.round((result + (kd > 1.15 ? 2 : kd < 0.85 ? -2 : 0)) * moraleScale(id));
  }
  return deltas;
}

/** End-of-step changes: the week's prep, then a drift back toward neutral. */
export function stepMorale(state: SeasonState, prepDelta: number): Record<string, number> {
  const gm = state.gm!;
  const deltas: Record<string, number> = {};
  // A starting leader lifts the other starters.
  const leaders = gm.starters.filter((id) => traitOf(id) === "leader");
  for (const id of gm.roster) {
    const m = (gm.morale?.[id] ?? MORALE_START) + prepDelta;
    const lift = gm.starters.includes(id) ? leaders.filter((l) => l !== id).length * LEADER_LIFT : 0;
    deltas[id] = prepDelta + lift + Math.round((MORALE_START - m) * 0.1);
  }
  return deltas;
}

/** Morale as the UI may show it: without changes that came from hidden (unwatched) series. */
export function shownMorale(state: SeasonState, hidden: Set<string>): Record<string, number> {
  const gm = state.gm;
  if (!gm) return {};
  const out = { ...(gm.morale ?? {}) };
  for (const c of gm.moraleLog ?? []) {
    if (!c.refs.some((r) => hidden.has(r))) continue;
    for (const [id, d] of Object.entries(c.deltas)) if (id in out) out[id] = out[id]! - d;
  }
  return out;
}

export function moraleWord(m: number): string {
  return m >= 85 ? "Buzzing" : m >= 72 ? "Happy" : m >= 58 ? "Content" : m >= 42 ? "Frustrated" : "Unhappy";
}

