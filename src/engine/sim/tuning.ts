// Every knob the calibration script tunes. Skill values are ratings / 100.
// duelK, modeDuelScale, catchUp and overload.gapSecs were set by the backtest against
// real 2024-2026 results (docs/backtest.md); rerun `npm run backtest` after changing them.
export const TUNING = {
  /** Logit slope of a 1v1 gunfight on skill difference. */
  duelK: 2.0,
  /** Per-mode multiplier on duelK: modes with fewer gunfights per map need a steeper curve for team edges to show. */
  modeDuelScale: { hp: 1, snd: 2.2, control: 1, overload: 1 },
  /** Logit bonus per extra player alive on your side. */
  manAdvantage: 0.3,
  /** Per-map form noise for a player with 0 consistency (scaled down as consistency rises). */
  formSd: 0.1,
  teamFormSd: 0.05,
  /** Spread of a team's form for one whole series (skill units), so maps in a series hang together. */
  seriesFormSd: 0,
  /** Spread of a team's form per event / qualifier week (skill units); set by the backtest. */
  eventFormSd: 0,
  /** Per-event form used when a season is started with Chaos on (hot and cold weekends, more upsets). */
  chaosFormSd: 0.04,
  /** Selection weight for who takes the next gunfight: exp(engageK * skill). */
  engageK: 3,
  /** Who takes the next fight also scales with each player's real fight share to this power (0 = off). */
  // 2: the sim's spread of fights per player matches the real one, and event log loss improved in all three seasons.
  fightShareExp: 2,
  /** LAN fatigue: skill lost per series a team has already played at a Major or Champs, past the first few. */
  lanFatigue: 0,
  lanFatigueFree: 3,
  /** Stat weights per mode: [slaying, mode stat]. */
  weights: { hp: [0.65, 0.35], snd: [0.55, 0.45], control: [0.6, 0.4], overload: [0.6, 0.4] },
  /**
   * Catch-up: logit bonus for the team behind on the map, per unit of deficit (HP: per 50
   * points; SnD/Control: per round), capped. Keeps maps close while team edges still show
   * over a season, as real CDL results do.
   */
  catchUp: { hp: 0.06, snd: 0.04, control: 0.06, cap: 0.5 },
  /**
   * Per-map effects from real results (data/stats/{year}.maps.json): fights on fast maps
   * produce more kills, and catch-up scales with how close a map's results run
   * (closeness ^ closeExp). Each can be switched off for the backtest.
   */
  mapEffects: {
    pace: true,
    // Off: in the 200-run backtest it didn't improve event or scoreline accuracy.
    close: false,
    closeExp: 3,
    /** SnD: scale plant chances by the map's real plant rate and the post-plant edge by its retake rate. */
    snd: false,
  },
  /** AI veto noise (skill units). */
  vetoNoise: 0.03,

  hp: {
    /** Hill count when a map has no rotation in the season data. */
    hills: 5,
    rotationGap: [2, 5],
    killSecs: [0.6, 1.4],
    fightKills: [3, 7],
    holdBase: 5,
    holdPerMargin: 1.5,
    holdSd: 2,
    holdMin: 2,
    holdMax: 16,
    setupBonus: 0.25,
  },
  snd: {
    defenseBonus: 0.3,
    postPlantBonus: 0.15,
    plantBase: 0.1,
    plantPerAdv: 0.12,
    latePlantBoost: 0.35,
    latePlantAfter: 55,
    /** No plant before this many seconds into a round (nobody gets to a site faster). */
    minPlantSecs: 15,
    stepSecs: [4, 11],
    defuseSecs: 7.5,
    /** Logit bonus per clutch point above 75, for a player alone vs 1+. */
    clutchScale: 1.2,
  },
  control: {
    roundSecs: 90,
    defenseBonus: 0.1,
    fightKills: [4, 8],
    killSecs: [0.6, 1.4],
    gapSecs: [3, 6],
    progressBase: 25,
    progressPerMargin: 15,
    progressDecay: 20,
  },
  overload: {
    fightKills: [2, 6],
    killSecs: [0.6, 1.4],
    gapSecs: [6, 10],
    /** Fight wins needed while carrying to score. */
    capNeed: 3,
  },
} as const;
