// A rehearsal network for the self-check. The real contract (contracts/lumen.py) runs in direct mode behind
// e2e/selfcheck/bridge_test.py; web pages and the validators' judgment are mocked there. Time is virtual, so a
// ten minute review window passes at once. NOTHING produced with this module is a live run.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { Lumen, Network } from "./chain.mjs";

export class FakeNet extends Network {
  constructor() {
    super("http://rehearsal.invalid");
    this.t = 1_800_000_000;
    this.balances = new Map();
  }
  async syncClock() {
    return 0;
  }
  now() {
    return this.t;
  }
  async waitUntil(ts) {
    if (ts > this.t) this.t = ts;
  }
  async rpc() {
    throw new Error("The rehearsal network has no JSON-RPC.");
  }
  async balanceOf(address) {
    return this.balances.get(address.toLowerCase()) ?? 0n;
  }
  credit(address, wei) {
    const k = address.toLowerCase();
    this.balances.set(k, (this.balances.get(k) ?? 0n) + wei);
  }
}

export class Bridge {
  constructor(cwd, python = process.env.PYTHON || "python3") {
    this.proc = spawn(python, ["-m", "pytest", "-s", "-q", "-p", "no:cacheprovider", "-c", "pytest.ini", "e2e/selfcheck/bridge_test.py"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.waiting = [];
    this.stderr = "";
    this.proc.stderr.on("data", (d) => (this.stderr += d));
    this.exited = new Promise((r) => this.proc.on("exit", r));
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      if (!line.startsWith("@@")) return;
      this.waiting.shift()?.(JSON.parse(line.slice(2)));
    });
  }
  ask(cmd) {
    return new Promise((resolve, reject) => {
      this.waiting.push(resolve);
      this.proc.stdin.write(JSON.stringify(cmd) + "\n", (e) => e && reject(e));
    });
  }
  ready() {
    return new Promise((r) => this.waiting.push(r));
  }
  async close() {
    try {
      await this.ask({ op: "quit", now: 0 });
    } catch {
      /* already gone */
    }
    this.proc.stdin.end();
    await Promise.race([this.exited, new Promise((r) => setTimeout(r, 15000))]);
    this.proc.kill();
  }
}

export class FakeLumen extends Lumen {
  constructor(net, recorder, bridge) {
    super(net, "0x" + "ab".repeat(20), recorder);
    this.bridge = bridge;
    this.counter = 0;
    this.pending = Promise.resolve();
  }

  // The bridge speaks to one contract; calls are made one at a time, as a single account's would be.
  #queue(fn) {
    const run = this.pending.then(fn, fn);
    this.pending = run.catch(() => {});
    return run;
  }

  async read(fn, args = []) {
    const r = await this.#queue(() => this.bridge.ask({ op: "view", fn, args, now: this.net.now() }));
    if (!r.ok) throw new Error(r.error);
    return JSON.parse(r.result);
  }

  async _once(scenario, actor, fn, args, value, attempt, tolerateFailure = false) {
    let payout = 0n;
    if (fn === "claim") {
      const pos = await this.read("position_of", [args[0], actor.address]);
      payout = BigInt(pos.payout);
    }
    const r = await this.#queue(() => this.bridge.ask({ op: "write", fn, args, sender: actor.address, value: String(value ?? 0n), now: this.net.now() }));
    this.counter++;
    const hash = "0x" + createHash("sha256").update(`rehearsal-${this.counter}`).digest("hex");
    const ok = !!r.ok;
    if (ok) {
      if (value) {
        this.net.credit(actor.address, -value);
        this.net.credit(this.address, value);
      }
      if (fn === "claim" && payout > 0n) {
        this.net.credit(this.address, -payout);
        this.net.credit(actor.address, payout);
      }
    }
    const step = { n: this.rec.steps.length + 1, scenario, fn, caller: actor.name, address: actor.address, value: (value ?? 0n).toString(), hash, status: "ACCEPTED", execution: ok ? "FINISHED_WITH_RETURN" : "FINISHED_WITH_ERROR", ok, attempt, seconds: 0, reason: ok ? "" : r.error, receiptText: tolerateFailure ? String(r.error ?? "") : "" };
    this.rec.steps.push(step);
    this.rec.log(`  ${ok ? "ok " : tolerateFailure ? "rej" : "ERR"} [${scenario}] ${fn} by ${actor.name} (rehearsal)`);
    return step;
  }

  async untilFinal(_actor, step) {
    step.finalized = "FINALIZED";
  }
}
