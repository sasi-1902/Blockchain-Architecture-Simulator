/**
 * UC-01: Multiple Transactions and Block Formation — Static Placeholder Scenario
 *
 * Placeholder data for the visual prototype. Data is manually authored to match
 * the schema produced by generateBlockFormationScenario / serializeValidationOutcome
 * so it can be replaced with a live engine call in a later integration step.
 *
 * Scenario: "Three-Transaction Proposal — Partial Rejection"
 *   alice (100 USD), bob (20 USD), carol (30 USD)
 *   tx1: alice → bob   30 USD  → VALID   (alice: 100 → 70, bob: 20 → 50)
 *   tx2: alice → carol 90 USD  → REJECTED INSUFFICIENT_BALANCE (alice provisional 70 < 90)
 *   tx3: bob → alice   10 USD  → VALID   (bob: 50 → 40, alice: 70 → 80)
 *   Committed: tx1, tx3  |  Rejected: tx2
 *   Final balances: alice=80, bob=40, carol=30
 *
 * [PLACEHOLDER] All txStateChanges values are hand-authored, not engine-computed.
 */

import type { Scenario } from '../../../engine/types'

export const uc01BlockFormationPlaceholderScenario: Scenario = {
  id: 'uc01-block-formation-placeholder',
  name: 'Three-Transaction Proposal — Partial Rejection',
  description:
    '3 transactions submitted; 2 committed (tx1, tx3), 1 rejected for insufficient balance (tx2). ' +
    '[PLACEHOLDER — not yet connected to execution engine]',
  category: 'other',
  initialTx: {
    from: 'alice',
    to: 'bob',
    asset: 'USD',
    amount: 0,
    // Starting World State View balances for this demonstration.
    balances: { alice: 100, bob: 20, carol: 30 },
  },
  transactions: [
    { id: 'tx1', from: 'alice', to: 'bob', asset: 'USD', amount: '30' },
    { id: 'tx2', from: 'alice', to: 'carol', asset: 'USD', amount: '90' },
    { id: 'tx3', from: 'bob', to: 'alice', asset: 'USD', amount: '10' },
  ],
  steps: [
    {
      id: 'step-1-torii',
      componentId: 'torii',
      narration: '3 transactions submitted to Torii.',
    },
    {
      id: 'step-2-stateless-validation',
      componentId: 'stateless-validation',
      narration:
        'Transaction structure and signatures verified. All 3 transactions pass stateless validation.',
    },
    {
      id: 'step-3-mst-processor',
      componentId: 'mst-processor',
      narration:
        'All 3 transactions satisfy the required signature quorum and pass through the MST Processor.',
    },
    {
      id: 'step-4-peer-communication-service',
      componentId: 'peer-communication-service',
      narration: 'The fully signed transactions routed toward the ordering pipeline.',
    },
    {
      id: 'step-5-ordering-service',
      componentId: 'ordering-service',
      narration: '3 transactions accepted for batching into a proposal.',
    },
    {
      id: 'step-6-proposal',
      componentId: 'proposal',
      narration: 'Proposal formed containing all 3 submitted transactions.',
      txStateChanges: {
        proposal: {
          transactions: [
            { id: 'tx1', from: 'alice', to: 'bob', asset: 'USD', amount: '30' },
            { id: 'tx2', from: 'alice', to: 'carol', asset: 'USD', amount: '90' },
            { id: 'tx3', from: 'bob', to: 'alice', asset: 'USD', amount: '10' },
          ],
        },
      },
    },
    {
      id: 'step-7-stateful-validation',
      componentId: 'stateful-validation',
      narration:
        '2 of 3 transactions pass stateful validation against the World State View. 1 transaction is rejected.',
      txStateChanges: {
        validationOutcome: {
          results: [
            { txId: 'tx1', status: 'VALID', senderProvisionalBalance: '70' },
            {
              txId: 'tx2',
              status: 'REJECTED',
              reason: 'INSUFFICIENT_BALANCE',
              senderProvisionalBalance: '70',
            },
            { txId: 'tx3', status: 'VALID', senderProvisionalBalance: '40' },
          ],
          validTxIds: ['tx1', 'tx3'],
          rejectedTxIds: ['tx2'],
          finalWorldState: {
            balances: { alice: '80', bob: '40', carol: '30' },
            accounts: ['alice', 'bob', 'carol'],
            assets: { USD: 0 },
          },
        },
      },
    },
    {
      id: 'step-8-verified-proposal',
      componentId: 'verified-proposal',
      narration: 'Verified Proposal contains 2 transactions.',
      txStateChanges: {
        verifiedProposal: {
          validTxIds: ['tx1', 'tx3'],
          rejectedTxIds: ['tx2'],
        },
      },
    },
    {
      id: 'step-9-block-creator',
      componentId: 'block-creator',
      narration: 'Candidate block created with 2 committed transactions and 1 rejected hash.',
      txStateChanges: {
        candidateBlock: {
          height: 1,
          prevBlockHash: 'genesis',
          createdTime: 0,
          transactions: [
            { id: 'tx1', from: 'alice', to: 'bob', asset: 'USD', amount: '30' },
            { id: 'tx3', from: 'bob', to: 'alice', asset: 'USD', amount: '10' },
          ],
          rejectedTransactionIds: ['tx2'],
        },
      },
    },
    {
      id: 'step-10-yac-consensus',
      componentId: 'yac-consensus',
      narration:
        'Peers vote on the candidate block. Consensus is assumed to succeed — the YAC algorithm is not simulated.',
      txStateChanges: {
        consensusOutcome: {
          result: 'agreed',
          blockHeight: 1,
          assumed: true,
        },
      },
    },
    {
      id: 'step-11-commit',
      componentId: 'commit',
      narration:
        'Block committed. 2 transactions applied to the World State View. 1 transaction hash recorded as rejected.',
      txStateChanges: {
        committedBlock: {
          height: 1,
          prevBlockHash: 'genesis',
          createdTime: 0,
          transactions: [
            { id: 'tx1', from: 'alice', to: 'bob', asset: 'USD', amount: '30' },
            { id: 'tx3', from: 'bob', to: 'alice', asset: 'USD', amount: '10' },
          ],
          rejectedTransactionIds: ['tx2'],
        },
      },
    },
  ],
}
