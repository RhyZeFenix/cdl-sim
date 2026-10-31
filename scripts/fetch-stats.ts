// Downloads per-player and team-by-map aggregates for each CDL season from the
// Call of Duty Esports Wiki's Cargo table `PlayerStats` (one row per player per map).
// Content is CC BY-SA 3.0; attribution is kept in each output file.
//
//   npx tsx scripts/fetch-stats.ts   -> data/stats/{year}.raw.json      (player and team-map aggregates)
//                                    -> data/stats/{year}.lineups.json  (maps per team, player and event page)
//                                    -> data/stats/{year}.consistency.json (per player and mode: maps, sum and
//                                       sum of squares of per-map kills minus deaths, for map-to-map spread)
//
// Two requests per season, spaced well apart; Cargo rate-limits aggregate queries, so a
// rate-limit answer backs off and retries. Seasons already on disk are skipped.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const API = "https://cod-esports.fandom.com/api.php";
const UA = "CDLSeasonSim/0.1 (personal season simulator; one-off stats download)";
const GAP_MS = 45_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cargo(params: Record<string, string>, attempt = 1, allowFull = false): Promise<Record<string, string>[]> {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { cargoquery?: { title: Record<string, string> }[]; error?: { info: string } };
  if (j.error && /rate limit/i.test(j.error.info) && attempt <= 4) {
    const wait = 90_000 * attempt;
    console.log(`  rate limited; waiting ${wait / 1000}s`);
    await sleep(wait);
    return cargo(params, attempt + 1, allowFull);
  }
  if (j.error) throw new Error(j.error.info);
  const rows = (j.cargoquery ?? []).map((r) => r.title);
  if (rows.length >= 500 && !allowFull) throw new Error("hit the 500-row limit; use cargoAll");
  return rows;
}

/** Pages through a query 500 rows at a time. */
async function cargoAll(params: Record<string, string>): Promise<Record<string, string>[]> {
  const all: Record<string, string>[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await cargo({ ...params, offset: String(offset) }, 1, true);
    all.push(...rows);
    if (rows.length < 500) return all;
    await sleep(GAP_MS);
  }
}

const seasonWhere = (y: string) =>
  `(TournamentPage LIKE "Call of Duty League/${y} Season%" OR TournamentPage="Call of Duty League Championship ${y}") AND (Kills>0 OR Deaths>0)`;

const sum = (f: string) => `SUM(${f})=${f}`;
const count = (f: string, as: string) => `COUNT(${f})=${as}`;

async function season(y: string) {
  const players = await cargo({
    tables: "PlayerStats",
    fields: [
      "PlayerLink",
      "Team",
      "COUNT(*)=Maps",
      ...["Kills", "Deaths", "HPKills", "HPDeaths", "HPTime", "SDKills", "SDDeaths", "SDPlants", "SDDefuses", "SDFirstKill", "SDFirstDeath"].map(sum),
      ...["ConKills", "ConDeaths", "ConCaptures", "OVRKills", "OVRDeaths", "OVRCaps"].map(sum),
      count("HPKills", "HPMaps"),
      count("SDKills", "SDMaps"),
      count("ConKills", "ConMaps"),
      count("OVRKills", "OVRMaps"),
    ].join(","),
    where: seasonWhere(y),
    group_by: "PlayerLink,Team",
  });
  await sleep(GAP_MS);
  // Rows are per player, so a team's map count is rows / 4.
  const maps = await cargo({
    tables: "PlayerStats",
    fields: "Team,Map,Gamemode,COUNT(*)=Rows,SUM(Win)=WinRows",
    where: seasonWhere(y),
    group_by: "Team,Map,Gamemode",
  });
  return {
    season: y,
    fetched: new Date().toISOString().slice(0, 10),
    source: `${API} (Cargo table PlayerStats)`,
    license: "CC BY-SA 3.0 — Call of Duty Esports Wiki (cod-esports.fandom.com) contributors",
    players,
    teamMaps: maps,
  };
}

mkdirSync("data/stats", { recursive: true });
for (const y of ["2024", "2025", "2026"]) {
  if (existsSync(`data/stats/${y}.raw.json`)) {
    console.log(`${y}: already downloaded`);
    continue;
  }
  const out = await season(y);
  writeFileSync(`data/stats/${y}.raw.json`, JSON.stringify(out, null, 1) + "\n");
  console.log(`${y}: ${out.players.length} player-team rows, ${out.teamMaps.length} team-map rows`);
  await sleep(GAP_MS);
}

// Who played for whom at each event page (qualifier stages included), for roster snapshots.
for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.lineups.json`;
  if (existsSync(file)) {
    console.log(`${y} lineups: already downloaded`);
    continue;
  }
  const rows = await cargoAll({
    tables: "PlayerStats",
    fields: "Team,PlayerLink,TournamentPage,COUNT(*)=Maps,MIN(Date)=First,MAX(Date)=Last",
    where: seasonWhere(y),
    group_by: "Team,PlayerLink,TournamentPage",
    order_by: "Team,TournamentPage,PlayerLink",
  });
  writeFileSync(
    file,
    JSON.stringify(
      {
        season: y,
        fetched: new Date().toISOString().slice(0, 10),
        source: `${API} (Cargo table PlayerStats)`,
        license: "CC BY-SA 3.0 — Call of Duty Esports Wiki (cod-esports.fandom.com) contributors",
        rows,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`${y} lineups: ${rows.length} team-player-event rows`);
  await sleep(GAP_MS);
}

// Map-to-map spread: the wiki sums per-map (kills - deaths) and its square per player and mode.
for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.consistency.json`;
  if (existsSync(file)) {
    console.log(`${y} consistency: already downloaded`);
    continue;
  }
  const rows = await cargoAll({
    tables: "PlayerStats",
    fields: "PlayerLink,Gamemode,COUNT(*)=Maps,SUM(Kills-Deaths)=PM,SUM((Kills-Deaths)*(Kills-Deaths))=PM2",
    where: seasonWhere(y),
    group_by: "PlayerLink,Gamemode",
    order_by: "PlayerLink,Gamemode",
  });
  writeFileSync(
    file,
    JSON.stringify(
      {
        season: y,
        fetched: new Date().toISOString().slice(0, 10),
        source: `${API} (Cargo table PlayerStats)`,
        license: "CC BY-SA 3.0 — Call of Duty Esports Wiki (cod-esports.fandom.com) contributors",
        rows,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`${y} consistency: ${rows.length} player-mode rows`);
  await sleep(GAP_MS);
}
