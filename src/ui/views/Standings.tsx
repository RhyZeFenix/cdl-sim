import { useMemo, useState } from "react";
import { pointsTable, qualifierStandings } from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { Seg, TeamTag, signed } from "./common";

export function Standings({ store }: { store: SeasonStore }) {
  const { state, data, version } = store;
  const dir = directory(data);
  const playedStages = data.season.stages.filter((st) => state.qualifiers[st.stage - 1]!.length > 0).map((st) => st.stage);
  const [view, setView] = useState<number>(0);

  const points = useMemo(() => pointsTable(state, data), [state, data, version]);
  const quals = useMemo(() => (view > 0 ? qualifierStandings(state, data, view) : []), [state, data, version, view]);
  const champsCut = data.season.championship.format.type === "double-elim" ? data.season.championship.format.winnersSeeds.length : 8;

  return (
    <div className="card">
      <div className="card-head">
        <h2>{view === 0 ? "CDL Points" : `Stage ${view} Qualifiers`}</h2>
        <span className="sub">
          {view === 0 ? `Top ${champsCut} qualify for Champs · records are qualifier matches` : `Tiebreakers: ${data.season.tiebreakers.join(" › ")}`}
        </span>
        <div className="spacer" />
        <Seg
          label="Standings view"
          value={view}
          onChange={setView}
          options={[{ value: 0, label: "Points" }, ...data.season.stages.map((st) => ({ value: st.stage, label: `Stage ${st.stage}` }))]}
        />
      </div>
      <div className="scroll-x">
        {view === 0 ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Team</th>
                <th>Points</th>
                <th>Series</th>
                <th>Maps</th>
                <th>Map diff</th>
              </tr>
            </thead>
            <tbody>
              {points.map((r, i) => (
                <tr key={r.team} className={i === champsCut - 1 ? "cut" : ""}>
                  <td className="rank">{i + 1}</td>
                  <td className="left">
                    <TeamTag team={dir.team(r.team)} />
                  </td>
                  <td>
                    <b>{r.points}</b>
                  </td>
                  <td>
                    {r.seriesW}-{r.seriesL}
                  </td>
                  <td>
                    {r.mapW}-{r.mapL}
                  </td>
                  <td>{signed(r.mapDiff)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !playedStages.includes(view) ? (
          <div className="empty">Stage {view} qualifiers haven't started.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Team</th>
                <th>Series</th>
                <th>Maps</th>
                <th>Map diff</th>
                <th>Win %</th>
              </tr>
            </thead>
            <tbody>
              {quals.map((r, i) => (
                <tr key={r.team}>
                  <td className="rank">{i + 1}</td>
                  <td className="left">
                    <TeamTag team={dir.team(r.team)} />
                  </td>
                  <td>
                    <b>
                      {r.seriesW}-{r.seriesL}
                    </b>
                  </td>
                  <td>
                    {r.mapW}-{r.mapL}
                  </td>
                  <td>{signed(r.mapDiff)}</td>
                  <td>{r.seriesW + r.seriesL ? Math.round((100 * r.seriesW) / (r.seriesW + r.seriesL)) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
