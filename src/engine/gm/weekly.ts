// The weekly loop: before each step the GM picks a prep focus, and can read a
// scouting report on the next opponent. Prep turns into a small skill boost on the
// chosen maps (hidden from the opponent's veto); morale adds a little per player.
import type { Mode } from "../data/schema";
import { mapPoolFor, slotToMode, type PoolPhase } from "../data/pools";
import type { SeasonData } from "../data/registry";
import {
  nextStep,
  nextStepDate,
  playerInfo,
  playerLines,
  teamLineup,
  weekDate,
  type SeasonState,
} from "../season/season";
import { moraleForm } from "./morale";
import type { GmBoost, Prep } from "./types";
import { overall } from "./values";

/** Skill bonuses for each kind of prep (map preference modifiers run about ±0.05). */
export const PREP_BONUS = { map: 0.04, mode: 0.02, grind: 0.015 } as const;
export const PREP_MORALE = { rest: 4, grind: -3 } as const;

export function prepLabel(p: Prep | undefined): string {
  if (!p) return "Balanced";
  switch (p.kind) {
    case "balanced":
      return "Balanced";
    case "map":
      return `${p.map} ${modeName(p.mode)}`;
    case "mode":
      return `${modeName(p.mode)} focus`;
    case "rest":
      return "Rest";
    case "grind":
      return "Grind scrims";
  }
}

export const modeName = (m: Mode) => (m === "hp" ? "Hardpoint" : m === "snd" ? "Search & Destroy" : m === "control" ? "Control" : "Overload");

export function gmSetPrep(state: SeasonState, prep: Prep): void {
  if (!state.gm) throw new Error("not in GM mode");
  if (state.pending) throw new Error("Prep is locked while a match is waiting.");
  state.gm.prep = prep;
}

/** The boost the GM team plays with in a series of this phase. */
export function gmBoostFor(state: SeasonState, data: SeasonData, phase: PoolPhase): GmBoost {
  const gm = state.gm!;
  const boost: GmBoost = {};
  const prep = gm.prep;
  if (prep?.kind === "map" || prep?.kind === "mode") {
    const pool = mapPoolFor(data.season, phase);
    const out: Record<string, number> = {};
    for (const slot of ["hp", "snd", "third"] as const) {
      const mode = slotToMode(data.season, slot);
      for (const map of pool[slot]) {
        if (prep.kind === "map" && prep.mode === mode && prep.map === map) out[`${mode}:${map}`] = PREP_BONUS.map;
        if (prep.kind === "mode" && prep.mode === mode) out[`${mode}:${map}`] = PREP_BONUS.mode;
      }
    }
    if (Object.keys(out).length) boost.prep = out;
  }
  if (prep?.kind === "grind") boost.form = PREP_BONUS.grind;
  const players: Record<string, number> = {};
  for (const id of gm.roster) {
    const f = moraleForm(gm.morale?.[id] ?? 70);
    if (Math.abs(f) > 1e-4) players[id] = Math.round(f * 10000) / 10000;
  }
  if (Object.keys(players).length) boost.players = players;
  return boost;
}

// ------------------------------------------------------------------ scouting

export interface GmFixture {
  opponent: string;
  label: string;
  phase: PoolPhase;
  date: string;
}

/** The GM team's next known opponents: the waiting series, or the next qualifier week's. */
export function nextGmFixtures(state: SeasonState, data: SeasonData): GmFixture[] {
  const gm = state.gm;
  if (!gm) return [];
  if (state.pending) {
    const { spec, gmSide } = state.pending;
    return [{ opponent: spec.teams[gmSide === 0 ? 1 : 0], label: spec.label, phase: spec.phase, date: spec.date }];
  }
  const step = nextStep(state);
  if (step?.kind !== "week") return [];
  return state.schedule[step.stage - 1]![step.week - 1]!
    .filter((f) => f.teams.includes(gm.team) && !state.series[f.id])
    .map((f) => ({
      opponent: f.teams[0] === gm.team ? f.teams[1] : f.teams[0],
      label: `Stage ${step.stage} Qualifiers · Week ${step.week}`,
      phase: { kind: "qualifiers", stage: step.stage, week: step.week } as PoolPhase,
      date: weekDate(data.season, step.stage, step.week),
    }));
}

export interface ScoutPlayer {
  id: string;
  handle: string;
  ovr: number;
  kd?: number;
  maps: number;
}

export interface ScoutMap {
  mode: Mode;
  map: string;
  /** The opponent's and your map preference (skill units). */
  theirs: number;
  yours: number;
  likely?: "pick" | "ban";
}

export interface ScoutReport {
  opponent: string;
  record: [number, number];
  /** Last five results, newest first (W/L with score). */
  recent: { won: boolean; vs: string; score: [number, number] }[];
  lineup: ScoutPlayer[];
  hottest?: ScoutPlayer;
  maps: ScoutMap[];
  /** Your starters' average overall minus theirs. */
  edge: number;
}

/** What you know about an opponent, leaving out `hidden` (unwatched) series. */
export function scoutReport(state: SeasonState, data: SeasonData, opponent: string, phase: PoolPhase, hidden: Set<string>): ScoutReport {
  const gm = state.gm!;
  const visible = Object.values(state.series).filter((r) => !hidden.has(r.id));
  const theirs = visible.filter((r) => r.teams.includes(opponent));
  const wins = theirs.filter((r) => r.winner === opponent).length;
  const recent = theirs
    .slice(-5)
    .reverse()
    .map((r) => {
      const side = r.teams[0] === opponent ? 0 : 1;
      return { won: r.winner === opponent, vs: r.teams[1 - side]!, score: [r.score[side], r.score[1 - side]] as [number, number] };
    });
  const lines = new Map(playerLines(state, visible.map((r) => r.id)).map((l) => [l.player, l]));
  const date = state.pending?.spec.date ?? nextStepDate(state, data);
  const lineup = teamLineup(state, data, opponent, date).map((id) => {
    const p = playerInfo(state, data, id);
    const l = lines.get(id);
    return { id, handle: p?.handle ?? "Replacement", ovr: p ? Math.round(overall(p.ratings)) : 72, kd: l?.kd, maps: l?.maps ?? 0 };
  });
  const hottest = lineup.filter((p) => p.maps >= 6 && p.kd !== undefined).sort((a, b) => b.kd! - a.kd!)[0];
  const avg = (ids: string[]) => ids.reduce((s, id) => s + overall(playerInfo(state, data, id)?.ratings ?? { slaying: 72, hp_obj: 72, snd_iq: 72, third_mode: 72, clutch: 72, consistency: 72 }), 0) / ids.length;

  const modsOf = (team: string) => data.rosters.teams.find((t) => t.team === team)?.mapMods ?? {};
  const theirMods = modsOf(opponent);
  const yourMods = modsOf(gm.team);
  const pool = mapPoolFor(data.season, phase);
  const maps: ScoutMap[] = [];
  for (const slot of ["hp", "snd", "third"] as const) {
    const mode = slotToMode(data.season, slot);
    const rows = pool[slot].map((map) => ({ mode, map, theirs: theirMods[`${mode}:${map}`] ?? 0, yours: yourMods[`${mode}:${map}`] ?? 0 }) as ScoutMap);
    // Teams pick where they have the biggest edge and ban where they're furthest behind.
    const edge = (m: ScoutMap) => m.theirs - m.yours;
    const sorted = rows.slice().sort((a, b) => edge(b) - edge(a));
    if (sorted.length > 1) {
      sorted[0]!.likely = "pick";
      sorted[sorted.length - 1]!.likely = "ban";
    }
    maps.push(...rows);
  }
  return {
    opponent,
    record: [wins, theirs.length - wins],
    recent,
    lineup,
    hottest,
    maps,
    edge: Math.round((avg(gm.starters) - avg(lineup.map((p) => p.id))) * 10) / 10,
  };
}
