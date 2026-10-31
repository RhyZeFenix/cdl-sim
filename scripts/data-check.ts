// Prints a summary of every season's data after validation: `npm run data:check`.
import { SEASON_IDS, loadSeasonData } from "../src/engine";

for (const id of SEASON_IDS) {
  const { season, rosters, veto } = loadSeasonData(id);
  console.log(`\n=== ${season.label}  (third mode: ${season.thirdMode})`);
  console.log(`veto: ${season.veto.bo5}, ${season.veto.bo7}${veto.bo7.verified ? "" : "*"}, ${season.veto.bo9}${veto.bo9.verified ? "" : "*"}   (* = unverified)`);
  console.log(`tiebreakers: ${season.tiebreakers.join(" > ")}`);
  for (const st of season.stages) {
    const pools = [...new Set(st.qualifiers.weeks.map((w) => w.mapPool))].join(" → ");
    const minor = st.minor ? ` | ${st.minor.name} ${st.minor.start} (${st.minor.format.type})` : "";
    const res = st.major.realResult;
    console.log(
      `  Stage ${st.stage}: quals ${st.qualifiers.start}..${st.qualifiers.end}, ${st.qualifiers.matchesPerTeam} matches, pools ${pools}${minor}`,
    );
    console.log(
      `           ${st.major.name} ${st.major.start} ${st.major.city ?? ""} [${st.major.format.type}]` +
        (res ? `  real: ${res.winner} def. ${res.runnerUp}${res.score ? " " + res.score : ""}` : ""),
    );
  }
  const c = season.championship;
  console.log(`  Champs ${c.start} ${c.city} Bo${c.finalBestOf} GF  real: ${c.realResult?.winner} def. ${c.realResult?.runnerUp} ${c.realResult?.score ?? ""}`);
  for (const p of season.mapPools) console.log(`  pool ${p.id.padEnd(9)} HP ${p.hp.length} | SnD ${p.snd.length} | 3rd ${p.third.length}: ${p.third.join(", ")}`);
  const changes = rosters.teams.reduce((n, t) => n + t.snapshots.length - 1, 0);
  console.log(`  rosters: ${rosters.teams.length} teams, ${rosters.guests.length} guests, ${changes} lineup changes`);
  if (season.unverified.length) console.log(`  unverified:\n    - ${season.unverified.join("\n    - ")}`);
}
console.log("\nAll data valid.");
