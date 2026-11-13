# The protocol

How a vow lives, how it is judged and why the rules are what they are. The contract is `contracts/lumen.py` (version 2.0.0); every number below is a constant in it, and `params()` reports them.

## How it works

1. `make_vow(text, evidence_url, deadline)` locks the keeper's stake (minimum 0.1 GEN).
2. Until the deadline the keeper can post up to five short progress notes with `post_update(vow_id, text)`. Notes are public and timestamped, and the judges never read them. While nobody has backed the vow, the keeper can also `retract(vow_id)`: a fifth of the stake is burned, the rest is claimable and the keeper's streak ends.
3. Until the deadline anyone except the keeper can call `back(vow_id, "faith" | "doubt")` with at least 0.01 GEN. An address picks one side per vow. Total faith on a vow is capped at half of the keeper's stake; doubt has no cap.
4. After the deadline anyone can call `judge(vow_id)`. The leader fetches the evidence page and asks an LLM for a verdict. A favourable verdict (`FULFILLED`) has to come with a verbatim quote from one source and a date on or before the deadline; the contract checks both itself (see "Evidence you can trust" below). Validators repeat the reading and must agree on the verdict, and each of them must find the leader's quote on its own copy of the page and arrive at the same proof tier for it (for a snapshot, also the same capture day), so a leader cannot label a page with a firmer standing than the archive gave it. The wording of the note may differ.
5. A kept or broken verdict is only a **proposal**. It opens a review window (`review_end` in the vow row) in which the losing side can `dispute(vow_id, url)`. Nothing is payable and no record or ember count changes until the vow is final. `UNCLEAR` is final at once because it refunds everyone.
6. After the window anyone calls `finalize(vow_id)`. Without disputes the proposal stands. With disputes the validators read once more, with the disputed pages included, and that result is final.
7. `claim(vow_id)` pays out.
8. If a vow has no final verdict thirty days after its deadline (or after its review window), anyone can call `release(vow_id)`. It closes the vow as unclear and everyone can claim a full refund.

### Evidence you can trust

A page the keeper runs can say anything, and can be edited after the deadline. The contract therefore never lets a model answer alone move money.

- **How hard is the page to rewrite?** Every link has a provenance. Its shape says what it could be: a candidate `snapshot` (a Wayback replay link, `web.archive.org/web/<14 digits>/<url>`), a `permalink` (a commit-pinned or blob-pinned link on GitHub, GitLab or Codeberg, or a content-addressed `/ipfs/<cid>` link) or `mutable` (everything else). The shape alone proves nothing about a Wayback link, because the 14 digits are only what was asked for: a link for a time without a capture is answered with the nearest capture, which can be one taken after the deadline. So when the validators read the page they authenticate the capture the archive actually served (next point). The vow row's `provenance` is the shape-based hint; the class a verdict relied on, after that check, is `proof.tier`.
- **Authenticating an archive capture.** A candidate snapshot counts as a `snapshot` only if the archive confirms it. Every replay the archive serves carries a `Memento-Datetime` header with the time of the capture it served (headers of the archived site are re-labelled `x-archive-orig-*`, so the archived page cannot forge it). The validators read that header and the snapshot counts only if it names exactly the capture in the link, that capture was taken by the deadline, and it is not in the future. Archive redirects are followed at most three times and only within `web.archive.org/web/`; the capture that is finally served is the one that is checked. If anything cannot be confirmed (a redirect to another capture, a header that is missing, malformed or different from the address that was served, a redirect out of the archive, a loop, an error status) the link is treated as `mutable`: it can still be read, but it gets no special authority, and it has to show a dated completion like any other editable page. A snapshot link is never read through the rendered fallback, because a browser follows redirects anywhere and hides the headers.
- **Pins.** Before the deadline the keeper can call `pin_evidence(vow_id, url)` up to twice to attach a `snapshot` or `permalink`. A snapshot must already look like a capture that exists (its capture time is not in the future); the archive's confirmation happens when the vow is judged, not when it is pinned. Validators read pins together with the main page.
- **Quote and date.** A `FULFILLED` answer must name the source it relies on, copy a quote of at least 12 characters, and (unless the source is a snapshot that the archive confirmed was taken by the deadline, whose date is then the capture time) copy the words that give the date and a `YYYY-MM-DD` that those words show. The contract checks that both quotes appear on the page, that the date is real and on or before the deadline's day, and that the quote shows it. If anything fails the verdict becomes `BROKEN`. So work published after the deadline, an undated page, a page that merely announces its own verdict, and a made-up quote all fail, whatever the model said. Each validator re-checks the leader's quote against its own fetch.
- **Counter-evidence is ranked by provenance.** A doubter's page can only lower a verdict, and only through a verbatim quote that the judge calls a concrete contradiction. How far it can lower it depends on how firm each side is:

  | Doubter's page | Keeper's proof | Result |
  |---|---|---|
  | firm (snapshot or permalink) | editable | `BROKEN` |
  | firm | firm | `UNCLEAR` (two firm records disagree; refund) |
  | editable | editable | `UNCLEAR` (a dispute between two editable pages; refund) |
  | editable | firm | ignored |

  So a crowd of doubters writing invented pages can cancel a vow with a refund at most; they cannot win the stake. Pointing at a page nobody else can edit is how a doubter wins.
- **Review window.** A kept or broken proposal can be disputed for one eighth of the vow's lifetime (at least ten minutes, at most two days). Proof that rests on an editable page, and every broken proposal, gets double that. In a kept proposal doubters dispute with counter-evidence. In a broken proposal the keeper and faith backers dispute with a rebuttal page, which still has to show a dated completion on or before the deadline, so finishing late does not help. Each side has three slots, a larger position can replace the smallest, and each address submits once.
- **Early confirmation stays challengeable.** An early `FULFILLED` also opens a review window, and during it the vow stays open to new doubt (not faith), so confirming early cannot shut out a skeptic.
- **Public proof.** The vow row shows the proof a kept verdict rests on: source, quote, date and a SHA-256 fingerprint of the page text.

Two optional steps sit around judging:

- **Counter-evidence.** Until the deadline, a doubter can call `challenge(vow_id, url)` once to point the judges at a page that argues the vow failed. The judges read it together with the keeper's page, treat it as a claim rather than a fact, and use it only when it gives concrete facts (dates, names, links, numbers) that contradict the keeper's page. Counter-evidence can lower a verdict, never raise one, and what it can lower it to depends on provenance (see above). A vow keeps at most three such pages; when all slots are taken, a doubter whose doubt is larger than the smallest holder's current doubt replaces that holder, who may then submit again.
- **Early confirmation.** Halfway to the deadline, `judge(vow_id)` can be called while nobody doubts the vow. An early check can only confirm the vow. If the page does not show the work yet, the vow stays open, a note is recorded and nothing is counted against the keeper. Early checks of one vow are at least fifteen minutes apart.

| Verdict | Keeper | Faith backers | Doubters |
|---|---|---|---|
| Kept | stake back, plus the doubt pool if nobody backed with faith | backing back, plus a pro-rata share of the doubt pool | lose their backing |
| Broken | loses the stake | lose their backing | backing back, plus a pro-rata share of half the stake and the whole faith pool |
| Unclear | stake back | backing back | backing back |
| Retracted | stake back minus a fifth, which is burned | nobody (a vow with backing cannot be retracted) | nobody |

Half of a broken stake and a fifth of a retracted stake are burned (shown as embers). If nobody doubted a broken vow, its stake and faith pool are burned in full; the app warns faith backers about this before they back a vow nobody doubts. Burned GEN stays in the contract and is never paid out.

### Design decisions

- **Why half is burned, and why faith is capped.** A keeper can doubt their own vow from a second address. Burning half of a broken stake means they lose half of it that way. But the doubters also win the faith pool, so a keeper who lets a vow fail and doubts it from a second address nets `faith - stake / 2`. Capping total faith at half of the stake makes that number zero or negative, so the trick never pays. Without the cap, a 0.1 GEN stake with 10 GEN of faith behind it would pay the keeper almost 10 GEN.
- **Unreadable pages.** A page that cannot be read (network error, HTTP error, or fewer than 20 characters of text) does not decide the vow. `judge` can be called again an hour after the last attempt, up to three attempts, and the vow is then counted as broken. The hour-long gap means a short outage or a rate limit cannot break a vow, while an unreachable page still cannot be used to dodge a verdict.
- **Evidence addresses.** Evidence must be an `http` or `https` link to a named domain. IP addresses (also when written as four numeric labels, as in `127.0.0.1.example.com`), `localhost`, internal-looking and reserved top-level domains, public wildcard-DNS services such as `nip.io`, credentials in the link, whitespace and custom ports are rejected when the vow is made. Internationalized names are accepted in their punycode form (`xn--`); the app converts them when you paste a link. This checks the shape of the name only. A domain someone controls can still point at a private address, so rely on the web module's own network rules for that.
- **Reading the page.** A plain GET is used first so HTTP errors are never treated as evidence. If the page has little text, a rendered read is tried as well. A page with fewer than 20 characters is treated as unreadable (it is often a soft error such as a rate-limit notice) and retried; on the third and last attempt any text at all is judged, so a terse real page is not broken unread. Only the first 300,000 characters are looked at, and markup is removed in a single pass, so a hostile page cannot make validators run out of time. Only exact `script`, `style` and `noscript` blocks are dropped, comments are removed whole, and a lone `<` in the text is kept as text.
- **Counter-evidence is a claim, not a fact.** The judge answers about the keeper's evidence first, on its own. Only if that answer is a verified `FULFILLED` are doubters' pages put in front of it, in a second question, marked as untrusted. Pages that cannot be read are skipped, so a dead counter-evidence link never changes the outcome.
- **Why a verdict is only proposed.** The page is read once, after the deadline, so a page edited in between can look right. The review window gives everyone who lost something a chance to answer with a record that was not edited, and `finalize` re-reads under dispute. A kept proposal whose page has vanished when it is disputed is closed as unclear.
- **Why early judging needs a quiet vow.** Skeptics can only react while a vow is open. Early confirmation therefore waits until half of the time has passed and is refused as soon as anyone has doubted the vow, so it cannot be used to close the door on a skeptic who is still looking.
- **Keeper records and tiers.** `profile_of(address)` returns the vows made, the kept, broken and retracted counts, the current and best streak, `kept_stake` (the total GEN staked on kept vows) and a `tier`. Vows can be made with a very small stake, so read the streak together with `kept_stake`. `record_of` keeps the shorter version 1 shape. A keeper holds the first tier whose three conditions are all met:

  | Tier | Kept vows | GEN staked on kept vows | Broken vows |
  |---|---|---|---|
  | Constellation | 15 | 20 | at most 1 per 10 kept |
  | Beacon | 7 | 5 | at most 1 per 4 kept |
  | Flame | 3 | 1 | any |
  | Spark | 1 | 0 | any |

- **Why a retraction needs an unbacked vow.** Once anyone has put GEN on either side, a bet is on the table and the keeper cannot withdraw it by calling the whole thing off. Before that, nobody else can be left holding a position, so the only cost of withdrawing is the keeper's own: a fifth of the stake is burned, which makes retracting a vow a worse deal than keeping it but a better one than breaking it. A retraction ends the streak and is shown on the keeper's record, so it cannot be used to hide a vow that was going to fail.
- **Why progress notes are not evidence.** A note is written by the keeper, who could write anything, so the judges never see it. It exists so that supporters and doubters can see how the work is going before they put GEN on a side.
- **The activity feed and incremental sync.** Every state change appends one entry to a feed and raises a revision number. `pulse()` returns that number, so a client can poll cheaply and ask `changes_since(rev)` for the vows that moved. A client that has fallen further behind than 60 vows, or that holds a revision from another contract, gets `reset` and reloads. See `docs/PERFORMANCE.md` for the sizes.

### Limits to know about

- Counter-evidence widens the surface for prompt injection: a doubter can now try to steer the judge, just as a keeper always could. Both kinds of page are wrapped as untrusted data and only the verdict is compared across validators, but the wording of the rules in `_prompt` should be exercised on Studionet with real pages before anyone stakes real value.
- Slots for counter-evidence are ranked by each holder's current doubt. A keeper's second wallet can still occupy a slot; it takes a larger doubt to displace it.
- `release` refunds everyone after thirty days, so an attacker who could keep `judge` failing would only delay a verdict, never lock funds. It also means a keeper who manages that gets a refund instead of a verdict.
- A doubter who stakes 0.01 GEN switches off early confirmation for that vow. It costs them the 0.01 GEN if the vow is kept.
- Every early check runs the judges, and the caller pays for it. The fifteen-minute gap limits repeats on one vow.
- The app labels evidence links as a public record, an archived snapshot or editable by its owner. This is a hint based on the shape of the address; it does not verify anything. The verified class of the page a kept verdict rests on is `proof.tier` in the vow row.

- The judge only sees the first 6,000 characters of text on the evidence page, so a quote has to come from there.
- An editable page can still carry a backdated line. The quote-and-date check proves the page *claims* the work was done by the deadline, not that it was. What stops a lie is the review window and firm records: an archive capture taken before the deadline that shows the page empty outweighs the page. Pin your own proof, and doubters should capture the page before the deadline.
- The capture time of an archive link is taken from the archive's own `Memento-Datetime` header, not from the link. This trusts the Wayback Machine to stamp its replays truthfully and to be reachable from every validator. A capture that cannot be confirmed degrades to an editable page instead of failing, so a flaky or blocked archive costs a keeper the firm treatment (a longer review window, and a firm counter-record can beat the page) rather than the vow. Use the exact capture link the archive gives you; a link for a time with no capture is demoted.
- Counter-evidence submitted before the deadline still counts at judging; pages submitted in the review window are read once, at `finalize`, and that result is final. A first-come flood of dust-sized disputes is limited by slot replacement (a larger position takes the smallest slot), not eliminated.
- The proof fingerprint is a SHA-256 of the extracted page text. It lets people compare what was relied on with what the page says now; consensus does not depend on it.
- A keeper who controls the evidence page can write anything on it. Prefer pages the keeper cannot edit alone, such as a public repository, a commit history or a third-party listing.
- Vow text and page text are stripped of angle brackets and passed to the model as tagged data with an instruction to ignore commands inside them. This reduces prompt injection, it does not remove it.
- A fixed 0.01 GEN doubt can win a large share of a broken vow when nobody else doubts. That is intended, and it is also why keepers should choose stakes they are willing to lose.
- Anyone can fill the faith cap of a vow with a single backing, which stops others from adding faith. It costs the backer nothing if the vow is kept.
- Once a vow is final it is never reopened; a page that changes after `finalize` changes nothing.
- When a payout is claimed the contract records it at once, but the transfer itself is delivered when the claim transaction finalizes.
- A keeper who sees a vow failing can still retract it, but only before the deadline and only while nobody has backed it, and it costs a fifth of the stake and the streak. Once anyone has backed the vow, the keeper has no way out.
- Progress notes are public and permanent. They are cleaned of control characters and angle brackets, but their content is the keeper's own words.
