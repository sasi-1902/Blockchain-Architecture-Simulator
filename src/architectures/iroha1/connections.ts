import type { ArchitectureConnection } from '../../engine/types'

export const iroha1Connections: ArchitectureConnection[] = [
  { id: 'client-to-torii', from: 'client', to: 'torii', kind: 'sync-call' },
  { id: 'torii-to-stateless-validation', from: 'torii', to: 'stateless-validation', kind: 'internal' },
  {
    id: 'stateless-validation-to-mst-processor',
    from: 'stateless-validation',
    to: 'mst-processor',
    kind: 'internal',
  },
  {
    id: 'mst-processor-to-peer-communication-service',
    from: 'mst-processor',
    to: 'peer-communication-service',
    kind: 'internal',
  },
  {
    id: 'peer-communication-service-to-ordering-service',
    from: 'peer-communication-service',
    to: 'ordering-service',
    kind: 'async-message',
  },
  { id: 'ordering-service-to-proposal', from: 'ordering-service', to: 'proposal', kind: 'internal' },
  { id: 'proposal-to-stateful-validation', from: 'proposal', to: 'stateful-validation', kind: 'internal' },
  {
    id: 'stateful-validation-to-verified-proposal',
    from: 'stateful-validation',
    to: 'verified-proposal',
    kind: 'internal',
  },
  { id: 'verified-proposal-to-block-creator', from: 'verified-proposal', to: 'block-creator', kind: 'internal' },
  { id: 'block-creator-to-yac-consensus', from: 'block-creator', to: 'yac-consensus', kind: 'internal' },
  { id: 'yac-consensus-to-commit', from: 'yac-consensus', to: 'commit', kind: 'internal' },
  { id: 'commit-to-blockstore-wsv', from: 'commit', to: 'blockstore-wsv', kind: 'storage-write' },
]
