// The end-of-season review: your record, best win, worst loss, top performer, event
// finishes and awards, in one object the UI turns into a page and a share card.
import type { SeasonData } from "../data/registry";
import { playerInfo, playerLines, type SeasonState } from "../season/season";
import { seasonLabel, seasonRecap } from "./dynasty";
import { strengthRanking } from "./owner";
import type { SeasonRecap } from "./types";

export interface SeasonReview {
  label: string;
  teamName: string;
  recap: SeasonRecap;
  bestWin?: { opponent: string; score: [number, number]; label: string; seriesId: string };
  worstLoss?: { opponent: string; score: [number, number]; label: string; seriesId: string };
  topPerformer?: { player: string; handle: string; kd: number; maps: number };
  finishes: { name: string; place: [number, number] | null }[];
  awards: { award: string; handle: string }[];
}

export function seasonReview(state: SeasonState, data: SeasonData): SeasonReview {
  const gm = state.gm!;
  const recap = seasonRecap(state, data);
  // Opponent strength from the preseason ranking (1 = strongest).
  const rank = new Map(strengthRanking(state, data, data.season.stages[0]!.qualifiers.start).map((r, i) => [r.team, i + 1]));
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team));
  const view = (r: (typeof mine)[number]) => {
    const side = r.teams[0] === gm.team ? 0 : 1;
    return { opponent: r.teams[1 - side]!, score: [r.score[side], r.score[1 - side]] as [number, number], label: r.label, seriesId: r.id };
  };
  const wins = mine.filter((r) => r.winner === gm.team).map(view);
  const losses = mine.filter((r) => r.winner !== gm.team).map(view);
  const bestWin = wins.sort((a, b) => (rank.get(a.opponent) ?? 99) - (rank.get(b.opponent) ?? 99))[0];
  const worstLoss = losses.sort((a, b) => (rank.get(b.opponent) ?? 0) - (rank.get(a.opponent) ?? 0))[0];
  const lines = playerLines(state, mine.map((r) => r.id)).filter((l) => l.team === gm.team && l.maps >= 6);
  const top = lines[0];
  const name = (id: string) => playerInfo(state, data, id)?.handle ?? id;
  const a = state.awards;
  const awards: SeasonReview["awards"] = [];
  if (a) {
    const add = (award: string, id?: string) => id && gm.roster.includes(id) && awards.push({ award, handle: name(id) });
    add("MVP", a.mvp);
    add("Rookie of the Year", a.rookie);
    add("Champs MVP", a.champsMvp);
    a.allCdl[0].forEach((id) => add("All-CDL First Team", id));
    a.allCdl[1].forEach((id) => add("All-CDL Second Team", id));
  }
  return {
    label: seasonLabel(state, data),
    teamName: recap.teamName,
    recap,
    bestWin,
    worstLoss,
    topPerformer: top && { player: top.player, handle: name(top.player), kd: top.kd, maps: top.maps },
    finishes: state.events.filter((e) => e.kind !== "minor" || e.placements[gm.team]).map((e) => ({ name: e.name, place: e.placements[gm.team] ?? null })),
    awards,
  };
}
