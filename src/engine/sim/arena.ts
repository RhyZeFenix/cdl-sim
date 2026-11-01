// Shared gunfight core. Every mode is built from duels and team fights; kills are
// the only source of kill/death/damage stats, so box scores always reconcile.
import type { Mode } from "../data/schema";
import type { Rng } from "../rng";
import { TUNING } from "./tuning";
import type { MapEvent, Pair, Side, SimPlayer, SimTeam } from "./types";

export interface Arena {
  rng: Rng;
  /** Eight players: 0-3 side 0, 4-7 side 1. */
  players: SimPlayer[];
  /** Mode-specific skill per player for this map, including form. */
  skill: number[];
  /** exp(engageK * skill): who tends to take the next gunfight (fixed for the map). */
  engage: number[];
  /** Duel logit slope for this map (overall slope times the mode multiplier). */
  k: number;
  t: number;
  events: MapEvent[];
  /** Map pace (kills per fight) and closeness (catch-up), relative to the mode average. */
  pace: number;
  close: number;
  /** SnD: plant rate and retake (defuse) rate, relative to the average map. */
  plant: number;
  retake: number;
}

/** A fight-size range scaled by the map's pace. */
export const paceKills = (a: Arena, r: readonly [number, number]): [number, number] => {
  if (!TUNING.mapEffects.pace || a.pace === 1) return [r[0], r[1]];
  const lo = Math.max(1, Math.round(r[0] * a.pace));
  return [lo, Math.max(lo, Math.round(r[1] * a.pace))];
};

/** Catch-up scaled by how close the map's real results run. */
export const closeScale = (a: Arena) => (TUNING.mapEffects.close ? a.close ** TUNING.mapEffects.closeExp : 1);

export const sideOf = (i: number): Side => (i < 4 ? 0 : 1);
export const sideIdx = (s: Side) => (s === 0 ? [0, 1, 2, 3] : [4, 5, 6, 7]);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function modeStat(p: SimPlayer, mode: Mode): number {
  switch (mode) {
    case "hp": return p.ratings.hp_obj;
    case "snd": return p.ratings.snd_iq;
    default: return p.ratings.third_mode;
  }
}

export function createArena(rng: Rng, teams: [SimTeam, SimTeam], mode: Mode, map: string): Arena {
  const players = [...teams[0].players, ...teams[1].players];
  if (players.length !== 8) throw new Error("each team needs exactly four players");
  const [ws, wm] = TUNING.weights[mode];
  const teamForm = [rng.normal(0, TUNING.teamFormSd), rng.normal(0, TUNING.teamFormSd)];
  const skill = players.map((p, i) => {
    const s = sideOf(i);
    const base = (ws * p.ratings.slaying + wm * modeStat(p, mode)) / 100;
    const form = rng.normal(0, TUNING.formSd * (1 - p.ratings.consistency / 100));
    const key = `${mode}:${map}`;
    const mod = (teams[s].mapMods?.[key] ?? 0) + (teams[s].prep?.[key] ?? 0);
    return base + form + teamForm[s]! + mod + (teams[s].form ?? 0) + (p.form ?? 0);
  });
  const engage = skill.map((x) => Math.exp(TUNING.engageK * x));
  return { rng, players, skill, engage, k: TUNING.duelK * TUNING.modeDuelScale[mode], t: 0, events: [], pace: 1, close: 1, plant: 1, retake: 1 };
}

export const allAlive = () => [true, true, true, true, true, true, true, true];
export const aliveOn = (alive: boolean[], s: Side) => sideIdx(s).filter((i) => alive[i]);
export const countAlive = (alive: boolean[], s: Side) => aliveOn(alive, s).length;

/** Logit bonus for the trailing side, given the current map score and units of deficit per step. */
export function catchUpBonus(score: Pair, perUnit: number, unit = 1): Pair {
  const diff = (score[0] - score[1]) / unit;
  const b = Math.min(TUNING.catchUp.cap, Math.abs(diff) * perUnit);
  return diff > 0 ? [0, b] : diff < 0 ? [b, 0] : [0, 0];
}

/** Probability that player a beats player b, with an extra logit bonus for a. */
export function duelProb(arena: Arena, a: number, b: number, bonusA: number): number {
  return sigmoid(arena.k * (arena.skill[a]! - arena.skill[b]!) + bonusA);
}

/**
 * One gunfight between the two sides' alive players. The loser dies and a kill
 * event is recorded. `bonus` is a per-side logit bonus (positional advantage).
 */
export function duelStep(
  arena: Arena,
  alive: boolean[],
  bonus: Pair,
  extra: { fb?: boolean; clutch?: boolean } = {},
): { killer: number; victim: number } {
  const { rng } = arena;
  // Hot path: no per-duel arrays or closures. Picks match rng.weighted exactly (same
  // weights, same summation order, one draw each), so results are unchanged.
  const n0 = (alive[0] ? 1 : 0) + (alive[1] ? 1 : 0) + (alive[2] ? 1 : 0) + (alive[3] ? 1 : 0);
  const n1 = (alive[4] ? 1 : 0) + (alive[5] ? 1 : 0) + (alive[6] ? 1 : 0) + (alive[7] ? 1 : 0);
  if (!n0 || !n1) throw new Error("weighted pick from empty list");
  const p0 = pickEngaged(arena, alive, 0, n0);
  const p1 = pickEngaged(arena, alive, 4, n1);
  let logit = bonus[0] - bonus[1] + TUNING.manAdvantage * (n0 - n1);
  if (extra.clutch) {
    const clutch = (i: number) => ((arena.players[i]!.ratings.clutch - 75) / 100) * TUNING.snd.clutchScale;
    if (n0 === 1) logit += clutch(p0);
    if (n1 === 1) logit -= clutch(p1);
  }
  const win0 = rng.chance(duelProb(arena, p0, p1, logit));
  const killer = win0 ? p0 : p1;
  const victim = win0 ? p1 : p0;
  alive[victim] = false;
  const ev: MapEvent = {
    k: "kill",
    t: Math.round(arena.t),
    by: killer,
    on: victim,
    dmg: 100 + rng.int(0, 50),
    vdmg: rng.chance(0.75) ? rng.int(10, 99) : 0,
  };
  if (extra.fb) ev.fb = true;
  arena.events.push(ev);
  return { killer, victim };
}

export interface FightResult {
  winner: Side;
  /** Kills scored BY each side. */
  kills: Pair;
  /** Alive at the end, per side. */
  left: Pair;
  secs: number;
}

/** A weighted pick among one side's alive players (from index `from`), like rng.weighted. */
function pickEngaged(arena: Arena, alive: boolean[], from: number, n: number): number {
  const w = arena.engage;
  let total = 0;
  for (let i = from; i < from + 4; i++) if (alive[i]) total += Math.max(0, w[i]!);
  const next = arena.rng.next;
  if (total <= 0) {
    let k = Math.floor(next() * n);
    for (let i = from; i < from + 4; i++) if (alive[i] && k-- === 0) return i;
  }
  let r = next() * total;
  let last = from;
  for (let i = from; i < from + 4; i++) {
    if (!alive[i]) continue;
    last = i;
    r -= Math.max(0, w[i]!);
    if (r < 0) return i;
  }
  return last;
}

/** A respawn-mode team fight: everyone alive, trade until a wipe or the fight fizzles. */
export function teamFight(
  arena: Arena,
  opts: { bonus: Pair; kills: readonly [number, number]; killSecs: readonly [number, number] },
): FightResult {
  const { rng } = arena;
  const alive = allAlive();
  const maxKills = rng.int(opts.kills[0], opts.kills[1]);
  const kills: Pair = [0, 0];
  const left: Pair = [4, 4];
  const lo = Math.round(opts.killSecs[0] * 10);
  const hi = Math.round(opts.killSecs[1] * 10);
  let secs = 0;
  while (kills[0] + kills[1] < maxKills && left[0] > 0 && left[1] > 0) {
    const step = rng.int(lo, hi) / 10;
    secs += step;
    arena.t += step;
    const { killer } = duelStep(arena, alive, opts.bonus);
    const side = sideOf(killer);
    kills[side]++;
    left[side === 0 ? 1 : 0]--;
  }
  let winner: Side;
  if (left[0] !== left[1]) winner = left[0] > left[1] ? 0 : 1;
  else if (kills[0] !== kills[1]) winner = kills[0] > kills[1] ? 0 : 1;
  else winner = rng.chance(0.5) ? 0 : 1;
  return { winner, kills, left, secs };
}

/** Choose a player on a side, weighted by a rating (e.g. who plants, who stands on the hill). */
export function pickBy(arena: Arena, candidates: number[], weight: (p: SimPlayer) => number): number {
  return arena.rng.weighted(candidates, (i) => Math.exp(weight(arena.players[i]!) / 15));
}
