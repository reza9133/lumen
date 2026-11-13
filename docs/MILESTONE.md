# Milestone: Lumen v2.0.0

Lumen v1 is a working Intelligent Contract with a lantern-sky frontend. This milestone builds on it with new contract functionality, an incremental-sync architecture, a much larger frontend, a live end-to-end runner and documentation. Everything below can be checked in this repository; the right-hand column says how.

**Deployed on Studionet:** `0x65b24E33838f738C74304Ba6c03A3787bB0C4360` (contract version 2.0.0). The live end-to-end run against this address passed 223 of 223 checks; the report is in [`evidence/live-e2e/2026-11-13T10-13-50Z/`](../evidence/live-e2e/2026-11-13T10-13-50Z/REPORT.md). The release notes are in [`CHANGELOG.md`](../CHANGELOG.md).

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
| App JavaScript at start (gzip) | 177 KB, one bundle | 88.5 KB; the chain SDK (100.5 KB) loads on the first chain read; the 3D engine (126.6 KB) loads only on the 3D page | `npm run build`, `docs/PERFORMANCE.md` |
| Contract tests | 104 test cases | 182 (181 pass; 1 optional comparison is skipped), including a seeded fuzz test that checks the money invariants after every step, contract-to-frontend parity tests and payload bounds | `pytest` |
| Longer fuzz run | none | seeds 7000 to 7119 at 100 steps each, no violation | `docs/TESTING.md` |
| Browser test | none | every page at desktop and phone width, with checks for console errors, sideways scrolling, an empty 3D canvas and lazy loading | `npm run smoke` |
| Live end-to-end test | a manual script for one vow (`frontend/scripts/e2e-studionet.mjs`) | a runner with five scenarios (29 refused calls, kept, broken, retract, directory), an **independent payout oracle**, a committed report; made for GitHub Codespaces and Actions | `e2e/README.md` |
| Live result | two hand-run cycles on the version 1 contract | **one full automated run on Studionet against the deployed version 2 contract: 223 of 223 checks passed** (82 transactions, 5 vows: 1 kept, 1 broken, 2 retracted, 1 left open; 50 refused calls each with its reason; every payout equal to the independent calculation; 1.74 GEN deposited, 1.32 GEN paid, 0.3 GEN burned, 0.12 GEN still in the open vow) | `evidence/live-e2e/2026-11-13T10-13-50Z/REPORT.md`, `report.json`, `transactions.csv` |
| Testing the runner | n/a | 34 unit tests, an offline rehearsal against the real contract (222 checks; the live run has one more, the deployed version check) and 9 mutation tests that break the contract and require the runner to notice | `cd e2e && npm test && npm run check && npm run check:mutations` |
| Documentation | README and one documentation page | rewritten README, eight documents in `docs/`, the in-app documentation page extended (14 sections) | `docs/` |
| CI | none | contract lint and tests, runner tests and rehearsal, frontend checks and browser smoke test | `.github/workflows/ci.yml` |

## What this milestone does not claim

- **Model verdicts that never vary.** The validators are language models. The live run checked that they proposed KEPT for the vow whose page shows the work and BROKEN for the vow whose page shows nothing, but a different run can legitimately differ on a verdict (the runner reports that separately from a broken rule, `e2e/README.md`). The run exercised the pages in `evidence/fixtures/`, not arbitrary pages from the internet.
- **Archive pins on the live network.** The live kept vow was pinned to a commit-pinned GitHub link. Archive-site pins are covered by `tests/direct/test_archive.py` and `tests/direct/test_validator_proof.py`, not by the live run.
- **Frame-time gains.** The sky and 3D rendering were built to do less work per frame (see `docs/PERFORMANCE.md`), but no frame-time figure was measured, so none is claimed.
- **An audit.** The contract has extensive tests, not an audit (`docs/SECURITY.md`).

## Verify it

```bash
pip install -r requirements.txt
genvm-lint check contracts/lumen.py
pytest                                           # 181 passed, 1 skipped
cd e2e && npm ci && npm test && npm run check    # 34 tests; 222 of 222 rehearsal checks
npm run check:mutations                          # 9 of 9 mutations caught
cd ../frontend && npm ci && npm run check        # typecheck, payout vectors, evidence rule, build
npm run smoke                                    # needs Playwright and Chromium
```

To repeat the live run, in a Codespace: `cd e2e && npm run live` (about 45 minutes; it deploys its own contract). To look at the deployed contract, put `VITE_LUMEN_ADDRESS=0x65b24E33838f738C74304Ba6c03A3787bB0C4360` in `frontend/.env` and run `npm run dev`; `params()` reports version `2.0.0`.
