// Backtest: simulate each season many times and compare against what really happened.
//
//   npm run backtest -- [--n 200] [--seasons 2024,2025,2026] [--out docs/backtest.md]
//
// Real data (all CC BY-SA, committed under data/):
//   event placements  data/sources/fandom/{year}_Major_{n}.txt, {year}_Champs_{year}.txt
//   map scorelines    data/sources/liquipedia/Season_{5,6,7}*.txt (the matches those pages cover)
//   team map records  data/stats/{year}.raw.json (teamMaps)
//   series results    data/results/{year}.raw.json (optional; used to rebuild real CDL points)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TUNING, advanceSeason, createSeason, loadSeasonData, type Mode, type SeasonData, type SeasonId } from "../src/engine";
import { CODES } from "./fandom-codes";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : d;
};
const N = Number(arg("n", "200"));
const SEASONS = arg("seasons", "2024,2025,2026").split(",") as SeasonId[];
const OUT = arg("out", "docs/backtest.md");

// --tune duelK=1.5,modeDuelScale.snd=1.6,overload.gapSecs=7:12 overrides TUNING for a sweep.
const TUNE = arg("tune", "");
for (const kv of TUNE ? TUNE.split(",") : []) {
  const [path, value] = kv.split("=") as [string, string];
  const keys = path.split(".");
  let obj = TUNING as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
  const last = keys[keys.length - 1]!;
  if (!(last in obj)) throw new Error(`unknown tuning key ${path}`);
  obj[last] = value.includes(":") ? value.split(":").map(Number) : Number(value);
}

const LIQUIPEDIA_SEASON: Record<SeasonId, string> = { "2024": "Season_5", "2025": "Season_6", "2026": "Season_7" };
const STAT_ALIASES: Record<string, string> = { "las vegas falcons": "vegas-falcons" };
const MODES: Mode[] = ["hp", "snd", "control", "overload"];

// ------------------------------------------------------------------ helpers

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const std = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0);
  const den = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  return den ? num / den : 0;
}
function ranks(xs: number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const r = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1]!.x === order[k]!.x) j++;
    for (let m = k; m <= j; m++) r[order[m]!.i] = (k + j) / 2 + 1;
    k = j + 1;
  }
  return r;
}
const spearman = (xs: number[], ys: number[]) => pearson(ranks(xs), ranks(ys));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(2);

function bucket(mode: Mode, w: number, l: number): string {
  switch (mode) {
    case "hp":
      return l < 150 ? "<150" : l < 200 ? "150-199" : l < 230 ? "200-229" : "230-249";
    case "snd":
      return `6-${l}`;
    case "control":
      return `3-${l}`;
    case "overload":
      return w >= 5 ? "winner 5+" : `winner ${w}`;
  }
}
const BUCKETS: Record<Mode, string[]> = {
  hp: ["<150", "150-199", "200-229", "230-249"],
  snd: ["6-0", "6-1", "6-2", "6-3", "6-4", "6-5"],
  control: ["3-0", "3-1", "3-2"],
  overload: ["winner 1", "winner 2", "winner 3", "winner 4", "winner 5+"],
};

// ------------------------------------------------------------------ real data

interface RealEvent {
  key: string;
  name: string;
  /** team -> placement range lower bound and midpoint */
  place: Map<string, { from: number; mid: number }>;
  winner: string;
}

function realEvents(y: SeasonId, data: SeasonData): RealEvent[] {
  const files = [
    ...data.season.stages.map((st) => ({ file: `${y}_Major_${st.stage}.txt`, key: `major:${st.stage}`, name: st.major.name })),
    { file: `${y}_Champs_${y}.txt`, key: "championship", name: "Championship" },
  ];
  return files.map(({ file, key, name }) => {
    const text = readFileSync(join("data/sources/fandom", file), "utf8");
    const place = new Map<string, { from: number; mid: number }>();
    for (const m of text.matchAll(/TournamentResults\/Line\|place=(\d+)(?:-(\d+))?\s*\|[^}]*?team=([A-Za-z0-9]+)/g)) {
      const team = CODES[y]![m[3]!];
      if (!team) continue;
      const from = Number(m[1]);
      const to = m[2] ? Number(m[2]) : from;
      place.set(team, { from, mid: (from + to) / 2 });
    }
    const winner = [...place.entries()].find(([, p]) => p.from === 1)?.[0];
    if (!winner) throw new Error(`${file}: no winner found`);
    return { key, name, place, winner };
  });
}

function realScorelines(y: SeasonId): { counts: Record<Mode, Map<string, number>>; total: Record<Mode, number> } {
  const counts = Object.fromEntries(MODES.map((m) => [m, new Map<string, number>()])) as Record<Mode, Map<string, number>>;
  const total = Object.fromEntries(MODES.map((m) => [m, 0])) as Record<Mode, number>;
  const modeOf: Record<string, Mode> = { hp: "hp", snd: "snd", con: "control", ovl: "overload" };
  const dir = "data/sources/liquipedia";
  for (const f of readdirSync(dir).filter((f) => f.startsWith(LIQUIPEDIA_SEASON[y]))) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const m of text.matchAll(/mode=(hp|snd|con|ovl)\s*\|score1=(\d+)\|score2=(\d+)/g)) {
      const mode = modeOf[m[1]!]!;
      const [a, b] = [Number(m[2]), Number(m[3])];
      const w = Math.max(a, b), l = Math.min(a, b);
      if (a === b || (mode === "hp" && w !== 250) || (mode === "snd" && w !== 6) || (mode === "control" && w !== 3)) continue;
      const k = bucket(mode, w, l);
      counts[mode].set(k, (counts[mode].get(k) ?? 0) + 1);
      total[mode]++;
    }
  }
  return { counts, total };
}

type WinRec = { w: number; n: number };

function teamIdFor(data: SeasonData) {
  const names = new Map(data.season.teams.map((t) => [t.name.toLowerCase(), t.id]));
  for (const [a, id] of Object.entries(STAT_ALIASES)) if (data.season.teams.some((t) => t.id === id)) names.set(a, id);
  return (name: string | undefined) => (name ? names.get(name.toLowerCase()) : undefined);
}

function realModeRecords(y: SeasonId, data: SeasonData): Map<string, Map<Mode, WinRec>> {
  const raw = JSON.parse(readFileSync(`data/stats/${y}.raw.json`, "utf8")) as { teamMaps: Record<string, string>[] };
  const idOf = teamIdFor(data);
  const modeOf: Record<string, Mode> = { Hardpoint: "hp", "Search and Destroy": "snd", Control: "control", Overload: "overload" };
  const out = new Map<string, Map<Mode, WinRec>>();
  for (const r of raw.teamMaps) {
    const team = idOf(r.Team);
    const mode = modeOf[r.Gamemode!];
    if (!team || !mode) continue;
    const m = out.get(team) ?? new Map<Mode, WinRec>();
    const rec = m.get(mode) ?? { w: 0, n: 0 };
    rec.n += Number(r.Rows) / 4;
    rec.w += Number(r.WinRows) / 4;
    m.set(mode, rec);
    out.set(team, m);
  }
  return out;
}

/** Real CDL points: 10 per qualifier win (from series results) + placement points from real event results. */
function realPoints(y: SeasonId, data: SeasonData, events: RealEvent[]): Map<string, number> | null {
  const file = `data/results/${y}.raw.json`;
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as { series: Record<string, string>[] };
  const idOf = teamIdFor(data);
  const pts = new Map(data.season.teams.map((t) => [t.id, 0]));
  for (const s of raw.series) {
    if (!/\/Qualifiers$/.test(s.OverviewPage ?? "")) continue;
    const win = s.Winner === "1" ? s.Team1 : s.Winner === "2" ? s.Team2 : s.Winner;
    const id = idOf(win);
    if (id) pts.set(id, pts.get(id)! + data.season.points.qualifierWin);
  }
  for (const e of events) {
    if (e.key === "championship") continue;
    const ev = data.season.stages[Number(e.key.split(":")[1]) - 1]!.major;
    for (const [team, p] of e.place) {
      if (!pts.has(team)) continue;
      pts.set(team, pts.get(team)! + (ev.points.find((r) => p.from >= r.from && p.from <= r.to)?.points ?? 0));
    }
  }
  // Minors: placements from the season's Minor pages aren't committed; their points are a small share.
  return pts;
}

// ------------------------------------------------------------------ simulate

interface SimAgg {
  eventWins: Map<string, Map<string, number>>;
  eventPlaceSum: Map<string, Map<string, number>>;
  points: Map<string, number>;
  modeRec: Map<string, Map<Mode, WinRec>>;
  scores: Record<Mode, Map<string, number>>;
  scoreTotal: Record<Mode, number>;
}

function simulate(y: SeasonId, data: SeasonData): SimAgg {
  const cdl = new Set(data.season.teams.map((t) => t.id));
  const agg: SimAgg = {
    eventWins: new Map(),
    eventPlaceSum: new Map(),
    points: new Map(),
    modeRec: new Map(),
    scores: Object.fromEntries(MODES.map((m) => [m, new Map<string, number>()])) as Record<Mode, Map<string, number>>,
    scoreTotal: Object.fromEntries(MODES.map((m) => [m, 0])) as Record<Mode, number>,
  };
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (let i = 0; i < N; i++) {
    const s = createSeason(data, { seed: `backtest-${y}-${i}`, ratingMode: "historical" });
    advanceSeason(s, data);
    for (const e of s.events) {
      if (e.kind === "minor") continue;
      const key = e.kind === "championship" ? "championship" : `major:${e.stage}`;
      const wins = agg.eventWins.get(key) ?? new Map<string, number>();
      const places = agg.eventPlaceSum.get(key) ?? new Map<string, number>();
      for (const [team, [from, to]] of Object.entries(e.placements)) {
        add(places, team, (from + to) / 2);
        if (from === 1) add(wins, team, 1);
      }
      agg.eventWins.set(key, wins);
      agg.eventPlaceSum.set(key, places);
    }
    for (const [t, p] of Object.entries(s.points)) add(agg.points, t, p);
    for (const rec of Object.values(s.series)) {
      for (const m of rec.maps) {
        rec.teams.forEach((team, side) => {
          if (!cdl.has(team)) return;
          const tm = agg.modeRec.get(team) ?? new Map<Mode, WinRec>();
          const r = tm.get(m.mode) ?? { w: 0, n: 0 };
          r.n++;
          if (m.winner === side) r.w++;
          tm.set(m.mode, r);
          agg.modeRec.set(team, tm);
        });
        const w = Math.max(...m.score), l = Math.min(...m.score);
        add(agg.scores[m.mode], bucket(m.mode, w, l), 1);
        agg.scoreTotal[m.mode]++;
      }
    }
  }
  return agg;
}

// ------------------------------------------------------------------ report

function seasonReport(y: SeasonId): { md: string; summary: Record<string, number> } {
  const data = loadSeasonData(y);
  const name = (id: string) => data.season.teams.find((t) => t.id === id)?.abbr ?? id;
  const t0 = performance.now();
  const sim = simulate(y, data);
  const secs = (performance.now() - t0) / 1000;
  const events = realEvents(y, data);
  const lines: string[] = [`## ${data.season.label}`, "", `${N} simulated seasons in ${secs.toFixed(0)} s (Historical ratings).`, ""];
  const summary: Record<string, number> = {};

  // Events
  lines.push("### Event winners", "", "| Event | Real winner | Sim win % for real winner | Sim favorite (win %) | Rank of real winner | Placement Spearman |", "|---|---|---|---|---|---|");
  const logs: number[] = [], rhos: number[] = [], pReal: number[] = [];
  let favHits = 0;
  for (const e of events) {
    const wins = sim.eventWins.get(e.key) ?? new Map<string, number>();
    const places = sim.eventPlaceSum.get(e.key) ?? new Map<string, number>();
    const p = (wins.get(e.winner) ?? 0) / N;
    const sorted = [...wins.entries()].sort((a, b) => b[1] - a[1]);
    const fav = sorted[0];
    const rank = sorted.findIndex(([t]) => t === e.winner) + 1 || sorted.length + 1;
    const teams = [...e.place.keys()].filter((t) => places.has(t));
    const rho = spearman(teams.map((t) => e.place.get(t)!.mid), teams.map((t) => places.get(t)! / N));
    logs.push(-Math.log(Math.max(p, 0.5 / N)));
    rhos.push(rho);
    pReal.push(p);
    if (fav && fav[0] === e.winner) favHits++;
    lines.push(`| ${e.name} | ${name(e.winner)} | ${pct(p)} | ${fav ? `${name(fav[0])} (${pct(fav[1] / N)})` : "—"} | ${rank} | ${f2(rho)} |`);
  }
  const size = events[0]!.place.size;
  summary.eventRealWinnerP = mean(pReal);
  summary.eventLogLoss = mean(logs);
  summary.eventPlacementRho = mean(rhos);
  lines.push(
    "",
    `Real winners got **${pct(mean(pReal))}** sim win probability on average (a coin-flip model would give about ${pct(1 / size)}). ` +
      `The sim's favorite won ${favHits} of ${events.length}. Mean placement Spearman **${f2(mean(rhos))}** (1 = identical order). Log loss ${f2(mean(logs))} vs ${f2(Math.log(size))} for uniform.`,
    "",
  );

  // Team strength by mode
  const real = realModeRecords(y, data);
  lines.push("### Team map win % by mode", "", "| Mode | Teams | Correlation (real vs sim) | Real spread (SD) | Sim spread (SD) | Sim/real spread |", "|---|---|---|---|---|---|");
  const modes: Mode[] = ["hp", "snd", data.season.thirdMode];
  const ratios: number[] = [], corrs: number[] = [];
  for (const mode of modes) {
    const teams = data.season.teams.map((t) => t.id).filter((t) => (real.get(t)?.get(mode)?.n ?? 0) >= 10);
    const recs = teams.map((t) => real.get(t)!.get(mode)!);
    const r = recs.map((x) => x.w / x.n);
    const s = teams.map((t) => sim.modeRec.get(t)?.get(mode)).map((x) => (x ? x.w / x.n : 0.5));
    const c = pearson(r, s);
    // Real win rates come from ~100 maps each, so part of their spread is binomial noise;
    // remove it so the comparison is with the sim's long-run rates.
    const noiseVar = mean(recs.map((x) => (x.w / x.n) * (1 - x.w / x.n) / x.n));
    const trueSd = Math.sqrt(Math.max(0, std(r) ** 2 - noiseVar));
    const ratio = std(s) / trueSd;
    corrs.push(c);
    ratios.push(ratio);
    lines.push(`| ${mode} | ${teams.length} | ${f2(c)} | ${pct(std(r))} (${pct(trueSd)} after noise) | ${pct(std(s))} | ${f2(ratio)} |`);
  }
  summary.modeCorr = mean(corrs);
  summary.spreadRatio = mean(ratios);
  lines.push(
    "",
    `A spread ratio below 1 means the sim makes teams more evenly matched than they really were; above 1, less. Mean correlation **${f2(mean(corrs))}**, mean spread ratio **${f2(mean(ratios))}**.`,
    "",
  );

  // Scorelines
  const rs = realScorelines(y);
  lines.push("### Map scorelines", "");
  const tvds: number[] = [];
  for (const mode of modes) {
    if (rs.total[mode] < 20) {
      lines.push(`${mode}: only ${rs.total[mode]} real maps in the committed pages; skipped.`, "");
      continue;
    }
    const keys = BUCKETS[mode];
    const rp = keys.map((k) => (rs.counts[mode].get(k) ?? 0) / rs.total[mode]);
    const sp = keys.map((k) => (sim.scores[mode].get(k) ?? 0) / sim.scoreTotal[mode]);
    const tvd = 0.5 * rp.reduce((a, p, i) => a + Math.abs(p - sp[i]!), 0);
    tvds.push(tvd);
    lines.push(
      `**${mode}** (${rs.total[mode]} real maps) — distance ${f2(tvd)} (0 = identical, 1 = disjoint)`,
      "",
      `| ${mode === "hp" ? "Loser score" : "Score"} | ${keys.join(" | ")} |`,
      `|---|${keys.map(() => "---").join("|")}|`,
      `| Real | ${rp.map(pct).join(" | ")} |`,
      `| Sim | ${sp.map(pct).join(" | ")} |`,
      "",
    );
  }
  summary.scorelineTVD = mean(tvds);

  // Points
  const rpts = realPoints(y, data, events);
  if (rpts) {
    const teams = data.season.teams.map((t) => t.id);
    const r = teams.map((t) => rpts.get(t)!);
    const s = teams.map((t) => (sim.points.get(t) ?? 0) / N);
    const rho = spearman(r, s);
    const mae = mean(r.map((x, i) => Math.abs(x - s[i]!)));
    summary.pointsRho = rho;
    summary.pointsMAE = mae;
    lines.push(
      "### CDL points",
      "",
      `Real points rebuilt from series results and Major placements (Minor points not included). Spearman **${f2(rho)}**, mean absolute error ${mae.toFixed(0)} points.`,
      "",
      "| Team | Real | Sim mean |",
      "|---|---|---|",
      ...teams
        .map((t, i) => ({ t, r: r[i]!, s: s[i]! }))
        .sort((a, b) => b.r - a.r)
        .map((x) => `| ${name(x.t)} | ${x.r} | ${x.s.toFixed(0)} |`),
      "",
    );
    const hist = data.season.historical?.finalPoints;
    if (hist) {
      const minorFree = teams.map((t) => hist[t]! - rpts.get(t)!);
      lines.push(`Check against the published 2026 final points: the gap per team (Minor points plus any data issues) averages ${mean(minorFree).toFixed(0)}.`, "");
    }
  } else {
    lines.push("### CDL points", "", "No `data/results` file for this season; run `npx tsx scripts/fetch-results.ts`.", "");
  }
  return { md: lines.join("\n"), summary };
}

const sections: string[] = [];
const summaries: { y: SeasonId; s: Record<string, number> }[] = [];
for (const y of SEASONS) {
  const { md, summary } = seasonReport(y);
  sections.push(md);
  summaries.push({ y, s: summary });
  console.log(`${y}: ${Object.entries(summary).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(" · ")}`);
}
const head = [
  "# Backtest",
  "",
  `Generated by \`npm run backtest -- --n ${N}\`. Each season is simulated ${N} times with Historical ratings and compared with what really happened.`,
  "",
  "| Season | Real winner's sim win % | Placement Spearman | Mode win % correlation | Sim/real spread | Scoreline distance | Points Spearman |",
  "|---|---|---|---|---|---|---|",
  ...summaries.map(
    ({ y, s }) =>
      `| ${y} | ${pct(s.eventRealWinnerP!)} | ${f2(s.eventPlacementRho!)} | ${f2(s.modeCorr!)} | ${f2(s.spreadRatio!)} | ${f2(s.scorelineTVD!)} | ${s.pointsRho !== undefined ? f2(s.pointsRho) : "—"} |`,
  ),
  "",
];
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, [...head, ...sections].join("\n") + "\n");
console.log(`wrote ${OUT}`);
