// Offline rehearsal of the live runner against the REAL contract code (direct mode, mocked web and validators).
// It proves that the scenarios, the oracle and the report writer work together. It says nothing about Studionet,
// and its report is labelled accordingly. Output goes to a temporary folder, never to evidence/.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAccounts } from "./chain.mjs";
import { readConfig } from "./config.mjs";
import { Bridge, FakeLumen, FakeNet } from "./fake.mjs";
import { gen } from "./oracle.mjs";
import { Recorder } from "./report.mjs";
import { contractVersion, runScenarios } from "./run.mjs";
import { ROLES, rolesFor } from "./scenarios.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cfg = readConfig({ ...process.env, E2E_FIXTURE_BASE: "https://raw.githubusercontent.com/example/lumen/main/evidence/fixtures", E2E_FUND_GEN: "1" }, root);
cfg.fixtures = { base: "https://raw.githubusercontent.com/example/lumen/main/evidence/fixtures", permalinkBase: `https://github.com/example/lumen/blob/${"a".repeat(40)}/evidence/fixtures` };
cfg.deadlineSecs = 300;
const rec = new Recorder({ mode: "selfcheck", network: "rehearsal (contract in direct mode, mocked web and validators)", fixtures: cfg.fixtures });

const bridge = new Bridge(root);
await bridge.ready().catch(() => {});
const net = new FakeNet();
const lumen = new FakeLumen(net, rec, bridge);
rec.meta.contract = "contracts/lumen.py";
const names = rolesFor(cfg.scenarios);
const actors = loadAccounts(names.length ? names : ROLES);
for (const a of Object.values(actors)) net.credit(a.address, gen("5"));

let w;
try {
  w = await runScenarios({ net, lumen, rec, cfg, actors, concurrent: false, version: contractVersion(join(root, "contracts", "lumen.py")) });
} finally {
  await bridge.close();
}
const out = process.env.E2E_OUT_DIR || mkdtempSync(join(tmpdir(), "lumen-selfcheck-"));
rec.write(out);
const failed = rec.failures;
console.log(`\nSELF-CHECK (not a live run): ${rec.checks.length - failed.length} of ${rec.checks.length} checks passed.`);
for (const f of failed) console.log(`  FAIL [${f.scenario}] ${f.name}: ${f.detail}`);
console.log(`report: ${join(out, "REPORT.md")}`);
process.exit(failed.length ? 1 : 0);
