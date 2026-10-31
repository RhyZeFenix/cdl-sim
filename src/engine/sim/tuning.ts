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
  /** Selection weight for who takes the next gunfight: exp(engageK * skill). */
  engageK: 3,
  /** Stat weights per mode: [slaying, mode stat]. */
  weights: { hp: [0.65, 0.35], snd: [0.55, 0.45], control: [0.6, 0.4], overload: [0.6, 0.4] },
  /**
   * Catch-up: logit bonus for the team behind on the map, per unit of deficit (HP: per 50
   * points; SnD/Control: per round), capped. Keeps maps close while team edges still show
   * over a season, as real CDL results do.
   */
  catchUp: { hp: 0.06, snd: 0.04, control: 0.06, cap: 0.5 },
  /** AI veto noise (skill units). */
  vetoNoise: 0.03,

  hp: {
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
