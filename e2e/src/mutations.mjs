// Does the runner notice a broken contract? Each mutation below breaks one rule in a temporary copy of the
// contract; the self-check is run against that copy and has to FAIL. A mutation the self-check does not notice
// is a blind spot of the runner, and this script exits with an error.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MUTATIONS } from "./mutation-list.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = readFileSync(join(root, "contracts", "lumen.py"), "utf8");

const only = process.argv[2];
const dir = mkdtempSync(join(tmpdir(), "lumen-mutations-"));
let blind = 0;
for (const [i, m] of MUTATIONS.entries()) {
  if (only && !m.name.includes(only)) continue;
  if (!source.includes(m.from)) {
    console.log(`SKIP  ${m.name}: the text to change was not found (the contract moved on; update mutations.mjs)`);
    blind++;
    continue;
  }
  const file = join(dir, `lumen_mut_${i}.py`);
  writeFileSync(file, source.replace(m.from, m.to));
  const r = spawnSync("node", [join(root, "e2e", "src", "selfcheck.mjs")], { cwd: join(root, "e2e"), env: { ...process.env, LUMEN_CONTRACT: file, E2E_OUT_DIR: join(dir, `out_${i}`) }, encoding: "utf8" });
  const caught = r.status !== 0;
  const first = (r.stdout.match(/FAIL \[[^\n]+/) || [""])[0].slice(0, 110);
  console.log(`${caught ? "CAUGHT" : "MISSED"} ${m.name}${caught ? "  <- " + first : ""}`);
  if (!caught) blind++;
}
console.log(blind ? `\n${blind} mutation(s) not caught.` : "\nEvery mutation was caught by the self-check.");
process.exit(blind ? 1 : 0);
