// Opens every page of the built app in a real browser (rehearsal mode, no wallet, no network) and checks that it
// draws, has no console errors and no page errors, and that the main things on each page are there. With
// SHOTS=<dir> it also saves a screenshot of every page.
//
//   npm run build && npm run smoke              (needs Playwright with Chromium: npx playwright install chromium)
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

const PORT = Number(process.env.PORT || 4173);
const base = `http://127.0.0.1:${PORT}`;
const shots = process.env.SHOTS || "";
const outDir = process.env.OUT_DIR || "dist";

// Which built chunk holds the 3D engine and which holds the chain SDK, found by content so a rename cannot hide them.
const assets = readdirSync(join(outDir, "assets")).filter((f) => f.endsWith(".js"));
const holding = (needle) => assets.filter((f) => readFileSync(join(outDir, "assets", f), "utf8").includes(needle));
const threeChunks = holding("WebGLRenderer");
const sdkChunks = holding("getTransactionReceipt");
if (threeChunks.length !== 1 || sdkChunks.length !== 1) {
  console.error(`expected one 3D chunk and one SDK chunk, found ${threeChunks} and ${sdkChunks}`);
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1", ...(process.env.OUT_DIR ? ["--outDir", process.env.OUT_DIR] : [])], { stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}

const PAGES = [
  { name: "sky", path: "/", expect: ["Light a lantern", "Sky", "Ledger"], logo: true },
  { name: "docs", path: "/docs.html", expect: ["Live end-to-end run", "Performance", "Testing"], logo: true },
  { name: "ledger", path: "/", click: "Ledger", selector: ".ledger input[type=search]" },
  { name: "vow-drawer", path: "/#vow=4", expect: ["Open the evidence page"] },
  { name: "vow-page", path: "/#/vow=0".replace("=", "/"), expect: ["Open the evidence page", "Notes are written by the keeper"] },
  { name: "keepers", path: "/#/keepers", expect: ["Keepers", "Constellation", "Streak"] },
  { name: "keeper", path: "/#/keeper/0x01a7c91e3b5d01a7c91e3b5d01a7c91e3b5d01a7", expect: ["Standing", "Vows"] },
  { name: "activity", path: "/#/activity", expect: ["Activity", "lit a vow"] },
  { name: "protocol", path: "/#/protocol", expect: ["Life of a vow", "What would I get?", "Limits"] },
  { name: "pulse", path: "/#/pulse", expect: ["Where the vows stand", "Lit per day"] },
  { name: "space", path: "/#/space", expect: ["The vows in 3D"], settle: 2500 },
];

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failed = 0;
for (const viewport of [{ w: 1280, h: 800, tag: "desktop" }, { w: 390, h: 800, tag: "phone" }]) {
  const ctx = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h }, deviceScaleFactor: 1 });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const problems = [];
    page.on("console", (m) => m.type() === "error" && !/fonts\.g(oogleapis|static)/.test(m.location().url ?? "") && problems.push(`console: ${m.text()}`));
    const scripts = [];
    let logoStatus = 0;
    page.on("response", (r) => r.url().endsWith("/genlayer-logo.svg") && (logoStatus = r.status()));
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
    page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
    page.on("requestfailed", (r) => !/fonts\.g(oogleapis|static)/.test(r.url()) && problems.push(`request failed: ${r.url()}`));
    await page.goto(base + p.path, { waitUntil: "load" });
    if (p.click) await page.getByRole("button", { name: p.click, exact: true }).click();
    await page.waitForTimeout(p.settle ?? 900);
    const text = await page.locator("body").innerText();
    if (p.selector && (await page.locator(p.selector).count()) === 0) problems.push(`missing element: ${p.selector}`);
    for (const want of p.expect ?? []) if (!text.includes(want)) problems.push(`missing text: ${want}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || document.body.scrollWidth > innerWidth + 1);
    if (overflow) problems.push("the page scrolls sideways");
    if (p.logo) {
      // The GenLayer mark is painted through a CSS mask, so it needs the file to load and a light fill to be seen.
      const light = await page.evaluate(() => {
        const el = document.querySelector(".gl-mark");
        if (!el) return null;
        const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g).map(Number);
        const box = el.getBoundingClientRect();
        return { sum: r + g + b, w: box.width, h: box.height };
      });
      if (!light) problems.push("the GenLayer logo is missing");
      else if (light.sum < 450) problems.push(`the GenLayer logo is too dark to see (rgb sum ${light.sum})`);
      else if (light.w < 16 || light.h < 16) problems.push("the GenLayer logo has no size");
      if (logoStatus !== 200) problems.push(`the GenLayer logo file did not load (status ${logoStatus})`);
    }
    const fetched = (chunk) => scripts.some((u) => u.endsWith(chunk));
    // Rehearsal mode never needs the chain SDK, and only the space page needs the 3D engine.
    if (fetched(sdkChunks[0])) problems.push("the chain SDK was fetched in rehearsal mode");
    if (p.name === "space" ? !fetched(threeChunks[0]) : fetched(threeChunks[0])) problems.push(p.name === "space" ? "the 3D engine was not fetched" : "the 3D engine was fetched on a page that does not show it");
    if (p.name === "space") {
      const drawn = await page.evaluate(() => document.querySelector(".space canvas")?.width ?? 0);
      if (!drawn) problems.push("the 3D canvas is empty or missing");
    }
    if (shots) await page.screenshot({ path: join(shots, `${p.name}-${viewport.tag}.png`) });
    console.log(`${problems.length ? "FAIL" : "ok  "} ${viewport.tag.padEnd(7)} ${p.name}${problems.length ? "\n      " + problems.join("\n      ") : ""}`);
    failed += problems.length;
    await page.close();
  }
  await ctx.close();
}
await browser.close();
stop();
console.log(failed ? `\n${failed} problem(s).` : "\nAll pages drew without errors.");
process.exit(failed ? 1 : 0);
