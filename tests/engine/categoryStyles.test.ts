import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS, CATEGORY_ORDER, getUsedCategories } from '../../src/engine/categoryStyles'
import type { ArchitectureComponent, ArchitectureComponent as Component } from '../../src/engine/types'

function buildComponent(overrides: Partial<Component> & { id: string; category: Component['category'] }): Component {
  return {
    name: overrides.id,
    summary: 'summary',
    whatItDoes: 'does things',
    whyItExists: 'exists',
    inputs: [],
    outputs: [],
    communicatesWith: [],
    relatedConcepts: [],
    ...overrides,
  }
}

describe('CATEGORY_ORDER and CATEGORY_LABELS', () => {
  it('defines a label for every category, in a fixed order with no duplicates', () => {
    expect(new Set(CATEGORY_ORDER).size).toBe(CATEGORY_ORDER.length)

    for (const category of CATEGORY_ORDER) {
      expect(CATEGORY_LABELS[category]).toEqual(expect.any(String))
      expect(CATEGORY_LABELS[category].length).toBeGreaterThan(0)
    }
  })

  it('includes every category referenced by the architecture data model', () => {
    const allCategories: ArchitectureComponent['category'][] = [
      'client',
      'gateway',
      'validation',
      'networking',
      'ordering',
      'consensus',
      'storage',
      'other',
    ]

    expect(new Set(CATEGORY_ORDER)).toEqual(new Set(allCategories))
  })
})

describe('getUsedCategories', () => {
  it('returns an empty array when there are no components', () => {
    expect(getUsedCategories([])).toEqual([])
  })

  it('returns distinct categories present among the given components', () => {
    const components = [
      buildComponent({ id: 'a', category: 'gateway' }),
      buildComponent({ id: 'b', category: 'validation' }),
      buildComponent({ id: 'c', category: 'validation' }),
    ]

    expect(getUsedCategories(components)).toEqual(['gateway', 'validation'])
  })

  it('orders the result by CATEGORY_ORDER rather than first-seen order', () => {
    const components = [
      buildComponent({ id: 'a', category: 'storage' }),
      buildComponent({ id: 'b', category: 'client' }),
    ]

    expect(getUsedCategories(components)).toEqual(['client', 'storage'])
  })
})
