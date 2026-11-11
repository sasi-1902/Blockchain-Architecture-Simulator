/**
 * UC-01: Multiple Transactions and Block Formation — Scenario Generator
 *
 * Converts a computed ValidationOutcome into a structured Scenario compatible
 * with the existing XState playback controller. The validation engine runs
 * exactly once here; the XState machine only replays pre-computed step data.
 *
 * Replay safety: validateProposal is called at construction time and its result
 * is embedded as frozen step data. NEXT/PREVIOUS/RESET only move stepIndex.
 * Balance changes cannot be applied twice.
 */

import { serializeValidationOutcome, validateProposal } from '../../../engine/blockFormation'
import type {
  BlockContent,
  SerializedValidationOutcome,
  TransactionSpec,
  ValidationOutcome,
  WorldState,
} from '../../../engine/blockFormation'
import type { Scenario } from '../../../engine/types'

function plural(count: number, singular: string, plural_ = `${singular}s`): string {
  return count === 1 ? singular : plural_
}

function buildValidationNarration(
  outcome: ValidationOutcome,
  txCount: number,
): string {
  const v = outcome.validTxIds.length
  const r = outcome.rejectedTxIds.length

  if (r === 0) {
    return `All ${txCount} ${plural(txCount, 'transaction')} pass stateful validation against the World State View.`
  }
  if (v === 0) {
    return `All ${txCount} ${plural(txCount, 'transaction')} fail stateful validation. The verified proposal is empty.`
  }
  return (
    `${v} of ${txCount} ${plural(txCount, 'transaction')} pass stateful validation. ` +
    `${r} ${plural(r, 'transaction')} ${plural(r, 'is', 'are')} rejected.`
  )
}

/**
 * Configuration for deterministic block content and simulation clock.
 * All fields are optional; defaults produce a deterministic first-block scenario.
 */
export interface ScenarioConfig {
  /**
   * Current chain height before this block is added.
   * The new block's height is chainHeight + 1. Default: 0 (block height 1).
   */
  chainHeight?: number
  /**
   * Hash of the last committed block (used as prevBlockHash).
   * Default: 'genesis' (first block in the chain).
   */
  prevBlockHash?: string
  /**
   * Simulation clock value for block.createdTime.
   * Pass the result of a simulation clock's now() for determinism. Default: 0.
   */
  createdTime?: number
}

/**
 * Generate a Scenario for UC-01 block formation from a list of transaction
 * specs and an initial WorldState.
 *
 * The function calls validateProposal once and embeds the results in the
 * returned Scenario's step data. It must not be called again during playback.
 *
 * The generated scenario's 11 steps mirror the Iroha v1 transaction pipeline
 * in the same order as the UC-00 happy-path scenario so that the existing
 * XState machine and pipeline diagram work without changes.
 *
 * @param config - Optional chain state and simulation clock overrides for
 *   deterministic block height and timestamps. Defaults produce height=1,
 *   prevBlockHash='genesis', createdTime=0.
 */
export function generateBlockFormationScenario(
  transactions: readonly TransactionSpec[],
  worldState: WorldState,
  config?: ScenarioConfig,
): Scenario {
  // Single call to the execution engine — never recalculated during playback.
  const outcome: ValidationOutcome = validateProposal(transactions, worldState)

  // Serialized form for txStateChanges: bigint → string, Set → sorted array.
  // Raw bigints cannot be safely embedded in JSON-serializable step data.
  const serializedOutcome: SerializedValidationOutcome = serializeValidationOutcome(
    outcome,
    transactions,
    worldState.assets,
  )

  const validTxSet = new Set(outcome.validTxIds)
  const validTransactions = transactions.filter((tx) => validTxSet.has(tx.id))

  const blockHeight = (config?.chainHeight ?? 0) + 1
  const prevBlockHash = config?.prevBlockHash ?? 'genesis'
  const createdTime = config?.createdTime ?? 0

  // Candidate and committed blocks are distinct objects even though their data
  // is identical at construction time. This allows inspectors to unambiguously
  // identify the pipeline stage: candidateBlock = pre-consensus, committedBlock = finalized.
  const candidateBlock: BlockContent = {
    height: blockHeight,
    prevBlockHash,
    createdTime,
    transactions: validTransactions,
    rejectedTransactionHashes: outcome.rejectedTxIds,
  }
  const committedBlock: BlockContent = { ...candidateBlock }

  const txCount = transactions.length
  const validCount = outcome.validTxIds.length
  const rejectedCount = outcome.rejectedTxIds.length

  const category = rejectedCount === 0 ? 'success' : 'other'
  const firstTx = transactions[0]

  return {
    id: 'uc01-block-formation',
    name: `Block Formation — ${txCount} ${plural(txCount, 'transaction')}`,
    description:
      `${validCount} of ${txCount} ${plural(txCount, 'transaction')} committed. ` +
      (rejectedCount > 0 ? `${rejectedCount} rejected.` : 'None rejected.'),
    category,
    // `initialTx` is kept for backward-compat with single-tx scaffolding.
    // The authoritative transaction list is in `scenario.transactions`.
    initialTx: {
      from: firstTx?.from ?? '',
      to: firstTx?.to ?? '',
      asset: firstTx?.asset ?? '',
      amount: 0,
    },
    transactions,
    steps: [
      {
        id: 'step-1-torii',
        componentId: 'torii',
        narration: `${txCount} ${plural(txCount, 'transaction')} submitted to Torii.`,
      },
      {
        id: 'step-2-stateless-validation',
        componentId: 'stateless-validation',
        narration: `Transaction structure and signatures verified. All ${txCount} ${plural(txCount, 'transaction')} pass stateless validation.`,
      },
      {
        id: 'step-3-mst-processor',
        componentId: 'mst-processor',
        narration: `All ${txCount} ${plural(txCount, 'transaction')} satisfy the required signature quorum and pass through the MST Processor.`,
      },
      {
        id: 'step-4-peer-communication-service',
        componentId: 'peer-communication-service',
        narration: `The fully signed ${plural(txCount, 'transaction')} routed toward the ordering pipeline.`,
      },
      {
        id: 'step-5-ordering-service',
        componentId: 'ordering-service',
        narration: `${txCount} ${plural(txCount, 'transaction')} accepted for batching into a proposal.`,
      },
      {
        // Proposal formation: all submitted transactions are included.
        id: 'step-6-proposal',
        componentId: 'proposal',
        narration: `Proposal formed containing all ${txCount} submitted ${plural(txCount, 'transaction')}.`,
        txStateChanges: {
          proposal: { transactions },
        },
      },
      {
        // Stateful validation: sequential per-transaction validation against the provisional WSV.
        // serializedOutcome is JSON-safe (bigint → string, Set → sorted array).
        // The raw ValidationOutcome with bigints is computed once here and never recalculated.
        id: 'step-7-stateful-validation',
        componentId: 'stateful-validation',
        narration: buildValidationNarration(outcome, txCount),
        txStateChanges: {
          validationOutcome: serializedOutcome,
        },
      },
      {
        // Verified proposal: only the passing transactions are carried forward.
        id: 'step-8-verified-proposal',
        componentId: 'verified-proposal',
        narration:
          validCount === 0
            ? `Verified Proposal is empty — all ${txCount} ${plural(txCount, 'transaction')} were rejected. An empty block will still be committed per Iroha v1.4.0 behavior.`
            : `Verified Proposal contains ${validCount} ${plural(validCount, 'transaction')}.`,
        txStateChanges: {
          verifiedProposal: {
            validTxIds: outcome.validTxIds,
            rejectedTxIds: outcome.rejectedTxIds,
          },
        },
      },
      {
        // Candidate block: the block is created from the verified proposal.
        // This is a CANDIDATE — consensus has not yet been reached.
        // Source: Simulator::processVerifiedProposal in simulator.cpp
        id: 'step-9-block-creator',
        componentId: 'block-creator',
        narration:
          `Candidate block created with ${validCount} committed ${plural(validCount, 'transaction')} ` +
          `and ${rejectedCount} rejected ${plural(rejectedCount, 'hash', 'hashes')}.`,
        txStateChanges: {
          candidateBlock,
        },
      },
      {
        // Consensus: peers vote on the candidate block via YAC protocol.
        // consensusOutcome is a distinct event — it must not be confused with block creation
        // (step 9) or commitment (step 11).
        id: 'step-10-yac-consensus',
        componentId: 'yac-consensus',
        narration: `Peers reach consensus on the candidate block via YAC.`,
        txStateChanges: {
          consensusOutcome: {
            result: 'agreed',
            blockHeight,
          },
        },
      },
      {
        // Commit: the block is finalized and the World State View is updated.
        // committedBlock is a distinct object from candidateBlock (different reference,
        // same payload) — inspectors can distinguish pre- and post-consensus state.
        // The all-rejected case still produces a committed block (confirmed:
        // simulator.cpp:processVerifiedProposal has no empty-proposal guard).
        id: 'step-11-commit',
        componentId: 'commit',
        narration:
          `Block committed. ${validCount} ${plural(validCount, 'transaction')} applied to the World State View.` +
          (rejectedCount > 0
            ? ` ${rejectedCount} transaction ${plural(rejectedCount, 'hash', 'hashes')} recorded as rejected.`
            : ''),
        txStateChanges: {
          committedBlock,
        },
      },
    ],
  }
}
