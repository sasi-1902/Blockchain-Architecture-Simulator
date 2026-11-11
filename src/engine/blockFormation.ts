/**
 * UC-01: Multiple Transactions and Block Formation
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
   * Symbolic identifiers of REJECTED transactions.
   *
   * In Iroha 1 these are cryptographic hashes stored in
   * `Block_v1.Payload.rejected_transactions_hashes` (block.proto field 6).
   * In this simulator the transaction's `id` stands in for the hash —
   * cryptographic hash computation is out of scope.
   *
   * Present in every committed block. Non-empty when any transactions were rejected;
   * empty (but present) when all transactions passed. The all-rejected case produces
   * an empty `transactions` list with all IDs here (confirmed: simulator.cpp).
   */
  rejectedTransactionIds: readonly string[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Matches the valid amount format from Iroha 1's Amount class (amount.cpp).
 * Accepts: "5", "10.50", "1." (trailing dot = precision 0, confirmed by amount_test.cpp).
 * Rejects: ".5" (no leading digit), "-5", "", non-numeric.
 * Note: the previous regex /^\d+(\.\d+)?$/ rejected "1." — this is the corrected form.
 */
const AMOUNT_RE = /^\d+(\.\d*)?$/

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
 * Core UC-01 execution engine. Implements Iroha v1.4.0 stateful validation:
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
  // Precondition: all asset precisions must be integers in the Iroha 1 uint8 range [0, 255].
  // Source: Asset::precision() returns PrecisionType (uint8) in
  //         shared_model/interfaces/common_objects/asset.hpp.
  // Non-integer or out-of-range values indicate a misconfigured WorldState.
  for (const [assetId, precision] of Object.entries(worldState.assets)) {
    if (!Number.isInteger(precision) || precision < 0 || precision > 255) {
      throw new Error(
        `WorldState asset "${assetId}": precision ${precision} is not a valid Iroha 1 asset precision — ` +
          'must be an integer in the range 0–255 (uint8). ' +
          'Source: Asset::precision() in shared_model/interfaces/common_objects/asset.hpp',
      )
    }
  }

  // Precondition: transaction IDs must be unique within a proposal.
  // Duplicate IDs would corrupt validTxIds / rejectedTransactionIds with repeated entries
  // and make it impossible to identify which transaction a result refers to.
  const txIds = new Set(transactions.map((tx) => tx.id))
  if (txIds.size < transactions.length) {
    throw new Error(
      'validateProposal: transaction IDs must be unique within a proposal — ' +
        'duplicate IDs prevent reliable per-transaction result tracking',
    )
  }

  // Precondition: all transactions must use the same asset.
  // WorldState.balances is keyed by account name without asset information.
  // A multi-asset proposal would check one asset's balance against a different
  // asset's transfer amount — producing incorrect accept/reject decisions.
  const usedAssets = new Set(transactions.map((tx) => tx.asset))
  if (usedAssets.size > 1) {
    throw new Error(
      'validateProposal: multi-asset proposals are not supported — ' +
        'all transactions must use the same asset. ' +
        `Found assets: ${[...usedAssets].sort().join(', ')}`,
    )
  }

  // Precondition: reject malformed amount strings before the validation loop.
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
 *
 * @internal — callers MUST supply only transactions from `ValidationOutcome.validTxIds`.
 * Passing unvalidated transactions is a programming error: the function will throw if
 * any balance goes negative, which is the postcondition invariant for committed transactions
 * (a valid transaction can only debit an amount the sender can cover).
 *
 * Unlike `validateProposal`, this function does not re-check individual transfer rules;
 * it only applies the balance deltas and asserts the result is non-negative.
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

  // Postcondition: no balance may go negative after applying committed transactions.
  // A negative balance means an unvalidated transaction was supplied — only
  // transactions from ValidationOutcome.validTxIds are safe to pass here.
  for (const [account, balance] of balances) {
    if (balance < 0n) {
      throw new Error(
        `applyTransactions: account "${account}" reached a negative balance (${balance}) — ` +
          'only pre-validated transactions from ValidationOutcome.validTxIds may be committed. ' +
          'Use validateProposal to determine which transactions are safe to apply.',
      )
    }
  }

  return Object.fromEntries(balances)
}

// ---------------------------------------------------------------------------
// Serialization utilities (precision-safe, JSON-compatible)
// ---------------------------------------------------------------------------

/**
 * Format a bigint balance scaled to `precision` decimal places as a human-readable
 * decimal string. Required because JSON.stringify throws on bigint.
 *
 * Examples (precision=2): 1050n → "10.50", 100n → "1.00", 0n → "0.00"
 * Examples (precision=0): 100n → "100", 0n → "0"
 */
export function formatScaledAmount(scaled: bigint, precision: number): string {
  if (precision === 0) return scaled.toString()
  const str = scaled.toString().padStart(precision + 1, '0')
  const intPart = str.slice(0, str.length - precision)
  const fracPart = str.slice(str.length - precision)
  return `${intPart}.${fracPart}`
}

/** JSON-serializable form of TransactionValidationResult (bigint → string). */
export interface SerializedTransactionResult {
  txId: string
  status: 'VALID' | 'REJECTED'
  reason?: RejectionReason
  /** Sender's provisional balance formatted as a decimal string. */
  senderProvisionalBalance: string
}

/** JSON-serializable form of ValidationOutcome (bigint → string, Set → sorted array). */
export interface SerializedValidationOutcome {
  results: readonly SerializedTransactionResult[]
  validTxIds: readonly string[]
  rejectedTxIds: readonly string[]
  finalWorldState: {
    balances: Readonly<Record<string, string>>
    accounts: readonly string[]
    assets: Readonly<Record<string, number>>
  }
}

/**
 * Convert a ValidationOutcome to a JSON-serializable form.
 * bigint balances are formatted using per-transaction asset precision.
 * The `accounts` Set is converted to a sorted array.
 *
 * The `transactions` list is used to look up each transaction's asset so that
 * `senderProvisionalBalance` is formatted correctly per asset precision.
 * `finalWorldState.balances` is formatted using the primary asset's precision
 * (the asset from the first transaction).
 */
export function serializeValidationOutcome(
  outcome: ValidationOutcome,
  transactions: readonly TransactionSpec[],
  assets: Readonly<Record<string, number>>,
): SerializedValidationOutcome {
  const txAssetMap = new Map(transactions.map((t) => [t.id, t.asset]))
  const primaryAsset = transactions[0]?.asset ?? ''
  const primaryPrecision = assets[primaryAsset] ?? 0

  return {
    results: outcome.results.map((r) => {
      const assetId = txAssetMap.get(r.txId) ?? primaryAsset
      const precision = assets[assetId] ?? 0
      const serialized: SerializedTransactionResult = {
        txId: r.txId,
        status: r.status,
        senderProvisionalBalance: formatScaledAmount(r.senderProvisionalBalance, precision),
      }
      if (r.reason !== undefined) serialized.reason = r.reason
      return serialized
    }),
    validTxIds: outcome.validTxIds,
    rejectedTxIds: outcome.rejectedTxIds,
    finalWorldState: {
      balances: Object.fromEntries(
        Object.entries(outcome.finalWorldState.balances).map(([account, balance]) => [
          account,
          formatScaledAmount(balance, primaryPrecision),
        ]),
      ),
      accounts: [...outcome.finalWorldState.accounts].sort(),
      assets: outcome.finalWorldState.assets,
    },
  }
}
