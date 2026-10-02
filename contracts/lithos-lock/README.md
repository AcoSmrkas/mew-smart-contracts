# Lithos Lock

Lock LIT for 30, 90, 180 or 365 days and earn more LIT. App:
[lock.mewfinance.com/lithos](https://lock.mewfinance.com/lithos).

The contracts are generic: a campaign locks asset **A** and pays asset **B**.
Each of A and B can be any token or ERG, and they may be the same asset (Lithos
Lock is LIT/LIT). The reward is fixed when you lock. It comes back to you,
together with your locked A, when the lock ends.

**There are no admin keys.** Nobody can pause a campaign, change it, or move
its funds. Every rule below is enforced by the contracts.

| file | what |
|---|---|
| [`campaign.es`](campaign.es) | contract v3, one singleton box per campaign (Season 1) |
| [`position.es`](position.es) | one box per lock, shared by every campaign |
| [`campaign-v2.es`](campaign-v2.es) | v2, the retired mainnet test; kept verbatim so it still recompiles |
| [`deployments/`](deployments) | the pinned parameters, trees and token ids of each mainnet campaign |

Both contracts are compiled as ErgoTree v1, because Nautilus and the ErgoPay
Android wallet cannot sign v3 trees.

## How it works

**Campaign box.** Its tokens are, in order: the campaign NFT (supply 1), the
position markers (one leaves with every lock), and the budget when B is a
token. When B is ERG, the budget is the box value minus `reserve`. R4 holds
`V`, the virtual weight (BigInt).

It allows three spends:

- **Lock** (between `start` and `end`). Creates exactly one position box in
  `OUTPUTS(1)`, which carries one marker. The campaign pays a reward of
  `reward <= budget * w / (V + w)`, where `w = principal * blocks * boostBps`.
  The successor campaign box holds `budget - reward`, and its R4 holds `V + w`.
- **Top-up** (until `end`, anyone). Adds budget and/or ERG. Nothing else
  changes.
- **Sweep** (after `end + grace`, anyone).
  - All ERG and every B token go to the fee address compiled into the
    contract, and the NFT and the markers are burned.
  - The campaign must be `INPUTS(0)`, so one sweep handles one campaign.
  - The fee address must be a wallet (P2PK).

**Position box.** Its whole contract is `proveDlog(R4) && HEIGHT >= R5`: only
the owner can spend it, and only once the unlock height is reached. It does no
arithmetic, so a position can never get stuck. R6, R7 and R8 record the
principal, the reward and the tier for display; the campaign checks them when
it creates the position.

**Why this curve.** Locks never increase `budget × V`. So the budget can't be
over-committed, and splitting one lock into several never earns more (rounding
makes it slightly worse). The rate for new locks falls as more weight locks;
early and long locks earn the most. The starting `V` sets the opening base
APR. It also limits whales: a lock with weight equal to `V` takes half the
budget. The curve never spends the whole budget, so a sweep always has some
leftover.

**Genuine boxes.** Anyone can create a box at either address, so the address
alone proves nothing.
- A campaign box is genuine only if it holds the campaign NFT.
- A position is genuine only if a lock of that campaign created it as
  `OUTPUTS(1)`. The app checks this against the campaign NFT's history.

## Campaigns on mainnet

| | Season 1 | Mainnet test |
|---|---|---|
| status | **live** | retired: closed to locks; sweep opens after #1,886,712 |
| contract | v3 | v2 |
| asset | LIT → LIT | LIT → LIT |
| locks open | #1,885,314 → #2,014,914 (~6 months) | #1,884,522 → #1,886,682 |
| sweep | after #2,015,634 | after #1,886,712 |
| tiers | 30 / 90 / 180 / 365 days at 1.0 / 1.25 / 1.5 / 2.0× | 10 / 30 / 60 / 120 blocks |
| budget | 10,000 LIT | 1,000 LIT |
| minimum lock | 100 LIT | 1 LIT |
| leftover to | `9hpu8DGHQSE4Myea9DkimHpWBvBu8AMwLBSuNcuS4HNBE2TAQno` | `9g2QPdXizK17Vquic8v5j9f5coR9yVdxzT4gqFw4Jm9dfdFs68L` |
| campaign NFT | `3656912b…a6bff5` | `bb49b32f…f25054` |
| genesis | [`6f72f459…`](https://explorer.ergoplatform.com/en/transactions/6f72f459f552b07a16f116dcd76af38cbf095da4972ddd8308ad0b03911a8973) | [`5310ccba…`](https://explorer.ergoplatform.com/en/transactions/5310ccbaaebe52f5d7ed822a7a093844eac549bbdf6b25146a0f249050fe9219) |

The full ids, every parameter and both compiled trees are in
[`deployments/`](deployments). `npm run verify` at the repo root recompiles them
from these sources, and `npm run verify:chain` also checks the genesis box and
the NFT supply on mainnet.

## Testing

The test suite (122 tests) lives with the app, in
[mew-lock `src/lib/lithos`](https://github.com/AcoSmrkas/mew-lock/tree/main/src/lib/lithos).
It covers:
- Mock-chain attack cases. Each attack is a real transaction with one thing
  tampered: it must fail, and the untampered twin must pass.
- All five asset mixes: LIT/LIT, LIT/MEOW, ERG/LIT, LIT/ERG and ERG/ERG.
- Signing by sigma-rust, the engine inside Nautilus.

Every asset mix also ran end to end on the Ergo testnet: deploy, three locks, a
top-up, refused attacks, three exact unlocks and a third-party sweep. Contract
v3 passed the same run on 2026-10-01: campaign
[`dc788571`](https://testnet.ergoplatform.com/en/transactions/dc7885716350de7955b6956bdbf845209180fec212d053815d2a89ebe01d41aa),
sweep
[`3cfb46fb`](https://testnet.ergoplatform.com/en/transactions/3cfb46fb9d00e977c49ee50875116abe41481aa5825b90569635e3e4b048fd1e).

## Audit, 2026-09-30

An external review of v2 found one real bug. v3 fixes it, and the auditor's
retest of v3 agreed.

| ID | finding | outcome |
|---|---|---|
| F-1 high | Two expired campaigns sharing a fee address could be swept in one transaction that paid the fee address only the larger one | Confirmed. v3 requires the campaign to be `INPUTS(0)` and the fee address to be a wallet |
| F-2 low | When B is its own token, a zero-reward lock could not be built | Confirmed. v3 drops the B slot when the reward is 0 |
| F-3 info | The last marker can never leave | Correct. Each campaign mints 10⁹ markers |
| F-4 low | 1-nanoERG top-ups can keep invalidating pending locks | Correct, and inherent to one shared box. The app rebuilds a lock from the newest state; griefing costs ~0.0011 ERG per block |
| F-5 low | Deploy-time checklist | Enforced by the deploy page and the recompile check |
| P-1 info | Anyone holding a marker can make look-alike positions | Funds are safe. The app counts only positions a lock created |
| V3-1 | A v3 sweep at `INPUTS(0)` can still take along a v2 campaign that pays the same address | Season 1 pays a different address from the v2 test, so it does not apply |
