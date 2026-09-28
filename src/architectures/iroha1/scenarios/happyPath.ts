import type { Scenario } from '../../../engine/types'

export const aliceSendsTenUsdToBobScenario: Scenario = {
  id: 'alice-sends-10-usd-to-bob',
  name: 'Alice sends 10 USD to Bob',
  description:
    'A successful, single-signature transfer of 10 USD from Alice to Bob through the complete Iroha v1 transaction pipeline.',
  category: 'success',
  initialTx: {
    from: 'alice',
    to: 'bob',
    asset: 'USD',
    amount: 10,
    // Starting World State View balances for this demonstration. `initialTx`
    // is intentionally an architecture-agnostic catch-all record (see
    // DESIGN.md §7), so this stays scenario data rather than a generic
    // engine concept.
    balances: { alice: 100, bob: 20 },
  },
  steps: [
    {
      id: 'step-1-torii',
      componentId: 'torii',
      narration: "Alice's client submits the signed transfer to Torii.",
    },
    {
      id: 'step-2-stateless-validation',
      componentId: 'stateless-validation',
      narration:
        'The transaction structure and signature format are checked. No account-state information is required at this stage.',
    },
    {
      id: 'step-3-mst-processor',
      componentId: 'mst-processor',
      narration:
        'The transaction already satisfies the required signature quorum. It therefore passes through the MST Processor without waiting for additional signatures.',
    },
    {
      id: 'step-4-peer-communication-service',
      componentId: 'peer-communication-service',
      narration: 'The fully signed transaction is routed toward the ordering pipeline.',
    },
    {
      id: 'step-5-ordering-service',
      componentId: 'ordering-service',
      narration: 'The transaction is accepted for batching into a proposal.',
    },
    {
      id: 'step-6-proposal',
      componentId: 'proposal',
      narration:
        'The transaction is represented as part of the current proposal. For this MVP it is treated as the only transaction in that proposal.',
    },
    {
      id: 'step-7-stateful-validation',
      componentId: 'stateful-validation',
      narration:
        'The transaction is validated against the World State View: Alice exists, Bob exists, Alice has sufficient funds, and the transfer is permitted.',
    },
    {
      id: 'step-8-verified-proposal',
      componentId: 'verified-proposal',
      narration: 'The successfully validated transaction is represented in the Verified Proposal.',
    },
    {
      id: 'step-9-block-creator',
      componentId: 'block-creator',
      narration: 'The Verified Proposal is converted into a candidate block.',
    },
    {
      id: 'step-10-yac-consensus',
      componentId: 'yac-consensus',
      narration:
        'Peers conceptually agree on the candidate block. This MVP does not visualize the full peer network.',
    },
    {
      id: 'step-11-commit',
      componentId: 'commit',
      narration: 'The block is committed and persisted. The World State View changes.',
      txStateChanges: {
        worldStateView: {
          alice: { asset: 'USD', balanceChange: -10 },
          bob: { asset: 'USD', balanceChange: 10 },
        },
      },
    },
  ],
}
