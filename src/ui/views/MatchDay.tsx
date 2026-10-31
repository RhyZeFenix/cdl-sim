// Match day: matches you chose to watch (and your own GM matches when spoiler-free)
// have been played, but nothing about their results shows until you watch or skip them.
import { markWatched } from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";

export function MatchDayBanner({ store, onWatch }: { store: SeasonStore; onWatch: (seriesId: string) => void }) {
  const { state, data, spoil, mutate } = store;
  const dir = directory(data);
  const id = spoil.unwatched[0]!;
  const rec = state.series[id]!;
  const gm = state.gm?.team;
  const yours = !!gm && rec.teams.includes(gm);
  const [a, b] = yours && rec.teams[1] === gm ? [rec.teams[1], rec.teams[0]] : rec.teams;
  const more = spoil.unwatched.length - 1;

  return (
    <div className="card matchday">
      <div className="row">
        <div>
          <div className="pill">
            {yours ? "Match day" : "Ready to watch"}
            {more > 0 ? ` · ${more + 1} matches to watch` : ""}
          </div>
          <h2 style={{ margin: "2px 0" }}>
            {dir.team(a).name} vs {dir.team(b).name}
          </h2>
          <div className="sub">
            {rec.label} · {rec.date} · Bo{rec.bestOf}. The result is ready. Standings, brackets and points leave it out until you watch it or skip it.
          </div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => onWatch(id)}>
          Watch
        </button>
        <button className="btn" onClick={() => mutate((s) => markWatched(s, id))} title="Reveal this result without watching">
          Skip to result
        </button>
        {more > 0 && (
          <button className="btn" onClick={() => mutate((s) => spoil.unwatched.forEach((u) => markWatched(s, u)))} title="Reveal every waiting result">
            Skip all
          </button>
        )}
      </div>
    </div>
  );
}
