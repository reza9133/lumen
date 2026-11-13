# Security notes

What the design defends against, what it deliberately does not, and what to do before staking real value. The protocol reasoning behind each rule is in `docs/PROTOCOL.md`.

> **Before staking real value**, exercise the wording of the judging prompt (`_prompt` in the contract) on Studionet with real pages. The in-memory tests fix what the model "says"; only a live run shows what it says. One live run exists (`evidence/live-e2e/2026-11-13T10-13-50Z/`): the validators proposed KEPT for the fixture page that shows the work and BROKEN for the one that shows nothing. That is one run on three fixture pages, not a guarantee for other pages.

## Assets and who can touch them

Everything at stake is GEN held by the contract: stakes and backings. It leaves only through `claim`, which pays an address what the payout rules owe it, once. `claim` marks the position as claimed before it pays, and a payout is never larger than the pool it comes from (checked by the economics tests and by the fuzz test after every step). The transfer is a message delivered when the claim transaction finalizes.

| Actor | Can | Cannot |
|---|---|---|
| Keeper | make vows, add pins and notes, retract an unbacked vow, dispute a broken proposal | back their own vow, retract once anyone has backed it, change a verdict |
| Backer (faith or doubt) | back one side, claim | switch sides, exceed the faith cap |
| Doubter | add counter-evidence, dispute a kept proposal | raise a verdict (counter-evidence can only lower one) |
| Anyone | `judge`, `finalize`, `release` | choose the verdict or move money |
| Validators | agree on the verdict and the proof | have their answer trusted without the contract's own check of quote and date |

## Threats and how they are handled

**A model answer that moves money by itself.** A favourable verdict must name a source, copy a verbatim quote of at least 12 characters and a date on or before the deadline. The contract verifies that the quote is on the page, that the date is real and shown by the quote, and that it is on time. Every validator re-checks the leader's quote against its own fetch. A page that merely announces its own verdict, an invented quote or work dated after the deadline fails whatever the model said.

**Prompt injection.** Vow text and page text lose angle brackets and are passed as tagged data with an instruction to ignore commands inside them. This reduces injection; it does not remove it. Counter-evidence widens the surface (a doubter can try to steer the judge, as a keeper always could); it is wrapped as untrusted data, can only lower a verdict, and only through a verbatim quote the judge calls a concrete contradiction. Progress notes are never given to the judges at all.

**Editable evidence.** A keeper who controls the page can write anything on it, and a backdated line passes the date check. The defence is the review window and firm records: an archive capture from before the deadline that shows the page empty outweighs the page. Keepers should prefer pages they cannot edit alone; doubters should capture the page before the deadline.

**Archive capture forgery.** The capture time of an archive link comes from the archive's own `Memento-Datetime` header, never from the link. Redirects are followed only inside `web.archive.org/web/`, at most three times. Anything that cannot be confirmed demotes the link to an editable page, which costs the keeper the firm treatment, not the vow. This trusts the Wayback Machine to stamp replays truthfully and to be reachable from every validator.

**Self-doubt.** A keeper can doubt their own vow from a second address. Half of a broken stake is burned and total faith is capped at half of the stake, so the trick never pays: the keeper's net is `faith - stake / 2`, which the cap makes zero or negative.

**Retraction abuse.** A keeper could try to retract a vow that is about to be judged against them, or after someone bet on it. Retraction is refused after the deadline and as soon as anyone has backed either side, costs a fifth of the stake, and ends the streak and shows on the record. So it is never a free exit, and nobody holds a position on a retracted vow.

**Stuck funds.** `release` closes a vow with no final verdict thirty days after its deadline (or after its review window) as unclear, so an attacker who could keep `judge` failing only delays a verdict. Unreadable pages are retried an hour apart, up to three times, so a short outage cannot break a vow.

**Slot crowding.** Counter-evidence and dispute slots are limited (three each). A larger position replaces the smallest, so a crowd of dust positions cannot lock out a serious one. A keeper's second wallet can still occupy a slot; displacing it takes a larger position.

**Hostile pages and inputs.** Only the first 300,000 characters of a page are looked at and markup is removed in a single left-to-right pass, so a hostile page cannot make validators run out of time. Evidence links must be `http(s)` to a named domain: IP addresses (also as four numeric labels), `localhost`, reserved top-level domains, public wildcard-DNS services, credentials, whitespace and custom ports are refused. The name check does not stop a domain from pointing at a private address; that is left to the network rules of the web module.

**Hostile text.** Vow and note text are cleaned of control and invisible characters (the zero-width non-joiner is kept, because words in several scripts need it) and of angle brackets, and notes are stored one per line with a separator, so a note cannot forge another note (tested). The frontend renders text through React and never as HTML.

**Unbounded reads.** Every list view is clamped (60 vows, 100 feed entries, 100 keepers) and `vows_of` scans at most 1,500 vows per call and returns a cursor. `changes_since` returns a reset instead of an unbounded answer.

## Limits to know about

- A fixed 0.01 GEN doubt can win a large share of a broken vow when nobody else doubts. That is intended, and it is why keepers should choose stakes they are willing to lose.
- Anyone can fill the faith cap of a vow with a single backing, which stops others from adding faith. It costs the backer nothing if the vow is kept.
- A doubter who stakes 0.01 GEN switches off early confirmation for that vow.
- Every early check runs the judges and the caller pays for it. The fifteen-minute gap limits repeats on one vow.
- The judge only sees the first 6,000 characters of the evidence page, so a quote has to come from there.
- Once a vow is final it is never reopened. A page that changes after `finalize` changes nothing.
- The proof fingerprint is a SHA-256 of the extracted page text. It lets people compare what was relied on with what the page says now; consensus does not depend on it.
- The app labels evidence links by their shape (public record, archived snapshot, editable). It is a hint, not a check; the verified class is `proof.tier`.
- The contract is not audited. The tests are extensive (see `docs/TESTING.md`) but they fix the model's answers.

## The live runner and secrets

The runner creates throwaway accounts and funds them from the Studio faucet. Their keys are written to `e2e/.accounts.json`, which is git-ignored; never commit it. If you supply your own funded keys with `E2E_KEYS`, they stay in the environment of the process and are not written to the report. The report contains addresses and transaction hashes only. `DEPLOY_KEY` for `npm run deploy` is read from the environment and should be a key you are willing to lose.
