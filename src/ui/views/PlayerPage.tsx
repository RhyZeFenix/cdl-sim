// A player's page: ratings, contract and morale (your players), and their season by
// mode and series by series. Unwatched results are left out.
import { Fragment, useMemo, useState } from "react";
import { playerCareer, loadSeasonData, TRAIT_LABEL, TRAIT_TEXT, traitOf, askingSalary, fogText, fogWidth, modeName, moraleWord, overall, playerProfile, shownMorale } from "../../engine";
import type { Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { TeamTag } from "./common";

export function PlayerPage({ store, id, nav, onBack }: { store: SeasonStore; id: string; nav: Nav; onBack: () => void }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const prof = useMemo(() => playerProfile(state, data, id, spoil.hidden), [state, data, id, version]);
  const p = prof.info;
  const gm = state.gm;
  const yours = !!gm?.roster.includes(id);
  const morale = yours ? shownMorale(state, spoil.hidden)[id] : undefined;
  const contract = yours ? gm!.contracts?.[id] : undefined;
  const team = prof.series[0]?.team;
  const kd = (k: number, d: number) => (k / Math.max(1, d)).toFixed(2);
  const last5 = prof.series.slice(0, 5);
  const fog = fogWidth(state, data, id);
  const trait = state.gm ? traitOf(id) : undefined;
  const f = (v: number, k: string) => fogText(v, fog, `${id}/${k}`);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" onClick={onBack}>
          ‹ Back
        </button>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>{p?.handle ?? id}</h2>
          {team && <TeamTag team={dir.team(yours ? gm!.team : team)} />}
          <span className="sub">
            age {prof.age}
            {trait && (
              <>
                {" · "}
                <span className="pill" title={TRAIT_TEXT[trait]}>
                  {TRAIT_LABEL[trait]}
                </span>
              </>
            )}
            {p?.ratingSource !== "stats" ? " · ratings estimated (no season stats)" : ""}
          </span>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="l">Overall</span>
            <span className="v">{p ? f(overall(p.ratings), "ovr") : "—"}</span>
            {fog > 0 && <span className="sub">scouting range</span>}
          </div>
          <div className="kpi">
            <span className="l">Season K/D</span>
            <span className="v">{prof.total.maps ? kd(prof.total.kills, prof.total.deaths) : "—"}</span>
            <span className="sub">{prof.total.maps} maps</span>
          </div>
          {yours && (
            <div className="kpi">
              <span className="l">Morale</span>
              <span className="v">{morale ?? 70}</span>
              <span className="sub">{moraleWord(morale ?? 70)}</span>
            </div>
          )}
          <div className="kpi">
            <span className="l">{yours ? "Contract" : "Market ask"}</span>
            <span className="v">{contract ? `$${contract.salary}k` : p ? `$${askingSalary(overall(p.ratings))}k` : "—"}</span>
            {contract && <span className="sub">{contract.years} season{contract.years > 1 ? "s" : ""} left</span>}
          </div>
          <div className="kpi">
            <span className="l">Last 5 series</span>
            <span className="v">{last5.length ? last5.map((s) => (s.won ? "W" : "L")).join(" ") : "—"}</span>
          </div>
          <div className="kpi" title="K/D over the last five series against the season; hot is 12% above, cold 12% below">
            <span className="l">Form</span>
            {prof.form ? (
              <>
                <span className="v" style={{ color: prof.form.label === "hot" ? "var(--pick)" : prof.form.label === "cold" ? "var(--ban)" : undefined }}>
                  {prof.form.label === "hot" ? "▲ Hot" : prof.form.label === "cold" ? "▼ Cold" : "● Steady"}
                </span>
                <span className="sub">
                  {prof.form.recentKd.toFixed(2)} lately vs {prof.form.seasonKd.toFixed(2)} season
                </span>
                <FormStrip trend={prof.form.trend} season={prof.form.seasonKd} />
              </>
            ) : (
              <span className="v muted">—</span>
            )}
          </div>
        </div>
        {p && (
          <table className="tbl" style={{ marginTop: 10 }}>
            <thead>
              <tr>
                {["Slaying", "Hardpoint", "SnD", data.season.thirdMode === "control" ? "Control" : "Overload", "Clutch", "Consistency"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {[p.ratings.slaying, p.ratings.hp_obj, p.ratings.snd_iq, p.ratings.third_mode, p.ratings.clutch, p.ratings.consistency].map((v, i) => (
                  <td key={i}>{f(v, ["slay", "hp", "snd", "third", "clutch", "cons"][i]!)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <Career id={id} nav={nav} />

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Season by mode</h3>
        {prof.modes.length === 0 ? (
          <div className="muted">No maps played yet{spoil.active ? " (unwatched results are left out)" : ""}.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Mode</th>
                <th>Maps</th>
                <th>Map W-L</th>
                <th>K</th>
                <th>D</th>
                <th>K/D</th>
                <th>Dmg/map</th>
                <th className="left">Mode stats</th>
              </tr>
            </thead>
            <tbody>
              {prof.modes.map((m) => (
                <tr key={m.mode}>
                  <td className="left">{modeName(m.mode)}</td>
                  <td>{m.maps}</td>
                  <td>
                    {m.wins}-{m.maps - m.wins}
                  </td>
                  <td>{m.kills}</td>
                  <td>{m.deaths}</td>
                  <td>
                    <b>{kd(m.kills, m.deaths)}</b>
                  </td>
                  <td>{Math.round(m.damage / m.maps)}</td>
                  <td className="left muted">
                    {Object.entries(m.extra)
                      .map(([k, v]) => (k === "Hill time" ? `${k} ${Math.round(v / m.maps)}s/map` : `${k} ${v}`))
                      .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Series log</h3>
        {prof.series.length === 0 ? (
          <div className="muted">No series yet.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Date</th>
                <th className="left">Match</th>
                <th className="left">Result</th>
                <th>Maps</th>
                <th>K-D</th>
                <th>K/D</th>
              </tr>
            </thead>
            <tbody>
              {prof.series.map((s) => (
                <tr key={s.id} className="click" onClick={() => nav.openMatch(s.id)}>
                  <td className="left muted">{s.date}</td>
                  <td className="left">
                    {dir.team(s.team).abbr} vs {dir.team(s.opponent).abbr} <span className="muted">{s.label}</span>
                  </td>
                  <td className="left">
                    <b style={{ color: s.won ? "var(--pick)" : "var(--ban)" }}>{s.won ? "W" : "L"}</b>
                  </td>
                  <td>{s.maps}</td>
                  <td>
                    {s.kills}-{s.deaths}
                  </td>
                  <td>{kd(s.kills, s.deaths)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** The last ten series' K/D as small bars around the season average. */
function FormStrip({ trend, season }: { trend: number[]; season: number }) {
  const max = Math.max(season * 1.6, ...trend);
  return (
    <span className="formstrip" role="img" aria-label={`Last ${trend.length} series K/D: ${trend.map((x) => x.toFixed(2)).join(", ")}`}>
      {trend.map((x, i) => (
        <span key={i} title={x.toFixed(2)} className={x >= season ? "up" : "down"} style={{ height: `${Math.max(8, (100 * x) / max)}%` }} />
      ))}
      <i style={{ bottom: `${(100 * season) / max}%` }} />
    </span>
  );
}

const EVENT_NAME = (e: string) =>
  e === "championship" ? "Champs" : e.replace(/^major (\d+)\/qualifiers$/, "Stage $1 qualifiers").replace(/^major (\d+)\/minor$/, "Minor $1").replace(/^major (\d+)$/, "Major $1").replace(/^launch invitational$/, "Launch Invitational");

/** The player's real career across the seasons in the data. */
function Career({ id, nav }: { id: string; nav: Nav }) {
  const career = useMemo(() => playerCareer(id), [id]);
  const [open, setOpen] = useState<string | null>(null);
  if (!career.length) return null;
  const teamName = (season: string, t: string) => loadSeasonData(season as never).season.teams.find((x) => x.id === t)?.abbr ?? t;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Real career</h3>
        <span className="sub">Every CDL season in the data, from the CoD Esports Wiki. Click a season for event-by-event K/D.</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Season</th>
            <th className="left">Team</th>
            <th>Age</th>
            <th>OVR</th>
            <th>Maps</th>
            <th>K/D</th>
          </tr>
        </thead>
        <tbody>
          {career.map((c) => (
            <Fragment key={c.season}>
              <tr>
                <td className="left">
                  <button className="linklike" aria-expanded={open === c.season} onClick={() => setOpen(open === c.season ? null : c.season)}>
                    {c.label}
                  </button>
                </td>
                <td className="left">
                  {c.teams.map((t, i) => (
                    <span key={t}>
                      {i > 0 && ", "}
                      {c.season === career[career.length - 1]!.season ? (
                        <button className="linklike" onClick={() => nav.openTeam(t)}>
                          {teamName(c.season, t)}
                        </button>
                      ) : (
                        teamName(c.season, t)
                      )}
                    </span>
                  ))}
                </td>
                <td>{c.age}</td>
                <td>{c.ovr ?? "—"}</td>
                <td>{c.maps || "—"}</td>
                <td>{c.kd?.toFixed(2) ?? "—"}</td>
              </tr>
              {open === c.season &&
                c.events.map((e) => (
                  <tr key={`${c.season}/${e.event}`} className="sub">
                    <td className="left" style={{ paddingLeft: 20 }}>
                      {EVENT_NAME(e.event)}
                    </td>
                    <td />
                    <td />
                    <td />
                    <td>{e.maps}</td>
                    <td>{(e.kills / Math.max(1, e.deaths)).toFixed(2)}</td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
