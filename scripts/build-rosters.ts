// Builds data/rosters/{year}.json from Call of Duty Esports Wiki event pages.
//
// Usage: npx tsx scripts/build-rosters.ts [dir-with-wikitext]   (default data/sources/fandom)
// The dir holds raw wikitext saved as {year}_Major_{n}.txt and {year}_Champs_{year}.txt,
// fetched from cod-esports.fandom.com/api.php (action=parse, prop=wikitext).
//
// Each event's "Participants" section lists every team's four starters. A snapshot is
// written per team per event, collapsed when the lineup did not change, and dated from
// the start of that stage's qualifiers (Champs: event start).
//
// Ratings come from season stat lines (data/stats/{year}.raw.json, see fetch-stats.ts and
// stat-ratings.ts) wherever a player has them. Players without stats keep the placeholder
// model: the average placement of the teams they played for plus deterministic variation.
// Consistency has no published stat and always uses the placeholder.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Season } from "../src/engine/data/schema";
import { CODES, GUESTS } from "./fandom-codes";
import { ratingsFromStats, statLines, teamMapMods, type RawStats } from "./stat-ratings";

const WIKI = "https://cod-esports.fandom.com/wiki/";

const STAT_TEAM_ALIASES: Record<string, Record<string, string>> = {
  "2025": { "las vegas falcons": "vegas-falcons" },
};

/** Team strength 0..1 by final placement (lower bound of the range). */
function placeStrength(place: number): number {
  if (place <= 1) return 1;
  if (place === 2) return 0.8;
  if (place === 3) return 0.65;
  if (place === 4) return 0.55;
  if (place <= 6) return 0.4;
  if (place <= 8) return 0.3;
  if (place <= 12) return 0.15;
  return 0.05;
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** Deterministic noise in [-1, 1] for (player, attribute). */
const noise = (key: string) => (fnv(key) / 0xffffffff) * 2 - 1;
const clamp = (x: number) => Math.max(40, Math.min(99, Math.round(x)));

const playerId = (handle: string) =>
  handle.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface EventRow { team: string; players: string[]; place?: number }

function parseEvent(text: string, codes: Record<string, string>, file: string): EventRow[] {
  const participants = text.split("==Participants==")[1]?.split(/\n==[^=]/)[0];
  if (!participants) throw new Error(`${file}: no Participants section`);
  const places = new Map<string, number>();
  for (const m of text.matchAll(/TournamentResults\/Line\|place=(\d+)[^|]*\|[^}]*?team=([A-Za-z0-9]+)/g)) {
    places.set(m[2]!, Number(m[1]));
  }
  return participants.split("{{TeamRoster|").slice(1).map((block) => {
    const code = block.match(/team=([^\n|]+)/)?.[1]?.trim() ?? "";
    const team = codes[code];
    if (!team) throw new Error(`${file}: unknown team code "${code}"`);
    const players = [...block.matchAll(/TeamRoster\/Line\|player=([^|}]+?)\s*(\|[^}]*)?}}/g)]
      .filter((m) => !/role=(c|coach)\b/.test(m[2] ?? ""))
      .map((m) => m[1]!.replace(/\s*\(.*\)$/, "").trim());
    if (players.length !== 4) throw new Error(`${file}: ${code} lists ${players.length} players`);
    return { team, players, place: places.get(code) };
  });
}

function build(dir: string, year: "2024" | "2025" | "2026") {
  const season = Season.parse(JSON.parse(readFileSync(`data/seasons/${year}.json`, "utf8")));
  const events = [
    ...season.stages.map((st) => ({
      file: `${year}_Major_${st.stage}.txt`,
      page: `Call_of_Duty_League/${year}_Season/Major_${st.stage}`,
      label: st.major.name,
      effective: st.qualifiers.start,
      weight: 1,
    })),
    {
      file: `${year}_Champs_${year}.txt`,
      page: `Call_of_Duty_League_Championship_${year}`,
      label: "Championship",
      effective: season.championship.start,
      weight: 2,
    },
  ];

  type Snap = { effective: string; event: string; starters: string[]; subs: string[]; source: string };
  const snaps = new Map<string, Snap[]>();
  const handles = new Map<string, string>();
  const strength = new Map<string, { sum: number; w: number }>();
  const changes: string[] = [];

  for (const ev of events) {
    const rows = parseEvent(readFileSync(join(dir, ev.file), "utf8"), CODES[year]!, ev.file);
    for (const row of rows) {
      const ids = row.players.map((h) => {
        const id = playerId(h);
        handles.set(id, h);
        return id;
      });
      if (row.place !== undefined) {
        for (const id of ids) {
          const s = strength.get(id) ?? { sum: 0, w: 0 };
          s.sum += placeStrength(row.place) * ev.weight;
          s.w += ev.weight;
          strength.set(id, s);
        }
      }
      const list = snaps.get(row.team) ?? [];
      const prev = list[list.length - 1];
      const same = prev && [...prev.starters].sort().join() === [...ids].sort().join();
      if (!same) {
        if (prev) {
          const out = prev.starters.filter((p) => !ids.includes(p));
          const inn = ids.filter((p) => !prev.starters.includes(p));
          changes.push(`${row.team} @ ${ev.label}: out ${out.join(", ")} / in ${inn.join(", ")}`);
        }
        list.push({ effective: ev.effective, event: ev.label, starters: ids, subs: [], source: WIKI + ev.page });
      }
      snaps.set(row.team, list);
    }
  }

  // Season stats, when downloaded.
  const rawPath = `data/stats/${year}.raw.json`;
  const raw: RawStats | null = existsSync(rawPath) ? JSON.parse(readFileSync(rawPath, "utf8")) : null;
  const linkToId = (link: string) => playerId(link.replace(/\s*\(.*\)$/, ""));
  const lines = raw ? statLines(raw, linkToId, season.thirdMode) : new Map();
  const statRatings = ratingsFromStats(lines);
  const teamNames = new Map<string, string>(season.teams.map((t) => [t.name.toLowerCase(), t.id]));
  for (const st of season.stages) {
    if (st.major.format.type === "proam-gsl") for (const g of st.major.format.guests) teamNames.set(g.name.toLowerCase(), g.id);
  }
  // Names the stats wiki uses that differ from data/seasons.
  for (const [alias, id] of Object.entries(STAT_TEAM_ALIASES[year] ?? {})) teamNames.set(alias, id);
  const unmatchedTeams = new Set<string>();
  const mods = raw
    ? teamMapMods(raw, (name) => {
        const id = teamNames.get(name.toLowerCase());
        if (!id) unmatchedTeams.add(name);
        return id;
      })
    : new Map<string, Record<string, number>>();

  const ratingsFor = (id: string) => {
    const s = strength.get(id);
    const base = 74 + 13 * (s && s.w ? s.sum / s.w : 0.15);
    const attr = (name: string, spread = 3) => clamp(base + spread * noise(`${id}:${name}`));
    const placeholder = {
      slaying: attr("slaying"),
      hp_obj: attr("hp_obj"),
      snd_iq: attr("snd_iq"),
      third_mode: attr("third_mode"),
      clutch: attr("clutch", 8),
      consistency: attr("consistency", 8),
    };
    const fromStats = statRatings.get(id);
    if (!fromStats) return placeholder;
    // K/D alone overrates good slayers on losing teams, so team results keep a 30% say.
    const blend = (statValue: number) => Math.round(0.7 * statValue + 0.3 * base);
    return {
      slaying: blend(fromStats.slaying),
      hp_obj: blend(fromStats.hp_obj),
      snd_iq: blend(fromStats.snd_iq),
      third_mode: blend(fromStats.third_mode),
      clutch: blend(fromStats.clutch),
      consistency: placeholder.consistency,
    };
  };
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const statsFor = (id: string) => {
    const l = lines.get(id);
    if (!l) return undefined;
    return {
      maps: l.maps,
      kd: round2(l.kd),
      hpKd: round2(l.hpKd),
      hpTimePerMap: Math.round(l.hpTimePerMap),
      sndKd: round2(l.sndKd),
      sndOpeningNet: round2(l.sndOpeningNet),
      thirdKd: round2(l.thirdKd),
    };
  };

  // Players with stat lines for a team but no Major lineup (qualifier subs) join its bench.
  const bench = new Map<string, string[]>();
  if (raw) {
    const inLineups = new Set([...snaps.values()].flatMap((l) => l.flatMap((sn) => sn.starters)));
    for (const r of raw.players) {
      const id = linkToId(r.PlayerLink!);
      const team = teamNames.get(r.Team!.toLowerCase());
      if (!team || inLineups.has(id) || !lines.has(id)) continue;
      handles.set(id, r.PlayerLink!.replace(/\s*\(.*\)$/, ""));
      bench.set(team, [...new Set([...(bench.get(team) ?? []), id])]);
    }
  }

  const toRoster = (team: string) => {
    const list = snaps.get(team)!;
    const ids = [...new Set([...list.flatMap((s) => s.starters), ...(bench.get(team) ?? [])])];
    return {
      team,
      players: ids.map((id) => ({
        id,
        handle: handles.get(id)!,
        role: "flex" as const,
        ratings: ratingsFor(id),
        ratingSource: statRatings.has(id) ? ("stats" as const) : ("placeholder" as const),
        stats: statsFor(id),
      })),
      snapshots: list,
      ...(mods.get(team) ? { mapMods: mods.get(team) } : {}),
    };
  };

  const missing = season.teams.filter((t) => !snaps.has(t.id)).map((t) => t.id);
  if (missing.length) throw new Error(`${year}: no roster found for ${missing.join(", ")}`);

  const out = {
    season: year,
    ratingsNote: raw
      ? `Ratings from ${year} season stat lines (${raw.source}, fetched ${raw.fetched}; ${raw.license}). Players without stats (ratingSource "placeholder") use team placements. Consistency is always a placeholder; clutch is a mild SnD K/D proxy. Roles default to flex.`
      : "PLACEHOLDER ratings: derived from team placements at the events each player attended plus deterministic per-player variation. Roles default to flex.",
    teams: season.teams.map((t) => toRoster(t.id)),
    guests: [...snaps.keys()].filter((t) => GUESTS.has(t)).map(toRoster),
  };
  mkdirSync("data/rosters", { recursive: true });
  writeFileSync(`data/rosters/${year}.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(`${year}: ${out.teams.length} teams, ${out.guests.length} guests, ${changes.length} roster changes`);
  if (raw) {
    const all = [...out.teams, ...out.guests].flatMap((t) => t.players);
    const withStats = all.filter((p) => p.ratingSource === "stats").length;
    const rosterIds = new Set(all.map((p) => p.id));
    const orphan = [...lines.entries()].filter(([id, l]) => !rosterIds.has(id) && l.maps >= 10).map(([id, l]) => `${id}(${l.maps})`);
    console.log(`  stats: ${withStats}/${all.length} roster players matched; map mods for ${mods.size} teams`);
    if (orphan.length) console.log(`  stat lines with no roster player (10+ maps): ${orphan.join(", ")}`);
    const noStats = all.filter((p) => p.ratingSource !== "stats").map((p) => p.handle);
    if (noStats.length) console.log(`  roster players without stats: ${noStats.join(", ")}`);
    if (unmatchedTeams.size) console.log(`  stats teams not matched: ${[...unmatchedTeams].join(", ")}`);
  } else {
    console.log("  no data/stats file; placeholder ratings");
  }
}

const dir = process.argv[2] ?? "data/sources/fandom";
for (const y of ["2024", "2025", "2026"] as const) build(dir, y);
