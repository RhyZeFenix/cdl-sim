// Real Major and Champs placements from the committed wiki pages (data/sources/fandom),
// bundled so the app can show each event's real result next to the sim's odds.
//
//   npx tsx scripts/make-real-events.ts   -> data/results/{year}.events.json
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEASON_IDS, loadSeasonData } from "../src/engine";
import { CODES } from "./fandom-codes";

for (const y of SEASON_IDS) {
  const data = loadSeasonData(y);
  const files = [
    ...data.season.stages.map((st) => ({ file: `${y}_Major_${st.stage}.txt`, kind: "major" as const, stage: st.stage, name: st.major.name })),
    { file: `${y}_Champs_${y}.txt`, kind: "championship" as const, stage: undefined, name: data.season.championship.name },
  ];
  const events = files.map(({ file, kind, stage, name }) => {
    const text = readFileSync(join("data/sources/fandom", file), "utf8");
    const placements: Record<string, [number, number]> = {};
    for (const m of text.matchAll(/TournamentResults\/Line\|place=(\d+)(?:-(\d+))?\s*\|[^}]*?team=([A-Za-z0-9]+)/g)) {
      const team = CODES[y]![m[3]!];
      if (!team) continue;
      placements[team] = [Number(m[1]), m[2] ? Number(m[2]) : Number(m[1])];
    }
    const winner = Object.entries(placements).find(([, p]) => p[0] === 1)?.[0];
    if (!winner) throw new Error(`${file}: no winner found`);
    return { kind, ...(stage ? { stage } : {}), name, winner, placements };
  });
  writeFileSync(
    `data/results/${y}.events.json`,
    JSON.stringify({ season: y, source: "Call of Duty Esports Wiki (CC BY-SA 3.0), data/sources/fandom", events }, null, 1) + "\n",
  );
  console.log(`${y}: ${events.map((e) => `${e.name} → ${e.winner}`).join(", ")}`);
}
