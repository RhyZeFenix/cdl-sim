// Contracts, the salary cap and trades. Every GM roster player has a contract
// (salary in $k a season, seasons left). Payroll plus dead money (released players)
// must stay under the cap to sign anyone above the minimum exception. Trades swap
// players with an AI team, which accepts when it comes out ahead on value.
import type { SeasonData } from "../data/registry";
import { createRng } from "../rng";
import {
  GM_ROSTER_MAX,
  GM_ROSTER_MIN,
  gmCanMakeMoves,
  nextStepDate,
  playerInfo,
  teamLineup,
  type SeasonState,
} from "../season/season";
import { pushInbox } from "./inbox";
import type { Contract } from "./types";
import { askFor, askingSalary, MIN_EXCEPTION, overall, SALARY_CAP, tradeValue } from "./values";

export const ovrOf = (state: SeasonState, data: SeasonData, id: string): number => {
  const p = playerInfo(state, data, id);
  return p ? overall(p.ratings) : 72;
};

/** What a player would sign for, for `years` seasons. */
export function contractFor(state: SeasonState, data: SeasonData, id: string, years: number): Contract {
  const y = Math.max(1, Math.min(3, Math.round(years)));
  return { salary: Math.round((askFor(ovrOf(state, data, id), y) * reputationOf(state, id)) / 5) * 5, years: y };
}

/** Award winners ask for more (1 = no awards). */
export const reputationOf = (state: SeasonState, id: string) => state.reputation?.[id] ?? 1;

/** What a player asks per season on a two-year deal, with any award premium. */
export const marketAsk = (state: SeasonState, data: SeasonData, id: string) => Math.round((askingSalary(ovrOf(state, data, id)) * reputationOf(state, id)) / 5) * 5;

/** Trades close at the deadline: the window before Champs is signings only. */
export function tradesOpen(state: SeasonState): boolean {
  return gmCanMakeMoves(state) && state.steps[state.next]?.kind !== "championship";
}

/** Salary on the books: contracts plus dead money. */
export function payroll(state: SeasonState): number {
  const gm = state.gm;
  if (!gm) return 0;
  const c = Object.entries(gm.contracts ?? {})
    .filter(([id]) => gm.roster.includes(id))
    .reduce((s, [, k]) => s + k.salary, 0);
  return c + (gm.deadCap ?? 0);
}

export const capSpace = (state: SeasonState) => SALARY_CAP - payroll(state);

/** Why a signing at this salary isn't allowed (null if it is). */
export function signingProblem(state: SeasonState, salary: number): string | null {
  if (salary <= MIN_EXCEPTION) return null;
  const space = capSpace(state);
  if (salary > space) return `Not enough cap space: $${salary}k needed, $${Math.max(0, space)}k left under the $${SALARY_CAP}k cap.`;
  return null;
}

/** Contracts for a roster the GM inherits: around each player's ask, one to three seasons. */
export function initialContracts(state: SeasonState, data: SeasonData, ids: string[], label: string): Record<string, Contract> {
  const out: Record<string, Contract> = {};
  for (const id of ids) {
    const rng = createRng(`${state.options.seed}/contract/${label}/${id}`);
    const ask = askingSalary(ovrOf(state, data, id));
    out[id] = { salary: Math.round((ask * (0.85 + 0.3 * rng.next())) / 5) * 5, years: rng.int(1, 3) };
  }
  return out;
}

// ------------------------------------------------------------------ trades

/** An AI team's players in lineup order: their starters on the next step's date, then the bench. */
export function aiRoster(state: SeasonState, data: SeasonData, team: string): string[] {
  const set = state.aiRosters?.[team];
  const owned = new Set(state.gm?.roster ?? []);
  for (const [t, ids] of Object.entries(state.aiRosters ?? {})) if (t !== team) for (const id of ids) owned.add(id);
  if (set) return set.filter((id) => !owned.has(id));
  const starters = teamLineup(state, data, team, nextStepDate(state, data)).filter((id) => !id.startsWith("repl-"));
  const roster = data.rosters.teams.find((t) => t.team === team);
  const bench = (roster?.players ?? []).map((p) => p.id).filter((id) => !starters.includes(id) && !owned.has(id));
  return [...starters, ...bench];
}

export interface TradeOffer {
  team: string;
  /** GM players going to the AI team. */
  give: string[];
  /** AI players coming to the GM. */
  get: string[];
}

export interface TradeVerdict {
  accepted: boolean;
  reason: string;
  /** Value the AI team gets and gives up. */
  valueIn: number;
  valueOut: number;
  payrollAfter: number;
}

/** How the AI team sees an offer. Doesn't change anything. */
export function evaluateTrade(state: SeasonState, data: SeasonData, offer: TradeOffer): TradeVerdict {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  const { team, give, get } = offer;
  const ai = aiRoster(state, data, team);
  const no = (reason: string, valueIn = 0, valueOut = 0): TradeVerdict => ({ accepted: false, reason, valueIn, valueOut, payrollAfter: payroll(state) });
  if (!data.season.teams.some((t) => t.id === team) || team === gm.team) return no("Pick another CDL team.");
  if (!gmCanMakeMoves(state)) return no("Trades are only allowed before the season and between stages.");
  if (!tradesOpen(state)) return no("The trade deadline has passed (no trades before Champs).");
  if (!give.length && !get.length) return no("Pick players to trade.");
  if (give.some((id) => !gm.roster.includes(id))) return no("You can only trade players on your roster.");
  if (get.some((id) => !ai.includes(id))) return no("That player isn't on their roster.");
  const gmAfter = gm.roster.length - give.length + get.length;
  if (gmAfter < GM_ROSTER_MIN || gmAfter > GM_ROSTER_MAX) return no(`Your roster would have ${gmAfter} players (${GM_ROSTER_MIN}-${GM_ROSTER_MAX} allowed).`);
  if (ai.length - get.length + give.length < 4) return no("They need at least four players left.");

  const salaryOf = (id: string) => gm.contracts?.[id]?.salary;
  const valueIn = give.reduce((s, id) => s + tradeValue(ovrOf(state, data, id), salaryOf(id)), 0);
  const valueOut = get.reduce((s, id) => s + tradeValue(ovrOf(state, data, id)), 0);
  const incoming = get.reduce((s, id) => s + askingSalary(ovrOf(state, data, id)), 0);
  const outgoing = give.reduce((s, id) => s + (salaryOf(id) ?? 0), 0);
  const payrollAfter = payroll(state) - outgoing + incoming;
  if (payrollAfter > SALARY_CAP && incoming > outgoing) {
    return { accepted: false, reason: `That would put you $${payrollAfter - SALARY_CAP}k over the cap.`, valueIn, valueOut, payrollAfter };
  }
  // Teams want to win a trade, and want more for their best player.
  const best = ai.slice().sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a))[0];
  const need = get.includes(best!) ? 1.3 : 1.1;
  if (valueIn < valueOut * need) {
    const short = Math.ceil(valueOut * need - valueIn);
    return {
      accepted: false,
      reason: `${teamName(data, team)} want more: about ${short} value short${get.includes(best!) ? " (they'd need a lot to give up their best player)" : ""}.`,
      valueIn,
      valueOut,
      payrollAfter,
    };
  }
  return { accepted: true, reason: `${teamName(data, team)} accept.`, valueIn, valueOut, payrollAfter };
}

const teamName = (data: SeasonData, id: string) => data.season.teams.find((t) => t.id === id)?.name ?? id;

/** Makes the trade if the AI team accepts it. Returns the verdict either way. */
export function proposeTrade(state: SeasonState, data: SeasonData, offer: TradeOffer): TradeVerdict {
  const v = evaluateTrade(state, data, offer);
  if (v.accepted) executeTrade(state, data, offer);
  return v;
}

/** Swaps the players (no questions asked: callers check it's allowed). */
export function executeTrade(state: SeasonState, data: SeasonData, offer: TradeOffer): void {
  const gm = state.gm!;
  const { team, give, get } = offer;
  const date = nextStepDate(state, data);

  // The AI team: incoming players take the departing players' places in the lineup.
  const queue = [...give];
  const ai = aiRoster(state, data, team).flatMap((id) => (get.includes(id) ? (queue.length ? [queue.shift()!] : []) : [id]));
  state.aiRosters = { ...(state.aiRosters ?? {}), [team]: [...ai, ...queue] };

  // The GM team.
  gm.roster = [...gm.roster.filter((id) => !give.includes(id)), ...get];
  const contracts = { ...(gm.contracts ?? {}) };
  for (const id of give) delete contracts[id];
  for (const id of get) {
    const rng = createRng(`${state.options.seed}/trade/${date}/${id}`);
    contracts[id] = { salary: askingSalary(ovrOf(state, data, id)), years: rng.int(1, 3) };
  }
  gm.contracts = contracts;
  const morale = { ...(gm.morale ?? {}) };
  for (const id of give) delete morale[id];
  for (const id of get) morale[id] = 65;
  gm.morale = morale;
  // Starters who left are replaced by the incoming players, then by the bench.
  const starters = gm.starters.filter((id) => !give.includes(id));
  for (const id of [...get, ...gm.roster]) if (starters.length < 4 && !starters.includes(id)) starters.push(id);
  gm.starters = starters;

  const stage = state.steps[state.next] && "stage" in state.steps[state.next]! ? (state.steps[state.next] as { stage: number }).stage : 5;
  for (const id of give) gm.moves.push({ date, beforeStage: stage, action: "trade-out", player: id });
  for (const id of get) gm.moves.push({ date, beforeStage: stage, action: "trade-in", player: id });
  gm.trades = [...(gm.trades ?? []), { date, team, gave: give, got: get }];
  const name = (id: string) => playerInfo(state, data, id)?.handle ?? id;
  pushInbox(state, {
    date,
    kind: "trade",
    title: `Trade with ${teamName(data, team)} done`,
    body: `You sent ${give.map(name).join(", ") || "nothing"} and got ${get.map(name).join(", ") || "nothing"}. Payroll is now $${payroll(state)}k of $${SALARY_CAP}k.`,
  });
  gm.tradeBlock = (gm.tradeBlock ?? []).filter((id) => !give.includes(id));
}
