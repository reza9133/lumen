import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Recorder } from "../src/report.mjs";

const quiet = () => {};
function sample(mode = "live") {
  const r = new Recorder({ mode, network: "n", contract: "0x1", logFn: quiet });
  r.steps.push({ n: 1, scenario: "kept", fn: "make_vow", caller: "k", address: "0xa", value: "100", hash: "0xh", status: "ACCEPTED", execution: "FINISHED_WITH_RETURN", ok: true, attempt: 1, seconds: 3 });
  return r;
}

test("a run where everything held exits 0", () => {
  const r = sample();
  r.scenario("kept", "PASS", "ok");
  r.check("kept", "x", true, "", "invariant");
  assert.equal(r.exitCode(), 0);
});

test("a failed invariant or behavior exits 1, a differing model verdict alone exits 2", () => {
  const a = sample();
  a.check("kept", "money", false, "wrong", "invariant");
  assert.equal(a.exitCode(), 1);
  const b = sample();
  b.check("kept", "verdict", false, "model said broken", "verdict");
  assert.equal(b.exitCode(), 2);
  const c = sample();
  c.check("kept", "verdict", false, "", "verdict");
  c.check("kept", "rule", false, "", "behavior");
  assert.equal(c.exitCode(), 1);
});

test("a warning does not fail the run", () => {
  const r = sample();
  r.check("a", "x", false, "d", "behavior", "warn");
  assert.equal(r.exitCode(), 0);
});

test("a scenario that errored fails the run", () => {
  const r = sample();
  r.scenario("kept", "ERROR", "boom");
  assert.equal(r.exitCode(), 1);
});

test("reason checks fail only when the network shows reasons", () => {
  const shown = sample();
  shown.check("a", 'x: reason is "y"', false, "no", "behavior", "defer");
  shown.settleDeferred(true);
  assert.equal(shown.exitCode(), 1);
  const hidden = sample();
  hidden.check("a", 'x: reason is "y"', false, "no", "behavior", "defer");
  hidden.settleDeferred(false);
  assert.equal(hidden.exitCode(), 0);
  assert.match(hidden.markdown(), /did not show the reason/);
});

test("a self-check report says it is not a live run", () => {
  const md = sample("selfcheck").markdown();
  assert.match(md, /SELF-CHECK \(not a live run\)/);
  assert.match(md, /records \*\*nothing about the real Studionet\*\*/);
  assert.doesNotMatch(sample("live").markdown(), /SELF-CHECK/);
});

test("the three files are written and agree", () => {
  const r = sample();
  r.scenario("kept", "PASS", "fine | with a pipe");
  r.check("kept", "name | pipe", true, "d", "invariant");
  r.table("T", ["a", "b"], [["1", "2"]]);
  const dir = mkdtempSync(join(tmpdir(), "lumen-report-"));
  r.write(dir);
  const md = readFileSync(join(dir, "REPORT.md"), "utf8");
  const json = JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));
  const csv = readFileSync(join(dir, "transactions.csv"), "utf8").trim().split("\n");
  assert.match(md, /\| kept \| PASS \| fine \/ with a pipe \|/);
  assert.equal(json.checks.length, 1);
  assert.equal(json.steps.length, 1);
  assert.equal(csv.length, 2);
  assert.ok(json.meta.finishedAt);
});
