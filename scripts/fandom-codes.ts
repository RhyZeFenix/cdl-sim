// Team codes used on the Call of Duty Esports Wiki event pages, per season.
export const CODES: Record<string, Record<string, string>> = {
  "2024": {
    ATL: "atlanta-faze", BOS: "boston-breach", CAR: "carolina-royal-ravens", LVL: "las-vegas-legion",
    LAG: "la-guerrillas", LAT: "la-thieves", MIA: "miami-heretics", MIN: "minnesota-rokkr",
    NY: "ny-subliners", TEX: "optic-texas", SEA: "seattle-surge", TOR: "toronto-ultra",
  },
  "2025": {
    ATL: "atlanta-faze", BOS: "boston-breach", CAR: "carolina-royal-ravens", CNY: "cloud9-new-york",
    LAM: "la-guerrillas-m8", LAT: "la-thieves", MIA: "miami-heretics", MIN: "minnesota-rokkr",
    TEX: "optic-texas", TOR: "toronto-ultra", VAN: "vancouver-surge", LVF: "vegas-falcons",
  },
  "2026": {
    BOS: "boston-breach", CAR: "carolina-royal-ravens", CNY: "cloud9-new-york", FLV: "faze-vegas",
    VGS: "faze-vegas", GMN: "g2-minnesota", LAT: "la-thieves", MIA: "miami-heretics", OTX: "optic-texas",
    PGM: "paris-gentle-mates", RYD: "riyadh-falcons", TOK: "toronto-koi", VAN: "vancouver-surge",
    OM: "omit", HUN: "huntsmen", P7N: "project-notorious", ROC: "roc-esports",
  },
};

/** Non-CDL teams that appear at an event (2026 Pro-Am Major). */
export const GUESTS = new Set(["omit", "huntsmen", "project-notorious", "roc-esports"]);
