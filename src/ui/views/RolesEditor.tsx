// Player roles: label each player AR, SMG or flex. The wiki doesn't record roles, so
// these are hand-labelled: saved in this browser, and exported to send in so they can be
// built into the site (data/roles.json). GM mode's role balance uses them.
import { useMemo, useState } from "react";
import { builtInRoleCount, labelledRole, setLocalRoles, type PlayerRole } from "../../engine";
import { localRoles, saveLocalRoles } from "../savedRoles";
import type { SeasonStore } from "../useSeason";

const ROLES: PlayerRole[] = ["AR", "SMG", "flex"];

export function RolesEditor({ store }: { store: SeasonStore }) {
  const { data } = store;
  const [mine, setMine] = useState<Record<string, PlayerRole>>(localRoles);
  const [json, setJson] = useState<string | null>(null);
  const teams = useMemo(() => data.rosters.teams.map((t) => ({ id: t.team, name: data.season.teams.find((x) => x.id === t.team)?.name ?? t.team, players: t.players })), [data]);
  const set = (id: string, role: PlayerRole) => {
    const next = { ...mine, [id]: role };
    setMine(next);
    saveLocalRoles(next);
    setLocalRoles(next);
    store.bump();
  };
  const labelled = Object.keys(mine).length;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Player roles</h3>
        <span className="sub">
          The wiki doesn't record AR and SMG, so everyone starts as flex. Label players here (saved in this browser; GM mode's role balance uses them), then Export to send them in. {builtInRoleCount() ? `${builtInRoleCount()} are built in. ` : ""}You've labelled {labelled}.
        </span>
      </div>
      <div className="roles-grid">
        {teams.map((t) => (
          <div key={t.id}>
            <b>{t.name}</b>
            {t.players.map((p) => {
              const cur = labelledRole(p.id) ?? "flex";
              return (
                <div key={p.id} className="row" style={{ justifyContent: "space-between", gap: 6 }}>
                  <span>{p.handle}</span>
                  <span className="seg small" role="group" aria-label={`${p.handle} role`}>
                    {ROLES.map((r) => (
                      <button key={r} aria-pressed={cur === r} onClick={() => set(p.id, r)}>
                        {r}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn small" onClick={() => setJson(JSON.stringify({ roles: mine }, null, 1))}>
          Export
        </button>
        <button
          className="btn small"
          onClick={() => {
            const text = prompt("Paste the roles JSON (from Export):");
            if (!text) return;
            try {
              const r = (JSON.parse(text) as { roles?: Record<string, PlayerRole> }).roles ?? {};
              const clean = Object.fromEntries(Object.entries(r).filter(([, v]) => ROLES.includes(v)));
              setMine(clean);
              saveLocalRoles(clean);
              setLocalRoles(clean);
              store.bump();
            } catch {
              alert("That isn't roles JSON.");
            }
          }}
        >
          Import
        </button>
        {labelled > 0 && (
          <button
            className="btn small"
            onClick={() => {
              if (!confirm("Clear all your role labels?")) return;
              setMine({});
              saveLocalRoles({});
              setLocalRoles({});
              store.bump();
            }}
          >
            Clear mine
          </button>
        )}
      </div>
      {json && <textarea readOnly value={json} rows={6} style={{ width: "100%", marginTop: 8, fontFamily: "monospace", fontSize: 12 }} aria-label="Roles JSON" />}
    </div>
  );
}
