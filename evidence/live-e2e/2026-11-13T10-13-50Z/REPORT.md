# Lumen live end-to-end report

**Result:** PASS: every check held.

- Network: Studionet (https://studio.genlayer.com/api)
- Contract: `0x65b24E33838f738C74304Ba6c03A3787bB0C4360`
- Started 2026-11-13T10:13:50.068Z, finished 2026-11-13T10:58:46.623Z, Node v24.22.2
- Evidence pages served from `https://raw.githubusercontent.com/reza9133/lumen/main/evidence/fixtures`, pinned at `https://github.com/reza9133/lumen/blob/329f96bba3ae8d8802af82d0a91117e219a26ab9/evidence/fixtures`

## Scenarios

| scenario | status | what happened |
|---|---|---|
| deploy | PASS | deployed in tx 0xc693d1f6e42bf7cfd467a328660c3ed9dfe1b02c0580b447ce751a2d8f556ab8 |
| adversarial | PASS | 105 checks, retraction and its payout verified |
| kept | PASS | vow #1 ended KEPT |
| broken | PASS | vow #2 ended BROKEN |
| retract | PASS | vow #0 retracted, 0.32 GEN claimed |
| directory | PASS | 5 vows cross-checked against the read model |

## Checks

223 of 223 passed; 0 warnings; 0 failed.

| scenario | kind | check | result | detail |
|---|---|---|---|---|
| deploy | behavior | the deployed contract is the version in this repository | PASS | version 2.0.0 |
| adversarial | behavior | a vow with a too short text: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a vow with a too short text: reason is "too short" | PASS | reason found in the receipt |
| adversarial | invariant | a vow with a too short text: state untouched | PASS | the vows of advKeeper is unchanged |
| adversarial | behavior | evidence on an IP address: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | evidence on an IP address: reason is "single http(s) link" | PASS | reason found in the receipt |
| adversarial | invariant | evidence on an IP address: state untouched | PASS | the vows of advKeeper is unchanged |
| retract | behavior | state is RETRACTED and the note says why | PASS | state RETRACTED, note "The keeper retracted this vow before anyone backed it." |
| retract | invariant | the stake is counted as 20% burned | PASS | embers +80000000000000000 (expected 80000000000000000) |
| retract | behavior | the keeper's record shows one retraction and no streak | PASS | retracted 1, streak 0 |
| retract | invariant | keeperR: payout matches the independent rules | PASS | chain 320000000000000000, rules 320000000000000000 (state RETRACTED) |
| adversarial | behavior | evidence that is not http(s): rejected | PASS | the receipt reports an error result |
| adversarial | behavior | evidence that is not http(s): reason is "single http(s) link" | PASS | reason found in the receipt |
| adversarial | invariant | evidence that is not http(s): state untouched | PASS | the vows of advKeeper is unchanged |
| kept | behavior | the pinned link counts as a permalink | PASS | https://github.com/reza9133/lumen/blob/329f96bba3ae8d8802af82d0a91117e219a26ab9/evidence/fixtures/kept.md |
| kept | behavior | backing and notes are on the vow | PASS | faith 100000000000000000, doubt 60000000000000000, notes 1 |
| kept | behavior | the evidence address is judged as a mutable page | PASS | mutable |
| adversarial | behavior | a deadline closer than one minute: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a deadline closer than one minute: reason is "Deadline must be" | PASS | reason found in the receipt |
| adversarial | invariant | a deadline closer than one minute: state untouched | PASS | the vows of advKeeper is unchanged |
| retract | invariant | keeperR: native GEN arrived after the claim | PASS | expected 0.32 GEN, balance change 0.32 GEN (transaction fees explain a smaller change) |
| retract | invariant | keeperR: claim is recorded | PASS | claimed=true |
| broken | behavior | a second counter-evidence page from the same doubter: rejected | PASS | the receipt reports an error result |
| broken | behavior | a second counter-evidence page from the same doubter: reason is "already submitted" | PASS | reason found in the receipt |
| broken | invariant | a second counter-evidence page from the same doubter: state untouched | PASS | vow #2 is unchanged |
| broken | behavior | backing and notes are on the vow | PASS | faith 100000000000000000, doubt 60000000000000000, notes 1 |
| broken | behavior | the evidence address is judged as a mutable page | PASS | mutable |
| adversarial | behavior | a deadline further than a year: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a deadline further than a year: reason is "Deadline must be" | PASS | reason found in the receipt |
| adversarial | invariant | a deadline further than a year: state untouched | PASS | the vows of advKeeper is unchanged |
| retract | behavior | keeperR claims twice: rejected | PASS | the receipt reports an error result |
| retract | behavior | keeperR claims twice: reason is "Already claimed" | PASS | reason found in the receipt |
| retract | invariant | keeperR claims twice: state untouched | PASS | vow #0 is unchanged |
| retract | invariant | every wei on the vow is paid or burned (rounding dust only) | PASS | vow holds 0.4 GEN; owed 0.32 GEN; burned 0.08 GEN; dust 0 wei |
| adversarial | behavior | a stake below the minimum: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a stake below the minimum: reason is "minimum stake" | PASS | reason found in the receipt |
| adversarial | invariant | a stake below the minimum: state untouched | PASS | the vows of advKeeper is unchanged |
| adversarial | behavior | the new vow is stored as sent | PASS | state OPEN, stake 100000000000000000, provenance mutable |
| adversarial | behavior | the keeper backing their own vow: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | the keeper backing their own vow: reason is "cannot back their own" | PASS | reason found in the receipt |
| adversarial | invariant | the keeper backing their own vow: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | backing below the minimum: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | backing below the minimum: reason is "minimum backing" | PASS | reason found in the receipt |
| adversarial | invariant | backing below the minimum: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | backing a side that does not exist: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | backing a side that does not exist: reason is "faith or doubt" | PASS | reason found in the receipt |
| adversarial | invariant | backing a side that does not exist: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | faith above half of the stake: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | faith above half of the stake: reason is "capped at half" | PASS | reason found in the receipt |
| adversarial | invariant | faith above half of the stake: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | backing a vow that does not exist: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | backing a vow that does not exist: reason is "No such vow" | PASS | reason found in the receipt |
| adversarial | invariant | backing a vow that does not exist: state untouched | PASS | vow #1003 is unchanged |
| adversarial | behavior | an update by someone else: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | an update by someone else: reason is "Only the keeper" | PASS | reason found in the receipt |
| adversarial | invariant | an update by someone else: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | an update that is too short: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | an update that is too short: reason is "too short" | PASS | reason found in the receipt |
| adversarial | invariant | an update that is too short: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | a retraction by someone else: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a retraction by someone else: reason is "Only the keeper" | PASS | reason found in the receipt |
| adversarial | invariant | a retraction by someone else: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | a pin that is a mutable page: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a pin that is a mutable page: reason is "commit-pinned" | PASS | reason found in the receipt |
| adversarial | invariant | a pin that is a mutable page: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | a pin from the future: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a pin from the future: reason is "before now" | PASS | reason found in the receipt |
| adversarial | invariant | a pin from the future: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | a pin by someone else: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a pin by someone else: reason is "Only the keeper" | PASS | reason found in the receipt |
| adversarial | invariant | a pin by someone else: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | judging before halfway to the deadline: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | judging before halfway to the deadline: reason is "halfway" | PASS | reason found in the receipt |
| adversarial | invariant | judging before halfway to the deadline: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | finalizing a vow that is not under review: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | finalizing a vow that is not under review: reason is "not under review" | PASS | reason found in the receipt |
| adversarial | invariant | finalizing a vow that is not under review: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | claiming from an open vow: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | claiming from an open vow: reason is "no final verdict" | PASS | reason found in the receipt |
| adversarial | invariant | claiming from an open vow: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | disputing a vow that is not under review: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | disputing a vow that is not under review: reason is "not under review" | PASS | reason found in the receipt |
| adversarial | invariant | disputing a vow that is not under review: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | counter-evidence from someone who does not doubt: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | counter-evidence from someone who does not doubt: reason is "Only doubters" | PASS | reason found in the receipt |
| adversarial | invariant | counter-evidence from someone who does not doubt: state untouched | PASS | vow #3 is unchanged |
| kept | behavior | backing after the deadline: rejected | PASS | the receipt reports an error result |
| kept | behavior | backing after the deadline: reason is "no longer takes backing" | PASS | reason found in the receipt |
| kept | invariant | backing after the deadline: state untouched | PASS | vow #1 is unchanged |
| broken | behavior | backing after the deadline: rejected | PASS | the receipt reports an error result |
| broken | behavior | backing after the deadline: reason is "no longer takes backing" | PASS | reason found in the receipt |
| broken | invariant | backing after the deadline: state untouched | PASS | vow #2 is unchanged |
| adversarial | behavior | releasing a vow that is not 30 days overdue: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | releasing a vow that is not 30 days overdue: reason is "thirty days" | PASS | reason found in the receipt |
| adversarial | invariant | releasing a vow that is not 30 days overdue: state untouched | PASS | vow #3 is unchanged |
| kept | behavior | an update after the deadline: rejected | PASS | the receipt reports an error result |
| kept | behavior | an update after the deadline: reason is "deadline has passed" | PASS | reason found in the receipt |
| kept | invariant | an update after the deadline: state untouched | PASS | vow #1 is unchanged |
| adversarial | behavior | get_vow for a vow that does not exist fails (No such vow) | PASS | the read was refused |
| broken | behavior | an update after the deadline: rejected | PASS | the receipt reports an error result |
| broken | behavior | an update after the deadline: reason is "deadline has passed" | PASS | reason found in the receipt |
| broken | invariant | an update after the deadline: state untouched | PASS | vow #2 is unchanged |
| adversarial | behavior | position_of for a vow that does not exist fails (No such vow) | PASS | the read was refused |
| kept | behavior | a retraction after the deadline: rejected | PASS | the receipt reports an error result |
| kept | behavior | a retraction after the deadline: reason is "deadline has passed" | PASS | reason found in the receipt |
| kept | invariant | a retraction after the deadline: state untouched | PASS | vow #1 is unchanged |
| broken | behavior | a retraction after the deadline: rejected | PASS | the receipt reports an error result |
| broken | behavior | a retraction after the deadline: reason is "deadline has passed" | PASS | reason found in the receipt |
| broken | invariant | a retraction after the deadline: state untouched | PASS | vow #2 is unchanged |
| kept | verdict | the validators proposed KEPT | PASS | state REVIEW, proposed KEPT, note: The Release 2.0.0 entry was published on 2026-01-15, before the deadline, confirmed by a permalink source. |
| kept | behavior | the review window is at least ten minutes | PASS | 600s |
| kept | behavior | the proof tier follows from the proof address | PASS | tier permalink for https://github.com/reza9133/lumen/blob/329f96bba3ae8d8802af82d0a91117e219a26ab9/evidence/fixtures/kept.md |
| broken | verdict | the validators proposed BROKEN | PASS | state REVIEW, proposed BROKEN, note: Source states release 2.0.0 entry has not been written or published. |
| broken | behavior | the review window is at least ten minutes | PASS | 1200s |
| kept | behavior | judging again while a verdict is proposed: rejected | PASS | the receipt reports an error result |
| kept | behavior | judging again while a verdict is proposed: reason is "already proposed" | PASS | reason found in the receipt |
| kept | invariant | judging again while a verdict is proposed: state untouched | PASS | vow #1 is unchanged |
| broken | behavior | judging again while a verdict is proposed: rejected | PASS | the receipt reports an error result |
| broken | behavior | judging again while a verdict is proposed: reason is "already proposed" | PASS | reason found in the receipt |
| broken | invariant | judging again while a verdict is proposed: state untouched | PASS | vow #2 is unchanged |
| kept | behavior | finalizing before the review window ends: rejected | PASS | the receipt reports an error result |
| kept | behavior | finalizing before the review window ends: reason is "still open" | PASS | reason found in the receipt |
| kept | invariant | finalizing before the review window ends: state untouched | PASS | vow #1 is unchanged |
| broken | behavior | finalizing before the review window ends: rejected | PASS | the receipt reports an error result |
| broken | behavior | finalizing before the review window ends: reason is "still open" | PASS | reason found in the receipt |
| broken | invariant | finalizing before the review window ends: state untouched | PASS | vow #2 is unchanged |
| kept | behavior | claiming during the review window: rejected | PASS | the receipt reports an error result |
| kept | behavior | claiming during the review window: reason is "no final verdict" | PASS | reason found in the receipt |
| kept | invariant | claiming during the review window: state untouched | PASS | vow #1 is unchanged |
| broken | behavior | claiming during the review window: rejected | PASS | the receipt reports an error result |
| broken | behavior | claiming during the review window: reason is "no final verdict" | PASS | reason found in the receipt |
| broken | invariant | claiming during the review window: state untouched | PASS | vow #2 is unchanged |
| adversarial | behavior | a sixth progress note: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | a sixth progress note: reason is "at most five" | PASS | reason found in the receipt |
| adversarial | invariant | a sixth progress note: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | five progress notes are stored in order | PASS | 5 notes |
| adversarial | behavior | the vow is retracted | PASS | state RETRACTED |
| adversarial | invariant | a fifth of the stake is burned and counted as embers | PASS | embers +20000000000000000, retracted +1 |
| adversarial | behavior | backing a retracted vow: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | backing a retracted vow: reason is "no longer takes backing" | PASS | reason found in the receipt |
| adversarial | invariant | backing a retracted vow: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | retracting twice: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | retracting twice: reason is "already been judged" | PASS | reason found in the receipt |
| adversarial | invariant | retracting twice: state untouched | PASS | vow #3 is unchanged |
| adversarial | behavior | an update after the retraction: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | an update after the retraction: reason is "already been judged" | PASS | reason found in the receipt |
| adversarial | invariant | an update after the retraction: state untouched | PASS | vow #3 is unchanged |
| adversarial | invariant | advKeeper: payout matches the independent rules | PASS | chain 80000000000000000, rules 80000000000000000 (state RETRACTED) |
| adversarial | invariant | advKeeper: native GEN arrived after the claim | PASS | expected 0.08 GEN, balance change 0.08 GEN (transaction fees explain a smaller change) |
| adversarial | invariant | advKeeper: claim is recorded | PASS | claimed=true |
| adversarial | behavior | advKeeper claims twice: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | advKeeper claims twice: reason is "Already claimed" | PASS | reason found in the receipt |
| adversarial | invariant | advKeeper claims twice: state untouched | PASS | vow #3 is unchanged |
| adversarial | invariant | advBacker: payout matches the independent rules | PASS | chain 0, rules 0 (state RETRACTED) |
| adversarial | behavior | advBacker claims with nothing owed: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | advBacker claims with nothing owed: reason is "Nothing to claim" | PASS | reason found in the receipt |
| adversarial | invariant | advBacker claims with nothing owed: state untouched | PASS | vow #3 is unchanged |
| adversarial | invariant | every wei on the vow is paid or burned (rounding dust only) | PASS | vow holds 0.1 GEN; owed 0.08 GEN; burned 0.02 GEN; dust 0 wei |
| adversarial | behavior | switching from faith to doubt: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | switching from faith to doubt: reason is "already back" | PASS | reason found in the receipt |
| adversarial | invariant | switching from faith to doubt: state untouched | PASS | vow #4 is unchanged |
| kept | verdict | the final state is KEPT | PASS | final KEPT, note: The Release 2.0.0 entry was published on 2026-01-15, before the deadline, confirmed by a permalink source. |
| kept | invariant | keeperK: payout matches the independent rules | PASS | chain 400000000000000000, rules 400000000000000000 (state KEPT) |
| adversarial | behavior | retracting a vow that has backing: rejected | PASS | the receipt reports an error result |
| adversarial | behavior | retracting a vow that has backing: reason is "has backing" | PASS | reason found in the receipt |
| adversarial | invariant | retracting a vow that has backing: state untouched | PASS | vow #4 is unchanged |
| adversarial | behavior | the vow with backing stays open | PASS | state OPEN, faith 20000000000000000 |
| kept | invariant | keeperK: native GEN arrived after the claim | PASS | expected 0.4 GEN, balance change 0.4 GEN (transaction fees explain a smaller change) |
| kept | invariant | keeperK: claim is recorded | PASS | claimed=true |
| kept | behavior | keeperK claims twice: rejected | PASS | the receipt reports an error result |
| kept | behavior | keeperK claims twice: reason is "Already claimed" | PASS | reason found in the receipt |
| kept | invariant | keeperK claims twice: state untouched | PASS | vow #1 is unchanged |
| kept | invariant | faithK: payout matches the independent rules | PASS | chain 160000000000000000, rules 160000000000000000 (state KEPT) |
| kept | invariant | faithK: native GEN arrived after the claim | PASS | expected 0.16 GEN, balance change 0.16 GEN (transaction fees explain a smaller change) |
| kept | invariant | faithK: claim is recorded | PASS | claimed=true |
| kept | invariant | doubtK: payout matches the independent rules | PASS | chain 0, rules 0 (state KEPT) |
| kept | behavior | doubtK claims with nothing owed: rejected | PASS | the receipt reports an error result |
| kept | behavior | doubtK claims with nothing owed: reason is "Nothing to claim" | PASS | reason found in the receipt |
| kept | invariant | doubtK claims with nothing owed: state untouched | PASS | vow #1 is unchanged |
| kept | invariant | every wei on the vow is paid or burned (rounding dust only) | PASS | vow holds 0.56 GEN; owed 0.56 GEN; burned 0 GEN; dust 0 wei |
| kept | behavior | the keeper's record gains one kept vow and a streak | PASS | kept 1, streak 1, tier Spark |
| kept | invariant | the tier follows the record | PASS | tier Spark |
| broken | verdict | the final state is BROKEN | PASS | final BROKEN, note: Source states release 2.0.0 entry has not been written or published. |
| broken | invariant | keeperB: payout matches the independent rules | PASS | chain 0, rules 0 (state BROKEN) |
| broken | behavior | keeperB claims with nothing owed: rejected | PASS | the receipt reports an error result |
| broken | behavior | keeperB claims with nothing owed: reason is "Nothing to claim" | PASS | reason found in the receipt |
| broken | invariant | keeperB claims with nothing owed: state untouched | PASS | vow #2 is unchanged |
| broken | invariant | faithB: payout matches the independent rules | PASS | chain 0, rules 0 (state BROKEN) |
| broken | behavior | faithB claims with nothing owed: rejected | PASS | the receipt reports an error result |
| broken | behavior | faithB claims with nothing owed: reason is "Nothing to claim" | PASS | reason found in the receipt |
| broken | invariant | faithB claims with nothing owed: state untouched | PASS | vow #2 is unchanged |
| broken | invariant | doubtB: payout matches the independent rules | PASS | chain 360000000000000000, rules 360000000000000000 (state BROKEN) |
| broken | invariant | doubtB: native GEN arrived after the claim | PASS | expected 0.36 GEN, balance change 0.36 GEN (transaction fees explain a smaller change) |
| broken | invariant | doubtB: claim is recorded | PASS | claimed=true |
| broken | behavior | doubtB claims twice: rejected | PASS | the receipt reports an error result |
| broken | behavior | doubtB claims twice: reason is "Already claimed" | PASS | reason found in the receipt |
| broken | invariant | doubtB claims twice: state untouched | PASS | vow #2 is unchanged |
| broken | invariant | every wei on the vow is paid or burned (rounding dust only) | PASS | vow holds 0.56 GEN; owed 0.36 GEN; burned 0.2 GEN; dust 0 wei |
| broken | behavior | the keeper's record gains one broken vow and the streak ends | PASS | broken 1, streak 0 |
| directory | behavior | params() reports the version of the contract file | PASS | chain 2.0.0, file 2.0.0 |
| directory | behavior | params() lists four tiers and six states | PASS | Constellation, Beacon, Flame, Spark |
| directory | invariant | pulse() and stats() agree on the revision | PASS | rev 31 |
| directory | behavior | changes_since() returns every vow touched in this run | PASS | reset false, 5 vows, ours 5 |
| directory | invariant | every row of changes_since() equals get_vow() | PASS | 5 rows compared |
| directory | behavior | an up-to-date cursor gets no rows and a cursor from another contract is told to reset | PASS | up to date: 0 rows; future cursor reset=true |
| directory | behavior | activity feed of vow #0 lists what was done, in order | PASS | done: made > update > retracted > claimed; feed: made > update > retracted > claimed |
| directory | behavior | activity feed of vow #1 lists what was done, in order | PASS | done: made > faith > doubt > update > pinned > proposed > kept > claimed > claimed; feed: made > faith > doubt > update > pinned > proposed > kept > claimed > claimed |
| directory | behavior | activity feed of vow #2 lists what was done, in order | PASS | done: made > faith > doubt > update > challenged > proposed > broken > claimed; feed: made > faith > doubt > update > challenged > proposed > broken > claimed |
| directory | behavior | activity feed of vow #3 lists what was done, in order | PASS | done: made > update > update > update > update > update > retracted > claimed; feed: made > update > update > update > update > update > retracted > claimed |
| directory | behavior | activity feed of vow #4 lists what was done, in order | PASS | done: made > faith; feed: made > faith |
| directory | invariant | the feed is newest first with strictly falling sequence numbers | PASS | 31 entries |
| directory | behavior | advKeeper is in the keeper directory with the same profile | PASS | tier Unlit, vows 2 |
| directory | behavior | vows_of(advKeeper) matches the newest vows of that keeper | PASS | 2 rows |
| directory | behavior | keeperK is in the keeper directory with the same profile | PASS | tier Spark, vows 1 |
| directory | behavior | vows_of(keeperK) matches the newest vows of that keeper | PASS | 1 rows |
| directory | behavior | keeperB is in the keeper directory with the same profile | PASS | tier Unlit, vows 1 |
| directory | behavior | vows_of(keeperB) matches the newest vows of that keeper | PASS | 1 rows |
| directory | behavior | keeperR is in the keeper directory with the same profile | PASS | tier Unlit, vows 1 |
| directory | behavior | vows_of(keeperR) matches the newest vows of that keeper | PASS | 1 rows |
| directory | invariant | the vow count grew by the vows of this run | PASS | +5, vows made 5 |
| directory | invariant | the burned total grew by what the rules burn | PASS | embers +300000000000000000, rules 300000000000000000 |
| directory | invariant | the paid total grew by what was claimed | PASS | paid +1320000000000000000, claimed 1320000000000000000 |
| directory | invariant | the contract holds at least what is still claimable | PASS | balance 1.211 GEN, claimable 0.12 GEN |

## Accounts

| role | address | funding | balance at start |
|---|---|---|---|
| deployer | 0x1C0F1EB7079dd75F2F543CBBe388C2747eee0cfb | funded by sim_fundAccount | 1 GEN |
| advKeeper | 0x94e02a932016C72694C23E5Bb156781B632A884b | funded by sim_fundAccount | 1 GEN |
| advBacker | 0xDbF4987F11f66a9ccEC1b1fD9DBE18593e36A038 | funded by sim_fundAccount | 1 GEN |
| keeperK | 0x96006CB04a0270C7E40AE9577A6AeD99802e693f | funded by sim_fundAccount | 1 GEN |
| faithK | 0xCE68bC69b7E536b296D21D1820b4B6831D3197c2 | funded by sim_fundAccount | 1 GEN |
| doubtK | 0xc5874044bf98C04355cA21a85276Ed529B8c1Cea | funded by sim_fundAccount | 1 GEN |
| keeperB | 0xcC0d10eCDDF263c9D91a956aC353Ff4C13609252 | funded by sim_fundAccount | 1 GEN |
| faithB | 0xF94239C5655D5596c64840B7a61b1C42FcF7C3dE | funded by sim_fundAccount | 1 GEN |
| doubtB | 0xF04C65FdcAC2CEa8E4138025ceA92c3cb589cd9d | funded by sim_fundAccount | 1 GEN |
| keeperR | 0xC2ad365CEC1ec59B2573ee48738fCfa33A14B63a | funded by sim_fundAccount | 1 GEN |

## Payouts, retract vow #0 (RETRACTED)

| account | role | payout by the rules | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|---|
| keeperR | keeper | 0.32 GEN | 0.6 GEN | 0.92 GEN | 0.32 GEN | 0x5250f0e6bfa2f16700dbb3b351f5910537875bb4e3b99ccf01cae55f6c361df0 |

## Payouts, adversarial vow #3 (RETRACTED)

| account | role | payout by the rules | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|---|
| advKeeper | keeper | 0.08 GEN | 0.33 GEN | 0.41 GEN | 0.08 GEN | 0x47c2a916e7f02986e557549fc6ba63efcbf79dd7c49886715235604ef90d926f |
| advBacker | backer | 0 | - | - | - | nothing to claim (rejected) |

## Payouts, kept vow #1 (KEPT)

| account | role | payout by the rules | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|---|
| keeperK | keeper | 0.4 GEN | 0.6 GEN | 1 GEN | 0.4 GEN | 0x33ce4b2e3ea4f54957da3871cfd1b42a5fe8783cc630e5e66fb1a85a52426770 |
| faithK | backer | 0.16 GEN | 0.9 GEN | 1.06 GEN | 0.16 GEN | 0x471bfc6fbe3ffb3b592419c28d2948d469eb19db923f63b54c2b4072e6e563ef |
| doubtK | backer | 0 | - | - | - | nothing to claim (rejected) |

## Payouts, broken vow #2 (BROKEN)

| account | role | payout by the rules | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|---|
| keeperB | keeper | 0 | - | - | - | nothing to claim (rejected) |
| faithB | backer | 0 | - | - | - | nothing to claim (rejected) |
| doubtB | backer | 0.36 GEN | 0.92 GEN | 1.28 GEN | 0.36 GEN | 0x684da3b1ce8c595ac5bc0756e82583921c140d93883dafb84e5e2e9138e1f063 |

## Contract totals

|  | before the run | after the run |
|---|---|---|
| vows | 0 | 5 |
| kept / broken / retracted | 0 / 0 / 0 | 1 / 1 / 2 |
| keepers | 0 | 4 |
| deposited | 0 GEN | 1.74 GEN |
| paid | 0 GEN | 1.32 GEN |
| burned (embers) | 0 GEN | 0.3 GEN |
| feed revision | 0 | 31 |

## Transactions

| # | scenario | call | by | value | hash | decision | execution | finalized | seconds |
|---|---|---|---|---|---|---|---|---|---|
| 1 | deploy | `(deploy)` | deployer | 0 GEN | `0xc693d1f6e42bf7cfd467a328660c3ed9dfe1b02c0580b447ce751a2d8f556ab8` | - | - | - | 15 |
| 2 | retract | `make_vow` | keeperR | 0.4 GEN | `0x6b39d5d3d289ca39c2610ee0e64f0826a5bdfe148da17f22f1b8674a0517a1a5` | - | - | - | 59 |
| 3 | kept | `make_vow` | keeperK | 0.4 GEN | `0x8544dfe5f440067f326084181c522eb109b42616a14806fae86718285e5fa133` | - | - | - | 59 |
| 4 | broken | `make_vow` | keeperB | 0.4 GEN | `0x32e9cee18e63690fee606ee4bbcbe68fd3447c96a5b52a54eec769e0cb31a22d` | - | - | - | 59 |
| 5 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x331954bc2f4188c3966001c4939e3f2c2de3f4bc7bf2d1d9cdcba3ede9b4147e` | - | - | - | 59 |
| 6 | retract | `post_update` | keeperR | 0 GEN | `0x9e0be3ad45dd1c10d69428d47c85879588c258fb85e19e9ca4ded33fc6b1b508` | - | - | - | 59 |
| 7 | kept | `back` | faithK | 0.1 GEN | `0xd985b0fc19f52d30f77376e1402a389203b8632e510e612f41a42f69c0b36c08` | - | - | - | 59 |
| 8 | broken | `back` | faithB | 0.1 GEN | `0x851221f8e71f8f884505cd9ab2359bfa17e8ad35a69d89fe29ba76cfe458d14f` | - | - | - | 59 |
| 9 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x0f790525b081847951de10de4c0bac2fd918c6796d5af1eb2b7a9a962fe4bfc0` | - | - | - | 59 |
| 10 | retract | `retract` | keeperR | 0 GEN | `0x3fa96ff8bc2fccde6b444d0c9164229477a2903881524edf7197be1bd00b5ee6` | - | - | - | 60 |
| 11 | kept | `back` | doubtK | 0.06 GEN | `0xf235d2eb0c6eea10abd14f8ada88831bd86c18d471718d9f2197a2eecebbf006` | - | - | - | 60 |
| 12 | broken | `back` | doubtB | 0.06 GEN | `0x3c899135eb830546be5b05beff9145c4ab184db25814edd567e066fdb78b4132` | - | - | - | 60 |
| 13 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x444ef7b65b8b7abd208b83b6dda69415a4ff93b31c60965f8322cf5fbce7656e` | - | - | - | 59 |
| 14 | kept | `post_update` | keeperK | 0 GEN | `0xc09addf2ea088791b0b2f59aa1c0f552fa68a296c7489261f743560e4bc5e518` | - | - | - | 60 |
| 15 | broken | `post_update` | keeperB | 0 GEN | `0x2c6ab8c1e6f90711f60e58508b79216e55cd21d2f861d11ed73cf294d46c3f2e` | - | - | - | 60 |
| 16 | retract | `claim` | keeperR | 0 GEN | `0x5250f0e6bfa2f16700dbb3b351f5910537875bb4e3b99ccf01cae55f6c361df0` | - | - | - | 60 |
| 17 | kept | `pin_evidence` | keeperK | 0 GEN | `0x7df57417cfe263b52bb186a33a87b946cc03efdddd709b12fdd0feeae11a3a20` | - | - | - | 60 |
| 18 | broken | `challenge` | doubtB | 0 GEN | `0x153761d6f70f92638c5d9c2be475d95c2b384328545021e0ef7bdd01331b523e` | - | - | - | 60 |
| 19 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x67ed4aec7f5b2c56db99e963b03e3b371ae7ce619893a65161d3eaaf19e69a42` | - | - | - | 51 |
| 20 | broken | `challenge` | doubtB | 0 GEN | `0x730e8deb296c847f9723c19a5c02cfbbfcec8e28533aaeaf88785454672533d0` | - | - | - | 39 |
| 21 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x31ac5005bb013b52c53199cf87e8fbfb5eecf04c498d02818505b16ef53cdde0` | - | - | - | 42 |
| 22 | retract | `claim` | keeperR | 0 GEN | `0xd15e91ebc9e42d558aba190ea42107dd032a3fcab7e947eceb0dd00dd657b561` | - | - | - | 34 |
| 23 | adversarial | `make_vow` | advKeeper | 0.05 GEN | `0x8192db4841e5ae848640f59eaccc1449f5c005da3ebfc369d00bad5b7a5fac40` | - | - | - | 32 |
| 24 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0xa09f72972f9297eb6867db9d0fe5667b118ecb1c189056ac8f3415076f836c1d` | - | - | - | 14 |
| 25 | adversarial | `back` | advKeeper | 0.02 GEN | `0x352c72552d3944380741849a3efe16859a25a40ad69cf7f9e95b1f15a236dc88` | - | - | - | 29 |
| 26 | adversarial | `back` | advBacker | 0.001 GEN | `0x1be3fd5b2a0adbdb12be561b386b8ffd07e2081c76d108194d983cac681e79e3` | - | - | - | 14 |
| 27 | adversarial | `back` | advBacker | 0.02 GEN | `0x7daf9f14af12c52cc3ee82217f3bd79268880a530274eb3ad2af2f08a36b00e7` | - | - | - | 29 |
| 28 | adversarial | `back` | advBacker | 0.1 GEN | `0xc42023b3f5b6c15036e7c672a424bcf11aea7ec39cc7e1d7f4e3a1eb03bd7505` | - | - | - | 14 |
| 29 | adversarial | `back` | advBacker | 0.02 GEN | `0x9242a6823fbf03528eec9fa89a0ee189ea2b5740092d7da3f3b95349253b994f` | - | - | - | 14 |
| 30 | adversarial | `post_update` | advBacker | 0 GEN | `0x88f2f47e60eef9d09bc89c0e1b835de633a7eed9af8c51e33b3080db81382573` | - | - | - | 29 |
| 31 | adversarial | `post_update` | advKeeper | 0 GEN | `0xda7ae6015c7fbed58d3f2e0f661bdc9f768971393c88499623b7ae034dd06c1c` | - | - | - | 14 |
| 32 | adversarial | `retract` | advBacker | 0 GEN | `0x01e15701a0c0e7e05d58f8250896bc292464455d0a5f877a5574840665a6e308` | - | - | - | 14 |
| 33 | adversarial | `pin_evidence` | advKeeper | 0 GEN | `0xe178ae1ef4bfa2f67d360937fa11c32db57f61a4082fda60d7c577fa67f98d53` | - | - | - | 14 |
| 34 | adversarial | `pin_evidence` | advKeeper | 0 GEN | `0x1dbbf2916b69a6e4334ee34260d3ad8983b3a7e42f97f762b840f6b6db996649` | - | - | - | 14 |
| 35 | adversarial | `pin_evidence` | advBacker | 0 GEN | `0x5b3fc3346c92e96f16221223ebc1936823e5312a34e20ce85b4b2eca3b17e20a` | - | - | - | 14 |
| 36 | adversarial | `judge` | advBacker | 0 GEN | `0x95cbd0f9caa6df1c5d7b4a09957f7fab7bc8e5c8859e4ce0ac1e9a3f0fe80c24` | - | - | - | 29 |
| 37 | adversarial | `finalize` | advBacker | 0 GEN | `0x5089ba17ef826ed763b7997c8e013cf38efa02cb5163bb5baafc95d5dbfb7500` | - | - | - | 29 |
| 38 | adversarial | `claim` | advBacker | 0 GEN | `0x239a2d9d7e6c5da4b6d9a7244a37f42a630037565fdd3a1a0b2892087c3c8789` | - | - | - | 14 |
| 39 | adversarial | `dispute` | advBacker | 0 GEN | `0x5d6b9fcbfad3228f33cd8dfd495c712b20c985888e67aa7b40fdda6754afe80c` | - | - | - | 14 |
| 40 | adversarial | `challenge` | advBacker | 0 GEN | `0xb5eab19f6f03c4202593858c0fedd427d1b8b99ffceaadfaee7cabdb21215ef4` | - | - | - | 33 |
| 41 | kept | `back` | doubtK | 0.02 GEN | `0x1f3c9428c786f4f20fa0882ff1105a393c82eb7bee606f50ea95cac7167e2acc` | - | - | - | 44 |
| 42 | broken | `back` | doubtB | 0.02 GEN | `0x235c75f05bec39a4134bec20875249896be5ad8aca2cebdc082cde2715f0af85` | - | - | - | 44 |
| 43 | adversarial | `release` | advBacker | 0 GEN | `0xc5dbf334b0ba831065ed2b8f334375d3124831e769a294b56213217a01eef43d` | - | - | - | 44 |
| 44 | kept | `post_update` | keeperK | 0 GEN | `0x1f0d027ac12fa027105e0eb0cfad7fe9d0b049e53f71a1491e98f8aeed57eabd` | - | - | - | 41 |
| 45 | broken | `post_update` | keeperB | 0 GEN | `0x1fc00e0b2ebba972a5219a02a7c7afe9b5df1211a0585aff805b82647575a7ed` | - | - | - | 36 |
| 46 | kept | `retract` | keeperK | 0 GEN | `0x046a5f60484b65be9c88543e7bd01701c62b55af25e3eab6660b86c6bddfe75e` | - | - | - | 39 |
| 47 | broken | `retract` | keeperB | 0 GEN | `0x8459f74c102a628342dd9cb12f3d80f44a74e33192f84e7d9714fb28374671a7` | - | - | - | 41 |
| 48 | adversarial | `post_update` | advKeeper | 0 GEN | `0xcc9d1e7eda1b03e701ba65af41a24f9fd1c6473cdf075d2e59be800a65bda87a` | - | - | - | 44 |
| 49 | kept | `judge` | keeperK | 0 GEN | `0xbed92377b071ea29698f85c10748ec92fff960c18a51a1ea8b771b14068567db` | - | - | - | 44 |
| 50 | broken | `judge` | keeperB | 0 GEN | `0x1f2633e0ceabcca06488d1db5e5397f798c7c04273f0f4f44c8103eebe5db232` | - | - | - | 44 |
| 51 | adversarial | `post_update` | advKeeper | 0 GEN | `0xf7c08139826e8a7c7ba8e1ac2ca8a134ae653bb9e5ceb336b8640443f871000b` | - | - | - | 45 |
| 52 | kept | `judge` | keeperK | 0 GEN | `0x3e3b3e401584d5877b15e5f19db36228e1a96d62ed843f9d283d65733f7da17b` | - | - | - | 44 |
| 53 | adversarial | `post_update` | advKeeper | 0 GEN | `0xc237b8910f98aee0db39a742f439f57c73fc39a4e4c8441550801e15bea9a082` | - | - | - | 45 |
| 54 | broken | `judge` | keeperB | 0 GEN | `0x6414fd2c74042a99280291c4824102240d5ca015afdabb78149aac6dd3e5b8fd` | - | - | - | 44 |
| 55 | adversarial | `post_update` | advKeeper | 0 GEN | `0xa733811618004912d16aca29d965e8093f18788bfc0c68f56f1808f22a251c9e` | - | - | - | 45 |
| 56 | kept | `finalize` | keeperK | 0 GEN | `0x4882f71c402dee35dbbe46a145ffacb7d0472e5b397098c5a5b5745aab086226` | - | - | - | 44 |
| 57 | broken | `finalize` | keeperB | 0 GEN | `0x01a4e8a1bc549d81828705d3af7bd8aeb2367425d3afd55009bb448605660cc1` | - | - | - | 44 |
| 58 | adversarial | `post_update` | advKeeper | 0 GEN | `0x62fd949cf6c4c1f03fb53dfff3256356e7d8267798fcefada66de17bc070ba12` | - | - | - | 45 |
| 59 | kept | `claim` | faithK | 0 GEN | `0xd6aedf0846c55bf3e813eb9b6fc72918cb648f11881bf667ad353609a1af10c7` | - | - | - | 44 |
| 60 | broken | `claim` | faithB | 0 GEN | `0x3b1c70fb535845113f49a6b860883feba302b7611ba4596fce82be6558ed0874` | - | - | - | 44 |
| 61 | adversarial | `post_update` | advKeeper | 0 GEN | `0x1c1a7cb91e1b0d7611e419805ca1b466e712be142bd363746ebe5714f944a748` | - | - | - | 41 |
| 62 | adversarial | `retract` | advKeeper | 0 GEN | `0xffb4e474689fac44d07ceca2caef316aba96d9250ff76fd288032a6d2e5c2f68` | - | - | - | 29 |
| 63 | adversarial | `back` | advBacker | 0.02 GEN | `0x8a5ba9fb1d4dbc48e2644ab5f0425ee132e4c9a7361af346352f3b8f92d4c6d6` | - | - | - | 14 |
| 64 | adversarial | `retract` | advKeeper | 0 GEN | `0x71ba42bb26b61fcab69f59d4d18a311bc5070426ea176b062871f7a7aaaeed3f` | - | - | - | 29 |
| 65 | adversarial | `post_update` | advKeeper | 0 GEN | `0xe9f344b46c9658d7b097ab2a174b49451f53ad35e4f31f59d4806da046fe7301` | - | - | - | 29 |
| 66 | adversarial | `claim` | advKeeper | 0 GEN | `0x47c2a916e7f02986e557549fc6ba63efcbf79dd7c49886715235604ef90d926f` | - | - | - | 30 |
| 67 | adversarial | `claim` | advKeeper | 0 GEN | `0xb61ee3d76c422ad8c54e6cfd07bbedc23e4277862ae723ca40b996e47f360d55` | - | - | - | 30 |
| 68 | adversarial | `claim` | advBacker | 0 GEN | `0xd4aea0259363690ee0cb302cdf6ec6e56506bd10660a05229152cc237830f566` | - | - | - | 30 |
| 69 | adversarial | `make_vow` | advKeeper | 0.1 GEN | `0x7a538ae24fc76702524567205f3d59bf2372e95474fcca6ffea64b02ceed245b` | - | - | - | 14 |
| 70 | adversarial | `back` | advBacker | 0.02 GEN | `0xe2731c9679e0992fac509b99295a3b3ad2d9a77723d58cb14a053d73bbc63006` | - | - | - | 29 |
| 71 | adversarial | `back` | advBacker | 0.02 GEN | `0x7398c323ac3ba47ac39865c67d8c34376885b322373e113328d09ea1590936ac` | - | - | - | 32 |
| 72 | kept | `finalize` | keeperK | 0 GEN | `0x837f941c7af79f67edd1c02ac4662e6537f47d83a62f5af04c5293175c4844c6` | - | - | - | 23 |
| 73 | adversarial | `retract` | advKeeper | 0 GEN | `0xc39314b8fd4899b620120195ce311f4223b04052d9f687097243c1dcbb34d8a1` | - | - | - | 29 |
| 74 | kept | `claim` | keeperK | 0 GEN | `0x33ce4b2e3ea4f54957da3871cfd1b42a5fe8783cc630e5e66fb1a85a52426770` | - | - | - | 25 |
| 75 | kept | `claim` | keeperK | 0 GEN | `0x715424570a9b31f6bcc01bcc7265b204df187722f5545ebe90ab6ad22f74ea6d` | - | - | - | 14 |
| 76 | kept | `claim` | faithK | 0 GEN | `0x471bfc6fbe3ffb3b592419c28d2948d469eb19db923f63b54c2b4072e6e563ef` | - | - | - | 30 |
| 77 | kept | `claim` | doubtK | 0 GEN | `0x4f52b3364cec95aaa4a38edb77b04d2ccbc156084cee6ba6c9d628b6b542edc0` | - | - | - | 29 |
| 78 | broken | `finalize` | keeperB | 0 GEN | `0xc6b0252cfefe7e7a101da795658c125d9065f3b3a8e414ad405c133be697c2f2` | - | - | - | 28 |
| 79 | broken | `claim` | keeperB | 0 GEN | `0x0aa3145ef40758a65050c32a87c7e4327de44f1bbfb8eee4d8960ddeca018a14` | - | - | - | 14 |
| 80 | broken | `claim` | faithB | 0 GEN | `0x04cd9664bb60d65355b139adc67ed71e58109002dc686e09fbe312829cd9f6d7` | - | - | - | 14 |
| 81 | broken | `claim` | doubtB | 0 GEN | `0x684da3b1ce8c595ac5bc0756e82583921c140d93883dafb84e5e2e9138e1f063` | - | - | - | 15 |
| 82 | broken | `claim` | doubtB | 0 GEN | `0xc9dd5123774261b5fb10d7f67568ca54d51cbb9a31329081bc3bce692db68d8c` | - | - | - | 14 |

## Notes

- Vow #4 (adversarial) is left open on purpose: it holds 0.12 GEN until its deadline.

The report is written by `e2e/src/live.mjs`. Hashes can be looked up in the Studio explorer.
