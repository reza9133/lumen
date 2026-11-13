import { studionet } from "genlayer-js/chains";
import { getActiveProvider } from "./eip6963";

export const CHAIN = studionet;
export const NETWORK_NAME = "studionet";

export const CONTRACT = (import.meta.env.VITE_LUMEN_ADDRESS ?? "") as `0x${string}`;

export type Provenance = "snapshot" | "permalink" | "mutable";
export type Vow = {
  id: number;
  keeper: string;
  text: string;
  url: string;
  created: number;
  deadline: number;
  stake: string;
  faith: string;
  faith_cap: string; // most faith the vow can take: half of the stake
  doubt: string;
  state: number; // 0 open, 1 kept, 2 broken, 3 unclear, 4 in review (a verdict is proposed), 5 retracted
  tries: number;
  note: string;
  counters: string[]; // pages doubters submitted as counter-evidence
  provenance: Provenance; // how hard the main evidence page is to rewrite
  pins: string[]; // immutable proof the keeper attached before the deadline
  disputes: string[]; // pages submitted during the review window
  proposed: number; // 1 kept or 2 broken while in review
  proposed_at: number;
  review_end: number;
  proof: { url: string; tier: Provenance; quote: string; date: string; hash: string } | null;
  updates: { at: number; text: string }[]; // progress notes by the keeper; the judges never see them
};
export type Stats = {
  total: number; kept: number; broken: number; retracted: number; keepers: number;
  embers: string; deposited: string; paid: string; rev: number; version: string;
};
export type Position = { faith: string; doubt: string; payout: string; claimed: boolean; challenged: boolean; disputed: boolean };
export type Profile = {
  address: string; vows: number; kept: number; broken: number; retracted: number;
  streak: number; best: number; kept_stake: string; tier: string;
};
export type FeedEntry = { seq: number; vow: number; action: string; at: number; keeper: string; text: string };
export type Pulse = { rev: number; total: number };
export type Changes = { rev: number; reset: boolean; rows: Vow[] };
export type Params = {
  version: string; min_stake: string; min_back: string; max_text: number; min_text: number; max_url: number;
  min_window: number; max_window: number; page_max: number; faith_cap_div: number; max_counters: number; max_pins: number;
  max_disputes: number; max_updates: number; max_update: number; min_update: number; early_gap: number; retry_gap: number;
  max_tries: number; release_after: number; review_div: number; review_min: number; review_max: number;
  retract_burn_div: number; feed_max: number; keepers_max: number;
  tiers: { name: string; kept: number; kept_stake: string; broken_div: number }[];
  states: Record<string, number>;
};

// The SDK is the heaviest part of the app and is not needed to draw the page, so it loads on its own, in parallel.
// In rehearsal mode (no contract) it is never fetched.
let sdkPromise: Promise<typeof import("genlayer-js")> | null = null;
export const loadSdk = () => (sdkPromise ??= import("genlayer-js"));
let readerPromise: Promise<any> | null = null;
const getReader = () => (readerPromise ??= loadSdk().then((sdk) => sdk.createClient({ chain: studionet })));

// What this session has read from the chain, shown in the footer so the cost of staying in sync is visible.
export const metrics = { reads: 0, bytes: 0 };

async function read<T>(functionName: string, args: unknown[]): Promise<T> {
  const raw = String(await (await getReader()).readContract({ address: CONTRACT, functionName, args }));
  metrics.reads += 1;
  metrics.bytes += raw.length;
  return JSON.parse(raw) as T;
}

export { PAGE_MAX as PAGE } from "./limits";
export const readStats = () => read<Stats>("stats", []);
export const readPulse = () => read<Pulse>("pulse", []);
export const readParams = () => read<Params>("params", []);
export const readList = (offset: number, limit: number) => read<Vow[]>("list_vows", [offset, limit]);
export const readVow = (id: number) => read<Vow>("get_vow", [id]);
export const readChanges = (cursor: number) => read<Changes>("changes_since", [cursor]);
export const readActivity = (offset: number, limit: number) => read<FeedEntry[]>("activity", [offset, limit]);
export const readKeepers = (offset: number, limit: number) => read<{ total: number; rows: Profile[] }>("list_keepers", [offset, limit]);
export const readProfile = (who: string) => read<Profile>("profile_of", [who]);
export const readVowsOf = (who: string, cursor: number, limit: number) => read<{ rows: Vow[]; next: number }>("vows_of", [who, cursor, limit]);
export const readPosition = (id: number, who: string) => read<Position>("position_of", [id, who]);

// Offset between this device's clock and the network's, in seconds. The contract judges deadlines by
// network time, so a device clock that is minutes off would show the wrong phase or fail a short deadline.
let clockOffset = 0;
export const nowSec = () => Math.floor(Date.now() / 1000) + clockOffset;

// Best effort: reads the server date from the RPC endpoint. Stays at zero when the header is hidden.
export async function syncClock() {
  try {
    const url = (studionet as any)?.rpcUrls?.default?.http?.[0];
    if (!url) return;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const date = res.headers.get("date");
    const ms = date ? Date.parse(date) : NaN;
    if (Number.isFinite(ms)) {
      const off = Math.round(ms / 1000) - Math.floor(Date.now() / 1000);
      clockOffset = Math.abs(off) <= 86400 ? off : 0;
    }
  } catch {
    /* keep the device clock */
  }
}

// A signing client for `addr`, built on the wallet the person picked (not whichever extension owns
// window.ethereum).
export async function makeWallet(addr: string) {
  const provider = getActiveProvider();
  if (!provider) throw new Error("No wallet is connected.");
  const sdk = await loadSdk();
  const client: any = sdk.createClient({ chain: studionet, account: addr as `0x${string}`, provider: provider as any });
  await client.connect(NETWORK_NAME);
  return { client, addr };
}

// Messages the contract can raise, used to explain a transaction that was decided as an error.
const CONTRACT_ERRORS = [
  "The vow is too short.",
  "Evidence must be a single http(s) link.",
  "Deadline must be between one minute and one year away.",
  "The minimum stake is 0.1 GEN.",
  "This vow no longer takes backing.",
  "The minimum backing is 0.01 GEN.",
  "A keeper cannot back their own vow.",
  "You already doubt this vow.",
  "You already back this vow.",
  "This vow has already been judged.",
  "No such vow.",
  "The deadline has passed. Counter-evidence is closed.",
  "A vow can be released thirty days after its deadline.",
  "Wait an hour before asking again.",
  "Early judging opens halfway to the deadline.",
  "Early judging is only possible while nobody doubts the vow.",
  "Wait fifteen minutes before checking early again.",
  "Only doubters can submit counter-evidence.",
  "You already submitted counter-evidence.",
  "Counter-evidence must be a single http(s) link.",
  "That page is already part of the evidence.",
  "The counter-evidence slots are held by larger doubters.",
  "Faith backing is capped at half of the keeper's stake.",
  "Already claimed.",
  "Nothing to claim for this address.",
  "This vow has no final verdict yet.",
  "The deadline has passed. Evidence can no longer be added.",
  "Only the keeper can pin evidence.",
  "A pin must be an archive snapshot or a commit-pinned link.",
  "The snapshot must be taken before now and before the deadline.",
  "A vow takes at most two pins.",
  "This vow is not under review.",
  "The review window has closed.",
  "The review window is still open.",
  "Only doubters can dispute a kept verdict.",
  "Only the keeper and faith backers can dispute a broken verdict.",
  "You already submitted a dispute.",
  "The dispute slots are held by larger positions.",
  "A verdict is already proposed. Call finalize when the review window ends.",
  "A vow takes at most five updates.",
  "A vow that has backing cannot be retracted.",
  "Only the keeper can post updates.",
  "Only the keeper can retract a vow.",
  "Side must be faith or doubt.",
  "The deadline has passed. A vow can only be retracted before it.",
  "The deadline has passed. Updates are closed.",
  "The update is too short.",
];

const CLOCK_HINT = [
  "Deadline must be between one minute and one year away.",
  "Early judging opens halfway to the deadline.",
  "Early judging is only possible while nobody doubts the vow.",
  "Wait an hour before asking again.",
];

function explain(receipt: any): string {
  let dump = "";
  try {
    dump = JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    /* ignore */
  }
  const hit = CONTRACT_ERRORS.find((m) => dump.includes(m));
  if (hit && CLOCK_HINT.includes(hit)) return `${hit} If this looks wrong, check that your device clock is correct.`;
  if (!hit && dump.includes("LLM_ERROR")) return "The validators could not agree on a verdict. Try again in a minute.";
  return hit ?? `The transaction was decided as ${receipt?.txExecutionResultName ?? receipt?.statusName ?? "failed"}.`;
}

// Budget used when the write simulation cannot produce an estimate (for example because the call
// would be refused by the contract). The contract then reports the real reason.
const FALLBACK_ALLOCATION = {
  leaderTimeunitsAllocation: 125n,
  validatorTimeunitsAllocation: 250n,
  executionBudgetPerRound: 800000n,
  totalMessageFees: 0n,
  appealRounds: 1n,
  rotations: [1n, 1n],
};

async function quoteFees(client: any, call: any): Promise<{ distribution: unknown; feeValue: unknown } | undefined> {
  const pick = (e: any) => (e?.distribution && !e.gasless ? { distribution: e.distribution, feeValue: e.feeValue } : undefined);
  if (typeof client.estimateTransactionFeesForWrite === "function") {
    try {
      return pick(await client.estimateTransactionFeesForWrite(call)); // undefined on a gasless network
    } catch {
      /* simulation failed: fall back to a fixed budget */
    }
  }
  if (typeof client.estimateTransactionFees === "function") {
    try {
      return pick(await client.estimateTransactionFees(FALLBACK_ALLOCATION));
    } catch {
      /* the network does not charge protocol fees */
    }
  }
  return undefined;
}

export async function send(client: any, functionName: string, args: unknown[], value?: bigint) {
  const call: any = { address: CONTRACT, functionName, args, ...(value ? { value } : {}) };

  // Networks that charge protocol fees need an explicit fee policy; others do not.
  const fees = await quoteFees(client, call);

  const hash = await client.writeContract(fees ? { ...call, fees } : call);
  const opts = { hash, retries: 400, interval: 3000 };
  const receipt =
    typeof client.waitForDecision === "function"
      ? await client.waitForDecision(opts)
      : await client.waitForTransactionReceipt({ ...opts, status: "ACCEPTED" });

  const check = ((await loadSdk()) as any).isSuccessful;
  const ok = check ? check(receipt) : !String(receipt?.txExecutionResultName ?? "").includes("ERROR");
  if (!ok) throw new Error(explain(receipt));
  return receipt;
}
