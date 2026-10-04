# Lumen

Public vows, judged by validators. Write a promise, stake GEN behind it and point to the page that will prove it. After the deadline every GenLayer validator reads that page and rules whether the vow was kept. Friends back it with faith, skeptics bet against it, and every broken vow sends embers drifting down the sky.

- `contracts/lumen.py` is the Intelligent Contract.
- `frontend/` is a Vite and React app. Each vow is a paper lantern in a night sky, with a ledger view, filters, keeper records and a details drawer.
- `tests/direct/` holds in-memory contract tests (`test_hardening.py` and `test_economics.py` need no VM).

## How it works

1. `make_vow(text, evidence_url, deadline)` locks the keeper's stake (minimum 0.1 GEN).
2. Until the deadline anyone except the keeper can call `back(vow_id, "faith" | "doubt")` with at least 0.01 GEN. An address picks one side per vow. Total faith on a vow is capped at half of the keeper's stake; doubt has no cap.
3. After the deadline anyone can call `judge(vow_id)`. The leader fetches the evidence page and asks an LLM for a verdict. Validators repeat the reading and must agree on the verdict field only (`FULFILLED`, `BROKEN`, `UNCLEAR`, or `UNREADABLE`). The wording of the note may differ.
4. `claim(vow_id)` pays out.
5. If a vow is still open thirty days after its deadline (judging keeps failing, or nobody asked), anyone can call `release(vow_id)`. It closes the vow as unclear and everyone can claim a full refund.

Two optional steps sit around judging:

- **Counter-evidence.** Until the deadline, a doubter can call `challenge(vow_id, url)` once to point the judges at a page that argues the vow failed. The judges read it together with the keeper's page, treat it as a claim rather than a fact, and use it only when it gives concrete facts (dates, names, links, numbers) that contradict the keeper's page. Counter-evidence can lower a verdict, never raise one. A vow keeps at most three such pages; when all slots are taken, a doubter whose doubt is larger than the smallest holder's current doubt replaces that holder, who may then submit again.
- **Early confirmation.** Halfway to the deadline, `judge(vow_id)` can be called while nobody doubts the vow. An early check can only confirm the vow. If the page does not show the work yet, the vow stays open, a note is recorded and nothing is counted against the keeper. Early checks of one vow are at least fifteen minutes apart.

| Verdict | Keeper | Faith backers | Doubters |
|---|---|---|---|
| Kept | stake back, plus the doubt pool if nobody backed with faith | backing back, plus a pro-rata share of the doubt pool | lose their backing |
| Broken | loses the stake | lose their backing | backing back, plus a pro-rata share of half the stake and the whole faith pool |
| Unclear | stake back | backing back | backing back |

Half of a broken stake is burned (shown as embers). If nobody doubted a broken vow, its stake and faith pool are burned in full; the app warns faith backers about this before they back a vow nobody doubts. Burned GEN stays in the contract and is never paid out.

### Design decisions

- **Why half is burned, and why faith is capped.** A keeper can doubt their own vow from a second address. Burning half of a broken stake means they lose half of it that way. But the doubters also win the faith pool, so a keeper who lets a vow fail and doubts it from a second address nets `faith - stake / 2`. Capping total faith at half of the stake makes that number zero or negative, so the trick never pays. Without the cap, a 0.1 GEN stake with 10 GEN of faith behind it would pay the keeper almost 10 GEN.
- **Unreadable pages.** A page that cannot be read (network error, HTTP error, or fewer than 20 characters of text) does not decide the vow. `judge` can be called again an hour after the last attempt, up to three attempts, and the vow is then counted as broken. The hour-long gap means a short outage or a rate limit cannot break a vow, while an unreachable page still cannot be used to dodge a verdict.
- **Evidence addresses.** Evidence must be an `http` or `https` link to a named domain. IP addresses (also when written as four numeric labels, as in `127.0.0.1.example.com`), `localhost`, internal-looking and reserved top-level domains, public wildcard-DNS services such as `nip.io`, credentials in the link, whitespace and custom ports are rejected when the vow is made. Internationalized names are accepted in their punycode form (`xn--`); the app converts them when you paste a link. This checks the shape of the name only. A domain someone controls can still point at a private address, so rely on the web module's own network rules for that.
- **Reading the page.** A plain GET is used first so HTTP errors are never treated as evidence. If the page has little text, a rendered read is tried as well. A page with fewer than 20 characters is treated as unreadable (it is often a soft error such as a rate-limit notice) and retried; on the third and last attempt any text at all is judged, so a terse real page is not broken unread. Only the first 300,000 characters are looked at, and markup is removed in a single pass, so a hostile page cannot make validators run out of time. Only exact `script`, `style` and `noscript` blocks are dropped, comments are removed whole, and a lone `<` in the text is kept as text.
- **Counter-evidence is a claim, not a fact.** Pages from doubters go into the same prompt as the keeper's page, marked as untrusted. If a doubter's page gives concrete contradicting facts and the judge cannot tell that the keeper's page is right, the verdict is `BROKEN`: the keeper has to show the work. Pages that cannot be read are skipped, so a dead counter-evidence link never changes the outcome. When no counter-evidence exists the prompt is exactly the one used before this feature.
- **Why early judging needs a quiet vow.** Skeptics can only react while a vow is open. Early confirmation therefore waits until half of the time has passed and is refused as soon as anyone has doubted the vow, so it cannot be used to close the door on a skeptic who is still looking.
- **Keeper records.** `record_of(address)` returns kept and broken counts, the current streak, the best streak and `kept_stake`, the total GEN staked on kept vows. Vows can be made with a very small stake, so read the streak together with `kept_stake`.

### Limits to know about

- Counter-evidence widens the surface for prompt injection: a doubter can now try to steer the judge, just as a keeper always could. Both kinds of page are wrapped as untrusted data and only the verdict is compared across validators, but the wording of the rules in `_prompt` should be exercised on Studionet with real pages before anyone stakes real value.
- Slots for counter-evidence are ranked by each holder's current doubt. A keeper's second wallet can still occupy a slot; it takes a larger doubt to displace it.
- `release` refunds everyone after thirty days, so an attacker who could keep `judge` failing would only delay a verdict, never lock funds. It also means a keeper who manages that gets a refund instead of a verdict.
- A doubter who stakes 0.01 GEN switches off early confirmation for that vow. It costs them the 0.01 GEN if the vow is kept.
- Every early check runs the judges, and the caller pays for it. The fifteen-minute gap limits repeats on one vow.
- The app labels evidence links as a public record, an archived snapshot or editable by its owner. This is a hint based on the shape of the address; it does not verify anything.

- The judge only sees the first 6,000 characters of text on the evidence page.
- A keeper who controls the evidence page can write anything on it. Prefer pages the keeper cannot edit alone, such as a public repository, a commit history or a third-party listing.
- Vow text and page text are stripped of angle brackets and passed to the model as tagged data with an instruction to ignore commands inside them. This reduces prompt injection, it does not remove it.
- A fixed 0.01 GEN doubt can win a large share of a broken vow when nobody else doubts. That is intended, and it is also why keepers should choose stakes they are willing to lose.
- Anyone can fill the faith cap of a vow with a single backing, which stops others from adding faith. It costs the backer nothing if the vow is kept.
- Judging happens once, at the time `judge` is called after the deadline. A page that changes later does not reopen the verdict.
- When a payout is claimed the contract records it at once, but the transfer itself is delivered when the claim transaction finalizes.

## Run it on Studionet

Requirements: Node 18+, Python 3.12+, a browser wallet.

```bash
pip install -r requirements.txt
genvm-lint check contracts/lumen.py

npm install -g genlayer
genlayer network set studionet
genlayer deploy --contract contracts/lumen.py
```

Copy the printed address, then:

```bash
cd frontend
cp .env.example .env        # paste the address into VITE_LUMEN_ADDRESS
npm install
npm run dev
```

Or deploy from a script that also writes the address into `frontend/.env`:

```bash
cd frontend
npm install
DEPLOY_KEY=0x<funded private key> npm run deploy
```

Open the app, connect your wallet (it is switched to Studionet automatically) and fund the address from the faucet in [GenLayer Studio](https://studio.genlayer.com). Choose the five minute deadline to see the whole cycle quickly.

`genlayer-js` is pinned to `1.1.8` (what `latest` resolved to), and `package-lock.json` is committed. The 2.x line targets the Consensus v0.6 networks and changes how fees work, so move to it deliberately, together with the network it matches, not through a floating tag. The Python test tools are pinned in `requirements.txt` too.

If Studionet reports a missing runner, replace the `Depends` hash on the first line of the contract with the one used by the example contracts in Studio.

## Tests

```bash
pip install -r requirements.txt
pytest
```

The suite runs the contract in memory with mocked web pages and LLM answers. It covers input validation (including evidence address rules), backing rules and the faith cap, counter-evidence rules and slot ranking, early confirmation, a regression test for the self-doubt attack, every verdict and payout, the unreadable-page retry path, single-use claims, streaks, paging and validator agreement. `tests/direct/test_economics.py` checks the payout math on its own: payouts never exceed the pool, and rounding dust stays at a few wei.

## Frontend notes

- `src/sky.ts` draws the sky on a canvas. Kept lanterns rise, open ones hover, spent ones sink toward the water. Lanterns of one keeper that were both kept are joined by a gold line. A verdict that arrives while the page is open bursts into sparks.
- The app reads the network date from the RPC endpoint when it can and uses it for deadlines and phases, so a device clock that is a few minutes off does not change what you see. Stake fields accept a comma as decimal separator and non-Latin digits. The app follows account switches in the wallet.
- Every vow has a link (`#vow=<id>`): selecting a lantern updates the address bar and the drawer has a Copy link button. The drawer previews what an amount would return if the vow is kept, broken or unclear; `src/payout.ts` mirrors the contract's payout rules and `npm run check:payout` checks it against vectors produced by the contract code.
- The ledger can be searched and sorted. When a wallet is connected, My vows dims every other keeper's lantern in the sky and filters the ledger. Clicking the wallet button disconnects it.
- Motion respects `prefers-reduced-motion`.
- `src/chain.ts` reads the contract through `genlayer-js`, and only sends fee parameters when the network reports that it charges them.
- `src/evidence.ts` holds the evidence-link rule (the same as the contract's, applied after the link is normalized to lower-case scheme and punycode host), the link labels and the early-confirmation window. `npm run check:evidence` checks it with Node 22.6 or newer and needs no install.
- The app loads the 60 newest vows and shows a "Show older vows" button when there are more. Pages already loaded stay loaded across refreshes.
