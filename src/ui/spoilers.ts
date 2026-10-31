// Spoiler-free match day: which results the UI may show while the GM team has an
// unwatched series. The engine has already decided everything; this only controls
// what is revealed, and every view uses it the same way.
import { allUnwatched, type EventRecord, type PointsSnapshot, type SeasonData, type SeasonState, type SeriesRecord, type Src } from "../engine";

export interface Spoilers {
  /** Unwatched GM series, in play order (the first one is "up next" on match day). */
  unwatched: string[];
  /** Every series whose result would give an unwatched one away. */
  hidden: Set<string>;
  isHidden(seriesId: string): boolean;
  /** An event whose winner or placements would give an unwatched series away. */
  eventHidden(e: EventRecord): boolean;
  /** CDL points to show: current points minus anything the hidden results earned. */
  points: Record<string, number>;
  /** Points history up to the step before the first unwatched series (for the points race). */
  history: PointsSnapshot[];
  active: boolean;
}

/** The step index whose series includes this one. */
function stepIndexOf(state: SeasonState, rec: SeriesRecord): number {
  const p = rec.phase;
  return state.steps.findIndex((s) => {
    if (p.kind === "qualifiers") return s.kind === "week" && s.stage === p.stage && s.week === p.week;
    if (p.kind === "championship") return s.kind === "championship";
    return s.kind === p.kind && s.stage === p.stage;
  });
}

const refId = (src: Src) => ("winner" in src ? src.winner : "loser" in src ? src.loser : null);

export function spoilers(state: SeasonState, data: SeasonData): Spoilers {
  const unwatched = allUnwatched(state);
  const hidden = new Set(unwatched);

  // Bracket matches downstream of an unwatched one: their teams reveal who advanced.
  for (const e of state.events) {
    const hiddenDefs = new Set(e.matches.filter((m) => hidden.has(m.seriesId)).map((m) => m.def.id));
    if (!hiddenDefs.size) continue;
    for (const m of e.matches) {
      const deps = [refId(m.def.a), refId(m.def.b)].filter((x): x is string => !!x);
      if (deps.some((d) => hiddenDefs.has(d))) {
        hiddenDefs.add(m.def.id);
        hidden.add(m.seriesId);
      }
    }
  }

  // Points: take away what hidden results earned (qualifier wins, and the placement
  // points of any event a hidden match belongs to), so everything else stays current.
  const points = { ...state.points };
  for (const id of hidden) {
    const rec = state.series[id];
    if (rec?.phase.kind === "qualifiers") points[rec.winner] = (points[rec.winner] ?? 0) - data.season.points.qualifierWin;
  }
  for (const e of state.events) {
    if (!e.matches.some((m) => hidden.has(m.seriesId))) continue;
    for (const [team, p] of Object.entries(e.points)) points[team] = (points[team] ?? 0) - p;
  }

  let history = state.pointsHistory;
  if (unwatched.length) {
    const first = state.series[unwatched[0]!];
    const idx = first ? stepIndexOf(state, first) : -1;
    // pointsHistory[k] is the table after k steps (index 0 is the start of the season).
    if (idx >= 0) history = state.pointsHistory.slice(0, idx + 1);
  }

  return {
    unwatched,
    hidden,
    isHidden: (id) => hidden.has(id),
    eventHidden: (e) => e.matches.some((m) => hidden.has(m.seriesId)),
    points,
    history,
    active: unwatched.length > 0,
  };
}
