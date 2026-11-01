// How the front office values players: overall rating, asking salary, trade value and
// age. Salaries are in $k a season.
import type { Ratings } from "../data/schema";
import { createRng } from "../rng";
import players from "../../../data/stats/players.json";
import { playerKey } from "../data/form";

export const SALARY_CAP = 1100;
/** A player asking this much or less can always be signed, even over the cap. */
export const MIN_EXCEPTION = 60;
/** Share of a released player's salary that stays on the books for the rest of the season. */
export const DEAD_CAP_SHARE = 0.5;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const overall = (r: Ratings) => (r.slaying + r.hp_obj + r.snd_iq + r.third_mode) / 4;

/** What a player asks for a season: about $40k at 70 overall up to $300k at 92. */
export function askingSalary(ovr: number): number {
  const x = clamp((ovr - 70) / 22, 0, 1);
  return Math.round((40 + 260 * x ** 1.8) / 5) * 5;
}

/** Contract length changes the ask a little: one-year deals cost more, three-year deals less. */
export function askFor(ovr: number, years: number): number {
  const base = askingSalary(ovr);
  return Math.round((base * (years <= 1 ? 1.1 : years >= 3 ? 0.95 : 1)) / 5) * 5;
}

/** Trade value: steep in overall, so one star is worth more than two role players. */
export function tradeValue(ovr: number, salary?: number): number {
  const v = 100 * clamp((ovr - 60) / 30, 0, 1.3) ** 2.2;
  if (salary === undefined) return v;
  // Overpaid players are worth less to the team taking on the contract.
  const fair = askingSalary(ovr);
  return Math.max(0, v - Math.max(0, salary - fair) / 8);
}

const BIRTH = new Map(
  (players.rows as { ID: string; Birthdate?: string }[])
    .filter((r) => r.Birthdate)
    .map((r) => [playerKey(r.ID), r.Birthdate!] as const),
);

/**
 * A player's age during the CDL season named for `seasonYear` (CDL 2026 runs from
 * December 2025 to June 2026, so it's their age on 1 March of that year). Real
 * birthdates come from the CoD Esports Wiki; anyone without one gets a seeded 19-28 in
 * 2024, a year older each season after.
 */
export function ageIn(id: string, seasonYear: number): number {
  const b = BIRTH.get(playerKey(id));
  if (b) {
    const [y, m, d] = b.split("-").map(Number) as [number, number, number];
    return seasonYear - y - (m > 3 || (m === 3 && d > 1) ? 1 : 0);
  }
  return createRng(`age:${id}`).int(19, 28) + (seasonYear - 2024);
}

/** True when the age is from a real birthdate. */
export const realAge = (id: string) => BIRTH.has(playerKey(id));

/** Rating change over an off-season: young players improve, veterans decline. */
export function progression(id: string, age: number, year: number): number {
  const base = age <= 21 ? 2.5 : age <= 23 ? 1.5 : age <= 25 ? 0.5 : age <= 27 ? 0 : age <= 29 ? -1 : -2;
  return base + createRng(`prog:${id}:${year}`).normal(0, 1);
}

export function progressRatings(r: Ratings, delta: number): Ratings {
  const f = (v: number) => clamp(Math.round(v + delta), 50, 99);
  return { ...r, slaying: f(r.slaying), hp_obj: f(r.hp_obj), snd_iq: f(r.snd_iq), third_mode: f(r.third_mode), clutch: f(r.clutch) };
}
