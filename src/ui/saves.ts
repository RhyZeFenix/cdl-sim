// Save slots in the browser (IndexedDB): an autosave after every change, plus six
// named slots, and an archive that keeps every finished season. Saves are compacted:
// map event logs are dropped because any series replays exactly from the seed.
import { isDone, loadSeasonData, seasonLabel, summarize, type SeasonState } from "../engine";

export type SlotId = "autosave" | "slot-1" | "slot-2" | "slot-3" | "slot-4" | "slot-5" | "slot-6";
export const SLOTS: SlotId[] = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5", "slot-6"];

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
const ARCHIVE = "archive";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("No browser storage here."));
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "slot" });
      if (!db.objectStoreNames.contains(ARCHIVE)) db.createObjectStore(ARCHIVE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open browser storage."));
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
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

// ------------------------------------------------------------------ archive

/** A finished season kept for the archive and the Hall of Fame. */
export interface ArchiveMeta {
  id: string;
  savedAt: string;
  label: string;
  seasonId: SeasonState["seasonId"];
  seed: string;
  champion?: string;
  runnerUp?: string;
  finalScore?: [number, number];
  /** Champs MVP: player id, handle, K/D. */
  mvp?: { id: string; handle: string; kd: number };
  /** Event winners by name. */
  events: { name: string; winner: string }[];
  /** The GM's team and where it finished, in GM mode. */
  gm?: { team: string; rank: number; titles: number; year: number };
  /** The most points in the season. */
  pointsLeader?: string;
}

interface ArchiveRecord extends ArchiveMeta {
  state: SeasonState;
}

export const archiveId = (s: SeasonState) => `${s.seasonId}/${s.options.seed}/${s.gm?.team ?? "league"}/${s.dynasty?.year ?? 1}`;

export function archiveMeta(state: SeasonState): ArchiveMeta {
  const data = loadSeasonData(state.seasonId);
  const sum = summarize(state, data);
  const handle = (id: string) => [...data.rosters.teams, ...data.rosters.guests].flatMap((t) => t.players).find((p) => p.id === id)?.handle ?? state.carried?.[id]?.handle ?? id;
  const gm = state.gm;
  return {
    id: archiveId(state),
    savedAt: new Date().toISOString(),
    label: seasonLabel(state, data),
    seasonId: state.seasonId,
    seed: state.options.seed,
    champion: sum.champion,
    runnerUp: sum.runnerUp,
    finalScore: sum.finalScore,
    mvp: sum.mvp ? { id: sum.mvp.player, handle: handle(sum.mvp.player), kd: Math.round(sum.mvp.kd * 100) / 100 } : undefined,
    events: sum.eventWinners.map((e) => ({ name: e.name, winner: e.winner })),
    gm: gm
      ? {
          team: gm.team,
          rank: sum.finalPoints.findIndex((r) => r.team === gm.team) + 1,
          titles: sum.eventWinners.filter((e) => e.winner === gm.team).length,
          year: state.dynasty?.year ?? 1,
        }
      : undefined,
    pointsLeader: sum.finalPoints[0]?.team,
  };
}

/** Keeps a finished season in the archive (once; later calls just refresh it). */
export async function archiveSeason(state: SeasonState): Promise<boolean> {
  if (!isDone(state)) return false;
  const rec: ArchiveRecord = { ...archiveMeta(state), state: compact(state) };
  await tx("readwrite", (s) => s.put(rec), ARCHIVE);
  return true;
}

export async function listArchive(): Promise<ArchiveMeta[]> {
  const all = await tx("readonly", (s) => s.getAll() as IDBRequest<ArchiveRecord[]>, ARCHIVE);
  return all.map(({ state: _s, ...meta }) => meta).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getArchived(id: string): Promise<SeasonState | undefined> {
  return (await tx("readonly", (s) => s.get(id) as IDBRequest<ArchiveRecord | undefined>, ARCHIVE))?.state;
}

export async function deleteArchived(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id), ARCHIVE);
}

export interface HallOfFame {
  /** Titles (Champs and events) per team. */
  teams: { team: string; champs: number; events: number }[];
  /** Champs MVPs per player. */
  mvps: { id: string; handle: string; count: number }[];
  /** GM careers: one row per GM save line (seed + team lineage). */
  careers: { key: string; label: string; seasons: number; champs: number; titles: number; best: number }[];
}

/** Totals across every archived season, from every save. */
export function hallOfFame(list: ArchiveMeta[]): HallOfFame {
  const teams = new Map<string, { team: string; champs: number; events: number }>();
  const mvps = new Map<string, { id: string; handle: string; count: number }>();
  const careers = new Map<string, HallOfFame["careers"][number]>();
  for (const a of list) {
    for (const e of a.events) {
      const t = teams.get(e.winner) ?? { team: e.winner, champs: 0, events: 0 };
      t.events++;
      teams.set(e.winner, t);
    }
    if (a.champion) {
      const t = teams.get(a.champion) ?? { team: a.champion, champs: 0, events: 0 };
      t.champs++;
      teams.set(a.champion, t);
    }
    if (a.mvp) {
      const m = mvps.get(a.mvp.id) ?? { id: a.mvp.id, handle: a.mvp.handle, count: 0 };
      m.count++;
      mvps.set(a.mvp.id, m);
    }
    if (a.gm) {
      const key = a.seed.replace(/-y\d+$/, "");
      const c = careers.get(key) ?? { key, label: `${a.gm.team} · seed ${key}`, seasons: 0, champs: 0, titles: 0, best: 99 };
      c.seasons++;
      c.titles += a.gm.titles;
      if (a.champion === a.gm.team) c.champs++;
      c.best = Math.min(c.best, a.gm.rank);
      careers.set(key, c);
    }
  }
  return {
    teams: [...teams.values()].sort((a, b) => b.champs - a.champs || b.events - a.events),
    mvps: [...mvps.values()].sort((a, b) => b.count - a.count),
    careers: [...careers.values()].sort((a, b) => b.champs - a.champs || b.titles - a.titles),
  };
}
