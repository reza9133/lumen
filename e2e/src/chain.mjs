// Talking to the network: JSON-RPC, the network clock, accounts and funding, transactions and reads.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as sdk from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { fmt } from "./oracle.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const replacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);
// How often a pending transaction is looked up. Every lookup is a request, and the RPC allows 30 a minute in all.
export const POLL_MS = Math.max(1, Number(process.env.E2E_POLL_SECS) || 15) * 1000;
export const RPC_URL = studionet?.rpcUrls?.default?.http?.[0];

export class Network {
  constructor(rpcUrl = RPC_URL) {
    if (!rpcUrl) throw new Error("The studionet chain definition has no RPC url.");
    this.rpcUrl = rpcUrl;
    this.clockOffset = 0;
  }

  async rpc(method, params = []) {
    const res = await fetch(this.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
    return { result: body.result, date: res.headers.get("date") };
  }

  async balanceOf(address) {
    return BigInt((await this.rpc("eth_getBalance", [address, "latest"])).result);
  }

  /** The contract judges deadlines by network time, so waits follow the network's clock, not this machine's. */
  async syncClock() {
    try {
      const { date } = await this.rpc("eth_chainId", []);
      const ms = date ? Date.parse(date) : NaN;
      if (Number.isFinite(ms)) {
        const off = Math.round(ms / 1000) - Math.floor(Date.now() / 1000);
        this.clockOffset = Math.abs(off) <= 86400 ? off : 0;
      }
    } catch {
      /* keep the local clock */
    }
    return this.clockOffset;
  }

  now() {
    return Math.floor(Date.now() / 1000) + this.clockOffset;
  }

  async waitUntil(ts, label, log = console.log) {
    let last = 0;
    while (this.now() < ts) {
      const left = ts - this.now();
      if (Date.now() - last > 60000) {
        log(`  ... ${label}: ${left}s to go`);
        last = Date.now();
      }
      await sleep(Math.min(15, Math.max(1, left)) * 1000);
    }
  }
}

// ---- accounts ----------------------------------------------------------------------------------------------

/**
 * One funded account per role. Keys come from E2E_KEYS, from a file kept between runs (so a funded account is
 * reused), or are created now. The file is private to this machine and is listed in .gitignore.
 */
export function loadAccounts(names, { file = "", keys = "" } = {}) {
  let saved = {};
  if (file && existsSync(file)) {
    try {
      saved = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      saved = {};
    }
  }
  const given = keys.split(",").map((k) => k.trim()).filter(Boolean);
  if (given.length && given.length < names.length) throw new Error(`E2E_KEYS holds ${given.length} keys but this run needs ${names.length} (${names.join(", ")}).`);
  const out = {};
  let created = false;
  names.forEach((name, i) => {
    let key = given[i] || saved[name];
    if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? "")) {
      key = sdk.generatePrivateKey();
      created = true;
    }
    const account = sdk.createAccount(key);
    out[name] = { name, key, address: account.address, account };
  });
  if (file && created && !given.length) {
    writeFileSync(file, JSON.stringify(Object.fromEntries(names.map((n) => [n, out[n].key])), null, 2), { mode: 0o600 });
  }
  if (new Set(names.map((n) => out[n].address.toLowerCase())).size !== names.length) throw new Error("Two roles share one account.");
  return out;
}

/**
 * Funds accounts from the Studio faucet (sim_fundAccount). When the network does not offer it, the addresses are
 * printed and the run waits for the balances to arrive from another source (the faucet in GenLayer Studio).
 */
export async function ensureFunded(net, accounts, want, { waitSecs = 600, log = console.log } = {}) {
  const report = [];
  const low = [];
  for (const a of Object.values(accounts)) {
    const need = want[a.name] ?? want.default;
    let bal = await net.balanceOf(a.address);
    let how = "already funded";
    if (bal < need) {
      try {
        await net.rpc("sim_fundAccount", [a.address, Number(need)]);
        how = "funded by sim_fundAccount";
      } catch (e) {
        how = `faucet call refused (${String(e.message).slice(0, 80)})`;
      }
      bal = await net.balanceOf(a.address);
    }
    if (bal < need) low.push(a);
    report.push({ name: a.name, address: a.address, how, balance: bal.toString() });
  }
  if (low.length) {
    log("\nThese accounts need GEN. Send each at least the amount shown (GenLayer Studio faucet):");
    for (const a of low) log(`  ${a.name.padEnd(10)} ${a.address}  needs ${fmt(want[a.name] ?? want.default)}`);
    const until = Date.now() + waitSecs * 1000;
    while (Date.now() < until) {
      await sleep(10000);
      const still = [];
      for (const a of low) if ((await net.balanceOf(a.address)) < (want[a.name] ?? want.default)) still.push(a);
      if (!still.length) break;
      low.splice(0, low.length, ...still);
    }
    for (const r of report) {
      const a = accounts[r.name];
      const bal = await net.balanceOf(a.address);
      r.balance = bal.toString();
      if (bal < (want[a.name] ?? want.default)) throw new Error(`${a.name} (${a.address}) still holds ${fmt(bal)}; it needs ${fmt(want[a.name] ?? want.default)}.`);
      if (r.how.startsWith("faucet call refused")) r.how = "funded from outside";
    }
  }
  return report;
}

// ---- transactions ------------------------------------------------------------------------------------------

const FALLBACK_ALLOCATION = {
  leaderTimeunitsAllocation: 125n,
  validatorTimeunitsAllocation: 250n,
  executionBudgetPerRound: 800000n,
  totalMessageFees: 0n,
  appealRounds: 1n,
  rotations: [1n, 1n],
};

async function quoteFees(client, call) {
  const pick = (e) => (e?.distribution && !e.gasless ? { distribution: e.distribution, feeValue: e.feeValue } : undefined);
  if (typeof client.estimateTransactionFeesForWrite === "function") {
    try {
      return pick(await client.estimateTransactionFeesForWrite(call));
    } catch {
      /* fall back */
    }
  }
  if (typeof client.estimateTransactionFees === "function") {
    try {
      return pick(await client.estimateTransactionFees(FALLBACK_ALLOCATION));
    } catch {
      /* this network does not charge protocol fees */
    }
  }
  return undefined;
}

const outcome = (r) => ({ status: r?.statusName ?? null, execution: r?.txExecutionResultName ?? null });
export const successful = (r) => (typeof sdk.isSuccessful === "function" ? sdk.isSuccessful(r) : !String(r?.txExecutionResultName ?? "").includes("ERROR"));

/** True when a receipt text reports a failed execution (an error result or a rolled-back call). */
export function receiptFailed(text) {
  return /"execution_result"\s*:\s*"ERROR"|"txExecutionResultName"\s*:\s*"FINISHED_WITH_ERROR"|"status"\s*:\s*"(?:rollback|user_error|contract_error|vm_error)"/i.test(String(text ?? ""));
}

/** Text of everything a receipt says, to look for a revert reason in. */
export function receiptText(r) {
  try {
    return JSON.stringify(r, replacer);
  } catch {
    return String(r);
  }
}

export class Lumen {
  constructor(net, address, recorder) {
    this.net = net;
    this.address = address;
    this.rec = recorder;
    this.reader = sdk.createClient({ chain: studionet });
    this.clients = new Map();
    this.reasonsSeen = 0;
  }

  client(actor) {
    if (!this.clients.has(actor.address)) this.clients.set(actor.address, sdk.createClient({ chain: studionet, account: actor.account }));
    return this.clients.get(actor.address);
  }

  async read(fn, args = [], tries = 4) {
    for (let i = 0; ; i++) {
      try {
        return JSON.parse(String(await this.reader.readContract({ address: this.address, functionName: fn, args })));
      } catch (e) {
        if (i >= tries - 1) throw e;
        await sleep(2000 * (i + 1));
      }
    }
  }

  /** Sends a write call and waits for the network's decision. Throws when the transaction fails. */
  async send(scenario, actor, fn, args = [], value = 0n, { tries = 1, pause = 75 } = {}) {
    for (let attempt = 1; ; attempt++) {
      const step = await this._once(scenario, actor, fn, args, value, attempt);
      if (step.ok) return step;
      if (attempt >= tries) throw new Error(`${fn} by ${actor.name} failed: ${step.status} / ${step.execution}${step.reason ? " " + step.reason : ""}`);
      this.rec.log(`  [${scenario}] retrying ${fn} in ${pause}s`);
      await sleep(pause * 1000);
    }
  }

  /**
   * What a refused call must leave alone. Scenarios run side by side, so the global totals move for other reasons;
   * what one scenario can check is the vow the call names (its first argument) or, for make_vow, the caller's own vows.
   */
  async scope(fn, args, actor) {
    const ask = async (name, a) => {
      try {
        return JSON.stringify(await this.read(name, a, 1));
      } catch (e) {
        return `(${String(e?.message ?? e).split("\n")[0].slice(0, 80)})`;
      }
    };
    if (fn === "make_vow") return { what: `the vows of ${actor.name}`, state: await ask("vows_of", [actor.address, -1, 50]) };
    return { what: `vow #${args[0]}`, state: await ask("get_vow", [args[0]]) };
  }

  /**
   * Sends a call that the contract has to reject. Passes when the transaction is not successful (or is refused
   * before it is sent) and, when the network exposes the reason, when the reason contains `reason`.
   */
  async expectRevert(scenario, actor, fn, args, value, reason, label) {
    const balanceBefore = await this.net.balanceOf(actor.address);
    const before = await this.scope(fn, args, actor);
    let step;
    let refusedEarly = "";
    try {
      step = await this._once(scenario, actor, fn, args, value, 1, true);
    } catch (e) {
      refusedEarly = String(e?.message ?? e);
      if (/timed? ?out|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(refusedEarly)) throw e; // a network problem is not a rejection
    }
    const after = await this.scope(fn, args, actor);
    const text = refusedEarly || (step ? step.receiptText : "");
    const gave = refusedEarly || step?.reason || "";
    const reasonSeen = text.toLowerCase().includes(reason.toLowerCase());
    // This SDK version does not always name the execution result, so a refusal is also recognised by the receipt itself:
    // an error result, or the contract's own refusal text.
    const marked = step ? receiptFailed(step.receiptText) : false;
    const rejected = refusedEarly ? true : !step.ok || marked || reasonSeen;
    const how = refusedEarly ? "refused before it was sent" : !step.ok ? `${step.status} / ${step.execution}` : marked ? "the receipt reports an error result" : reasonSeen ? "the receipt carries the contract's refusal text" : "";
    const ledgerSame = before.state === after.state;
    this.rec.check(scenario, `${label}: rejected`, rejected, rejected ? how : "the contract ACCEPTED a call it must reject", "behavior");
    if (reasonSeen) this.reasonsSeen++;
    // Whether a mismatch fails the run depends on whether this network shows revert reasons at all; that is known
    // once every call has been made (Recorder.settleDeferred).
    this.rec.check(scenario, `${label}: reason is "${reason}"`, reasonSeen, reasonSeen ? "reason found in the receipt" : `receipt says: ${(gave || "(no reason text)").slice(0, 160)}`, "behavior", "defer");
    this.rec.check(scenario, `${label}: state untouched`, ledgerSame, ledgerSame ? `${before.what} is unchanged` : `${before.what}: before ${before.state.slice(0, 300)} after ${after.state.slice(0, 300)}`, "invariant");
    if (step) step.balanceBefore = balanceBefore.toString();
    return { rejected, reasonSeen, step };
  }

  async _once(scenario, actor, fn, args, value, attempt, tolerateFailure = false) {
    const call = { address: this.address, functionName: fn, args, ...(value ? { value } : {}) };
    const client = this.client(actor);
    const fees = await quoteFees(client, call);
    const startedAt = Date.now();
    const hash = await client.writeContract(fees ? { ...call, fees } : call);
    const opts = { hash, retries: 600, interval: POLL_MS };
    const receipt = typeof client.waitForDecision === "function" ? await client.waitForDecision(opts) : await client.waitForTransactionReceipt({ ...opts, status: "ACCEPTED" });
    const ok = successful(receipt);
    const text = receiptText(receipt);
    const reason = ok ? "" : (text.match(/(LLM_ERROR[^"\\]{0,120}|"[A-Z][^"\\]{8,140}[.!]")/)?.[0] ?? "").replace(/^"|"$/g, "");
    const step = { n: this.rec.steps.length + 1, scenario, fn, caller: actor.name, address: actor.address, value: (value ?? 0n).toString(), hash, ...outcome(receipt), ok, attempt, seconds: Math.round((Date.now() - startedAt) / 1000), reason, receiptText: tolerateFailure ? text : "" };
    this.rec.steps.push(step);
    this.rec.log(`  ${ok ? "ok " : tolerateFailure ? "rej" : "ERR"} [${scenario}] ${fn} by ${actor.name}: ${hash} (${step.status} / ${step.execution})`);
    return step;
  }

  /** The transfer a claim emits is delivered when the claim transaction finalizes, so wait for that as well. */
  async untilFinal(actor, step) {
    const client = this.client(actor);
    const opts = { hash: step.hash, retries: 600, interval: POLL_MS };
    const r = typeof client.waitForFinalization === "function" ? await client.waitForFinalization(opts) : await client.waitForTransactionReceipt({ ...opts, status: "FINALIZED" });
    step.finalized = outcome(r).status;
    this.rec.log(`  finalized [${step.scenario}] ${step.fn} by ${actor.name}: ${step.finalized}`);
  }
}

/** Deploys contracts/lumen.py and returns the address read from the receipt. */
export async function deploy(net, actor, codePath, recorder) {
  const client = sdk.createClient({ chain: studionet, account: actor.account });
  const code = new Uint8Array(readFileSync(codePath));
  const fees = await quoteFees(client, { functionName: "constructor" }).catch(() => undefined);
  const started = Date.now();
  const hash = await client.deployContract({ code, args: [], ...(fees ? { fees } : {}) });
  const opts = { hash, retries: 600, interval: POLL_MS };
  const receipt = typeof client.waitForDecision === "function" ? await client.waitForDecision(opts) : await client.waitForTransactionReceipt({ ...opts, status: "ACCEPTED" });
  const ok = successful(receipt);
  const address = receipt?.txDataDecoded?.contractAddress ?? receipt?.data?.contract_address ?? receipt?.recipient ?? receipt?.to_address;
  recorder.steps.push({ n: recorder.steps.length + 1, scenario: "deploy", fn: "(deploy)", caller: actor.name, address: actor.address, value: "0", hash, ...outcome(receipt), ok, attempt: 1, seconds: Math.round((Date.now() - started) / 1000), reason: "" });
  if (!ok || !address) throw new Error(`Deployment failed: ${receipt?.txExecutionResultName ?? receipt?.statusName ?? "no receipt"}`);
  return { address, hash };
}
