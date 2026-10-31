// Multi-seed parity check: how often each team wins events / Champs across seeds.
//   npm run parity -- --season 2026 --n 20 [--randomized]
import { advanceSeason, createSeason, loadSeasonData, summarize, type SeasonId } from "../src/engine";
const argv = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1]! : d; };
const id = arg("season", "2026") as SeasonId;
const n = Number(arg("n", "20"));
const data = loadSeasonData(id);
const champs = new Map<string, number>(), events = new Map<string, number>(), topPts: number[] = [];
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
for (let i = 0; i < n; i++) {
  const s = createSeason(data, { seed: `parity-${i}`, ratingMode: argv.includes("--randomized") ? "randomized" : "historical" });
  advanceSeason(s, data);
  const sum = summarize(s, data);
  bump(champs, sum.champion!);
  for (const e of sum.eventWinners) bump(events, e.winner);
  topPts.push(sum.finalPoints[0]!.points);
}
const fmt = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${c}`).join(", ");
console.log(`${id} over ${n} seeds`);
console.log(`  Champs winners: ${fmt(champs)}`);
console.log(`  all event wins (${n * data.season.stages.reduce((k, s) => k + 1 + (s.minor ? 1 : 0), 1)}): ${fmt(events)}`);
console.log(`  points leader avg ${Math.round(topPts.reduce((a, b) => a + b, 0) / n)}`);
