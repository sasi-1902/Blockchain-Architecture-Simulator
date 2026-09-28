import { describe, expect, it } from 'vitest'
import { architectureRegistry } from '../../src/state/registry'
import { validateArchitecture } from '../../src/engine/validateArchitecture'

describe('application architecture registry composition', () => {
  it('includes Iroha v1', () => {
    expect(architectureRegistry.has('iroha1')).toBe(true)
  })

  it('resolves the registered Iroha v1 architecture and it remains schema-valid', () => {
    const architecture = architectureRegistry.get('iroha1')

    expect(architecture).toBeDefined()
    expect(() => validateArchitecture(architecture)).not.toThrow()
  })
})
