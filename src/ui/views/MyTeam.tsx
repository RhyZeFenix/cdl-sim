import { useMemo, useState } from "react";
import {
  GM_ROSTER_MAX,
  GM_ROSTER_MIN,
  freeAgents,
  gmCanMakeMoves,
  gmRelease,
  gmSetAutoVeto,
  gmSetPauseBetweenMaps,
  gmSetSpoilerFree,
  gmSetStarters,
  gmSign,
  nextStepDate,
  playerInfo,
  contractFor,
  signingProblem,
  payroll,
  shownMorale,
  moraleWord,
  SALARY_CAP,
  type Player,
} from "../../engine";
import { stepLabel, type Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, TeamTag } from "./common";

const ovr = (p: Player) => Math.round((p.ratings.slaying + p.ratings.hp_obj + p.ratings.snd_iq + p.ratings.third_mode) / 4);

function RatingCells({ p }: { p: Player }) {
  const r = p.ratings;
  const est = p.ratingSource !== "stats";
  return (
    <>
      <td title={p.stats ? `${p.stats.maps} maps this season` : "No stats this season"}>{p.stats ? p.stats.kd.toFixed(2) : "—"}</td>
      <td title={est ? "Estimated from team placements (no season stats)" : "From season stats"}>
        <b>{ovr(p)}</b>
        {est && <span className="muted" style={{ fontSize: 11 }}> est.</span>}
      </td>
      <td>{Math.round(r.slaying)}</td>
      <td>{Math.round(r.hp_obj)}</td>
      <td>{Math.round(r.snd_iq)}</td>
      <td>{Math.round(r.third_mode)}</td>
      <td>{Math.round(r.clutch)}</td>
      <td>{Math.round(r.consistency)}</td>
    </>
  );
}

const RATING_HEADS = ["K/D", "OVR", "Slay", "HP", "SnD", "3rd", "Clutch", "Cons"];

export function MyTeam({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, version, mutate, spoil } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const idx = { get: (id: string) => playerInfo(state, data, id) };
  const morale = shownMorale(state, spoil.hidden);
  const [years, setYears] = useState(2);
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const canMove = gmCanMakeMoves(state);
  const starters = draft ?? gm.starters;
  const third = data.season.thirdMode === "control" ? "Control" : "Overload";

  // Which team a player last started for in this season's data (for the FA list).
  const lastTeam = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of [...data.rosters.teams, ...data.rosters.guests]) for (const p of t.players) m.set(p.id, t.team);
    return m;
  }, [data]);
  const fas = useMemo(
    () => (canMove ? freeAgents(state, data).map((id) => idx.get(id)!).sort((a, b) => ovr(b) - ovr(a)) : []),
    [state, data, version, canMove],
  );
  const shownFas = fas.filter((p) => !query || p.handle.toLowerCase().includes(query.toLowerCase())).slice(0, 30);
  // Unwatched results stay out of your record until you watch or skip them.
  const allGmSeries = Object.values(state.series).filter((r) => r.teams.includes(gm.team));
  const gmSeries = allGmSeries.filter((r) => !spoil.isHidden(r.id));
  const wins = gmSeries.filter((r) => r.winner === gm.team).length;

  const run = (fn: Parameters<typeof mutate>[0], ok?: string) => {
    const err = mutate(fn);
    setMsg(err ?? ok ?? null);
  };
  const toggleStarter = (id: string) => {
    const cur = starters.includes(id) ? starters.filter((p) => p !== id) : [...starters, id];
    setDraft(cur);
  };
  const saveLineup = () => {
    run((s) => gmSetStarters(s, starters), "Lineup saved.");
    setDraft(null);
  };

  const moveWindow = canMove
    ? state.next === 0
      ? "Preseason — signings and releases are open."
      : `Between stages — open until ${stepLabel(data.season, state.steps[state.next])} starts.`
    : state.pending
      ? "Locked while a veto is waiting."
      : "Locked during the stage. Opens after the next Major.";

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>
            <TeamTag team={dir.team(gm.team)} />
          </h2>
          <span className="sub">
            {wins}-{gmSeries.length - wins} in series · {spoil.points[gm.team] ?? 0} CDL points
          </span>
          <div className="spacer" />
          <label className="field" title="When on, the AI makes your team's veto decisions and the sim never stops for you.">
            <input type="checkbox" checked={gm.autoVeto} onChange={(e) => run((s) => gmSetAutoVeto(s, e.target.checked))} style={{ width: "auto" }} />
            Auto-veto my matches
          </label>
          <label
            className="field"
            title={gm.autoVeto ? "Sub swaps need manual vetoes (turn off auto-veto)" : "Stop after each map of your series to sub players in or out"}
          >
            <input
              type="checkbox"
              checked={!!gm.pauseBetweenMaps}
              disabled={gm.autoVeto}
              onChange={(e) => run((s) => gmSetPauseBetweenMaps(s, e.target.checked))}
              style={{ width: "auto" }}
            />
            Pause between maps (subs)
          </label>
          <label className="field" title="Keep your results hidden until you watch or skip them">
            <input
              type="checkbox"
              checked={!!gm.spoilerFree}
              onChange={(e) => run((s) => gmSetSpoilerFree(s, e.target.checked))}
              style={{ width: "auto" }}
            />
            Spoiler-free match day
          </label>
        </div>
        {msg && <div className="sub" style={{ marginBottom: 8 }}>{msg}</div>}

        <h3 style={{ margin: "4px 0 8px" }}>
          Roster ({gm.roster.length}/{GM_ROSTER_MAX}) · pick four starters
          <span className="sub" style={{ marginLeft: 8, fontWeight: 400 }}>
            Payroll ${payroll(state)}k of ${SALARY_CAP}k
          </span>
        </h3>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Start</th>
                <th className="left">Player</th>
                {RATING_HEADS.map((h) => (
                  <th key={h} title={h === "3rd" ? third : undefined}>
                    {h}
                  </th>
                ))}
                <th>Salary</th>
                <th>Yrs</th>
                <th title="Morale moves with results, playing time and prep; it adds or costs a little form">Morale</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {gm.roster.map((id) => {
                const p = idx.get(id)!;
                return (
                  <tr key={id}>
                    <td className="left">
                      <input type="checkbox" checked={starters.includes(id)} onChange={() => toggleStarter(id)} aria-label={`Start ${p.handle}`} />
                    </td>
                    <td className="left">
                      <b>
                        <PlayerLink id={id} name={p.handle} nav={nav} />
                      </b>{" "}
                      <span className="muted">{p.role}</span>
                    </td>
                    <RatingCells p={p} />
                    <td>{gm.contracts?.[id] ? `$${gm.contracts[id]!.salary}k` : "—"}</td>
                    <td>{gm.contracts?.[id]?.years ?? "—"}</td>
                    <td title={moraleWord(morale[id] ?? 70)}>
                      <span style={{ color: (morale[id] ?? 70) < 50 ? "var(--ban)" : (morale[id] ?? 70) >= 80 ? "var(--pick)" : undefined }}>{morale[id] ?? 70}</span>
                    </td>
                    <td>
                      {canMove && gm.roster.length > GM_ROSTER_MIN && (
                        <button className="btn small" onClick={() => run((s, d) => gmRelease(s, d, id), `Released ${p.handle}.`)}>
                          Release
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" disabled={!draft || starters.length !== 4} onClick={saveLineup}>
            Save lineup
          </button>
          {draft && (
            <button className="btn" onClick={() => setDraft(null)}>
              Reset
            </button>
          )}
          <span className="sub">
            {starters.length !== 4 ? `Select exactly 4 starters (${starters.length} selected).` : draft ? "Unsaved changes." : "Lineup is set; it applies from your next match."}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Free agents</h3>
          <span className="sub">{moveWindow}</span>
          <div className="spacer" />
          {canMove && (
            <label className="field" title="Longer deals ask a little less per season">
              Contract
              <select className="plain" value={years} onChange={(e) => setYears(Number(e.target.value))}>
                {[1, 2, 3].map((y) => (
                  <option key={y} value={y}>
                    {y} season{y > 1 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canMove && (
            <label className="field">
              Search
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="handle" />
            </label>
          )}
        </div>
        {canMove ? (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Player</th>
                  <th className="left">Last team</th>
                  {RATING_HEADS.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                  <th>Asks</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shownFas.map((p) => {
                  const ask = contractFor(state, data, p.id, years).salary;
                  const problem = signingProblem(state, ask);
                  return (
                  <tr key={p.id}>
                    <td className="left">
                      <b>
                        <PlayerLink id={p.id} name={p.handle} nav={nav} />
                      </b>
                    </td>
                    <td className="left muted">{dir.team(lastTeam.get(p.id) ?? "").abbr}</td>
                    <RatingCells p={p} />
                    <td>${ask}k</td>
                    <td>
                      <button
                        className="btn small"
                        disabled={gm.roster.length >= GM_ROSTER_MAX || !!problem}
                        title={gm.roster.length >= GM_ROSTER_MAX ? "Roster is full — release someone first" : (problem ?? `Sign for ${years} season${years > 1 ? "s" : ""} at $${ask}k`)}
                        onClick={() => run((s, d) => gmSign(s, d, p.id, years), `Signed ${p.handle}: ${years} season${years > 1 ? "s" : ""} at $${ask}k.`)}
                      >
                        Sign
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="sub" style={{ marginTop: 6 }}>
              {fas.length} players aren't starting anywhere on {nextStepDate(state, data)}. Showing the top {shownFas.length} by overall.
            </div>
          </div>
        ) : (
          <div className="muted">The free-agent list opens between stages.</div>
        )}
      </div>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Moves</h3>
          {gm.moves.length === 0 ? (
            <div className="muted">No roster moves yet.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {gm.moves.map((m, i) => (
                  <tr key={i}>
                    <td className="left muted">{m.beforeStage === 5 ? "Before Champs" : `Before Stage ${m.beforeStage}`}</td>
                    <td className="left">{{ sign: "Signed", release: "Released", "trade-in": "Traded for", "trade-out": "Traded away" }[m.action]}</td>
                    <td className="left">
                      <b>{idx.get(m.player)?.handle ?? m.player}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Results</h3>
          {allGmSeries.length === 0 ? (
            <div className="muted">No matches played yet.</div>
          ) : (
            <table className="tbl">
              <tbody>
                {allGmSeries
                  .slice()
                  .reverse()
                  .slice(0, 12)
                  .map((r) => {
                    const side = r.teams[0] === gm.team ? 0 : 1;
                    if (spoil.isHidden(r.id)) {
                      return (
                        <tr key={r.id} className="click" onClick={() => nav.openMatch(r.id, { watch: true })}>
                          <td className="left">
                            <span className="next-tag">Unwatched</span>
                          </td>
                          <td className="left">vs {dir.team(r.teams[1 - side]!).abbr}</td>
                          <td className="left muted">{r.label} · click to watch</td>
                        </tr>
                      );
                    }
                    const opp = r.teams[1 - side]!;
                    const won = r.winner === gm.team;
                    return (
                      <tr key={r.id} className="click" onClick={() => nav.openMatch(r.id)}>
                        <td className="left">
                          <b style={{ color: won ? "var(--pick)" : "var(--ban)" }}>{won ? "W" : "L"}</b> {r.score[side]}–{r.score[1 - side]}
                        </td>
                        <td className="left">vs {dir.team(opp).abbr}</td>
                        <td className="left muted">{r.label}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
