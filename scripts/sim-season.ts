// Simulate a full season from the command line.
//
//   npm run season -- --season 2026 --seed demo [--randomized] [--quiet]
//   npm run season -- --all     (times all three seasons)
import {
  SEASON_IDS,
  advance,
  createSeason,
  isDone,
  loadSeasonData,
  nextStep,
  pointsTable,
  qualifierStandings,
  summarize,
  type SeasonData,
  type SeasonId,
  type SeasonState,
} from "../src/engine";

const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(`--${k}`);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1]! : d;
};

function abbrOf(data: SeasonData) {
  const map = new Map(data.season.teams.map((t) => [t.id, t.abbr]));
  for (const st of data.season.stages) {
    if (st.major.format.type === "proam-gsl") for (const g of st.major.format.guests) map.set(g.id, g.abbr);
  }
  return (id: string) => map.get(id) ?? id;
}

function run(id: SeasonId, seed: string, randomized: boolean, quiet: boolean) {
  const data = loadSeasonData(id);
  const A = abbrOf(data);
  const state: SeasonState = createSeason(data, { seed, ratingMode: randomized ? "randomized" : "historical" });
  const t0 = performance.now();
  const log = (s = "") => !quiet && console.log(s);

  log(`\n${"═".repeat(70)}\n${data.season.label} · seed "${seed}" · ${randomized ? "Randomized" : "Historical"}\n${"═".repeat(70)}`);
  while (!isDone(state)) {
    const step = nextStep(state)!;
    advance(state, data);
    if (step.kind === "week") {
      const lastWeek = data.season.stages[step.stage - 1]!.qualifiers.weeks.length;
      if (step.week === lastWeek) {
        log(`\nStage ${step.stage} qualifiers final standings`);
        qualifierStandings(state, data, step.stage).forEach((r, i) =>
          log(`  ${String(i + 1).padStart(2)}. ${A(r.team).padEnd(5)} ${r.seriesW}-${r.seriesL}  maps ${r.mapW}-${r.mapL} (${r.mapDiff >= 0 ? "+" : ""}${r.mapDiff})`),
        );
      }
    } else {
      const ev = state.events[state.events.length - 1]!;
      const gf = ev.matches[ev.matches.length - 1]!;
      const loser = gf.winner === gf.teams[0] ? gf.teams[1] : gf.teams[0];
      const sc = gf.winner === gf.teams[0] ? gf.score : [gf.score[1], gf.score[0]];
      log(`\n${ev.name}${ev.stage ? ` (stage ${ev.stage})` : ""}: seeds ${ev.seeds.map(A).join(" ")}`);
      log(`  ${A(gf.winner)} def. ${A(loser)} ${sc[0]}-${sc[1]} in the ${gf.def.label}  (${ev.matches.length} series)`);
      const byPlace = Object.entries(ev.placements).sort((a, b) => a[1][0] - b[1][0]);
      log(`  placements: ${byPlace.map(([t, [f, to]]) => `${f === to ? f : `${f}-${to}`}:${A(t)}`).join("  ")}`);
      if (step.kind === "major") {
        log(`  points after ${ev.name}: ${pointsTable(state, data).map((r) => `${A(r.team)} ${r.points}`).join(", ")}`);
      }
    }
  }
  const ms = performance.now() - t0;
  const sum = summarize(state, data);
  const series = Object.keys(state.series).length;
  const maps = Object.values(state.series).reduce((n, r) => n + r.maps.length, 0);
  const withEvents = Object.values(state.series).filter((r) => r.hasEvents).length;
  const bytes = JSON.stringify(state).length;

  log(`\nFINAL CDL POINTS`);
  sum.finalPoints.forEach((r, i) => log(`  ${String(i + 1).padStart(2)}. ${A(r.team).padEnd(5)} ${String(r.points).padStart(4)}  ${r.seriesW}-${r.seriesL}${i === 7 ? "\n  ── Champs cut ──" : ""}`));
  log(`\nSEASON SUMMARY`);
  for (const e of sum.eventWinners) log(`  ${e.name.padEnd(20)} ${A(e.winner)} def. ${A(e.runnerUp)} ${e.score[0]}-${e.score[1]}`);
  log(`  Champion: ${sum.champion && A(sum.champion)}  ·  MVP (Champs K/D): ${sum.mvp?.player} (${sum.mvp && A(sum.mvp.team)}) ${sum.mvp?.kills}-${sum.mvp?.deaths} over ${sum.mvp?.maps} maps`);
  console.log(
    `${id}: ${series} series, ${maps} maps in ${(ms / 1000).toFixed(2)} s · full logs kept for ${withEvents} series · state ${(bytes / 1e6).toFixed(1)} MB · champion ${sum.champion && A(sum.champion)}`,
  );
}

if (flag("all")) {
  for (const id of SEASON_IDS) run(id, arg("seed", "demo"), flag("randomized"), true);
} else {
  run(arg("season", "2026") as SeasonId, arg("seed", "demo"), flag("randomized"), flag("quiet"));
}
