# Contract API

`contracts/lumen.py`, version 2.0.0. Amounts are in wei (1 GEN = 10^18 wei). Views return JSON strings; amounts are decimal strings so they survive JSON. Times are Unix seconds. Any method that takes a `vow_id` fails with `No such vow.` for an unknown id.

States: `OPEN` 0, `KEPT` 1, `BROKEN` 2, `UNCLEAR` 3, `REVIEW` 4, `RETRACTED` 5. `UNCLEAR`, `KEPT`, `BROKEN` and `RETRACTED` are final.

## Write methods

| Method | Who and when | Effect |
|---|---|---|
| `make_vow(text, evidence_url, deadline)` payable | anyone | Locks the attached value as the stake (at least 0.1 GEN). `text` is cleaned, 8 to 280 characters. `evidence_url` is a public `http(s)` link. `deadline` is between one minute and 366 days from now. |
| `back(vow_id, side)` payable | anyone but the keeper, before the deadline | `side` is `"faith"` or `"doubt"`, at least 0.01 GEN. One side per address. Total faith may not pass half of the stake. |
| `challenge(vow_id, url)` | a doubter, once, before the deadline | Counter-evidence. Three slots; a larger doubt replaces the smallest. |
| `pin_evidence(vow_id, url)` | the keeper, before the deadline, twice at most | An archive capture or a commit-pinned or content-addressed link. |
| `post_update(vow_id, text)` | the keeper, before the deadline, five at most | A public progress note of 4 to 200 characters. Never read by the judges. |
| `retract(vow_id)` | the keeper, before the deadline, while nobody has backed the vow | Burns a fifth of the stake, makes the rest claimable, ends the streak. |
| `judge(vow_id)` | anyone | After the deadline: asks the validators to rule. Before it: an early check from the halfway point, only while nobody doubts the vow, and it can only confirm. Kept or broken is a proposal (state `REVIEW`); unclear is final. |
| `dispute(vow_id, url)` | the losing side, during review | Doubters dispute a kept proposal; the keeper and faith backers dispute a broken one. Three slots. |
| `finalize(vow_id)` | anyone, after the review window | Settles the proposal, re-judging once if pages were disputed. |
| `release(vow_id)` | anyone, thirty days after the deadline (or the end of review) | Closes a stuck vow as unclear so everyone can claim a refund. |
| `claim(vow_id)` | any address with a payout, once | Pays what the verdict owes the caller. |

## View methods

| Method | Returns |
|---|---|
| `stats()` | `{ total, kept, broken, retracted, keepers, embers, deposited, paid, rev, version }` |
| `pulse()` | `{ rev, total }`. `rev` grows by one for every state change. |
| `params()` | `{ version, <every limit>, tiers: [...], states: {...} }` |
| `changes_since(cursor)` | `{ rev, reset, rows }`: vows changed since `cursor`, newest first. `reset` when more than 60 changed or `cursor` is not from this contract. |
| `get_vow(vow_id)` | One vow row (below). |
| `list_vows(offset, limit)` | Newest first. `limit` is clamped to 60. |
| `vows_of(who, cursor, limit)` | `{ rows, next }`: one keeper's vows, newest first. Start with `cursor = -1`; pass `next` back until it is `-1`. At most 1,500 vows are scanned per call. |
| `activity(offset, limit)` | `[{ seq, vow, action, at, keeper, text }]`, newest first, at most 100. |
| `list_keepers(offset, limit)` | `{ total, rows }` of profiles, in the order of each keeper's first vow, at most 100. |
| `profile_of(who)` | `{ address, vows, kept, broken, retracted, streak, best, kept_stake, tier }` |
| `record_of(who)` | `{ kept, broken, streak, best, kept_stake }` (the version 1 shape) |
| `position_of(vow_id, who)` | `{ faith, doubt, payout, claimed, challenged, disputed }` |

Feed actions: `made`, `faith`, `doubt`, `pinned`, `challenged`, `update`, `checked`, `retry`, `proposed`, `disputed`, `kept`, `broken`, `unclear`, `retracted`, `released`, `claimed`.

Tiers, best first: `Constellation`, `Beacon`, `Flame`, `Spark`, and `Unlit` when none applies.

## Vow row

```json
{
  "id": 7,
  "keeper": "0x...",
  "text": "I will publish the v1 release notes.",
  "url": "https://example.org/releases/v1",
  "provenance": "mutable",
  "created": 1767225600,
  "deadline": 1767229200,
  "stake": "1000000000000000000",
  "faith": "400000000000000000",
  "faith_cap": "500000000000000000",
  "doubt": "400000000000000000",
  "state": 0,
  "tries": 0,
  "note": "",
  "counters": ["https://..."],
  "pins": ["https://..."],
  "disputes": ["https://..."],
  "proposed": 0,
  "proposed_at": 0,
  "review_end": 0,
  "proof": null,
  "updates": [{ "at": 1767226000, "text": "Draft is done." }]
}
```

`provenance` is the shape-based hint (`snapshot`, `permalink`, `mutable`); `proof` is set once a kept verdict is proposed and holds `{ url, tier, quote, date, hash }`, where `tier` is the class the verdict actually relied on.

## Refusals

Every refusal is a `UserError` with a plain sentence. The complete list, grouped by method, is in the Error messages section of `frontend/docs.html`, and `tests/direct/test_frontend_parity.py` fails if the contract raises a sentence the app does not know. The messages added in version 2:

| Method | Message |
|---|---|
| `post_update` | The deadline has passed. Updates are closed. / Only the keeper can post updates. / The update is too short. / A vow takes at most five updates. |
| `retract` | The deadline has passed. A vow can only be retracted before it. / Only the keeper can retract a vow. / A vow that has backing cannot be retracted. |
| both | This vow has already been judged. |

## Upgrading from version 1

The storage layout changed (progress notes, retraction counts, keeper index and feed were added), so the version 2 app cannot read a version 1 deployment. Version 2 is deployed as a new contract; point `VITE_LUMEN_ADDRESS` at it. Existing vows are not migrated. The version 1 methods and the shapes of `stats`, `get_vow`, `list_vows`, `record_of` and `position_of` are unchanged apart from added fields.
