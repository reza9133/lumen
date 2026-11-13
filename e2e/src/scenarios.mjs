// The scenarios of a live run. Each one drives real transactions through a deployed Lumen contract and records
// what it checked: money rules (invariant), what the contract accepts and rejects (behavior) and what the
// language-model validators decided (verdict).
import { Lumen, sleep } from "./chain.mjs";
import { STATE, STATE_NAME, burned, fmt, owed, provenance, standing } from "./oracle.mjs";

export const ROLES = ["deployer", "keeperK", "faithK", "doubtK", "keeperB", "faithB", "doubtB", "keeperR", "advKeeper", "advBacker"];
const SCENARIO_ROLES = {
  adversarial: ["advKeeper", "advBacker"],
  kept: ["keeperK", "faithK", "doubtK"],
  broken: ["keeperB", "faithB", "doubtB"],
  retract: ["keeperR"],
  directory: [],
};
export const rolesFor = (scenarios) => ["deployer", ...scenarios.flatMap((s) => SCENARIO_ROLES[s])];

export const VOW_TEXT = "Publish the release 2.0.0 entry of the Lumen fixture changelog";
export const FIXTURE_FILES = { kept: "kept.md", broken: "broken.md", counter: "counter.md" };

export function newWorld({ net, lumen, rec, cfg, actors }) {
  return {
    net,
    lumen,
    rec,
    cfg,
    actors,
    fx: cfg.fixtures,
    runId: "r" + Date.now().toString(36),
    ctx: { vows: {}, actions: {}, paid: 0n, burned: 0n, finished: [], profile0: {}, stats0: null, pulse0: null },
    log: (m) => rec.log(m),
  };
}

const nowPlus = (w, secs) => w.net.now() + secs;
const lc = (s) => String(s).toLowerCase();
const sum = (xs) => xs.reduce((a, b) => a + b, 0n);

function did(w, vowId, action) {
  (w.ctx.actions[vowId] ??= []).push(action);
}

async function until(fn, pred, label, { tries = 40, gap = 3000 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (pred(last)) return last;
    await sleep(gap);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function newVow(w, scenario, keeper, { text, url, secs, stake, key = scenario }) {
  const deadline = nowPlus(w, secs);
  await w.lumen.send(scenario, keeper, "make_vow", [text, url, deadline], stake);
  const found = await until(() => w.lumen.read("vows_of", [keeper.address, -1, 5]), (r) => r.rows.some((v) => v.text.startsWith(text.slice(0, 60))), "the new vow to appear");
  const id = found.rows.find((v) => v.text.startsWith(text.slice(0, 60))).id;
  w.ctx.vows[key] = id;
  did(w, id, "made");
  return { id, deadline };
}

const row = (w, id) => w.lumen.read("get_vow", [id]);

async function snapshotProfile(w, actor) {
  w.ctx.profile0[lc(actor.address)] = await w.lumen.read("profile_of", [actor.address]);
}

/** After a vow is final: oracle payouts against the chain, claims, balances, conservation. */
async function settleMoney(w, scenario, id, people) {
  const L = w.lumen;
  const v = await row(w, id);
  const state = v.state;
  const stake = BigInt(v.stake);
  const faith = BigInt(v.faith);
  const doubt = BigInt(v.doubt);
  const burn = burned({ state, stake, faith, doubt });
  const rows = [];
  const owedAll = [];
  let exactChecked = false;
  for (const p of people) {
    const pos = await L.read("position_of", [id, p.actor.address]);
    const expected = owed({ state, isKeeper: p.role === "keeper", faithOf: BigInt(pos.faith), doubtOf: BigInt(pos.doubt), stake, faith, doubt });
    owedAll.push(expected);
    w.rec.check(scenario, `${p.actor.name}: payout matches the independent rules`, BigInt(pos.payout) === expected, `chain ${pos.payout}, rules ${expected} (state ${STATE_NAME[state]})`, "invariant");
    if (expected === 0n) {
      await L.expectRevert(scenario, p.actor, "claim", [id], 0n, "Nothing to claim", `${p.actor.name} claims with nothing owed`);
      rows.push([p.actor.name, p.role, "0", "-", "-", "-", "nothing to claim (rejected)"]);
      continue;
    }
    const before = await w.net.balanceOf(p.actor.address);
    const step = await L.send(scenario, p.actor, "claim", [id]);
    did(w, id, "claimed");
    await L.untilFinal(p.actor, step);
    let after = before;
    for (let i = 0; i < 60 && after <= before; i++) {
      await sleep(2500);
      after = await w.net.balanceOf(p.actor.address);
    }
    const delta = after - before;
    const posAfter = await L.read("position_of", [id, p.actor.address]);
    w.rec.check(scenario, `${p.actor.name}: native GEN arrived after the claim`, delta > 0n && delta <= expected, `expected ${fmt(expected)}, balance change ${fmt(delta)} (transaction fees explain a smaller change)`, "invariant");
    w.rec.check(scenario, `${p.actor.name}: claim is recorded`, posAfter.claimed === true, `claimed=${posAfter.claimed}`, "invariant");
    w.ctx.paid += expected;
    rows.push([p.actor.name, p.role, fmt(expected), fmt(before), fmt(after), fmt(delta), step.hash]);
    if (!exactChecked) {
      exactChecked = true;
      await L.expectRevert(scenario, p.actor, "claim", [id], 0n, "Already claimed", `${p.actor.name} claims twice`);
    }
  }
  const total = stake + faith + doubt;
  const dust = total - sum(owedAll) - burn;
  w.rec.check(scenario, "every wei on the vow is paid or burned (rounding dust only)", dust >= 0n && dust <= 10n, `vow holds ${fmt(total)}; owed ${fmt(sum(owedAll))}; burned ${fmt(burn)}; dust ${dust} wei`, "invariant");
  w.ctx.burned += burn;
  w.ctx.finished.push({ scenario, id, state, burn: burn.toString(), owed: owedAll.map(String) });
  w.rec.table(`Payouts, ${scenario} vow #${id} (${STATE_NAME[state]})`, ["account", "role", "payout by the rules", "balance before", "balance after", "change", "claim tx"], rows);
}

// ---- adversarial: a stream of calls the contract must refuse, then a retraction ------------------------------

export async function adversarial(w) {
  const S = "adversarial";
  const L = w.lumen;
  const K = w.actors.advKeeper;
  const B = w.actors.advBacker;
  const min = BigInt((await L.read("params")).min_stake);
  const url = `${w.fx.base}/${FIXTURE_FILES.kept}`;
  const text = `${VOW_TEXT} (${w.runId} adversarial)`;
  await snapshotProfile(w, K);

  // Calls the contract has to refuse before any vow exists for them.
  await L.expectRevert(S, K, "make_vow", ["short", url, nowPlus(w, 3600)], min, "too short", "a vow with a too short text");
  await L.expectRevert(S, K, "make_vow", [text, "http://127.0.0.1/evidence", nowPlus(w, 3600)], min, "single http(s) link", "evidence on an IP address");
  await L.expectRevert(S, K, "make_vow", [text, "ftp://example.org/evidence", nowPlus(w, 3600)], min, "single http(s) link", "evidence that is not http(s)");
  await L.expectRevert(S, K, "make_vow", [text, url, nowPlus(w, 20)], min, "Deadline must be", "a deadline closer than one minute");
  await L.expectRevert(S, K, "make_vow", [text, url, nowPlus(w, 400 * 86400)], min, "Deadline must be", "a deadline further than a year");
  await L.expectRevert(S, K, "make_vow", [text, url, nowPlus(w, 3600)], min / 2n, "minimum stake", "a stake below the minimum");

  // A vow that stays open for the rest of these checks.
  const a = await newVow(w, S, K, { text, url, secs: 3600, stake: min });
  const idA = a.id;
  const rowA = await row(w, idA);
  w.rec.check(S, "the new vow is stored as sent", rowA.state === STATE.OPEN && rowA.stake === min.toString() && rowA.provenance === "mutable" && rowA.keeper.toLowerCase() === lc(K.address), `state ${STATE_NAME[rowA.state]}, stake ${rowA.stake}, provenance ${rowA.provenance}`, "behavior");

  await L.expectRevert(S, K, "back", [idA, "faith"], 20n * 10n ** 15n, "cannot back their own", "the keeper backing their own vow");
  await L.expectRevert(S, B, "back", [idA, "faith"], 10n ** 15n, "minimum backing", "backing below the minimum");
  await L.expectRevert(S, B, "back", [idA, "maybe"], 20n * 10n ** 15n, "faith or doubt", "backing a side that does not exist");
  await L.expectRevert(S, B, "back", [idA, "faith"], min, "capped at half", "faith above half of the stake");
  await L.expectRevert(S, B, "back", [idA + 1000, "faith"], 20n * 10n ** 15n, "No such vow", "backing a vow that does not exist");
  await L.expectRevert(S, B, "post_update", [idA, "A note by someone else."], 0n, "Only the keeper", "an update by someone else");
  await L.expectRevert(S, K, "post_update", [idA, "ab"], 0n, "too short", "an update that is too short");
  await L.expectRevert(S, B, "retract", [idA], 0n, "Only the keeper", "a retraction by someone else");
  await L.expectRevert(S, K, "pin_evidence", [idA, "https://example.org/a-page-that-can-change"], 0n, "commit-pinned", "a pin that is a mutable page");
  await L.expectRevert(S, K, "pin_evidence", [idA, "https://web.archive.org/web/20991231000000/https://example.org/evidence"], 0n, "before now", "a pin from the future");
  await L.expectRevert(S, B, "pin_evidence", [idA, "https://web.archive.org/web/20200101000000/https://example.org/evidence"], 0n, "Only the keeper", "a pin by someone else");
  await L.expectRevert(S, B, "judge", [idA], 0n, "halfway", "judging before halfway to the deadline");
  await L.expectRevert(S, B, "finalize", [idA], 0n, "not under review", "finalizing a vow that is not under review");
  await L.expectRevert(S, B, "claim", [idA], 0n, "no final verdict", "claiming from an open vow");
  await L.expectRevert(S, B, "dispute", [idA, "https://example.org/page-one"], 0n, "not under review", "disputing a vow that is not under review");
  await L.expectRevert(S, B, "challenge", [idA, "https://example.org/page-one"], 0n, "Only doubters", "counter-evidence from someone who does not doubt");
  await L.expectRevert(S, B, "release", [idA], 0n, "thirty days", "releasing a vow that is not 30 days overdue");

  // Reads that must fail without a transaction.
  for (const [fn, args, why] of [["get_vow", [idA + 100000], "No such vow"], ["position_of", [idA + 100000, B.address], "No such vow"]]) {
    let failed = false;
    try {
      await L.read(fn, args);
    } catch {
      failed = true;
    }
    w.rec.check(S, `${fn} for a vow that does not exist fails (${why})`, failed, failed ? "the read was refused" : "the read returned data", "behavior");
  }

  // Progress notes: five are allowed, the sixth is not.
  for (let i = 1; i <= 5; i++) {
    await L.send(S, K, "post_update", [idA, `Progress note number ${i} for the live run.`]);
    did(w, idA, "update");
  }
  await L.expectRevert(S, K, "post_update", [idA, "A sixth note is one too many."], 0n, "at most five", "a sixth progress note");
  const withNotes = await row(w, idA);
  w.rec.check(S, "five progress notes are stored in order", withNotes.updates.length === 5 && withNotes.updates.every((u, i) => u.text === `Progress note number ${i + 1} for the live run.` && u.at > 0), `${withNotes.updates.length} notes`, "behavior");

  // Retraction of an unbacked vow, with its accounting.
  const stats0 = await L.read("stats");
  await L.send(S, K, "retract", [idA]);
  did(w, idA, "retracted");
  const after = await row(w, idA);
  const stats1 = await L.read("stats");
  w.rec.check(S, "the vow is retracted", after.state === STATE.RETRACTED, `state ${STATE_NAME[after.state]}`, "behavior");
  w.rec.check(S, "a fifth of the stake is burned and counted as embers", BigInt(stats1.embers) - BigInt(stats0.embers) === min / 5n && stats1.retracted - stats0.retracted === 1, `embers +${BigInt(stats1.embers) - BigInt(stats0.embers)}, retracted +${stats1.retracted - stats0.retracted}`, "invariant");
  await L.expectRevert(S, B, "back", [idA, "doubt"], 20n * 10n ** 15n, "no longer takes backing", "backing a retracted vow");
  await L.expectRevert(S, K, "retract", [idA], 0n, "already been judged", "retracting twice");
  await L.expectRevert(S, K, "post_update", [idA, "A note after the retraction."], 0n, "already been judged", "an update after the retraction");
  await settleMoney(w, S, idA, [{ actor: K, role: "keeper" }, { actor: B, role: "backer" }]);

  // A second vow that gets a backer: a vow with backing cannot be retracted and one side cannot be switched.
  const b = await newVow(w, S, K, { text: `${text} (second)`, url, secs: 24 * 3600, stake: min, key: "adversarialOpen" });
  await L.send(S, B, "back", [b.id, "faith"], 20n * 10n ** 15n);
  did(w, b.id, "faith");
  await L.expectRevert(S, B, "back", [b.id, "doubt"], 20n * 10n ** 15n, "already back", "switching from faith to doubt");
  await L.expectRevert(S, K, "retract", [b.id], 0n, "has backing", "retracting a vow that has backing");
  const open = await row(w, b.id);
  w.rec.check(S, "the vow with backing stays open", open.state === STATE.OPEN && open.faith === (20n * 10n ** 15n).toString(), `state ${STATE_NAME[open.state]}, faith ${open.faith}`, "behavior");
  w.rec.note(`Vow #${b.id} (adversarial) is left open on purpose: it holds ${fmt(BigInt(open.stake) + BigInt(open.faith))} until its deadline.`);
  return `${w.rec.checks.filter((c) => c.scenario === S).length} checks, retraction and its payout verified`;
}

// ---- retract: the keeper takes a vow back before anyone has backed it ----------------------------------------

export async function retract(w) {
  const S = "retract";
  const L = w.lumen;
  const K = w.actors.keeperR;
  const stake = w.cfg.stake;
  await snapshotProfile(w, K);
  const stats0 = await L.read("stats");
  const { id } = await newVow(w, S, K, { text: `${VOW_TEXT} (${w.runId} retract)`, url: `${w.fx.base}/${FIXTURE_FILES.kept}`, secs: 3600, stake });
  await L.send(S, K, "post_update", [id, "Changing plans, this vow will be retracted."]);
  did(w, id, "update");
  await L.send(S, K, "retract", [id]);
  did(w, id, "retracted");
  const v = await row(w, id);
  const stats1 = await L.read("stats");
  const prof = await L.read("profile_of", [K.address]);
  const p0 = w.ctx.profile0[lc(K.address)];
  w.rec.check(S, "state is RETRACTED and the note says why", v.state === STATE.RETRACTED && /retracted/i.test(v.note), `state ${STATE_NAME[v.state]}, note "${v.note}"`, "behavior");
  w.rec.check(S, "the stake is counted as 20% burned", BigInt(stats1.embers) - BigInt(stats0.embers) === stake / 5n, `embers +${BigInt(stats1.embers) - BigInt(stats0.embers)} (expected ${stake / 5n})`, "invariant");
  w.rec.check(S, "the keeper's record shows one retraction and no streak", prof.retracted - p0.retracted === 1 && prof.streak === 0 && prof.kept === p0.kept, `retracted ${prof.retracted}, streak ${prof.streak}`, "behavior");
  await settleMoney(w, S, id, [{ actor: K, role: "keeper" }]);
  return `vow #${id} retracted, ${fmt(stake - stake / 5n)} claimed`;
}

// ---- kept and broken: the whole life of a vow, judged by the validators ------------------------------------

async function lifecycle(w, S, { keeper, faith, doubter, evidenceFile, wantProposed, wantFinal, challenge, pin }) {
  const L = w.lumen;
  const { stake, faith: faithAmt, doubt: doubtAmt } = w.cfg;
  for (const a of [keeper, faith, doubter]) await snapshotProfile(w, a);
  const url = `${w.fx.base}/${evidenceFile}`;
  const { id, deadline } = await newVow(w, S, keeper, { text: `${VOW_TEXT} (${w.runId} ${S})`, url, secs: w.cfg.deadlineSecs, stake });
  w.log(`  [${S}] vow #${id}, deadline in ${deadline - w.net.now()}s`);

  await L.send(S, faith, "back", [id, "faith"], faithAmt);
  did(w, id, "faith");
  await L.send(S, doubter, "back", [id, "doubt"], doubtAmt);
  did(w, id, "doubt");
  await L.send(S, keeper, "post_update", [id, "The page is in the repository; the validators will read it."]);
  did(w, id, "update");
  if (challenge) {
    await L.send(S, doubter, "challenge", [id, `${w.fx.base}/${FIXTURE_FILES.counter}`]);
    did(w, id, "challenged");
    await L.expectRevert(S, doubter, "challenge", [id, `${w.fx.base}/${FIXTURE_FILES.counter}x`], 0n, "already submitted", "a second counter-evidence page from the same doubter");
  }
  if (pin && w.fx.permalinkBase) {
    const pinUrl = `${w.fx.permalinkBase}/${evidenceFile}`;
    await L.send(S, keeper, "pin_evidence", [id, pinUrl]);
    did(w, id, "pinned");
    w.rec.check(S, "the pinned link counts as a permalink", provenance(pinUrl) === "permalink", pinUrl, "behavior");
  }
  const staged = await row(w, id);
  w.rec.check(S, "backing and notes are on the vow", staged.faith === faithAmt.toString() && staged.doubt === doubtAmt.toString() && staged.updates.length === 1, `faith ${staged.faith}, doubt ${staged.doubt}, notes ${staged.updates.length}`, "behavior");
  w.rec.check(S, "the evidence address is judged as a mutable page", staged.provenance === "mutable" && provenance(url) === "mutable", staged.provenance, "behavior");

  await w.net.waitUntil(deadline + 8, `[${S}] the deadline`, w.log);
  await L.expectRevert(S, doubter, "back", [id, "doubt"], 20n * 10n ** 15n, "no longer takes backing", "backing after the deadline");
  await L.expectRevert(S, keeper, "post_update", [id, "Too late for a note, the deadline passed."], 0n, "deadline has passed", "an update after the deadline");
  await L.expectRevert(S, keeper, "retract", [id], 0n, "deadline has passed", "a retraction after the deadline");

  await L.send(S, keeper, "judge", [id], 0n, { tries: 3, pause: 75 });
  let v = await row(w, id);
  w.rec.log(`  [${S}] after judge: ${STATE_NAME[v.state]}, proposed ${STATE_NAME[v.proposed]}, note: ${v.note}`);
  if (v.state === STATE.OPEN) {
    throw new Error(`judging did not conclude (${v.note}). It can be asked again after an hour.`);
  }
  did(w, id, v.state === STATE.REVIEW ? "proposed" : "unclear");
  w.rec.check(S, `the validators proposed ${STATE_NAME[wantProposed]}`, v.state === STATE.REVIEW && v.proposed === wantProposed, `state ${STATE_NAME[v.state]}, proposed ${STATE_NAME[v.proposed]}, note: ${v.note}`, "verdict");
  if (v.state === STATE.REVIEW) {
    w.rec.check(S, "the review window is at least ten minutes", v.review_end - v.proposed_at >= 600, `${v.review_end - v.proposed_at}s`, "behavior");
    if (v.proof) {
      w.rec.check(S, "the proof tier follows from the proof address", v.proof.tier === provenance(v.proof.url), `tier ${v.proof.tier} for ${v.proof.url}`, "behavior");
    }
    await L.expectRevert(S, keeper, "judge", [id], 0n, "already proposed", "judging again while a verdict is proposed");
    await L.expectRevert(S, keeper, "finalize", [id], 0n, "still open", "finalizing before the review window ends");
    await L.expectRevert(S, faith, "claim", [id], 0n, "no final verdict", "claiming during the review window");
    await w.net.waitUntil(v.review_end + 8, `[${S}] the end of the review window`, w.log);
    await L.send(S, keeper, "finalize", [id], 0n, { tries: 3, pause: 75 });
    v = await row(w, id);
    did(w, id, { [STATE.KEPT]: "kept", [STATE.BROKEN]: "broken" }[v.state] ?? "unclear");
  }
  w.rec.check(S, `the final state is ${STATE_NAME[wantFinal]}`, v.state === wantFinal, `final ${STATE_NAME[v.state]}, note: ${v.note}`, "verdict");
  if (![STATE.KEPT, STATE.BROKEN, STATE.UNCLEAR].includes(v.state)) throw new Error(`the vow ended in state ${STATE_NAME[v.state]}`);

  await settleMoney(w, S, id, [
    { actor: keeper, role: "keeper" },
    { actor: faith, role: "backer" },
    { actor: doubter, role: "backer" },
  ]);

  const prof = await L.read("profile_of", [keeper.address]);
  const p0 = w.ctx.profile0[lc(keeper.address)];
  const finalV = await row(w, id);
  if (finalV.state === STATE.KEPT) {
    w.rec.check(S, "the keeper's record gains one kept vow and a streak", prof.kept - p0.kept === 1 && prof.streak >= 1 && BigInt(prof.kept_stake) - BigInt(p0.kept_stake) === stake, `kept ${prof.kept}, streak ${prof.streak}, tier ${prof.tier}`, "behavior");
    w.rec.check(S, "the tier follows the record", prof.tier === standing(prof.kept, prof.broken, BigInt(prof.kept_stake)), `tier ${prof.tier}`, "invariant");
  } else if (finalV.state === STATE.BROKEN) {
    w.rec.check(S, "the keeper's record gains one broken vow and the streak ends", prof.broken - p0.broken === 1 && prof.streak === 0, `broken ${prof.broken}, streak ${prof.streak}`, "behavior");
  }
  return `vow #${id} ended ${STATE_NAME[finalV.state]}`;
}

export const kept = (w) =>
  lifecycle(w, "kept", { keeper: w.actors.keeperK, faith: w.actors.faithK, doubter: w.actors.doubtK, evidenceFile: FIXTURE_FILES.kept, wantProposed: STATE.KEPT, wantFinal: STATE.KEPT, challenge: false, pin: true });
export const broken = (w) =>
  lifecycle(w, "broken", { keeper: w.actors.keeperB, faith: w.actors.faithB, doubter: w.actors.doubtB, evidenceFile: FIXTURE_FILES.broken, wantProposed: STATE.BROKEN, wantFinal: STATE.BROKEN, challenge: true, pin: false });

// ---- directory: the new read model agrees with the vows it summarises ------------------------------------------

function isSubsequence(want, have) {
  let i = 0;
  for (const x of have) if (i < want.length && want[i] === x) i++;
  return i === want.length;
}

export async function directory(w, expectedVersion) {
  const S = "directory";
  const L = w.lumen;
  const ctx = w.ctx;
  const params = await L.read("params");
  w.rec.check(S, "params() reports the version of the contract file", params.version === expectedVersion, `chain ${params.version}, file ${expectedVersion}`, "behavior");
  w.rec.check(S, "params() lists four tiers and six states", params.tiers.length === 4 && Object.keys(params.states).length === 6 && params.states.retracted === 5, `${params.tiers.map((t) => t.name).join(", ")}`, "behavior");

  const ours = Object.values(ctx.vows);
  const clean = Object.values(w.rec.scenarios).every((s) => s.status !== "ERROR");
  const lvl = clean ? "" : "warn"; // a scenario that stopped early leaves the totals incomplete
  const rev = (await L.read("pulse")).rev;
  const stats = await L.read("stats");
  w.rec.check(S, "pulse() and stats() agree on the revision", stats.rev === rev, `rev ${rev}`, "invariant");

  const since = await L.read("changes_since", [ctx.pulse0.rev]);
  const ids = since.rows.map((r) => r.id);
  w.rec.check(S, "changes_since() returns every vow touched in this run", !since.reset && ours.every((id) => ids.includes(id)), `reset ${since.reset}, ${ids.length} vows, ours ${ours.length}`, "behavior");
  let mirrored = true;
  for (const r of since.rows) if (JSON.stringify(r) !== JSON.stringify(await row(w, r.id))) mirrored = false;
  w.rec.check(S, "every row of changes_since() equals get_vow()", mirrored, mirrored ? `${since.rows.length} rows compared` : "a row differs from get_vow()", "invariant");
  const none = await L.read("changes_since", [rev]);
  const future = await L.read("changes_since", [rev + 7]);
  w.rec.check(S, "an up-to-date cursor gets no rows and a cursor from another contract is told to reset", !none.reset && none.rows.length === 0 && future.reset === true, `up to date: ${none.rows.length} rows; future cursor reset=${future.reset}`, "behavior");

  const feed = await L.read("activity", [0, 100]);
  for (const [id, want] of Object.entries(ctx.actions)) {
    const have = feed.filter((e) => e.vow === Number(id)).map((e) => e.action).reverse();
    const sure = want.filter((a) => !["proposed", "unclear", "kept", "broken"].includes(a));
    w.rec.check(S, `activity feed of vow #${id} lists what was done, in order`, isSubsequence(sure, have), `done: ${want.join(" > ")}; feed: ${have.join(" > ")}`, "behavior");
  }
  w.rec.check(S, "the feed is newest first with strictly falling sequence numbers", feed.every((e, i) => i === 0 || feed[i - 1].seq > e.seq), `${feed.length} entries`, "invariant");

  const keepers = await L.read("list_keepers", [0, 100]);
  for (const [role, a] of Object.entries(w.actors)) {
    if (!/^(keeper|advKeeper)/.test(role)) continue;
    const listed = keepers.rows.find((r) => lc(r.address) === lc(a.address));
    const profile = await L.read("profile_of", [a.address]);
    w.rec.check(S, `${a.name} is in the keeper directory with the same profile`, !!listed && JSON.stringify(listed) === JSON.stringify(profile), listed ? `tier ${profile.tier}, vows ${profile.vows}` : "missing from list_keepers", "behavior");
    const mine = await L.read("vows_of", [a.address, -1, 60]);
    const all = await L.read("list_vows", [0, 60]);
    const wantIds = all.filter((v) => lc(v.keeper) === lc(a.address)).map((v) => v.id);
    w.rec.check(S, `vows_of(${a.name}) matches the newest vows of that keeper`, mine.rows.every((v) => lc(v.keeper) === lc(a.address)) && JSON.stringify(mine.rows.map((v) => v.id).slice(0, wantIds.length)) === JSON.stringify(wantIds.slice(0, mine.rows.length)), `${mine.rows.length} rows`, "behavior");
  }

  // Ledger: what this run did to the totals.
  const s0 = ctx.stats0;
  const made = ours.length;
  w.rec.check(S, "the vow count grew by the vows of this run", stats.total - s0.total === made, `+${stats.total - s0.total}, vows made ${made}`, "invariant", lvl);
  w.rec.check(S, "the burned total grew by what the rules burn", BigInt(stats.embers) - BigInt(s0.embers) === ctx.burned, `embers +${BigInt(stats.embers) - BigInt(s0.embers)}, rules ${ctx.burned}`, "invariant", lvl);
  w.rec.check(S, "the paid total grew by what was claimed", BigInt(stats.paid) - BigInt(s0.paid) === ctx.paid, `paid +${BigInt(stats.paid) - BigInt(s0.paid)}, claimed ${ctx.paid}`, "invariant", lvl);
  const balance = await w.net.balanceOf(L.address);
  const outstanding = BigInt(stats.deposited) - BigInt(stats.paid) - BigInt(stats.embers);
  w.rec.check(S, "the contract holds at least what is still claimable", balance >= outstanding, `balance ${fmt(balance)}, claimable ${fmt(outstanding)}`, "invariant");
  w.rec.table("Contract totals", ["", "before the run", "after the run"], [
    ["vows", s0.total, stats.total],
    ["kept / broken / retracted", `${s0.kept} / ${s0.broken} / ${s0.retracted}`, `${stats.kept} / ${stats.broken} / ${stats.retracted}`],
    ["keepers", s0.keepers, stats.keepers],
    ["deposited", fmt(s0.deposited), fmt(stats.deposited)],
    ["paid", fmt(s0.paid), fmt(stats.paid)],
    ["burned (embers)", fmt(s0.embers), fmt(stats.embers)],
    ["feed revision", s0.rev, stats.rev],
  ]);
  return `${ours.length} vows cross-checked against the read model`;
}
