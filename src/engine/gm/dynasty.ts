// Dynasty mode: carry a GM franchise from one season into the next. The real seasons
// run 2024 → 2025 → 2026; after that the 2026 format repeats with every player's
// ratings progressing by age each off-season. Contracts tick down, expiring players
// leave unless re-signed, and the owner's trust carries over.
import { loadSeasonData, startersOn, type SeasonData, type SeasonId } from "../data/registry";
import {
  aiPatchIn,
  createSeason,
  freeAgents,
  isDone,
  playerIndex,
  playerInfo,
  playerLines,
  pointsTable,
  type SeasonState,
} from "../season/season";
import { marketAsk, ovrOf } from "./contracts";
import { contenderScore, contractOf, needFor, offerProblem, offerValue, type Offer } from "./negotiation";
import { initFranchise } from "./franchise";
import { pushInbox } from "./inbox";
import { MORALE_START } from "./morale";
import { ordinal, ownerVerdict } from "./owner";
import type { Contract, SeasonRecap } from "./types";
import { ageIn, askFor, askingSalary, overall, progressRatings, progression } from "./values";
import { ACADEMY_MAX, potentialRange } from "./academy";
import { createRng } from "../rng";
import { offseasonAiMoves } from "./aimoves";
import { achievementsAfterStep } from "./achievements";
import { traitOf } from "./personality";

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
/** The calendar year a season is named for ("CDL 2027" in a dynasty, else the data season). */
export const seasonYearOf = (state: SeasonState) => Number(/\d{4}/.exec(state.dynasty?.label ?? "")?.[0] ?? state.seasonId);

export function playerAge(state: SeasonState, id: string): number {
  return ageIn(id, seasonYearOf(state));
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
  const arrived = new Set([...gm.moves.filter((m) => m.action === "sign" || m.action === "trade-in").map((m) => m.player), ...gm.roster.filter((id) => id.startsWith("pro-"))]);
  const lines = playerLines(state, mine.map((r) => r.id)).filter((l) => arrived.has(l.player) && l.team === gm.team && l.maps >= 3);
  const a = state.awards;
  const awards = a
    ? [
        ...(a.mvp && gm.roster.includes(a.mvp) ? [`MVP: ${playerInfo(state, data, a.mvp)?.handle}`] : []),
        ...(a.rookie && gm.roster.includes(a.rookie) ? [`Rookie of the Year: ${playerInfo(state, data, a.rookie)?.handle}`] : []),
        ...a.allCdl.flat().filter((id) => gm.roster.includes(id)).map((id) => `All-CDL: ${playerInfo(state, data, id)?.handle}`),
      ]
    : [];
  return {
    signings: lines.slice(0, 3).map((l) => ({ player: l.player, handle: playerInfo(state, data, l.player)?.handle ?? l.player, kd: Math.round(l.kd * 100) / 100, maps: l.maps })),
    awards,
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
  /** Expiring players on a team option to keep for one more season at the same salary. */
  exercise?: string[];
  /** Offers to free agents for the off-season bidding (see previewFreeAgents). */
  offers?: Record<string, Offer>;
  /** Optional draft rule: the prospect to take with your pick (otherwise the best left). */
  draftPick?: string;
  /** Skip the draft (previews use this to see the class before it's picked over). */
  noDraft?: boolean;
  seed?: string;
}

/** Expiring players whose contract has a team option. */
export const optionPlayers = (state: SeasonState) => expiringContracts(state).filter((id) => state.gm?.contracts?.[id]?.option);

export interface FreeAgentPreview {
  id: string;
  handle: string;
  ovr: number;
  /** Asking salary for two seasons. */
  ask: number;
  /** How many AI teams are expected to bid. */
  interest: number;
}

const FA_POOL = 24;

export interface DraftPreview {
  /** Your pick number (1 = first) and how many teams pick. */
  pick: number;
  teams: number;
  /** The class, best visible potential first. */
  prospects: { id: string; handle: string; age: number; ovr: number; potential: [number, number] }[];
}

/** Draft order: last season's CDL points, worst first. */
function draftOrder(prev: SeasonState, prevData: SeasonData, team: string): string[] {
  const rank = pointsTable(prev, prevData).map((r) => (r.team === prev.gm!.team ? team : (FRANCHISE_LINEAGE[prev.seasonId]?.[r.team] ?? r.team)));
  return [...rank].reverse();
}

/** Optional draft rule: the coming class and where you pick. */
export function previewDraft(prev: SeasonState, prevData: SeasonData, opts: NextSeasonOptions = {}): DraftPreview {
  const state = startNextSeason(prev, prevData, { ...opts, offers: undefined, draftPick: undefined, noDraft: true });
  const data = loadSeasonData(state.seasonId);
  const order = draftOrder(prev, prevData, state.gm!.team).filter((t) => data.season.teams.some((x) => x.id === t));
  const academy = new Set(state.gm!.academy ?? []);
  return {
    pick: order.indexOf(state.gm!.team) + 1,
    teams: order.length,
    prospects: Object.entries(state.gm!.prospects ?? {})
      .filter(([id]) => !academy.has(id))
      .map(([id, p]) => ({ id, handle: p.player.handle, age: p.age, ovr: Math.round(overall(p.player.ratings)), potential: potentialRange(state, p) }))
      .sort((a, b) => b.potential[0] + b.potential[1] - (a.potential[0] + a.potential[1])),
  };
}

/** Runs the draft on the new season's prospect class: one round, worst team first. */
function runDraft(prev: SeasonState, prevData: SeasonData, state: SeasonState, data: SeasonData, choice?: string): string[] {
  const gm = state.gm!;
  const order = draftOrder(prev, prevData, gm.team).filter((t) => data.season.teams.some((x) => x.id === t));
  const academy = new Set(gm.academy ?? []);
  const left = new Set(Object.keys(gm.prospects ?? {}).filter((id) => !academy.has(id)));
  const best = () => [...left].sort((a, b) => gm.prospects![b]!.potential - gm.prospects![a]!.potential)[0];
  const notes: string[] = [];
  for (const team of order) {
    const id = team === gm.team && choice && left.has(choice) ? choice : best();
    if (!id) break;
    left.delete(id);
    const abbr = data.season.teams.find((t) => t.id === team)?.abbr ?? team;
    if (team === gm.team) {
      if ((gm.academy?.length ?? 0) < ACADEMY_MAX) gm.academy = [...(gm.academy ?? []), id];
      notes.push(`you took ${gm.prospects![id]!.player.handle} with pick ${order.indexOf(team) + 1}${(gm.academy ?? []).includes(id) ? "" : " (academy full, so they went unsigned)"}`);
    } else {
      delete gm.prospects![id];
      if (notes.length < 3) notes.push(`${abbr} took ${id.startsWith("pro-") ? "a prospect" : id} at ${order.indexOf(team) + 1}`);
    }
  }
  return notes;
}

/** The best free agents of the coming off-season, for the GM to make offers to. */
export function previewFreeAgents(prev: SeasonState, prevData: SeasonData, opts: NextSeasonOptions = {}): FreeAgentPreview[] {
  const state = startNextSeason(prev, prevData, { ...opts, offers: undefined });
  const data = loadSeasonData(state.seasonId);
  return faPool(state, data).map((id, i) => ({
    id,
    handle: playerInfo(state, data, id)?.handle ?? id,
    ovr: Math.round(ovrOf(state, data, id) * 10) / 10,
    ask: needFor(state, data, id, 2, state.gm!.team),
    interest: bidders(i),
  }));
}

function faPool(state: SeasonState, data: SeasonData): string[] {
  return freeAgents(state, data)
    .filter((id) => !id.startsWith("repl-"))
    .sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a))
    .slice(0, FA_POOL);
}

/** The best free agents draw the most bids. */
const bidders = (rank: number) => (rank < 4 ? 3 : rank < 10 ? 2 : rank < 16 ? 1 : 0);

/**
 * The off-season bidding. AI teams bid on the best free agents; each player signs where
 * the money looks best, with a bump for stronger rosters, and only if the offer meets
 * what they need. Returns lines for the inbox.
 */
export function resolveFreeAgency(state: SeasonState, data: SeasonData, offers: Record<string, Offer>, seed: string): string[] {
  const gm = state.gm!;
  const rng = createRng(`${seed}/free-agency`);
  const pool = faPool(state, data);
  const others = data.season.teams.map((t) => t.id).filter((t) => t !== gm.team);
  const contender = new Map(data.season.teams.map((t) => [t.id, contenderScore(state, data, t.id)]));
  const handle = (id: string) => playerInfo(state, data, id)?.handle ?? id;
  const abbr = (t: string) => data.season.teams.find((x) => x.id === t)?.abbr ?? t;
  const notes: string[] = [];
  pool.forEach((id, rank) => {
    const ask = marketAsk(state, data, id);
    const bids = Array.from({ length: bidders(rank) }, () => ({ team: rng.pick(others), value: Math.round(ask * (0.85 + 0.3 * rng.next())) }));
    const pull = (team: string, value: number) => value * (1 + 0.15 * contender.get(team)!);
    const best = bids.sort((a, b) => pull(b.team, b.value) - pull(a.team, a.value))[0];
    const offer = offers[id];
    let ours = false;
    if (offer) {
      const value = offerValue(offer);
      const enough = value >= needFor(state, data, id, offer.years, gm.team, !!offer.option);
      const beats = !best || pull(gm.team, value) >= pull(best.team, best.value);
      const problem = gm.roster.length >= 6 ? "your roster was full" : offerProblem(state, offer);
      if (enough && beats && !problem) {
        gm.roster.push(id);
        gm.contracts = { ...(gm.contracts ?? {}), [id]: contractOf(offer) };
        if (offer.bonus) gm.deadCap = (gm.deadCap ?? 0) + offer.bonus;
        gm.morale = { ...(gm.morale ?? {}), [id]: 74 };
        notes.push(`${handle(id)} signed with you`);
        ours = true;
      } else {
        const why = problem ?? (!enough ? "your offer was too low" : `${abbr(best!.team)} offered more`);
        notes.push(`${handle(id)} turned you down (${why})`);
      }
    }
    if (!ours && best) {
      aiPatchIn(state, best.team, [id]);
      if (offer || rank < 6) notes.push(`${handle(id)} signed with ${abbr(best.team)}`);
    }
  });
  return notes;
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
  const exercise = new Set((opts.exercise ?? []).filter((id) => gm.contracts?.[id]?.option));
  const kept = gm.roster.filter((id) => (gm.contracts?.[id]?.years ?? 1) > 1 || resign[id] || exercise.has(id));

  const seed = opts.seed ?? `${prev.options.seed.replace(/-y\d+$/, "")}-y${year}`;
  const state = createSeason(data, { ...prev.options, seed, gmTeam: undefined, champsOnly: false });

  // Ratings: real data for the real seasons; past them everyone keeps progressing.
  const index = playerIndex(data);
  if (repeat) {
    const adj: Record<string, number> = {};
    for (const id of index.keys()) {
      const age = ageIn(id, seasonYearOf(prev));
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
    carried[id] = { ...p, ratings: progressRatings(p.ratings, progression(id, ageIn(id, seasonYearOf(prev)), year)) };
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
    if (resign[id]) contracts[id] = { salary: Math.round((askFor(ovrOf(state, data, id), resign[id]!) * (traitOf(id) === "loyal" ? 0.9 : traitOf(id) === "mercenary" ? 1.1 : 1)) / 5) * 5, years: Math.max(1, Math.min(3, resign[id]!)) };
    else if (exercise.has(id)) contracts[id] = { salary: gm.contracts![id]!.salary, years: 1 };
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
    staff: gm.staff,
    // Rivalries cool off over the summer.
    rivals: Object.fromEntries(Object.entries(gm.rivals ?? {}).map(([t, h]) => [FRANCHISE_LINEAGE[prev.seasonId]?.[t] ?? t, Math.round(h / 2)])),
    academy: gm.academy ?? [],
    together: gm.together,
    achievements: gm.achievements,
  };
  // Past the real data the league reshuffles: retirements, then a couple of AI trades.
  const aiNotes = repeat ? offseasonAiMoves(state, data, year, createRng(`${seed}/offseason`)) : [];
  state.reputation = prev.reputation;
  initFranchise(state, data);
  // initFranchise drew a fresh prospect pool; academy players join it a year older and better.
  const academy = Object.fromEntries(
    (gm.academy ?? []).map((id) => {
      const p = gm.prospects![id]!;
      return [id, { ...p, age: p.age + 1, player: { ...p.player, ratings: progressRatings(p.player.ratings, progression(id, p.age, year)) } }];
    }),
  );
  state.gm!.prospects = { ...(state.gm!.prospects ?? {}), ...academy };
  const faNotes = opts.offers && Object.keys(opts.offers).length ? resolveFreeAgency(state, data, opts.offers, seed) : [];
  const draftNotes = prev.options.rules?.draft && !opts.noDraft ? runDraft(prev, prevData, state, data, opts.draftPick) : [];
  const left = gm.roster.filter((id) => !kept.includes(id)).map((id) => playerInfo(prev, prevData, id)?.handle ?? id);
  pushInbox(state, {
    date: data.season.stages[0]!.qualifiers.start,
    kind: "contract",
    title: `Off-season: ${label}`,
    body:
      `Last season: ${recap.label}, ${ordinal(recap.rank)} in points, ` +
      `${recap.goalsMet}/${recap.goalsTotal} goals. ` +
      (left.length ? `Leaving as free agents: ${left.join(", ")}. ` : "Nobody left. ") +
      (team !== gm.team ? `The franchise now plays as ${data.season.teams.find((t) => t.id === team)!.name}. ` : "") +
      (faNotes.length ? `Free agency: ${faNotes.join("; ")}. ` : "") +
      (draftNotes.length ? `Draft: ${draftNotes.join("; ")}. ` : "") +
      (aiNotes.length ? `Around the league: ${aiNotes.join("; ")}.` : ""),
  });
  achievementsAfterStep(state, data);
  return state;
}
