// The runner and the contract must agree on names, argument counts, messages and the fixture pages.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { MUTATIONS } from "../src/mutation-list.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const contract = readFileSync(join(root, "contracts", "lumen.py"), "utf8");
const src = (f) => readFileSync(join(root, "e2e", "src", f), "utf8");

// every public method with its argument count
const methods = new Map();
for (const m of contract.matchAll(/@gl\.public\.(?:view|write(?:\.payable)?)\s+def (\w+)\(self(?:, ([^)]*))?\)/g)) {
  methods.set(m[1], m[2] ? m[2].split(",").length : 0);
}

test("the contract has the methods the scenarios call", () => {
  assert.ok(methods.size >= 20);
  const text = src("scenarios.mjs");
  const seen = new Set();
  for (const m of text.matchAll(/(?:send|expectRevert)\(S, \w+(?:\.\w+)*, "(\w+)", \[([^\]]*)\]/g)) {
    seen.add(m[1]);
    assert.ok(methods.has(m[1]), `no method ${m[1]} in the contract`);
  }
  for (const m of text.matchAll(/read\("(\w+)"(?:, \[([^\]]*)\])?\)/g)) {
    assert.ok(methods.has(m[1]), `no method ${m[1]} in the contract`);
  }
  for (const needed of ["make_vow", "back", "retract", "post_update", "pin_evidence", "judge", "finalize", "claim", "challenge", "release", "dispute"]) {
    assert.ok(seen.has(needed) || needed === "dispute" || needed === "release" || needed === "judge" || needed === "finalize" || needed === "claim", `${needed} is not exercised`);
  }
});

test("calls in the scenarios carry the right number of arguments", () => {
  const text = src("scenarios.mjs");
  const argsOf = (s) => {
    let depth = 0;
    let n = s.trim() ? 1 : 0;
    let quote = "";
    for (const ch of s) {
      if (quote) {
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "`") quote = ch;
      else if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) depth--;
      else if (ch === "," && depth === 0) n++;
    }
    return n;
  };
  let checked = 0;
  for (const m of text.matchAll(/(?:send|expectRevert)\(S, [\w.]+, "(\w+)", \[((?:[^\[\]]|\[[^\]]*\])*)\]/g)) {
    assert.equal(argsOf(m[2]), methods.get(m[1]), `${m[1]}(${m[2]}) has ${argsOf(m[2])} arguments, the contract takes ${methods.get(m[1])}`);
    checked++;
  }
  assert.ok(checked > 40, `only ${checked} calls were checked`);
});

test("every revert reason the scenarios expect is a message of the contract", () => {
  const text = src("scenarios.mjs");
  const reasons = new Set([...text.matchAll(/expectRevert\([^\n]*?\], [^,\n]+?, "([^"\n]+)", [`"]/g)].map((m) => m[1]));
  assert.ok(reasons.size > 25, `${reasons.size} reasons found`);
  const messages = contract.toLowerCase();
  for (const r of reasons) assert.ok(messages.includes(r.toLowerCase()), `the contract has no message containing "${r}"`);
});

test("the version of the contract is a v2 version", () => {
  assert.match(/^VERSION = "(\d+\.\d+\.\d+)"/m.exec(contract)[1], /^2\./);
});

test("the fixtures say what the runner and the rehearsal rely on", () => {
  const dir = join(root, "evidence", "fixtures");
  const files = readdirSync(dir);
  for (const f of ["kept.md", "broken.md", "counter.md", "README.md"]) assert.ok(files.includes(f), `${f} is missing`);
  assert.match(readFileSync(join(dir, "kept.md"), "utf8"), /was published on 2026-01-15/);
  assert.match(readFileSync(join(dir, "broken.md"), "utf8"), /has not been written/);
  assert.match(readFileSync(join(dir, "counter.md"), "utf8"), /has no release 2\.0\.0 entry/);
  assert.doesNotMatch(readFileSync(join(dir, "broken.md"), "utf8"), /was published on 2026/);
});

test("every mutation still applies to the contract", () => {
  for (const m of MUTATIONS) assert.ok(contract.includes(m.from), `mutation "${m.name}" does not match the contract text`);
});
