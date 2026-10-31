// The AI side of the market. Each time a signing window opens: AI teams that lost
// players fill the holes from free agency, AI teams send trade offers, and unhappy or
// underpaid players come to the GM with demands. The GM answers from the inbox.
import type { SeasonData } from "../data/registry";
import { createRng } from "../rng";
import { freeAgents, nextStepDate, playerInfo, teamLineup, type SeasonState } from "../season/season";
import { aiRoster, capSpace, evaluateTrade, executeTrade, marketAsk, ovrOf, tradesOpen } from "./contracts";
import { pushInbox } from "./inbox";
import { addMorale } from "./morale";
import { answerPress } from "./story";
import { tradeValue } from "./values";
import { aiTrade } from "./aimoves";

const teamName = (data: SeasonData, id: string) => data.season.teams.find((t) => t.id === id)?.name ?? id;
const handle = (state: SeasonState, data: SeasonData, id: string) => playerInfo(state, data, id)?.handle ?? id;

/** Runs when a signing window opens (preseason and after each Major). */
export function marketWindow(state: SeasonState, data: SeasonData): void {
  const gm = state.gm!;
  const rng = createRng(`${state.options.seed}/market/${state.dynasty?.year ?? 1}/${state.next}`);
  const date = nextStepDate(state, data);
  expireOffers(state);

  // AI teams missing players (the GM signed or traded for them) sign the best free agents.
  const fas = freeAgents(state, data).sort((a, b) => ovrOf(state, data, b) - ovrOf(state, data, a));
  for (const t of data.season.teams) {
    if (t.id === gm.team) continue;
    const lineup = teamLineup(state, data, t.id, date);
    if (!lineup.some((id) => id.startsWith("repl-"))) continue;
    const roster = aiRoster(state, data, t.id).filter((id) => !id.startsWith("repl-"));
    const signed: string[] = [];
    while (roster.length + signed.length < 4 && fas.length) signed.push(fas.shift()!);
    if (!signed.length) continue;
    state.aiRosters = { ...(state.aiRosters ?? {}), [t.id]: [...roster, ...signed] };
    pushInbox(state, { date, kind: "trade", title: `${teamName(data, t.id)} sign ${signed.map((id) => handle(state, data, id)).join(" and ")}`, body: "They had a hole in the lineup and filled it from free agency." });
  }

  // Now and then two AI teams trade with each other.
  if (tradesOpen(state) && rng.chance(0.4)) aiTrade(state, data, rng);

  // Trade offers: AI teams want one of your players and offer one of theirs in return.
  if (tradesOpen(state)) {
    const others = data.season.teams.filter((t) => t.id !== gm.team).map((t) => t.id);
    const block = gm.tradeBlock?.filter((id) => gm.roster.includes(id)) ?? [];
    const offers = 1 + (block.length ? 1 : 0) + (rng.chance(0.5) ? 1 : 0);
    const used = new Set<string>();
    for (let i = 0; i < offers * 4 && used.size < offers; i++) {
      const target = block[i] ?? rng.pick(gm.roster);
      const team = rng.pick(others);
      if (used.has(team)) continue;
      const want = tradeValue(ovrOf(state, data, target), gm.contracts?.[target]?.salary);
      // Something a bit less valuable, so the AI comes out ahead.
      const theirs = aiRoster(state, data, team)
        .map((id) => ({ id, v: tradeValue(ovrOf(state, data, id)) }))
        .filter((x) => x.v <= want / 1.1 && x.v >= want * 0.55)
        .sort((a, b) => b.v - a.v)[0];
      if (!theirs) continue;
      const offer = { team, give: [target], get: [theirs.id] };
      if (!evaluateTrade(state, data, offer).accepted) continue;
      used.add(team);
      pushInbox(state, {
        date,
        kind: "offer",
        title: `${teamName(data, team)} want ${handle(state, data, target)}`,
        body: `They offer ${handle(state, data, theirs.id)} (${Math.round(ovrOf(state, data, theirs.id))} overall) for ${handle(state, data, target)} (${Math.round(ovrOf(state, data, target))}). The offer stands until the window closes.`,
        action: { type: "tradeOffer", team, give: offer.give, get: offer.get, window: state.next },
        choices: [
          { id: "accept", label: "Accept", hint: "The trade happens now" },
          { id: "decline", label: "Decline", hint: "Nothing changes" },
        ],
      });
    }
  }

  // Demands: big raises for underpaid players, trade requests from unhappy ones.
  for (const id of gm.roster) {
    const c = gm.contracts?.[id];
    const ask = marketAsk(state, data, id);
    const morale = gm.morale?.[id] ?? 70;
    if (c && ask > c.salary * 1.3 && ask - c.salary >= 20) {
      pushInbox(state, {
        date,
        kind: "demand",
        title: `${handle(state, data, id)} wants a raise`,
        body: `On $${c.salary}k but worth about $${ask}k now. Pay up or risk the mood.`,
        action: { type: "raise", player: id, salary: ask },
        choices: [
          { id: "pay", label: `Pay $${ask}k`, hint: "+8 morale; needs the cap room" },
          { id: "refuse", label: "Refuse", hint: "−8 morale" },
        ],
      });
    } else if (morale < 35) {
      pushInbox(state, {
        date,
        kind: "demand",
        title: `${handle(state, data, id)} asks for a trade`,
        body: "Unhappy and wants out. Talk it through, or put them on the trade block so teams make offers.",
        action: { type: "tradeRequest", player: id },
        choices: [
          { id: "talk", label: "Talk it out", hint: "+6 morale, −1 owner trust" },
          { id: "block", label: "Put on the trade block", hint: "AI offers will target them" },
        ],
      });
    }
  }
}

/** Offers from an earlier window can't be taken any more. */
function expireOffers(state: SeasonState): void {
  const gm = state.gm!;
  gm.inbox = (gm.inbox ?? []).map((i) => (i.action?.type === "tradeOffer" && !i.answered && i.action.window !== state.next ? { ...i, answered: "expired" } : i));
}

/** Answers an inbox item that asks for a decision. Throws with a reason if it can't be done. */
export function gmChoose(state: SeasonState, data: SeasonData, itemId: string, choice: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  const item = gm.inbox?.find((i) => i.id === itemId);
  if (!item?.action || !item.choices?.some((c) => c.id === choice)) throw new Error("Nothing to answer there.");
  if (item.answered) throw new Error("Already answered.");
  const a = item.action;
  const refs = item.refs ?? [];
  switch (a.type) {
    case "press":
      answerPress(state, choice, a.opponent, refs);
      break;
    case "tradeOffer":
      if (choice === "accept") {
        if (a.window !== state.next || !tradesOpen(state)) throw new Error("That offer has expired.");
        if (a.give.some((id) => !gm.roster.includes(id))) throw new Error("You no longer have that player.");
        if (a.get.some((id) => !aiRoster(state, data, a.team).includes(id))) throw new Error("They no longer have that player.");
        executeTrade(state, data, { team: a.team, give: a.give, get: a.get });
      }
      break;
    case "raise":
      if (choice === "pay") {
        const c = gm.contracts?.[a.player];
        if (!c || !gm.roster.includes(a.player)) throw new Error("They're no longer on the roster.");
        if (a.salary - c.salary > capSpace(state)) throw new Error("Not enough cap space for that raise.");
        gm.contracts = { ...gm.contracts, [a.player]: { ...c, salary: a.salary } };
        addMorale(state, { refs, why: "Got a raise", deltas: { [a.player]: 8 } });
      } else addMorale(state, { refs, why: "Raise refused", deltas: { [a.player]: -8 } });
      break;
    case "tradeRequest":
      if (choice === "talk") {
        addMorale(state, { refs, why: "Talked it out", deltas: { [a.player]: 6 } });
        gm.trust = Math.max(0, (gm.trust ?? 60) - 1);
      } else gm.tradeBlock = [...new Set([...(gm.tradeBlock ?? []), a.player])];
      break;
  }
  gm.inbox = gm.inbox!.map((i) => (i.id === itemId ? { ...i, answered: choice, read: true } : i));
}

export function gmSetTradeBlock(state: SeasonState, ids: string[]): void {
  if (!state.gm) throw new Error("not in GM mode");
  state.gm.tradeBlock = ids.filter((id) => state.gm!.roster.includes(id));
}
