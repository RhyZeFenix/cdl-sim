// Dynasty mode: carry a GM franchise from one season into the next. The real seasons
// run 2024 → 2025 → 2026; after that the 2026 format repeats with every player's
// ratings progressing by age each off-season. Contracts tick down, expiring players
// leave unless re-signed, and the owner's trust carries over.
import { loadSeasonData, startersOn, type SeasonData, type SeasonId } from "../data/registry";
import {
  createSeason,
  isDone,
  playerIndex,
  playerInfo,
  pointsTable,
  type SeasonState,
} from "../season/season";
import { ovrOf } from "./contracts";
import { initFranchise } from "./franchise";
import { pushInbox } from "./inbox";
import { MORALE_START } from "./morale";
import { ordinal, ownerVerdict } from "./owner";
import type { Contract, SeasonRecap } from "./types";
import { askFor, askingSalary, baseAge, progressRatings, progression } from "./values";

/**
 * Which franchise slot became which team the next season (renames, relocations and
 * sales), as best known. The user can pick a different team when it doesn't apply.
 */
export const FRANCHISE_LINEAGE: Partial<Record<SeasonId, Record<string, string>>> = {
  "2024": {
    "atlanta-faze": "atlanta-faze",
    "boston-breach": "boston-breach",
    "carolina-royal-ravens": "carolina-royal-ravens",
    "las-vegas-legion": "vegas-falcons",
    "la-guerrillas": "la-guerrillas-m8",
    "la-thieves": "la-thieves",
    "miami-heretics": "miami-heretics",
    "minnesota-rokkr": "minnesota-rokkr",
    "ny-subliners": "cloud9-new-york",
    "optic-texas": "optic-texas",
    "seattle-surge": "vancouver-surge",
    "toronto-ultra": "toronto-ultra",
  },
  "2025": {
    "atlanta-faze": "faze-vegas",
    "boston-breach": "boston-breach",
    "carolina-royal-ravens": "carolina-royal-ravens",
    "cloud9-new-york": "cloud9-new-york",
    "la-guerrillas-m8": "paris-gentle-mates",
    "la-thieves": "la-thieves",
    "miami-heretics": "miami-heretics",
    "minnesota-rokkr": "g2-minnesota",
    "optic-texas": "optic-texas",
    "toronto-ultra": "toronto-koi",
    "vancouver-surge": "vancouver-surge",
    "vegas-falcons": "riyadh-falcons",
  },
};

export const nextSeasonId = (id: SeasonId): SeasonId => (id === "2024" ? "2025" : "2026");

/** The season's name: the data's, or "CDL 2027" etc. once a dynasty runs past 2026. */
export function seasonLabel(state: SeasonState, data: SeasonData): string {
  return state.dynasty?.label ?? data.season.label;
}

/** A player's age this season (seeded at 19-28 in a save's first season). */
export function playerAge(state: SeasonState, id: string): number {
  return baseAge(id) + (state.dynasty?.year ?? 1) - 1;
}

/** Roster players whose contracts end with this season. */
export function expiringContracts(state: SeasonState): string[] {
  const gm = state.gm;
  if (!gm) return [];
  return gm.roster.filter((id) => (gm.contracts?.[id]?.years ?? 1) <= 1);
}

/** The team the GM's franchise becomes next season, if it's known. */
export function successorTeam(state: SeasonState): string | undefined {
  const gm = state.gm;
  if (!gm) return undefined;
  const next = loadSeasonData(nextSeasonId(state.seasonId));
  const mapped = FRANCHISE_LINEAGE[state.seasonId]?.[gm.team] ?? gm.team;
  return next.season.teams.some((t) => t.id === mapped) ? mapped : undefined;
}

export function seasonRecap(state: SeasonState, data: SeasonData): SeasonRecap {
  const gm = state.gm!;
  const rank = pointsTable(state, data).findIndex((r) => r.team === gm.team) + 1;
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team));
  const wins = mine.filter((r) => r.winner === gm.team).length;
  const champs = state.events.find((e) => e.kind === "championship");
  const v = ownerVerdict(state, data);
  return {
    year: state.dynasty?.year ?? 1,
    label: seasonLabel(state, data),
    team: gm.team,
    teamName: data.season.teams.find((t) => t.id === gm.team)?.name ?? gm.team,
    points: state.points[gm.team] ?? 0,
    rank,
    record: [wins, mine.length - wins],
    champsPlace: champs?.placements[gm.team],
    eventsWon: state.events.filter((e) => e.placements[gm.team]?.[0] === 1).map((e) => e.name),
    goalsMet: v.met,
    goalsTotal: v.total,
    verdict: v.verdict,
  };
}

export interface NextSeasonOptions {
  /** The team to run next season (defaults to the franchise's successor). */
  team?: string;
  /** Expiring players to re-sign, with the contract length. */
  resign?: Record<string, number>;
  seed?: string;
}

/** Builds next season's state for a finished GM season. */
export function startNextSeason(prev: SeasonState, prevData: SeasonData, opts: NextSeasonOptions = {}): SeasonState {
  const gm = prev.gm;
  if (!gm) throw new Error("Dynasty mode needs a GM season.");
  if (!isDone(prev)) throw new Error("Finish the season first.");
  const recap = seasonRecap(prev, prevData);
  if (recap.verdict === "fired") throw new Error("The owner fired you. Start a new save to keep going.");

  const year = (prev.dynasty?.year ?? 1) + 1;
  const nextId = nextSeasonId(prev.seasonId);
  const data = loadSeasonData(nextId);
  // Past the real seasons the 2026 data repeats, labelled with the next year.
  const repeat = nextId === prev.seasonId;
  const prevYear = Number(/\d{4}/.exec(seasonLabel(prev, prevData))?.[0] ?? 2026);
  const label = repeat ? `CDL ${prevYear + 1}` : data.season.label;

  const team = opts.team ?? successorTeam(prev);
  if (!team || !data.season.teams.some((t) => t.id === team)) throw new Error("Pick the team your franchise becomes next season.");

  const resign = opts.resign ?? {};
  const kept = gm.roster.filter((id) => (gm.contracts?.[id]?.years ?? 1) > 1 || resign[id]);

  const seed = opts.seed ?? `${prev.options.seed.replace(/-y\d+$/, "")}-y${year}`;
  const state = createSeason(data, { ...prev.options, seed, gmTeam: undefined, champsOnly: false });

  // Ratings: real data for the real seasons; past them everyone keeps progressing.
  const index = playerIndex(data);
  if (repeat) {
    const adj: Record<string, number> = {};
    for (const id of index.keys()) {
      const age = baseAge(id) + year - 2;
      adj[id] = Math.round(((prev.ratingAdj?.[id] ?? 0) + progression(id, age, year)) * 10) / 10;
    }
    state.ratingAdj = adj;
  }
  // Kept players with no real data next season (or past the real seasons) carry their own ratings.
  const carried: SeasonState["carried"] = {};
  for (const id of kept) {
    if (!repeat && index.has(id)) continue;
    const p = playerInfo(prev, prevData, id);
    if (!p) continue;
    carried[id] = { ...p, ratings: progressRatings(p.ratings, progression(id, baseAge(id) + year - 2, year)) };
  }
  state.carried = carried;
  state.dynasty = { year, label, history: [...(prev.dynasty?.history ?? []), recap] };

  // The roster: kept players, topped up from the franchise's real roster.
  const roster = [...kept];
  const real = startersOn(data.rosters, team, data.season.stages[0]!.qualifiers.start)
    .filter((id) => !roster.includes(id))
    .sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a));
  while (roster.length < 4 && real.length) roster.push(real.shift()!);
  const starters = roster.slice().sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a)).slice(0, 4);

  const contracts: Record<string, Contract> = {};
  for (const id of roster) {
    if (resign[id]) contracts[id] = { salary: askFor(ovrOf(state, data, id), resign[id]!), years: Math.max(1, Math.min(3, resign[id]!)) };
    else if (gm.contracts?.[id]) contracts[id] = { ...gm.contracts[id]!, years: gm.contracts[id]!.years - 1 };
    else contracts[id] = { salary: askingSalary(ovrOf(state, data, id)), years: 2 };
  }
  const morale: Record<string, number> = {};
  for (const id of roster) {
    const before = gm.morale?.[id];
    morale[id] = before === undefined ? MORALE_START : Math.round((before + MORALE_START) / 2) + (resign[id] ? 5 : 0);
  }

  state.options = { ...state.options, gmTeam: team };
  state.gm = {
    team,
    roster,
    starters,
    autoVeto: gm.autoVeto,
    pauseBetweenMaps: gm.pauseBetweenMaps,
    spoilerFree: gm.spoilerFree,
    unwatched: [],
    moves: [],
    prep: { kind: "balanced" },
    morale,
    contracts,
    trust: prev.gm!.trust,
    inbox: [],
  };
  initFranchise(state, data);
  const left = gm.roster.filter((id) => !kept.includes(id)).map((id) => playerInfo(prev, prevData, id)?.handle ?? id);
  pushInbox(state, {
    date: data.season.stages[0]!.qualifiers.start,
    kind: "contract",
    title: `Off-season: ${label}`,
    body:
      `Last season: ${recap.label}, ${ordinal(recap.rank)} in points, ` +
      `${recap.goalsMet}/${recap.goalsTotal} goals. ` +
      (left.length ? `Leaving as free agents: ${left.join(", ")}. ` : "Nobody left. ") +
      (team !== gm.team ? `The franchise now plays as ${data.season.teams.find((t) => t.id === team)!.name}.` : ""),
  });
  return state;
}
