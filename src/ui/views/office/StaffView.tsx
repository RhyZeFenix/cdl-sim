// Office › Staff: your coach and analyst, and who's available to hire.
import { useState } from "react";
import { SPONSORS, STAFF_BUDGET, academyPayroll, gmFire, gmHire, gmSetSponsor, sponsorEarned, sponsorOpen, staffPayroll, staffPool, stars, gmCanMakeMoves, type SponsorDeal } from "../../../engine";
import type { SeasonStore } from "../../useSeason";

export function StaffView({ store }: { store: SeasonStore }) {
  const { state, mutate } = store;
  const gm = state.gm!;
  const [err, setErr] = useState<string | null>(null);
  const open = gmCanMakeMoves(state);
  const pool = staffPool(state);
  const used = staffPayroll(state) + academyPayroll(state);
  const earned = sponsorEarned(state, store.spoil.hidden);
  const canSponsor = sponsorOpen(state);
  const effect = (role: "coach" | "analyst", r: number) =>
    role === "coach"
      ? `Prep bonuses ×${(1 + 0.15 * (r - 3)).toFixed(2)}, losses hurt morale ${Math.round(10 * (r - 1))}% less, academy grows faster`
      : r >= 3
        ? `Full scouting intel, exact prospect potential, +${((r - 1) * 0.3).toFixed(1)} game-plan edge`
        : `Opponents' likely picks and bans, tighter prospect ranges, +${((r - 1) * 0.3).toFixed(1)} game-plan edge`;
  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h3>Your staff</h3>
          <span className="sub">
            Staff budget ${used}k of ${STAFF_BUDGET + earned}k (includes ${academyPayroll(state)}k for the academy{earned ? `, and $${earned}k from your sponsor` : ""}). {open ? "Hiring is open." : "Hiring opens between stages."}
          </span>
        </div>
        {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
        <div className="grid2">
          {(["coach", "analyst"] as const).map((role) => {
            const m = gm.staff?.[role];
            return (
              <div key={role} className="kpi">
                <span className="l">{role === "coach" ? "Head coach" : "Analyst"}</span>
                {m ? (
                  <>
                    <span className="v">
                      {m.name} <span style={{ color: "var(--accent)" }}>{stars(m.rating)}</span>
                    </span>
                    <span className="sub">
                      ${m.salary}k · {effect(role, m.rating)}
                    </span>
                    {open && (
                      <button className="btn small" style={{ justifySelf: "start", marginTop: 4 }} onClick={() => setErr(mutate((s) => gmFire(s, role)))}>
                        Let go
                      </button>
                    )}
                  </>
                ) : (
                  <span className="v muted">Vacant</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Sponsor</h3>
          <span className="sub">{canSponsor ? "Pick one deal before your first match. The money goes into the staff budget." : gm.sponsor ? `${SPONSORS[gm.sponsor].name}: $${earned}k so far this season.` : "No sponsor this season."}</span>
        </div>
        <div className="seg" role="group" aria-label="Sponsor deal">
          {(Object.keys(SPONSORS) as SponsorDeal[]).map((d) => (
            <button key={d} aria-pressed={gm.sponsor === d} disabled={!canSponsor} title={SPONSORS[d].blurb} onClick={() => setErr(mutate((s) => gmSetSponsor(s, d)))}>
              {SPONSORS[d].name}
            </button>
          ))}
        </div>
        <div className="sub" style={{ marginTop: 6 }}>{gm.sponsor ? SPONSORS[gm.sponsor].blurb : (Object.keys(SPONSORS) as SponsorDeal[]).map((d) => `${SPONSORS[d].name}: ${SPONSORS[d].blurb}`).join(" · ")}</div>
      </div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Available</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">Name</th>
              <th className="left">Role</th>
              <th className="left">Rating</th>
              <th>Salary</th>
              <th className="left">Effect</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pool.map((m) => (
              <tr key={m.id}>
                <td className="left">{m.name}</td>
                <td className="left">{m.role}</td>
                <td className="left" style={{ color: "var(--accent)" }}>
                  {stars(m.rating)}
                </td>
                <td>${m.salary}k</td>
                <td className="left muted">{effect(m.role, m.rating)}</td>
                <td>
                  <button className="btn small" disabled={!open} onClick={() => setErr(mutate((s) => gmHire(s, m.id)))}>
                    Hire
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ academy
