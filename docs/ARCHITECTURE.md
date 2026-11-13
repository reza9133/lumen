# Architecture

Lumen has four parts that meet at one contract.

```
                    +----------------------------+
                    |  contracts/lumen.py        |   Intelligent Contract (Python, GenVM)
                    |  vows, backing, judging,   |
                    |  payouts, feed, tiers      |
                    +--------+-------------+-----+
                             ^             ^
                 reads/writes|             |reads/writes, with real validators
                             |             |
   +-------------------------+--+      +---+---------------------------+
   |  frontend/                 |      |  e2e/                         |
   |  React app, 3D view,       |      |  live runner (Studionet),     |
   |  incremental sync          |      |  independent payout oracle    |
   +--------------+-------------+      +---------------+---------------+
                  ^                                    ^
   copies of limits, tiers, payout rules               |  self-check against the contract in memory
                  |                                    |
   +--------------+------------------------------------+---------------+
   |  tests/direct/   in-memory contract tests, fuzzing, parity tests   |
   +--------------------------------------------------------------------+
```

## The contract

`contracts/lumen.py`, version 2.0.0, 23 public methods (11 write, 12 view).

**Storage.** One `DynArray` of `Vow` records and a few `TreeMap`s keyed by `"<vow id>|<address>"` (the faith and doubt each address holds, whether it has claimed, challenged or disputed) or by address (kept, broken, retracted and vows-made counts, the streak, the best streak, GEN staked on kept vows). A `Vow` keeps its list-like fields (counter-evidence, pins, disputes, progress notes) as newline-separated text, which keeps the record flat. `keepers` lists every address in the order of its first vow, and `feed` holds one `"<vow id>|<action>|<time>"` entry for every state change. Running totals (`deposited`, `paid`, `embers` and a count per final state) make the ledger cheap to read and to check.

**Judging is the only non-deterministic step.** `judge` and `finalize` run `gl.vm.run_nondet_unsafe`: the leader reads the evidence pages and asks a model for a verdict; every other validator repeats the reading and must agree on the verdict field and on the proof the verdict rests on. Everything else (money, state changes, limits) is plain deterministic code. The model's answer is never trusted alone: a favourable verdict needs a verbatim quote and a date that the contract checks itself, against its own copy of the page. See `docs/PROTOCOL.md`.

**Money follows a pull model.** Verdicts only change state. Each address calls `claim` for a vow and receives what the payout rules say, once. A single pure function (`_owed`) defines every payout and another (`_burned`) every burn; the app, the live runner and the tests each re-implement them independently and are checked against the contract.

**Incremental sync.** Every state change calls `_log`, which appends to `feed`; the length of the feed is the revision number. `pulse()` returns it (tens of bytes). `changes_since(rev)` walks the feed back to `rev`, collects the distinct vow ids and returns their rows, or a `reset` flag when more than 60 vows changed or `rev` is from the future. This is what lets a client stay current without re-reading every vow.

**Limits are exported.** `params()` returns every limit, the tier table and the state numbers, so a client can compare its own copy with the contract's. `tests/direct/test_frontend_parity.py` does the same comparison for the frontend.

## The frontend

A Vite and React app (`frontend/`), built to run with or without a chain.

- **Source abstraction.** Pages never call the chain directly. They use a `Source` (`src/source.ts`) with two implementations: `chainSource` (reads through `genlayer-js`, writes through the wallet) and `createDemo()` (`src/demo.ts`), an in-page contract with sample vows that supports `make_vow`, `back`, `post_update`, `retract` and `claim`. With no `VITE_LUMEN_ADDRESS` the app uses the demo, so every page can be explored and tested without a network.
- **Sync store** (`src/sync.ts`). One full read at start, then `pulse` every eight seconds and a merge of `changes_since` when it moved. A v1 contract is detected by the missing `rev` and reported. Pages read the store through `useSyncExternalStore`, so only components whose rows changed render again.
- **Router** (`src/router.ts`). Hash routes, so the app can be hosted as static files. Old `#vow=<id>` links still work.
- **Rendering.** The sky is a canvas with a cached background and cached constellation lines (`src/sky.ts`); the 3D view (`src/space3d.ts`) uses one instanced mesh for all lanterns. The SDK and the 3D engine are separate lazy chunks. See `docs/PERFORMANCE.md`.
- **Rules copied from the contract** live in three small modules (`limits.ts`, `payout.ts`, `evidence.ts`) so they can be checked: parity tests compare them with `params()`, replay payout vectors produced by the contract, and check the evidence-link rule.

## The live runner

`e2e/` plays five scenarios against a deployed contract and writes a report. Its design choices:

- **Independent oracle.** `src/oracle.mjs` states the payout, burn, tier and provenance rules again in JavaScript, so a bug in the contract cannot also hide in the check.
- **Three kinds of check.** *invariant* (money and ledger), *behavior* (what is accepted and refused, with the reason), *verdict* (what the model validators decided, which may legitimately differ). The exit code separates them.
- **Concurrent scenarios.** On a real network each scenario waits for a deadline, so they run side by side with their own accounts, then a final `directory` scenario reads everything back.
- **Rehearsal.** `src/fake.mjs` replaces the network with a virtual clock and the real contract in memory (through a Python bridge), so the whole runner, including its report, is exercised before it spends anything on a live network. `src/mutations.mjs` breaks the contract nine ways and requires the rehearsal to fail each time.

## Layout

```
contracts/lumen.py         the contract
frontend/                  app, in-app documentation (docs.html), scripts
frontend/src/pages/        keepers, keeper, activity, protocol, pulse, space, vow
e2e/                       live runner, self-check, mutation tests
tests/direct/              contract tests
tests/tools/               payout vector generator
evidence/fixtures/         the pages the live run reads as evidence
evidence/                  earlier reports (hand-run) and live-e2e/ (reports from the runner)
docs/                      this documentation
.devcontainer/             GitHub Codespaces setup
.github/workflows/         CI and the manual live-e2e workflow
```
