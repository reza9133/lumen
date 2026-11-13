// Live end-to-end run of Lumen v2 on Studionet.
//
//   cd e2e && npm ci && npm run live
//
// What it does: checks that the evidence pages are online, creates and funds accounts, deploys a fresh contract
// (or uses LUMEN_ADDRESS), runs the scenarios (adversarial, kept, broken, retract, directory) with real transactions,
// and writes REPORT.md, report.json and transactions.csv to evidence/live-e2e/<UTC time>/.
// Set E2E_COMMIT=1 to commit that folder, E2E_COMMIT=push to commit and push it. See docs/TESTING.md.
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installThrottle } from "./throttle.mjs";
import { Lumen, Network, RPC_URL, deploy, ensureFunded, loadAccounts, sleep } from "./chain.mjs";
import { readConfig } from "./config.mjs";
import { fmt } from "./oracle.mjs";
import { Recorder, stamp } from "./report.mjs";
import { contractVersion, runScenarios } from "./run.mjs";
import { rolesFor } from "./scenarios.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const die = (m) => {
  console.error(`\n${m}`);
  process.exit(1);
};
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

if (Number(process.versions.node.split(".")[0]) < 22) die(`Node 22 or newer is needed (this is ${process.version}).`);
let cfg;
try {
  cfg = readConfig(process.env, root);
} catch (e) {
  die(e.message);
}
if (!cfg.fixtures?.base) die("Could not work out where the evidence pages are served from. Run this inside a clone of your GitHub repository, or set E2E_FIXTURE_BASE.");

// ---- 1. the evidence pages have to be online -------------------------------------------------------------------

const EXPECT = { "kept.md": "was published on 2026-01-15", "broken.md": "has not been written", "counter.md": "has no release 2.0.0 entry" };
console.log("1. Checking the evidence pages (the validators fetch them from the internet)");
for (const [file, marker] of Object.entries(EXPECT)) {
  const url = `${cfg.fixtures.base}/${file}`;
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    die(`Could not fetch ${url}: ${e.message}`);
  }
  const body = res.ok ? await res.text() : "";
  if (!res.ok) die(`${url} answered HTTP ${res.status}. Push evidence/fixtures/ to GitHub first (git add evidence/fixtures && git commit && git push), or set E2E_FIXTURE_BASE.`);
  if (!body.includes(marker)) die(`${url} does not contain the expected sentence "${marker}". Is the pushed copy different from evidence/fixtures/${file}?`);
  console.log(`   ok ${url}`);
}
if (cfg.fixtures.permalinkBase) {
  const url = `${cfg.fixtures.permalinkBase}/kept.md`;
  const res = await fetch(url).catch(() => null);
  if (res?.ok) console.log(`   ok ${url}`);
  else {
    console.log(`   The pinned link ${url} is not online (commit ${cfg.fixtures.sha?.slice(0, 7)} is not on GitHub yet). The run goes on without pinning.`);
    cfg.fixtures.permalinkBase = "";
  }
}

// The RPC allows 30 requests a minute; keep below that for every call this process makes to it.
installThrottle(RPC_URL, cfg.rpcPerMinute);

// ---- 2. network, accounts, funding -----------------------------------------------------------------------------

const net = new Network();
console.log("\n2. Connecting to Studionet");
try {
  await net.rpc("eth_chainId", []);
} catch (e) {
  die(`The Studionet RPC (${net.rpcUrl}) cannot be reached: ${e.message}`);
}
const offset = await net.syncClock();
console.log(`   rpc ${net.rpcUrl}, network clock differs from this machine by ${offset}s`);

const version = contractVersion(join(root, "contracts", "lumen.py"));
const rec = new Recorder({ mode: "live", network: `Studionet (${net.rpcUrl})`, fixtures: cfg.fixtures });
rec.meta.git = { commit: (() => { try { return git("rev-parse", "HEAD"); } catch { return ""; } })() };
rec.meta.config = { scenarios: cfg.scenarios, deadlineSecs: cfg.deadlineSecs, stake: cfg.stake.toString(), faith: cfg.faith.toString(), doubt: cfg.doubt.toString() };

const names = rolesFor(cfg.scenarios);
const accountsFile = cfg.accountsFile || join(root, "e2e", ".accounts.json");
const actors = loadAccounts(names, { file: accountsFile, keys: cfg.keys });
console.log(`\n3. Accounts (${names.length}), keys kept in ${relative(root, accountsFile)} (not committed)`);
let funding;
try {
  funding = await ensureFunded(net, actors, { default: cfg.fundGen }, { waitSecs: cfg.fundWaitSecs });
} catch (e) {
  die(e.message);
}
rec.table("Accounts", ["role", "address", "funding", "balance at start"], funding.map((f) => [f.name, f.address, f.how, fmt(f.balance)]));
for (const f of funding) console.log(`   ${f.name.padEnd(10)} ${f.address} ${fmt(f.balance)} (${f.how})`);

// ---- 4. the contract -------------------------------------------------------------------------------------------

let address = cfg.address;
if (address) console.log(`\n4. Using the contract at ${address}`);
else {
  console.log(`\n4. Deploying contracts/lumen.py (version ${version})`);
  const d = await deploy(net, actors.deployer, join(root, "contracts", "lumen.py"), rec);
  address = d.address;
  rec.meta.deployTx = d.hash;
  console.log(`   deployed at ${address} (tx ${d.hash})`);
}
rec.meta.contract = address;
const lumen = new Lumen(net, address, rec);
let params;
for (let i = 0; i < 40; i++) {
  try {
    params = await lumen.read("params");
    break;
  } catch (e) {
    if (i === 39) die(`The contract at ${address} does not answer params(): ${e.message}. It is not a Lumen v2 contract.`);
    await sleep(3000);
  }
}
if (params.version !== version) die(`The contract at ${address} is version ${params.version}, this repository holds ${version}. Deploy the current contract (unset LUMEN_ADDRESS).`);
rec.check("deploy", "the deployed contract is the version in this repository", true, `version ${params.version}`, "behavior");
rec.scenario("deploy", "PASS", cfg.address ? "existing contract used" : `deployed in tx ${rec.meta.deployTx}`);

// ---- 5. the scenarios ------------------------------------------------------------------------------------------

console.log(`\n5. Scenarios: ${cfg.scenarios.join(", ")}. The vows run side by side; the longest wait is a review window of 10 to 20 minutes.`);
let interrupted = false;
process.on("SIGINT", () => {
  interrupted = true;
  rec.note("The run was interrupted by the user before it finished.");
  finish(1);
});
process.on("unhandledRejection", (e) => {
  rec.note(`Stopped by an unexpected error: ${String(e?.stack ?? e).slice(0, 400)}`);
  finish(1);
});

function finish(code) {
  for (const [n, s] of Object.entries(rec.scenarios)) if (s.status === "RUNNING") rec.scenario(n, "INTERRUPTED", "did not finish");
  rec.settleDeferred(lumen.reasonsSeen > 0);
  const dir = cfg.outDir ? resolve(cfg.outDir) : join(root, "evidence", "live-e2e", stamp(new Date(rec.meta.startedAt)));
  rec.write(dir);
  const rel = relative(root, dir);
  console.log(`\n${rec.verdictLine()}`);
  console.log(`Report written to ${rel}/ (REPORT.md, report.json, transactions.csv)`);
  if (cfg.commit && !interrupted) {
    try {
      git("add", rel);
      git("commit", "-m", `Add live end-to-end report ${stamp(new Date(rec.meta.startedAt))}`);
      console.log("Committed.");
      if (cfg.push) {
        git("push");
        console.log("Pushed.");
      }
    } catch (e) {
      console.log(`Could not commit or push: ${String(e.stderr || e.message).trim().slice(0, 300)}`);
    }
  }
  if (!cfg.commit) console.log(`\nTo publish it:\n  git add ${rel} && git commit -m "Add live end-to-end report" && git push\n(or run again with E2E_COMMIT=push)`);
  if (rec.meta.contract) console.log(`\nContract: ${rec.meta.contract}\nTo point the frontend at it: echo VITE_LUMEN_ADDRESS=${rec.meta.contract} > frontend/.env`);
  process.exit(code ?? rec.exitCode());
}

await runScenarios({ net, lumen, rec, cfg, actors, concurrent: true, version });
finish(rec.exitCode());
