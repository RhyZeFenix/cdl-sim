// Simulates N maps per mode between random real lineups and prints the distributions
// we tune against real CDL numbers (Breaking Point stats).
//
//   npm run calibrate -- --n 10000 [--seed x]
import {
  buildSimTeam,
  createRng,
  loadSeasonData,
  simulateMap,
  type MapResult,
  type Mode,
  type SeasonId,
  type SimTeam,
} from "../src/engine";

const argv = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : d;
};
const N = Number(arg("n", "10000"));
const rng = createRng(arg("seed", "calibrate"));

const seasonFor: Record<Mode, SeasonId> = { hp: "2026", snd: "2026", control: "2025", overload: "2026" };
const teamsCache = new Map<SeasonId, SimTeam[]>();
function teamsOf(id: SeasonId): SimTeam[] {
  if (!teamsCache.has(id)) {
    const data = loadSeasonData(id);
    const dates = data.season.stages.map((s) => s.major.start);
    teamsCache.set(id, data.season.teams.flatMap((t) => dates.map((d) => buildSimTeam(data, t.id, d))));
  }
  return teamsCache.get(id)!;
}
const strength = (t: SimTeam) => t.players.reduce((s, p) => s + p.ratings.slaying, 0) / 4;

const pct = (x: number, of: number) => `${((100 * x) / Math.max(1, of)).toFixed(1)}%`;
function hist(title: string, counts: Map<string, number>, total: number, order?: string[]) {
  console.log(`  ${title}`);
  const keys = order ?? [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0)).slice(0, 12);
  for (const k of keys) {
    const c = counts.get(k) ?? 0;
    console.log(`    ${k.padEnd(10)} ${pct(c, total).padStart(6)}  ${"█".repeat(Math.round((60 * c) / total))}`);
  }
}
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

function run(mode: Mode) {
  const sid = seasonFor[mode];
  const data = loadSeasonData(sid);
  const pool = sid === "2025" ? data.season.mapPools.at(-1)! : data.season.mapPools.at(-1)!;
  const mapsForMode = mode === "hp" ? pool.hp : mode === "snd" ? pool.snd : pool.third;
  const teams = teamsOf(sid);
  const results: MapResult[] = [];
  let favWins = 0;
  let favGames = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const a = rng.pick(teams);
    let b = rng.pick(teams);
    while (b.id === a.id) b = rng.pick(teams);
    const m = simulateMap({
      teams: [a, b],
      season: data.season,
      vm: { slot: 1, mode, map: rng.pick(mapsForMode), side: { team: 0, choice: rng.pick(["attack", "defense"]) } },
      rng: rng.fork(`m${mode}${i}`),
    });
    results.push(m);
    const d = strength(a) - strength(b);
    if (Math.abs(d) > 0.5) {
      favGames++;
      if ((d > 0 ? 0 : 1) === m.winner) favWins++;
    }
  }
  const ms = performance.now() - t0;
  const kills = results.reduce((s, m) => s + m.box.reduce((x, l) => x + l.kills, 0), 0);
  const dur = results.reduce((s, m) => s + m.durationSec, 0) / N;
  console.log(`\n=== ${mode.toUpperCase()} (${sid}, ${N} maps, ${(ms / N).toFixed(2)} ms/map)`);
  console.log(`  avg kills/player/map ${(kills / N / 8).toFixed(1)} · avg length ${(dur / 60).toFixed(1)} min · favorite (>0.5 slaying) wins ${pct(favWins, favGames)}`);

  if (mode === "hp") {
    const loser = new Map<string, number>();
    let hills = 0, shutouts = 0;
    for (const m of results) {
      const l = Math.min(m.score[0], m.score[1]);
      bump(loser, l < 100 ? "<100" : l < 150 ? "100-149" : l < 200 ? "150-199" : l < 230 ? "200-229" : "230-249");
      for (const e of m.events) if (e.k === "hill") { hills++; if (Math.min(e.pts[0], e.pts[1]) === 0) shutouts++; }
    }
    hist("loser score", loser, N, ["<100", "100-149", "150-199", "200-229", "230-249"]);
    console.log(`  hills per map ${(hills / N).toFixed(1)} · hills where one team scored 0: ${pct(shutouts, hills)}`);
  }
  if (mode === "snd") {
    const sc = new Map<string, number>();
    let rounds = 0, fbConv = 0, clutches = 0, plants = 0, atkWins = 0, defuses = 0, timeouts = 0;
    for (const m of results) {
      bump(sc, `6-${Math.min(m.score[0], m.score[1])}`);
      let fbSide = -1;
      for (const e of m.events) {
        if (e.k === "kill" && e.fb) fbSide = e.by < 4 ? 0 : 1;
        if (e.k === "clutch") clutches++;
        if (e.k === "plant") plants++;
        if (e.k === "defuse") defuses++;
        if (e.k === "round") {
          rounds++;
          if (e.winner === fbSide) fbConv++;
          if (e.winner === e.atk) atkWins++;
          if (e.how === "time") timeouts++;
        }
      }
    }
    hist("map score", sc, N, ["6-0", "6-1", "6-2", "6-3", "6-4", "6-5"]);
    console.log(`  rounds/map ${(rounds / N).toFixed(1)} · FB conversion ${pct(fbConv, rounds)} · clutch rate ${pct(clutches, rounds)} · plant rate ${pct(plants, rounds)}`);
    console.log(`  attack win ${pct(atkWins, rounds)} · defuses ${pct(defuses, rounds)} of rounds · timeouts ${pct(timeouts, rounds)}`);
  }
  if (mode === "control") {
    const sc = new Map<string, number>();
    const how = new Map<string, number>();
    let rounds = 0, atkWins = 0;
    for (const m of results) {
      bump(sc, `3-${Math.min(m.score[0], m.score[1])}`);
      for (const e of m.events) if (e.k === "round") { rounds++; bump(how, e.how); if (e.winner === e.atk) atkWins++; }
    }
    hist("map score", sc, N, ["3-0", "3-1", "3-2"]);
    hist("round ends by", how, rounds, ["capture", "time", "lives"]);
    console.log(`  attack win ${pct(atkWins, rounds)}`);
  }
  if (mode === "overload") {
    const sc = new Map<string, number>();
    const win = new Map<string, number>();
    let sudden = 0;
    for (const m of results) {
      const w = Math.max(m.score[0], m.score[1]);
      bump(sc, `${w}-${Math.min(m.score[0], m.score[1])}`);
      bump(win, String(w));
      if (m.events.some((e) => e.k === "sudden")) sudden++;
    }
    hist("winner score", win, N, ["1", "2", "3", "4", "5", "6", "7", "8"]);
    hist("most common scores", sc, N);
    console.log(`  sudden death ${pct(sudden, N)}`);
  }
}

for (const mode of ["hp", "snd", "control", "overload"] as const) run(mode);
