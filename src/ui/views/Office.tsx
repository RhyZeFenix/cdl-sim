// The GM's office: the week ahead (scouting and prep), the inbox, the owner's goals,
// finances and trades, and the off-season when a season ends. Spoiler-free: anything
// that would give away an unwatched result waits until it's watched.
import { Fragment, useMemo, useState } from "react";
import {
  ACADEMY_MAX,
  ACADEMY_SALARY,
  FATIGUE,
  MAX_SCRIMS,
  MIN_EXCEPTION,
  PREP_BONUS,
  SCRIM_EDGE,
  STAFF_BUDGET,
  academyPayroll,
  awardLines,
  calendar,
  capLabel,
  capOf,
  chemistryOf,
  roleBalance,
  gmChoose,
  gmFire,
  gmHire,
  gmPromoteProspect,
  gmReleaseProspect,
  gmSetScrims,
  gmSetTradeBlock,
  gmSignProspect,
  isRival,
  marketAsk,
  overall,
  potentialRange,
  staffPayroll,
  staffPool,
  stars,
  tradesOpen,
  type InboxItem,
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
import { Help, PlayerLink, TeamTag } from "./common";
import { hintSeen, markHintSeen } from "../theme";
import { Career } from "./Career";
import { SeasonReviewCard } from "./Review";

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

type OfficeTab = "overview" | "week" | "calendar" | "market" | "staff" | "academy" | "awards" | "career";
const OFFICE_TABS: { id: OfficeTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "week", label: "This week" },
  { id: "calendar", label: "Calendar" },
  { id: "market", label: "Market" },
  { id: "staff", label: "Staff" },
  { id: "academy", label: "Academy" },
  { id: "awards", label: "Awards" },
  { id: "career", label: "Career" },
];

export function Office({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const done = isDone(state);
  const pay = payroll(state);
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team) && !spoil.isHidden(r.id));
  const wins = mine.filter((r) => r.winner === gm.team).length;
  const [tab, setTab] = useState<OfficeTab>("overview");
  const pendingChoices = visibleInbox(state, spoil.hidden).filter((i) => i.choices && !i.answered).length;
  const fatigue = gm.fatigue ?? 0;
  const streak = gm.streak ?? 0;

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
            <span className="l">
              Owner trust
              <Help text="0-100. Moves after every Major and Champs against where your roster was expected to finish. Too low at season's end and you can be fired." />
            </span>
            <span className="v">{spoil.active ? "—" : `${gm.trust ?? 60}/100`}</span>
            <Meter value={spoil.active ? 0 : (gm.trust ?? 60)} />
          </div>
          <div className="kpi">
            <span className="l">
              Payroll
              <Help text="Player salaries plus dead money from releases. Stay under the cap to sign anyone asking more than the minimum. The cap depends on difficulty." />
            </span>
            <span className="v">
              ${pay}k <span className="muted">/ {capLabel(state)}</span>
            </span>
            <Meter value={Number.isFinite(capOf(state)) ? (100 * pay) / capOf(state) : 0} warn={pay > capOf(state)} />
          </div>
          <div className="kpi" title="Chemistry grows with every map your starters play together; roles need an AR and an SMG (flex covers either)">
            <span className="l">
              Chemistry
              <Help text="Grows with every map your starting four play together (50 maps per pair for full). Worth up to ±1 skill point. A lineup without an AR and an SMG player costs a little more." />
            </span>
            <span className="v">
              {chemistryOf(state, gm.starters)}/100
              {!roleBalance(state, data, gm.starters).ok && <span style={{ color: "var(--ban)", fontSize: 12 }}> · {roleBalance(state, data, gm.starters).note}</span>}
            </span>
            <Meter value={chemistryOf(state, gm.starters)} />
          </div>
          <div className="kpi">
            <span className="l">
              Fatigue
              <Help text="Scrims and grinding add fatigue; rest and lighter weeks clear it. Above 50 it costs form on every map." />
            </span>
            <span className="v">{fatigue}/100</span>
            <Meter value={fatigue} warn={fatigue > 50} />
          </div>
          <div className="kpi">
            <span className="l">
              Streak
              <Help text="Your current run of series wins (W) or losses (L). Long streaks make the news and trigger press conferences." />
            </span>
            <span className="v">{spoil.active ? "—" : streak > 0 ? `W${streak}` : streak < 0 ? `L${-streak}` : "—"}</span>
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

      <nav className="tabs subtabs" role="tablist" aria-label="Office">
        {OFFICE_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "overview" && pendingChoices > 0 ? <span className="next-tag" style={{ marginLeft: 6 }}>{pendingChoices}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <Guide />
          {done && !spoil.active && <SeasonReviewCard store={store} />}
          {done && !spoil.active && <OffSeason store={store} />}
          <div className="grid2" style={{ marginTop: 12 }}>
            <Inbox store={store} />
            <Goals store={store} />
          </div>
          {state.dynasty && state.dynasty.history.length > 0 && <History state={state} />}
        </>
      )}
      {tab === "week" &&
        (done ? (
          <div className="card muted">The season is over. Plan the off-season on the Overview tab.</div>
        ) : (
          <div className="grid2">
            <Scouting store={store} nav={nav} />
            <div>
              <PrepCard store={store} />
              <Practice store={store} />
            </div>
          </div>
        ))}
      {tab === "calendar" && <CalendarView store={store} nav={nav} />}
      {tab === "market" && (
        <>
          <Offers store={store} />
          <Finances store={store} nav={nav} />
          <Trades store={store} nav={nav} />
        </>
      )}
      {tab === "staff" && <StaffView store={store} />}
      {tab === "academy" && <AcademyView store={store} nav={nav} />}
      {tab === "awards" && <AwardsView store={store} nav={nav} />}
      {tab === "career" && <Career store={store} />}
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
        <h3>
          Scouting: {dir.team(fx.opponent).name}
          {isRival(state, fx.opponent) && <span className="next-tag" style={{ marginLeft: 6 }}>Rival</span>}
        </h3>
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
              <td>{report.intel === "full" ? fmtMod(m.theirs) : "?"}</td>
              <td>{fmtMod(m.yours)}</td>
              <td className="left">
                {report.intel === "basic" ? "" : m.likely === "pick" ? <span style={{ color: "var(--ban)" }}>Likely their pick</span> : m.likely === "ban" ? <span className="muted">Likely their ban</span> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sub" style={{ marginTop: 6 }}>
        {report.intel === "full"
          ? `Full intel${report.familiar ? " from your scrims" : " from your analyst"}. `
          : report.intel === "reads"
            ? "Your analyst can read their likely picks and bans; hire a 3★ analyst or scrim them for their map numbers. "
            : "No analyst: you only know your own map numbers. Hire one (Staff) or scrim them (This week). "}
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
  const [err, setErr] = useState<string | null>(null);
  const unread = items.filter((i) => !i.read).length;
  const answer = (i: InboxItem, choice: string) => setErr(mutate((s, d) => gmChoose(s, d, i.id, choice)));
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
      {err && <div className="sub" style={{ color: "var(--ban)", marginBottom: 6 }}>{err}</div>}
      <div className="inbox">
        {items.slice(0, 50).map((i) => {
          const ask = !!i.choices && !i.answered;
          const shown = open === i.id || ask;
          return (
            <div key={i.id} className={`msg ${i.read ? "" : "unread"} ${ask ? "ask" : ""}`}>
              <button
                className="msg-head"
                aria-expanded={shown}
                onClick={() => {
                  setOpen(open === i.id ? null : i.id);
                  if (!i.read) mutate((s) => gmMarkRead(s, [i.id]));
                }}
              >
                <span className="pill">{i.kind}</span> <b>{i.title}</b> <span className="muted">{i.date}</span>
              </button>
              {shown && <span className="msg-body">{i.body}</span>}
              {ask && (
                <span className="row" style={{ gap: 6 }}>
                  {i.choices!.map((c) => (
                    <button key={c.id} className="btn small" title={c.hint} onClick={() => answer(i, c.id)}>
                      {c.label}
                    </button>
                  ))}
                  <span className="sub">{i.choices!.map((c) => `${c.label}: ${c.hint}`).join(" · ")}</span>
                </span>
              )}
              {i.answered && i.choices && shown && (
                <span className="sub">{i.answered === "expired" ? "Expired." : `You chose: ${i.choices.find((c) => c.id === i.answered)?.label}.`}</span>
              )}
            </div>
          );
        })}
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
          Payroll ${payroll(state)}k of {capLabel(state)}
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
            <th title="AI offers target players on the block">On the block</th>
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
              <td className="muted">${marketAsk(state, data, id)}k</td>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Trade block: ${p?.handle ?? id}`}
                  checked={(gm.tradeBlock ?? []).includes(id)}
                  onChange={(e) =>
                    store.mutate((s) => gmSetTradeBlock(s, e.target.checked ? [...(gm.tradeBlock ?? []), id] : (gm.tradeBlock ?? []).filter((x) => x !== id)))
                  }
                />
              </td>
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
  const open = tradesOpen(state);
  const theirs = useMemo(() => (open ? aiRoster(state, data, team) : []), [open, state, data, team, version]);
  const verdict = useMemo(() => (open && (give.length || get.length) ? evaluateTrade(state, data, { team, give, get }) : null), [open, state, data, team, give, get, version]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Trades</h3>
        <span className="sub">
          {open
            ? "Open: AI teams accept trades they come out ahead on."
            : gmCanMakeMoves(state)
              ? "The trade deadline has passed: no trades before Champs."
              : "Trades open before the season and between stages (until the deadline before Champs)."}
        </span>
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

// ------------------------------------------------------------------ practice

function Practice({ store }: { store: SeasonStore }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const scrims = gm.scrims ?? [];
  const [err, setErr] = useState<string | null>(null);
  const locked = !!state.pending;
  const toggle = (t: string) => {
    const next = scrims.includes(t) ? scrims.filter((x) => x !== t) : [...scrims, t];
    setErr(mutate((s, d) => gmSetScrims(s, d, next)));
  };
  const fatigue = gm.fatigue ?? 0;
  const nextFatigue = Math.max(0, Math.min(100, fatigue + FATIGUE[gm.prep?.kind ?? "balanced"] + scrims.length * FATIGUE.scrim));
  return (
    <div className="card">
      <div className="card-head">
        <h3>Practice planner</h3>
        <span className="sub">Scrim up to {MAX_SCRIMS} teams a week.</span>
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>
        A scrim gives full scouting intel on that team and a +{Math.round(SCRIM_EDGE * 1000) / 10} edge when you play them in the next two steps, but adds {FATIGUE.scrim} fatigue.
        Fatigue over 50 costs form on every map. Rest clears it fastest.
      </div>
      {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
      <div className="chips">
        {data.season.teams
          .filter((t) => t.id !== gm.team)
          .map((t) => {
            const on = scrims.includes(t.id);
            const familiar = (gm.familiarity?.[t.id] ?? -1) > state.next;
            return (
              <button key={t.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={locked || (!on && scrims.length >= MAX_SCRIMS)} onClick={() => toggle(t.id)} title={t.name}>
                {t.abbr}
                {familiar && !on ? " ·" : ""}
                {isRival(state, t.id) ? " 🔥" : ""}
              </button>
            );
          })}
      </div>
      <div style={{ marginTop: 8 }}>
        Fatigue now <b>{fatigue}</b> → after this step <b style={{ color: nextFatigue > 50 ? "var(--ban)" : undefined }}>{nextFatigue}</b>
        <Meter value={nextFatigue} warn={nextFatigue > 50} />
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {scrims.length ? `Scrimming ${scrims.map((t) => dir.team(t).abbr).join(" and ")} this week.` : "No scrims planned."} A dot marks teams you're still familiar with; 🔥 marks rivals.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ calendar

function CalendarView({ store, nav }: { store: SeasonStore; nav: Nav }) {
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

function Offers({ store }: { store: SeasonStore }) {
  const { state, spoil, mutate } = store;
  const [err, setErr] = useState<string | null>(null);
  const open = visibleInbox(state, spoil.hidden).filter((i) => (i.kind === "offer" || i.kind === "demand") && !i.answered);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Offers and demands</h3>
        <span className="sub">AI teams make offers each time a window opens; they expire when it closes.</span>
      </div>
      {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
      {open.length === 0 ? (
        <div className="muted">Nothing waiting on you.</div>
      ) : (
        open.map((i) => (
          <div key={i.id} className="offer">
            <div>
              <b>{i.title}</b>
              <div className="sub">{i.body}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {i.choices!.map((c) => (
                <button key={c.id} className={`btn small ${c.id === "accept" || c.id === "pay" ? "primary" : ""}`} title={c.hint} onClick={() => setErr(mutate((s, d) => gmChoose(s, d, i.id, c.id)))}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ------------------------------------------------------------------ staff

function StaffView({ store }: { store: SeasonStore }) {
  const { state, mutate } = store;
  const gm = state.gm!;
  const [err, setErr] = useState<string | null>(null);
  const open = gmCanMakeMoves(state);
  const pool = staffPool(state);
  const used = staffPayroll(state) + academyPayroll(state);
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
            Staff budget ${used}k of ${STAFF_BUDGET}k (includes ${academyPayroll(state)}k for the academy). {open ? "Hiring is open." : "Hiring opens between stages."}
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

function AcademyView({ store, nav }: { store: SeasonStore; nav: Nav }) {
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

function AwardsView({ store, nav }: { store: SeasonStore; nav: Nav }) {
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

/** A first-run guide to GM mode, dismissed per browser. */
function Guide() {
  const [open, setOpen] = useState(() => !hintSeen("gm-guide"));
  if (!open) return null;
  return (
    <div className="card guide" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h3>Getting started as GM</h3>
        <div className="spacer" />
        <button
          className="btn small"
          onClick={() => {
            markHintSeen("gm-guide");
            setOpen(false);
          }}
        >
          Got it
        </button>
      </div>
      <ol>
        <li>
          <b>This week:</b> read the scouting report, pick a prep focus and plan scrims before each sim.
        </li>
        <li>
          <b>My Team:</b> set your four starters. Keep an AR and an SMG player in the lineup, and watch chemistry and morale.
        </li>
        <li>
          <b>Sim week:</b> your matches stop for your veto (or turn on auto-veto), then wait on a Match Day banner until you watch or skip them.
        </li>
        <li>
          <b>Inbox:</b> answer press conferences, trade offers and player demands. Windows open before the season and after each Major.
        </li>
        <li>
          <b>Market, Staff and Academy:</b> sign, trade, hire a coach and an analyst, and develop prospects, all within the cap and the staff budget.
        </li>
        <li>
          <b>Season's end:</b> read the review, re-sign players and carry the franchise into the next season. Your progress autosaves.
        </li>
      </ol>
    </div>
  );
}
