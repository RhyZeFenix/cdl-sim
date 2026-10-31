// Season stats for team pages and the records page. Pure functions over the season
// state; everything takes the hidden (unwatched) series to leave out.
import { nextStepDate, playerInfo, strengthRanking, teamLineup, weekDate, type Mode, type SeasonData, type SeasonState, type SeriesRecord } from "../engine";

const visible = (state: SeasonState, hidden: Set<string>) =>
  Object.values(state.series)
    .filter((r) => !hidden.has(r.id))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

export interface MapRecordLine {
  mode: Mode;
  map: string;
  w: number;
  l: number;
}

export interface TeamProfile {
  series: SeriesRecord[];
  wins: number;
  maps: [number, number];
  byMap: MapRecordLine[];
  lineup: string[];
  /** Everyone the team used this season, most maps first. */
  usedPlayers: { id: string; maps: number }[];
  /** Average overall of the lineup at the start of each stage (and Champs). */
  strength: { label: string; ovr: number }[];
}

export function teamProfile(state: SeasonState, data: SeasonData, team: string, hidden: Set<string>): TeamProfile {
  const series = visible(state, hidden).filter((r) => r.teams.includes(team));
  const byMap = new Map<string, MapRecordLine>();
  const used = new Map<string, number>();
  let mw = 0;
  let ml = 0;
  for (const r of series) {
    const side = r.teams[0] === team ? 0 : 1;
    for (const m of r.maps) {
      const k = `${m.mode}:${m.map}`;
      const line = byMap.get(k) ?? { mode: m.mode, map: m.map, w: 0, l: 0 };
      if (m.winner === side) {
        line.w++;
        mw++;
      } else {
        line.l++;
        ml++;
      }
      byMap.set(k, line);
      for (const id of m.lineup.slice(side * 4, side * 4 + 4)) used.set(id, (used.get(id) ?? 0) + 1);
    }
  }
  const strength = [
    ...data.season.stages.map((st) => ({ label: `Stage ${st.stage}`, date: weekDate(data.season, st.stage, 1) })),
    { label: "Champs", date: data.season.championship.start },
  ].map(({ label, date }) => {
    const ranking = strengthRanking(state, data, date);
    return { label, ovr: Math.round((ranking.find((r) => r.team === team)?.ovr ?? 0) * 10) / 10 };
  });
  return {
    series,
    wins: series.filter((r) => r.winner === team).length,
    maps: [mw, ml],
    byMap: [...byMap.values()].sort((a, b) => a.mode.localeCompare(b.mode) || b.w + b.l - (a.w + a.l)),
    lineup: teamLineup(state, data, team, nextStepDate(state, data)),
    usedPlayers: [...used.entries()].map(([id, maps]) => ({ id, maps })).sort((a, b) => b.maps - a.maps),
    strength,
  };
}

export function headToHead(state: SeasonState, a: string, b: string, hidden: Set<string>): SeriesRecord[] {
  return visible(state, hidden).filter((r) => r.teams.includes(a) && r.teams.includes(b));
}

export interface Records {
  upsets: { series: SeriesRecord; gap: number }[];
  streaks: { team: string; length: number }[];
  bestMaps: { series: SeriesRecord; player: string; kills: number; deaths: number; mode: Mode; map: string }[];
  sweeps: { team: string; count: number }[];
}

export function seasonRecords(state: SeasonState, data: SeasonData, hidden: Set<string>): Records {
  const all = visible(state, hidden);
  // Upsets: the winner's preseason strength rank much lower than the loser's.
  const rank = new Map(strengthRanking(state, data, data.season.stages[0]!.qualifiers.start).map((r, i) => [r.team, i + 1]));
  const upsets = all
    .map((r) => {
      const loser = r.winner === r.teams[0] ? r.teams[1] : r.teams[0];
      return { series: r, gap: (rank.get(r.winner) ?? 0) - (rank.get(loser) ?? 0) };
    })
    .filter((u) => u.gap >= 4)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 8);

  const streaks = data.season.teams
    .map((t) => {
      let best = 0;
      let cur = 0;
      for (const r of all.filter((x) => x.teams.includes(t.id))) {
        cur = r.winner === t.id ? cur + 1 : 0;
        best = Math.max(best, cur);
      }
      return { team: t.id, length: best };
    })
    .sort((a, b) => b.length - a.length)
    .slice(0, 6);

  const bestMaps: Records["bestMaps"] = [];
  for (const r of all) {
    for (const m of r.maps) {
      m.lineup.forEach((id, i) => {
        if (id.startsWith("repl-")) return;
        bestMaps.push({ series: r, player: id, kills: m.box[i]!.kills, deaths: m.box[i]!.deaths, mode: m.mode, map: m.map });
      });
    }
  }
  bestMaps.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  const sweeps = data.season.teams
    .map((t) => ({ team: t.id, count: all.filter((r) => r.winner === t.id && Math.min(...r.score) === 0).length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return { upsets, streaks, bestMaps: bestMaps.slice(0, 10), sweeps };
}

export const handleOf = (state: SeasonState, data: SeasonData, id: string) => playerInfo(state, data, id)?.handle ?? (id.startsWith("repl-") ? "Replacement" : id);
