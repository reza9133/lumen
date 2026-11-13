// Runs the scenarios against a Lumen instance. Shared by the live run and the self-check.
import { readFileSync } from "node:fs";
import { adversarial, broken, directory, kept, newWorld, retract } from "./scenarios.mjs";

const TABLE = { adversarial, kept, broken, retract };

/** The VERSION constant of a contract file. */
export function contractVersion(path) {
  const m = /^VERSION\s*=\s*"([^"]+)"/m.exec(readFileSync(path, "utf8"));
  if (!m) throw new Error(`No VERSION in ${path}`);
  return m[1];
}

export async function runScenarios({ net, lumen, rec, cfg, actors, concurrent, version }) {
  const w = newWorld({ net, lumen, rec, cfg, actors });
  w.ctx.stats0 = await lumen.read("stats");
  w.ctx.pulse0 = await lumen.read("pulse");
  const names = cfg.scenarios.filter((s) => s !== "directory");
  const one = async (name) => {
    rec.scenario(name, "RUNNING");
    rec.log(`\n== scenario ${name} ==`);
    try {
      const summary = await TABLE[name](w);
      const bad = rec.checks.filter((c) => c.scenario === name && c.level === "fail").length;
      rec.scenario(name, bad ? "FAIL" : "PASS", `${summary}${bad ? `; ${bad} check(s) failed` : ""}`);
    } catch (e) {
      rec.check(name, "the scenario ran to its end", false, String(e?.message ?? e).slice(0, 300), "behavior");
      rec.scenario(name, "ERROR", String(e?.message ?? e).slice(0, 200));
    }
  };
  if (concurrent) await Promise.all(names.map(one));
  else for (const n of names) await one(n);
  if (cfg.scenarios.includes("directory")) {
    rec.scenario("directory", "RUNNING");
    rec.log("\n== scenario directory ==");
    try {
      const summary = await directory(w, version);
      const bad = rec.checks.filter((c) => c.scenario === "directory" && c.level === "fail").length;
      rec.scenario("directory", bad ? "FAIL" : "PASS", `${summary}${bad ? `; ${bad} check(s) failed` : ""}`);
    } catch (e) {
      rec.check("directory", "the scenario ran to its end", false, String(e?.message ?? e).slice(0, 300), "behavior");
      rec.scenario("directory", "ERROR", String(e?.message ?? e).slice(0, 200));
    }
  }
  rec.settleDeferred(lumen.reasonsSeen > 0);
  return w;
}
