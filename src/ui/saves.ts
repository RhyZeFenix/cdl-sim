// Save slots in the browser (IndexedDB): an autosave after every change, plus three
// named slots. Saves are compacted: map event logs are dropped because any series
// replays exactly from the seed when it's opened.
import type { SeasonState } from "../engine";

export type SlotId = "autosave" | "slot-1" | "slot-2" | "slot-3";
export const SLOTS: SlotId[] = ["slot-1", "slot-2", "slot-3"];

export interface SaveMeta {
  slot: SlotId;
  savedAt: string;
  /** "CDL 2026 · OTX · Stage 2 Week 3" etc. */
  label: string;
}

interface SaveRecord extends SaveMeta {
  state: SeasonState;
}

const DB = "cdl-sim";
const STORE = "saves";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No browser storage here."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "slot" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open browser storage."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Browser storage failed."));
  });
}

/** The state without map event logs (they replay from the seed). */
export function compact(state: SeasonState): SeasonState {
  const series = Object.fromEntries(
    Object.entries(state.series).map(([id, r]) => [id, { ...r, hasEvents: false, maps: r.maps.map((m) => ({ ...m, events: undefined })) }]),
  );
  return JSON.parse(JSON.stringify({ ...state, series }));
}

export async function putSave(slot: SlotId, state: SeasonState, label: string): Promise<void> {
  const rec: SaveRecord = { slot, savedAt: new Date().toISOString(), label, state: compact(state) };
  await tx("readwrite", (s) => s.put(rec));
}

export async function getSave(slot: SlotId): Promise<SaveRecord | undefined> {
  return tx("readonly", (s) => s.get(slot) as IDBRequest<SaveRecord | undefined>);
}

export async function listSaves(): Promise<SaveMeta[]> {
  const all = await tx("readonly", (s) => s.getAll() as IDBRequest<SaveRecord[]>);
  return all.map(({ slot, savedAt, label }) => ({ slot, savedAt, label }));
}

export async function deleteSave(slot: SlotId): Promise<void> {
  await tx("readwrite", (s) => s.delete(slot));
}
