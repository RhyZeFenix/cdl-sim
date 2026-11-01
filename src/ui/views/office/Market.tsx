// Office › Market: AI offers and player demands, contracts, and trades.
import { useMemo, useState } from "react";
import { MIN_EXCEPTION, capLabel, gmChoose, gmSetTradeBlock, marketAsk, tradesOpen, aiRoster, askingSalary, evaluateTrade, gmCanMakeMoves, payroll, playerInfo, proposeTrade, tradeValue, visibleInbox, ovrOf, fogText, fogWidth, capOf, seasonYearOf } from "../../../engine";
import { type Nav } from "../../App";
import { directory } from "../../names";
import type { SeasonStore } from "../../useSeason";
import { PlayerLink } from "../common";

export function Offers({ store }: { store: SeasonStore }) {
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

export function Finances({ store, nav }: { store: SeasonStore; nav: Nav }) {
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
      <CapTable store={store} />
    </div>
  );
}

/** The next three seasons of commitments: who's under contract, options, and room under the cap. */
function CapTable({ store }: { store: SeasonStore }) {
  const { state, data } = store;
  const gm = state.gm!;
  const now = seasonYearOf(state);
  const cap = capOf(state);
  const years = [0, 1, 2];
  const cell = (id: string, k: number): { salary: number; option?: boolean } | null => {
    const c = gm.contracts?.[id];
    if (!c) return null;
    if (k < c.years) return { salary: c.salary };
    if (k === c.years && c.option) return { salary: c.salary, option: true };
    return null;
  };
  const total = (k: number, withOptions: boolean) =>
    gm.roster.reduce((s, id) => {
      const x = cell(id, k);
      return s + (x && (withOptions || !x.option) ? x.salary : 0);
    }, k === 0 ? (gm.deadCap ?? 0) : 0);
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: "0 0 4px" }}>Cap table</h4>
      <div className="scroll-x">
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">Player</th>
              {years.map((k) => (
                <th key={k}>{now + k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gm.roster.map((id) => (
              <tr key={id}>
                <td className="left">{playerInfo(state, data, id)?.handle ?? id}</td>
                {years.map((k) => {
                  const x = cell(id, k);
                  return (
                    <td key={k} className={x?.option ? "muted" : undefined} title={x?.option ? "Team option: yours to use or decline" : undefined}>
                      {x ? `$${x.salary}k${x.option ? " opt" : ""}` : k === 0 ? "—" : <span className="muted">FA</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {(gm.deadCap ?? 0) > 0 && (
              <tr>
                <td className="left muted">Dead money and bonuses</td>
                <td>${gm.deadCap}k</td>
                <td />
                <td />
              </tr>
            )}
            <tr>
              <td className="left">
                <b>Committed</b>
              </td>
              {years.map((k) => (
                <td key={k}>
                  <b>${total(k, false)}k</b>
                  {total(k, true) !== total(k, false) && <div className="sub">${total(k, true)}k with options</div>}
                </td>
              ))}
            </tr>
            {Number.isFinite(cap) && (
              <tr>
                <td className="left">Room under the cap</td>
                {years.map((k) => (
                  <td key={k}>${Math.round(cap - total(k, false))}k</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="sub" style={{ marginTop: 4 }}>Later seasons assume the same cap; signing bonuses only count in the season they're paid.</div>
    </div>
  );
}

export function Trades({ store, nav }: { store: SeasonStore; nav: Nav }) {
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
                <td>{fogText(ovr, fogWidth(state, data, id), `${id}/ovr`)}</td>
                <td>{salary(id) !== undefined ? `$${salary(id)}k` : "—"}</td>
                <td>{fogWidth(state, data, id) ? "?" : Math.round(tradeValue(ovr, salary(id)))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ dynasty
