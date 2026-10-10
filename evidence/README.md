# Studionet end-to-end evidence

Reports of two complete runs of Lumen on Studionet, against one deployment. Both runs were done by hand in GenLayer Studio (every step sent from the Studio interface by the project author, who wrote the reports from the results), not by the `npm run e2e` script. Every transaction hash below can be looked up in the explorer.

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

The script `frontend/scripts/e2e-studionet.mjs` (`npm run e2e`, see the README) automates the same cycle and writes `studionet-e2e-<scenario>-<time>.json` and `.md` here, including the GEN balance of each account before and after its claim. It has not been used for these two reports.
