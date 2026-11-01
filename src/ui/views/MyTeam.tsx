import { Fragment, useMemo, useState } from "react";
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
  gmSignOffer,
  negotiate,
  offerProblem,
  type Offer,
  fogText,
  fogWidth,
  gmSetFog,
  nextStepDate,
  playerInfo,
  contractFor,
  signingProblem,
  payroll,
  shownMorale,
  moraleWord,
  capLabel,
  chemistryOf,
  roleBalance,
  type Player,
} from "../../engine";
import { stepLabel, type Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, TeamTag } from "./common";

const ovr = (p: Player) => Math.round((p.ratings.slaying + p.ratings.hp_obj + p.ratings.snd_iq + p.ratings.third_mode) / 4);

function RatingCells({ p, fog = 0 }: { p: Player; fog?: number }) {
  const r = p.ratings;
  const est = p.ratingSource !== "stats";
  const f = (v: number, k: string) => fogText(v, fog, `${p.id}/${k}`);
  return (
    <>
      <td title={p.stats ? `${p.stats.maps} maps this season` : "No stats this season"}>{p.stats ? p.stats.kd.toFixed(2) : "—"}</td>
      <td title={fog ? "Scouting range: a better analyst, scrims and playing them narrow it" : est ? "Estimated from team placements (no season stats)" : "From season stats"}>
        <b>{f(ovr(p), "ovr")}</b>
        {est && !fog && <span className="muted" style={{ fontSize: 11 }}> est.</span>}
      </td>
      <td>{f(r.slaying, "slay")}</td>
      <td>{f(r.hp_obj, "hp")}</td>
      <td>{f(r.snd_iq, "snd")}</td>
      <td>{f(r.third_mode, "third")}</td>
      <td>{f(r.clutch, "clutch")}</td>
      <td>{f(r.consistency, "cons")}</td>
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
  const [nego, setNego] = useState<(Offer & { id: string }) | null>(null);
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
          <label className="field" title="Other teams' ratings show as ranges until you scout them (analyst, scrims, playing them)">
            <input type="checkbox" checked={gm.fog !== false} onChange={(e) => run((s) => gmSetFog(s, e.target.checked))} style={{ width: "auto" }} />
            Scouting fog
          </label>
        </div>
        {msg && <div className="sub" style={{ marginBottom: 8 }}>{msg}</div>}

        <h3 style={{ margin: "4px 0 8px" }}>
          Roster ({gm.roster.length}/{GM_ROSTER_MAX}) · pick four starters
          <span className="sub" style={{ marginLeft: 8, fontWeight: 400 }}>
            Payroll ${payroll(state)}k of {capLabel(state)}
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
          {starters.length === 4 && (
            <span className="sub" title="Chemistry grows with every map these four play together. A lineup needs an AR and an SMG player (flex covers either).">
              · Chemistry <b>{chemistryOf(state, starters)}</b>/100 · Roles {roleBalance(state, data, starters).ar} AR, {roleBalance(state, data, starters).smg} SMG, {roleBalance(state, data, starters).flex} flex
              {!roleBalance(state, data, starters).ok && <b style={{ color: "var(--ban)" }}> · {roleBalance(state, data, starters).note} (form penalty)</b>}
            </span>
          )}
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
                  const open = nego?.id === p.id;
                  return (
                  <Fragment key={p.id}>
                  <tr>
                    <td className="left">
                      <b>
                        <PlayerLink id={p.id} name={p.handle} nav={nav} />
                      </b>
                    </td>
                    <td className="left muted">{dir.team(lastTeam.get(p.id) ?? "").abbr}</td>
                    <RatingCells p={p} fog={fogWidth(state, data, p.id)} />
                    <td>${ask}k</td>
                    <td>
                      <button
                        className="btn small"
                        disabled={gm.roster.length >= GM_ROSTER_MAX || !!problem}
                        title={gm.roster.length >= GM_ROSTER_MAX ? "Roster is full — release someone first" : (problem ?? `Sign for ${years} season${years > 1 ? "s" : ""} at $${ask}k`)}
                        onClick={() => run((s, d) => gmSign(s, d, p.id, years), `Signed ${p.handle}: ${years} season${years > 1 ? "s" : ""} at $${ask}k.`)}
                      >
                        Sign
                      </button>{" "}
                      <button
                        className="btn small"
                        aria-expanded={open}
                        onClick={() => setNego(open ? null : { id: p.id, salary: Math.round((ask * 0.9) / 5) * 5, years, bonus: 0, option: false })}
                        title="Offer your own terms: salary, a signing bonus, a team option"
                      >
                        Negotiate
                      </button>
                    </td>
                  </tr>
                  {open && nego && <NegotiateRow state={state} data={data} offer={nego} setOffer={setNego} cols={RATING_HEADS.length + 4} onOffer={(o) => run((s, d) => gmSignOffer(s, d, p.id, o), `Signed ${p.handle}: ${o.years} season${o.years > 1 ? "s" : ""} at $${o.salary}k${o.bonus ? ` plus a $${o.bonus}k bonus` : ""}${o.option ? " with a team option" : ""}.`)} />}
                  </Fragment>
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

function NegotiateRow({ state, data, offer, setOffer, onOffer, cols }: {
  state: SeasonStore["state"];
  data: SeasonStore["data"];
  offer: Offer & { id: string };
  setOffer: (o: Offer & { id: string }) => void;
  onOffer: (o: Offer) => void;
  cols: number;
}) {
  const r = negotiate(state, data, offer.id, offer);
  const problem = offerProblem(state, offer);
  const num = (k: "salary" | "bonus" | "years", v: string) => setOffer({ ...offer, [k]: Math.max(0, Number(v) || 0) });
  return (
    <tr className="nego">
      <td colSpan={cols} className="left">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="field">
            Salary ($k)
            <input type="number" step={5} min={0} value={offer.salary} onChange={(e) => num("salary", e.target.value)} style={{ width: 80 }} />
          </label>
          <label className="field">
            Seasons
            <select className="plain" value={offer.years} onChange={(e) => num("years", e.target.value)}>
              {[1, 2, 3].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="field" title="Paid now, counts against this season's cap; worth a bit more to the player than salary">
            Signing bonus ($k)
            <input type="number" step={5} min={0} value={offer.bonus ?? 0} onChange={(e) => num("bonus", e.target.value)} style={{ width: 80 }} />
          </label>
          <label className="field" title="You can keep them one more season at the same salary when the deal ends; they want a little more for it">
            <span>
              <input type="checkbox" checked={!!offer.option} onChange={(e) => setOffer({ ...offer, option: e.target.checked })} /> Team option
            </span>
          </label>
          <span className="sub" style={{ color: problem ? "var(--ban)" : r.accepted ? "var(--pick)" : undefined }}>
            {problem ?? (r.accepted ? "They'd sign this." : `They'd counter at $${r.counter!.salary}k a season.`)}
          </span>
          {!r.accepted && r.counter && (
            <button className="btn small" onClick={() => setOffer({ ...offer, ...r.counter })}>Meet the counter</button>
          )}
          <button className="btn small primary" disabled={!!problem} onClick={() => onOffer(offer)}>Make offer</button>
        </div>
      </td>
    </tr>
  );
}
