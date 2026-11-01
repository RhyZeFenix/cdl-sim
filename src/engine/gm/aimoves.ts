// AI teams that move on their own: in-season they occasionally trade with each other,
// and in dynasty seasons past the real data, veterans retire and teams reshuffle so
// the league doesn't stand still around you.
import type { SeasonData } from "../data/registry";
import type { Rng } from "../rng";
import { aiPatchIn, aiPatchOut, freeAgents, nextStepDate, playerInfo, type SeasonState } from "../season/season";
import { aiRoster, ovrOf } from "./contracts";
import { pushInbox } from "./inbox";
import { ageIn, tradeValue } from "./values";
import { seasonYearOf } from "./dynasty";

const name = (data: SeasonData, id: string) => data.season.teams.find((t) => t.id === id)?.abbr ?? id;
const handle = (state: SeasonState, data: SeasonData, id: string) => playerInfo(state, data, id)?.handle ?? id;

/** One AI-to-AI trade of similar-value players, if a fair one turns up. Returns true if it happened. */
export function aiTrade(state: SeasonState, data: SeasonData, rng: Rng): boolean {
  const gm = state.gm?.team;
  const teams = data.season.teams.map((t) => t.id).filter((t) => t !== gm);
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = rng.pick(teams);
    const b = rng.pick(teams.filter((t) => t !== a));
    const ra = aiRoster(state, data, a).filter((id) => !id.startsWith("repl-"));
    const rb = aiRoster(state, data, b).filter((id) => !id.startsWith("repl-"));
    if (ra.length < 4 || rb.length < 4) continue;
    const pa = rng.pick(ra.slice(0, 4));
    const va = tradeValue(ovrOf(state, data, pa));
    const pb = rb.slice(0, 4).find((id) => Math.abs(tradeValue(ovrOf(state, data, id)) - va) <= va * 0.15);
    if (!pb) continue;
    aiPatchOut(state, a, [pa]);
    aiPatchOut(state, b, [pb]);
    aiPatchIn(state, a, [pb]);
    aiPatchIn(state, b, [pa]);
    pushInbox(state, {
      date: nextStepDate(state, data),
      kind: "trade",
      title: `${name(data, a)} and ${name(data, b)} swap players`,
      body: `${handle(state, data, pa)} goes to ${name(data, b)} and ${handle(state, data, pb)} to ${name(data, a)}.`,
    });
    return true;
  }
  return false;
}

/**
 * Off-season moves for seasons past the real data: players 32 and over retire and are
 * replaced by the best free agents, then a couple of AI teams trade.
 */
export function offseasonAiMoves(state: SeasonState, data: SeasonData, year: number, rng: Rng): string[] {
  const gm = state.gm?.team;
  const notes: string[] = [];
  const fas = freeAgents(state, data)
    .filter((id) => ageIn(id, seasonYearOf(state)) < 30)
    .sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a));
  for (const t of data.season.teams) {
    if (t.id === gm) continue;
    const roster = aiRoster(state, data, t.id).filter((id) => !id.startsWith("repl-"));
    const retiring = roster.slice(0, 4).filter((id) => ageIn(id, seasonYearOf(state)) >= 32);
    if (!retiring.length) continue;
    const replacements = retiring.map(() => fas.shift()).filter((id): id is string => !!id);
    aiPatchOut(state, t.id, retiring);
    aiPatchIn(state, t.id, replacements);
    notes.push(`${retiring.map((id) => handle(state, data, id)).join(", ")} retired from ${name(data, t.id)}`);
  }
  for (let i = 0; i < 2; i++) aiTrade(state, data, rng);
  return notes;
}
