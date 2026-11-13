// Settings of a run, read from the environment. Kept free of network access so it can be tested.
import { execFileSync } from "node:child_process";
import { gen } from "./oracle.mjs";

export const SCENARIOS = ["adversarial", "kept", "broken", "retract", "directory"];

function git(args, cwd) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** owner/repo from a remote url such as git@github.com:me/lumen.git or https://github.com/me/lumen.git */
export function parseRemote(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Where the evidence fixtures are served from. A live run needs pages the validators can fetch from the internet,
 * so the fixtures are read from this repository on GitHub. The permalink is pinned to a commit that holds them.
 */
export function fixtureSource(env = process.env, cwd = process.cwd()) {
  let slug = env.GITHUB_REPOSITORY ? { owner: env.GITHUB_REPOSITORY.split("/")[0], repo: env.GITHUB_REPOSITORY.split("/")[1] } : null;
  slug ??= parseRemote(git(["remote", "get-url", "origin"], cwd));
  const local = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const branch = env.E2E_FIXTURE_BRANCH || (local && local !== "HEAD" ? local : "") || env.GITHUB_REF_NAME || "main";
  const sha = env.E2E_FIXTURE_SHA || git(["rev-parse", "HEAD"], cwd);
  const override = (env.E2E_FIXTURE_BASE || "").replace(/\/+$/, "");
  if (override) return { base: override, permalinkBase: env.E2E_FIXTURE_PERMALINK_BASE?.replace(/\/+$/, "") || "", slug, branch, sha };
  if (!slug) return null;
  return {
    base: `https://raw.githubusercontent.com/${slug.owner}/${slug.repo}/${branch}/evidence/fixtures`,
    permalinkBase: /^[0-9a-f]{40}$/.test(sha) ? `https://github.com/${slug.owner}/${slug.repo}/blob/${sha}/evidence/fixtures` : "",
    slug,
    branch,
    sha,
  };
}

export function readConfig(env = process.env, cwd = process.cwd()) {
  const list = (env.E2E_SCENARIOS || SCENARIOS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((s) => !SCENARIOS.includes(s));
  if (bad.length) throw new Error(`Unknown scenario ${bad.join(", ")}. Choose from ${SCENARIOS.join(", ")}.`);
  const int = (k, d, lo, hi) => {
    const v = Number(env[k] ?? d);
    if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${k} must be a whole number from ${lo} to ${hi}.`);
    return v;
  };
  return {
    scenarios: SCENARIOS.filter((s) => list.includes(s)),
    address: env.LUMEN_ADDRESS || "",
    deadlineSecs: int("E2E_DEADLINE_SECS", 900, 60, 3600),
    rpcPerMinute: int("E2E_RPC_PER_MIN", 24, 1, 600),
    pollSecs: int("E2E_POLL_SECS", 15, 1, 120),
    fundGen: gen(env.E2E_FUND_GEN || "1"),
    stake: gen(env.E2E_STAKE_GEN || "0.4"),
    faith: gen(env.E2E_FAITH_GEN || "0.1"),
    doubt: gen(env.E2E_DOUBT_GEN || "0.06"),
    fundWaitSecs: int("E2E_FUND_WAIT_SECS", 600, 0, 7200),
    accountsFile: env.E2E_ACCOUNTS_FILE || "",
    keys: env.E2E_KEYS || "", // optional comma separated private keys of funded accounts, used in this order
    fixtures: fixtureSource(env, cwd),
    outDir: env.E2E_OUT_DIR || "",
    commit: env.E2E_COMMIT === "1" || env.E2E_COMMIT === "push",
    push: env.E2E_COMMIT === "push",
  };
}
