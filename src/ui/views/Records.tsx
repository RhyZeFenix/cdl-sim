// Records and head-to-head: pick two teams to see every meeting this season, plus the
// season's biggest upsets, longest streaks, best single maps and sweeps.
import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { directory } from "../names";
import { handleOf, headToHead, seasonRecords } from "../stats";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, TeamLink } from "./common";

export function Records({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const teams = data.season.teams;
  const [a, setA] = useState(teams[0]!.id);
  const [b, setB] = useState(teams[1]!.id);
  const h2h = useMemo(() => headToHead(state, a, b, spoil.hidden), [state, a, b, version]);
  const rec = useMemo(() => seasonRecords(state, data, spoil.hidden), [state, data, version]);
  const aw = h2h.filter((r) => r.winner === a).length;
  const mapsA = h2h.reduce((s, r) => s + r.score[r.teams[0] === a ? 0 : 1], 0);
  const mapsB = h2h.reduce((s, r) => s + r.score[r.teams[0] === b ? 0 : 1], 0);
  const sel = (v: string, set: (x: string) => void, label: string) => (
    <select className="plain" value={v} onChange={(e) => set(e.target.value)} aria-label={label}>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h3>Head to head</h3>
          {sel(a, setA, "First team")}
          <span className="muted">vs</span>
          {sel(b, setB, "Second team")}
        </div>
        {a === b ? (
          <div className="muted">Pick two different teams.</div>
        ) : h2h.length === 0 ? (
          <div className="muted">They haven't met yet this season.</div>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <b>
                {dir.team(a).abbr} {aw}–{h2h.length - aw} {dir.team(b).abbr}
              </b>{" "}
              in series · maps {mapsA}–{mapsB}
            </div>
            <table className="tbl">
              <tbody>
                {h2h.map((r) => (
                  <tr key={r.id} className="click" onClick={() => nav.openMatch(r.id)}>
                    <td className="left muted">{r.date}</td>
                    <td className="left">{r.label}</td>
                    <td className="left">
                      <b>{dir.team(r.winner).abbr}</b> {Math.max(...r.score)}–{Math.min(...r.score)}
                    </td>
                    <td className="left muted">{r.maps.map((m) => m.map).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Biggest upsets</h3>
          {rec.upsets.length === 0 ? (
            <div className="muted">None yet. An upset is a win over a team ranked four or more places higher on preseason roster strength.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {rec.upsets.map(({ series: r, gap }) => {
                  const loser = r.winner === r.teams[0] ? r.teams[1] : r.teams[0];
                  return (
                    <tr key={r.id} className="click" onClick={() => nav.openMatch(r.id)}>
                      <td className="left">
                        <b>{dir.team(r.winner).abbr}</b> beat {dir.team(loser).abbr} {Math.max(...r.score)}–{Math.min(...r.score)}
                      </td>
                      <td className="left muted">{r.label}</td>
                      <td title="Preseason strength ranks between them">+{gap}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Best single maps</h3>
          {rec.bestMaps.length === 0 ? (
            <div className="muted">No maps played yet.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Player</th>
                  <th className="left">Map</th>
                  <th>K-D</th>
                </tr>
              </thead>
              <tbody>
                {rec.bestMaps.map((m, i) => (
                  <tr key={i}>
                    <td className="left">
                      <PlayerLink id={m.player} name={handleOf(state, data, m.player)} nav={nav} />
                    </td>
                    <td className="left">
                      <button className="linklike" onClick={() => nav.openMatch(m.series.id)}>
                        {m.map} {m.mode.toUpperCase()}
                      </button>
                    </td>
                    <td>
                      {m.kills}-{m.deaths}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Longest win streaks</h3>
          <table className="tbl">
            <tbody>
              {rec.streaks.map((s) => (
                <tr key={s.team}>
                  <td className="left">
                    <TeamLink team={dir.team(s.team)} nav={nav} />
                  </td>
                  <td>{s.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Most sweeps</h3>
          <table className="tbl">
            <tbody>
              {rec.sweeps.map((s) => (
                <tr key={s.team}>
                  <td className="left">
                    <TeamLink team={dir.team(s.team)} nav={nav} />
                  </td>
                  <td>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {spoil.active && <div className="sub" style={{ marginTop: 8 }}>Unwatched results are left out.</div>}
    </div>
  );
}
