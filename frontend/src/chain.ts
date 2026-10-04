import * as sdk from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { getActiveProvider } from "./eip6963";

export const CHAIN = studionet;
export const NETWORK_NAME = "studionet";

export const CONTRACT = (import.meta.env.VITE_LUMEN_ADDRESS ?? "") as `0x${string}`;

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
  state: number; // 0 open, 1 kept, 2 broken, 3 unclear
  tries: number;
  note: string;
  counters: string[]; // pages doubters submitted as counter-evidence
};
export type Stats = { total: number; kept: number; broken: number; embers: string };
export type Position = { faith: string; doubt: string; payout: string; claimed: boolean; challenged: boolean };
export type KeeperRecord = { kept: number; broken: number; streak: number; best: number; kept_stake: string };

const reader: any = sdk.createClient({ chain: studionet });

async function read<T>(functionName: string, args: unknown[]): Promise<T> {
  const raw = await reader.readContract({ address: CONTRACT, functionName, args });
  return JSON.parse(String(raw)) as T;
}

export const PAGE = 60; // the contract serves at most this many vows per call

// Reads the newest `pages` pages of vows. A vow that arrives between two page reads can shift the
// offsets, so rows are de-duplicated by id.
export async function readAll(pages = 1) {
  const offsets = Array.from({ length: Math.max(1, pages) }, (_, i) => i * PAGE);
  const statsP = read<Stats>("stats", []);
  const chunksP = Promise.all(offsets.map((o) => read<Vow[]>("list_vows", [o, PAGE])));
  const [stats, chunks] = await Promise.all([statsP, chunksP]);
  const seen = new Set<number>();
  const vows: Vow[] = [];
  for (const row of chunks.flat()) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      vows.push(row);
    }
  }
  return { stats, vows };
}
export const readPosition = (id: number, who: string) => read<Position>("position_of", [id, who]);
export const readRecord = (who: string) => read<KeeperRecord>("record_of", [who]);

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

  const check = (sdk as any).isSuccessful;
  const ok = check ? check(receipt) : !String(receipt?.txExecutionResultName ?? "").includes("ERROR");
  if (!ok) throw new Error(explain(receipt));
  return receipt;
}
