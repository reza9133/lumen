# Evidence

Three kinds of file live here.

| Path | What it is |
|---|---|
| `live-e2e/<UTC time>/` | Reports written by the live runner in `e2e/` (`npm run live`): `REPORT.md`, `report.json`, `transactions.csv`. A report here is always from a real network. A rehearsal (`npm run check`) is labelled `SELF-CHECK` and is never written here. The folder currently holds one run, described below. |
| `fixtures/` | The pages the live run uses as evidence (`kept.md`, `broken.md`, `counter.md`). The validators fetch them from GitHub, so they must be pushed before a run. |
| `studionet-e2e-*.md` | Two hand-made reports of version 1 of the contract, described below. |

# Version 2 evidence: the live end-to-end run

One complete automated run on Studionet against a fresh deployment of version 2.0.0, written by `e2e/` (`npm run live`).

- Contract: `0x65b24E33838f738C74304Ba6c03A3787bB0C4360`
- Report: [`live-e2e/2026-11-13T10-13-50Z/REPORT.md`](live-e2e/2026-11-13T10-13-50Z/REPORT.md), with [`report.json`](live-e2e/2026-11-13T10-13-50Z/report.json) and [`transactions.csv`](live-e2e/2026-11-13T10-13-50Z/transactions.csv)
- Run: 2026-11-13, 10:13:50 to 10:58:46 UTC (45 minutes), Node 24, evidence pages served from this repository on GitHub
- Result: **PASS, 223 of 223 checks** (136 behavior, 83 invariant, 4 verdict), 82 transactions

| Scenario | Result |
|---|---|
| `deploy` | the deployed contract reports version 2.0.0, the version in this repository |
| `adversarial` | 105 checks: calls the contract has to refuse, each with its reason and the vow it names unchanged; five progress notes and the refusal of a sixth; a retraction and its payout |
| `kept` | vow #1 ended KEPT; the validators proposed KEPT; keeper 0.4 GEN, faith backer 0.16 GEN claimed; the doubter was refused |
| `broken` | vow #2 ended BROKEN; the validators proposed BROKEN; the doubter was paid 0.36 GEN; the keeper and the faith backer were refused |
| `retract` | vow #0 retracted; 0.32 GEN claimed, 0.08 GEN burned |
| `directory` | 5 vows cross-checked against the read model |

Contract totals after the run: 5 vows (1 kept, 1 broken, 2 retracted, 1 open on purpose), 1.74 GEN deposited, 1.32 GEN paid, 0.3 GEN burned, 0.12 GEN still held by the open vow. The pages the validators read are in [`fixtures/`](fixtures/).

# Version 1 evidence: two hand-run Studionet cycles

Reports of two complete runs of Lumen version 1 on Studionet, against one version 1 deployment (it does not work with the version 2 app). Both runs were done by hand in GenLayer Studio (every step sent from the Studio interface by the project author, who wrote the reports from the results), not by the `npm run e2e` script. Every transaction hash below can be looked up in the explorer.

- Contract: `0x0FDa5D58327DD482bCE2C3673f4295d0E891F75D`
- [`studionet-e2e-kept.md`](studionet-e2e-kept.md): vow #0 ends **KEPT**. `make_vow` (2.0 GEN stake), `back` (1.0 GEN faith), `judge`, `finalize`, then `claim` by the keeper (2.0 GEN) and by the faith backer (1.0 GEN).
- [`studionet-e2e-broken.md`](studionet-e2e-broken.md): vow #1 ends **BROKEN**. `make_vow` (2.0 GEN stake), `back` (1.0 GEN doubt), `judge`, `finalize`, then `claim` by the doubter (2.0 GEN).

Each report lists every transaction hash with its consensus decision (`ACCEPTED`), execution result (`SUCCESS`) and final status (`FINALIZED`), and the vow after each stage: `judge` proposes a verdict and opens the review window (state `REVIEW`), `finalize` closes it (`KEPT` / `BROKEN`), and only then does `claim` pay.

## What the numbers show

| | deposited | paid out | burned |
|---|---|---|---|
| vow #0 (kept) | 2.0 stake + 1.0 faith = 3.0 | 2.0 keeper + 1.0 faith = 3.0 | 0 |
| vow #1 (broken) | 2.0 stake + 1.0 doubt = 3.0 | 2.0 doubter (own 1.0 + the half of the stake that is not burned) | 1.0 (half of the stake) |
| contract totals after both | 6.0 | 5.0 | 1.0 |

The totals in the broken report (deposited 6.0, paid 5.0, burned 1.0) are the two vows added up, and `deposited = paid + burned`: nothing is owed and nothing is missing.

## Check it yourself

Every claim above can be read from the chain. With the contract address, call the views `get_vow(0)`, `get_vow(1)`, `position_of(<vow>, <address>)` and `stats()` (for example from GenLayer Studio, or `readContract` in `genlayer-js`), and look up each hash in the Studio transaction list.

Both runs use ordinary editable pages as evidence (so the proof tier of the kept verdict is `mutable`: the page had to show a dated completion on or before the deadline, and it did). They do not exercise archive pins; the archive authentication is covered by `tests/direct/test_archive.py` and `tests/direct/test_validator_proof.py`.

The script `frontend/scripts/e2e-studionet.mjs` (`npm run e2e`) automates the same cycle for one vow; the complete runner is in `e2e/`. The script writes `studionet-e2e-<scenario>-<time>.json` and `.md` here, including the GEN balance of each account before and after its claim. It has not been used for these two reports.
