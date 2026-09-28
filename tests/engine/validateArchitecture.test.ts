import { describe, expect, it } from 'vitest'
import { validateArchitecture } from '../../src/engine/validateArchitecture'
import type { BlockchainArchitecture } from '../../src/engine/types'

function buildValidArchitecture(): BlockchainArchitecture {
  return {
    id: 'iroha1',
    displayName: 'Hyperledger Iroha v1',
    vendor: 'Hyperledger',
    shortDescription: 'Classic Iroha v1 architecture.',
    sourceLinks: [{ label: 'Iroha docs', url: 'https://iroha.readthedocs.io' }],
    components: [
      {
        id: 'torii',
        name: 'Torii',
        category: 'gateway',
        summary: 'Client-facing gateway.',
        whatItDoes: 'Accepts client transactions and queries.',
        whyItExists: 'Provides a single entry point into the peer.',
        inputs: ['signed transaction'],
        outputs: ['stateless validation request'],
        communicatesWith: ['stateless-validation'],
        relatedConcepts: ['torii-concept'],
      },
      {
        id: 'stateless-validation',
        name: 'Stateless Validation',
        category: 'validation',
        summary: 'Validates transaction structure and signature format.',
        whatItDoes: 'Checks structure and signature format.',
        whyItExists: 'Rejects malformed transactions early.',
        inputs: ['signed transaction'],
        outputs: ['validated transaction'],
        communicatesWith: ['torii'],
        relatedConcepts: ['stateless-validation-concept'],
      },
    ],
    connections: [
      {
        id: 'torii-to-stateless-validation',
        from: 'torii',
        to: 'stateless-validation',
        kind: 'sync-call',
      },
    ],
    concepts: [
      {
        id: 'torii-concept',
        name: 'Torii',
        summary: 'The primary gateway through which clients submit transactions.',
      },
      {
        id: 'stateless-validation-concept',
        name: 'Stateless Validation',
        summary: 'Checks transaction structure and signature format without consulting state.',
      },
    ],
    scenarios: [
      {
        id: 'alice-sends-10-usd-to-bob',
        name: 'Alice sends 10 USD to Bob',
        description: 'A successful single-signature transfer.',
        category: 'success',
        initialTx: { from: 'alice', to: 'bob', asset: 'USD', amount: 10 },
        steps: [
          {
            id: 'step-1',
            componentId: 'torii',
            narration: "Alice's client submits the signed transfer to Torii.",
          },
        ],
      },
    ],
  }
}

describe('validateArchitecture', () => {
  it('accepts a valid minimal BlockchainArchitecture', () => {
    const architecture = buildValidArchitecture()

    const result = validateArchitecture(architecture)

    expect(result).toEqual(architecture)
  })

  it('rejects duplicate component ids', () => {
    const architecture = buildValidArchitecture()
    architecture.components.push({ ...architecture.components[0] })

    expect(() => validateArchitecture(architecture)).toThrow(/duplicate component id/i)
  })

  it('rejects connections referencing missing components', () => {
    const architecture = buildValidArchitecture()
    architecture.connections.push({
      id: 'dangling-connection',
      from: 'torii',
      to: 'does-not-exist',
    })

    expect(() => validateArchitecture(architecture)).toThrow(/missing component "does-not-exist"/i)
  })

  it('rejects communicatesWith references to missing components', () => {
    const architecture = buildValidArchitecture()
    architecture.components[0].communicatesWith.push('does-not-exist')

    expect(() => validateArchitecture(architecture)).toThrow(
      /communicatesWith reference to missing component "does-not-exist"/i,
    )
  })

  it('rejects scenario steps referencing missing components', () => {
    const architecture = buildValidArchitecture()
    architecture.scenarios[0].steps.push({
      id: 'step-dangling',
      componentId: 'does-not-exist',
      narration: 'This step references a component that does not exist.',
    })

    expect(() => validateArchitecture(architecture)).toThrow(
      /references missing component "does-not-exist"/i,
    )
  })

  it('rejects relatedConcepts references to missing concepts', () => {
    const architecture = buildValidArchitecture()
    architecture.components[0].relatedConcepts.push('does-not-exist')

    expect(() => validateArchitecture(architecture)).toThrow(
      /relatedConcepts reference to missing concept "does-not-exist"/i,
    )
  })

  it('rejects required component fields that are empty', () => {
    const architecture = buildValidArchitecture()
    architecture.components[0].name = ''

    expect(() => validateArchitecture(architecture)).toThrow()
  })

  describe('required component detail fields', () => {
    it('rejects an empty whatItDoes', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].whatItDoes = ''

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects a whitespace-only whatItDoes', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].whatItDoes = '   '

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects an empty whyItExists', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].whyItExists = ''

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects a whitespace-only whyItExists', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].whyItExists = '   '

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects an empty inputs array', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].inputs = []

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects an empty outputs array', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].outputs = []

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects an empty communicatesWith array', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].communicatesWith = []

      expect(() => validateArchitecture(architecture)).toThrow()
    })

    it('rejects an empty relatedConcepts array', () => {
      const architecture = buildValidArchitecture()
      architecture.components[0].relatedConcepts = []

      expect(() => validateArchitecture(architecture)).toThrow()
    })
  })
})
