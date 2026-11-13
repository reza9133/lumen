// Collects what happens during a run and writes the report: REPORT.md, report.json and transactions.csv.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fmt } from "./oracle.mjs";
import { replacer } from "./chain.mjs";

const esc = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");

export class Recorder {
  constructor({ mode, network, contract = "", fixtures = null, logFn = console.log } = {}) {
    this.meta = { mode, network, contract, fixtures, startedAt: new Date().toISOString(), finishedAt: "", node: process.version };
    this.steps = [];
    this.checks = [];
    this.scenarios = {};
    this.tables = []; // { title, head, rows }
    this.notes = [];
    this.logFn = logFn;
  }

  log(msg) {
    this.logFn(msg);
  }

  scenario(name, status, summary = "") {
    this.scenarios[name] = { status, summary };
  }

  /**
   * One verified fact. kind "invariant" (money and ledger rules), "behavior" (what the contract must accept or
   * reject) or "verdict" (what the language-model validators decided, which may legitimately differ between runs).
   * level "warn" records a difference that does not fail the run.
   */
  check(scenario, name, pass, detail = "", kind = "behavior", level = "") {
    const row = { scenario, name, pass: !!pass, detail: String(detail), kind, level: pass ? "" : level || "fail" };
    this.checks.push(row);
    this.logFn(`  ${pass ? "PASS" : level === "warn" ? "WARN" : level === "defer" ? "CHECK" : "FAIL"} [${scenario}] ${name}${pass || !detail ? "" : " - " + detail}`);
    return !!pass;
  }

  table(title, head, rows) {
    this.tables.push({ title, head, rows });
  }

  note(text) {
    this.notes.push(text);
  }

  /**
   * A rejection whose reason did not show up in the receipt fails the run when this network shows reasons
   * (some rejection did show its reason), and is only a warning when it never does.
   */
  settleDeferred(reasonsVisible) {
    for (const c of this.checks) if (c.level === "defer") c.level = reasonsVisible ? "fail" : "warn";
    if (!reasonsVisible && this.checks.some((c) => c.level === "warn" && /reason is/.test(c.name))) {
      this.notes.push("This network did not show the reason of any rejected call, so only the rejection itself was checked (reason checks are warnings).");
    }
  }

  get failures() {
    return this.checks.filter((c) => c.level === "fail");
  }

  /** 0 everything held, 1 an invariant or a behavior failed, 2 only model verdicts differed from the expected ones. */
  exitCode() {
    const bad = this.failures;
    if (bad.some((c) => c.kind !== "verdict")) return 1;
    if (bad.length) return 2;
    if (Object.values(this.scenarios).some((s) => s.status === "ERROR")) return 1;
    return 0;
  }

  verdictLine() {
    const code = this.exitCode();
    if (code === 0) return "PASS: every check held.";
    if (code === 2) return "PARTIAL: the contract's rules held, but a model verdict differed from the expected one (see the checks marked FAIL with kind verdict).";
    return "FAIL: at least one rule of the contract or one scenario did not hold (see the checks marked FAIL).";
  }

  markdown() {
    const m = this.meta;
    const selfcheck = m.mode === "selfcheck";
    const out = [];
    out.push(selfcheck ? "# Lumen E2E SELF-CHECK (not a live run)" : "# Lumen live end-to-end report", "");
    if (selfcheck) {
      out.push("> This file was produced by `npm run check`. It exercises the runner's own code against a simulated network and records **nothing about the real Studionet**. Do not publish it as evidence of a live run.", "");
    }
    out.push(`**Result:** ${this.verdictLine()}`, "");
    out.push(`- Network: ${m.network}`, `- Contract: ${m.contract ? "`" + m.contract + "`" : "-"}`);
    out.push(`- Started ${m.startedAt}, finished ${m.finishedAt || "-"}, Node ${m.node}`);
    if (m.fixtures?.base) out.push(`- Evidence pages served from \`${m.fixtures.base}\`${m.fixtures.permalinkBase ? ", pinned at `" + m.fixtures.permalinkBase + "`" : ""}`);
    out.push("");
    const names = Object.keys(this.scenarios);
    if (names.length) {
      out.push("## Scenarios", "", "| scenario | status | what happened |", "|---|---|---|");
      for (const n of names) out.push(`| ${n} | ${this.scenarios[n].status} | ${esc(this.scenarios[n].summary)} |`);
      out.push("");
    }
    const count = (f) => this.checks.filter(f).length;
    out.push("## Checks", "", `${count((c) => c.pass)} of ${this.checks.length} passed; ${count((c) => c.level === "warn")} warnings; ${count((c) => c.level === "fail")} failed.`, "");
    out.push("| scenario | kind | check | result | detail |", "|---|---|---|---|---|");
    for (const c of this.checks) out.push(`| ${c.scenario} | ${c.kind} | ${esc(c.name)} | ${c.pass ? "PASS" : c.level === "warn" ? "WARN" : "FAIL"} | ${esc(c.detail)} |`);
    out.push("");
    for (const t of this.tables) {
      out.push(`## ${t.title}`, "", `| ${t.head.join(" | ")} |`, `|${t.head.map(() => "---").join("|")}|`);
      for (const r of t.rows) out.push(`| ${r.map(esc).join(" | ")} |`);
      out.push("");
    }
    out.push("## Transactions", "");
    if (!this.steps.length) out.push("None.", "");
    else {
      out.push("| # | scenario | call | by | value | hash | decision | execution | finalized | seconds |", "|---|---|---|---|---|---|---|---|---|---|");
      for (const s of this.steps) out.push(`| ${s.n} | ${s.scenario} | \`${s.fn}\` | ${s.caller} | ${fmt(s.value)} | \`${s.hash}\` | ${s.status ?? "-"} | ${s.execution ?? "-"} | ${s.finalized ?? "-"} | ${s.seconds ?? "-"} |`);
      out.push("");
    }
    if (this.notes.length) out.push("## Notes", "", ...this.notes.map((n) => `- ${n}`), "");
    out.push("The report is written by `e2e/src/live.mjs`. Hashes can be looked up in the Studio explorer.", "");
    return out.join("\n");
  }

  csv() {
    const head = ["n", "scenario", "call", "caller", "address", "value_wei", "hash", "decision", "execution", "finalized", "ok", "seconds", "attempt"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [head.join(","), ...this.steps.map((s) => [s.n, s.scenario, s.fn, s.caller, s.address, s.value, s.hash, s.status, s.execution, s.finalized, s.ok, s.seconds, s.attempt].map(q).join(","))].join("\n") + "\n";
  }

  json() {
    return JSON.stringify({ meta: this.meta, result: this.verdictLine(), exitCode: this.exitCode(), scenarios: this.scenarios, checks: this.checks, tables: this.tables, notes: this.notes, steps: this.steps.map(({ receiptText, ...s }) => s) }, replacer, 2);
  }

  write(dir) {
    this.meta.finishedAt = new Date().toISOString();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "REPORT.md"), this.markdown());
    writeFileSync(join(dir, "report.json"), this.json());
    writeFileSync(join(dir, "transactions.csv"), this.csv());
    return dir;
  }
}

export const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
