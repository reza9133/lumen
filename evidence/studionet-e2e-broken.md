# Lumen end-to-end on Studionet (broken)

- Contract: 0x0FDa5D58327DD482bCE2C3673f4295d0E891F75D
- Vow: #1, evidence https://gist.githubusercontent.com/reza9133/8c645164a9a6c8249b92af9cc9ef34ae/raw/b1694a22968c9f5014980d5e1b6269917949f481/proof_bad.txt
- Final state: **BROKEN**

## Transactions

| # | call | by | value | hash | decision | execution | finalized |
|---|---|---|---|---|---|---|---|
| 1 | `make_vow` | keeper | 2.0 GEN | 0xb776da09f32f3ef17c8db1221cebe3a77ab4c0e292f7b4c95e226b0d57bd690a | ACCEPTED | SUCCESS | FINALIZED |
| 2 | `back` | doubt | 1.0 GEN | 0x794533c372864391fde89ebfcf3f2af826885dfaaae386bf5fd1d05c9200778a | ACCEPTED | SUCCESS | FINALIZED |
| 3 | `judge` | keeper | 0 GEN | 0xcb28a85c6c0566934dbf0bc2e0cbd7d9281cb2398acb8add90d1dcc5de610622 | ACCEPTED | SUCCESS | FINALIZED |
| 4 | `finalize` | keeper | 0 GEN | 0x0a5fdc494b5f5f98762d47118692fdc7d596ef8b40680fd0d6891c5378a4770a | ACCEPTED | SUCCESS | FINALIZED |
| 5 | `claim` | doubt | 0 GEN | 0x6cef85fcb74bfc1298ef6b0be463a517d7e18c15ca11bd14dcc137d624e2ec2d | ACCEPTED | SUCCESS | FINALIZED |

## Vow after each stage

| stage | state | proposed | proof tier | note |
|---|---|---|---|---|
| made | OPEN | - | - | - |
| backed | OPEN | - | - | - |
| judged | REVIEW | BROKEN | - | Source 1 is mutable and contains no date, so completion by the deadline cannot be verified. |
| final | BROKEN | BROKEN | - | Source 1 is mutable and contains no date, so completion by the deadline cannot be verified. |

## Native GEN payouts

| account | expected | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|
| keeper | 0 GEN | - | - | - | nothing to claim for this account |
| faith | 0 GEN | - | - | - | nothing to claim for this account |
| doubt | 2.0 GEN | - | - | 2.0 GEN | 0x6cef85fcb74bfc1298ef6b0be463a517d7e18c15ca11bd14dcc137d624e2ec2d |

Contract totals after the run: deposited 6.0 GEN, paid 5.0 GEN, burned (embers) 1.0 GEN.
