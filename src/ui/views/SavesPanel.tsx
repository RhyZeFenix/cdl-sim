// Saves: the autosave and six named slots as cards, the archive of every finished
// season, a Hall of Fame across all of them, and file export/import for backups.
import { useEffect, useMemo, useState } from "react";
import { SEASON_IDS, loadSeasonData } from "../../engine";
import {
  deleteArchived,
  deleteSave,
  getArchived,
  hallOfFame,
  listArchive,
  listSaves,
  SLOTS,
  type ArchiveMeta,
  type SaveMeta,
  type SlotId,
} from "../saves";
import type { SeasonStore } from "../useSeason";
import { Seg } from "./common";

/** A team's name from whichever season knows it. */
function teamName(id?: string): string {
  if (!id) return "—";
  for (const s of [...SEASON_IDS].reverse()) {
    const t = loadSeasonData(s).season.teams.find((x) => x.id === id);
    if (t) return t.name;
  }
  return id;
}

const when = (iso: string) => new Date(iso).toLocaleString();

export function SavesPanel({ store, onImportFile, onClose }: { store: SeasonStore; onImportFile: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<"saves" | "archive" | "hof">("saves");
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [archive, setArchive] = useState<ArchiveMeta[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([listSaves().then(setSaves), listArchive().then(setArchive)]).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    refresh();
  }, [store.autosaved]);
  const meta = (slot: SlotId) => saves.find((s) => s.slot === slot);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  const leaving = (what: string) => store.state.next === 0 || confirm(`Load ${what}? This season is autosaved, but not in a slot.`);

  const card = (slot: SlotId, name: string, canSave: boolean) => {
    const m = meta(slot);
    return (
      <div key={slot} className={`save-card${m ? "" : " empty"}`} role="group" aria-label={name}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b>{name}</b>
          {m && <span className="sub">{when(m.savedAt)}</span>}
        </div>
        <div className="save-label">{m ? m.label : <span className="muted">Empty</span>}</div>
        <span className="row" style={{ gap: 4, marginTop: "auto" }}>
          {canSave && (
            <button className="btn small" onClick={() => act(() => store.saveTo(slot), `Saved to ${name}.`)}>
              Save here
            </button>
          )}
          <button
            className="btn small"
            disabled={!m}
            onClick={() =>
              leaving(name) &&
              act(async () => {
                await store.load(slot);
                onClose();
              }, `Loaded ${name}.`)
            }
          >
            Load
          </button>
          {canSave && m && (
            <button className="btn small" onClick={() => confirm(`Delete ${name}?`) && act(() => deleteSave(slot), `Deleted ${name}.`)}>
              Delete
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="setup saves">
      <div style={{ gridColumn: "1 / -1" }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <Seg
            label="Saves view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "saves", label: "Save slots" },
              { value: "archive", label: `Archive (${archive.length})` },
              { value: "hof", label: "Hall of Fame" },
            ]}
          />
        </div>
        {tab === "saves" && (
          <>
            <div className="save-grid">
              {card("autosave", "Autosave", false)}
              {SLOTS.map((s, i) => card(s, `Slot ${i + 1}`, true))}
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              Saves live in this browser (map play-by-play is rebuilt from the seed when you open a match). Finished seasons also go to the archive.{" "}
              {store.autosaved ? `Autosaved at ${store.autosaved}.` : ""}
            </div>
          </>
        )}
        {tab === "archive" && (
          <ArchiveList
            list={archive}
            onOpen={(a) =>
              leaving(a.label) &&
              act(async () => {
                const s = await getArchived(a.id);
                if (!s) throw new Error("That season is gone from the archive.");
                store.replace(s);
                onClose();
              }, `Opened ${a.label}.`)
            }
            onDelete={(a) => confirm(`Remove ${a.label} from the archive?`) && act(() => deleteArchived(a.id), "Removed.")}
          />
        )}
        {tab === "hof" && <Hall list={archive} />}
        {msg && <div className="sub">{msg}</div>}
      </div>
      <div className="setup-actions">
        <button className="btn" onClick={store.exportJson} title="Download this season as a JSON file (a backup you can move between browsers)">
          Export file
        </button>
        <button className="btn" onClick={onImportFile}>
          Import file
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function ArchiveList({ list, onOpen, onDelete }: { list: ArchiveMeta[]; onOpen: (a: ArchiveMeta) => void; onDelete: (a: ArchiveMeta) => void }) {
  if (!list.length) return <div className="muted">Finish a season and it's kept here: champion, MVP, every event winner, and the whole season to reopen.</div>;
  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Season</th>
            <th className="left">Champion</th>
            <th>Final</th>
            <th className="left">Champs MVP</th>
            <th className="left">Your team</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id}>
              <td className="left">
                <b>{a.label}</b>
                <div className="sub">seed {a.seed}</div>
              </td>
              <td className="left">{teamName(a.champion)}</td>
              <td>{a.finalScore ? `${a.finalScore[0]}–${a.finalScore[1]}` : "—"}</td>
              <td className="left">{a.mvp ? `${a.mvp.handle} (${a.mvp.kd.toFixed(2)})` : "—"}</td>
              <td className="left">{a.gm ? `${teamName(a.gm.team)} · ${a.gm.rank}${["th", "st", "nd", "rd"][a.gm.rank % 10 > 3 || Math.floor(a.gm.rank / 10) === 1 ? 0 : a.gm.rank % 10]} · ${a.gm.titles} title${a.gm.titles === 1 ? "" : "s"}` : <span className="muted">League</span>}</td>
              <td>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn small" onClick={() => onOpen(a)}>
                    Open
                  </button>
                  <button className="btn small" onClick={() => onDelete(a)} aria-label={`Remove ${a.label}`}>
                    ✕
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Hall({ list }: { list: ArchiveMeta[] }) {
  const h = useMemo(() => hallOfFame(list), [list]);
  if (!list.length) return <div className="muted">The Hall of Fame fills in as you finish seasons, across every save.</div>;
  return (
    <div className="grid2">
      <div>
        <h4 style={{ margin: "0 0 4px" }}>Most titles</h4>
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">Team</th>
              <th>Champs</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {h.teams.slice(0, 10).map((t) => (
              <tr key={t.team}>
                <td className="left">{teamName(t.team)}</td>
                <td>{t.champs}</td>
                <td>{t.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 style={{ margin: "0 0 4px" }}>Champs MVPs</h4>
        <table className="tbl">
          <tbody>
            {h.mvps.slice(0, 10).map((m) => (
              <tr key={m.id}>
                <td className="left">{m.handle}</td>
                <td>{m.count}×</td>
              </tr>
            ))}
          </tbody>
        </table>
        {h.careers.length > 0 && (
          <>
            <h4 style={{ margin: "12px 0 4px" }}>GM careers</h4>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="left">Career</th>
                  <th>Seasons</th>
                  <th>Champs</th>
                  <th>Titles</th>
                  <th>Best</th>
                </tr>
              </thead>
              <tbody>
                {h.careers.map((c) => (
                  <tr key={c.key}>
                    <td className="left">{c.label}</td>
                    <td>{c.seasons}</td>
                    <td>{c.champs}</td>
                    <td>{c.titles}</td>
                    <td>{c.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
