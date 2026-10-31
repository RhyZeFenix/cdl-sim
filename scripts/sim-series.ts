// Simulate one series from the command line.
//
//   npm run series -- --season 2026 --a optic-texas --b faze-vegas --bo 9 --phase champs --seed demo
//
// --phase: champs | major:<stage> | minor:<stage> | quals:<stage>:<week>   (default champs)
// --box  : print per-map box scores too
import {
  addLines,
  buildSimTeam,
  createRng,
  emptyLine,
  loadSeasonData,
  mapLog,
  mapPoolFor,
  simulateSeries,
  type PoolPhase,
  type SeasonId,
} from "../src/engine";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (a.startsWith("--")) {
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(a.slice(2), next);
      i++;
    } else args.set(a.slice(2), "true");
  }
}

const seasonId = (args.get("season") ?? "2026") as SeasonId;
const data = loadSeasonData(seasonId);
const { season } = data;
const phaseArg = args.get("phase") ?? "champs";
const [kind, s1, s2] = phaseArg.split(":");
const phase: PoolPhase =
  kind === "champs"
    ? { kind: "championship" }
    : kind === "quals"
      ? { kind: "qualifiers", stage: Number(s1), week: Number(s2) }
      : { kind: kind as "major" | "minor", stage: Number(s1) };
const event =
  phase.kind === "championship"
    ? season.championship
    : phase.kind === "qualifiers"
      ? null
      : season.stages[phase.stage - 1]![phase.kind];
const date = event?.start ?? season.stages[(phase as { stage: number }).stage - 1]!.qualifiers.start;
const bestOf = Number(args.get("bo") ?? (phase.kind === "championship" ? 9 : 5)) as 5 | 7 | 9;
const seed = args.get("seed") ?? "demo";

const teams = [
  buildSimTeam(data, args.get("a") ?? season.teams[0]!.id, date),
  buildSimTeam(data, args.get("b") ?? season.teams[1]!.id, date),
] as [ReturnType<typeof buildSimTeam>, ReturnType<typeof buildSimTeam>];
const pool = mapPoolFor(season, phase);

const t0 = performance.now();
const r = simulateSeries({ teams, bestOf, season, veto: data.veto, pool, rng: createRng(seed) });
const ms = performance.now() - t0;

const abbr = (s: 0 | 1) => teams[s].abbr;
const handles = [...teams[0].players, ...teams[1].players].map((p) => p.handle);
console.log(`\n${season.label} · ${phaseArg} · Bo${bestOf} · seed "${seed}" · pool ${pool.id}`);
console.log(`${teams[0].name} (${teams[0].players.map((p) => p.handle).join(", ")})`);
console.log(`  vs ${teams[1].name} (${teams[1].players.map((p) => p.handle).join(", ")})`);

console.log(`\nVETO (Team A = ${abbr(r.veto.teamA)})`);
for (const v of r.veto.records) {
  if (v.action === "ban") console.log(`  ${abbr(v.team)} bans ${v.mode.toUpperCase()} ${v.map}`);
  if (v.action === "skip-ban") console.log(`  ${abbr(v.team)} ban skipped (${v.mode.toUpperCase()} pool too small)`);
  if (v.action === "pick") console.log(`  ${abbr(v.team)} picks Map ${v.slot}: ${v.map} ${v.mode.toUpperCase()}`);
  if (v.action === "remaining") console.log(`  Map ${v.slot}: ${v.map} ${v.mode.toUpperCase()} (remaining)`);
  if (v.action === "side") console.log(`    ${abbr(v.team)} chooses ${v.side} on Map ${v.slot}`);
}

console.log(`\nRESULT  ${teams[0].name} ${r.score[0]}–${r.score[1]} ${teams[1].name}   (${ms.toFixed(1)} ms)`);
for (const m of r.maps) {
  console.log(`  Map ${m.slot} ${m.mode.toUpperCase().padEnd(8)} ${m.map.padEnd(11)} ${m.score[0]}–${m.score[1]}  → ${abbr(m.winner)}`);
}

const pad = (s: string | number, n: number) => String(s).padStart(n);
const header = "  player        K    D   K/D   dmg   hill  FB  pl  df  cl  zone  dev cap";
const row = (h: string, l: ReturnType<typeof emptyLine>) =>
  `  ${h.padEnd(12)}${pad(l.kills, 3)}  ${pad(l.deaths, 3)}  ${(l.kills / Math.max(1, l.deaths)).toFixed(2)} ${pad(l.damage, 5)}  ${pad(l.hillTime, 4)}  ${pad(l.firstBloods, 2)}  ${pad(l.plants, 2)}  ${pad(l.defuses, 2)}  ${pad(l.clutches, 2)}  ${pad(l.zoneCaps, 4)}  ${pad(l.pickups, 3)} ${pad(l.oCaps, 3)}`;

for (const m of r.maps) {
  console.log(`\n── Map ${m.slot}: ${m.map} ${m.mode.toUpperCase()} ${m.score[0]}–${m.score[1]} (${Math.round(m.durationSec / 60)} min) ──`);
  for (const line of mapLog(m, { team: [abbr(0), abbr(1)], player: handles })) console.log("  " + line);
  if (args.has("box")) {
    console.log(header);
    m.box.forEach((l, i) => console.log(row(handles[i]!, l)));
  }
}

console.log(`\nSERIES BOX SCORE`);
console.log(header);
const totals = handles.map((_, i) => r.maps.reduce((acc, m) => addLines(acc, m.box[i]!), emptyLine()));
totals.forEach((l, i) => {
  if (i === 4) console.log("  " + "-".repeat(72));
  console.log(row(handles[i]!, l));
});
