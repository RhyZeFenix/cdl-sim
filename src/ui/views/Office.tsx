// The GM's office: the week ahead (scouting and prep), the inbox, the owner's goals,
// finances and trades, and the off-season when a season ends. Spoiler-free: anything
// that would give away an unwatched result waits until it's watched.
import { useMemo, useState } from "react";
import {
  MIN_EXCEPTION,
  PREP_BONUS,
  PREP_MORALE,
  SALARY_CAP,
  aiRoster,
  askingSalary,
  contractFor,
  evaluateTrade,
  expiringContracts,
  gmCanMakeMoves,
  gmMarkRead,
  gmSetPrep,
  goalStatus,
  goalText,
  isDone,
  loadSeasonData,
  mapPoolFor,
  modeName,
  ordinal,
  nextGmFixtures,
  nextSeasonId,
  nextStep,
  ownerVerdict,
  payroll,
  playerInfo,
  prepLabel,
  proposeTrade,
  scoutReport,
  seasonLabel,
  seasonRecap,
  slotToMode,
  startNextSeason,
  successorTeam,
  tradeValue,
  verdictText,
  visibleInbox,
  ovrOf,
  type GoalStatus,
  type Mode,
  type PoolPhase,
  type Prep,
  type SeasonData,
  type SeasonState,
} from "../../engine";
import { stepLabel, type Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, TeamTag } from "./common";

/** The pool phase of the next step (for prep and scouting). */
function nextPhase(state: SeasonState): PoolPhase | null {
  if (state.pending) return state.pending.spec.phase;
  const step = nextStep(state);
  if (!step) return null;
  if (step.kind === "week") return { kind: "qualifiers", stage: step.stage, week: step.week };
  if (step.kind === "championship") return { kind: "championship" };
  return { kind: step.kind, stage: step.stage };
}

const STATUS_COLOR: Record<GoalStatus, string> = {
  met: "var(--pick)",
  "on track": "var(--pick)",
  open: "var(--text-3)",
  "at risk": "var(--ban)",
  failed: "var(--ban)",
};

export function Office({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const done = isDone(state);
  const pay = payroll(state);
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team) && !spoil.isHidden(r.id));
  const wins = mine.filter((r) => r.winner === gm.team).length;

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>
            <TeamTag team={dir.team(gm.team)} />
          </h2>
          <span className="sub">
            {seasonLabel(state, data)}
            {state.dynasty ? ` · dynasty year ${state.dynasty.year}` : ""} · {wins}-{mine.length - wins} in series · {spoil.points[gm.team] ?? 0} CDL points
          </span>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="l">Owner trust</span>
            <span className="v">{spoil.active ? "—" : `${gm.trust ?? 60}/100`}</span>
            <Meter value={spoil.active ? 0 : (gm.trust ?? 60)} />
          </div>
          <div className="kpi">
            <span className="l">Payroll</span>
            <span className="v">
              ${pay}k <span className="muted">/ ${SALARY_CAP}k</span>
            </span>
            <Meter value={(100 * pay) / SALARY_CAP} warn={pay > SALARY_CAP} />
          </div>
          <div className="kpi">
            <span className="l">Prep this week</span>
            <span className="v">{prepLabel(gm.prep)}</span>
          </div>
          <div className="kpi">
            <span className="l">Next</span>
            <span className="v">{done ? "Season over" : stepLabel(data.season, nextStep(state))}</span>
          </div>
        </div>
      </div>

      {done && !spoil.active && <OffSeason store={store} />}

      {!done && (
        <div className="grid2" style={{ marginTop: 12 }}>
          <Scouting store={store} nav={nav} />
          <PrepCard store={store} />
        </div>
      )}

      <div className="grid2" style={{ marginTop: 12 }}>
        <Inbox store={store} />
        <Goals store={store} />
      </div>

      <Finances store={store} nav={nav} />
      <Trades store={store} nav={nav} />
      {state.dynasty && state.dynasty.history.length > 0 && <History state={state} />}
    </div>
  );
}

function Meter({ value, warn = false }: { value: number; warn?: boolean }) {
  return (
    <span className="meter" aria-hidden>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: warn ? "var(--ban)" : undefined }} />
    </span>
  );
}

// ------------------------------------------------------------------ the week ahead

function Scouting({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const fixtures = useMemo(() => nextGmFixtures(state, data), [state, data, version]);
  const [pick, setPick] = useState(0);
  const fx = fixtures[Math.min(pick, fixtures.length - 1)];
  const report = useMemo(() => (fx ? scoutReport(state, data, fx.opponent, fx.phase, spoil.hidden) : null), [fx, state, data, version]);
  const step = nextStep(state);

  if (!fx || !report) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Scouting</h3>
        <div className="muted">
          {step && step.kind !== "week" ? `${stepLabel(data.season, step)}: opponents are set by the bracket. A report appears when your match is up.` : "No match coming up."}
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-head">
        <h3>Scouting: {dir.team(fx.opponent).name}</h3>
        {fixtures.length > 1 && (
          <select className="plain" value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Opponent">
            {fixtures.map((f, i) => (
              <option key={i} value={i}>
                vs {dir.team(f.opponent).abbr}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>
        {fx.label} · {report.record[0]}-{report.record[1]} this season · form{" "}
        {report.recent.length ? report.recent.map((r) => (r.won ? "W" : "L")).join(" ") : "—"} · roster edge{" "}
        <b style={{ color: report.edge >= 0 ? "var(--pick)" : "var(--ban)" }}>
          {report.edge >= 0 ? "+" : ""}
          {report.edge}
        </b>{" "}
        overall
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Their lineup</th>
            <th>OVR</th>
            <th>K/D</th>
            <th>Maps</th>
          </tr>
        </thead>
        <tbody>
          {report.lineup.map((p) => (
            <tr key={p.id}>
              <td className="left">
                <PlayerLink id={p.id} name={p.handle} nav={nav} />
                {report.hottest?.id === p.id && <span className="next-tag" style={{ marginLeft: 6 }}>Hot</span>}
              </td>
              <td>{p.ovr}</td>
              <td>{p.kd !== undefined ? p.kd.toFixed(2) : "—"}</td>
              <td>{p.maps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 style={{ margin: "10px 0 4px" }}>Maps this week</h4>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Map</th>
            <th title="Their map preference">Them</th>
            <th title="Your map preference">You</th>
            <th className="left">Read</th>
          </tr>
        </thead>
        <tbody>
          {report.maps.map((m) => (
            <tr key={`${m.mode}:${m.map}`}>
              <td className="left">
                {m.map} <span className="muted">{m.mode.toUpperCase()}</span>
              </td>
              <td>{fmtMod(m.theirs)}</td>
              <td>{fmtMod(m.yours)}</td>
              <td className="left">
                {m.likely === "pick" ? <span style={{ color: "var(--ban)" }}>Likely their pick</span> : m.likely === "ban" ? <span className="muted">Likely their ban</span> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sub" style={{ marginTop: 6 }}>
        Map preferences come from each team's real map win rates (±5 is a strong lean). Unwatched results are left out.
      </div>
    </div>
  );
}

const fmtMod = (x: number) => (Math.abs(x) < 0.005 ? "0" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}`);

function PrepCard({ store }: { store: SeasonStore }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const phase = nextPhase(state);
  const pool = phase ? mapPoolFor(data.season, phase) : null;
  const maps = pool
    ? (["hp", "snd", "third"] as const).flatMap((slot) => pool[slot].map((map) => ({ mode: slotToMode(data.season, slot), map })))
    : [];
  const modes: Mode[] = ["hp", "snd", slotToMode(data.season, "third")];
  const cur = gm.prep ?? { kind: "balanced" };
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Prep) => setMsg(mutate((s) => gmSetPrep(s, p)));
  const locked = !!state.pending;
  const firstMap = maps[0];

  const options: { kind: Prep["kind"]; title: string; text: string }[] = [
    { kind: "balanced", title: "Balanced", text: "No focus. No bonus, no morale cost." },
    { kind: "map", title: "Map focus", text: `Drill one map: +${Math.round(PREP_BONUS.map * 100)} on it (a map preference swing).` },
    { kind: "mode", title: "Mode focus", text: `+${Math.round(PREP_BONUS.mode * 100)} on every map of one mode.` },
    { kind: "rest", title: "Rest", text: `No bonus, but +${PREP_MORALE.rest} morale for everyone.` },
    { kind: "grind", title: "Grind scrims", text: `+${Math.round(PREP_BONUS.grind * 100)} on every map, but ${PREP_MORALE.grind} morale.` },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <h3>This week's prep</h3>
        <span className="sub">{locked ? "Locked while your match is waiting." : "Applies to every match in the next sim step."}</span>
      </div>
      {msg && <div className="sub" style={{ color: "var(--ban)" }}>{msg}</div>}
      <div className="prep">
        {options.map((o) => (
          <label key={o.kind} className={`prep-opt ${cur.kind === o.kind ? "on" : ""}`}>
            <input
              type="radio"
              name="prep"
              disabled={locked || ((o.kind === "map" || o.kind === "mode") && !firstMap)}
              checked={cur.kind === o.kind}
              onChange={() => {
                if (o.kind === "map") set({ kind: "map", mode: firstMap!.mode, map: firstMap!.map });
                else if (o.kind === "mode") set({ kind: "mode", mode: modes[0]! });
                else set({ kind: o.kind } as Prep);
              }}
            />
            <span>
              <b>{o.title}</b> <span className="muted">{o.text}</span>
              {o.kind === "map" && cur.kind === "map" && (
                <select
                  className="plain"
                  disabled={locked}
                  value={`${cur.mode}:${cur.map}`}
                  onChange={(e) => {
                    const [mode, map] = e.target.value.split(":") as [Mode, string];
                    set({ kind: "map", mode, map });
                  }}
                  aria-label="Map to drill"
                  style={{ marginLeft: 8 }}
                >
                  {maps.map((m) => (
                    <option key={`${m.mode}:${m.map}`} value={`${m.mode}:${m.map}`}>
                      {m.map} {modeName(m.mode)}
                    </option>
                  ))}
                </select>
              )}
              {o.kind === "mode" && cur.kind === "mode" && (
                <select className="plain" disabled={locked} value={cur.mode} onChange={(e) => set({ kind: "mode", mode: e.target.value as Mode })} aria-label="Mode" style={{ marginLeft: 8 }}>
                  {modes.map((m) => (
                    <option key={m} value={m}>
                      {modeName(m)}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        Prep is hidden from opponents: it doesn't change their veto, only how the maps play.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inbox and owner

function Inbox({ store }: { store: SeasonStore }) {
  const { state, spoil, mutate } = store;
  const items = visibleInbox(state, spoil.hidden);
  const waiting = (state.gm!.inbox ?? []).length - items.length;
  const [open, setOpen] = useState<string | null>(null);
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Inbox {unread > 0 && <span className="next-tag">{unread} new</span>}</h3>
        <div className="spacer" />
        {unread > 0 && (
          <button className="btn small" onClick={() => mutate((s) => gmMarkRead(s, "all", spoil.hidden))}>
            Mark all read
          </button>
        )}
      </div>
      {waiting > 0 && <div className="sub" style={{ marginBottom: 6 }}>{waiting} message{waiting > 1 ? "s" : ""} waiting until you watch your match.</div>}
      <div className="inbox">
        {items.slice(0, 40).map((i) => (
          <button
            key={i.id}
            className={`msg ${i.read ? "" : "unread"}`}
            aria-expanded={open === i.id}
            onClick={() => {
              setOpen(open === i.id ? null : i.id);
              if (!i.read) mutate((s) => gmMarkRead(s, [i.id]));
            }}
          >
            <span className="msg-head">
              <span className="pill">{i.kind}</span> <b>{i.title}</b> <span className="muted">{i.date}</span>
            </span>
            {open === i.id && <span className="msg-body">{i.body}</span>}
          </button>
        ))}
        {!items.length && <div className="muted">No messages yet.</div>}
      </div>
    </div>
  );
}

function Goals({ store }: { store: SeasonStore }) {
  const { state, data, spoil } = store;
  const gm = state.gm!;
  const v = !spoil.active ? ownerVerdict(state, data) : null;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Owner's goals</h3>
        <span className="sub">Preseason expectation: {gm.expectedRank ? `${gm.expectedRank} of ${data.season.teams.length}` : "—"}</span>
      </div>
      {spoil.active && <div className="sub" style={{ marginBottom: 6 }}>Progress updates after you watch your match.</div>}
      <table className="tbl">
        <tbody>
          {(gm.goals ?? []).map((g, i) => {
            const st = spoil.active ? null : goalStatus(state, data, g);
            return (
              <tr key={i}>
                <td className="left">{goalText(g)}</td>
                <td className="left">{st ? <b style={{ color: STATUS_COLOR[st.status] }}>{st.status}</b> : "—"}</td>
                <td className="left muted">{st?.detail ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {v && isDone(state) && (
        <div style={{ marginTop: 8 }}>
          <b>
            {v.met}/{v.total} goals met.
          </b>{" "}
          {verdictText[v.verdict]}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ finances and trades

function Finances({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data } = store;
  const gm = state.gm!;
  const rows = gm.roster.map((id) => ({ id, p: playerInfo(state, data, id), c: gm.contracts?.[id] }));
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Contracts</h3>
        <span className="sub">
          Payroll ${payroll(state)}k of ${SALARY_CAP}k
          {gm.deadCap ? ` (incl. $${gm.deadCap}k dead money from releases)` : ""}. Players asking ${MIN_EXCEPTION}k or less can always be signed.
        </span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Player</th>
            <th>OVR</th>
            <th>Salary</th>
            <th>Years left</th>
            <th title="What they'd ask on the open market today">Market ask</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, p, c }) => (
            <tr key={id}>
              <td className="left">
                <PlayerLink id={id} name={p?.handle ?? id} nav={nav} />
              </td>
              <td>{Math.round(ovrOf(state, data, id))}</td>
              <td>{c ? `$${c.salary}k` : "—"}</td>
              <td>{c ? c.years : "—"}</td>
              <td className="muted">${askingSalary(ovrOf(state, data, id))}k</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Trades({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, mutate, version } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const others = data.season.teams.filter((t) => t.id !== gm.team);
  const [team, setTeam] = useState(others[0]!.id);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const open = gmCanMakeMoves(state);
  const theirs = useMemo(() => (open ? aiRoster(state, data, team) : []), [open, state, data, team, version]);
  const verdict = useMemo(() => (open && (give.length || get.length) ? evaluateTrade(state, data, { team, give, get }) : null), [open, state, data, team, give, get, version]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Trades</h3>
        <span className="sub">{open ? "Open: AI teams accept trades they come out ahead on." : "Trades open before the season and between stages."}</span>
        <div className="spacer" />
        {open && (
          <select
            className="plain"
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setGet([]);
              setMsg(null);
            }}
            aria-label="Trade partner"
          >
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {msg && <div className="sub" style={{ marginBottom: 6 }}>{msg}</div>}
      {open && (
        <>
          <div className="grid2">
            <TradeSide
              title="You send"
              ids={gm.roster}
              picked={give}
              onToggle={(id) => toggle(give, setGive, id)}
              store={store}
              nav={nav}
              salary={(id) => gm.contracts?.[id]?.salary}
            />
            <TradeSide
              title={`${dir.team(team).abbr} send`}
              ids={theirs}
              picked={get}
              onToggle={(id) => toggle(get, setGet, id)}
              store={store}
              nav={nav}
              salary={(id) => askingSalary(ovrOf(state, data, id))}
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn primary"
              disabled={!verdict?.accepted}
              onClick={() => {
                const err = mutate((s, d) => {
                  const v = proposeTrade(s, d, { team, give, get });
                  if (!v.accepted) throw new Error(v.reason);
                });
                setMsg(err ?? "Trade done. It's in your inbox and the moves list.");
                setGive([]);
                setGet([]);
              }}
            >
              Propose trade
            </button>
            {verdict && (
              <span className="sub" style={{ color: verdict.accepted ? "var(--pick)" : "var(--ban)" }}>
                {verdict.reason} Value to them {Math.round(verdict.valueIn)} in, {Math.round(verdict.valueOut)} out · payroll after ${verdict.payrollAfter}k.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TradeSide({
  title,
  ids,
  picked,
  onToggle,
  store,
  nav,
  salary,
}: {
  title: string;
  ids: string[];
  picked: string[];
  onToggle: (id: string) => void;
  store: SeasonStore;
  nav: Nav;
  salary: (id: string) => number | undefined;
}) {
  const { state, data } = store;
  return (
    <div>
      <h4 style={{ margin: "0 0 4px" }}>{title}</h4>
      <table className="tbl">
        <thead>
          <tr>
            <th />
            <th className="left">Player</th>
            <th>OVR</th>
            <th>Salary</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const ovr = ovrOf(state, data, id);
            return (
              <tr key={id}>
                <td className="left">
                  <input type="checkbox" checked={picked.includes(id)} onChange={() => onToggle(id)} aria-label={`Trade ${id}`} />
                </td>
                <td className="left">
                  <PlayerLink id={id} name={playerInfo(state, data, id)?.handle ?? id} nav={nav} />
                </td>
                <td>{Math.round(ovr)}</td>
                <td>{salary(id) !== undefined ? `$${salary(id)}k` : "—"}</td>
                <td>{Math.round(tradeValue(ovr, salary(id)))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ dynasty

function OffSeason({ store }: { store: SeasonStore }) {
  const { state, data } = store;
  const gm = state.gm!;
  const recap = seasonRecap(state, data);
  const expiring = expiringContracts(state);
  const [resign, setResign] = useState<Record<string, number>>({});
  const nextId = nextSeasonId(state.seasonId);
  const nextData: SeasonData = loadSeasonData(nextId);
  const successor = successorTeam(state);
  const [team, setTeam] = useState(successor ?? nextData.season.teams[0]!.id);
  const [msg, setMsg] = useState<string | null>(null);
  const fired = recap.verdict === "fired";
  const repeat = nextId === state.seasonId;
  const nextLabel = repeat ? `CDL ${Number(/\d{4}/.exec(seasonLabel(state, data))?.[0] ?? 2026) + 1}` : nextData.season.label;

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Off-season</h3>
        <span className="sub">
          {ordinal(recap.rank)} in points · {recap.record[0]}-{recap.record[1]} ·{" "}
          {recap.eventsWon.length ? `won ${recap.eventsWon.join(", ")}` : "no titles"} · {recap.goalsMet}/{recap.goalsTotal} goals
        </span>
      </div>
      <p style={{ margin: "0 0 10px" }}>
        <b>{verdictText[recap.verdict]}</b>
      </p>
      {fired ? (
        <div className="muted">Your run ends here. Start a new season to take over another team.</div>
      ) : (
        <>
          <h4 style={{ margin: "0 0 4px" }}>Expiring contracts</h4>
          {expiring.length === 0 ? (
            <div className="muted">Nobody's contract runs out.</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Player</th>
                  <th>OVR</th>
                  <th>Now</th>
                  <th className="left">Re-sign</th>
                </tr>
              </thead>
              <tbody>
                {expiring.map((id) => (
                  <tr key={id}>
                    <td className="left">{playerInfo(state, data, id)?.handle ?? id}</td>
                    <td>{Math.round(ovrOf(state, data, id))}</td>
                    <td>${gm.contracts?.[id]?.salary ?? "—"}k</td>
                    <td className="left">
                      <select
                        className="plain"
                        value={resign[id] ?? 0}
                        onChange={(e) => setResign({ ...resign, [id]: Number(e.target.value) })}
                        aria-label={`Re-sign ${id}`}
                      >
                        <option value={0}>Let go</option>
                        {[1, 2, 3].map((y) => (
                          <option key={y} value={y}>
                            {y} yr · ${contractFor(state, data, id, y).salary}k
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <label className="field">
              Franchise next season
              <select className="plain" value={team} onChange={(e) => setTeam(e.target.value)}>
                {nextData.season.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === successor ? " (your franchise)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn primary"
              onClick={() => {
                if (!confirm(`Start ${nextLabel}? Export this season first if you want to keep it.`)) return;
                try {
                  const picks = Object.fromEntries(Object.entries(resign).filter(([, y]) => y > 0));
                  store.replace(startNextSeason(state, data, { team, resign: picks }));
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Start {nextLabel}
            </button>
            {msg && <span className="sub" style={{ color: "var(--ban)" }}>{msg}</span>}
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            Players with years left come with you (one season off each contract). {repeat ? "Past 2026 the format repeats and every player's ratings progress with age." : `Other teams use their real ${nextData.season.label} rosters.`}
          </div>
        </>
      )}
    </div>
  );
}

function History({ state }: { state: SeasonState }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3 style={{ marginBottom: 8 }}>Dynasty history</h3>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Season</th>
            <th className="left">Team</th>
            <th>Points rank</th>
            <th>Record</th>
            <th className="left">Titles</th>
            <th className="left">Owner</th>
          </tr>
        </thead>
        <tbody>
          {state.dynasty!.history.map((h) => (
            <tr key={h.year}>
              <td className="left">{h.label}</td>
              <td className="left">{h.teamName}</td>
              <td>{h.rank}</td>
              <td>
                {h.record[0]}-{h.record[1]}
              </td>
              <td className="left">{h.eventsWon.join(", ") || "—"}</td>
              <td className="left">
                {h.goalsMet}/{h.goalsTotal} · {h.verdict}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
