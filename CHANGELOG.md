# Changelog

All notable changes to Lumen. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The milestone write-up, with a way to check every claim, is in [`docs/MILESTONE.md`](docs/MILESTONE.md).

## [2.0.0] - 2026-11-13

Deployed on Studionet at `0x65b24E33838f738C74304Ba6c03A3787bB0C4360`. This is a new deployment: a version 1 contract cannot be read by the version 2 app and cannot be upgraded in place.

### Added

- Contract: `retract` (a keeper takes back a vow nobody has backed, before the deadline; a fifth of the stake is burned) and `post_update` (public progress notes, at most five per vow, never read by the judges). New vow state: retracted.
- Contract: keeper standing with a retraction count and a computed tier (Spark, Flame, Beacon, Constellation); `profile_of`, `list_keepers` and `vows_of`.
- Contract: an activity feed, `params()` (every limit, tier and state) and an incremental sync: `pulse()` (a revision number) and `changes_since(rev)`. The contract now has 23 methods (12 view, 11 write), up from 14.
- Frontend: a vow page, keeper directory and keeper pages, an activity feed, a protocol page (life-of-a-vow diagram, payout calculator, live limits check), pulse charts and a 3D galaxy of vows.
- Frontend: rehearsal mode. With no contract address the app runs on sample vows and every action works in the page.
- Frontend: GenLayer logo in the footer and on the sky, in the README and in the documentation.
- Live end-to-end runner (`e2e/`) with five scenarios (adversarial, kept, broken, retract, directory), an independent payout oracle and a committed report, made for GitHub Codespaces and GitHub Actions.
- Tests: 182 contract tests (181 pass, 1 optional comparison with version 1 is skipped), including a seeded fuzz test of the money invariants, contract-to-frontend parity tests and payload bounds; 34 runner tests; a rehearsal of the runner against the real contract (222 checks); 9 mutation tests that break the contract and require the runner to notice; a browser smoke test over every page at desktop and phone width.
- Documentation: a rewritten README, eight documents in `docs/` (architecture, contract API, deployment, milestone, performance, protocol, security, testing) and an in-app documentation page with 14 sections.
- Evidence: the first live run on Studionet, `evidence/live-e2e/2026-11-13T10-13-50Z/` (`REPORT.md`, `report.json`, `transactions.csv`): **223 of 223 checks passed**, 82 transactions, 5 vows (1 kept, 1 broken, 2 retracted, 1 left open on purpose), 1.74 GEN deposited, 1.32 GEN paid, 0.3 GEN burned.
- `CHANGELOG.md`.

### Changed

- Client sync: every 8 seconds the app reads `pulse()` (25 bytes) and fetches `changes_since` only after a change (657 bytes for one vow), instead of `stats` plus the first page of `list_vows` every 12 seconds (30,842 bytes with 60 vows). Polling pauses while the tab is hidden.
- Bundles: the application loads first at 88.5 KB gzipped (version 1: one bundle of 177.4 KB); the chain SDK (100.5 KB) loads on the first chain read and the 3D engine (126.6 KB) only on the 3D page.
- Rendering: the sky background is drawn once into an offscreen canvas, the constellation lines are cached, and the animation loop stops when the tab is hidden. No frame-time figure is claimed.
- `frontend/.env.example` and the documentation now point to the deployed version 2 address.

### Fixed

- Documentation numbers that did not match the code: the size of the application bundle (86.0 KB was written, the build gives 88.5 KB), the number of runner tests (28 written, 34 run) and the run time of the live runner (two different ranges, now about 45 minutes as measured).
- The milestone write-up no longer says that no live result and no deployed version 2 address exist.

### Not claimed

- An audit. The contract has extensive tests, not an audit (`docs/SECURITY.md`).
- Frame-time gains, and archive-site pins on the live network (covered by in-memory tests only).

## [1.0.0]

Contract version 1 with the lantern-sky frontend: 14 methods (5 view, 9 write), vow states open, kept, broken, unclear and review, keeper actions make, back, pin, challenge, dispute, judge, finalize, release and claim, 104 contract tests, a single-screen app (sky, ledger, drawer) and two hand-run Studionet cycles (one kept vow, one broken vow) recorded in `evidence/studionet-e2e-kept.md` and `evidence/studionet-e2e-broken.md`. The version 1 contract was deployed at `0x0FDa5D58327DD482bCE2C3673f4295d0E891F75D`; it does not work with the version 2 app.
