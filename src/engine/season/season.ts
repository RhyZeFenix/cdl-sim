// Season pipeline: schedule → qualifier weeks → (Minor) → Major → points, ×4 → Champs.
// The state is plain JSON (save/load = JSON.stringify/parse). `advance` runs one step
// (a qualifier week or an event) and mutates the state in place; everything is
// deterministic from options.seed, so any series can be replayed from its id.
import type { LanEvent, Mode, PlacementPoints, Player, Season } from "../data/schema";
import { mapPoolFor, type PoolPhase } from "../data/pools";
import { startersOn, type SeasonData, type SeasonId } from "../data/registry";
import { createRng } from "../rng";
import { TUNING } from "../sim/tuning";
import { seriesVetoSetup, simulateSeries, type SeriesResult } from "../sim/series";
import type { MapEvent, MapResult, Side, SimPlayer, SimTeam } from "../sim/types";
import { scriptedChooser, VetoSession, type Chooser, type VetoResult } from "../sim/veto";
import { bracketPlan, runBracket, type MatchDef } from "./bracket";
import { buildQualifierSchedule, type Fixture } from "./schedule";
import { rankByPoints, rankStandings, tally, type SeriesOutcome, type StandingRow } from "./standings";
import { gmBoostFor, initFranchise, onGmSeries, onStepComplete } from "../gm/franchise";
import { contractFor, signingProblem } from "../gm/contracts";
import { DEAD_CAP_SHARE } from "../gm/values";
import type {
  CarriedPlayers,
  Contract,
  DynastyInfo,
  GmBoost,
  InboxItem,
  MoraleChange,
  OwnerGoal,
  Prep,
  TradeRecord,
} from "../gm/types";

export type RatingMode = "historical" | "randomized";

export interface SeasonOptions {
  seed: string;
  ratingMode: RatingMode;
  /** Keep full event logs for every series (default: only LAN events and the GM team). */
  keepAllEvents?: boolean;
  gmTeam?: string;
  /** Skip the regular season: play Champs only, seeded with the real Champs seeds. */
  champsOnly?: boolean;
  /** Chaos: strong per-event team form, so upsets and hot streaks are far more common. */
  chaos?: boolean;
}

export type Step =
  | { kind: "week"; stage: number; week: number }
  | { kind: "minor"; stage: number }
  | { kind: "major"; stage: number }
  | { kind: "championship" };

export type MapRecord = Omit<MapResult, "events"> & { events?: MapEvent[] };

export interface SeriesRecord {
  id: string;
  label: string;
  date: string;
  phase: PoolPhase;
  poolId: string;
  bestOf: 5 | 7 | 9;
  teams: [string, string];
  score: [number, number];
  winner: string;
  veto: VetoResult;
  maps: MapRecord[];
  hasEvents: boolean;
  /** Player ids each side fielded (absent in saves from before GM mode). */
  lineups?: [string[], string[]];
  /** The GM's veto decisions, when the user made them. */
  gmVeto?: GmVeto;
  /** What the GM's prep and morale added (replays use it to rebuild the same teams). */
  gmBoost?: GmBoost;
}

export interface GmMove {
  date: string;
  /** The stage the move was made before (5 = before Champs). */
  beforeStage: number;
  action: "sign" | "release" | "trade-in" | "trade-out";
  player: string;
}

export interface GmState {
  team: string;
  /** Everyone under contract (4-6 players). */
  roster: string[];
  /** The four who play. */
  starters: string[];
  /** When true the AI makes the GM team's veto decisions. */
  autoVeto: boolean;
  /** When true a GM series stops after each map so the user can make sub swaps. */
  pauseBetweenMaps?: boolean;
  /** Spoiler-free match day: the GM team's results stay hidden until watched or skipped. */
  spoilerFree?: boolean;
  /** GM series that have been played but not yet watched or skipped, in play order. */
  unwatched?: string[];
  moves: GmMove[];
  // ---- the sim-game layer (src/engine/gm); optional so older saves still load
  /** Focus for the next step. */
  prep?: Prep;
  /** Morale per roster player, 0-100. */
  morale?: Record<string, number>;
  moraleLog?: MoraleChange[];
  inbox?: InboxItem[];
  /** GM series already turned into morale and news. */
  processed?: string[];
  goals?: OwnerGoal[];
  /** Owner trust, 0-100. */
  trust?: number;
  /** Where the team was expected to finish (preseason strength rank). */
  expectedRank?: number;
  contracts?: Record<string, Contract>;
  /** Salary still owed to released players this season ($k). */
  deadCap?: number;
  trades?: TradeRecord[];
}

/** What the user decided for one GM series: Team A/B (if higher seed), each veto answer, and the lineup. */
export interface GmVeto {
  teamA?: Side;
  answers: string[];
  /** Lineup for the first map (and the veto). */
  lineup: string[];
  /** Sub swaps: the GM lineup per map slot. A slot without an entry keeps the previous map's lineup. */
  mapLineups?: Record<number, string[]>;
}

/** How a finished map went for the GM team, shown when deciding the next map's lineup. */
export interface PlayedMapSummary {
  slot: number;
  mode: Mode;
  map: string;
  score: [number, number];
  winner: Side;
  gmLines: { player: string; kills: number; deaths: number }[];
}

/** A GM series stopped between maps so the user can sub players in or out. */
export interface BetweenMaps {
  nextSlot: number;
  nextMode: Mode;
  nextMap: string;
  /** Series score so far (side 0 first). */
  score: [number, number];
  played: PlayedMapSummary[];
  /** The lineup that played the last map. */
  lineup: string[];
}

export interface SeriesSpec {
  id: string;
  label: string;
  date: string;
  phase: PoolPhase;
  bestOf: 5 | 7 | 9;
  teams: [string, string];
  lan: boolean;
  /** Fixed lineups (replays); otherwise resolved from rosters on the date. */
  lineups?: [string[], string[]];
  /** The GM side's prep and morale boost (replays pass the stored one). */
  boost?: GmBoost;
}

export interface PendingSeries {
  spec: SeriesSpec;
  gmSide: Side;
  /** Set when the series is mid-way and waiting for the next map's lineup; otherwise the veto is waiting. */
  between?: BetweenMaps;
}

export const GM_ROSTER_MIN = 4;
export const GM_ROSTER_MAX = 6;

export interface EventMatch {
  def: MatchDef;
  seriesId: string;
  teams: [string, string];
  winner: string;
  score: [number, number];
}

export interface EventRecord {
  kind: "minor" | "major" | "championship";
  stage?: number;
  name: string;
  /** seeds[i] is seed i+1. */
  seeds: string[];
  matches: EventMatch[];
  placements: Record<string, [number, number]>;
  /** CDL points awarded at this event. */
  points: Record<string, number>;
}

export interface PointsSnapshot {
  label: string;
  date: string;
  points: Record<string, number>;
}

export interface SeasonState {
  version: 1;
  seasonId: SeasonId;
  options: SeasonOptions;
  steps: Step[];
  next: number;
  /** schedule[stage-1][week-1] */
  schedule: Fixture[][][];
  series: Record<string, SeriesRecord>;
  /** Qualifier series ids per stage. */
  qualifiers: string[][];
  events: EventRecord[];
  points: Record<string, number>;
  pointsHistory: PointsSnapshot[];
  gm?: GmState;
  /** GM veto decisions submitted for series not yet played. */
  gmVetoes?: Record<string, GmVeto>;
  /** Set when a step stopped to wait for the GM's veto. */
  pending?: PendingSeries;
  /** AI rosters changed by trades: the team's players in lineup order (starters first). */
  aiRosters?: Record<string, string[]>;
  /** Dynasty: players kept from earlier seasons, with their progressed ratings. */
  carried?: CarriedPlayers;
  /** Dynasty seasons past the real data: rating change per player since the data season. */
  ratingAdj?: Record<string, number>;
  dynasty?: DynastyInfo;
}

/** Thrown inside a step to stop at a GM series; the step resumes on the next advance. */
class PauseForGm extends Error {}

// ------------------------------------------------------------------ setup

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekDate(season: Season, stage: number, week: number): string {
  const st = season.stages[stage - 1]!;
  const w = st.qualifiers.weeks[week - 1]!;
  if (w.start) return w.start;
  const d = addDays(st.qualifiers.start, 7 * (week - 1));
  return d > st.qualifiers.end ? st.qualifiers.end : d;
}

/** After which qualifier week the stage's Minor is played. */
function minorAfterWeek(season: Season, stage: number): number {
  const st = season.stages[stage - 1]!;
  const minor = st.minor!;
  if (minor.seeding.by === "qualifiers-after-week") return minor.seeding.week;
  const weeks = st.qualifiers.weeks;
  if (weeks.every((w) => w.end)) return weeks.filter((w) => w.end! < minor.start).length;
  return Math.floor(weeks.length / 2);
}

export function seasonSteps(season: Season): Step[] {
  const steps: Step[] = [];
  for (const st of season.stages) {
    const n = st.qualifiers.weeks.length;
    const minorAt = st.minor ? minorAfterWeek(season, st.stage) : -1;
    for (let w = 1; w <= n; w++) {
      steps.push({ kind: "week", stage: st.stage, week: w });
      if (w === minorAt) steps.push({ kind: "minor", stage: st.stage });
    }
    if (minorAt === 0) steps.splice(steps.length - n, 0, { kind: "minor", stage: st.stage });
    steps.push({ kind: "major", stage: st.stage });
  }
  steps.push({ kind: "championship" });
  return steps;
}

export function createSeason(data: SeasonData, options: SeasonOptions): SeasonState {
  const { season } = data;
  const root = createRng(options.seed);
  const teamIds = season.teams.map((t) => t.id);
  if (options.champsOnly && !season.historical?.champsSeeds) throw new Error(`${season.id}: no real Champs seeds for a Champs-only season`);
  // Champs-only starts from the real final points where they are known.
  const realPoints = options.champsOnly ? season.historical?.finalPoints : undefined;
  const points = Object.fromEntries(teamIds.map((t) => [t, realPoints?.[t] ?? 0]));
  let gm: GmState | undefined;
  if (options.gmTeam) {
    if (!teamIds.includes(options.gmTeam)) throw new Error(`${season.id}: unknown GM team ${options.gmTeam}`);
    const starters = startersOn(data.rosters, options.gmTeam, season.stages[0]!.qualifiers.start);
    gm = { team: options.gmTeam, roster: [...starters], starters: [...starters], autoVeto: false, pauseBetweenMaps: false, spoilerFree: true, unwatched: [], moves: [] };
  }
  const state: SeasonState = {
    gm,
    gmVetoes: {},
    version: 1,
    seasonId: season.id,
    options,
    steps: options.champsOnly ? [{ kind: "championship" }] : seasonSteps(season),
    next: 0,
    schedule: season.stages.map((st) => buildQualifierSchedule(st, teamIds, root.fork(`schedule-s${st.stage}`))),
    series: {},
    qualifiers: season.stages.map(() => []),
    events: [],
    points,
    pointsHistory: [{ label: "Start", date: season.stages[0]!.qualifiers.start, points: { ...points } }],
  };
  if (gm) initFranchise(state, data);
  return state;
}

export const isDone = (s: SeasonState) => s.next >= s.steps.length;
export const nextStep = (s: SeasonState): Step | undefined => s.steps[s.next];

// ------------------------------------------------------------------ series

function ratingTransform(team: SimTeam, mode: RatingMode): SimTeam {
  if (mode === "historical") return team;
  const squash = (x: number) => 80 + 0.35 * (x - 80);
  return {
    ...team,
    players: team.players.map((p) => ({
      ...p,
      ratings: Object.fromEntries(Object.entries(p.ratings).map(([k, v]) => [k, squash(v)])) as typeof p.ratings,
    })),
  };
}

const playerIndexCache = new WeakMap<SeasonData, Map<string, Player>>();

/** Every player in the season's roster file (CDL teams and guests), by id. */
export function playerIndex(data: SeasonData): Map<string, Player> {
  let idx = playerIndexCache.get(data);
  if (!idx) {
    idx = new Map();
    for (const t of [...data.rosters.teams, ...data.rosters.guests]) for (const p of t.players) idx.set(p.id, p);
    playerIndexCache.set(data, idx);
  }
  return idx;
}

export const isReplacement = (id: string) => id.startsWith("repl-");

/**
 * A player as this season sees them: a dynasty's carried player (with progressed
 * ratings), else the season data with any progression since the data season.
 */
export function playerInfo(state: SeasonState, data: SeasonData, id: string): Player | undefined {
  const carried = state.carried?.[id];
  if (carried) return carried;
  const p = playerIndex(data).get(id);
  const adj = state.ratingAdj?.[id];
  if (!p || !adj) return p;
  const f = (v: number) => Math.max(50, Math.min(99, Math.round(v + adj)));
  const r = p.ratings;
  return { ...p, ratings: { ...r, slaying: f(r.slaying), hp_obj: f(r.hp_obj), snd_iq: f(r.snd_iq), third_mode: f(r.third_mode), clutch: f(r.clutch) } };
}

function simPlayer(state: SeasonState, data: SeasonData, id: string): SimPlayer {
  const p = playerInfo(state, data, id);
  if (p) return { id: p.id, handle: p.handle, ratings: p.ratings };
  if (!isReplacement(id)) throw new Error(`unknown player ${id}`);
  const r = 72;
  return {
    id,
    handle: "Replacement",
    ratings: { slaying: r, hp_obj: r, snd_iq: r, third_mode: r, clutch: r, consistency: r },
  };
}

function teamInfo(data: SeasonData, teamId: string) {
  const info =
    data.season.teams.find((t) => t.id === teamId) ??
    data.season.stages
      .flatMap((s) => (s.major.format.type === "proam-gsl" ? s.major.format.guests : []))
      .find((g) => g.id === teamId);
  if (!info) throw new Error(`${data.season.id}: unknown team ${teamId}`);
  return info;
}

/**
 * Who a team fields on a date. The GM team uses the GM's starters. An AI team whose
 * starter is under contract with the GM falls back to another of its players, or a
 * replacement-level player.
 */
export function teamLineup(state: SeasonState, data: SeasonData, teamId: string, date: string): string[] {
  const gm = state.gm;
  if (gm && teamId === gm.team) return [...gm.starters];
  // Players this team can't field: the GM's, and anyone a trade sent to another AI team.
  const owned = new Set(gm?.roster ?? []);
  for (const [t, ids] of Object.entries(state.aiRosters ?? {})) if (t !== teamId) for (const id of ids) owned.add(id);
  const traded = state.aiRosters?.[teamId];
  if (traded) {
    const ids = traded.filter((id) => !owned.has(id)).slice(0, 4);
    while (ids.length < 4) ids.push(`repl-${teamId}-${ids.length + 1}`);
    return ids;
  }
  const starters = startersOn(data.rosters, teamId, date);
  if (!owned.size) return starters;
  const roster = [...data.rosters.teams, ...data.rosters.guests].find((t) => t.team === teamId)!;
  const bench = roster.players.map((p) => p.id).filter((id) => !starters.includes(id) && !owned.has(id));
  return starters.map((id, i) => (owned.has(id) ? (bench.shift() ?? `repl-${teamId}-${i + 1}`) : id));
}

/** Which "weekend" a series belongs to: a qualifier week or a LAN/online event. */
function formKey(phase: PoolPhase): string {
  switch (phase.kind) {
    case "qualifiers":
      return `s${phase.stage}w${phase.week}`;
    case "minor":
    case "major":
      return `s${phase.stage}-${phase.kind}`;
    case "championship":
      return "champs";
  }
}

/** A team's form for one weekend: fixed by the season seed, so replays and GM vetoes agree. */
export function eventForm(state: SeasonState, teamId: string, phase: PoolPhase): number {
  const sd = state.options.chaos ? TUNING.chaosFormSd : TUNING.eventFormSd;
  if (!sd) return 0;
  return createRng(state.options.seed).fork(`form/${formKey(phase)}/${teamId}`).normal(0, sd);
}

function buildTeam(state: SeasonState, data: SeasonData, teamId: string, lineup: string[], phase: PoolPhase, boost?: GmBoost): SimTeam {
  const info = teamInfo(data, teamId);
  const mapMods = [...data.rosters.teams, ...data.rosters.guests].find((t) => t.team === teamId)?.mapMods;
  const team: SimTeam = {
    id: teamId,
    name: info.name,
    abbr: info.abbr,
    players: lineup.map((id) => {
      const p = simPlayer(state, data, id);
      const f = boost?.players?.[id];
      return f ? { ...p, form: f } : p;
    }),
    mapMods,
    form: eventForm(state, teamId, phase) + (boost?.form ?? 0),
    prep: boost?.prep,
  };
  return ratingTransform(team, state.options.ratingMode);
}

const gmSideOf = (state: SeasonState, teams: [string, string]): Side | null =>
  state.gm ? (teams[0] === state.gm.team ? 0 : teams[1] === state.gm.team ? 1 : null) : null;

function runSeries(
  state: SeasonState,
  data: SeasonData,
  spec: SeriesSpec,
  gmVeto?: GmVeto,
  replay = false,
): SeriesResult & { lineups: [string[], string[]]; mapLineups: Record<number, string[]> } {
  const gmSide = gmSideOf(state, spec.teams);
  const lineups: [string[], string[]] = spec.lineups ?? [
    gmSide === 0 && gmVeto ? gmVeto.lineup : teamLineup(state, data, spec.teams[0], spec.date),
    gmSide === 1 && gmVeto ? gmVeto.lineup : teamLineup(state, data, spec.teams[1], spec.date),
  ];
  const choosers: [Chooser?, Chooser?] = [undefined, undefined];
  if (gmVeto && gmSide !== null) choosers[gmSide] = scriptedChooser(gmVeto.answers);

  // The GM side plays with its prep and morale boost.
  const build = (side: Side, ids: string[]) =>
    buildTeam(state, data, spec.teams[side], ids, spec.phase, side === gmSide ? spec.boost : undefined);

  // Sub swaps: the GM side's lineup can change between maps.
  const mapLineups: Record<number, string[]> = {};
  let teamsForMap: Parameters<typeof simulateSeries>[0]["teamsForMap"];
  if (gmVeto && gmSide !== null) {
    let current = lineups[gmSide];
    teamsForMap = (vm, sofar) => {
      if (sofar.maps.length > 0) {
        const planned = gmVeto.mapLineups?.[vm.slot];
        if (planned) current = planned;
        else if (!replay && state.gm?.pauseBetweenMaps) {
          const lo = gmSide * 4;
          state.pending = {
            spec,
            gmSide,
            between: {
              nextSlot: vm.slot,
              nextMode: vm.mode,
              nextMap: vm.map,
              score: sofar.score,
              lineup: [...current],
              played: sofar.maps.map((m) => ({
                slot: m.slot,
                mode: m.mode,
                map: m.map,
                score: m.score,
                winner: m.winner,
                gmLines: m.lineup.slice(lo, lo + 4).map((player, i) => ({
                  player,
                  kills: m.box[lo + i]!.kills,
                  deaths: m.box[lo + i]!.deaths,
                })),
              })),
            },
          };
          throw new PauseForGm();
        }
      }
      mapLineups[vm.slot] = [...current];
      const ids: [string[], string[]] = gmSide === 0 ? [current, lineups[1]] : [lineups[0], current];
      return [build(0, ids[0]), build(1, ids[1])];
    };
  }

  const r = simulateSeries({
    teamsForMap,
    teams: [build(0, lineups[0]), build(1, lineups[1])],
    bestOf: spec.bestOf,
    season: data.season,
    veto: data.veto,
    pool: mapPoolFor(data.season, spec.phase),
    rng: createRng(state.options.seed).fork(spec.id),
    choosers,
    teamA: gmVeto && gmSide === 0 ? gmVeto.teamA : undefined,
  });
  return { ...r, lineups, mapLineups };
}

/**
 * Plays a series, or returns it if it was already played (so an interrupted step can
 * re-run safely). Stops the step at a GM series that has no veto decisions yet.
 */
function playSeries(state: SeasonState, data: SeasonData, spec: SeriesSpec): SeriesRecord {
  const existing = state.series[spec.id];
  if (existing) return existing;
  const gm = state.gm;
  const gmSide = gmSideOf(state, spec.teams);
  if (gm && gmSide !== null) spec = { ...spec, boost: gmBoostFor(state, data, spec.phase) };
  let gmVeto: GmVeto | undefined;
  if (gm && gmSide !== null && !gm.autoVeto) {
    gmVeto = state.gmVetoes?.[spec.id];
    if (!gmVeto) {
      state.pending = { spec, gmSide };
      throw new PauseForGm();
    }
  }
  const r = runSeries(state, data, spec, gmVeto);
  const keep = !!state.options.keepAllEvents || spec.lan || gmSide !== null;
  const rec: SeriesRecord = {
    id: spec.id,
    label: spec.label,
    date: spec.date,
    phase: spec.phase,
    poolId: mapPoolFor(data.season, spec.phase).id,
    bestOf: spec.bestOf,
    teams: spec.teams,
    score: r.score,
    winner: spec.teams[r.winner],
    veto: r.veto,
    maps: r.maps.map((m) => (keep ? m : { ...m, events: undefined })),
    hasEvents: keep,
    lineups: r.lineups,
    // Keep every map's lineup so replays never need to ask again.
    gmVeto: gmVeto ? { ...gmVeto, mapLineups: r.mapLineups } : undefined,
    gmBoost: spec.boost,
  };
  if (gmVeto) delete state.gmVetoes![spec.id];
  state.series[spec.id] = rec;
  if (gm && gmSide !== null && gm.spoilerFree) gm.unwatched = [...(gm.unwatched ?? []), spec.id];
  if (gm && gmSide !== null) onGmSeries(state, data, rec);
  return rec;
}

/** Re-simulates a stored series with full events (identical to the original). */
export function replaySeries(state: SeasonState, data: SeasonData, id: string): SeriesResult {
  const rec = state.series[id];
  if (!rec) throw new Error(`no series ${id}`);
  const spec: SeriesSpec = {
    id: rec.id,
    label: rec.label,
    date: rec.date,
    phase: rec.phase,
    bestOf: rec.bestOf,
    teams: rec.teams,
    lan: false,
    lineups: rec.lineups,
    boost: rec.gmBoost,
  };
  return runSeries(state, data, spec, rec.gmVeto, true);
}

// ------------------------------------------------------------------ GM mode

export const isPaused = (s: SeasonState) => !!s.pending;

/** The date the next step is played (for roster availability). */
export function nextStepDate(state: SeasonState, data: SeasonData): string {
  const step = nextStep(state);
  const { season } = data;
  if (!step) return season.championship.end;
  if (step.kind === "week") return weekDate(season, step.stage, step.week);
  if (step.kind === "championship") return season.championship.start;
  return season.stages[step.stage - 1]![step.kind]!.start;
}

/** Signings and releases are allowed before the season and between stages. */
export function gmCanMakeMoves(state: SeasonState): boolean {
  if (!state.gm || state.pending) return false;
  if (!nextStep(state)) return false;
  if (state.next === 0) return true;
  return state.steps[state.next - 1]!.kind === "major";
}

/** Players not under contract with the GM and not starting for any other team on the next step's date. */
export function freeAgents(state: SeasonState, data: SeasonData): string[] {
  if (!state.gm) return [];
  const date = nextStepDate(state, data);
  const taken = new Set(state.gm.roster);
  for (const ids of Object.values(state.aiRosters ?? {})) for (const id of ids) taken.add(id);
  for (const t of data.season.teams) {
    if (t.id === state.gm.team) continue;
    for (const id of teamLineup(state, data, t.id, date)) taken.add(id);
  }
  return [...playerIndex(data).keys()].filter((id) => !taken.has(id)).sort();
}

function stageOfNext(state: SeasonState): number {
  const step = nextStep(state);
  return step && "stage" in step ? step.stage : 5;
}

/** Signs a free agent on a contract of `years` seasons at their asking salary. */
export function gmSign(state: SeasonState, data: SeasonData, playerId: string, years = 2): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("roster moves are only allowed between stages");
  if (gm.roster.length >= GM_ROSTER_MAX) throw new Error(`roster is full (${GM_ROSTER_MAX} players)`);
  if (!freeAgents(state, data).includes(playerId)) throw new Error(`${playerId} is not a free agent`);
  const contract = contractFor(state, data, playerId, years);
  const problem = signingProblem(state, contract.salary);
  if (problem) throw new Error(problem);
  gm.roster.push(playerId);
  gm.contracts = { ...(gm.contracts ?? {}), [playerId]: contract };
  gm.morale = { ...(gm.morale ?? {}), [playerId]: 70 };
  gm.moves.push({ date: nextStepDate(state, data), beforeStage: stageOfNext(state), action: "sign", player: playerId });
}

export function gmRelease(state: SeasonState, data: SeasonData, playerId: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("roster moves are only allowed between stages");
  if (!gm.roster.includes(playerId)) throw new Error(`${playerId} is not on the roster`);
  if (gm.roster.length <= GM_ROSTER_MIN) throw new Error(`a roster needs at least ${GM_ROSTER_MIN} players`);
  gm.roster = gm.roster.filter((p) => p !== playerId);
  // Part of the salary stays on the books for the rest of the season.
  const contract = gm.contracts?.[playerId];
  if (contract) {
    gm.deadCap = (gm.deadCap ?? 0) + Math.round(contract.salary * DEAD_CAP_SHARE);
    delete gm.contracts![playerId];
  }
  if (gm.starters.includes(playerId)) {
    gm.starters = gm.starters.filter((p) => p !== playerId);
    gm.starters.push(gm.roster.find((p) => !gm.starters.includes(p))!);
  }
  gm.moves.push({ date: nextStepDate(state, data), beforeStage: stageOfNext(state), action: "release", player: playerId });
}

export function gmSetStarters(state: SeasonState, starters: string[]): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (starters.length !== 4 || new Set(starters).size !== 4) throw new Error("pick exactly four different starters");
  for (const p of starters) if (!gm.roster.includes(p)) throw new Error(`${p} is not on the roster`);
  gm.starters = [...starters];
}

export function gmSetAutoVeto(state: SeasonState, on: boolean): void {
  if (!state.gm) throw new Error("not in GM mode");
  state.gm.autoVeto = on;
}

export interface GmVetoContext {
  session: VetoSession;
  gmSide: Side;
  teamA: Side;
  teams: [SimTeam, SimTeam];
  spec: SeriesSpec;
}

/**
 * Starts the interactive veto for the paused GM series. The opponent's decisions come
 * from the same AI the simulation uses, so the played series matches what the user saw.
 * `teamA` is the GM's Team A/B choice and only applies when the GM is the higher seed.
 */
export function gmVetoSession(state: SeasonState, data: SeasonData, lineup: string[], teamA?: Side): GmVetoContext {
  const p = state.pending;
  if (!p) throw new Error("no GM series is waiting");
  if (p.between) throw new Error("the series is waiting for a lineup between maps, not a veto");
  const { spec, gmSide } = p;
  const opp: Side = gmSide === 0 ? 1 : 0;
  const ids: [string[], string[]] = [
    gmSide === 0 ? lineup : teamLineup(state, data, spec.teams[0], spec.date),
    gmSide === 1 ? lineup : teamLineup(state, data, spec.teams[1], spec.date),
  ];
  const teams: [SimTeam, SimTeam] = [
    buildTeam(state, data, spec.teams[0], ids[0], spec.phase),
    buildTeam(state, data, spec.teams[1], ids[1], spec.phase),
  ];
  const setup = seriesVetoSetup(teams, createRng(state.options.seed).fork(spec.id));
  const a: Side = gmSide === 0 ? (teamA ?? 0) : setup.aiTeamA;
  const choosers: [Chooser | null, Chooser | null] = [null, null];
  choosers[opp] = setup.ai[opp];
  const session = new VetoSession(
    { proc: data.veto[`bo${spec.bestOf}`], season: data.season, pool: mapPoolFor(data.season, spec.phase), teamA: a },
    choosers,
  );
  return { session, gmSide, teamA: a, teams, spec };
}

/** True while the GM team has a played series the user hasn't watched or skipped. */
export const isMatchDay = (s: SeasonState) => !!s.gm?.unwatched?.length;

/** Marks a GM series as watched (or skipped): its result may now be shown everywhere. */
export function gmMarkWatched(state: SeasonState, seriesId: string): void {
  if (!state.gm) throw new Error("not in GM mode");
  state.gm.unwatched = (state.gm.unwatched ?? []).filter((id) => id !== seriesId);
}

export function gmSetSpoilerFree(state: SeasonState, on: boolean): void {
  if (!state.gm) throw new Error("not in GM mode");
  state.gm.spoilerFree = on;
  if (!on) state.gm.unwatched = [];
}

export function gmSetPauseBetweenMaps(state: SeasonState, on: boolean): void {
  if (!state.gm) throw new Error("not in GM mode");
  state.gm.pauseBetweenMaps = on;
}

/**
 * Sets the GM lineup for the next map of a series stopped between maps (or, with
 * `restOfSeries`, for every remaining map). The next advance resumes the series.
 */
export function submitGmMapLineup(state: SeasonState, lineup: string[], restOfSeries = false): void {
  const p = state.pending;
  const gm = state.gm;
  if (!p?.between) throw new Error("no GM series is waiting between maps");
  if (!gm) throw new Error("not in GM mode");
  if (lineup.length !== 4 || new Set(lineup).size !== 4 || lineup.some((id) => !gm.roster.includes(id))) {
    throw new Error("the lineup must be four players from the GM roster");
  }
  const veto = state.gmVetoes?.[p.spec.id];
  if (!veto) throw new Error("missing veto for the paused series");
  const last = restOfSeries ? p.spec.bestOf : p.between.nextSlot;
  const planned = { ...(veto.mapLineups ?? {}) };
  for (let slot = p.between.nextSlot; slot <= last; slot++) planned[slot] = [...lineup];
  veto.mapLineups = planned;
  state.pending = undefined;
}

/** Stores the GM's decisions for the paused series; the next advance plays it. */
export function submitGmVeto(state: SeasonState, veto: GmVeto): void {
  const p = state.pending;
  const gm = state.gm;
  if (!p) throw new Error("no GM series is waiting");
  if (!gm) throw new Error("not in GM mode");
  if (veto.lineup.length !== 4 || new Set(veto.lineup).size !== 4 || veto.lineup.some((id) => !gm.roster.includes(id))) {
    throw new Error("the veto lineup must be four players from the GM roster");
  }
  state.gmVetoes = { ...(state.gmVetoes ?? {}), [p.spec.id]: veto };
  state.pending = undefined;
}

// ------------------------------------------------------------------ standings

const outcome = (r: SeriesRecord): SeriesOutcome => ({ teams: r.teams, score: r.score });

/** Qualifier standings for a stage, optionally through a given week and without some series (spoilers). */
export function qualifierStandings(
  state: SeasonState,
  data: SeasonData,
  stage: number,
  throughWeek = Infinity,
  exclude?: Set<string>,
): StandingRow[] {
  const results = state.qualifiers[stage - 1]!
    .map((id) => state.series[id]!)
    .filter((r) => r.phase.kind === "qualifiers" && r.phase.week <= throughWeek && !exclude?.has(r.id))
    .map(outcome);
  const teams = data.season.teams.map((t) => t.id);
  return rankStandings(teams, results, data.season.tiebreakers, createRng(state.options.seed).fork(`tb-s${stage}-w${throughWeek}`));
}

export interface PointsRow extends StandingRow {
  points: number;
}

/** CDL points table with qualifier series/map records. */
export function pointsTable(
  state: SeasonState,
  data: SeasonData,
  points = state.points,
  exclude?: Set<string>,
): PointsRow[] {
  const quals = state.qualifiers
    .flat()
    .filter((id) => !exclude?.has(id))
    .map((id) => outcome(state.series[id]!));
  const teams = data.season.teams.map((t) => t.id);
  const rows = tally(teams, quals);
  const order = rankByPoints(teams, points, quals, createRng(state.options.seed).fork(`points-${state.next}`));
  return order.map((t) => ({ ...rows.get(t)!, points: points[t] ?? 0 }));
}

function placementPoints(table: PlacementPoints, place: number): number {
  return table.find((r) => place >= r.from && place <= r.to)?.points ?? 0;
}

function snapshot(state: SeasonState, label: string, date: string) {
  state.pointsHistory.push({ label, date, points: { ...state.points } });
}

// ------------------------------------------------------------------ events

function eventSeeds(state: SeasonState, data: SeasonData, ev: LanEvent, stage: number | undefined, kind: EventRecord["kind"]): string[] {
  const { season } = data;
  const s = ev.seeding;
  let order: string[];
  switch (s.by) {
    case "qualifiers":
      order = qualifierStandings(state, data, stage!).map((r) => r.team);
      break;
    case "qualifiers-after-week":
      order = qualifierStandings(state, data, stage!, s.week).map((r) => r.team);
      break;
    case "points-after-stage": {
      const snap = state.pointsHistory.find((p) => p.label === season.stages[s.stage - 1]!.major.name);
      if (!snap) throw new Error(`no points snapshot after stage ${s.stage}`);
      order = pointsTable(state, data, snap.points).map((r) => r.team);
      break;
    }
    case "season-points":
      if (state.options.champsOnly && season.historical?.champsSeeds) {
        order = [...season.historical.champsSeeds];
        break;
      }
      order = pointsTable(state, data).map((r) => r.team);
      break;
  }
  if (ev.format.type === "proam-gsl") {
    const rng = createRng(state.options.seed).fork(`guests-s${stage}`);
    const guests = [...ev.format.guests.map((g) => g.id)].sort((a, b) => a.localeCompare(b));
    for (let i = guests.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [guests[i], guests[j]] = [guests[j]!, guests[i]!];
    }
    order = [...order, ...guests];
  }
  if (kind === "championship") {
    const size = ev.format.type === "double-elim" ? ev.format.winnersSeeds.length + ev.format.losersSeeds.length : 8;
    order = order.slice(0, size);
  }
  return order;
}

function runEvent(state: SeasonState, data: SeasonData, kind: EventRecord["kind"], stage?: number): EventRecord {
  const { season } = data;
  const ev = kind === "championship" ? season.championship : season.stages[stage! - 1]![kind]!;
  if (!ev) throw new Error(`stage ${stage} has no ${kind}`);
  const seeds = eventSeeds(state, data, ev, stage, kind);
  const plan = bracketPlan(ev.format, ev.bestOf, ev.finalBestOf);
  const phase: PoolPhase = kind === "championship" ? { kind: "championship" } : { kind, stage: stage! };
  const prefix = kind === "championship" ? "champs" : `s${stage}-${kind}`;
  const run = runBracket(plan, seeds, (def, teams) => {
    const rec = playSeries(state, data, {
      id: `${prefix}-${def.id}`,
      label: `${ev.name} · ${def.label}`,
      date: ev.start,
      phase,
      bestOf: def.bestOf,
      teams,
      lan: kind !== "minor",
    });
    return { seriesId: rec.id, score: rec.score };
  });

  const cdl = new Set(season.teams.map((t) => t.id));
  const points: Record<string, number> = {};
  for (const [team, [from]] of Object.entries(run.placements)) {
    if (!cdl.has(team)) continue;
    points[team] = placementPoints(ev.points, from);
    state.points[team] = (state.points[team] ?? 0) + points[team]!;
  }
  const record: EventRecord = {
    kind,
    stage,
    name: ev.name,
    seeds,
    matches: run.matches.map((m) => ({ def: m.def, seriesId: m.seriesId, teams: m.teams, winner: m.winner, score: m.score })),
    placements: run.placements,
    points,
  };
  state.events.push(record);
  snapshot(state, ev.name, ev.end);
  return record;
}

// ------------------------------------------------------------------ stepping

/**
 * Runs the next step. Returns the step that ran, or undefined if the season is over or
 * the step stopped at a GM series waiting for a veto (see `state.pending`). A stopped
 * step keeps the series it already played and picks up from there next time.
 */
export function advance(state: SeasonState, data: SeasonData): Step | undefined {
  const step = nextStep(state);
  if (!step || state.pending) return undefined;
  const { season } = data;
  try {
    switch (step.kind) {
      case "week": {
        const date = weekDate(season, step.stage, step.week);
        for (const fx of state.schedule[step.stage - 1]![step.week - 1]!) {
          const isNew = !state.series[fx.id];
          const rec = playSeries(state, data, {
            id: fx.id,
            label: `Stage ${step.stage} Qualifiers · Week ${step.week}`,
            date,
            phase: { kind: "qualifiers", stage: step.stage, week: step.week },
            bestOf: 5,
            teams: fx.teams,
            lan: false,
          });
          if (!isNew) continue;
          state.qualifiers[step.stage - 1]!.push(rec.id);
          state.points[rec.winner] = (state.points[rec.winner] ?? 0) + season.points.qualifierWin;
        }
        snapshot(state, `S${step.stage} W${step.week}`, date);
        break;
      }
      case "minor":
      case "major":
        runEvent(state, data, step.kind, step.stage);
        break;
      case "championship":
        runEvent(state, data, "championship");
        break;
    }
  } catch (e) {
    if (e instanceof PauseForGm) return undefined;
    throw e;
  }
  state.next++;
  if (state.gm) onStepComplete(state, data, step);
  return step;
}

/** Runs steps until the current stage's Major (or Champs) has been played, or a GM veto is needed. */
export function advanceStage(state: SeasonState, data: SeasonData): void {
  while (!isDone(state)) {
    const s = advance(state, data);
    if (!s || s.kind === "major" || s.kind === "championship") return;
  }
}

export function advanceSeason(state: SeasonState, data: SeasonData): void {
  while (!isDone(state) && advance(state, data));
}

// ------------------------------------------------------------------ summary

export interface PlayerSeasonLine {
  player: string;
  team: string;
  maps: number;
  kills: number;
  deaths: number;
  kd: number;
}

export interface SeasonSummary {
  champion?: string;
  runnerUp?: string;
  finalScore?: [number, number];
  mvp?: PlayerSeasonLine;
  eventWinners: { name: string; stage?: number; kind: EventRecord["kind"]; winner: string; runnerUp: string; score: [number, number] }[];
  finalPoints: PointsRow[];
}

/** K/D lines for every player across a set of series (from stored box scores). */
export function playerLines(state: SeasonState, ids: string[]): PlayerSeasonLine[] {
  const acc = new Map<string, PlayerSeasonLine>();
  for (const id of ids) {
    const r = state.series[id]!;
    for (const m of r.maps) {
      m.lineup.forEach((pid, i) => {
        const team = r.teams[i < 4 ? 0 : 1];
        const line = acc.get(pid) ?? { player: pid, team, maps: 0, kills: 0, deaths: 0, kd: 0 };
        line.maps++;
        line.kills += m.box[i]!.kills;
        line.deaths += m.box[i]!.deaths;
        line.team = team;
        acc.set(pid, line);
      });
    }
  }
  for (const l of acc.values()) l.kd = l.kills / Math.max(1, l.deaths);
  return [...acc.values()].sort((a, b) => b.kd - a.kd);
}

export function summarize(state: SeasonState, data: SeasonData): SeasonSummary {
  const eventWinners = state.events.map((e) => {
    const final = e.matches[e.matches.length - 1]!;
    return {
      name: e.name,
      stage: e.stage,
      kind: e.kind,
      winner: final.winner,
      runnerUp: final.winner === final.teams[0] ? final.teams[1] : final.teams[0],
      score: (final.winner === final.teams[0] ? final.score : [final.score[1], final.score[0]]) as [number, number],
    };
  });
  const champs = state.events.find((e) => e.kind === "championship");
  const champWin = eventWinners.find((e) => e.kind === "championship");
  let mvp: PlayerSeasonLine | undefined;
  if (champs) {
    const lines = playerLines(state, champs.matches.map((m) => m.seriesId));
    const minMaps = Math.max(1, Math.floor(Math.max(...lines.map((l) => l.maps)) / 2));
    mvp = lines.find((l) => l.maps >= minMaps);
  }
  return {
    champion: champWin?.winner,
    runnerUp: champWin?.runnerUp,
    finalScore: champWin?.score,
    mvp,
    eventWinners,
    finalPoints: pointsTable(state, data),
  };
}
