# Live end-to-end runner

Runs Lumen v2 on Studionet with real accounts and real transactions, checks every result against an independent
statement of the rules, and writes a report you can commit.

```bash
cd e2e
npm ci
npm run live            # about 45 minutes, nothing to type
```

## Before the first run

1. Push the repository to GitHub, including `evidence/fixtures/`. The validators of the network fetch the evidence
   pages from the internet, so the run reads them from `raw.githubusercontent.com` and checks that they are
   online before it spends anything.
2. Use Node 22 or newer. GitHub Codespaces opens this repository with everything installed
   (`.devcontainer/devcontainer.json`).

## What it does

| step | what happens |
|---|---|
| 1 | checks that the three fixture pages are online and say what the scenarios expect |
| 2 | creates one account per role (kept in `e2e/.accounts.json`, never committed) and funds them with the Studio faucet (`sim_fundAccount`). When the faucet refuses, it prints the addresses and waits for you to fund them |
| 3 | deploys `contracts/lumen.py` and checks that `params().version` equals the version in the file (or uses `LUMEN_ADDRESS`) |
| 4 | runs the scenarios side by side, then the directory check |
| 5 | writes `evidence/live-e2e/<UTC time>/REPORT.md`, `report.json`, `transactions.csv` |

Scenarios

| name | what it proves |
|---|---|
| `adversarial` | 29 calls the contract has to refuse (each with its reason, and with the vow it names unchanged), five progress notes and the refusal of a sixth, a retraction with its accounting, a vow with backing that cannot be retracted |
| `kept` | make, back (faith and doubt), note, pin a commit-pinned link, deadline, judge, review window, finalize, claim: payouts equal the rules, GEN arrives, the record and tier update |
| `broken` | the same cycle for a vow whose evidence shows nothing; the doubter submits counter-evidence; the doubter is paid, the keeper and the faith backer are not |
| `retract` | a keeper takes an unbacked vow back; 20% is burned, the rest is claimed |
| `directory` | `changes_since`, `pulse`, `activity`, `list_keepers`, `profile_of`, `vows_of` agree with `get_vow`, and the contract totals moved by exactly what the run did |

Every check is one of three kinds. **invariant**: money and ledger rules. **behavior**: what the contract accepts
and rejects. **verdict**: what the language-model validators decided; it can legitimately differ between runs. The
exit code is 0 when everything held, 1 when an invariant or behavior failed, and 2 when only a model verdict
differed from the expected one.

## Settings (environment variables)

| variable | default | meaning |
|---|---|---|
| `E2E_SCENARIOS` | all | comma separated subset, for example `adversarial,retract` |
| `LUMEN_ADDRESS` | deploy a new one | use an existing v2 contract |
| `E2E_RPC_PER_MIN`, `E2E_POLL_SECS` | 24, 15 | the RPC refuses more than 30 requests a minute; the runner keeps to this many and looks up a pending transaction this often |
| `E2E_DEADLINE_SECS` | 900 | seconds from now to the deadline of the kept and broken vows (60 to 3600) |
| `E2E_STAKE_GEN`, `E2E_FAITH_GEN`, `E2E_DOUBT_GEN` | 0.4, 0.1, 0.06 | amounts in GEN |
| `E2E_FUND_GEN` | 1 | balance every account must have |
| `E2E_FUND_WAIT_SECS` | 600 | how long to wait for outside funding |
| `E2E_KEYS` | none | comma separated private keys of funded accounts, in role order |
| `E2E_FIXTURE_BASE` | this repository on GitHub | where the evidence pages are served from |
| `E2E_COMMIT` | off | `1` commits the report folder, `push` commits and pushes it |
| `E2E_OUT_DIR` | `evidence/live-e2e/<time>` | where the report goes |

## Without the network

```bash
npm test                 # unit tests of the runner and its parity with the contract file
npm run check            # SELF-CHECK: all scenarios against the real contract in direct mode (not a live run)
npm run check:mutations  # breaks nine rules of the contract, one at a time; the self-check has to notice each
```

The self-check needs Python with `requirements.txt` installed. Its report is labelled as a rehearsal and goes to a
temporary folder; it is never written to `evidence/`.

## Publishing the report

```bash
git add evidence/live-e2e && git commit -m "Add live end-to-end report" && git push
```

The same happens automatically with `E2E_COMMIT=push npm run live`, or from the GitHub Actions workflow
`live-e2e` (Actions, Run workflow).
