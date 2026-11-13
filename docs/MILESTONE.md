# Milestone: Lumen v2.0.0

Lumen v1 is a working Intelligent Contract with a lantern-sky frontend. This milestone builds on it with new contract functionality, an incremental-sync architecture, a much larger frontend, a live end-to-end runner and documentation. Everything below can be checked in this repository; the right-hand column says how.

## What changed

| Area | Version 1 | Version 2 | How to check |
|---|---|---|---|
| Contract methods | 14 (5 view, 9 write) | 23 (12 view, 11 write) | `genvm-lint check contracts/lumen.py` |
| Contract size | 1,065 lines | 1,317 lines | `wc -l contracts/lumen.py` |
| Vow states | open, kept, broken, unclear, review | adds **retracted** | `params()` |
| Keeper actions | make, back, pin, challenge, dispute, judge, finalize, release, claim | adds **`retract`** (unbacked vow, before the deadline, a fifth burned) and **`post_update`** (public progress notes, never read by the judges) | `docs/CONTRACT_API.md` |
| Keeper standing | kept and broken counts, streak | adds retraction count and a computed **tier** (Spark, Flame, Beacon, Constellation) | `profile_of`, `list_keepers` |
| Discoverability | `list_vows`, `stats` | adds an **activity feed**, a keeper directory, `vows_of`, and `params()` (every limit, the tiers and states) | `docs/CONTRACT_API.md` |
| Client sync | every 12 s: `stats` + the first page of `list_vows` (30,842 bytes with 60 vows) | every 8 s: `pulse()` (25 bytes); `changes_since` after a change (657 bytes for one vow) | `pytest tests/direct/test_payloads.py -s`, `docs/PERFORMANCE.md` |
| Frontend pages | one screen (sky, ledger, drawer) | adds a vow page, keeper directory, keeper pages, activity feed, protocol page (diagram, payout calculator, live limits check), pulse charts and a **3D galaxy** | `cd frontend && npm run smoke` |
| Frontend without a contract | not possible | **rehearsal mode** with sample vows; every action works in the page | `npm run dev` with `VITE_LUMEN_ADDRESS` empty |
| GenLayer branding | none | GenLayer logo in the footer and on the sky, in the README and in the documentation | `frontend/public/genlayer-logo.svg`, `docs/genlayer-logo-black.svg` and `docs/genlayer-logo-cream.svg` |
| App JavaScript at start (gzip) | 177 KB, one bundle | 86 KB; the chain SDK (101 KB) loads on the first chain read; the 3D engine (127 KB) loads only on the 3D page | `npm run build`, `docs/PERFORMANCE.md` |
| Contract tests | 104 test cases | 182 (181 pass; 1 optional comparison is skipped), including a seeded fuzz test that checks the money invariants after every step, contract-to-frontend parity tests and payload bounds | `pytest` |
| Longer fuzz run | none | seeds 7000 to 7119 at 100 steps each, no violation | `docs/TESTING.md` |
| Browser test | none | every page at desktop and phone width, with checks for console errors, sideways scrolling, an empty 3D canvas and lazy loading | `npm run smoke` |
| Live end-to-end test | a manual script for one vow (`frontend/scripts/e2e-studionet.mjs`) | a runner with five scenarios (29 refused calls, kept, broken, retract, directory), an **independent payout oracle**, a committed report; made for GitHub Codespaces and Actions | `e2e/README.md` |
| Testing the runner | n/a | offline rehearsal against the real contract (222 checks) and 9 mutation tests that break the contract and require the runner to notice | `cd e2e && npm run check && npm run check:mutations` |
| Documentation | README and one documentation page | rewritten README, eight documents in `docs/`, the in-app documentation page extended (14 sections) | `docs/` |
| CI | none | contract lint and tests, runner tests and rehearsal, frontend checks and browser smoke test | `.github/workflows/ci.yml` |

## What this milestone does not claim

- **A live Studionet result.** The live runner was written and rehearsed offline against the real contract, but the network is not reachable from where it was built. The report of a live run is added to `evidence/live-e2e/` after it is run in Codespaces (`docs/DEPLOYMENT.md`). Until then, the only reports in `evidence/` are the two hand-made version 1 reports.
- **A deployed version 2 address.** Version 2 needs a new deployment; the version 1 address does not work with this app.
- **Frame-time gains.** The sky and 3D rendering were built to do less work per frame (see `docs/PERFORMANCE.md`), but no frame-time figure was measured, so none is claimed.
- **An audit.** The contract has extensive tests, not an audit (`docs/SECURITY.md`).

## Verify it

```bash
pip install -r requirements.txt
genvm-lint check contracts/lumen.py
pytest                                           # 181 passed, 1 skipped
cd e2e && npm ci && npm test && npm run check    # 28 tests; 222 of 222 rehearsal checks
npm run check:mutations                          # 9 of 9 mutations caught
cd ../frontend && npm ci && npm run check        # typecheck, payout vectors, evidence rule, build
npm run smoke                                    # needs Playwright and Chromium
```

Then, in a Codespace: `cd e2e && npm run live`.
