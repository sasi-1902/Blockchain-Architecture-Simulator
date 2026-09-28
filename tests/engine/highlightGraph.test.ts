import { describe, expect, it } from 'vitest'
import { computeHoverHighlight } from '../../src/engine/highlightGraph'
import type { ArchitectureComponent, ArchitectureConnection } from '../../src/engine/types'

function buildComponent(overrides: Partial<ArchitectureComponent> & { id: string }): ArchitectureComponent {
  return {
    name: overrides.id,
    category: 'other',
    summary: 'summary',
    whatItDoes: 'does things',
    whyItExists: 'exists',
    inputs: ['in'],
    outputs: ['out'],
    communicatesWith: [],
    relatedConcepts: [],
    ...overrides,
  }
}

const components: ArchitectureComponent[] = [
  buildComponent({ id: 'torii', communicatesWith: ['client', 'stateless-validation'] }),
  buildComponent({ id: 'client', communicatesWith: ['torii'] }),
  buildComponent({ id: 'stateless-validation', communicatesWith: ['torii', 'mst-processor'] }),
  buildComponent({ id: 'mst-processor', communicatesWith: ['stateless-validation'] }),
  buildComponent({ id: 'unrelated', communicatesWith: [] }),
]

const connections: ArchitectureConnection[] = [
  { id: 'client-to-torii', from: 'client', to: 'torii' },
  { id: 'torii-to-stateless-validation', from: 'torii', to: 'stateless-validation' },
  { id: 'stateless-validation-to-mst-processor', from: 'stateless-validation', to: 'mst-processor' },
]

describe('computeHoverHighlight', () => {
  it('returns empty highlight sets when nothing is hovered', () => {
    const result = computeHoverHighlight(null, components, connections)

    expect(result.highlightedComponentIds.size).toBe(0)
    expect(result.highlightedConnectionIds.size).toBe(0)
  })

  it('returns empty highlight sets when the hovered id is unknown', () => {
    const result = computeHoverHighlight('does-not-exist', components, connections)

    expect(result.highlightedComponentIds.size).toBe(0)
    expect(result.highlightedConnectionIds.size).toBe(0)
  })

  it('highlights the hovered component and its communicatesWith components', () => {
    const result = computeHoverHighlight('torii', components, connections)

    expect(result.highlightedComponentIds).toEqual(new Set(['torii', 'client', 'stateless-validation']))
  })

  it('does not highlight components that are not in communicatesWith', () => {
    const result = computeHoverHighlight('torii', components, connections)

    expect(result.highlightedComponentIds.has('mst-processor')).toBe(false)
    expect(result.highlightedComponentIds.has('unrelated')).toBe(false)
  })

  it('highlights only connections between the hovered component and its communicatesWith components', () => {
    const result = computeHoverHighlight('torii', components, connections)

    expect(result.highlightedConnectionIds).toEqual(new Set(['client-to-torii', 'torii-to-stateless-validation']))
    expect(result.highlightedConnectionIds.has('stateless-validation-to-mst-processor')).toBe(false)
  })

  it('only highlights a connection when the neighbor is reciprocally listed', () => {
    const asymmetricComponents: ArchitectureComponent[] = [
      buildComponent({ id: 'a', communicatesWith: [] }),
      buildComponent({ id: 'b', communicatesWith: ['a'] }),
    ]
    const asymmetricConnections: ArchitectureConnection[] = [{ id: 'a-to-b', from: 'a', to: 'b' }]

    const result = computeHoverHighlight('a', asymmetricComponents, asymmetricConnections)

    expect(result.highlightedComponentIds).toEqual(new Set(['a']))
    expect(result.highlightedConnectionIds.size).toBe(0)
  })
})
