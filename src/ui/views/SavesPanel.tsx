// Save slots: the autosave, three named slots, and file export/import for backups.
import { useEffect, useState } from "react";
import { deleteSave, listSaves, SLOTS, type SaveMeta, type SlotId } from "../saves";
import type { SeasonStore } from "../useSeason";

export function SavesPanel({ store, onImportFile, onClose }: { store: SeasonStore; onImportFile: () => void; onClose: () => void }) {
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const refresh = () =>
    listSaves()
      .then(setSaves)
      .catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    refresh();
  }, [store.autosaved]);
  const meta = (slot: SlotId) => saves.find((s) => s.slot === slot);
  const when = (iso: string) => new Date(iso).toLocaleString();
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMsg(ok);
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const row = (slot: SlotId, name: string, canSave: boolean) => {
    const m = meta(slot);
    return (
      <tr key={slot}>
        <td className="left">
          <b>{name}</b>
        </td>
        <td className="left">{m ? m.label : <span className="muted">Empty</span>}</td>
        <td className="left muted">{m ? when(m.savedAt) : ""}</td>
        <td className="left">
          <span className="row" style={{ gap: 4 }}>
            {canSave && (
              <button className="btn small" onClick={() => act(() => store.saveTo(slot), `Saved to ${name}.`)}>
                Save here
              </button>
            )}
            <button
              className="btn small"
              disabled={!m}
              onClick={() => {
                if (store.state.next > 0 && !confirm(`Load ${name}? This season is autosaved, but not in a slot.`)) return;
                act(async () => {
                  await store.load(slot);
                  onClose();
                }, `Loaded ${name}.`);
              }}
            >
              Load
            </button>
            {canSave && m && (
              <button className="btn small" onClick={() => confirm(`Delete ${name}?`) && act(() => deleteSave(slot), `Deleted ${name}.`)}>
                Delete
              </button>
            )}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <div className="setup saves">
      <div style={{ gridColumn: "1 / -1" }}>
        <table className="tbl">
          <tbody>
            {row("autosave", "Autosave", false)}
            {SLOTS.map((s, i) => row(s, `Slot ${i + 1}`, true))}
          </tbody>
        </table>
        <div className="sub" style={{ marginTop: 6 }}>
          Saves live in this browser (map play-by-play is rebuilt from the seed when you open a match). {store.autosaved ? `Autosaved at ${store.autosaved}.` : ""}
        </div>
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
