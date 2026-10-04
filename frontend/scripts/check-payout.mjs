// Run with: node --experimental-strip-types scripts/check-payout.mjs   (Node 22.6 or newer)
// The vectors were produced by running `_owed` from contracts/lumen.py, so this keeps the preview in
// the app identical to the contract's payout rules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { owed, preview } from "../src/payout.ts";

const rows = JSON.parse(readFileSync(new URL("./payout-vectors.json", import.meta.url), "utf8"));
for (const [state, keeper, f, d, stake, faith, doubt, want] of rows) {
  const got = owed(state, keeper, BigInt(f), BigInt(d), BigInt(stake), BigInt(faith), BigInt(doubt));
  assert.equal(got.toString(), want, JSON.stringify([state, keeper, f, d, stake, faith, doubt]));
}

const GEN = 10n ** 18n;
const pools = { stake: GEN.toString(), faith: "0", doubt: "0" };
// A first doubter on a fresh vow takes the whole pot if it breaks and loses the backing if it is kept.
let p = preview(pools, { faith: 0n, doubt: 0n }, "doubt", GEN / 10n);
assert.equal(p.put, GEN / 10n);
assert.equal(p.kept, 0n);
assert.equal(p.broken, GEN / 10n + GEN / 2n);
assert.equal(p.unclear, GEN / 10n);
// A first faith backer gets the backing back if kept, nothing if it breaks with nobody doubting.
p = preview(pools, { faith: 0n, doubt: 0n }, "faith", GEN / 10n);
assert.equal(p.kept, GEN / 10n);
assert.equal(p.broken, 0n);
// Backing on top of an existing position counts what the address already has.
p = preview({ stake: GEN.toString(), faith: (GEN / 10n).toString(), doubt: "0" }, { faith: GEN / 10n, doubt: 0n }, "faith", GEN / 10n);
assert.equal(p.put, GEN / 5n);
assert.equal(p.kept, GEN / 5n);
console.log("payout preview ok");
