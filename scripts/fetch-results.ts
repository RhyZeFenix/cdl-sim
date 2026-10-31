// Downloads every real CDL series result for each season from the Call of Duty Esports
// Wiki's Cargo table `MatchSchedule` (CC BY-SA 3.0) for the backtest.
//
//   npx tsx scripts/fetch-results.ts   -> data/results/{2024,2025,2026}.raw.json
//
// One request per season, spaced out with rate-limit backoff; existing files are skipped.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const API = "https://cod-esports.fandom.com/api.php";
const UA = "CDLSeasonSim/0.1 (personal season simulator; one-off results download)";
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
  const rows = (j.cargoquery ?? []).map((r) => r.title);
  if (rows.length >= 500) throw new Error("hit the 500-row limit; add paging");
  return rows;
}

mkdirSync("data/results", { recursive: true });
for (const y of ["2024", "2025", "2026"]) {
  const file = `data/results/${y}.raw.json`;
  if (existsSync(file)) {
    console.log(`${y}: already downloaded`);
    continue;
  }
  const series = await cargo({
    tables: "MatchSchedule",
    fields: "OverviewPage,Tab,Round,Phase,BestOf,Team1,Team2,Team1Score,Team2Score,Winner,DateTime_UTC",
    where: `(OverviewPage LIKE "Call of Duty League/${y} Season%" OR OverviewPage="Call of Duty League Championship ${y}") AND Winner IS NOT NULL`,
    order_by: "DateTime_UTC",
  });
  writeFileSync(
    file,
    JSON.stringify(
      {
        season: y,
        fetched: new Date().toISOString().slice(0, 10),
        source: `${API} (Cargo table MatchSchedule)`,
        license: "CC BY-SA 3.0 — Call of Duty Esports Wiki (cod-esports.fandom.com) contributors",
        series,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`${y}: ${series.length} series`);
  await sleep(GAP_MS);
}
