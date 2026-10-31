// The GM's career across a dynasty: totals, season by season, best signings, awards
// and achievements. Only what's been watched shows up.
import { ACHIEVEMENTS, isDone, seasonRecap, visibleAchievements, type SeasonRecap } from "../../engine";
import type { SeasonStore } from "../useSeason";

export function Career({ store }: { store: SeasonStore }) {
  const { state, data, spoil } = store;
  const history: SeasonRecap[] = [...(state.dynasty?.history ?? []), ...(isDone(state) && !spoil.active ? [seasonRecap(state, data)] : [])];
  const unlocked = visibleAchievements(state, spoil.hidden);
  const got = new Map(unlocked.map((a) => [a.id, a]));
  const w = history.reduce((s, h) => s + h.record[0], 0);
  const l = history.reduce((s, h) => s + h.record[1], 0);
  const titles = history.flatMap((h) => h.eventsWon.map((e) => `${e} (${h.label})`));
  const verdicts = history.reduce<Record<string, number>>((acc, h) => ({ ...acc, [h.verdict]: (acc[h.verdict] ?? 0) + 1 }), {});
  const signings = history.flatMap((h) => (h.signings ?? []).map((s) => ({ ...s, season: h.label }))).sort((a, b) => b.kd - a.kd).slice(0, 8);

  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Career</h3>
        <div className="kpis">
          <div className="kpi">
            <span className="l">Seasons finished</span>
            <span className="v">{history.length}</span>
          </div>
          <div className="kpi">
            <span className="l">Series record</span>
            <span className="v">
              {w}-{l}
            </span>
            <span className="sub">{w + l ? `${Math.round((100 * w) / (w + l))}% wins` : ""}</span>
          </div>
          <div className="kpi">
            <span className="l">Titles</span>
            <span className="v">{titles.length}</span>
          </div>
          <div className="kpi">
            <span className="l">Owner verdicts</span>
            <span className="v" style={{ fontSize: 13 }}>
              {Object.entries(verdicts)
                .map(([v, n]) => `${v} ×${n}`)
                .join(" · ") || "—"}
            </span>
          </div>
          <div className="kpi">
            <span className="l">Achievements</span>
            <span className="v">
              {unlocked.length}/{ACHIEVEMENTS.length}
            </span>
          </div>
        </div>
        {titles.length > 0 && <div style={{ marginTop: 8 }}>🏆 {titles.join(" · ")}</div>}
        {!history.length && <div className="muted" style={{ marginTop: 8 }}>Finish a season to start your record. Dynasty mode carries it on.</div>}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Achievements</h3>
        <div className="achievements">
          {ACHIEVEMENTS.map((a) => {
            const u = got.get(a.id);
            return (
              <div key={a.id} className={`ach ${u ? "on" : ""}`} title={a.text}>
                <b>{u ? "★" : "☆"} {a.title}</b>
                <span className="sub">{a.text}</span>
                {u && <span className="sub">{u.season}</span>}
              </div>
            );
          })}
        </div>
      </div>

      {history.length > 0 && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Season by season</h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Season</th>
                  <th className="left">Team</th>
                  <th>Rank</th>
                  <th>Record</th>
                  <th className="left">Owner</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.year + h.label}>
                    <td className="left">{h.label}</td>
                    <td className="left">{h.teamName}</td>
                    <td>{h.rank}</td>
                    <td>
                      {h.record[0]}-{h.record[1]}
                    </td>
                    <td className="left">{h.verdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Best signings</h3>
            {signings.length === 0 ? (
              <div className="muted">Sign, trade for or promote players to see how they did.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="left">Player</th>
                    <th className="left">Season</th>
                    <th>Maps</th>
                    <th>K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {signings.map((s) => (
                    <tr key={s.player + s.season}>
                      <td className="left">{s.handle}</td>
                      <td className="left">{s.season}</td>
                      <td>{s.maps}</td>
                      <td>{s.kd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {history.some((h) => h.awards?.length) && (
              <>
                <h4 style={{ margin: "10px 0 4px" }}>Awards won</h4>
                {history.flatMap((h) => (h.awards ?? []).map((a) => <div key={h.label + a}>{a} <span className="muted">· {h.label}</span></div>))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
