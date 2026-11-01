// Downloads per-map aggregates for each CDL season from the Call of Duty Esports Wiki's
// Cargo table `PlayerStats` (one row per player per map), split by winners and losers.
// From these: Hardpoint team scores (hill time), Overload captures, and kills per map,
// which give each map's typical margin and pace. CC BY-SA 3.0; attribution is kept.
//
//   npx tsx scripts/fetch-mapstats.ts   -> data/stats/{year}.maps.json   (map pace and closeness)
//                                        -> data/stats/{year}.snd.json    (SnD plants, defuses, first bloods per map)
//                                        -> data/stats/{year}.form.json   (kills and deaths per player per event page)
import { existsSync, writeFileSync } from "node:fs";

const API = "https://cod-esports.fandom.com/api.php";
const UA = "CDLSeasonSim/0.1 (personal season simulator; one-off stats download)";
const GAP_MS = 45_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cargo(params: Record<string, string>, attempt = 1): Promise<Record<string, string>[]> {
  const q = new URLSearchParams({ action: "cargoquery", format: "json", limit: "500", ...params });
  const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { cargoquery?: { title: Record<string, string> }[]; error?: { info: string } };
  if (j.error && /rate limit/i.test(j.error.info) && attempt <= 4) {
    const wait = 90_000 * attempt;
    console.log(`  rate limited; waiting ${wait / 1000}s`);
    await sleep(wait);
    return cargo(params, attempt + 1);
  }
  if (j.error) throw new Error(j.error.info);
  return (j.cargoquery ?? []).map((r) => r.title);
}

const seasonWhere = (y: string) =>
  `(TournamentPage LIKE "Call of Duty League/${y} Season%" OR TournamentPage="Call of Duty League Championship ${y}") AND (Kills>0 OR Deaths>0)`;

for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.maps.json`;
  if (existsSync(file)) {
    console.log(`${y} maps: already downloaded`);
    continue;
  }
  const rows = await cargo({
    tables: "PlayerStats",
    fields: "Map,Gamemode,Win,COUNT(*)=Rows,SUM(Kills)=Kills,SUM(HPTime)=HPTime,SUM(OVRCaps)=OVRCaps,SUM(SDKills)=SDKills,SUM(ConCaptures)=ConCaptures",
    where: seasonWhere(y),
    group_by: "Map,Gamemode,Win",
    order_by: "Map,Gamemode,Win",
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
  console.log(`${y} maps: ${rows.length} map-mode-result rows`);
  await sleep(GAP_MS);
}

async function cargoAll(params: Record<string, string>): Promise<Record<string, string>[]> {
  const all: Record<string, string>[] = [];
  for (let offset = 0; ; offset += 500) {
    const rows = await cargo({ ...params, offset: String(offset) });
    all.push(...rows);
    if (rows.length < 500) return all;
    await sleep(GAP_MS);
  }
}

const save = (file: string, y: string, rows: Record<string, string>[]) =>
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

for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.snd.json`;
  if (existsSync(file)) {
    console.log(`${y} snd: already downloaded`);
    continue;
  }
  const rows = await cargo({
    tables: "PlayerStats",
    fields: "Map,Win,COUNT(*)=Rows,SUM(SDPlants)=Plants,SUM(SDDefuses)=Defuses,SUM(SDFirstKill)=FirstKills,SUM(SDKills)=Kills",
    where: `${seasonWhere(y)} AND Gamemode="Search and Destroy"`,
    group_by: "Map,Win",
    order_by: "Map,Win",
  });
  save(file, y, rows);
  console.log(`${y} snd: ${rows.length} rows`);
  await sleep(GAP_MS);
}

for (const y of ["2024", "2025", "2026"]) {
  const file = `data/stats/${y}.form.json`;
  if (existsSync(file)) {
    console.log(`${y} form: already downloaded`);
    continue;
  }
  const rows = await cargoAll({
    tables: "PlayerStats",
    fields: "PlayerLink,TournamentPage,COUNT(*)=Maps,SUM(Kills)=Kills,SUM(Deaths)=Deaths",
    where: seasonWhere(y),
    group_by: "PlayerLink,TournamentPage",
    order_by: "PlayerLink,TournamentPage",
  });
  save(file, y, rows);
  console.log(`${y} form: ${rows.length} player-event rows`);
  await sleep(GAP_MS);
}
