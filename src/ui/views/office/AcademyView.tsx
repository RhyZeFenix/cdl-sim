// Office › Academy: your Challengers prospects and the season's pool.
import { useState } from "react";
import { ACADEMY_MAX, ACADEMY_SALARY, gmPromoteProspect, gmReleaseProspect, gmSignProspect, overall, potentialRange, gmCanMakeMoves } from "../../../engine";
import { type Nav } from "../../App";
import type { SeasonStore } from "../../useSeason";

export function AcademyView({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, mutate } = store;
  const gm = state.gm!;
  const [err, setErr] = useState<string | null>(null);
  const open = gmCanMakeMoves(state);
  const academy = new Set(gm.academy ?? []);
  const all = Object.entries(gm.prospects ?? {}).sort((a, b) => overall(b[1].player.ratings) - overall(a[1].player.ratings));
  const Row = ({ id }: { id: string }) => {
    const p = gm.prospects![id]!;
    const [lo, hi] = potentialRange(state, p);
    const mine = academy.has(id);
    return (
      <tr>
        <td className="left">
          <b>{p.player.handle}</b> <span className="muted">{p.player.role}</span>
        </td>
        <td className="left muted">{p.team}</td>
        <td>{p.age}</td>
        <td>
          <b>{Math.round(overall(p.player.ratings))}</b>
        </td>
        <td>{lo === hi ? lo : `${lo}–${hi}`}</td>
        <td className="left">
          {mine ? (
            <span className="row" style={{ gap: 4 }}>
              <button className="btn small primary" disabled={!open} onClick={() => setErr(mutate((s) => gmPromoteProspect(s, id)))} title="Move to the main roster on a two-year minimum deal">
                Promote
              </button>
              <button className="btn small" onClick={() => setErr(mutate((s) => gmReleaseProspect(s, id)))}>
                Release
              </button>
            </span>
          ) : (
            <button className="btn small" disabled={!open || academy.size >= ACADEMY_MAX} onClick={() => setErr(mutate((s) => gmSignProspect(s, id)))}>
              Sign (${ACADEMY_SALARY}k)
            </button>
          )}
        </td>
      </tr>
    );
  };
  const head = (
    <thead>
      <tr>
        <th className="left">Prospect</th>
        <th className="left">Team</th>
        <th>Age</th>
        <th>OVR</th>
        <th title="Exact with a 3★ analyst">Potential</th>
        <th />
      </tr>
    </thead>
  );
  void nav;
  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h3>
            Your academy ({academy.size}/{ACADEMY_MAX})
          </h3>
          <span className="sub">Academy players grow toward their potential every step (faster with a better coach). Promote them between stages.</span>
        </div>
        {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
        {academy.size === 0 ? (
          <div className="muted">Nobody yet. Sign prospects from the Challengers pool below.</div>
        ) : (
          <table className="tbl">
            {head}
            <tbody>
              {[...academy].map((id) => (
                <Row key={id} id={id} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Challengers prospects</h3>
          <span className="sub">Generated players, new each season. {open ? "Signings open." : "Signings open between stages."}</span>
        </div>
        <table className="tbl">
          {head}
          <tbody>
            {all
              .filter(([id]) => !academy.has(id))
              .map(([id]) => (
                <Row key={id} id={id} />
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ awards
