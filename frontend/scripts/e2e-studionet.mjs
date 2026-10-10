// End-to-end run of Lumen on Studionet. It drives one vow through the whole cycle with three real accounts
//   make_vow -> back (faith, doubt) -> [pin_evidence] -> deadline -> judge -> review window -> finalize -> claim
// and writes what happened to evidence/studionet-e2e-<scenario>-<time>.json and .md: every transaction hash and
// its decision, the vow row after each stage (verdict, proof tier, review window), the contract's own totals, and
// the native GEN balance of every account before and after its claim.
//
// Usage (three accounts funded from the faucet in GenLayer Studio, 1 GEN each is plenty):
//   cd frontend && npm install
//   KEEPER_KEY=0x.. FAITH_KEY=0x.. DOUBT_KEY=0x.. EVIDENCE_URL=https://.. npm run e2e
//
// Environment
//   LUMEN_ADDRESS   contract address (default: VITE_LUMEN_ADDRESS from frontend/.env)
//   KEEPER_KEY      private key of the keeper (stakes and judges)
//   FAITH_KEY       private key of a different account that backs the vow with faith
//   DOUBT_KEY       private key of a third account that doubts the vow
//   EVIDENCE_URL    the keeper's evidence page (a page that shows a dated completion for SCENARIO=kept,
//                   or one that does not for SCENARIO=broken)
//   PIN_URL         optional: an exact Wayback capture link taken before the deadline, pinned by the keeper
//   EXPECT_TIER     optional: snapshot | permalink | mutable. After judging, the proof tier recorded for a kept
//                   verdict is checked against it. Use "snapshot" with a good PIN_URL, and "mutable" with a link
//                   whose capture the archive will not vouch for, to see the authentication at work.
//   SCENARIO        kept (default) | broken: which side is expected to be paid
//   DEADLINE_SECS   seconds from now until the deadline (default 330, the minimum is 60)
//   STAKE_GEN, FAITH_GEN, DOUBT_GEN   amounts in GEN (defaults 0.2, 0.05, 0.02)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as sdk from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const die = (m) => {
  console.error(m);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GEN = 10n ** 18n;

function readEnvFile() {
  const p = new URL("../.env", import.meta.url);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}
const fromFile = (k) => new RegExp(`^${k}=(.*)$`, "m").exec(readEnvFile())?.[1]?.trim();

const CONTRACT = process.env.LUMEN_ADDRESS || fromFile("VITE_LUMEN_ADDRESS");
if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT ?? "")) die("Set LUMEN_ADDRESS (or VITE_LUMEN_ADDRESS in frontend/.env) to the deployed contract address.");
const need = (k) => {
  const v = process.env[k];
  if (!/^0x[0-9a-fA-F]{64}$/.test(v ?? "")) die(`Set ${k} to a private key (0x...) of an account funded on Studionet.`);
  return v;
};
const EVIDENCE_URL = process.env.EVIDENCE_URL || die("Set EVIDENCE_URL to the keeper's evidence page.");
const PIN_URL = process.env.PIN_URL || "";
const EXPECT_TIER = process.env.EXPECT_TIER || "";
const SCENARIO = process.env.SCENARIO || "kept";
if (!["kept", "broken"].includes(SCENARIO)) die("SCENARIO must be kept or broken.");
if (EXPECT_TIER && !["snapshot", "permalink", "mutable"].includes(EXPECT_TIER)) die("EXPECT_TIER must be snapshot, permalink or mutable.");
const DEADLINE_SECS = Math.max(60, Number(process.env.DEADLINE_SECS || 330));
const gen = (name, dflt) => BigInt(Math.round(Number(process.env[name] || dflt) * 1e6)) * (GEN / 10n ** 6n);
const STAKE = gen("STAKE_GEN", 0.2);
const FAITH = gen("FAITH_GEN", 0.05);
const DOUBT = gen("DOUBT_GEN", 0.02);

const RPC = studionet?.rpcUrls?.default?.http?.[0];
if (!RPC) die("The studionet chain definition has no RPC url.");

const fmt = (w) => {
  w = BigInt(w);
  const s = (w < 0n ? -w : w).toString().padStart(19, "0");
  const frac = s.slice(-18).replace(/0+$/, "");
  return `${w < 0n ? "-" : ""}${s.slice(0, -18)}${frac ? "." + frac : ""} GEN`;
};

async function rpc(method, params) {
  const res = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return { result: body.result, date: res.headers.get("date") };
}
const balanceOf = async (addr) => BigInt((await rpc("eth_getBalance", [addr, "latest"])).result);

// The contract judges deadlines by network time, so waits follow the network's clock, not this machine's.
let clockOffset = 0;
async function syncClock() {
  try {
    const { date } = await rpc("eth_chainId", []);
    const ms = date ? Date.parse(date) : NaN;
    if (Number.isFinite(ms)) {
      const off = Math.round(ms / 1000) - Math.floor(Date.now() / 1000);
      clockOffset = Math.abs(off) <= 86400 ? off : 0;
    }
  } catch {
    /* keep the local clock */
  }
}
const netNow = () => Math.floor(Date.now() / 1000) + clockOffset;
async function waitUntil(ts, label) {
  while (netNow() < ts) {
    const left = ts - netNow();
    console.log(`  ... waiting ${left}s for ${label}`);
    await sleep(Math.min(20, Math.max(1, left)) * 1000);
  }
}

// ---- accounts and transactions ------------------------------------------------------------------------------

function actor(name, key) {
  const account = sdk.createAccount(key);
  return { name, address: account.address, client: sdk.createClient({ chain: studionet, account }) };
}
const keeper = actor("keeper", need("KEEPER_KEY"));
const faith = actor("faith", need("FAITH_KEY"));
const doubt = actor("doubt", need("DOUBT_KEY"));
if (new Set([keeper, faith, doubt].map((a) => a.address.toLowerCase())).size !== 3) die("The keeper, faith and doubt accounts must be three different accounts.");

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
const successful = (r) => (sdk.isSuccessful ? sdk.isSuccessful(r) : !String(r?.txExecutionResultName ?? "").includes("ERROR"));
const replacer = (_k, v) => (typeof v === "bigint" ? v.toString() : v);

const steps = [];
async function send(who, fn, args, value, { tries = 1, pause = 60 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const call = { address: CONTRACT, functionName: fn, args, ...(value ? { value } : {}) };
    const fees = await quoteFees(who.client, call);
    const hash = await who.client.writeContract(fees ? { ...call, fees } : call);
    const opts = { hash, retries: 400, interval: 3000 };
    const receipt =
      typeof who.client.waitForDecision === "function"
        ? await who.client.waitForDecision(opts)
        : await who.client.waitForTransactionReceipt({ ...opts, status: "ACCEPTED" });
    const ok = successful(receipt);
    const step = { n: steps.length + 1, fn, caller: who.name, address: who.address, value: value ? value.toString() : "0", hash, ...outcome(receipt), ok, attempt };
    steps.push(step);
    console.log(`  ${ok ? "ok " : "ERR"} ${fn} by ${who.name}: ${hash} (${step.status} / ${step.execution})`);
    if (ok) return step;
    let why = "";
    try {
      why = JSON.stringify(receipt, replacer).match(/(LLM_ERROR[^"\\]{0,120}|"[A-Z][^"\\]{8,140}\.")/)?.[0] ?? "";
    } catch {
      /* ignore */
    }
    if (attempt >= tries) die(`${fn} failed: ${step.status} / ${step.execution} ${why}`);
    console.log(`  retrying ${fn} in ${pause}s ${why}`);
    await sleep(pause * 1000);
  }
}
// The transfer a claim emits is delivered when the claim transaction finalizes, so wait for that as well.
async function untilFinal(who, step) {
  const opts = { hash: step.hash, retries: 400, interval: 3000 };
  const r =
    typeof who.client.waitForFinalization === "function"
      ? await who.client.waitForFinalization(opts)
      : await who.client.waitForTransactionReceipt({ ...opts, status: "FINALIZED" });
  step.finalized = outcome(r);
  console.log(`  finalized ${step.fn} by ${who.name}: ${step.finalized.status}`);
}

const reader = sdk.createClient({ chain: studionet });
const read = async (fn, args) => JSON.parse(String(await reader.readContract({ address: CONTRACT, functionName: fn, args })));
const STATE = ["OPEN", "KEPT", "BROKEN", "UNCLEAR", "REVIEW"];

// ---- the same archive check the validators make, run here first so that a bad PIN_URL does not waste a run ----

async function preflightArchive(url) {
  const m = /^https?:\/\/web\.archive\.org\/web\/(\d{14})(?:[a-z]{2}_)?\/https?:\/\/\S+$/.exec(url);
  if (!m) return { confirmed: false, why: "not a Wayback replay link" };
  const t = m[1];
  const wanted = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14)) / 1000;
  let cur = url;
  for (let hop = 0; hop <= 3; hop++) {
    const res = await fetch(cur, { redirect: "manual" });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      let loc = (res.headers.get("location") || "").trim();
      if (loc.startsWith("//web.archive.org/web/")) loc = "https:" + loc;
      else if (loc.startsWith("/web/")) loc = "https://web.archive.org" + loc;
      if (!/^https?:\/\/web\.archive\.org\/web\/\S+$/.test(loc)) return { confirmed: false, why: `redirect leaves the archive: ${loc}` };
      cur = loc;
      continue;
    }
    if (res.status >= 400) return { confirmed: false, why: `HTTP ${res.status}` };
    const header = res.headers.get("memento-datetime");
    const served = header && /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header) ? Date.parse(header) / 1000 : NaN;
    if (!Number.isFinite(served)) return { confirmed: false, why: `no usable Memento-Datetime header (${header ?? "missing"})` };
    return served === wanted
      ? { confirmed: true, served: header }
      : { confirmed: false, why: `the archive served the capture of ${header}, not the one in the link` };
  }
  return { confirmed: false, why: "too many redirects" };
}

// ---- the run ------------------------------------------------------------------------------------------------

const evidence = {
  scenario: SCENARIO,
  network: "studionet",
  rpc: RPC,
  contract: CONTRACT,
  startedAt: new Date().toISOString(),
  accounts: { keeper: keeper.address, faith: faith.address, doubt: doubt.address },
  inputs: { evidenceUrl: EVIDENCE_URL, pinUrl: PIN_URL || null, expectTier: EXPECT_TIER || null, deadlineSecs: DEADLINE_SECS, stake: STAKE.toString(), faith: FAITH.toString(), doubt: DOUBT.toString() },
  stages: [],
  claims: [],
};
const stage = (name, vow, extra = {}) => {
  const row = vow ? { state: STATE[vow.state] ?? vow.state, proposed: STATE[vow.proposed] ?? vow.proposed, note: vow.note, proof: vow.proof, pins: vow.pins, review_end: vow.review_end, proposed_at: vow.proposed_at } : null;
  evidence.stages.push({ name, at: new Date().toISOString(), vow: row, ...extra });
};

console.log(`Lumen end-to-end on Studionet, scenario "${SCENARIO}"`);
console.log(`contract ${CONTRACT}`);
await syncClock();

if (PIN_URL) {
  const pf = await preflightArchive(PIN_URL);
  evidence.pinPreflight = pf;
  console.log(`pin preflight: ${pf.confirmed ? "the archive confirms this capture" : "the archive will NOT confirm this capture (" + pf.why + ")"}`);
  if (EXPECT_TIER === "snapshot" && !pf.confirmed) die("EXPECT_TIER is snapshot but the archive does not confirm PIN_URL. Pick the exact capture link from the Wayback Machine.");
}

const start = { keeper: await balanceOf(keeper.address), faith: await balanceOf(faith.address), doubt: await balanceOf(doubt.address) };
evidence.balancesStart = Object.fromEntries(Object.entries(start).map(([k, v]) => [k, v.toString()]));
console.log("balances:", Object.entries(start).map(([k, v]) => `${k} ${fmt(v)}`).join(", "));
if (start.keeper < STAKE || start.faith < FAITH || start.doubt < DOUBT) die("An account does not hold enough GEN for its part. Fund it with the faucet in GenLayer Studio.");

const statsBefore = await read("stats", []);
evidence.statsBefore = statsBefore;

const text = `Lumen e2e ${new Date().toISOString().slice(0, 19)}Z: publish the evidence page`;
const deadline = netNow() + DEADLINE_SECS;
console.log("\n1. keeper makes the vow");
await send(keeper, "make_vow", [text, EVIDENCE_URL, deadline], STAKE);
const found = (await read("list_vows", [0, 20])).find((v) => v.keeper.toLowerCase() === keeper.address.toLowerCase() && v.text.startsWith(text.slice(0, 40)));
if (!found) die("The new vow was not found in the newest vows. Check the transaction in the explorer.");
const id = found.id;
evidence.vowId = id;
stage("made", await read("get_vow", [id]));

console.log("\n2. faith and doubt back the vow");
await send(faith, "back", [id, "faith"], FAITH);
await send(doubt, "back", [id, "doubt"], DOUBT);
if (PIN_URL) {
  console.log("\n   keeper pins the archive capture");
  await send(keeper, "pin_evidence", [id, PIN_URL]);
}
stage("backed", await read("get_vow", [id]));

console.log("\n3. waiting for the deadline");
await waitUntil(deadline + 10, "the deadline");

console.log("\n4. judge");
await send(keeper, "judge", [id], 0n, { tries: 3, pause: 75 });
let vow = await read("get_vow", [id]);
stage("judged", vow);
console.log(`   state ${STATE[vow.state]}, proposed ${STATE[vow.proposed]}, note: ${vow.note}`);
if (vow.proof) console.log(`   proof tier ${vow.proof.tier}, date ${vow.proof.date}, url ${vow.proof.url}`);
if (EXPECT_TIER) {
  const got = vow.proof?.tier ?? "none";
  evidence.expectTier = { expected: EXPECT_TIER, got, pass: got === EXPECT_TIER };
  console.log(`   expected proof tier ${EXPECT_TIER}: ${got === EXPECT_TIER ? "PASS" : "FAIL (got " + got + ")"}`);
}
if (STATE[vow.state] !== "REVIEW") console.log(`   (the verdict was final at once: ${STATE[vow.state]})`);

if (STATE[vow.state] === "REVIEW") {
  console.log("\n5. waiting for the review window to end");
  await waitUntil(vow.review_end + 10, "the end of the review window");
  console.log("\n6. finalize");
  await send(keeper, "finalize", [id], 0n, { tries: 3, pause: 75 });
}
vow = await read("get_vow", [id]);
stage("final", vow);
console.log(`   final state: ${STATE[vow.state]}`);
evidence.finalState = STATE[vow.state];
const wanted = SCENARIO === "kept" ? "KEPT" : "BROKEN";
evidence.finalAsExpected = STATE[vow.state] === wanted;
if (!evidence.finalAsExpected) console.log(`   NOTE: SCENARIO is ${SCENARIO} but the vow ended ${STATE[vow.state]}. The run is recorded as it happened.`);

console.log("\n7. claims (native GEN)");
for (const who of [keeper, faith, doubt]) {
  const pos = await read("position_of", [id, who.address]);
  const expected = BigInt(pos.payout);
  const entry = { account: who.name, address: who.address, expectedPayout: expected.toString() };
  if (expected === 0n) {
    entry.note = "nothing to claim for this account";
    evidence.claims.push(entry);
    console.log(`  ${who.name}: nothing to claim`);
    continue;
  }
  const before = await balanceOf(who.address);
  const step = await send(who, "claim", [id]);
  await untilFinal(who, step);
  let after = before;
  for (let i = 0; i < 100 && after <= before; i++) {
    after = await balanceOf(who.address);
    if (after <= before) await sleep(3000);
  }
  const delta = after - before;
  const posAfter = await read("position_of", [id, who.address]);
  Object.assign(entry, {
    claimTx: step.hash,
    balanceBefore: before.toString(),
    balanceAfter: after.toString(),
    delta: delta.toString(),
    received: delta > 0n,
    exact: delta === expected,
    claimedFlag: posAfter.claimed,
  });
  evidence.claims.push(entry);
  console.log(`  ${who.name}: expected ${fmt(expected)}, balance ${fmt(before)} -> ${fmt(after)} (change ${fmt(delta)}), claimed=${posAfter.claimed}`);
}

evidence.statsAfter = await read("stats", []);
const end = { keeper: await balanceOf(keeper.address), faith: await balanceOf(faith.address), doubt: await balanceOf(doubt.address) };
evidence.balancesEnd = Object.fromEntries(Object.entries(end).map(([k, v]) => [k, v.toString()]));
evidence.finishedAt = new Date().toISOString();
evidence.steps = steps;
const paidOut = evidence.claims.filter((c) => c.received).length;
evidence.summary = {
  adjudicated: ["REVIEW", "KEPT", "BROKEN", "UNCLEAR"].includes(evidence.stages.find((s) => s.name === "judged")?.vow?.state),
  reviewedAndFinalized: ["KEPT", "BROKEN", "UNCLEAR"].includes(evidence.finalState),
  nativePayouts: paidOut,
  allPayoutsExact: evidence.claims.filter((c) => c.expectedPayout !== "0").every((c) => c.exact),
  allTransactionsSucceeded: steps.every((s) => s.ok),
};

// ---- write the evidence -------------------------------------------------------------------------------------

const dir = new URL("../../evidence/", import.meta.url);
mkdirSync(dir, { recursive: true });
const stamp = evidence.startedAt.replace(/[:.]/g, "-").slice(0, 19);
const base = `studionet-e2e-${SCENARIO}-${stamp}`;
writeFileSync(new URL(`${base}.json`, dir), JSON.stringify(evidence, replacer, 2));

const md = [];
md.push(`# Lumen end-to-end on Studionet (${SCENARIO})`, "");
md.push(`- Contract: \`${CONTRACT}\``, `- Vow: #${id}, evidence \`${EVIDENCE_URL}\`${PIN_URL ? `, pinned \`${PIN_URL}\`` : ""}`);
md.push(`- Run: ${evidence.startedAt} to ${evidence.finishedAt}`, `- Final state: **${evidence.finalState}**`, "");
if (evidence.pinPreflight) md.push(`- Archive check of the pin before the run: ${evidence.pinPreflight.confirmed ? "confirmed" : "not confirmed (" + evidence.pinPreflight.why + ")"}`);
if (evidence.expectTier) md.push(`- Expected proof tier \`${evidence.expectTier.expected}\`: ${evidence.expectTier.pass ? "PASS" : "FAIL"} (got \`${evidence.expectTier.got}\`)`);
md.push("", "## Transactions", "", "| # | call | by | value | hash | decision | execution | finalized |", "|---|---|---|---|---|---|---|---|");
for (const s of steps) md.push(`| ${s.n} | \`${s.fn}\` | ${s.caller} | ${fmt(s.value)} | \`${s.hash}\` | ${s.status} | ${s.execution} | ${s.finalized?.status ?? "-"} |`);
md.push("", "## Vow after each stage", "", "| stage | state | proposed | proof tier | note |", "|---|---|---|---|---|");
for (const s of evidence.stages) md.push(`| ${s.name} | ${s.vow?.state ?? "-"} | ${s.vow?.proposed ?? "-"} | ${s.vow?.proof?.tier ?? "-"} | ${(s.vow?.note ?? "").replace(/\|/g, "/")} |`);
md.push("", "## Native GEN payouts", "", "| account | expected | balance before | balance after | change | claim tx |", "|---|---|---|---|---|---|");
for (const c of evidence.claims) md.push(c.claimTx ? `| ${c.account} | ${fmt(c.expectedPayout)} | ${fmt(c.balanceBefore)} | ${fmt(c.balanceAfter)} | ${fmt(c.delta)} | \`${c.claimTx}\` |` : `| ${c.account} | ${fmt(c.expectedPayout)} | - | - | - | ${c.note} |`);
md.push("", `Contract totals after the run: deposited ${fmt(evidence.statsAfter.deposited)}, paid ${fmt(evidence.statsAfter.paid)}, burned (embers) ${fmt(evidence.statsAfter.embers)}.`, "");
md.push("The balance change can differ from the expected payout by the protocol fees the network charges the claimant; the contract's own `paid` total records the exact payout.", "");
writeFileSync(new URL(`${base}.md`, dir), md.join("\n"));

console.log(`\nEvidence written to evidence/${base}.json and .md`);
console.log("summary:", JSON.stringify(evidence.summary));
process.exit(evidence.summary.allTransactionsSucceeded && evidence.summary.reviewedAndFinalized ? 0 : 1);
