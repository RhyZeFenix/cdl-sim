// Heatmaps: where kills and deaths happen on a map across the season, from the replay
// positions. Each series is rebuilt from the seed when its event logs weren't kept.
import { loadSeasonData, replaySeries, type MapResult, type Mode, type SeasonState } from "../engine";
import { timelineFor } from "./replay/build";

export const HEAT_N = 50;

export interface HeatRequest {
  map: string;
  mode: Mode;
  /** "deaths": where players died; "kills": where the shots came from. */
  kind: "deaths" | "kills";
  team?: string;
  player?: string;
  /** Series to leave out (unwatched). */
  hidden: string[];
}

export interface Heatmap {
  cells: number[];
  max: number;
  maps: number;
  events: number;
}

export function runHeatmap(state: SeasonState, req: HeatRequest, onProgress?: (done: number, total: number) => void): Heatmap {
  const data = loadSeasonData(state.seasonId);
  const hidden = new Set(req.hidden);
  const series = Object.values(state.series).filter(
    (r) => !hidden.has(r.id) && r.maps.some((m) => m.map === req.map && m.mode === req.mode) && (!req.team || r.teams.includes(req.team)),
  );
  const cells = new Array<number>(HEAT_N * HEAT_N).fill(0);
  let maps = 0;
  let events = 0;
  series.forEach((r, n) => {
    const all = (r.hasEvents ? r.maps : replaySeries(state, data, r.id).maps) as MapResult[];
    for (const m of all) {
      if (m.map !== req.map || m.mode !== req.mode || !m.events) continue;
      const tl = timelineFor(m, `${r.id}:${m.slot}`);
      maps++;
      for (const k of tl.kills) {
        const who = req.kind === "deaths" ? k.on : k.by;
        const side = who < 4 ? 0 : 1;
        if (req.team && r.teams[side] !== req.team) continue;
        if (req.player && m.lineup[who] !== req.player) continue;
        const p = req.kind === "deaths" ? k.to : k.from;
        const i = Math.min(HEAT_N - 1, Math.max(0, Math.floor((p.x / 100) * HEAT_N)));
        const j = Math.min(HEAT_N - 1, Math.max(0, Math.floor((p.y / 100) * HEAT_N)));
        cells[j * HEAT_N + i]!++;
        events++;
      }
    }
    onProgress?.(n + 1, series.length);
  });
  return { cells, max: Math.max(1, ...cells), maps, events };
}
