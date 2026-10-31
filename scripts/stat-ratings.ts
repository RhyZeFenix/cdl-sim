// Turns season stat aggregates (data/stats/{year}.raw.json, from the CoD Esports Wiki)
// into player ratings and team map modifiers.
//
// Each rating is 80 + SCALE * z, where z is a weighted blend of standardized stats and is
// shrunk toward 0 for small samples (n / (n + K) for the mode's map count), so a player
// with three maps can't post an extreme rating.

export interface RawStats {
  season: string;
  fetched: string;
  source: string;
  license: string;
  players: Record<string, string>[];
  teamMaps: Record<string, string>[];
}

export interface StatLine {
  maps: number;
  kd: number;
  hpKd: number;
  hpTimePerMap: number;
  sndKd: number;
  /** (first kills - first deaths) per SnD map. */
  sndOpeningNet: number;
  /** (plants + defuses) per SnD map. */
  sndObjPerMap: number;
  thirdKd: number;
  thirdCapsPerMap: number;
  hpMaps: number;
  sndMaps: number;
  thirdMaps: number;
}

export interface StatRatings {
  slaying: number;
  hp_obj: number;
  snd_iq: number;
  third_mode: number;
  clutch: number;
}

const SCALE = 4.5;
const SHRINK = { all: 20, hp: 12, snd: 12, third: 8 };
const MIN_MAPS_FOR_POPULATION = 15;

const num = (r: Record<string, string>, k: string) => Number(r[k] ?? 0) || 0;
const ratio = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? 2 : 1);

/** Sums a player's rows across teams (traded players appear once per team). */
export function statLines(raw: RawStats, idOf: (playerLink: string) => string, third: "control" | "overload"): Map<string, StatLine> {
  const sums = new Map<string, Record<string, number>>();
  for (const r of raw.players) {
    const id = idOf(r.PlayerLink!);
    const s = sums.get(id) ?? {};
    for (const [k, v] of Object.entries(r)) if (k !== "PlayerLink" && k !== "Team") s[k] = (s[k] ?? 0) + (Number(v) || 0);
    sums.set(id, s);
  }
  const out = new Map<string, StatLine>();
  for (const [id, s] of sums) {
    const n = (k: string) => s[k] ?? 0;
    const [tk, td, tc, tm] = third === "control" ? ["ConKills", "ConDeaths", "ConCaptures", "ConMaps"] : ["OVRKills", "OVRDeaths", "OVRCaps", "OVRMaps"];
    out.set(id, {
      maps: n("Maps"),
      kd: ratio(n("Kills"), n("Deaths")),
      hpKd: ratio(n("HPKills"), n("HPDeaths")),
      hpTimePerMap: n("HPMaps") ? n("HPTime") / n("HPMaps") : 0,
      sndKd: ratio(n("SDKills"), n("SDDeaths")),
      sndOpeningNet: n("SDMaps") ? (n("SDFirstKill") - n("SDFirstDeath")) / n("SDMaps") : 0,
      sndObjPerMap: n("SDMaps") ? (n("SDPlants") + n("SDDefuses")) / n("SDMaps") : 0,
      thirdKd: ratio(n(tk!), n(td!)),
      thirdCapsPerMap: n(tm!) ? n(tc!) / n(tm!) : 0,
      hpMaps: n("HPMaps"),
      sndMaps: n("SDMaps"),
      thirdMaps: n(tm!),
    });
  }
  return out;
}

/** Ratings from stat lines, standardized against the season's regulars. */
export function ratingsFromStats(lines: Map<string, StatLine>): Map<string, StatRatings> {
  const regulars = [...lines.values()].filter((l) => l.maps >= MIN_MAPS_FOR_POPULATION);
  const stat = (f: (l: StatLine) => number) => {
    const xs = regulars.map(f);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
    return (l: StatLine) => (f(l) - mean) / sd;
  };
  const z = {
    kd: stat((l) => Math.log(l.kd)),
    hpKd: stat((l) => Math.log(l.hpKd)),
    hpTime: stat((l) => l.hpTimePerMap),
    sndKd: stat((l) => Math.log(l.sndKd)),
    opening: stat((l) => l.sndOpeningNet),
    sndObj: stat((l) => l.sndObjPerMap),
    thirdKd: stat((l) => Math.log(l.thirdKd)),
    thirdCaps: stat((l) => l.thirdCapsPerMap),
  };
  const shrink = (x: number, n: number, k: number) => (x * n) / (n + k);
  const rate = (x: number) => Math.max(60, Math.min(97, Math.round(80 + SCALE * x)));

  const out = new Map<string, StatRatings>();
  for (const [id, l] of lines) {
    const slay = shrink(z.kd(l), l.maps, SHRINK.all);
    const hp = shrink(0.65 * z.hpKd(l) + 0.35 * z.hpTime(l), l.hpMaps, SHRINK.hp);
    const snd = shrink(0.5 * z.sndKd(l) + 0.3 * z.opening(l) + 0.2 * z.sndObj(l), l.sndMaps, SHRINK.snd);
    const third = shrink(0.75 * z.thirdKd(l) + 0.25 * z.thirdCaps(l), l.thirdMaps, SHRINK.third);
    // No clutch stat is published; SnD K/D is the closest proxy, kept mild.
    const clutch = shrink(0.6 * z.sndKd(l), l.sndMaps, SHRINK.snd);
    out.set(id, { slaying: rate(slay), hp_obj: rate(hp), snd_iq: rate(snd), third_mode: rate(third), clutch: rate(clutch) });
  }
  return out;
}

const MODE_OF: Record<string, string> = {
  Hardpoint: "hp",
  "Search and Destroy": "snd",
  "Search & Destroy": "snd",
  Control: "control",
  Overload: "overload",
};

/**
 * Team map modifiers in skill units: how much better (or worse) a team did on a map than
 * on its mode overall, shrunk for small samples and capped at ±0.03.
 */
export function teamMapMods(raw: RawStats, teamIdOf: (name: string) => string | undefined): Map<string, Record<string, number>> {
  type Agg = { maps: number; wins: number };
  const byMap = new Map<string, Agg>();
  const byMode = new Map<string, Agg>();
  const unknownModes = new Set<string>();
  for (const r of raw.teamMaps) {
    const team = teamIdOf(r.Team!);
    const mode = MODE_OF[r.Gamemode!];
    if (!mode) unknownModes.add(r.Gamemode!);
    if (!team || !mode || r.Map === "Unrecognized Map") continue;
    const maps = num(r, "Rows") / 4;
    const wins = num(r, "WinRows") / 4;
    for (const [m, key] of [[byMap, `${team}|${mode}:${r.Map}`], [byMode, `${team}|${mode}`]] as const) {
      const a = m.get(key) ?? { maps: 0, wins: 0 };
      a.maps += maps;
      a.wins += wins;
      m.set(key, a);
    }
  }
  unknownModes.delete("Unrecognized Mode");
  if (unknownModes.size) console.warn(`  unmapped modes: ${[...unknownModes].join(", ")}`);
  const out = new Map<string, Record<string, number>>();
  for (const [key, a] of byMap) {
    const [team, modeMap] = key.split("|") as [string, string];
    const base = byMode.get(`${team}|${modeMap.split(":")[0]}`)!;
    const delta = a.wins / a.maps - base.wins / base.maps;
    const shrunk = (delta * a.maps) / (a.maps + 6);
    const mod = Math.max(-0.03, Math.min(0.03, 0.1 * shrunk));
    if (Math.abs(mod) < 0.002) continue;
    const rec = out.get(team) ?? {};
    rec[modeMap] = Math.round(mod * 1000) / 1000;
    out.set(team, rec);
  }
  return out;
}

/**
 * Consistency from map-to-map spread. Per mode, a player's standard deviation of per-map
 * (kills - deaths) is divided by the spread expected from their own volume (sqrt of kills
 * + deaths per map, as for a count), so high-volume slayers aren't marked inconsistent
 * just for trading more; that ratio is then compared with the mode's typical ratio and
 * modes are combined weighted by maps. Bigger swings than expected = lower rating.
 */
export function consistencyFromStats(
  rows: Record<string, string>[],
  idOf: (playerLink: string) => string,
  raw: RawStats,
): Map<string, number> {
  // Kills + deaths per map, per player and mode, from the season aggregates.
  const FIELDS: Record<string, [string, string, string]> = {
    Hardpoint: ["HPKills", "HPDeaths", "HPMaps"],
    "Search and Destroy": ["SDKills", "SDDeaths", "SDMaps"],
    Control: ["ConKills", "ConDeaths", "ConMaps"],
    Overload: ["OVRKills", "OVRDeaths", "OVRMaps"],
  };
  const vol = new Map<string, { kd: number; maps: number }>();
  for (const r of raw.players) {
    for (const [mode, [k, d, m]] of Object.entries(FIELDS)) {
      const key = `${idOf(r.PlayerLink!)}|${mode}`;
      const v = vol.get(key) ?? { kd: 0, maps: 0 };
      v.kd += num(r, k) + num(r, d);
      v.maps += num(r, m);
      vol.set(key, v);
    }
  }
  const expectedSd = (id: string, mode: string) => {
    const v = vol.get(`${id}|${mode}`);
    return v && v.maps ? Math.sqrt(v.kd / v.maps) : 0;
  };
  type Acc = { n: number; pm: number; pm2: number };
  const byPlayerMode = new Map<string, Map<string, Acc>>();
  for (const r of rows) {
    const id = idOf(r.PlayerLink!);
    const modes = byPlayerMode.get(id) ?? new Map<string, Acc>();
    const a = modes.get(r.Gamemode!) ?? { n: 0, pm: 0, pm2: 0 };
    a.n += num(r, "Maps");
    a.pm += num(r, "PM");
    a.pm2 += num(r, "PM2");
    modes.set(r.Gamemode!, a);
    byPlayerMode.set(id, modes);
  }
  const rawSd = (a: Acc) => Math.sqrt(Math.max(0, a.pm2 / a.n - (a.pm / a.n) ** 2));

  // Spread relative to the player's own volume, per mode.
  const relSd = new Map<string, Map<string, number>>();
  for (const [id, modes] of byPlayerMode) {
    const m = new Map<string, number>();
    for (const [mode, a] of modes) {
      const e = expectedSd(id, mode);
      if (e > 0) m.set(mode, rawSd(a) / e);
    }
    relSd.set(id, m);
  }
  const sdOf = (id: string, mode: string) => relSd.get(id)?.get(mode);

  // Typical ratio per mode: median among players with 8+ maps in it.
  const typical = new Map<string, number>();
  const sds = new Map<string, number[]>();
  for (const [id, modes] of byPlayerMode) {
    for (const [mode, a] of modes) {
      const x = sdOf(id, mode);
      if (a.n >= 8 && x !== undefined) sds.set(mode, [...(sds.get(mode) ?? []), x]);
    }
  }
  for (const [mode, xs] of sds) {
    const s = [...xs].sort((a, b) => a - b);
    typical.set(mode, s[Math.floor(s.length / 2)]!);
  }

  const rel = new Map<string, { r: number; n: number }>();
  for (const [id, modes] of byPlayerMode) {
    let w = 0, sum = 0;
    for (const [mode, a] of modes) {
      const t = typical.get(mode);
      const x = sdOf(id, mode);
      if (!t || x === undefined || a.n < 2) continue;
      sum += a.n * (x / t);
      w += a.n;
    }
    if (w > 0) rel.set(id, { r: sum / w, n: w });
  }
  const regulars = [...rel.values()].filter((x) => x.n >= MIN_MAPS_FOR_POPULATION).map((x) => x.r);
  const mean = regulars.reduce((a, b) => a + b, 0) / regulars.length;
  const sd = Math.sqrt(regulars.reduce((a, b) => a + (b - mean) ** 2, 0) / regulars.length) || 1;
  const out = new Map<string, number>();
  for (const [id, { r, n }] of rel) {
    const z = (-(r - mean) / sd) * (n / (n + SHRINK.all));
    out.set(id, Math.max(60, Math.min(97, Math.round(80 + SCALE * z))));
  }
  return out;
}
