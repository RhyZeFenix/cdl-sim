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
  /** Duel logit slope for this map (overall slope times the mode multiplier). */
  k: number;
  t: number;
  events: MapEvent[];
}

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
    const mod = teams[s].mapMods?.[`${mode}:${map}`] ?? 0;
    return base + form + teamForm[s]! + mod;
  });
  return { rng, players, skill, k: TUNING.duelK * TUNING.modeDuelScale[mode], t: 0, events: [] };
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
  const a0 = aliveOn(alive, 0);
  const a1 = aliveOn(alive, 1);
  const engage = (i: number) => Math.exp(TUNING.engageK * arena.skill[i]!);
  const p0 = rng.weighted(a0, engage);
  const p1 = rng.weighted(a1, engage);
  let logit = bonus[0] - bonus[1] + TUNING.manAdvantage * (a0.length - a1.length);
  if (extra.clutch) {
    const clutch = (i: number) => ((arena.players[i]!.ratings.clutch - 75) / 100) * TUNING.snd.clutchScale;
    if (a0.length === 1) logit += clutch(p0);
    if (a1.length === 1) logit -= clutch(p1);
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

/** A respawn-mode team fight: everyone alive, trade until a wipe or the fight fizzles. */
export function teamFight(
  arena: Arena,
  opts: { bonus: Pair; kills: readonly [number, number]; killSecs: readonly [number, number] },
): FightResult {
  const { rng } = arena;
  const alive = allAlive();
  const maxKills = rng.int(opts.kills[0], opts.kills[1]);
  const kills: Pair = [0, 0];
  let secs = 0;
  while (kills[0] + kills[1] < maxKills && countAlive(alive, 0) > 0 && countAlive(alive, 1) > 0) {
    const step = rng.int(Math.round(opts.killSecs[0] * 10), Math.round(opts.killSecs[1] * 10)) / 10;
    secs += step;
    arena.t += step;
    const { killer } = duelStep(arena, alive, opts.bonus);
    kills[sideOf(killer)]++;
  }
  const left: Pair = [countAlive(alive, 0), countAlive(alive, 1)];
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
