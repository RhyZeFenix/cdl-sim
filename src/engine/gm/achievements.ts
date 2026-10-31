// Achievements: milestones a GM unlocks once per save (they carry through a dynasty).
// Each remembers the series that earned it, so it stays hidden until that's watched.
import type { SeasonData } from "../data/registry";
import type { SeasonState, SeriesRecord } from "../season/season";
import { seasonLabel } from "./dynasty";
import { pushInbox } from "./inbox";

export interface Achievement {
  id: string;
  title: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first-win", title: "First blood", text: "Win your first series" },
  { id: "comeback", title: "Reverse sweep", text: "Win a series after going 0–2 down" },
  { id: "giant-killer", title: "Giant killer", text: "Beat the preseason favourite" },
  { id: "streak-5", title: "On fire", text: "Win five series in a row" },
  { id: "perfect-stage", title: "Perfect stage", text: "Win every qualifier match in a stage" },
  { id: "major", title: "Major winner", text: "Win a Major" },
  { id: "champs", title: "World champions", text: "Win Champs" },
  { id: "broom", title: "Broom closet", text: "Sweep ten series in one season" },
  { id: "dealer", title: "Wheeler-dealer", text: "Make three trades in one season" },
  { id: "dream-staff", title: "Dream staff", text: "Have a 5★ coach and a 5★ analyst at once" },
  { id: "homegrown", title: "Homegrown", text: "An academy graduate wins an award" },
  { id: "dynasty", title: "Dynasty", text: "Start a third season in the same save" },
];

export interface UnlockedAchievement {
  id: string;
  season: string;
  date: string;
  refs: string[];
}

function unlock(state: SeasonState, data: SeasonData, id: string, date: string, refs: string[]): void {
  const gm = state.gm!;
  if (gm.achievements?.some((a) => a.id === id)) return;
  const def = ACHIEVEMENTS.find((a) => a.id === id)!;
  gm.achievements = [...(gm.achievements ?? []), { id, season: seasonLabel(state, data), date, refs }];
  pushInbox(state, { date, kind: "award", title: `Achievement: ${def.title}`, body: def.text + ".", refs });
}

/** Checks after a GM series. */
export function achievementsAfterSeries(state: SeasonState, data: SeasonData, rec: SeriesRecord): void {
  const gm = state.gm!;
  if (rec.winner !== gm.team) return;
  const refs = [rec.id];
  const side = rec.teams[0] === gm.team ? 0 : 1;
  unlock(state, data, "first-win", rec.date, refs);
  // 0-2 down: the first two maps went the other way.
  if (rec.maps.length >= 4 && rec.maps[0]!.winner !== side && rec.maps[1]!.winner !== side) unlock(state, data, "comeback", rec.date, refs);
  if (gm.favorite && rec.teams.includes(gm.favorite)) unlock(state, data, "giant-killer", rec.date, refs);
  if ((gm.streak ?? 0) >= 5) unlock(state, data, "streak-5", rec.date, refs);
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team));
  const sweeps = mine.filter((r) => r.winner === gm.team && Math.min(...r.score) === 0);
  if (sweeps.length >= 10) unlock(state, data, "broom", rec.date, sweeps.map((r) => r.id));
}

/** Checks after a step (stage, event and season milestones). */
export function achievementsAfterStep(state: SeasonState, data: SeasonData): void {
  const gm = state.gm!;
  const date = state.pointsHistory[state.pointsHistory.length - 1]?.date ?? "";
  for (const st of data.season.stages) {
    const ids = state.qualifiers[st.stage - 1]!.filter((id) => state.series[id]!.teams.includes(gm.team));
    const perStage = st.qualifiers.matchesPerTeam;
    if (ids.length === perStage && ids.every((id) => state.series[id]!.winner === gm.team)) unlock(state, data, "perfect-stage", date, ids);
  }
  for (const e of state.events) {
    if (e.placements[gm.team]?.[0] !== 1) continue;
    const refs = e.matches.map((m) => m.seriesId);
    if (e.kind === "major") unlock(state, data, "major", date, refs);
    if (e.kind === "championship") unlock(state, data, "champs", date, refs);
  }
  if ((gm.trades?.length ?? 0) >= 3) unlock(state, data, "dealer", date, []);
  if (gm.staff?.coach?.rating === 5 && gm.staff?.analyst?.rating === 5) unlock(state, data, "dream-staff", date, []);
  const a = state.awards;
  if (a) {
    const winners = [a.mvp, a.rookie, a.champsMvp, ...a.allCdl.flat()].filter(Boolean) as string[];
    const champs = state.events.find((e) => e.kind === "championship");
    if (winners.some((id) => id.startsWith("pro-") && gm.roster.includes(id))) unlock(state, data, "homegrown", date, champs?.matches.map((m) => m.seriesId) ?? []);
  }
  if ((state.dynasty?.year ?? 1) >= 3) unlock(state, data, "dynasty", date, []);
}

/** Unlocked achievements the UI may show (not ones earned by an unwatched series). */
export function visibleAchievements(state: SeasonState, hidden: Set<string>): UnlockedAchievement[] {
  return (state.gm?.achievements ?? []).filter((a) => !a.refs.some((r) => hidden.has(r)));
}
