// Office › Overview: the inbox, the owner's goals, the off-season, dynasty history and the first-run guide.
import { useMemo, useState } from "react";
import { gmChoose, type InboxItem, contractFor, expiringContracts, gmMarkRead, goalStatus, goalText, isDone, loadSeasonData, ordinal, nextSeasonId, ownerVerdict, playerInfo, seasonLabel, seasonRecap, startNextSeason, successorTeam, optionPlayers, previewFreeAgents, previewDraft, type Offer, verdictText, visibleInbox, ovrOf, type SeasonData, type SeasonState } from "../../../engine";
import type { SeasonStore } from "../../useSeason";
import { hintSeen, markHintSeen } from "../../theme";
import { STATUS_COLOR } from "./shared";

export function Inbox({ store }: { store: SeasonStore }) {
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

export function Goals({ store }: { store: SeasonStore }) {
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

export function OffSeason({ store }: { store: SeasonStore }) {
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
  const [exercise, setExercise] = useState<string[]>([]);
  const [offers, setOffers] = useState<Record<string, Offer>>({});
  const [showFa, setShowFa] = useState(false);
  const options = optionPlayers(state);
  const fired = recap.verdict === "fired";
  const picks = Object.fromEntries(Object.entries(resign).filter(([, y]) => y > 0));
  const pickKey = JSON.stringify([team, picks, exercise]);
  const draftOn = !!state.options.rules?.draft;
  const [draftPick, setDraftPick] = useState<string | undefined>(undefined);
  const draftClass = useMemo(() => {
    if (!draftOn || fired) return null;
    try {
      return previewDraft(state, data, { team, resign: picks, exercise });
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftOn, pickKey, state]);
  const pool = useMemo(() => {
    if (!showFa || fired) return [];
    try {
      return previewFreeAgents(state, data, { team, resign: picks, exercise });
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFa, pickKey, state]);
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
                      {options.includes(id) && (
                        <label className="sub" style={{ marginRight: 8 }} title="Keep them one more season at the same salary">
                          <input
                            type="checkbox"
                            checked={exercise.includes(id)}
                            onChange={(e) => setExercise(e.target.checked ? [...exercise, id] : exercise.filter((x) => x !== id))}
                          />{" "}
                          Use option
                        </label>
                      )}
                      <select
                        disabled={exercise.includes(id)}
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
          {draftClass && (
            <>
              <h4 style={{ margin: "12px 0 4px" }}>Rookie draft (extra rule)</h4>
              <div className="sub" style={{ marginBottom: 6 }}>
                You pick {ordinal(draftClass.pick)} of {draftClass.teams} (worst team first). Choose who you want; if they're gone by your pick, you get the best left. Your pick joins the academy.
              </div>
              <select className="plain" value={draftPick ?? ""} onChange={(e) => setDraftPick(e.target.value || undefined)} aria-label="Draft pick">
                <option value="">Best available</option>
                {draftClass.prospects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.handle} · age {p.age} · {p.ovr} now · potential {p.potential[0] === p.potential[1] ? p.potential[0] : `${p.potential[0]}–${p.potential[1]}`}
                  </option>
                ))}
              </select>
            </>
          )}
          <h4 style={{ margin: "12px 0 4px" }}>Free agency</h4>
          {!showFa ? (
            <button className="btn small" onClick={() => setShowFa(true)}>
              See the free-agent class
            </button>
          ) : (
            <>
              <div className="sub" style={{ marginBottom: 6 }}>
                Make offers; AI teams bid too. Each player signs where the money looks best, and a stronger roster counts for up to 15% more. Results land in your inbox.
              </div>
              <div className="scroll-x">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="left">Player</th>
                      <th>OVR</th>
                      <th>Wants</th>
                      <th>Bidders</th>
                      <th className="left">Your offer ($k a season, seasons, bonus)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pool.map((p) => {
                      const o = offers[p.id];
                      const set = (next: Offer | null) => {
                        const copy = { ...offers };
                        if (next) copy[p.id] = next;
                        else delete copy[p.id];
                        setOffers(copy);
                      };
                      return (
                        <tr key={p.id}>
                          <td className="left">{p.handle}</td>
                          <td>{Math.round(p.ovr)}</td>
                          <td>${p.ask}k</td>
                          <td>{p.interest || "—"}</td>
                          <td className="left">
                            {o ? (
                              <span className="row" style={{ gap: 6 }}>
                                <input aria-label={`Salary for ${p.handle}`} type="number" step={5} value={o.salary} style={{ width: 70 }} onChange={(e) => set({ ...o, salary: Number(e.target.value) || 0 })} />
                                <select aria-label={`Seasons for ${p.handle}`} className="plain" value={o.years} onChange={(e) => set({ ...o, years: Number(e.target.value) })}>
                                  {[1, 2, 3].map((y) => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <input aria-label={`Bonus for ${p.handle}`} type="number" step={5} value={o.bonus ?? 0} style={{ width: 60 }} onChange={(e) => set({ ...o, bonus: Number(e.target.value) || 0 })} />
                                <button className="btn small" onClick={() => set(null)}>Withdraw</button>
                              </span>
                            ) : (
                              <button className="btn small" onClick={() => set({ salary: p.ask, years: 2, bonus: 0 })}>
                                Make an offer
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
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
                  store.replace(startNextSeason(state, data, { team, resign: picks, exercise, offers, draftPick }));
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

export function History({ state }: { state: SeasonState }) {
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

/** A first-run guide to GM mode, dismissed per browser. */
export function Guide() {
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
