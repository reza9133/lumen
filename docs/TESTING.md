# Testing

Four layers, from the contract outward. The first two run anywhere; the third needs a browser; the fourth is the only one that talks to a live network.

| Layer | Command | What it proves |
|---|---|---|
| Contract, in memory | `pytest` | The rules, the money and the attacks, with mocked web pages and mocked model answers |
| Frontend checks | `cd frontend && npm run check` | The app's copies of the contract's rules match it, and everything typechecks and builds |
| Browser smoke test | `cd frontend && npm run smoke` | Every page draws without errors at desktop and phone width |
| Live end-to-end run | `cd e2e && npm run live` | The deployed contract on Studionet does what the rules say with real validators |

At default settings, `pytest` reports 181 passed and 1 skipped (the optional comparison with version 1), and `genvm-lint check contracts/lumen.py` passes.

## Contract tests (`tests/direct/`)

The harness runs the contract in memory. Web pages and model answers are mocked, so each test fixes what the model "said" and checks what the contract does with it.

| File | Covers |
|---|---|
| `test_lumen.py` | Input validation including the evidence address rules, backing and the faith cap, counter-evidence and slot ranking, early confirmation, a regression test for the self-doubt attack, every verdict and payout, single-use claims, the unreadable-page retry path, streaks, paging, validator agreement |
| `test_adversarial.py` | Manipulated evidence, post-deadline edits, coordinated counter-evidence, and complete runs from stake to payout whose totals must balance (below) |
| `test_archive.py` | Archive capture authentication (below) |
| `test_validator_proof.py` | The validator cross-check of the proof (below). No VM needed |
| `test_economics.py`, `test_hardening.py` | The payout math on its own, and the page and address rules. No VM needed |
| `test_v2_features.py` | Retraction, progress notes, the activity feed and incremental sync, the keeper directory and tiers, `params()`, the rule for zero-width characters in text |
| `test_v2_adversarial.py` | Attacks on the version 2 features (below) |
| `test_fuzz_invariants.py` | Seeded random sequences of every action, with the invariants checked after every step |
| `test_frontend_parity.py` | The app's copies of the contract's limits, tiers, state numbers, refusal messages and payout rules |
| `test_payloads.py` | The read sizes in `docs/PERFORMANCE.md` |

### What the adversarial tests do

- **Manipulated evidence:** an invented quote, an undated page, work dated after the deadline, a date the quote does not show, impossible dates, a page that announces its own verdict, a judge that names no real source, a validator that cannot find the leader's quote, pins that are editable, from the future or over the limit.
- **Archive captures:** a redirect (301, 302, 303, 307, 308) to a capture taken after the deadline; a replay that names a different capture than the link (later, earlier, one second off) or disagrees with the address it was served from; a missing, empty, malformed or impossible `Memento-Datetime`; archive errors; redirects that leave the archive (other hosts, look-alike hosts, a userinfo trick, protocol-relative and `javascript:` targets); redirect loops; the same checks on the main evidence link, on pins, on counter-evidence, on dispute pages and on early confirmation; a validator that is served another capture disagrees with the leader. An unconfirmed capture is read as an editable page.
- **Validator cross-check:** a leader that relabels the proof of a verdict that is otherwise right (an editable page as `snapshot` or `permalink`, a real snapshot as `mutable`, a wrong capture day), a validator that is served another capture of the same pinned page, and a malformed proof. Each is rejected; an honest leader on a confirmed snapshot is accepted.
- **Post-deadline edits:** work that appears only after the deadline cannot rescue a broken vow; a backdated edit loses to an archive capture of the empty page; an editable page cannot beat a pinned record; two firm records that disagree refund everyone; a page that vanishes under dispute cannot stay kept.
- **Coordinated counter-evidence:** a crowd of invented pages never pays the doubters (refund at most); mirrors of one claim count once; a quote not on the counter page is ignored; counter-evidence cannot raise a verdict; dust doubters cannot crowd out a serious one in counter or dispute slots.
- **Stake to payout:** kept, broken, disputed-and-flipped and unclear vows are run from `make_vow` through backing, judging, the review window, `finalize` and every `claim`. Nothing is payable before the verdict is final, each claim works once, and the contract's `deposited`, `paid` and `embers` totals balance across several vows at once.
- **Version 2 features:** a retraction never creates or loses a wei; a retraction cannot dodge a verdict somebody bet on; retracting is allowed on the last second before the deadline and not after; hostile note text cannot forge extra notes or lines; a note that starts with digits and a pipe is not misread; notes cannot be posted by a backer or after review starts and are not evidence; view arguments at the edge of the integer range; views on an empty contract; a failed call leaves no trace in the feed; the keeper directory with many keepers; addresses in any letter case; a release next to retracted vows; the solvency invariant with retractions mixed in.

### The fuzz test

`test_fuzz_invariants.py` drives a fresh contract with a long random sequence of calls from several accounts: makes, backings, progress notes, retractions, judgements with random mocked verdicts, finalisations, claims, counter-evidence, disputes, releases and jumps in time. After every step it checks:

- a call either succeeds or raises a contract error; any other exception is a bug, and a failed call changes nothing;
- the feed length and the revision number equal the number of successful state changes, and a client that only ever calls `pulse` and `changes_since` ends with exactly the rows `list_vows` returns;
- money: `deposited` equals all stakes and backings, every position's payout equals an independent re-implementation of the payout rules, `embers` equals the independent burn rule, `paid` equals the claims made, and `deposited - paid - embers - still claimable` is never negative and is only rounding dust (a few wei);
- faith never exceeds its cap, final states never change again, the global counters equal what the rows say, and the keeper index matches the rows.

A second test checks that the runs actually reached the interesting states and actions, so a fuzz run that never retracts or never reaches review cannot pass quietly.

```bash
pytest tests/direct/test_fuzz_invariants.py                                   # 12 seeds of 80 steps
LUMEN_FUZZ_SEEDS=100 LUMEN_FUZZ_STEPS=100 LUMEN_FUZZ_BASE=7000 pytest tests/direct/test_fuzz_invariants.py
```

The longer run (about five seconds a seed) was done over seeds 7000 to 7119 at 100 steps each, with no violation.

## Frontend checks

- `npm run typecheck`: the sources typecheck.
- `npm run check:payout`: `payout.ts` reproduces 260 payout vectors produced by the contract's own payout function, in all states including retracted. Regenerate them with `python3 tests/tools/gen_payout_vectors.py`.
- `npm run check:evidence`: the evidence-link rule in `evidence.ts`.
- `tests/direct/test_frontend_parity.py`: `limits.ts` against `params()`, the tier table, the state numbers, and every refusal the contract can raise against the messages the app explains (in both directions, so a stale message fails too).

## Browser smoke test

`npm run smoke` serves the production build, opens ten pages at 1280 and at 390 pixels wide in Chromium and fails on: a console error, a page error, a failed request, missing text or elements, a page that scrolls sideways, an empty 3D canvas, the chain SDK being fetched in rehearsal mode, and the 3D engine being fetched on any page but the space page. With `SHOTS=<dir>` it saves a screenshot of every page.

## The live runner's own tests

The runner in `e2e/` is tested before it is trusted with a network:

- `cd e2e && npm test` runs 28 tests of its payout oracle, report writer, configuration and its agreement with the contract (method names, argument counts, revert reasons, fixtures).
- `npm run check` plays all five scenarios against the real contract in memory with a virtual clock (222 checks). Its report is labelled `SELF-CHECK` and is never a live result.
- `npm run check:mutations` breaks the contract in nine ways (a retraction that burns a quarter, a retraction after the deadline, a keeper who can back their own vow, faith that is not capped, a kept vow that pays doubters, a broken vow that burns everything, a claim that works twice, a feed that forgets notes, a claim during review) and requires the runner to fail each time. All nine are caught.

See `e2e/README.md` and `docs/DEPLOYMENT.md` for running it on Studionet.
