/**
 * UC-03: Multiple Transactions and Block Formation
 *
 * Execution engine implementing Iroha v1.4.0 stateful validation semantics:
 * - Sequential per-transaction validation against a provisional WorldState View
 * - Each passing transaction's balance deltas are applied before the next is evaluated
 * - All-rejected proposals still produce a committed block (confirmed: simulator.cpp)
 *
 * Source: irohad/validation/impl/stateful_validator_impl.cpp
 *         irohad/simulator/impl/simulator.cpp
 *         irohad/ametsuchi/impl/postgres_command_executor.cpp
 *         shared_model/interfaces/common_objects/impl/amount.cpp
 */

export interface WorldState {
  /**
   * Account balances as bigint scaled to the asset's precision.
   * E.g. for USD with precision=2, balance 1050n represents 10.50 USD.
   * bigint is required — IEEE 754 number cannot represent fractional values exactly.
   */
  balances: Readonly<Record<string, bigint>>
  accounts: ReadonlySet<string>
  /**
   * Map of assetId → precision (0–255 decimal places).
   * Source: Asset::precision() in shared_model/interfaces/common_objects/asset.hpp
   */
  assets: Readonly<Record<string, number>>
}

export interface TransactionSpec {
  id: string
  from: string
  to: string
  asset: string
  /**
   * Transfer amount as a decimal string, e.g. "10", "10.50", "0.001".
   * Matches Iroha 1 Amount class. Negative and malformed strings throw before
   * reaching validation; precision-exceeding strings produce a RejectionReason.
   */
  amount: string
}

export type RejectionReason =
  | 'INSUFFICIENT_BALANCE'
  | 'SENDER_NOT_FOUND'
  | 'RECEIVER_NOT_FOUND'
  | 'ASSET_NOT_FOUND'
  /**
   * Amount has more decimal places than the asset's configured precision.
   * Maps to SQL check code 5 in postgres_command_executor.cpp transfer_asset:
   *   SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision
   */
  | 'AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION'
  | 'NO_PERMISSIONS'
  | 'EXPIRED'

export interface TransactionValidationResult {
  txId: string
  status: 'VALID' | 'REJECTED'
  reason?: RejectionReason
  /**
   * Sender's balance in the provisional WSV after this transaction is processed.
   * Stored as bigint scaled to the asset's precision. Unchanged on rejection.
   */
  senderProvisionalBalance: bigint
}

export interface ValidationOutcome {
  results: readonly TransactionValidationResult[]
  validTxIds: readonly string[]
  rejectedTxIds: readonly string[]
  finalWorldState: WorldState
}

export interface BlockContent {
  height: number
  /** Symbolic label — cryptographic hash computation is out of scope. */
  prevBlockHash: string
  createdTime: number
  /** Committed (VALID) transactions. Maps to Block_v1.Payload.transactions. */
  transactions: readonly TransactionSpec[]
  /**
   * REJECTED transaction identifiers. Maps to Block_v1.Payload.rejected_transactions_hashes.
   * Present and non-empty when any transactions were rejected. Present but empty when
   * all transactions passed. The all-rejected case produces an empty transactions list
   * with all ids here — confirmed by simulator.cpp:processVerifiedProposal.
   */
  rejectedTransactionHashes: readonly string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Matches the valid amount format from Iroha 1's Amount class (amount.cpp). */
const AMOUNT_RE = /^\d+(\.\d+)?$/

function countDecimalPlaces(amountStr: string): number {
  const dotIndex = amountStr.indexOf('.')
  return dotIndex === -1 ? 0 : amountStr.length - dotIndex - 1
}

/**
 * Convert a validated decimal string to a bigint scaled to assetPrecision.
 * "10.50" with precision=2 → 1050n; "5" with precision=2 → 500n.
 * Caller must have already confirmed amountPrecision <= assetPrecision.
 */
function scaleAmount(amountStr: string, assetPrecision: number): bigint {
  const dotIndex = amountStr.indexOf('.')
  const intPart = dotIndex === -1 ? amountStr : amountStr.slice(0, dotIndex)
  const fracPart = dotIndex === -1 ? '' : amountStr.slice(dotIndex + 1)
  const paddedFrac = fracPart.padEnd(assetPrecision, '0')
  return BigInt(intPart) * 10n ** BigInt(assetPrecision) + BigInt(paddedFrac || '0')
}

// ---------------------------------------------------------------------------
// Exported engine functions
// ---------------------------------------------------------------------------

/**
 * Core UC-03 execution engine. Implements Iroha v1.4.0 stateful validation:
 * transactions are evaluated sequentially against a provisional WSV; each
 * passing transaction's balance delta is applied before the next is checked.
 *
 * Source: StatefulValidatorImpl::validate + checkTransactions in
 *         irohad/validation/impl/stateful_validator_impl.cpp
 */
export function validateProposal(
  transactions: readonly TransactionSpec[],
  worldState: WorldState,
): ValidationOutcome {
  // Precondition guard: reject malformed amount strings before the validation loop.
  // In Iroha 1 these fail stateless validation; in the simulator they indicate a
  // programming error in the scenario definition.
  for (const tx of transactions) {
    if (!AMOUNT_RE.test(tx.amount)) {
      throw new Error(
        `TransactionSpec ${tx.id}: invalid amount string "${tx.amount}" — ` +
          `negative, empty, or non-numeric amounts fail Iroha 1 stateless validation`,
      )
    }
  }

  // Mutable provisional WSV — mirrors TemporaryWsv in Iroha 1.
  // Each VALID transaction's delta is applied before the next transaction runs.
  const provisional = new Map<string, bigint>(Object.entries(worldState.balances))

  const results: TransactionValidationResult[] = []

  for (const tx of transactions) {
    const currentSenderBalance = provisional.get(tx.from) ?? 0n

    const reject = (reason: RejectionReason): TransactionValidationResult => ({
      txId: tx.id,
      status: 'REJECTED',
      reason,
      senderProvisionalBalance: currentSenderBalance,
    })

    if (!worldState.accounts.has(tx.from)) {
      results.push(reject('SENDER_NOT_FOUND'))
      continue
    }

    if (!worldState.accounts.has(tx.to)) {
      results.push(reject('RECEIVER_NOT_FOUND'))
      continue
    }

    const assetPrecision = worldState.assets[tx.asset]
    if (assetPrecision === undefined) {
      results.push(reject('ASSET_NOT_FOUND'))
      continue
    }

    // SQL check code 5: asset.precision >= amount.precision
    if (countDecimalPlaces(tx.amount) > assetPrecision) {
      results.push(reject('AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION'))
      continue
    }

    const scaledAmount = scaleAmount(tx.amount, assetPrecision)

    if (currentSenderBalance < scaledAmount) {
      results.push(reject('INSUFFICIENT_BALANCE'))
      continue
    }

    // Valid: apply delta to provisional WSV (mirrors TemporaryWsv::apply).
    const newSenderBalance = currentSenderBalance - scaledAmount
    provisional.set(tx.from, newSenderBalance)
    provisional.set(tx.to, (provisional.get(tx.to) ?? 0n) + scaledAmount)

    results.push({
      txId: tx.id,
      status: 'VALID',
      senderProvisionalBalance: newSenderBalance,
    })
  }

  const validTxIds = results.filter((r) => r.status === 'VALID').map((r) => r.txId)
  const rejectedTxIds = results.filter((r) => r.status === 'REJECTED').map((r) => r.txId)

  const finalWorldState: WorldState = {
    balances: Object.fromEntries(provisional),
    accounts: worldState.accounts,
    assets: worldState.assets,
  }

  return { results, validTxIds, rejectedTxIds, finalWorldState }
}

/**
 * Apply a list of already-validated (committed) transactions to an initial balance map.
 * Used to compute the World State View after a committed block.
 * Unlike validateProposal, this function trusts that every supplied transaction is valid.
 */
export function applyTransactions(
  initialBalances: Readonly<Record<string, bigint>>,
  transactions: readonly TransactionSpec[],
  assets: Readonly<Record<string, number>>,
): Readonly<Record<string, bigint>> {
  const balances = new Map<string, bigint>(Object.entries(initialBalances))

  for (const tx of transactions) {
    const assetPrecision = assets[tx.asset] ?? 0
    const scaled = scaleAmount(tx.amount, assetPrecision)
    balances.set(tx.from, (balances.get(tx.from) ?? 0n) - scaled)
    balances.set(tx.to, (balances.get(tx.to) ?? 0n) + scaled)
  }

  return Object.fromEntries(balances)
}
