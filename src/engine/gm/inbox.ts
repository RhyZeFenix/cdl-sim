// The GM's inbox: match recaps, league news, owner notes and roster news. Items that
// would give away an unwatched result list those series in `refs` and stay hidden
// until they're watched.
import type { SeasonState } from "../season/season";
import type { InboxItem } from "./types";

const MAX_ITEMS = 250;

/** Adds an item to the top of the inbox. */
export function pushInbox(state: SeasonState, item: Omit<InboxItem, "id">): void {
  const gm = state.gm;
  if (!gm) return;
  const inbox = gm.inbox ?? [];
  const id = `${state.next}-${inbox.length}-${item.kind}`;
  gm.inbox = [{ ...item, id }, ...inbox].slice(0, MAX_ITEMS);
}

/** Items that can be shown: none that refer to a hidden (unwatched) series. */
export function visibleInbox(state: SeasonState, hidden: Set<string>): InboxItem[] {
  return (state.gm?.inbox ?? []).filter((i) => !i.refs?.some((r) => hidden.has(r)));
}

export function gmMarkRead(state: SeasonState, ids: string[] | "all", hidden = new Set<string>()): void {
  const gm = state.gm;
  if (!gm?.inbox) return;
  const want = ids === "all" ? null : new Set(ids);
  gm.inbox = gm.inbox.map((i) => (want ? want.has(i.id) : !i.refs?.some((r) => hidden.has(r))) ? { ...i, read: true } : i);
}
