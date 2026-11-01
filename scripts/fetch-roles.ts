// Downloads each player's fight volume and real age, from the Call of
// Duty Esports Wiki's Cargo tables (CC BY-SA 3.0):
//   PlayerStats: per player per season, kills + deaths per map (how many fights they take)
//                and SnD opening duels (first kills + first deaths).
//   Players:     birthdates.
// The wiki has no AR/SMG field; src/engine/data/fights.ts uses fight volume instead.
//
//   npx tsx scripts/fetch-roles.ts   -> data/stats/{year}.fights.json, data/stats/players.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://cod-esports.fandom.com/api.php";
const UA = "CDLSeasonSim/0.1 (personal season simulator; one-off stats download)";
const GAP_MS = 45_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LICENSE = "CC BY-SA 3.0 — Call of Duty Esports Wiki (cod-esports.fandom.com) contributors";

async function cargo(params: Record<string, string>, attempt = 1): Promise<Record<string, string>[]> {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { cargoquery?: { title: Record<string, string> }[]; error?: { info: string } };
  if (j.error && /rate limit/i.test(j.error.info) && attempt <= 4) {
    console.log(`  rate limited; waiting ${90 * attempt}s`);
    await sleep(90_000 * attempt);
    return cargo(params, attempt + 1);
  }
  if (j.error) throw new Error(j.error.info);
  return (j.cargoquery ?? []).map((r) => r.title);
}

const seasonWhere = (y: string) =>
  `(TournamentPage LIKE "Call of Duty League/${y} Season%" OR TournamentPage="Call of Duty League Championship ${y}") AND (Kills>0 OR Deaths>0)`;

const links = new Set<string>();
for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.fights.json`;
  if (!existsSync(file)) {
    const rows = await cargo({
      tables: "PlayerStats",
      fields: "PlayerLink,Gamemode,COUNT(*)=Maps,SUM(Kills)=Kills,SUM(Deaths)=Deaths,SUM(SDFirstKill)=FirstKills,SUM(SDFirstDeath)=FirstDeaths",
      where: seasonWhere(y),
      group_by: "PlayerLink,Gamemode",
      order_by: "PlayerLink,Gamemode",
    });
    writeFileSync(file, JSON.stringify({ season: y, fetched: new Date().toISOString().slice(0, 10), source: `${API} (Cargo table PlayerStats)`, license: LICENSE, rows }, null, 1) + "\n");
    console.log(`${y} fights: ${rows.length} rows`);
    await sleep(GAP_MS);
  }
  for (const r of (JSON.parse(readFileSync(file, "utf8")) as { rows: { PlayerLink: string }[] }).rows) links.add(r.PlayerLink);
}

const pfile = "data/stats/players.json";
if (!existsSync(pfile)) {
  const ids = [...links].sort();
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60).map((id) => `"${id.replace(/"/g, '\\"')}"`);
    rows.push(...(await cargo({ tables: "Players", fields: "ID,Birthdate,Country", where: `ID IN (${chunk.join(",")})` })));
    if (i + 60 < ids.length) await sleep(GAP_MS);
  }
  writeFileSync(pfile, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), source: `${API} (Cargo table Players)`, license: LICENSE, rows }, null, 1) + "\n");
  console.log(`players: ${rows.length} of ${ids.length} found`);
}
