import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { STATE, TIERS, burned, fmt, gen, owed, provenance, standing } from "../src/oracle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contract = readFileSync(join(root, "contracts", "lumen.py"), "utf8");
const G = 10n ** 18n;

test("the tiers equal the contract's table", () => {
  const block = /TIERS = \(([\s\S]*?)\n\)/.exec(contract)[1];
  const rows = [...block.matchAll(/\("(\w+)", (\d+), ([^,]+), (\d+)\)/g)].map((m) => ({
    name: m[1],
    kept: Number(m[2]),
    keptStake: BigInt(eval(m[3].replace(/\*\*/g, "**"))), // forms such as 20 * 10**18
    brokenDiv: Number(m[4]),
  }));
  assert.equal(rows.length, TIERS.length);
  rows.forEach((r, i) => assert.deepEqual(r, TIERS[i]));
});

test("the state codes equal the contract's", () => {
  const m = /^OPEN, KEPT, BROKEN, UNCLEAR, REVIEW, RETRACTED = (.*)$/m.exec(contract);
  assert.equal(m[1].trim(), "0, 1, 2, 3, 4, 5");
  assert.deepEqual(Object.values(STATE), [0, 1, 2, 3, 5 - 1 + 0, 5].slice(0, 4).concat([4, 5]));
});

test("kept: the keeper gets the stake back, faith backers their share of the doubt pool", () => {
  const base = { state: STATE.KEPT, stake: 4n * G, faith: 2n * G, doubt: 3n * G };
  assert.equal(owed({ ...base, isKeeper: true }), 4n * G);
  assert.equal(owed({ ...base, isKeeper: false, faithOf: 1n * G }), 1n * G + (3n * G * 1n * G) / (2n * G));
  assert.equal(owed({ ...base, isKeeper: false, doubtOf: 3n * G }), 0n);
});

test("kept without faith backers: the keeper takes the doubt pool", () => {
  assert.equal(owed({ state: STATE.KEPT, isKeeper: true, stake: G, faith: 0n, doubt: G / 4n }), G + G / 4n);
});

test("broken: doubters share half the stake and the faith pool; with no doubters everything burns", () => {
  const base = { state: STATE.BROKEN, stake: 4n * G, faith: 1n * G, doubt: 2n * G };
  assert.equal(owed({ ...base, isKeeper: false, doubtOf: 2n * G }), 2n * G + 3n * G);
  assert.equal(owed({ ...base, isKeeper: true }), 0n);
  assert.equal(burned(base), 2n * G);
  assert.equal(burned({ state: STATE.BROKEN, stake: 4n * G, faith: G, doubt: 0n }), 5n * G);
});

test("unclear refunds everyone; retracted refunds the keeper four fifths", () => {
  assert.equal(owed({ state: STATE.UNCLEAR, isKeeper: true, stake: 3n * G, faith: G, doubt: G }), 3n * G);
  assert.equal(owed({ state: STATE.UNCLEAR, isKeeper: false, faithOf: G / 2n, stake: 3n * G, faith: G, doubt: 0n }), G / 2n);
  assert.equal(owed({ state: STATE.RETRACTED, isKeeper: true, stake: 5n * G, faith: 0n, doubt: 0n }), 4n * G);
  assert.equal(burned({ state: STATE.RETRACTED, stake: 5n * G, faith: 0n, doubt: 0n }), G);
});

test("every wei is paid or burned, up to rounding, for random positions", () => {
  let seed = 7n;
  const next = (n) => ((seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 63n)), (seed >> 11n) % n);
  for (let round = 0; round < 500; round++) {
    const stake = 1n + next(10n ** 20n);
    const faiths = [next(stake / 2n / 3n + 1n), next(stake / 2n / 3n + 1n)];
    const doubts = [next(10n ** 19n), next(10n ** 19n)];
    const faith = faiths[0] + faiths[1];
    const doubt = doubts[0] + doubts[1];
    for (const state of [STATE.KEPT, STATE.BROKEN, STATE.UNCLEAR]) {
      const parts = [owed({ state, isKeeper: true, stake, faith, doubt })];
      faiths.forEach((f) => parts.push(owed({ state, isKeeper: false, faithOf: f, stake, faith, doubt })));
      doubts.forEach((d) => parts.push(owed({ state, isKeeper: false, doubtOf: d, stake, faith, doubt })));
      const left = stake + faith + doubt - parts.reduce((a, b) => a + b, 0n) - burned({ state, stake, faith, doubt });
      assert.ok(left >= 0n && left <= 4n, `state ${state}: ${left} wei left over`);
    }
  }
});

test("standing follows the table", () => {
  assert.equal(standing(0, 0, 0n), "Unlit");
  assert.equal(standing(1, 0, 0n), "Spark");
  assert.equal(standing(3, 0, G), "Flame");
  assert.equal(standing(7, 1, 5n * G), "Beacon");
  assert.equal(standing(7, 2, 5n * G), "Flame");
  assert.equal(standing(15, 1, 20n * G), "Constellation");
});

test("provenance follows the shape of the address", () => {
  assert.equal(provenance("https://raw.githubusercontent.com/a/b/main/x.md"), "mutable");
  assert.equal(provenance(`https://github.com/a/b/blob/${"c".repeat(40)}/x.md`), "permalink");
  assert.equal(provenance(`https://github.com/a/b/blob/main/x.md`), "mutable");
  assert.equal(provenance("https://web.archive.org/web/20250101000000/https://example.org/"), "snapshot");
});

test("amounts are exact", () => {
  assert.equal(gen("0.1"), 10n ** 17n);
  assert.equal(gen("3"), 3n * G);
  assert.equal(gen("0.000000000000000001"), 1n);
  assert.throws(() => gen("1e3"));
  assert.equal(fmt(1_250_000_000_000_000_000n), "1.25 GEN");
  assert.equal(fmt(0n), "0 GEN");
});
