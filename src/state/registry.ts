import { createArchitectureRegistry } from '../engine/registry'
import { iroha1Architecture } from '../architectures/iroha1'

/**
 * Composition root: the only place allowed to know about both the generic
 * engine registry and concrete architecture modules. `src/engine/` stays
 * blockchain-independent by construction.
 */
export const architectureRegistry = createArchitectureRegistry([iroha1Architecture])
