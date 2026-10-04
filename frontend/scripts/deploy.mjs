// Deploys contracts/lumen.py to Studionet and writes the address into frontend/.env
// Usage: DEPLOY_KEY=0x... npm run deploy
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import * as sdk from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const key = process.env.DEPLOY_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error("Set DEPLOY_KEY to the private key (0x...) of an account funded on Studionet.");
  process.exit(1);
}

const account = sdk.createAccount(key);
const client = sdk.createClient({ chain: studionet, account });
const code = new Uint8Array(readFileSync(new URL("../../contracts/lumen.py", import.meta.url)));

let fees;
if (typeof client.estimateTransactionFees === "function") {
  try {
    const e = await client.estimateTransactionFees({
      leaderTimeunitsAllocation: 125n,
      validatorTimeunitsAllocation: 250n,
      executionBudgetPerRound: 800000n,
      totalMessageFees: 0n,
      appealRounds: 1n,
      rotations: [1n, 1n],
    });
    if (e?.distribution && !e.gasless) fees = { distribution: e.distribution, feeValue: e.feeValue };
  } catch {
    // this network does not charge protocol fees
  }
}

console.log(`Deploying from ${account.address} ...`);
const hash = await client.deployContract({ code, args: [], ...(fees ? { fees } : {}) });
const opts = { hash, retries: 200, interval: 3000 };
const receipt =
  typeof client.waitForDecision === "function"
    ? await client.waitForDecision(opts)
    : await client.waitForTransactionReceipt({ ...opts, status: "ACCEPTED" });

const ok = sdk.isSuccessful ? sdk.isSuccessful(receipt) : !String(receipt?.txExecutionResultName ?? "").includes("ERROR");
if (!ok) {
  console.error("Deployment was decided as", receipt?.txExecutionResultName ?? receipt?.statusName);
  process.exit(1);
}

const address =
  receipt?.txDataDecoded?.contractAddress ?? receipt?.data?.contract_address ?? receipt?.recipient ?? receipt?.to_address;
if (!address) {
  console.error("Deployed, but the address could not be read from the receipt. Find it in the explorer for tx", hash);
  process.exit(1);
}

const envPath = new URL("../.env", import.meta.url);
const line = `VITE_LUMEN_ADDRESS=${address}`;
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const next = /^VITE_LUMEN_ADDRESS=.*$/m.test(current) ? current.replace(/^VITE_LUMEN_ADDRESS=.*$/m, line) : `${current}${current.endsWith("\n") || !current ? "" : "\n"}${line}\n`;
writeFileSync(envPath, next);
console.log("Contract:", address);
console.log("Saved to frontend/.env");
