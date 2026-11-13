// A rehearsal of the contract that runs inside the page. It is used when no contract address is configured, or when
// the address bar carries `?demo`, so every page can be explored (and tested) without a wallet or a network.
// It follows the contract's rules for making vows, backing, notes, retraction and claiming, using the same payout
// code as the real previews. Judging needs validators, so a vow that is past its deadline can only be looked at.
import type { Changes, FeedEntry, Position, Profile, Pulse, Stats, Vow } from "./chain";
import {
  BROKEN, FAITH_CAP_DIV, KEPT, MAX_UPDATE, MAX_UPDATES, MIN_BACK, MIN_STAKE, MIN_UPDATE, OPEN, PAGE_MAX, RETRACTED, REVIEW, UNCLEAR,
} from "./limits";
import { burned, owed, standing } from "./payout";
import type { Source } from "./source";

export const DEMO_ME = "0xd3a0d3a0d3a0d3a0d3a0d3a0d3a0d3a0d3a0d3a0";
const GEN = 10n ** 18n;
const addr = (n: number) => "0x" + (n.toString(16).padStart(2, "0") + "a7c91e3b5d").repeat(4).slice(0, 40);
const KEEPERS = [addr(1), addr(2), addr(3), addr(4), addr(5), addr(6), addr(7)];

type Backing = { who: string; side: "faith" | "doubt"; amount: bigint };

export function createDemo(): Source & {
  me: string;
  send(fn: string, args: unknown[], value?: bigint): Promise<void>;
} {
  const clock = () => Math.floor(Date.now() / 1000);
  const t0 = clock();
  const vows: Vow[] = [];
  const backings = new Map<number, Backing[]>();
  const claimed = new Set<string>();
  const feed: { vow: number; action: string; at: number }[] = [];
  const keeperOrder: string[] = [];
  let embers = 0n;
  let paid = 0n;
  let deposited = 0n;

  const log = (vow: number, action: string, at = clock()) => feed.push({ vow, action, at });
  const touch = (k: string) => {
    if (!keeperOrder.includes(k)) keeperOrder.push(k);
  };

  function add(keeper: string, text: string, url: string, created: number, deadline: number, stake: bigint, extra: Partial<Vow> = {}) {
    const id = vows.length;
    touch(keeper);
    const v: Vow = {
      id, keeper, text, url, created, deadline, stake: stake.toString(), faith: "0", faith_cap: (stake / BigInt(FAITH_CAP_DIV)).toString(), doubt: "0",
      state: OPEN, tries: 0, note: "", counters: [], provenance: "mutable", pins: [], disputes: [], proposed: 0, proposed_at: 0, review_end: 0, proof: null, updates: [],
      ...extra,
    };
    vows.push(v);
    deposited += stake;
    log(id, "made", created);
    return v;
  }
  function back(v: Vow, who: string, side: "faith" | "doubt", amount: bigint, at = clock()) {
    (backings.get(v.id) ?? backings.set(v.id, []).get(v.id)!).push({ who, side, amount });
    v[side] = (BigInt(v[side]) + amount).toString();
    deposited += amount;
    log(v.id, side, at);
  }
  function settle(v: Vow, state: number, note: string, at: number, proof?: Vow["proof"]) {
    v.state = state;
    v.note = note;
    if (proof) v.proof = proof;
    embers += burned(state, BigInt(v.stake), BigInt(v.faith), BigInt(v.doubt));
    log(v.id, state === KEPT ? "kept" : state === BROKEN ? "broken" : state === RETRACTED ? "retracted" : "unclear", at);
  }

  // ---- seed ---------------------------------------------------------------------------------------------------
  const H = 3600;
  const D = 86400;
  const days = (n: number) => t0 - n * D;
  const proof = (url: string, quote: string, date: string): Vow["proof"] => ({ url, tier: "mutable", quote, date, hash: "9f2c71d0a5b8e4136c0f7a29d8b4e1c35a6f90d2e7b18c43a05d6e9f1b27c840" });
  const seed = [
    [0, "Publish the first chapter of my essay series on the blog.", "https://blog.example.org/essays", 41, 34, "0.8", KEPT],
    [1, "Run a 10 km race under 55 minutes and post the official result.", "https://races.example.org/results/2026", 38, 30, "0.5", KEPT],
    [2, "Ship version 1.0 of the open source weather widget.", "https://github.com/example/weather-widget/releases", 33, 27, "1.2", KEPT],
    [0, "Write 20 pages of the thesis draft and push them to the repository.", "https://github.com/example/thesis/commits/main", 29, 22, "0.6", BROKEN],
    [3, "Cook dinner for the whole street party and post the photos.", "https://photos.example.org/street-party", 26, 20, "0.3", KEPT],
    [4, "Submit the grant application before the call closes.", "https://grants.example.org/applications/lumen", 24, 17, "1.5", KEPT],
    [1, "Learn the first four songs on the list and publish a recording.", "https://music.example.org/recordings", 22, 15, "0.4", UNCLEAR],
    [5, "Read twelve books by the end of the quarter, listed on my reading log.", "https://reading.example.org/log", 20, 12, "0.7", KEPT],
    [2, "Translate the project handbook into Spanish.", "https://github.com/example/handbook/tree/es", 18, 11, "0.9", RETRACTED],
    [6, "Fix every bug labelled good-first-issue in the tracker.", "https://github.com/example/tracker/issues", 14, 8, "0.4", KEPT],
  ] as const;
  seed.forEach(([k, text, url, from, to, stake, outcome], i) => {
    const v = add(KEEPERS[k], text, url, days(from), days(to), BigInt(Math.round(Number(stake) * 100)) * GEN / 100n);
    const s = BigInt(v.stake);
    if (outcome !== RETRACTED) {
      back(v, KEEPERS[(k + 1) % 7], "faith", s / 5n, days(from - 1));
      if (i % 3 !== 1) back(v, KEEPERS[(k + 3) % 7], "doubt", s / 8n, days(from - 2));
      v.updates.push({ at: days(from - 1), text: "Started. Setting aside time every morning." }, { at: days(to + 2), text: "Nearly there, final checks today." });
      log(v.id, "update", days(to + 2));
    }
    if (outcome === KEPT) settle(v, KEPT, "The page shows the work, dated before the deadline.", days(to - 1), proof(url, "published on 2026-09-30, as promised", "2026-09-30"));
    if (outcome === BROKEN) settle(v, BROKEN, "The page shows no completed work by the deadline.", days(to - 1));
    if (outcome === UNCLEAR) settle(v, UNCLEAR, "The vow is too vague to judge from this page.", days(to - 1));
    if (outcome === RETRACTED) {
      v.updates.push({ at: days(from - 2), text: "Priorities changed, taking this one back." });
      settle(v, RETRACTED, "The keeper retracted this vow before anyone backed it.", days(from - 3));
    }
  });
  // vows still in progress
  const open = [
    [0, "Publish the second chapter of my essay series.", "https://blog.example.org/essays", 2, 3, "0.9", 2],
    [3, "Finish the garden shed and show the finished photos.", "https://photos.example.org/garden-shed", 1, 6, "0.5", 1],
    [4, "Release the open source tide table app for iOS.", "https://github.com/example/tide-tables/releases", 3, 9, "2.0", 3],
    [5, "Record and publish the podcast pilot episode.", "https://podcast.example.org/pilot", 1, 2, "0.4", 0],
    [6, "Run every morning for thirty days and keep the log public.", "https://run.example.org/log/lumen", 4, 26, "1.0", 1],
    [1, "Finish the quilt for my niece before her birthday.", "https://craft.example.org/quilt", 2, 12, "0.35", 0],
  ] as const;
  for (const [k, text, url, fromH, toD, stake, backers] of open) {
    const v = add(KEEPERS[k], text, url, t0 - fromH * D, t0 + toD * D, BigInt(Math.round(Number(stake) * 100)) * GEN / 100n, { provenance: "mutable" });
    for (let b = 0; b < backers; b++) back(v, KEEPERS[(k + 1 + b) % 7], b % 2 === 0 ? "faith" : "doubt", BigInt(Math.round((Number(stake) / (b % 2 === 0 ? 7 : 11)) * 100)) * GEN / 100n, t0 - (fromH * D) / (b + 2));
    if (k === 0 || k === 4) {
      v.updates.push({ at: t0 - H * 20, text: "Outline done, drafting the second half now." });
      log(v.id, "update", t0 - H * 20);
    }
  }
  // two past their deadline, waiting for a verdict, and one in review
  const due = add(KEEPERS[2], "Deploy the staging site and share the public link.", "https://staging.example.org", t0 - 6 * D, t0 - 2 * H, GEN / 2n);
  back(due, KEEPERS[4], "faith", GEN / 20n, t0 - 5 * D);
  const rev = add(KEEPERS[5], "Publish the quarterly report to the public archive.", "https://archive.example.org/reports/q3", t0 - 9 * D, t0 - 3 * D, (3n * GEN) / 4n);
  back(rev, KEEPERS[1], "faith", GEN / 10n, t0 - 8 * D);
  back(rev, KEEPERS[6], "doubt", GEN / 12n, t0 - 7 * D);
  rev.state = REVIEW;
  rev.proposed = KEPT;
  rev.proposed_at = t0 - 20 * H;
  rev.review_end = t0 + 4 * H;
  rev.note = "The validators propose: kept. The doubters can dispute until the review window closes.";
  rev.proof = proof(rev.url, "The quarterly report was published on 2026-10-30", "2026-10-30");
  log(rev.id, "proposed", t0 - 20 * H);
  feed.sort((a, b) => a.at - b.at); // history first; the feed order is the order of events

  // ---- reading -------------------------------------------------------------------------------------------------
  const statsNow = (): Stats => ({
    total: vows.length,
    kept: vows.filter((v) => v.state === KEPT).length,
    broken: vows.filter((v) => v.state === BROKEN).length,
    retracted: vows.filter((v) => v.state === RETRACTED).length,
    keepers: keeperOrder.length,
    embers: embers.toString(),
    deposited: deposited.toString(),
    paid: paid.toString(),
    rev: feed.length,
    version: "2.0.0 (demo)",
  });
  const profileOf = (who: string): Profile => {
    const mine = vows.filter((v) => v.keeper.toLowerCase() === who.toLowerCase());
    let streak = 0;
    let best = 0;
    for (const v of mine) {
      if (v.state === KEPT) best = Math.max(best, (streak += 1));
      else if (v.state === BROKEN || v.state === RETRACTED) streak = 0;
    }
    const kept = mine.filter((v) => v.state === KEPT);
    const brokenN = mine.filter((v) => v.state === BROKEN).length;
    const keptStake = kept.reduce((a, v) => a + BigInt(v.stake), 0n);
    return {
      address: who.toLowerCase(), vows: mine.length, kept: kept.length, broken: brokenN, retracted: mine.filter((v) => v.state === RETRACTED).length,
      streak, best, kept_stake: keptStake.toString(), tier: standing(kept.length, brokenN, keptStake),
    };
  };
  const copy = (v: Vow): Vow => structuredClone(v);
  const positionOf = (id: number, who: string): Position => {
    const v = vows[id];
    const mine = (backings.get(id) ?? []).filter((b) => b.who.toLowerCase() === who.toLowerCase());
    const f = mine.filter((b) => b.side === "faith").reduce((a, b) => a + b.amount, 0n);
    const d = mine.filter((b) => b.side === "doubt").reduce((a, b) => a + b.amount, 0n);
    const state = v.state === OPEN || v.state === REVIEW ? -1 : v.state;
    const payout = state < 0 ? 0n : owed(state, v.keeper.toLowerCase() === who.toLowerCase(), f, d, BigInt(v.stake), BigInt(v.faith), BigInt(v.doubt));
    return { faith: f.toString(), doubt: d.toString(), payout: payout.toString(), claimed: claimed.has(`${id}|${who.toLowerCase()}`), challenged: false, disputed: false };
  };

  const source = {
    kind: "demo" as const,
    me: DEMO_ME,
    now: clock,
    pulse: async (): Promise<Pulse> => ({ rev: feed.length, total: vows.length }),
    stats: async () => statsNow(),
    list: async (offset: number, limit: number) => vows.slice().reverse().slice(offset, offset + Math.min(limit, PAGE_MAX)).map(copy),
    vow: async (id: number) => {
      if (!vows[id]) throw new Error("No such vow.");
      return copy(vows[id]);
    },
    changes: async (cursor: number): Promise<Changes> => {
      const n = feed.length;
      if (cursor < 0 || cursor > n) return { rev: n, reset: true, rows: [] };
      const ids: number[] = [];
      for (let i = n - 1; i >= cursor; i--) if (!ids.includes(feed[i].vow)) ids.push(feed[i].vow);
      if (ids.length > PAGE_MAX) return { rev: n, reset: true, rows: [] };
      return { rev: n, reset: false, rows: ids.map((i) => copy(vows[i])) };
    },
    activity: async (offset: number, limit: number): Promise<FeedEntry[]> =>
      feed.map((e, seq) => ({ seq, vow: e.vow, action: e.action, at: e.at, keeper: vows[e.vow].keeper, text: vows[e.vow].text.slice(0, 100) })).reverse().slice(offset, offset + Math.min(limit, 100)),
    keepers: async (offset: number, limit: number) => ({ total: keeperOrder.length, rows: keeperOrder.slice(offset, offset + Math.min(limit, 100)).map(profileOf) }),
    profile: async (who: string) => profileOf(who),
    vowsOf: async (who: string, cursor: number, limit: number) => {
      const all = vows.filter((v) => v.keeper.toLowerCase() === who.toLowerCase() && (cursor < 0 || v.id <= cursor)).reverse();
      const rows = all.slice(0, limit).map(copy);
      return { rows, next: all.length > limit ? all[limit].id : -1 };
    },
    position: async (id: number, who: string) => positionOf(id, who),

    // The writes the rehearsal supports. Each follows the contract's rule and its error message.
    async send(fn: string, args: unknown[], value = 0n) {
      const me = DEMO_ME;
      const fail = (m: string): never => { throw new Error(m); };
      const get = (i: unknown) => vows[Number(i)] ?? fail("No such vow.");
      switch (fn) {
        case "make_vow": {
          const [text, url, deadline] = args as [string, string, number];
          if (text.length < 8) fail("The vow is too short.");
          if (value < MIN_STAKE) fail("The minimum stake is 0.1 GEN.");
          if (deadline < clock() + 60 || deadline > clock() + 366 * D) fail("Deadline must be between one minute and one year away.");
          add(me, text, url, clock(), deadline, value);
          return;
        }
        case "back": {
          const v = get(args[0]);
          const side = args[1] as "faith" | "doubt";
          if (v.state !== OPEN || clock() >= v.deadline) fail("This vow no longer takes backing.");
          if (v.keeper === me) fail("A keeper cannot back their own vow.");
          if (side !== "faith" && side !== "doubt") fail("Side must be faith or doubt.");
          if (value < MIN_BACK) fail("The minimum backing is 0.01 GEN.");
          const mine = (backings.get(v.id) ?? []).find((b) => b.who === me);
          if (mine && mine.side !== side) fail(mine.side === "faith" ? "You already back this vow." : "You already doubt this vow.");
          if (side === "faith" && BigInt(v.faith) + value > BigInt(v.faith_cap)) fail("Faith backing is capped at half of the keeper's stake.");
          back(v, me, side, value);
          return;
        }
        case "post_update": {
          const v = get(args[0]);
          const text = String(args[1]).trim();
          if (v.keeper !== me) fail("Only the keeper can post updates.");
          if (v.state !== OPEN) fail("This vow has already been judged.");
          if (clock() >= v.deadline) fail("The deadline has passed. Updates are closed.");
          if (text.length < MIN_UPDATE) fail("The update is too short.");
          if (v.updates.length >= MAX_UPDATES) fail("A vow takes at most five updates.");
          v.updates.push({ at: clock(), text: text.slice(0, MAX_UPDATE) });
          log(v.id, "update");
          return;
        }
        case "retract": {
          const v = get(args[0]);
          if (v.keeper !== me) fail("Only the keeper can retract a vow.");
          if (v.state !== OPEN) fail("This vow has already been judged.");
          if (clock() >= v.deadline) fail("The deadline has passed. A vow can only be retracted before it.");
          if (BigInt(v.faith) > 0n || BigInt(v.doubt) > 0n) fail("A vow that has backing cannot be retracted.");
          settle(v, RETRACTED, "The keeper retracted this vow before anyone backed it.", clock());
          return;
        }
        case "claim": {
          const v = get(args[0]);
          if (v.state === OPEN || v.state === REVIEW) fail("This vow has no final verdict yet.");
          const key = `${v.id}|${me}`;
          if (claimed.has(key)) fail("Already claimed.");
          const p = BigInt(positionOf(v.id, me).payout);
          if (p === 0n) fail("Nothing to claim for this address.");
          claimed.add(key);
          paid += p;
          log(v.id, "claimed");
          return;
        }
        default:
          fail("The rehearsal has no validators. Judging, disputes and pins need the real network.");
      }
    },
  };
  return source;
}
