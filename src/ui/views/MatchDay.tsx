// Spoiler-free match day: your series has been played, but nothing about the result is
// shown until you watch it or skip to it.
import { gmMarkWatched } from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";

export function MatchDayBanner({ store, onWatch }: { store: SeasonStore; onWatch: (seriesId: string) => void }) {
  const { state, data, spoil, mutate } = store;
  const dir = directory(data);
  const id = spoil.unwatched[0]!;
  const rec = state.series[id]!;
  const gm = state.gm!.team;
  const opp = rec.teams[0] === gm ? rec.teams[1] : rec.teams[0];
  const more = spoil.unwatched.length - 1;

  return (
    <div className="card matchday">
      <div className="row">
        <div>
          <div className="pill">Match day{more > 0 ? ` · ${more + 1} matches to watch` : ""}</div>
          <h2 style={{ margin: "2px 0" }}>
            {dir.team(gm).name} vs {dir.team(opp).name}
          </h2>
          <div className="sub">
            {rec.label} · {rec.date} · Bo{rec.bestOf}. The result is ready. Standings, brackets and points stay as they were until you watch it or skip it.
          </div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => onWatch(id)}>
          Watch
        </button>
        <button className="btn" onClick={() => mutate((s) => gmMarkWatched(s, id))} title="Reveal the result without watching">
          Skip to result
        </button>
      </div>
    </div>
  );
}
