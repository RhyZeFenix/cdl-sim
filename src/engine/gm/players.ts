// Player pages: a player's season, by mode and series by series, from stored box scores.
import type { Mode, Player } from "../data/schema";
import type { SeasonData } from "../data/registry";
import { playerInfo, type SeasonState } from "../season/season";
import { playerAge } from "./dynasty";

export interface ModeLine {
  mode: Mode;
  maps: number;
  wins: number;
  kills: number;
  deaths: number;
  damage: number;
  /** Mode-specific totals: hill seconds, first bloods, plants, defuses, clutches, zone caps, carries, captures. */
  extra: Record<string, number>;
}

export interface SeriesLine {
  id: string;
  date: string;
  label: string;
  team: string;
  opponent: string;
  won: boolean;
  maps: number;
  kills: number;
  deaths: number;
}

export interface PlayerForm {
  /** K/D over the last five series and over the season. */
  recentKd: number;
  seasonKd: number;
  /** recentKd / seasonKd. */
  ratio: number;
  label: "hot" | "cold" | "steady";
  /** K/D per series for the last ten, oldest first. */
  trend: number[];
}

export interface PlayerProfile {
  info?: Player;
  age: number;
  modes: ModeLine[];
  series: SeriesLine[];
  total: { maps: number; kills: number; deaths: number };
  /** Hot or cold lately, once they've played six series. */
  form?: PlayerForm;
}

/** Recent form from a player's series (newest first). */
export function playerForm(series: SeriesLine[]): PlayerForm | undefined {
  if (series.length < 6) return undefined;
  const kd = (xs: SeriesLine[]) => xs.reduce((s, x) => s + x.kills, 0) / Math.max(1, xs.reduce((s, x) => s + x.deaths, 0));
  const recentKd = kd(series.slice(0, 5));
  const seasonKd = kd(series);
  const ratio = recentKd / Math.max(0.01, seasonKd);
  return {
    recentKd,
    seasonKd,
    ratio,
    label: ratio >= 1.12 ? "hot" : ratio <= 0.88 ? "cold" : "steady",
    trend: series
      .slice(0, 10)
      .reverse()
      .map((x) => x.kills / Math.max(1, x.deaths)),
  };
}

/** Everything a player did this season, leaving out `hidden` (unwatched) series. */
export function playerProfile(state: SeasonState, data: SeasonData, id: string, hidden: Set<string>): PlayerProfile {
  const modes = new Map<Mode, ModeLine>();
  const series: SeriesLine[] = [];
  for (const r of Object.values(state.series)) {
    if (hidden.has(r.id)) continue;
    let line: SeriesLine | null = null;
    for (const m of r.maps) {
      const i = m.lineup.indexOf(id);
      if (i < 0) continue;
      const side = i < 4 ? 0 : 1;
      const b = m.box[i]!;
      line ??= { id: r.id, date: r.date, label: r.label, team: r.teams[side], opponent: r.teams[1 - side]!, won: r.winner === r.teams[side], maps: 0, kills: 0, deaths: 0 };
      line.maps++;
      line.kills += b.kills;
      line.deaths += b.deaths;
      const ml = modes.get(m.mode) ?? { mode: m.mode, maps: 0, wins: 0, kills: 0, deaths: 0, damage: 0, extra: {} };
      ml.maps++;
      if (m.winner === side) ml.wins++;
      ml.kills += b.kills;
      ml.deaths += b.deaths;
      ml.damage += b.damage;
      const add = (k: string, v: number) => (ml.extra[k] = (ml.extra[k] ?? 0) + v);
      if (m.mode === "hp") add("Hill time", b.hillTime);
      if (m.mode === "snd") {
        add("First bloods", b.firstBloods);
        add("Plants", b.plants);
        add("Defuses", b.defuses);
        add("Clutches", b.clutches);
      }
      if (m.mode === "control") add("Zone caps", b.zoneCaps);
      if (m.mode === "overload") {
        add("Carries", b.pickups);
        add("Captures", b.oCaps);
      }
      modes.set(m.mode, ml);
    }
    if (line) series.push(line);
  }
  series.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id.localeCompare(a.id)));
  const order: Mode[] = ["hp", "snd", "control", "overload"];
  const list = [...modes.values()].sort((a, b) => order.indexOf(a.mode) - order.indexOf(b.mode));
  return {
    info: playerInfo(state, data, id),
    age: playerAge(state, id),
    modes: list,
    series,
    total: list.reduce((t, m) => ({ maps: t.maps + m.maps, kills: t.kills + m.kills, deaths: t.deaths + m.deaths }), { maps: 0, kills: 0, deaths: 0 }),
    form: playerForm(series),
  };
}
