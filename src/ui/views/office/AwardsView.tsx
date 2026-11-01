// Office › Awards: this season's awards and the MVP race.
import { useMemo } from "react";
import { awardLines, playerInfo, seasonLabel } from "../../../engine";
import { type Nav } from "../../App";
import { directory } from "../../names";
import type { SeasonStore } from "../../useSeason";
import { PlayerLink } from "../common";
import { History } from "./Overview";

export function AwardsView({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil } = store;
  const dir = directory(data);
  const a = state.awards;
  const name = (id: string) => playerInfo(state, data, id)?.handle ?? id;
  const race = useMemo(() => (spoil.active ? [] : awardLines(state).slice(0, 10)), [state, spoil.active, store.version]);
  const P = ({ id }: { id?: string }) => (id ? <PlayerLink id={id} name={name(id)} nav={nav} /> : <>—</>);
  return (
    <div>
      {a && !spoil.active && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>{seasonLabel(state, data)} awards</h3>
          <div className="kpis">
            <div className="kpi">
              <span className="l">MVP</span>
              <span className="v">
                <P id={a.mvp} />
              </span>
            </div>
            <div className="kpi">
              <span className="l">Rookie of the Year</span>
              <span className="v">
                <P id={a.rookie} />
              </span>
            </div>
            <div className="kpi">
              <span className="l">Champs MVP</span>
              <span className="v">
                <P id={a.champsMvp} />
              </span>
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            {(["First", "Second"] as const).map((t, i) => (
              <div key={t}>
                <h4 style={{ margin: "0 0 4px" }}>All-CDL {t} Team</h4>
                {a.allCdl[i]!.map((id) => (
                  <div key={id}>
                    <P id={id} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="sub" style={{ marginTop: 8 }}>Award winners ask for more money (MVP +20%, All-CDL +5–10%). Your winners got a morale lift.</div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <h3>MVP race</h3>
          <span className="sub">K/D and map win rate, minimum half the busiest player's maps.</span>
        </div>
        {spoil.active ? (
          <div className="muted">Updates after you watch your match.</div>
        ) : race.length === 0 ? (
          <div className="muted">No maps played yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Player</th>
                <th className="left">Team</th>
                <th>Maps</th>
                <th>K/D</th>
                <th>Map win %</th>
              </tr>
            </thead>
            <tbody>
              {race.map((l, i) => (
                <tr key={l.player}>
                  <td className="rank">{i + 1}</td>
                  <td className="left">
                    <P id={l.player} />
                  </td>
                  <td className="left">{dir.team(l.team).abbr}</td>
                  <td>{l.maps}</td>
                  <td>{l.kd.toFixed(2)}</td>
                  <td>{Math.round(100 * l.winRate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {state.dynasty && state.dynasty.history.length > 0 && <History state={state} />}
    </div>
  );
}
