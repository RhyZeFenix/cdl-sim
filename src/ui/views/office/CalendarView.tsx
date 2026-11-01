// Office › Calendar: every step with its date, your matches, and the signing and trade windows.
import { Fragment } from "react";
import { calendar, isRival, gmCanMakeMoves } from "../../../engine";
import { stepLabel, type Nav } from "../../App";
import { directory } from "../../names";
import type { SeasonStore } from "../../useSeason";

export function CalendarView({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const rows = calendar(state, data);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Season calendar</h3>
        <span className="sub">Signing and trade windows open before the season and after each Major. The window before Champs is signings only: that's the trade deadline.</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Date</th>
            <th className="left">What</th>
            <th className="left">Your matches</th>
            <th className="left">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.index}>
              {r.window && (
                <tr className="window-row">
                  <td className="left muted">{r.date}</td>
                  <td className="left" colSpan={3}>
                    <span className="pill">{r.window.trades ? "Signing + trade window" : "Signings only · trade deadline passed"}</span>
                    {r.status === "next" && gmCanMakeMoves(state) && <span className="next-tag" style={{ marginLeft: 6 }}>Open now</span>}
                  </td>
                </tr>
              )}
              <tr className={r.status === "next" ? "cal-next" : r.status === "done" ? "cal-done" : ""}>
                <td className="left muted">{r.date}</td>
                <td className="left">{stepLabel(data.season, r.step)}</td>
                <td className="left">
                  {r.matches.map((m) => {
                    const rec = state.series[m.id];
                    const hidden = spoil.isHidden(m.id);
                    const res = rec && !hidden ? (rec.winner === gm.team ? "W" : "L") : null;
                    return (
                      <span key={m.id} style={{ marginRight: 10 }}>
                        {rec ? (
                          <button className="linklike" onClick={() => nav.openMatch(m.id, { watch: hidden })}>
                            vs {dir.team(m.opponent).abbr}
                          </button>
                        ) : (
                          <>vs {dir.team(m.opponent).abbr}</>
                        )}
                        {isRival(state, m.opponent) ? " 🔥" : ""}
                        {res && <b style={{ marginLeft: 4, color: res === "W" ? "var(--pick)" : "var(--ban)" }}>{res}</b>}
                        {hidden && <span className="muted"> (unwatched)</span>}
                      </span>
                    );
                  })}
                  {r.step.kind !== "week" && <span className="muted">Bracket</span>}
                </td>
                <td className="left">{r.status === "done" ? <span className="muted">Played</span> : r.status === "next" ? <span className="next-tag">Next</span> : ""}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ market extras
