import assert from "node:assert/strict";
import test from "node:test";
import { SCENARIOS, fixtureSource, parseRemote, readConfig } from "../src/config.mjs";

test("remotes in the usual spellings", () => {
  assert.deepEqual(parseRemote("git@github.com:me/lumen.git"), { owner: "me", repo: "lumen" });
  assert.deepEqual(parseRemote("https://github.com/me/lumen"), { owner: "me", repo: "lumen" });
  assert.deepEqual(parseRemote("https://github.com/me/lumen.git/"), { owner: "me", repo: "lumen" });
  assert.equal(parseRemote("https://example.org/me/lumen"), null);
});

test("fixtures come from the repository on GitHub and are pinned to a commit", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const f = fixtureSource({ GITHUB_REPOSITORY: "me/lumen", E2E_FIXTURE_BRANCH: "main", E2E_FIXTURE_SHA: sha }, "/nonexistent");
  assert.equal(f.base, "https://raw.githubusercontent.com/me/lumen/main/evidence/fixtures");
  assert.equal(f.permalinkBase, `https://github.com/me/lumen/blob/${sha}/evidence/fixtures`);
});

test("an override replaces the derived address", () => {
  const f = fixtureSource({ E2E_FIXTURE_BASE: "https://example.org/pages/" }, "/nonexistent");
  assert.equal(f.base, "https://example.org/pages");
  assert.equal(f.permalinkBase, "");
});

test("scenario selection is validated and ordered", () => {
  assert.deepEqual(readConfig({ E2E_SCENARIOS: "retract,kept" }, "/nonexistent").scenarios, ["kept", "retract"]);
  assert.deepEqual(readConfig({}, "/nonexistent").scenarios, SCENARIOS);
  assert.throws(() => readConfig({ E2E_SCENARIOS: "kept,nope" }, "/nonexistent"), /Unknown scenario nope/);
});

test("numbers are validated", () => {
  assert.throws(() => readConfig({ E2E_DEADLINE_SECS: "10" }, "/nonexistent"), /E2E_DEADLINE_SECS/);
  assert.throws(() => readConfig({ E2E_STAKE_GEN: "lots" }, "/nonexistent"));
  assert.equal(readConfig({ E2E_STAKE_GEN: "0.25" }, "/nonexistent").stake, 250000000000000000n);
});
