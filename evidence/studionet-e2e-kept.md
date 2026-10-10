# Lumen end-to-end on Studionet (kept)

- Contract: 0x0FDa5D58327DD482bCE2C3673f4295d0E891F75D
- Vow: #0, evidence https://gist.githubusercontent.com/reza9133/dec958dddfe15f200a6ab10be2ec3db9/raw/9f688528f1e342fe370d5b76714349461357ac21/proof.txt
- Final state: **KEPT**

## Transactions

| # | call | by | value | hash | decision | execution | finalized |
|---|---|---|---|---|---|---|---|
| 1 | `make_vow` | keeper | 2.0 GEN | 0x00f5a49ebf2f52f22a1cc354288c0e842c902dae762c561af8ba03abeabcb981 | ACCEPTED | SUCCESS | FINALIZED |
| 2 | `back` | faith | 1.0 GEN | 0xf213312f37591b8426cf82cfdebc33eb2932181b392f4f5951cc2724e96a2ae6 | ACCEPTED | SUCCESS | FINALIZED |
| 3 | `judge` | keeper | 0 GEN | 0xeb36bc6adf4e12e4d7a5454dc35caf118835c13d672ea1ea59c7ca86ae3b4331 | ACCEPTED | SUCCESS | FINALIZED |
| 4 | `finalize` | keeper | 0 GEN | 0xc859ee28adfa2c25864607ec4487bdf2e6a5d32ab64f7fdb8c65bd1f7776c8fb | ACCEPTED | SUCCESS | FINALIZED |
| 5 | `claim` | keeper | 0 GEN | 0xcb325e59ea3a43bc11d170ef965b0f7570b1eafb8c906bb8645ad141a6315c02 | ACCEPTED | SUCCESS | FINALIZED |
| 6 | `claim` | faith | 0 GEN | 0x4be45976cc0f5e74f63c313c9e4640016002d9b273e9bc495463e6cc496d2011 | ACCEPTED | SUCCESS | FINALIZED |

## Vow after each stage

| stage | state | proposed | proof tier | note |
|---|---|---|---|---|
| made | OPEN | - | - | - |
| backed | OPEN | - | - | - |
| judged | REVIEW | KEPT | mutable | Source 1 states chapter one was published on 2026-10-10, which is on the deadline date. |
| final | KEPT | KEPT | mutable | Source 1 states chapter one was published on 2026-10-10, which is on the deadline date. |

## Native GEN payouts

| account | expected | balance before | balance after | change | claim tx |
|---|---|---|---|---|---|
| keeper | 2.0 GEN | - | - | 2.0 GEN | 0xcb325e59ea3a43bc11d170ef965b0f7570b1eafb8c906bb8645ad141a6315c02 |
| faith | 1.0 GEN | - | - | 1.0 GEN | 0x4be45976cc0f5e74f63c313c9e4640016002d9b273e9bc495463e6cc496d2011 |
| doubt | 0 GEN | - | - | - | nothing to claim for this account |

Contract totals after the run: deposited 3.0 GEN, paid 3.0 GEN, burned (embers) 0 GEN.
