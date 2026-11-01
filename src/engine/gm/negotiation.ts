// Contract negotiation. An offer is a salary, a length, an optional signing bonus (paid
// now, counted against this season's cap) and an optional team option year. A player
// takes less to join a contender, values a bonus more than salary, and wants a bit more
// to give the team an option. Too low an offer gets a counter.
import type { SeasonData } from "../data/registry";
import { nextStepDate, type SeasonState } from "../season/season";
import { capSpace, contractFor } from "./contracts";
import { MORALE_START } from "./morale";
import { strengthRanking } from "./owner";
import type { Contract } from "./types";
import { MIN_EXCEPTION } from "./values";

export interface Offer {
  /** $k a season. */
  salary: number;
  years: number;
  /** $k once, on signing. */
  bonus?: number;
  /** The team can add one more season at the same salary when the deal ends. */
  option?: boolean;
}

export interface NegotiationResult {
  accepted: boolean;
  reason: string;
  /** What they'd take instead (same length, bonus and option). */
  counter?: Offer;
  /** The per-season value they need. */
  need: number;
}

/** 1 for the strongest roster in the league, 0 for the weakest. */
export function contenderScore(state: SeasonState, data: SeasonData, team: string): number {
  const r = strengthRanking(state, data, nextStepDate(state, data));
  const i = r.findIndex((x) => x.team === team);
  return i < 0 || r.length < 2 ? 0.5 : 1 - i / (r.length - 1);
}

/** What a player needs per season (salary plus bonus value) to sign with `team`. */
export function needFor(state: SeasonState, data: SeasonData, id: string, years: number, team: string, option = false): number {
  const ask = contractFor(state, data, id, years).salary;
  const contender = contenderScore(state, data, team);
  // Up to 12% off for the best teams; your own players' mood matters too.
  let need = ask * (1 - 0.12 * contender);
  const morale = state.gm?.roster.includes(id) ? (state.gm.morale?.[id] ?? MORALE_START) : MORALE_START;
  need *= 1 + (MORALE_START - morale) / 400;
  if (option) need *= 1.05;
  return Math.round(need);
}

/** A bonus is worth a little more to a player than the same money as salary. */
export const offerValue = (o: Offer) => o.salary + ((o.bonus ?? 0) * 1.25) / Math.max(1, o.years);

export function negotiate(state: SeasonState, data: SeasonData, id: string, offer: Offer, team = state.gm!.team): NegotiationResult {
  const years = Math.max(1, Math.min(3, Math.round(offer.years)));
  const need = needFor(state, data, id, years, team, !!offer.option);
  const value = offerValue({ ...offer, years });
  if (value >= need) return { accepted: true, reason: "They'll sign.", need };
  const salary = Math.ceil((need - ((offer.bonus ?? 0) * 1.25) / years) / 5) * 5;
  return {
    accepted: false,
    reason: `Not enough: they want about $${need}k a season in value${offer.bonus ? " (counting the bonus)" : ""}.`,
    counter: { ...offer, years, salary },
    need,
  };
}

/** The cap check for an offer: salary under the cap (or the minimum exception), and room for the bonus. */
export function offerProblem(state: SeasonState, offer: Offer): string | null {
  const space = capSpace(state);
  const total = offer.salary + (offer.bonus ?? 0);
  if (offer.salary <= MIN_EXCEPTION && !offer.bonus) return null;
  if (total > space) return `Not enough cap space: $${total}k needed (salary plus bonus), $${Math.max(0, Math.round(space))}k left.`;
  return null;
}

/** The contract an accepted offer turns into. */
export const contractOf = (o: Offer): Contract => ({ salary: o.salary, years: Math.max(1, Math.min(3, Math.round(o.years))), ...(o.option ? { option: true } : {}) });
