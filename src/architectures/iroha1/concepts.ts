import type { ArchitectureConcept } from '../../engine/types'

export const iroha1Concepts: ArchitectureConcept[] = [
  {
    id: 'torii-concept',
    name: 'Torii',
    summary: 'The primary gateway through which clients submit transactions and queries.',
  },
  {
    id: 'stateless-validation-concept',
    name: 'Stateless Validation',
    summary: 'Checks transaction structure and signature format without consulting blockchain state.',
  },
  {
    id: 'mst-processor-concept',
    name: 'MST Processor',
    summary:
      'The Multisignature Transaction Processor. It handles partially signed transactions and allows signatures to be collected until the required account quorum is reached.',
    details:
      'For the MVP transaction, the required signature quorum is already satisfied, so the transaction passes through this stage.',
  },
  {
    id: 'peer-communication-service-concept',
    name: 'Peer Communication Service',
    summary: 'Handles peer-level transaction routing and communication.',
  },
  {
    id: 'ordering-service-concept',
    name: 'Ordering Service',
    summary: 'Collects transactions and groups them into proposals.',
  },
  {
    id: 'proposal-concept',
    name: 'Proposal',
    summary: 'A batch of transactions waiting to undergo state-dependent validation.',
  },
  {
    id: 'stateful-validation-concept',
    name: 'Stateful Validation',
    summary: 'Checks transaction validity against the current blockchain state.',
    details:
      'Examples include account existence, account balances, permissions, and other state-dependent business rules.',
  },
  {
    id: 'verified-proposal-concept',
    name: 'Verified Proposal',
    summary: 'The subset of a proposal containing transactions that successfully passed stateful validation.',
  },
  {
    id: 'block-creator-concept',
    name: 'Block Creator',
    summary: 'Creates a candidate block from the verified proposal.',
  },
  {
    id: 'yac-consensus-concept',
    name: 'YAC Consensus',
    summary: 'Yet Another Consensus. Peers use YAC to agree on the candidate block.',
  },
  {
    id: 'blockstore-concept',
    name: 'Blockstore',
    summary: 'Persistent storage for committed blockchain blocks.',
  },
  {
    id: 'world-state-view-concept',
    name: 'World State View',
    summary: 'The current blockchain state used by queries and transaction validation.',
    details: 'It includes information such as account balances, accounts, assets, and permissions.',
  },
]
