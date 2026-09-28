import { describe, expect, it } from 'vitest'
import { createArchitectureRegistry } from '../../src/engine/registry'
import { validateArchitecture } from '../../src/engine/validateArchitecture'
import { iroha1Architecture } from '../../src/architectures/iroha1'

describe('architecture registry', () => {
  it('defaults to an empty registry when constructed without arguments, keeping the engine blockchain-independent', () => {
    const registry = createArchitectureRegistry()

    expect(registry.list()).toEqual([])
  })

  it('accepts an optional initial array of architectures', () => {
    const registry = createArchitectureRegistry([iroha1Architecture])

    expect(registry.has('iroha1')).toBe(true)
    expect(registry.get('iroha1')).toBe(iroha1Architecture)
  })

  it('contains Iroha v1 once registered', () => {
    const registry = createArchitectureRegistry()
    registry.register(iroha1Architecture)

    expect(registry.has('iroha1')).toBe(true)
    expect(registry.list().map((architecture) => architecture.id)).toContain('iroha1')
  })

  it('looks up the expected architecture by id', () => {
    const registry = createArchitectureRegistry()
    registry.register(iroha1Architecture)

    expect(registry.get('iroha1')).toBe(iroha1Architecture)
  })

  it('handles unknown architecture ids safely', () => {
    const registry = createArchitectureRegistry()
    registry.register(iroha1Architecture)

    expect(registry.get('does-not-exist')).toBeUndefined()
    expect(registry.has('does-not-exist')).toBe(false)
  })

  it('only ever holds architectures that pass validateArchitecture()', () => {
    const registry = createArchitectureRegistry()
    registry.register(iroha1Architecture)

    const registered = registry.get('iroha1')
    expect(registered).toBeDefined()
    expect(() => validateArchitecture(registered)).not.toThrow()
  })

  it('keeps separate registry instances independent', () => {
    const registryA = createArchitectureRegistry()
    const registryB = createArchitectureRegistry()

    registryA.register(iroha1Architecture)

    expect(registryA.has('iroha1')).toBe(true)
    expect(registryB.has('iroha1')).toBe(false)
  })
})
