// A team's page: record, current lineup, everyone they used, map records by mode, how
// their roster strength changed through the season, and their results.
import { useMemo } from "react";
import { overall, playerInfo, pointsTable } from "../../engine";
import type { Nav } from "../App";
import { directory } from "../names";
import { handleOf, teamProfile } from "../stats";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, TeamTag } from "./common";

export function TeamPage({ store, team, nav, onBack }: { store: SeasonStore; team: string; nav: Nav; onBack: () => void }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const p = useMemo(() => teamProfile(state, data, team, spoil.hidden), [state, data, team, version]);
  const rank = pointsTable(state, data, spoil.points, spoil.hidden).findIndex((r) => r.team === team) + 1;
  const pct = (w: number, l: number) => (w + l ? `${Math.round((100 * w) / (w + l))}%` : "—");

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>
          ‹ Back
        </button>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>
            <TeamTag team={dir.team(team)} />
          </h2>
          {state.gm?.team === team && <span className="pill">Your team</span>}
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="l">CDL points</span>
            <span className="v">{spoil.points[team] ?? 0}</span>
            <span className="sub">{rank ? `${rank} of ${data.season.teams.length}` : ""}</span>
          </div>
          <div className="kpi">
            <span className="l">Series</span>
            <span className="v">
              {p.wins}-{p.series.length - p.wins}
            </span>
            <span className="sub">{pct(p.wins, p.series.length - p.wins)}</span>
          </div>
          <div className="kpi">
            <span className="l">Maps</span>
            <span className="v">
              {p.maps[0]}-{p.maps[1]}
            </span>
            <span className="sub">{pct(p.maps[0], p.maps[1])}</span>
          </div>
          <div className="kpi">
            <span className="l">Roster strength</span>
            <span className="v" style={{ fontSize: 13 }}>
              {p.strength.map((s) => `${s.label.replace("Stage ", "S")} ${s.ovr}`).join(" · ")}
            </span>
            <span className="sub">Starters' average overall at each stage</span>
          </div>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Lineup</h3>
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Player</th>
                <th className="left">Role</th>
                <th>OVR</th>
                <th>Maps</th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...p.lineup, ...p.usedPlayers.map((u) => u.id)])].map((id) => {
                const info = playerInfo(state, data, id);
                const used = p.usedPlayers.find((u) => u.id === id)?.maps ?? 0;
                return (
                  <tr key={id}>
                    <td className="left">
                      <PlayerLink id={id} name={handleOf(state, data, id)} nav={nav} />
                      {p.lineup.includes(id) ? "" : <span className="muted"> (former)</span>}
                    </td>
                    <td className="left muted">{info?.role ?? "—"}</td>
                    <td>{info ? Math.round(overall(info.ratings)) : "—"}</td>
                    <td>{used}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Map records</h3>
          {p.byMap.length === 0 ? (
            <div className="muted">No maps played yet.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Map</th>
                  <th>W-L</th>
                  <th>Win %</th>
                </tr>
              </thead>
              <tbody>
                {p.byMap.map((m) => (
                  <tr key={`${m.mode}:${m.map}`}>
                    <td className="left">
                      {m.map} <span className="muted">{m.mode.toUpperCase()}</span>
                    </td>
                    <td>
                      {m.w}-{m.l}
                    </td>
                    <td>{pct(m.w, m.l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>Results</h3>
        {p.series.length === 0 ? (
          <div className="muted">No matches yet{spoil.active ? " (unwatched results are left out)" : ""}.</div>
        ) : (
          <table className="tbl">
            <tbody>
              {p.series
                .slice()
                .reverse()
                .map((r) => {
                  const side = r.teams[0] === team ? 0 : 1;
                  const won = r.winner === team;
                  return (
                    <tr key={r.id} className="click" onClick={() => nav.openMatch(r.id)}>
                      <td className="left muted">{r.date}</td>
                      <td className="left">
                        <b style={{ color: won ? "var(--pick)" : "var(--ban)" }}>{won ? "W" : "L"}</b> {r.score[side]}–{r.score[1 - side]}
                      </td>
                      <td className="left">vs {dir.team(r.teams[1 - side]!).name}</td>
                      <td className="left muted">{r.label}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
