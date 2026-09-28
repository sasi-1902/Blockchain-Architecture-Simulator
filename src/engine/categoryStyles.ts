import type { ArchitectureComponent } from './types'

export type ComponentCategory = ArchitectureComponent['category']

/** Fixed presentation order for categories, independent of any one architecture's data. */
export const CATEGORY_ORDER: ComponentCategory[] = [
  'client',
  'gateway',
  'validation',
  'networking',
  'ordering',
  'consensus',
  'storage',
  'other',
]

export const CATEGORY_LABELS: Record<ComponentCategory, string> = {
  client: 'Client',
  gateway: 'Gateway',
  validation: 'Validation',
  networking: 'Networking',
  ordering: 'Ordering',
  consensus: 'Consensus',
  storage: 'Storage',
  other: 'Other',
}

/** Returns the distinct categories present among the given components, in CATEGORY_ORDER. */
export function getUsedCategories(components: ArchitectureComponent[]): ComponentCategory[] {
  const present = new Set(components.map((component) => component.category))
  return CATEGORY_ORDER.filter((category) => present.has(category))
}
