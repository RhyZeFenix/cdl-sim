// Zod schemas for everything under /data. The engine never touches raw JSON:
// every file goes through these on load, and bad data throws immediately.
import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const slug = z.string().regex(/^[a-z0-9-]+$/, "expected lowercase slug");
const url = z.string().url();

/** A concrete game mode. */
export const Mode = z.enum(["hp", "snd", "control", "overload"]);
export type Mode = z.infer<typeof Mode>;

/** A slot in a series' mode order. "third" resolves to the season's third mode. */
export const SlotMode = z.enum(["hp", "snd", "third"]);
export type SlotMode = z.infer<typeof SlotMode>;

export const BestOf = z.union([z.literal(5), z.literal(7), z.literal(9)]);
export type BestOf = z.infer<typeof BestOf>;

/** Every series format must clinch at (n+1)/2 and list exactly n slots. */
export const SeriesFormats = z
  .object({ bo5: z.array(SlotMode), bo7: z.array(SlotMode), bo9: z.array(SlotMode) })
  .superRefine((f, ctx) => {
    for (const [key, n] of [["bo5", 5], ["bo7", 7], ["bo9", 9]] as const) {
      if (f[key].length !== n) ctx.addIssue({ code: "custom", path: [key], message: `${key} must list ${n} maps` });
    }
  });
export type SeriesFormats = z.infer<typeof SeriesFormats>;

export const Team = z.object({
  id: slug,
  name: z.string().min(1),
  abbr: z.string().min(2).max(4),
  formerly: z.string().optional(),
});
export type Team = z.infer<typeof Team>;

export const MapPool = z
  .object({
    id: slug,
    label: z.string(),
    hp: z.array(z.string()).min(2),
    snd: z.array(z.string()).min(2),
    third: z.array(z.string()).min(1),
    note: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    for (const mode of ["hp", "snd", "third"] as const) {
      if (new Set(p[mode]).size !== p[mode].length) {
        ctx.addIssue({ code: "custom", path: [mode], message: `duplicate map in ${p.id}.${mode}` });
      }
    }
  });
export type MapPool = z.infer<typeof MapPool>;

/** Inclusive placement range -> CDL points, e.g. { from: 5, to: 6, points: 30 }. */
export const PlacementPoints = z.array(
  z.object({ from: z.number().int().min(1), to: z.number().int().min(1), points: z.number().int().min(0) }),
);
export type PlacementPoints = z.infer<typeof PlacementPoints>;

export const Tiebreaker = z.enum(["seriesWins", "seriesWinPct", "mapDiff", "h2hSeries", "mapsLost"]);
export type Tiebreaker = z.infer<typeof Tiebreaker>;

/** Bracket topologies. The engine implements each `type`; data only picks one and sets its knobs. */
export const BracketFormat = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("double-elim"),
    /** Seeds that start in Winners Round 1, in bracket order. */
    winnersSeeds: z.array(z.number().int().min(1)),
    /** Seeds that start in Losers Round 1. */
    losersSeeds: z.array(z.number().int().min(1)),
  }),
  z.object({
    type: z.literal("double-elim-playin"),
    mainSeeds: z.array(z.number().int().min(1)),
    playinSeeds: z.array(z.number().int().min(1)),
    playinSpots: z.number().int().min(1),
    eliminatedSeeds: z.array(z.number().int().min(1)),
  }),
  z.object({
    type: z.literal("proam-gsl"),
    groups: z.number().int().min(2),
    groupSize: z.number().int().min(2),
    advancePerGroup: z.number().int().min(1),
    /** Non-CDL teams invited to the event. */
    guests: z.array(z.object({ id: slug, name: z.string(), abbr: z.string() })),
  }),
  z.object({
    type: z.literal("single-elim"),
    size: z.number().int().min(2),
    byes: z.number().int().min(0),
  }),
]);
export type BracketFormat = z.infer<typeof BracketFormat>;

export const Seeding = z.discriminatedUnion("by", [
  z.object({ by: z.literal("qualifiers") }),
  z.object({ by: z.literal("qualifiers-after-week"), week: z.number().int().min(1) }),
  z.object({ by: z.literal("points-after-stage"), stage: z.number().int().min(1) }),
  z.object({ by: z.literal("season-points") }),
]);
export type Seeding = z.infer<typeof Seeding>;

export const RealResult = z.object({
  winner: slug,
  runnerUp: slug,
  score: z.string().regex(/^\d-\d$/).optional(),
});

export const LanEvent = z.object({
  name: z.string(),
  start: isoDate,
  end: isoDate,
  city: z.string().optional(),
  venue: z.string().optional(),
  host: slug.optional(),
  mapPool: slug,
  /** Length of every series except the grand final. */
  bestOf: BestOf,
  finalBestOf: BestOf,
  format: BracketFormat,
  seeding: Seeding,
  points: PlacementPoints,
  prizeUsd: z.number().int().min(0).optional(),
  realResult: RealResult.optional(),
  sources: z.array(url).min(1),
});
export type LanEvent = z.infer<typeof LanEvent>;

export const QualWeek = z.object({
  week: z.number().int().min(1),
  start: isoDate.optional(),
  end: isoDate.optional(),
  mapPool: slug,
});
export type QualWeek = z.infer<typeof QualWeek>;

export const Qualifiers = z.object({
  start: isoDate,
  end: isoDate,
  matchesPerTeam: z.number().int().min(1),
  weeks: z.array(QualWeek).min(1),
});
export type Qualifiers = z.infer<typeof Qualifiers>;

export const Stage = z.object({
  stage: z.number().int().min(1).max(4),
  qualifiers: Qualifiers,
  minor: LanEvent.nullable(),
  major: LanEvent,
});
export type Stage = z.infer<typeof Stage>;

export const ModeSettings = z.object({
  hp: z.object({ target: z.number().int(), hillSeconds: z.number().int() }),
  snd: z.object({ roundsToWin: z.number().int(), roundSeconds: z.number().int(), bombSeconds: z.number().int() }),
  control: z.object({ roundsToWin: z.number().int(), livesPerTeam: z.number().int() }).optional(),
  overload: z
    .object({ halfCap: z.number().int(), scoreCap: z.number().int(), halfSeconds: z.number().int() })
    .optional(),
});
export type ModeSettings = z.infer<typeof ModeSettings>;

export const Season = z.object({
  id: z.enum(["2024", "2025", "2026"]),
  label: z.string(),
  game: z.string(),
  cdlSeason: z.number().int(),
  thirdMode: z.enum(["control", "overload"]),
  teams: z.array(Team).length(12),
  modeSettings: ModeSettings,
  seriesFormats: SeriesFormats,
  /** Veto procedure ids (see data/veto.json) per series length. */
  veto: z.object({ bo5: slug, bo7: slug, bo9: slug }),
  points: z.object({ qualifierWin: z.number().int() }),
  tiebreakers: z.array(Tiebreaker).min(1),
  mapPools: z.array(MapPool).min(1),
  stages: z.array(Stage).length(4),
  championship: LanEvent,
  historical: z
    .object({ finalPoints: z.record(slug, z.number().int()).optional() })
    .optional(),
  /** Free-text notes on anything still unverified; shown in the UI's data page. */
  unverified: z.array(z.string()),
  sources: z.array(url).min(1),
});
export type Season = z.infer<typeof Season>;

// ---------------------------------------------------------------- veto

export const VetoStep = z.discriminatedUnion("action", [
  z.object({ action: z.literal("ban"), team: z.enum(["A", "B"]), mode: SlotMode }),
  z.object({ action: z.literal("pick"), team: z.enum(["A", "B"]), mode: SlotMode, map: z.number().int().min(1) }),
  /** The single map left in that mode's pool is played at `map`. */
  z.object({ action: z.literal("remaining"), mode: SlotMode, map: z.number().int().min(1) }),
  z.object({ action: z.literal("side"), team: z.enum(["A", "B"]), map: z.number().int().min(1) }),
]);
export type VetoStep = z.infer<typeof VetoStep>;

export const VetoProcedure = z.object({
  bestOf: BestOf,
  verified: z.boolean(),
  note: z.string().optional(),
  /**
   * When true, a ban is skipped if it would leave fewer maps in that mode than
   * the series still needs. This is how small pools (2025's 2-map Control) and
   * Bo9 (four SnD maps from a five-map pool) resolve without special cases.
   */
  skipBanIfInsufficient: z.boolean(),
  steps: z.array(VetoStep).min(1),
  sources: z.array(url),
});
export type VetoProcedure = z.infer<typeof VetoProcedure>;

export const VetoFile = z.object({ procedures: z.record(slug, VetoProcedure) });
export type VetoFile = z.infer<typeof VetoFile>;

// ---------------------------------------------------------------- rosters

export const Role = z.enum(["AR", "SMG", "flex"]);

export const Ratings = z.object({
  slaying: z.number().min(0).max(100),
  hp_obj: z.number().min(0).max(100),
  snd_iq: z.number().min(0).max(100),
  third_mode: z.number().min(0).max(100),
  clutch: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
});
export type Ratings = z.infer<typeof Ratings>;

/** Season stat line behind a player's ratings (CoD Esports Wiki aggregates). */
export const PlayerStatLine = z.object({
  maps: z.number().int(),
  kd: z.number(),
  hpKd: z.number(),
  hpTimePerMap: z.number(),
  sndKd: z.number(),
  sndOpeningNet: z.number(),
  thirdKd: z.number(),
});
export type PlayerStatLine = z.infer<typeof PlayerStatLine>;

export const Player = z.object({
  id: slug,
  handle: z.string(),
  role: Role,
  ratings: Ratings,
  /** "stats" when ratings come from the season's stat lines; otherwise the placement-based placeholder. */
  ratingSource: z.enum(["stats", "placeholder"]).default("placeholder"),
  stats: PlayerStatLine.optional(),
});
export type Player = z.infer<typeof Player>;

/** The roster a team used at one event; changes between events are implied by the diff. */
export const RosterSnapshot = z.object({
  /** First date this lineup is in effect. */
  effective: isoDate,
  event: z.string(),
  starters: z.array(slug).length(4),
  subs: z.array(slug),
  source: url,
});

export const TeamRoster = z.object({
  team: slug,
  players: z.array(Player).min(4),
  snapshots: z.array(RosterSnapshot).min(1),
  /** Map preference modifiers keyed "mode:Map" in skill units, from the team's map win rates. */
  mapMods: z.record(z.string(), z.number()).optional(),
});
export type TeamRoster = z.infer<typeof TeamRoster>;

export const RosterFile = z
  .object({
    season: z.enum(["2024", "2025", "2026"]),
    ratingsNote: z.string(),
    teams: z.array(TeamRoster),
    /** Non-CDL teams that appear at an event (2026 Pro-Am Major). */
    guests: z.array(TeamRoster).default([]),
  })
  .superRefine((r, ctx) => {
    r.teams.forEach((t, ti) => {
      const ids = new Set(t.players.map((p) => p.id));
      t.snapshots.forEach((s, si) => {
        for (const pid of [...s.starters, ...s.subs]) {
          if (!ids.has(pid)) {
            ctx.addIssue({ code: "custom", path: ["teams", ti, "snapshots", si], message: `${t.team}: unknown player ${pid}` });
          }
        }
      });
    });
  });
export type RosterFile = z.infer<typeof RosterFile>;
