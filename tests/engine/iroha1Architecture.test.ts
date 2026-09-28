import { describe, expect, it } from 'vitest'
import { validateArchitecture } from '../../src/engine/validateArchitecture'
import { iroha1Architecture } from '../../src/architectures/iroha1'

const EXPECTED_PIPELINE_ORDER = [
  'client',
  'torii',
  'stateless-validation',
  'mst-processor',
  'peer-communication-service',
  'ordering-service',
  'proposal',
  'stateful-validation',
  'verified-proposal',
  'block-creator',
  'yac-consensus',
  'commit',
  'blockstore-wsv',
]

const EXPECTED_HAPPY_PATH_STEP_ORDER = [
  'torii',
  'stateless-validation',
  'mst-processor',
  'peer-communication-service',
  'ordering-service',
  'proposal',
  'stateful-validation',
  'verified-proposal',
  'block-creator',
  'yac-consensus',
  'commit',
]

describe('iroha1Architecture', () => {
  it('passes validateArchitecture()', () => {
    expect(() => validateArchitecture(iroha1Architecture)).not.toThrow()
  })

  it('preserves the authored pipeline order from DESIGN.md §8', () => {
    expect(iroha1Architecture.components.map((component) => component.id)).toEqual(
      EXPECTED_PIPELINE_ORDER,
    )
  })

  it('gives every component meaningful required detail fields', () => {
    for (const component of iroha1Architecture.components) {
      expect(component.whatItDoes.trim().length).toBeGreaterThan(0)
      expect(component.whyItExists.trim().length).toBeGreaterThan(0)
      expect(component.inputs.length).toBeGreaterThan(0)
      expect(component.outputs.length).toBeGreaterThan(0)
      expect(component.communicatesWith.length).toBeGreaterThan(0)
      expect(component.relatedConcepts.length).toBeGreaterThan(0)
    }
  })

  it('resolves every connection endpoint to a known component', () => {
    const componentIds = new Set(iroha1Architecture.components.map((component) => component.id))

    for (const connection of iroha1Architecture.connections) {
      expect(componentIds.has(connection.from)).toBe(true)
      expect(componentIds.has(connection.to)).toBe(true)
    }
  })

  it('resolves every communicatesWith reference to a known component', () => {
    const componentIds = new Set(iroha1Architecture.components.map((component) => component.id))

    for (const component of iroha1Architecture.components) {
      for (const targetId of component.communicatesWith) {
        expect(componentIds.has(targetId)).toBe(true)
      }
    }
  })

  it('resolves every relatedConcepts reference to a known concept', () => {
    const conceptIds = new Set(iroha1Architecture.concepts.map((concept) => concept.id))

    for (const component of iroha1Architecture.components) {
      for (const conceptId of component.relatedConcepts) {
        expect(conceptIds.has(conceptId)).toBe(true)
      }
    }
  })

  it('references only valid components in every scenario step', () => {
    const componentIds = new Set(iroha1Architecture.components.map((component) => component.id))

    for (const scenario of iroha1Architecture.scenarios) {
      for (const step of scenario.steps) {
        expect(componentIds.has(step.componentId)).toBe(true)
      }
    }
  })

  it('implements only the "Alice sends 10 USD to Bob" happy-path scenario', () => {
    expect(iroha1Architecture.scenarios).toHaveLength(1)
    expect(iroha1Architecture.scenarios[0].id).toBe('alice-sends-10-usd-to-bob')
    expect(iroha1Architecture.scenarios[0].category).toBe('success')
  })

  it('orders the happy-path scenario steps per DESIGN.md §10, including Proposal and Verified Proposal waypoints', () => {
    const [scenario] = iroha1Architecture.scenarios

    expect(scenario.steps.map((step) => step.componentId)).toEqual(EXPECTED_HAPPY_PATH_STEP_ORDER)
  })

  it('captures the final Alice/Bob balance change on the Commit step', () => {
    const [scenario] = iroha1Architecture.scenarios
    const commitStep = scenario.steps.find((step) => step.componentId === 'commit')

    expect(commitStep?.txStateChanges).toBeDefined()
  })
})
