# UC-01: Multiple Transactions and Block Formation

## Objective and Protocol Scope

Demonstrate how Hyperledger Iroha v1 handles **multiple independently submitted transactions**:
batching them into a single Proposal at the Ordering Service, applying Stateful Validation
to each transaction in proposal order against a provisional World State View, dropping rejected
transactions to form a Verified Proposal, and committing a block containing the valid subset
together with the **hashes of the rejected transactions**.

This use case extends the MVP happy-path scenario (UC-00, Alice sends 10 USD to Bob) to show
the full significance of the Proposal / Verified Proposal distinction. In the single-transaction
MVP a Proposal always equals its Verified Proposal; here they deliberately differ.

**Protocol scope:** Hyperledger Iroha v1 (classic C++ implementation), pinned to release `1.4.0`.
See §Technical References for the specific source files governing the behavior documented here.

This use case models **ordinary (independently submitted) transactions**, not Iroha 1 transaction
batches. See §Transaction Batches vs. Ordinary Proposals for the distinction and justification.

**Outside scope:**
- Multi-peer consensus mechanics (YAC detail remains a black box).
- Multisignature transactions.
- Iroha 1 `BatchType::ATOMIC` or `BatchType::ORDERED` semantics.
- Ordering Service redundancy or failure.

---

## Technical References

### Pinned protocol version

All protocol behavior documented here targets **Hyperledger Iroha 1.4.0**.

Git tag: `1.4.0` (note: no `v` prefix — this is the actual tag name in the repository)
Repository: https://github.com/hyperledger/iroha/tree/1.4.0

The most recent stable 1.x release is `1.6.0`. The files referenced below exist in both
releases; behavior was verified against `1.4.0`.

### Source files governing UC-01 behavior

Paths are relative to the repository root at tag `1.4.0`.

| Behavior | File | Key symbol |
|----------|------|------------|
| Stateful validation — sequential per-proposal | `irohad/validation/impl/stateful_validator_impl.cpp` | `StatefulValidatorImpl::validate`, `checkTransactions`, `validateTransactions` |
| `TemporaryWsv::apply` — validates AND applies atomically | `irohad/ametsuchi/temporary_wsv.hpp` | `TemporaryWsv::apply` |
| ATOMIC batch savepoint rollback | `irohad/validation/impl/stateful_validator_impl.cpp` | `validateTransactions` — `createSavepoint` / `release` |
| Block creation from verified proposal (including empty) | `irohad/simulator/impl/simulator.cpp` | `Simulator::processVerifiedProposal` |
| Proposal processing and temp WSV creation | `irohad/simulator/impl/simulator.cpp` | `Simulator::processProposal` |
| Block structure including rejected tx hashes | `shared_model/schema/block.proto` | `Block_v1.Payload.rejected_transactions_hashes` (field 6) |
| Ordering Service — proposal creation | `irohad/ordering/impl/ordering_service_impl.cpp` | `OrderingServiceImpl::onTransaction` |
| Asset precision — asset data model | `shared_model/interfaces/common_objects/asset.hpp` | `Asset::precision()` returns `PrecisionType` (uint8, range 0–255) |
| Amount class — decimal string parsing and exact arithmetic | `shared_model/interfaces/common_objects/impl/amount.cpp` | `Amount(string_view)` → parses decimal string; stores as `checked_uint256_t`; negative/malformed → `string_repr_ = "NaN"` |
| Transfer amount precision check | `irohad/ametsuchi/impl/postgres_command_executor.cpp` | transfer_asset SQL check code 5: `SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision` |

### Verification status

| Claim | Status | Source evidence |
|-------|--------|----------------|
| Stateful validation is sequential; each passing tx's deltas are applied to `TemporaryWsv` before the next tx is validated | **CONFIRMED** | `checkTransactions` calls `temporary_wsv.apply(tx)`, which applies state changes on success; `TemporaryWsv::apply` docstring: "Applies a transaction to current state" |
| Rejected tx hashes are stored in the committed block | **CONFIRMED** | `block.proto` field 6: `repeated string rejected_transactions_hashes` with comment "Needed here to be able to guarantee the client that this transaction was not and will never be executed" |
| Empty verified proposal: a block IS committed with zero `transactions` and non-empty `rejected_transactions_hashes` | **CONFIRMED** | `Simulator::processVerifiedProposal` creates the block unconditionally from `proposal->transactions()` (which may be empty) and `rejected_hashes`; no empty-proposal guard exists |
| ATOMIC batch: if any tx in the batch fails, all are rejected via savepoint rollback | **CONFIRMED** | `validateTransactions` uses `temporary_wsv.createSavepoint`; savepoint is released only if `all_of(batch, validation)` passes; otherwise the wrapper destructs without `release()`, rolling back all batch changes |
| Transfer amount precision must not exceed asset precision | **CONFIRMED** | `postgres_command_executor.cpp` transfer_asset SQL, check code 5: `SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision`; `Amount::precision()` returns the number of decimal places in the amount string |
| `max_proposal_size` default, `proposal_creation_timeout` default | **Unverified** — requires inspection of `irohad/ordering/impl/ordering_service_impl.cpp`; not blocking for the simulation since these are configurable inputs |

### Additional references

| Reference | Relevance |
|-----------|-----------|
| [Iroha v1 architecture docs](https://iroha.readthedocs.io/en/main/concepts_architecture/architecture.html) | Canonical pipeline description |
| [Iroha v1 glossary](https://iroha.readthedocs.io/en/main/concepts_architecture/glossary.html) | Proposal, Verified Proposal, Stateful Validation definitions |
| [Iroha v1 config reference](https://iroha.readthedocs.io/en/main/configure/index.html) | `max_proposal_size`, `proposal_creation_timeout` |
| DESIGN.md §8–9 | Architecture data model and Iroha v1 component inventory |

---

## Execution Engine Architecture

### Two-layer design

**Finding addressed:** The XState machine is a playback controller, not a transaction execution
engine. UC-01 requires genuine state-dependent computation: which transactions pass or fail depends
on the input balances and the proposal order, not on predetermined scenario data.

The implementation uses two distinct layers:

#### Layer 1 — Execution engine (pure computation)

A pure function that takes a list of `TransactionSpec` and a `WorldState` and returns a typed
`ValidationOutcome`. No XState, no React, no I/O.

```ts
// Proposed location: src/engine/blockFormation.ts
function validateProposal(
  transactions: readonly TransactionSpec[],
  worldState: WorldState,
): ValidationOutcome
```

This function:
1. Creates a mutable provisional copy of `worldState.balances`.
2. Iterates through `transactions` in order.
3. For each transaction, checks the validation rules against the **current provisional balances**.
4. If valid: applies the transaction's delta to the provisional balances; records the result as `VALID`.
5. If invalid: leaves provisional balances unchanged; records the result as `REJECTED` with reason.
6. Returns the full set of `TransactionValidationResult`, the lists of valid/rejected IDs, and the
   final `WorldState` after all valid transactions have been applied.

The function is deterministic. Given the same inputs it always returns the same outputs. The
outcome changes if the input balances or transaction order changes — this is the property that
distinguishes UC-01 from a scripted playback.

#### Layer 2 — Scenario generator (uses execution engine output)

A pure function that calls `validateProposal` and constructs a `Scenario` whose `steps` carry
narration and step state derived from the computed outcome, not hardcoded.

```ts
// Proposed location: src/architectures/iroha1/scenarios/blockFormation.ts
function generateBlockFormationScenario(
  transactions: readonly TransactionSpec[],
  worldState: WorldState,
): Scenario
```

The XState machine then plays back this generated scenario unchanged. No modifications to
`simulationMachine.ts` are required.

#### Layer 3 — XState machine (unchanged)

`createSimulationMachine(scenario)` accepts the generated scenario and controls playback
(NEXT / PREVIOUS / RESET / PLAY / PAUSE) exactly as it does for UC-00. It knows nothing
about how the scenario was constructed.

### Why this separation matters

A scenario where outcomes are baked into step data can only be "correct" by coincidence — the
test just checks that the machine replays the authored data, not that the data reflects the
protocol. With the execution engine:

- Tests can supply any `WorldState` and `TransactionSpec[]` and assert that the computed
  `ValidationOutcome` follows the validation rules.
- Swapping transaction order in a test must change which transactions pass without any change
  to the test fixture or scenario data.
- Edge cases (order dependency, empty outcomes) are tested against the execution engine
  directly, independent of the playback layer.

### Replay safety — no duplicate state application

`validateProposal` runs exactly once: when `generateBlockFormationScenario` is called at
"Send" time. The `ValidationOutcome` it returns is embedded in the scenario's step data
as immutable values. The XState machine never re-invokes `validateProposal` during NEXT,
PREVIOUS, or RESET — it only moves `stepIndex` through the pre-built steps.

Balance computation (`applyTransactions`) is called only when a block is added to the
committed-blocks list, which uses the same `hasRecordedRunRef` guard already in
`IrohaWorkspace.tsx` to prevent duplicate appending. PREVIOUS and NEXT do not add blocks;
only a completed run does, and only once. This design prevents any state from being
accumulated twice during replay.

---

## Core Type Definitions

**Finding addressed:** Per-transaction results, events, and state changes must use structured
types, not untyped arrays inside `Record<string, unknown>`.

The following types are proposed for `src/engine/blockFormation.ts`. They are specific to the
UC-01 execution engine and do not change `src/engine/types.ts`.

### `WorldState`

```ts
export interface WorldState {
  /**
   * Current account balances, stored as bigint scaled to the asset's precision.
   * E.g. for a USD asset with precision=2, balance 1050n represents 10.50 USD.
   * Precision=0 assets use whole-unit values (100n = 100 units).
   * bigint is required for exact arithmetic — IEEE 754 number cannot represent
   * all values precisely when precision > 0.
   */
  balances: Readonly<Record<string, bigint>>
  /** Set of accounts that exist. Used for SENDER_NOT_FOUND / RECEIVER_NOT_FOUND checks. */
  accounts: ReadonlySet<string>
  /**
   * Map of asset id → asset precision (0–255).
   * Precision is the number of decimal places the asset supports.
   * Source: `Asset.precision()` in `shared_model/interfaces/common_objects/asset.hpp`.
   * Used both for ASSET_NOT_FOUND checks and for AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION checks.
   */
  assets: Readonly<Record<string, number>>
}
```

### `TransactionSpec`

```ts
export interface TransactionSpec {
  id: string
  from: string
  to: string
  asset: string
  /**
   * Transfer amount as a decimal string, e.g. "10", "10.50", "0.001".
   * Matches Iroha 1's `Amount` class representation in
   * `shared_model/interfaces/common_objects/impl/amount.cpp`.
   * Rules:
   *   - Must be a non-negative decimal string (no leading sign, no negative values).
   *   - Number of decimal places must not exceed the asset's precision
   *     (enforced by SQL check `asset.precision >= :precision` in
   *     `irohad/ametsuchi/impl/postgres_command_executor.cpp`, line ~1399).
   *   - Malformed strings ("", "-5", "NaN", ".5") are programming errors caught before
   *     stateful validation; they cause a thrown precondition error.
   *   - `"1."` (trailing dot) is accepted: Iroha 1 Amount{"1."} parses as precision=0,
   *     value=1 (confirmed by amount_test.cpp). The simulator regex is now /^\d+(\.\d*)?$/
   *     to match this behavior. The previous regex /^\d+(\.\d+)?$/ rejected "1." — now fixed.
   */
  amount: string
}
```

This is the same shape as `Scenario.initialTx` minus the index signature. See §Infrastructure
Changes Required for the additive extension strategy.

**Precision rule:** The transfer amount's decimal places must not exceed the asset's configured
precision. This is a protocol-level `RejectionReason` (`AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION`),
not a precondition error. Example: USD with precision=2 accepts "10.50" (2 dp) and "10" (0 dp),
but rejects "10.500" (3 dp). Precision is validated per-transaction during stateful validation.

A malformed amount string (empty, negative, non-numeric, leading dot) indicates a programming
error in the scenario definition. The execution engine guards against this before the validation
loop — these are thrown precondition errors, not `RejectionReason` values, because Iroha 1
rejects them at stateless validation before they reach the stateful validator.

### `RejectionReason`

```ts
export type RejectionReason =
  | 'INSUFFICIENT_BALANCE'
  | 'SENDER_NOT_FOUND'
  | 'RECEIVER_NOT_FOUND'
  | 'ASSET_NOT_FOUND'
  /**
   * The transfer amount has more decimal places than the asset's configured precision.
   * Maps to SQL check code 5 in `postgres_command_executor.cpp` transfer_asset statement:
   *   SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision
   * Example: amount "10.500" (precision 3) on a USD asset with precision=2 fails this check.
   */
  | 'AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION'
  | 'NO_PERMISSIONS'
  | 'EXPIRED'
```

### `TransactionValidationResult`

```ts
export interface TransactionValidationResult {
  txId: string
  status: 'VALID' | 'REJECTED'
  reason?: RejectionReason
  /**
   * The sender's balance in the provisional WSV immediately after this transaction
   * is processed. Stored as bigint scaled to the asset's precision (matches
   * WorldState.balances). For a VALID transaction this reflects the deducted amount;
   * for a REJECTED transaction this is the sender's balance unchanged.
   */
  senderProvisionalBalance: bigint
}
```

### `ValidationOutcome`

```ts
export interface ValidationOutcome {
  /** Ordered results, one per input transaction, in proposal order. */
  results: readonly TransactionValidationResult[]
  /** IDs of transactions that passed all validation checks, in proposal order. */
  validTxIds: readonly string[]
  /** IDs of transactions that failed at least one check, in proposal order. */
  rejectedTxIds: readonly string[]
  /** World State View after applying all VALID transactions. */
  finalWorldState: WorldState
}
```

### `BlockContent`

```ts
export interface BlockContent {
  height: number
  /** Symbolic label — cryptographic hash computation is out of scope. */
  prevBlockHash: string
  createdTime: number
  /** Full transaction data for committed (VALID) transactions only.
   *  Maps to `Block_v1.Payload.transactions` in block.proto. */
  transactions: readonly TransactionSpec[]
  /**
   * Symbolic identifiers for the REJECTED transactions.
   * In Iroha 1 these are the actual transaction hashes stored in
   * `Block_v1.Payload.rejected_transactions_hashes` (field 6, type `repeated string`).
   * Purpose (per proto comment): "to be able to guarantee the client that this
   * transaction was not and will never be executed."
   * In the simulation, the transaction's `id` stands in for the cryptographic hash.
   * This field is non-empty when any transactions were rejected, and IS present
   * in a block even when `transactions` is empty (all-rejected case).
   */
  rejectedTransactionHashes: readonly string[]
}
```

### Serialization types (bigint-safe, JSON-compatible)

`ValidationOutcome` contains `bigint` values (balances) and a `ReadonlySet` (accounts).
Raw `bigint` causes `JSON.stringify` to throw. The scenario generator serializes the outcome
before embedding it in `txStateChanges`.

```ts
export interface SerializedTransactionResult {
  txId: string
  status: 'VALID' | 'REJECTED'
  reason?: RejectionReason
  /** Sender's provisional balance formatted as a decimal string (e.g. "10.50"). */
  senderProvisionalBalance: string
}

export interface SerializedValidationOutcome {
  results: readonly SerializedTransactionResult[]
  validTxIds: readonly string[]
  rejectedTxIds: readonly string[]
  finalWorldState: {
    balances: Readonly<Record<string, string>>  // decimal strings, e.g. "10.50"
    accounts: readonly string[]                 // sorted array (from ReadonlySet)
    assets: Readonly<Record<string, number>>
  }
}
```

The `formatScaledAmount(scaled: bigint, precision: number): string` utility converts bigint
balances to human-readable decimal strings (e.g. `1050n` at precision=2 → `"10.50"`).

### Step state shape for UC-01 scenario steps

The existing `ScenarioStep.txStateChanges: Record<string, unknown>` is architecture-agnostic.
UC-01 scenario steps embed typed sub-structures at known keys. The generic engine never reads
these keys; only UC-01–specific UI code does.

Proposal step (step-6):
```ts
txStateChanges: {
  proposal: { transactions: readonly TransactionSpec[] }
}
```

Stateful Validation step (step-7):
```ts
txStateChanges: {
  validationOutcome: SerializedValidationOutcome   // bigint→string, Set→sorted array
}
```

Verified Proposal step (step-8):
```ts
txStateChanges: {
  verifiedProposal: { validTxIds: readonly string[], rejectedTxIds: readonly string[] }
}
```

Block Creator step (step-9) — **candidate block, pre-consensus**:
```ts
txStateChanges: {
  candidateBlock: BlockContent   // created from verified proposal; consensus not yet reached
}
```

YAC Consensus step (step-10) — **distinct consensus event**:
```ts
txStateChanges: {
  consensusOutcome: { result: 'agreed', blockHeight: number }
}
```

Commit step (step-11) — **committed block, post-consensus**:
```ts
txStateChanges: {
  committedBlock: BlockContent   // distinct object from candidateBlock; identical payload
}
```

**Key invariant:** `candidateBlock` (step-9) and `committedBlock` (step-11) are distinct object
references even though their payloads are identical at construction time. This allows inspectors
to unambiguously distinguish the pre-consensus and post-consensus states. The `consensusOutcome`
event (step-10) is a third distinct event that must not be conflated with block creation or
commitment.

These shapes are GENERATED by `generateBlockFormationScenario`. They are never authored by hand.

---

## Transaction Batches vs. Ordinary Proposals

**Finding addressed:** Iroha 1 has a distinct concept of transaction batches. UC-01 uses ordinary
transactions. The difference matters for correctness and must be explicit.

### Ordinary (independent) transactions

Each transaction is submitted to Torii separately. The Ordering Service collects them and groups
them into a Proposal based on `max_proposal_size` and `proposal_creation_timeout`. There is **no
guaranteed atomicity** between independently submitted transactions in a proposal:

- If Tx 1 passes and Tx 2 fails, only Tx 1 is committed.
- Ordering within the proposal reflects receipt order at the Ordering Service.
- A failure of one transaction has no protocol-level effect on the others.

UC-01 models this case. It is the most common submission pattern and the clearest demonstration
of the Proposal / Verified Proposal distinction.

### Iroha 1 transaction batches

Iroha 1 also supports **transaction batches** (`BatchType`), where multiple transactions are
submitted together with a shared batch header. Two semantics exist:

| `BatchType` | Semantics |
|-------------|-----------|
| `ATOMIC` | All transactions in the batch must pass stateful validation, or **all are rejected**. Implemented via a database savepoint in `TemporaryWsv`: released on full success, rolled back on any failure. All transactions in a failed atomic batch are marked rejected with reason "Another transaction failed the batch." |
| `ORDERED` | Transactions appear in the same proposal in submission order. Each can pass or fail independently (no savepoint). |

Atomic batches implement all-or-nothing semantics at the application level: a multi-step transfer
(A→intermediate, intermediate→B) either completes fully or not at all. Source confirmed at
`irohad/validation/impl/stateful_validator_impl.cpp`, tag `1.4.0`.

**UC-01 uses ordinary transactions, not batches.** Batches are out of scope for the initial
implementation. A later sub-scenario (UC-01B) could demonstrate `ATOMIC` batch rejection as a
contrast.

---

## Actors, Components, and Prerequisites

### Actors

| Actor | Role |
|-------|------|
| Alice | Submits one or more independently signed transactions |
| Bob   | Receives funds |
| Carol | Receives funds |

### Pipeline components (all existing in `src/architectures/iroha1/`)

No new components are added. The pipeline is unchanged from the MVP.

| Component ID | Role in UC-01 |
|---|---|
| `client` | Each transaction originates here (submitted independently) |
| `torii` | Accepts each transaction in turn |
| `stateless-validation` | Validates structure and signature of each transaction |
| `mst-processor` | Passes through (single-sig quorum already met) |
| `peer-communication-service` | Routes each validated transaction toward the Ordering Service |
| `ordering-service` | **Core** — batches transactions into a Proposal |
| `proposal` | **Core** — holds the unvalidated batch |
| `stateful-validation` | **Core** — validates each transaction in proposal order |
| `verified-proposal` | **Core** — holds only the valid subset |
| `block-creator` | Assembles Verified Proposal + rejected hashes into a candidate block |
| `yac-consensus` | Peers agree on the candidate block |
| `commit` | Block committed; World State View updated |
| `blockstore-wsv` | Persists block; serves updated balances |

### Prerequisites

- Accounts for Alice, Bob, and Carol exist in the World State View with known balances.
- All submitted transactions are well-formed and single-signature (stateless validation passes).
- The simulation node represents a single Iroha v1 peer.

---

## Configurable Inputs and Initial State

### World State View (starting balances)

| Entity | Default balance | Notes |
|--------|----------------|-------|
| Alice  | 100 USD | Configurable |
| Bob    | 20 USD  | Configurable |
| Carol  | 30 USD  | Configurable |

The `accounts` set contains `{alice, bob, carol}`. The `assets` set contains `{USD}`.

### Transaction batch (reference scenario — Scenario B, partial failure)

| # | From  | To    | Amount | Computed outcome |
|---|-------|-------|--------|-----------------|
| 1 | Alice | Bob   | 30     | **VALID** — provisional Alice balance 100 ≥ 30 → becomes 70 |
| 2 | Alice | Carol | 90     | **REJECTED** INSUFFICIENT_BALANCE — provisional Alice balance 70 < 90 |
| 3 | Bob   | Alice | 10     | **VALID** — provisional Bob balance 20 ≥ 10 → becomes 10 |

These outcomes are **computed by `validateProposal`**, not hardcoded. If the starting balances or
transaction order are changed, the execution engine recomputes the outcomes accordingly.

### Proposal creation parameters

| Parameter | Default | Configurable range |
|-----------|---------|-------|
| `max_proposal_size` | 3 (matches batch size) | 1–10 |
| `proposal_creation_timeout` | 5000 ms | Not modeled as a real timer — the simulation treats the whole batch as one unit |

---

## Execution Rules, Events, and State Transitions

### Phase 1 — Individual ingestion (per transaction, in submission order)

Each transaction traverses:
```
Client → Torii → Stateless Validation → MST Processor → Peer Communication Service
```

Events (per transaction):
- `TX_SUBMITTED(txId, from, to, amount, asset)`
- `TX_STATELESS_VALID(txId)`
- `TX_MST_PASSTHROUGH(txId)`
- `TX_ROUTED(txId)`

Stateless validation is per-transaction and independent. A structural failure here drops the
transaction before it reaches the Ordering Service.

### Phase 2 — Proposal formation (Ordering Service)

The Ordering Service accumulates transactions until `max_proposal_size` is reached or
`proposal_creation_timeout` elapses.

For the simulation, the entire submitted batch is treated as one Proposal.

Events:
- `PROPOSAL_CREATED(proposalId, txIds[])` — Transactions ordered by receipt time.
- `PROPOSAL_DISTRIBUTED(proposalId)` — Proposal forwarded to peers for stateful validation.

### Phase 3 — Stateful validation

**Confirmed protocol behavior** (verified at `irohad/validation/impl/stateful_validator_impl.cpp`,
tag `1.4.0`, function `StatefulValidatorImpl::validate` → `checkTransactions`):

The Stateful Validator calls `TemporaryWsv::apply(tx)` for each transaction in proposal order.
`TemporaryWsv::apply` both validates and applies the transaction atomically:
- If valid: state changes (balance deductions/credits) are written to the temporary WSV and
  the call returns success.
- If invalid: the temporary WSV is left unchanged and the call returns a `CommandError`.

This means valid transactions' effects accumulate in the temporary WSV before the next
transaction is evaluated. The validation checks performed by `apply` include:

1. Sender account exists in WSV → else `SENDER_NOT_FOUND`.
2. Receiver account exists in WSV → else `RECEIVER_NOT_FOUND`.
3. Asset exists in WSV → else `ASSET_NOT_FOUND`.
4. Sender's **provisional balance** (original minus all prior passing transactions' deductions) ≥ amount → else `INSUFFICIENT_BALANCE`.
5. Sender has `can_transfer` permission → else `NO_PERMISSIONS`.

If the check passes: balance delta is applied to provisional WSV; result is `VALID`.
If any check fails: provisional WSV unchanged; result is `REJECTED` with the first failing reason.

**Key property (confirmed):** Two transactions from the same sender cannot both pass unless the
sender has sufficient combined balance for both, because the second sees the sender's balance
already reduced by the first. This is the protocol-level defence against within-proposal
double-spending.

Events:
- `TX_STATEFUL_VALID(txId, senderProvisionalBalance)`
- `TX_STATEFUL_REJECTED(txId, reason, senderProvisionalBalance)`

### Phase 4 — Verified Proposal

Assembled from all `TX_STATEFUL_VALID` transactions, preserving proposal order.

Events:
- `VERIFIED_PROPOSAL_CREATED(proposalId, validTxIds[], rejectedTxIds[])`

### Phase 5 — Block creation

**Confirmed protocol behavior** (verified at `irohad/simulator/impl/simulator.cpp`, tag `1.4.0`,
function `Simulator::processVerifiedProposal`):

The Simulator creates a block unconditionally from the verified proposal, passing
`proposal->transactions()` (which may be empty) and the collected `rejected_hashes` to
`block_factory_->unsafeCreateBlock`. There is no empty-proposal guard — an empty block
(zero committed transactions, non-empty rejected hashes) is a valid, committed block in Iroha 1.

**Iroha 1 block structure** (confirmed in `shared_model/schema/block.proto`, tag `1.4.0`):

| Field | Description |
|-------|-------------|
| `height` | Sequential block number |
| `prev_block_hash` | Hash of the preceding committed block |
| `created_time` | Block creation timestamp |
| `transactions` | Full transaction data for VALID transactions only |
| `rejected_transactions_hashes` | **Cryptographic hashes of REJECTED transactions** |
| `tx_number` | Count of valid transactions |
| `signatures` | YAC peer signatures (added during consensus) |

**The `rejected_transactions_hashes` field is part of the committed block.** This is distinct
from the original spec, which omitted it. Its purpose: rejected transactions are provably part of
the consensus round's history. A network participant can verify that a transaction was considered
and rejected in a specific block, preventing replay and providing an audit trail.

In the simulation, the symbolic transaction ID stands in for the cryptographic hash.

Events:
- `BLOCK_CANDIDATE_CREATED(height, prevBlockHash, validTxCount, rejectedTxHashCount)`

**Educational simplification:** Block hashes are symbolic labels, not computed values.

### Phase 6 — Consensus and commitment

YAC consensus proceeds as a black box (identical to UC-00). The simulation advances directly to
`COMMIT` once the candidate block exists.

Events:
- `CONSENSUS_REACHED(blockHeight)`
- `BLOCK_COMMITTED(blockHeight, validTxIds[], rejectedTxHashes[])`
- `WSV_UPDATED(finalBalances)`

**World State View update rule:** Only committed (VALID) transactions update account balances.
Rejected transactions have no effect on balances regardless of their position in the block.

---

## World State Model

**Finding addressed:** `computeCumulativeBalances` is insufficient as a general-purpose state
model for UC-01.

### Limitation of `computeCumulativeBalances`

`computeCumulativeBalances` in `src/engine/worldState.ts` works by:
1. Walking flattened dot-paths from committed step `txStateChanges` data.
2. Finding paths whose last segment ends in `"Change"` (case-insensitive).
3. Accumulating those values as numeric deltas.

This is designed for UC-00's pattern: one transaction per committed run, with manually authored
`balanceChange: -10` / `balanceChange: +10` annotations in the scenario step data. It is
**not suitable as the general state model for UC-01** because:
- Balance changes must be computed from the transaction list, not read from manually authored paths.
- Multiple transactions per block affect the same entity with multiple deltas.
- The function is tightly coupled to the dot-path annotation convention, making it fragile as a
  shared engine primitive.

### Proposed approach for UC-01

Add a new pure function alongside `computeCumulativeBalances` (do not replace it — UC-00 must
continue to work):

```ts
// Proposed addition to src/engine/worldState.ts (or a new file)
function applyTransactions(
  balances: Readonly<Record<string, number>>,
  transactions: readonly TransactionSpec[],
): Record<string, number>
```

This function:
1. Copies `balances`.
2. For each transaction in order: `balances[from] -= amount`, `balances[to] += amount`.
3. Returns the new balances.

The `BlockCreationPanel` and workspace can call `applyTransactions` with the committed
transactions from each block to derive current balances, independent of the annotation convention.

`computeCumulativeBalances` is kept unchanged for UC-00 compatibility. The two functions coexist.

---

## Expected Outcomes

### Scenario A — All transactions valid

Precondition: Every transaction in the batch satisfies balance requirements against the sequential
provisional WSV.

Outcome:
- Verified Proposal equals the Proposal.
- Committed block contains all submitted transactions; `rejected_transactions_hashes` is empty.
- World State View reflects all transactions.

### Scenario B — Partial validation failure (reference scenario)

Using the default batch from §Configurable Inputs:

| Tx | Provisional Alice balance before | Result | Provisional Alice balance after |
|----|----------------------------------|--------|---------------------------------|
| 1 (Alice → Bob: 30) | 100 | **VALID** | 70 |
| 2 (Alice → Carol: 90) | 70 | **REJECTED** INSUFFICIENT_BALANCE | 70 (unchanged) |
| 3 (Bob → Alice: 10) | n/a (Bob: 20) | **VALID** | n/a (Bob: 10) |

Committed block: contains Tx 1 and Tx 3; `rejected_transactions_hashes` contains Tx 2's symbolic hash.

Final balances (computed by `applyTransactions({alice:100, bob:20, carol:30}, [tx1, tx3])`):

| Entity | Start | After Tx 1 | After Tx 3 | Final |
|--------|-------|------------|------------|-------|
| Alice  | 100   | 70         | 80         | 80    |
| Bob    | 20    | 50         | 40         | 40    |
| Carol  | 30    | 30         | 30         | 30    |

Carol's balance is unchanged because Tx 2 was rejected.

### Scenario C — All transactions rejected

All transactions fail stateful validation (e.g., all senders have zero balance).

Outcome (confirmed — see §Open Questions for source evidence):
- All transactions appear in the Proposal.
- Verified Proposal contains zero committed transactions.
- **A block IS committed** with `transactions = []` and `rejected_transactions_hashes` containing
  all the rejected transaction IDs. This is authentic Iroha 1 behavior: `Simulator::processVerifiedProposal`
  creates the block unconditionally from the (empty) verified proposal.
- World State View balances are unchanged (no transactions were committed).
- The committed block is recorded in the block chain with an incremented height and the
  previous block's hash.

### Failure paths

| Failure | Location | Effect on simulation |
|---------|----------|----------------------|
| Structurally malformed transaction | Stateless Validation | Dropped before Ordering Service; never enters the Proposal |
| `SENDER_NOT_FOUND` | Stateful Validation | Rejected; hash in block |
| `INSUFFICIENT_BALANCE` | Stateful Validation | Rejected; hash in block |
| `RECEIVER_NOT_FOUND` | Stateful Validation | Rejected; hash in block |
| `ASSET_NOT_FOUND` | Stateful Validation | Rejected; hash in block |

---

## Edge Cases

### Within-proposal order dependency

Two transactions sharing a sender produce different outcomes depending on proposal order.

Example: Alice has 50 USD.
- Proposal order [Alice→Bob: 40, Alice→Carol: 20]:
  - Tx 1 VALID (provisional Alice: 50→10).
  - Tx 2 REJECTED — INSUFFICIENT_BALANCE (provisional Alice: 10 < 20).
- Proposal order [Alice→Carol: 20, Alice→Bob: 40]:
  - Tx 1 VALID (provisional Alice: 50→30).
  - Tx 2 REJECTED — INSUFFICIENT_BALANCE (provisional Alice: 30 < 40).

The simulation must model this faithfully. The execution engine derives outcomes from the
input order; the display order in the Proposal node must match the validation order.

### Receiver also appears as sender

If Bob receives funds in Tx 1 and sends funds in Tx 3, Tx 3's provisional balance for Bob
reflects the increased balance from Tx 1 (since Tx 1 was applied first to the provisional WSV).
This is correct protocol behavior and must be represented accurately.

### Empty Verified Proposal

Occurs when all transactions are rejected. Confirmed behavior: a block IS committed with
zero committed transactions and all rejected transaction hashes. Balances are unchanged.
See §Resolved Protocol Questions for the source evidence.

### Duplicate transactions

Not modeled. The simulation documents duplicate detection as a known limitation.

---

## Resolved Protocol Questions

Both questions have been resolved by inspecting the Iroha 1.4.0 source directly via the
GitHub API (`gh api`). Links point to the exact file at that tag.

### Q1 — Empty-block behavior ✓ RESOLVED

**Question:** When all Proposal transactions fail stateful validation, does Iroha v1 commit an
empty block or skip the round?

**Answer: An empty block IS committed.**

**Source:** [`irohad/simulator/impl/simulator.cpp` — `Simulator::processVerifiedProposal`](https://github.com/hyperledger/iroha/blob/1.4.0/irohad/simulator/impl/simulator.cpp)

The function creates the block unconditionally from whatever `proposal->transactions()` returns
(empty collection if all rejected) plus the collected `rejected_hashes`. There is no conditional
guard that would skip block creation for an empty verified proposal. Relevant excerpt:

```cpp
std::shared_ptr<shared_model::interface::Block> block =
    block_factory_->unsafeCreateBlock(top_block_info.height + 1,
                                      top_block_info.top_hash,
                                      proposal->createdTime(),
                                      proposal->transactions(),   // empty when all rejected
                                      std::move(rejected_hashes)); // non-empty hashes
crypto_signer_->sign(*block);
```

**Implication for the simulation:** Scenario C commits a block with zero transactions and
non-empty `rejectedTransactionHashes`. Balances are unchanged. Block height increments.

### Q2 — Sequential provisional WSV ✓ RESOLVED

**Question:** Does stateful validation apply each passing transaction's deltas to the provisional
WSV before the next transaction is validated?

**Answer: Yes — `TemporaryWsv::apply` both validates and applies atomically.**

**Source:** [`irohad/validation/impl/stateful_validator_impl.cpp` — `checkTransactions`](https://github.com/hyperledger/iroha/blob/1.4.0/irohad/validation/impl/stateful_validator_impl.cpp)
and [`irohad/ametsuchi/temporary_wsv.hpp` — `TemporaryWsv::apply`](https://github.com/hyperledger/iroha/blob/1.4.0/irohad/ametsuchi/temporary_wsv.hpp)

`checkTransactions` calls `temporary_wsv.apply(tx)`. The `TemporaryWsv::apply` docstring
states: "Applies a transaction to current state." If the call succeeds, state changes are
written to the temporary WSV and the function returns success. If it fails, the temporary WSV
is unchanged. The next iteration of the loop over `txs` therefore sees the updated state.

Relevant excerpt from `checkTransactions`:
```cpp
return temporary_wsv.apply(tx).match(
    [](const auto &) { return true; },      // success: tx applied, return true
    [&tx, &transactions_errors_log](auto &&error) {
      transactions_errors_log.emplace_back(...);
      return false;                           // failure: wsv unchanged, return false
    });
```

**Implication for the simulation:** The `validateProposal` execution engine must maintain a
single mutable provisional balance map and apply each passing transaction's delta before
evaluating the next transaction. This is authentic Iroha 1 behavior, not an educational
simplification.

**Additional finding — ATOMIC batch savepoint rollback:**

For `BatchType::ATOMIC` transactions, `validateTransactions` creates a database savepoint
before validating the batch. If all pass, `savepoint->release()` is called (all changes kept).
If any fail, the savepoint wrapper is destroyed without `release()`, which triggers an implicit
rollback of all batch state changes. All transactions in the failed batch are added to the
rejected list with reason "Another transaction failed the batch." This is confirmed at
[`validateTransactions` in `stateful_validator_impl.cpp`](https://github.com/hyperledger/iroha/blob/1.4.0/irohad/validation/impl/stateful_validator_impl.cpp).
UC-01 uses ordinary (non-batch) transactions, so this code path is not exercised — but it
is documented here for completeness and future UC reference.

---

## Test Cases and Acceptance Criteria

**Finding addressed:** Tests must prove that validation outcomes follow actual input balances and
transaction order, not predetermined scenario data. Tests are structured as: given `WorldState` +
`TransactionSpec[]` → assert computed `ValidationOutcome`.

### Unit tests — execution engine (`src/engine/blockFormation.ts`)

Note on test-case notation: `balances` are `bigint` scaled to asset precision. For
precision=0 assets (whole units), `100n` = 100 units. For precision=2 assets, `1050n` = 10.50
units. `assets: { USD: 0 }` means USD has precision=0.

#### UC-01-E-01: Valid transaction reduces provisional balance and passes

```
Given: WorldState { balances: { alice: 100n }, accounts: {alice, bob}, assets: { USD: 0 } }
Given: [ tx1(alice → bob: "30") ]
When:  validateProposal([tx1], worldState)
Then:  results[0] = { txId: 'tx1', status: 'VALID', senderProvisionalBalance: 70n }
Then:  validTxIds = ['tx1']
Then:  rejectedTxIds = []
Then:  finalWorldState.balances = { alice: 70n, bob: 30n }
```

#### UC-01-E-02: Insufficient balance rejection

```
Given: WorldState { balances: { alice: 20n }, accounts: {alice, bob}, assets: { USD: 0 } }
Given: [ tx1(alice → bob: "50") ]
When:  validateProposal([tx1], worldState)
Then:  results[0] = { txId: 'tx1', status: 'REJECTED', reason: 'INSUFFICIENT_BALANCE', senderProvisionalBalance: 20n }
Then:  validTxIds = []
Then:  rejectedTxIds = ['tx1']
Then:  finalWorldState.balances = { alice: 20n } (unchanged)
```

#### UC-01-E-03: Partial failure — reference scenario (Scenario B)

```
Given: WorldState { balances: { alice: 100n, bob: 20n, carol: 30n }, accounts: {alice, bob, carol}, assets: { USD: 0 } }
Given: [ tx1(alice→bob:"30"), tx2(alice→carol:"90"), tx3(bob→alice:"10") ]
When:  validateProposal([tx1, tx2, tx3], worldState)
Then:  results[0] = { txId: 'tx1', status: 'VALID', senderProvisionalBalance: 70n }
Then:  results[1] = { txId: 'tx2', status: 'REJECTED', reason: 'INSUFFICIENT_BALANCE', senderProvisionalBalance: 70n }
Then:  results[2] = { txId: 'tx3', status: 'VALID', senderProvisionalBalance: 40n }
  — Bob's provisional before tx3: 20n (initial) + 30n (received in tx1) = 50n; 50n − 10n = 40n
Then:  validTxIds = ['tx1', 'tx3']
Then:  rejectedTxIds = ['tx2']
Then:  finalWorldState.balances = { alice: 80n, bob: 40n, carol: 30n }
```

#### UC-01-E-04: Order dependency — reversing two conflicting transactions changes both outcomes

```
Given: WorldState { balances: { alice: 50n }, accounts: {alice, bob, carol}, assets: { USD: 0 } }

// Order A: [tx1(alice→bob:"40"), tx2(alice→carol:"20")]
When:  validateProposal([tx1, tx2], worldState)
Then:  results[0].status = 'VALID'   (Alice provisional: 50n→10n)
Then:  results[1].status = 'REJECTED'  (10n < 20n)

// Order B: [tx2(alice→carol:"20"), tx1(alice→bob:"40")]
When:  validateProposal([tx2, tx1], worldState)
Then:  results[0].status = 'VALID'   (Alice provisional: 50n→30n)
Then:  results[1].status = 'REJECTED'  (30n < 40n)
```

This test proves the execution engine derives its outcome from input order, not from hardcoded
expectations.

#### UC-01-E-05: Receiver also appears as sender (later transaction)

```
Given: WorldState { balances: { alice: 100n, bob: 20n }, accounts: {alice, bob}, assets: { USD: 0 } }
Given: [ tx1(alice→bob:"30"), tx2(bob→alice:"40") ]
When:  validateProposal([tx1, tx2], worldState)
Then:  results[0] = { txId: 'tx1', status: 'VALID', senderProvisionalBalance: 70n }
// Bob's provisional balance after tx1: 20n+30n = 50n; 50n ≥ 40n, so tx2 passes
Then:  results[1] = { txId: 'tx2', status: 'VALID', senderProvisionalBalance: 10n }
Then:  finalWorldState.balances = { alice: 110n, bob: 10n }
```

#### UC-01-E-06: Sender not found

```
Given: WorldState { balances: { bob: 20n }, accounts: {bob}, assets: { USD: 0 } }
  — alice is NOT in the accounts set
Given: [ tx1(alice → bob: "10") ]
When:  validateProposal([tx1], worldState)
Then:  results[0] = { txId: 'tx1', status: 'REJECTED', reason: 'SENDER_NOT_FOUND' }
```

#### UC-01-E-07: `applyTransactions` reflects only committed transactions

```
Given: initial balances { alice: 100n, bob: 20n, carol: 30n }
Given: committed transactions from Scenario B = [ tx1(alice→bob:"30"), tx3(bob→alice:"10") ]
When:  applyTransactions({ alice: 100n, bob: 20n, carol: 30n }, [tx1, tx3])
Then:  result = { alice: 80n, bob: 40n, carol: 30n }
  — carol is 30n, not 10n, because the rejected tx2(alice→carol:"90") is excluded
```

This test verifies that `applyTransactions` takes only the committed transaction list, not the
full proposal, and that excluded transactions have no effect.

#### UC-01-E-08: All-rejected — empty block committed, balances unchanged

```
Given: WorldState { balances: { alice: 5n }, accounts: {alice, bob}, assets: { USD: 0 } }
Given: [ tx1(alice→bob: "20"), tx2(alice→bob: "30") ]
When:  validateProposal([tx1, tx2], worldState)
Then:  results[0].status = 'REJECTED', reason = 'INSUFFICIENT_BALANCE'
Then:  results[1].status = 'REJECTED', reason = 'INSUFFICIENT_BALANCE'
Then:  validTxIds = []
Then:  rejectedTxIds = ['tx1', 'tx2']
Then:  finalWorldState.balances = { alice: 5n }  (unchanged)

When:  the XState machine advances to the commit step
Then:  txStateChanges.committedBlock.transactions = []
Then:  txStateChanges.committedBlock.rejectedTransactionHashes = ['tx1', 'tx2']
```

**Source-code evidence (Iroha tag `1.4.0`):**

`irohad/validation/impl/stateful_validator_impl.cpp` — `StatefulValidatorImpl::validate()`:
```cpp
auto validation_result = std::make_unique<VerifiedProposalAndErrors>();
auto valid_txs =
    validateTransactions(proposal.transactions(),
                         temporaryWsv,
                         validation_result->rejected_transactions,  // captures all failing hashes
                         *batch_parser_);

// always creates verified_proposal, even when valid_txs is empty
validation_result->verified_proposal =
    factory_->unsafeCreateProposal(proposal.height(), proposal.createdTime(), valid_txs);
```

`irohad/simulator/impl/simulator.cpp` — `Simulator::processVerifiedProposal()`:
```cpp
std::vector<shared_model::crypto::Hash> rejected_hashes;
for (const auto &rejected_tx : verified_proposal_and_errors->rejected_transactions) {
  rejected_hashes.push_back(rejected_tx.tx_hash);  // all rejected tx hashes collected here
}
// block created unconditionally — proposal->transactions() is empty when all rejected
std::shared_ptr<Block> block =
    block_factory_->unsafeCreateBlock(top_block_info.height + 1,
                                      top_block_info.top_hash,
                                      proposal->createdTime(),
                                      proposal->transactions(),   // [] when all rejected
                                      std::move(rejected_hashes)); // ['tx1','tx2']
```

There is no guard preventing block creation when `proposal->transactions()` is empty.
The all-rejected case produces a committed block with height incremented, zero transactions,
and all original tx hashes in `rejected_transactions_hashes` (block.proto field 6).

#### UC-01-E-09a: Valid fractional quantity within asset precision

```
Given: WorldState { balances: { alice: 1050n }, accounts: {alice, bob}, assets: { USD: 2 } }
  (alice holds 10.50 USD; USD has precision=2 — two decimal places)
Given: [ tx1(alice→bob: "10.50") ]
  (amount precision = 2, which equals asset precision = 2 — valid)
When:  validateProposal([tx1], worldState)
Then:  results[0].status = 'VALID'
Then:  validTxIds = ['tx1']
Then:  finalWorldState.balances = { alice: 0n, bob: 1050n }
```

Iroha 1 precision rule: `asset.precision >= amount.precision()` must hold.
"10.50" has precision 2; USD with precision=2 satisfies `2 >= 2`. ✓

#### UC-01-E-09b: Amount precision below asset precision is accepted

```
Given: WorldState { balances: { alice: 1000n }, accounts: {alice, bob}, assets: { USD: 2 } }
  (alice holds 10.00 USD)
Given: [ tx1(alice→bob: "5") ]
  (amount precision = 0, asset precision = 2 — valid since 2 >= 0)
When:  validateProposal([tx1], worldState)
Then:  results[0].status = 'VALID'
Then:  finalWorldState.balances = { alice: 500n, bob: 500n }
  (500n = 5.00 at precision=2)
```

#### UC-01-E-09c: Excess decimal precision exceeds asset precision — REJECTED

```
Given: WorldState { balances: { alice: 10000n }, accounts: {alice, bob}, assets: { USD: 2 } }
  (alice holds 100.00 USD)
Given: [ tx1(alice→bob: "10.500") ]
  (amount precision = 3, asset precision = 2 — INVALID: 2 >= 3 is false)
When:  validateProposal([tx1], worldState)
Then:  results[0].status = 'REJECTED'
Then:  results[0].reason = 'AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION'
Then:  validTxIds = []
Then:  finalWorldState.balances = { alice: 10000n }  (unchanged)
```

Source: SQL check code 5 in `postgres_command_executor.cpp`:
`SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision`

#### UC-01-E-09d: Malformed amount string throws a precondition error

```
Given: WorldState { balances: { alice: 1000n }, accounts: {alice, bob}, assets: { USD: 2 } }
Given: [ tx1(alice→bob: "-5.00") ]
When:  validateProposal([tx1], worldState)
Then:  throws with message indicating invalid amount string
  — negative amounts produce "NaN" in Iroha 1's Amount class (amount_test.cpp confirms
    checkInvalid(Amount{"-100"})). This fails Iroha 1 stateless validation before reaching
    the stateful validator. In the simulator it is a precondition error, not a RejectionReason.
```

The same precondition applies to empty strings, strings starting with '.', strings containing
non-digit characters, and other inputs that Amount parses as "NaN"
(see `amount_test.cpp` test `AmountTest.Invalid`).

### Integration tests — scenario machine with generated scenario

#### UC-01-I-01: Generated scenario step count matches pipeline stages

```
Given: validateProposal produces a ValidationOutcome
When:  generateBlockFormationScenario(transactions, worldState) is called
Then:  scenario.steps.length equals the number of Iroha v1 pipeline stages (same as UC-00)
Then:  each step references a component ID that exists in iroha1Architecture.components
```

#### UC-01-I-02: txStateChanges at the Stateful Validation step carries the serialized ValidationOutcome

```
Given: a generated scenario (Scenario B)
When:  the XState machine advances to the stateful-validation step
Then:  currentStep.txStateChanges.validationOutcome is a SerializedValidationOutcome
       (bigint values replaced by formatted decimal strings; Set replaced by sorted array)
Then:  validTxIds and rejectedTxIds equal those from validateProposal for the same inputs
Then:  each result.senderProvisionalBalance is a formatted string (e.g. "70" at precision=0)
Then:  JSON.stringify(txStateChanges.validationOutcome) does not throw
```

#### UC-01-I-03: txStateChanges at the Commit step carries the committedBlock (BlockContent)

```
Given: a generated scenario (Scenario B)
When:  the XState machine advances to the commit step
Then:  currentStep.txStateChanges.committedBlock.transactions contains only [ tx1, tx3 ]
Then:  currentStep.txStateChanges.committedBlock.rejectedTransactionHashes contains [ tx2.id ]
```

#### UC-01-I-06: Candidate-block, consensus-outcome, and committed-block are distinct events

```
Given: any generated scenario
When:  inspecting the block-creator step (step-9)
Then:  txStateChanges has 'candidateBlock', not 'committedBlock' or 'consensusOutcome'

When:  inspecting the yac-consensus step (step-10)
Then:  txStateChanges has 'consensusOutcome' { result: 'agreed', blockHeight: number }
       not 'candidateBlock' or 'committedBlock'

When:  inspecting the commit step (step-11)
Then:  txStateChanges has 'committedBlock', not 'candidateBlock'

The candidateBlock and committedBlock objects are distinct references (different identity)
even though their payloads are structurally equal at construction time.
```

#### UC-01-I-07: ScenarioConfig provides deterministic height and timestamps

```
Given: config = { chainHeight: 4, prevBlockHash: 'abc123', createdTime: 1700000000000 }
When:  generateBlockFormationScenario(transactions, worldState, config)
Then:  candidateBlock.height = 5, prevBlockHash = 'abc123', createdTime = 1700000000000
Then:  committedBlock.height = 5, prevBlockHash = 'abc123', createdTime = 1700000000000
Then:  consensusOutcome.blockHeight = 5

Given: no config
Then:  height = 1, prevBlockHash = 'genesis', createdTime = 0  (deterministic defaults)
```

#### UC-01-I-08: selectAppliedTxStateChanges does not duplicate on RESET + replay

```
Given: a generated scenario advanced to completion
When:  the accumulated selectAppliedTxStateChanges is captured (changes1)
And:   RESET is sent and the scenario is advanced to completion again
And:   the accumulated selectAppliedTxStateChanges is captured again (changes2)
Then:  changes1.length === changes2.length  (no extra accumulation)
Then:  for each i, changes1[i] === changes2[i]  (same object references — no re-creation)
```

#### UC-01-I-04: Playback controls work correctly on a generated scenario

```
Given: a generated scenario
When:  NEXT is sent repeatedly until the final step
Then:  selectIsComplete() returns true
When:  PREVIOUS is sent back to the start
Then:  selectCurrentStep() returns undefined
When:  RESET is sent
Then:  the simulation machine is in the initial paused state with stepIndex = -1
```

#### UC-01-I-05: Same inputs always produce the same generated scenario (determinism)

```
Given: the same TransactionSpec[] and WorldState
When:  generateBlockFormationScenario is called twice
Then:  both calls return structurally equal Scenario objects
```

### End-to-end tests (Playwright)

#### UC-01-P-01: Proposal step lists all submitted transactions

When the scenario reaches the Proposal step, the UI shows all submitted transaction summaries
(e.g., "alice → bob: 30 USD").

#### UC-01-P-02: Stateful Validation step shows per-transaction results

When the scenario reaches Stateful Validation, each transaction is labeled ✓ VALID or ✕ REJECTED
with its rejection reason. The provisional sender balance is shown for each.

#### UC-01-P-03: Verified Proposal shows only passing transactions

When the scenario reaches Verified Proposal, only Tx 1 and Tx 3 appear; Tx 2 is absent.
The UI indicates how many were rejected (e.g., "2 of 3 valid").

#### UC-01-P-04: Block card includes both committed transactions

When the scenario reaches Commit, the block card lists Tx 1 and Tx 3. It also indicates that
one transaction hash was rejected (the symbolic Tx 2 ID).

#### UC-01-P-05: World State View after commit matches computed balances

After Commit, the World State View shows Alice = 80, Bob = 40, Carol = 30.
These values must match `applyTransactions` applied to the committed transaction list.

#### UC-01-P-06: Changing transaction order changes which transaction fails

The same test executed with Tx 1 and Tx 2 order-swapped in the input (Tx 2 first) must result
in Tx 2 passing and Tx 1 failing, with correspondingly different post-commit balances.
This is the end-to-end proof that the UI reflects computed outcomes, not predetermined data.

---

## Visualization Requirements

### Proposal node (active step)

- Count: "3 transactions in proposal".
- List: `alice → bob: 30 USD`, `alice → carol: 90 USD`, `bob → alice: 10 USD`.
- Status: "Awaiting stateful validation".

### Stateful Validation node (active step)

New per-transaction overlay (extends the existing stateful-validation-checks panel):
- Each transaction: ✓ VALID or ✕ REJECTED `{reason}`.
- Provisional sender balance after each evaluation.
- Running provisional balance table per entity.

### Verified Proposal node (active step)

- Count: "2 of 3 transactions valid".
- Passing: Tx 1, Tx 3.
- Rejected: Tx 2 — `INSUFFICIENT_BALANCE` (alice provisional balance: 70).

### Block Creation Panel

- Block card lists each committed transaction in compact `from → to: amount asset` format.
- Rejected transaction hashes listed beneath the transactions (symbolic IDs, labeled "Rejected hashes:").
- The existing committed-block chain and World State View balance display remain intact.

### Interaction Panel

- Accepts 2–4 transactions as input before the scenario begins.
- Displays the full batch summary, not a single from/to pair.

### Transaction marker / animation

The existing marker represents the **batch as a unit** through the pipeline. Per-transaction
detail is exposed through per-step overlays and narration. No multiple simultaneous markers.

---

## Infrastructure Changes Required

### 1. `src/engine/blockFormation.ts` (new file)

Contains: `WorldState`, `TransactionSpec`, `RejectionReason`, `TransactionValidationResult`,
`ValidationOutcome`, `BlockContent` types; `validateProposal` function; `applyTransactions` function.

`validateProposal` must guard against malformed `amount` strings before running any validation
loop. The Amount parsing rules come from `amount.cpp` and `amount_test.cpp`:

```ts
// Guard: reject amounts that Iroha 1 Amount class would parse as "NaN"
// (empty string, negative, starts with '.', non-digit characters, multiple dots)
// NOTE: /^\d+(\.\d*)?$/ is used (not /^\d+(\.\d+)?$/) to accept "1." (trailing dot),
// which Iroha 1 Amount{"1."} parses as precision=0, value=1 (confirmed by amount_test.cpp).
function parseAmount(amountStr: string, assetPrecision: number): bigint {
  if (!/^\d+(\.\d*)?$/.test(amountStr)) {
    throw new Error(`Invalid amount string "${amountStr}" — would parse as NaN in Iroha 1`)
  }
  const dotIndex = amountStr.indexOf('.')
  const fractionalDigits = dotIndex === -1 ? 0 : amountStr.length - dotIndex - 1
  if (fractionalDigits > assetPrecision) {
    // This is AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION — a protocol rejection, not a throw
    // Return the fractionalDigits so the caller can produce the correct RejectionReason
  }
  // Convert to scaled bigint: "10.50" at precision=2 → 1050n
  const intPart = dotIndex === -1 ? amountStr : amountStr.slice(0, dotIndex)
  const fracPart = dotIndex === -1 ? '' : amountStr.slice(dotIndex + 1)
  const scaled = fracPart.padEnd(assetPrecision, '0').slice(0, assetPrecision)
  return BigInt(intPart + scaled)
}
```

**Arithmetic must use `bigint` throughout.** IEEE 754 `number` cannot represent values like
0.1 + 0.2 exactly. All balance arithmetic uses `bigint` values scaled to the asset's precision.
Example: USD precision=2, balance 1050n − transfer "10.50" (→ 1050n) = 0n.

The malformed-string guard is a precondition (throws). The precision-exceeds-asset check is a
`RejectionReason` returned from the validation loop, not a thrown error.

No changes to `src/engine/types.ts`.

### 2. `src/architectures/iroha1/scenarios/blockFormation.ts` (new file)

Contains: `ScenarioConfig`, `generateBlockFormationScenario(transactions, worldState, config?): Scenario`.
Calls `validateProposal` and `serializeValidationOutcome`, generates step narration from the
computed outcome, and builds the `Scenario` object fed to the XState machine.

```ts
export interface ScenarioConfig {
  chainHeight?: number    // current chain height; block height = chainHeight + 1 (default: 0)
  prevBlockHash?: string  // hash of last committed block (default: 'genesis')
  createdTime?: number    // simulation clock value for block.createdTime (default: 0)
}
```

The `config` parameter enables deterministic block height and timestamps from simulation state.
Without a config, defaults produce the first-block scenario (height=1, prevBlockHash='genesis',
createdTime=0). The caller derives `createdTime` from an external simulation clock before
calling `generateBlockFormationScenario` — the function never calls `Date.now()`.

No changes to `src/engine/simulationMachine.ts`.

### 3. `src/engine/types.ts` — additive extension for multi-transaction scenarios

Add optional `transactions?: readonly TransactionSpec[]` to `Scenario`. Single-transaction
scenarios (UC-00) continue to use only `initialTx`. UC-01 scenarios populate `transactions`
(UC-00 compatibility is maintained).

### 4. `src/architectures/iroha1/index.ts` — register UC-01 scenario

Add the generated scenario to `scenarios[]` alongside `aliceSendsTenUsdToBobScenario`. Because
`generateBlockFormationScenario` takes runtime inputs, the architecture module registers a
default scenario using the reference starting balances.

### 5. UI extensions (presentation layer only)

- `InteractionPanel.tsx` — multi-transaction input and batch summary display.
- `BlockCreationPanel.tsx` — multi-tx block cards, rejected-hash display.
- New `ValidationResultsPanel.tsx` — per-transaction validation status at Stateful Validation step.
- `IrohaWorkspace.tsx` — scenario selector (minor routing extension).

---

## Reusable Infrastructure (from MVP)

| File | Assessment |
|------|-----------|
| `src/engine/simulationMachine.ts` | **Unchanged** — drives generated UC-01 steps exactly as UC-00 |
| `src/engine/worldState.ts` — `computeCumulativeBalances` | **Kept as-is for UC-00**; not used for UC-01 balance computation. UC-01 uses `applyTransactions` (new function in `blockFormation.ts`) instead. |
| `src/engine/txStateChange.ts` — `flattenTxStateChange` | **Unchanged** — still used by UC-00; UC-01 UI reads typed `txStateChanges` sub-fields directly via typed helpers, not via flattened paths |
| `src/engine/validateArchitecture.ts` | **Unchanged** — UC-01 scenario validates against the same schema |
| `src/engine/registry.ts` | **Unchanged** |
| `src/engine/highlightGraph.ts` | **Unchanged** |
| `src/engine/animationPath.ts` | **Unchanged** |
| `src/architectures/iroha1/` (components, connections, concepts) | **Unchanged** |
| `src/state/useSimulationActor.ts` | **Unchanged** |
| `src/state/appStore.ts` | Minor extension — scenario selection |

---

## Existing Test Suite Baseline

**Finding addressed:** Exact test command and output supporting the reported 81 passing tests.

```
$ npm run test

> blockchain-architecture-simulator@0.0.0 test
> vitest run

 RUN  v5.0.1 /Users/sde/Projects/Blockchain-Architecture-Simulator

 Test Files  11 passed (11)
      Tests  81 passed (81)
   Start at  18:30:19
   Duration  212ms (transform 45%, import 43%, tests 8%, worker 4%)
```

Test files (11):
- `tests/engine/animationPath.test.ts`
- `tests/engine/appStore.test.ts`
- `tests/engine/categoryStyles.test.ts`
- `tests/engine/highlightGraph.test.ts`
- `tests/engine/iroha1Architecture.test.ts`
- `tests/engine/registry.test.ts`
- `tests/engine/registryComposition.test.ts`
- `tests/engine/simulationMachine.test.ts`
- `tests/engine/txStateChange.test.ts`
- `tests/engine/validateArchitecture.test.ts`
- `tests/engine/worldState.test.ts`

No UC-01 engine tests exist yet. All 81 tests cover existing UC-00 (happy-path) behavior.
UC-01 engine tests will be added to `tests/engine/blockFormation.test.ts`.

---

## Implementation Status and Limitations

**Status:** Execution engine and scenario generator implemented and tested. Visual prototyping
not yet begun — pending review approval.

### Implemented (approved increments)

| Item | File | Status |
|------|------|--------|
| Execution engine (`validateProposal`, `applyTransactions`) | `src/engine/blockFormation.ts` | ✓ Complete |
| Serialization utilities (`formatScaledAmount`, `serializeValidationOutcome`) | `src/engine/blockFormation.ts` | ✓ Complete |
| Scenario generator (`generateBlockFormationScenario`) | `src/architectures/iroha1/scenarios/blockFormation.ts` | ✓ Complete |
| `ScenarioConfig` for deterministic height/timestamps | `src/architectures/iroha1/scenarios/blockFormation.ts` | ✓ Complete |
| Distinct `candidateBlock` / `consensusOutcome` / `committedBlock` events | Scenario generator step data | ✓ Complete |
| Engine tests (UC-01-E-01 through E-09e) | `tests/engine/blockFormation.test.ts` | ✓ 55 tests pass |
| Scenario integration tests (UC-01-I-01 through I-08) | `tests/engine/blockFormationScenario.test.ts` | ✓ 29 tests pass |
| Multi-transaction `Scenario.transactions` field | `src/engine/types.ts` | ✓ Additive only |

**Test baseline (current):** 139 tests pass across 13 test files. TypeScript build: clean.

### Pending review

Visual prototyping and UI integration are not yet begun. The next increment is the visual
prototype for UC-01, requiring independent review of the current engine and scenario generator
before proceeding.

### Resolved limitations

| Item | Resolution |
|------|-----------|
| `"1."` regex mismatch | Fixed: regex updated from `/^\d+(\.\d+)?$/` to `/^\d+(\.\d*)?$/`; `"1."` is now accepted (precision=0, value=1), matching Iroha 1 `amount_test.cpp` |
| `bigint` in txStateChanges (not JSON-safe) | Fixed: `serializeValidationOutcome` converts bigint→string, Set→sorted array before embedding in step data |
| Placeholder block height/timestamp | Fixed: `ScenarioConfig` injection; defaults are deterministic (height=1, prevBlockHash='genesis', createdTime=0) |
| Shared `blockContent` reference between candidate and commit steps | Fixed: separate `candidateBlock` and `committedBlock` objects; `consensusOutcome` added to step-10 |

### Known educational simplifications

- YAC consensus is a black box that always succeeds.
- Block hashes and rejected transaction hashes are symbolic IDs, not cryptographic values.
- Multi-peer Proposal distribution is not visualized.
- `proposal_creation_timeout` is not modeled as a real timer.
- Transaction deduplication is not modeled.
- The batch is animated as a unit; individual per-transaction markers are not implemented.
- Atomic and ordered `BatchType` semantics are explicitly out of scope.
- `prevBlockHash` is a symbolic string, not computed from actual block content.
- `createdTime` is injected via `ScenarioConfig` rather than from a live simulation clock;
  the first-block default is 0 (deterministic) rather than a real epoch timestamp.
