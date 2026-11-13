# Deployment and live testing

## The deployed contract

Version 2.0.0 is deployed on Studionet at `0x65b24E33838f738C74304Ba6c03A3787bB0C4360`. The live end-to-end run was played against it and passed 223 of 223 checks; the report is in [`evidence/live-e2e/2026-11-13T10-13-50Z/REPORT.md`](../evidence/live-e2e/2026-11-13T10-13-50Z/REPORT.md). To use it, set `VITE_LUMEN_ADDRESS=0x65b24E33838f738C74304Ba6c03A3787bB0C4360` in `frontend/.env`. Anyone can also deploy their own copy as described below.

## Look around without a contract

```bash
cd frontend
npm install
npm run dev
```

With `VITE_LUMEN_ADDRESS` empty the app runs on sample vows held in the page. Everything works against them (lighting a lantern, backing, notes, retracting, claiming) and nothing is sent anywhere. Add `?demo` to the address to force this even when a contract is configured.

## Deploy the contract to Studionet

Version 2 is a new deployment. A contract deployed from version 1 stores vows differently and the app reports it as outdated.

```bash
pip install -r requirements.txt
genvm-lint check contracts/lumen.py
pytest
```

Then one of:

```bash
# with the GenLayer CLI
npm install -g genlayer
genlayer network set studionet
genlayer deploy --contract contracts/lumen.py

# or from a script that also writes the address into frontend/.env
cd frontend && npm install
DEPLOY_KEY=0x<funded private key> npm run deploy
```

Fund the deploying account from the faucet in [GenLayer Studio](https://studio.genlayer.com). If Studionet reports a missing runner, replace the `Depends` hash on the first line of the contract with the one used by the example contracts in Studio.

Check the deployment: `params()` must report `version` `2.0.0`, and `stats()` must include `rev`.

## Run the app against it

```bash
cd frontend
cp .env.example .env        # set VITE_LUMEN_ADDRESS=<the printed address>
npm run dev                 # or: npm run build, then serve frontend/dist as static files
```

`npm run build` writes a static site (the app and the documentation page). Routes are hash routes, so any static host works without rewrite rules. Connect a wallet: it is added and switched to Studionet for you.

`genlayer-js` is pinned to `1.1.8` and `package-lock.json` is committed. The 2.x line targets other networks and changes how fees work, so move to it deliberately, together with the network it matches.

## The live end-to-end run

This plays five scenarios against a contract on Studionet with real transactions and real validators, checks every result against an independent statement of the rules, and writes a report. It is made to run in GitHub Codespaces, and nothing in it needs typing once it has started.

### 1. Push the repository, including `evidence/fixtures/`

The validators fetch the evidence pages from the internet, so the run serves them from `raw.githubusercontent.com`. It works out where from the `origin` remote and the branch you are on (in GitHub Actions, from `GITHUB_REPOSITORY`). The `kept` scenario also pins a link to the commit you are on, so that commit has to be pushed too. Before it spends anything, the run fetches the three pages and the pinned link and checks that they say what the scenarios expect, and it stops with a message if they are not online yet. If the pages are served from somewhere else, set `E2E_FIXTURE_BASE`.

### 2. Open a Codespace

Opening the repository in a Codespace uses `.devcontainer/devcontainer.json`: Node 22 and Python 3.12, with the Python requirements and the `e2e` and `frontend` dependencies installed.

### 3. Run

```bash
cd e2e
npm run live
```

It takes about 45 minutes (the committed run took 45), mostly waiting for deadlines and for the validators. The Studionet RPC refuses more than 30 requests a minute, so the run keeps to 24 (`E2E_RPC_PER_MIN`) and looks up a pending transaction every 15 seconds (`E2E_POLL_SECS`); a request that is refused anyway is repeated after a pause. It will:

1. check the fixture pages;
2. create one account per role (kept in `e2e/.accounts.json`, which is git-ignored) and fund them with the Studio faucet. If the faucet refuses, it prints the addresses and waits for you to fund them;
3. deploy `contracts/lumen.py` and check that `params().version` matches the file (or use `LUMEN_ADDRESS` to test a contract you already deployed);
4. run the scenarios side by side, then the directory check;
5. write `evidence/live-e2e/<UTC time>/REPORT.md`, `report.json` and `transactions.csv`.

It prints the address it deployed and the line to put in `frontend/.env`.

### 4. Commit the report

```bash
git add evidence/live-e2e && git commit -m "Add live end-to-end report" && git push
```

or let the run do it with `E2E_COMMIT=push npm run live`, or start the `live-e2e` workflow from the Actions tab (it uses no repository secrets: it creates its own accounts and asks the Studio faucet to fund them; if the faucet refuses, supply funded keys through `E2E_KEYS`).

### Reading the result

The exit code is 0 when every check held, 1 when a money rule or a contract behavior failed (or a scenario ended in error), and 2 when only a language-model verdict differed from what the scenario expected. Validators are language models and can legitimately disagree with an expectation; a 2 still means the contract kept every rule. The report says which checks were of which kind.

A report whose title says `SELF-CHECK` came from `npm run check`, which rehearses the runner against the contract in memory. It is a test of the runner, never a result from Studionet, and it is never written to `evidence/`.

### Settings

All settings are environment variables, listed with their defaults in `e2e/README.md`: which scenarios, an existing contract address, the deadline of the kept and broken vows, the amounts, funding, keys of your own accounts, the fixture location, where the report goes and whether to commit it.
