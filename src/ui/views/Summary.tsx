import { useMemo } from "react";
import { playerLines, summarize } from "../../engine";
import { stepLabel, type Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { PointsRace } from "./PointsRace";
import { TeamTag } from "./common";

export function Summary({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, version, done } = store;
  const dir = directory(data);
  const { season } = data;
  const sum = useMemo(() => summarize(state, data), [state, data, version]);
  const leaders = useMemo(() => {
    const lines = playerLines(state, Object.keys(state.series));
    const maxMaps = Math.max(0, ...lines.map((l) => l.maps));
    return lines.filter((l) => l.maps >= maxMaps * 0.5).slice(0, 10);
  }, [state, version]);
  const teams = useMemo(() => season.teams.map((t) => dir.team(t.id)), [season, dir]);

  if (state.next === 0) return <div className="card empty">Nothing simulated yet. Use “Sim week”, “Sim stage” or “Sim season”.</div>;

  const real = season.championship.realResult;
  const champsEvent = state.events.findIndex((e) => e.kind === "championship");

  return (
    <div>
      <div className="card">
        {done && sum.champion ? (
          <div className="hero">
            <div className="stat">
              <span className="l">{season.label} Champion</span>
              <span className="champ">{dir.team(sum.champion).name}</span>
              <span className="sub">
                def. {dir.team(sum.runnerUp!).name} {sum.finalScore![0]}–{sum.finalScore![1]} in the Grand Final
              </span>
            </div>
            {sum.mvp && (
              <div className="stat">
                <span className="l">Champs MVP (best K/D)</span>
                <span className="v">{dir.player(sum.mvp.player)}</span>
                <span className="sub">
                  {dir.team(sum.mvp.team).abbr} · {sum.mvp.kills}-{sum.mvp.deaths} ({sum.mvp.kd.toFixed(2)}) over {sum.mvp.maps} maps
                </span>
              </div>
            )}
            {real && (
              <div className="stat">
                <span className="l">Real result</span>
                <span className="v">{dir.team(real.winner).abbr}</span>
                <span className="sub">
                  over {dir.team(real.runnerUp).abbr} {real.score}
                </span>
              </div>
            )}
            <div className="spacer" />
            {champsEvent >= 0 && (
              <button className="btn" onClick={() => nav.openBracket(champsEvent)}>
                Champs bracket
              </button>
            )}
          </div>
        ) : (
          <div className="hero">
            <div className="stat">
              <span className="l">Season in progress</span>
              <span className="v">Next: {stepLabel(season, state.steps[state.next])}</span>
              <span className="sub">
                {state.next} of {state.steps.length} steps simulated
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Points race</h3>
          <span className="sub">Click teams to highlight (up to 3). Hover for every team's total.</span>
        </div>
        <PointsRace history={state.pointsHistory} teams={teams} />
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Event winners</h3>
          {sum.eventWinners.length === 0 ? (
            <div className="muted">No events played yet.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Event</th>
                  <th className="left">Winner</th>
                  <th>Final</th>
                  <th className="left">Real winner</th>
                </tr>
              </thead>
              <tbody>
                {sum.eventWinners.map((e, i) => {
                  const ev = e.kind === "championship" ? season.championship : season.stages[e.stage! - 1]![e.kind]!;
                  return (
                    <tr key={i} className="click" onClick={() => nav.openBracket(i)}>
                      <td className="left">{e.name}</td>
                      <td className="left">
                        <TeamTag team={dir.team(e.winner)} full={false} /> <span className="muted">over {dir.team(e.runnerUp).abbr}</span>
                      </td>
                      <td>
                        {e.score[0]}–{e.score[1]}
                      </td>
                      <td className="left muted">{ev.realResult ? dir.team(ev.realResult.winner).abbr : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>K/D leaders</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Player</th>
                <th>Maps</th>
                <th>K</th>
                <th>D</th>
                <th>K/D</th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l) => (
                <tr key={l.player}>
                  <td className="left">
                    {dir.player(l.player)} <span className="muted">{dir.team(l.team).abbr}</span>
                  </td>
                  <td>{l.maps}</td>
                  <td>{l.kills}</td>
                  <td>{l.deaths}</td>
                  <td>
                    <b>{l.kd.toFixed(2)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sub" style={{ marginTop: 6 }}>Minimum half the maps of the busiest player.</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Points table</h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Team</th>
                {state.pointsHistory
                  .filter((h) => h.label !== "Start" && !/^S\d W\d+$/.test(h.label))
                  .map((h) => (
                    <th key={h.label}>{h.label.replace(" (Pro-Am)", "")}</th>
                  ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sum.finalPoints.map((r, i) => (
                <tr key={r.team}>
                  <td className="rank">{i + 1}</td>
                  <td className="left">
                    <TeamTag team={dir.team(r.team)} full={false} />
                  </td>
                  {state.pointsHistory
                    .filter((h) => h.label !== "Start" && !/^S\d W\d+$/.test(h.label))
                    .map((h) => (
                      <td key={h.label}>{h.points[r.team] ?? 0}</td>
                    ))}
                  <td>
                    <b>{r.points}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sub" style={{ marginTop: 6 }}>Cumulative points after each event (the table view of the chart above).</div>
      </div>
    </div>
  );
}
