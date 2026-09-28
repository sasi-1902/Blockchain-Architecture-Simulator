import type { BlockchainArchitecture } from './types'

export interface ArchitectureRegistry {
  register(architecture: BlockchainArchitecture): void
  get(id: string): BlockchainArchitecture | undefined
  has(id: string): boolean
  list(): BlockchainArchitecture[]
}

export function createArchitectureRegistry(
  initialArchitectures: BlockchainArchitecture[] = [],
): ArchitectureRegistry {
  const architectures = new Map<string, BlockchainArchitecture>()

  const registry: ArchitectureRegistry = {
    register(architecture) {
      architectures.set(architecture.id, architecture)
    },
    get(id) {
      return architectures.get(id)
    },
    has(id) {
      return architectures.has(id)
    },
    list() {
      return Array.from(architectures.values())
    },
  }

  for (const architecture of initialArchitectures) {
    registry.register(architecture)
  }

  return registry
}
