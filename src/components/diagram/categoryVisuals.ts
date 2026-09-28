import type { ComponentCategory } from '../../engine/categoryStyles'

interface CategoryVisual {
  /** Tailwind classes for the small swatch shown in the legend. */
  swatchClassName: string
  /** Tailwind classes applied to a pipeline node's fill/border of this category. */
  fillClassName: string
}

export const CATEGORY_VISUALS: Record<ComponentCategory, CategoryVisual> = {
  client: { swatchClassName: 'bg-purple-soft', fillClassName: 'bg-purple-soft' },
  gateway: { swatchClassName: 'bg-green-accent', fillClassName: 'bg-green-soft' },
  validation: { swatchClassName: 'bg-yellow-soft', fillClassName: 'bg-yellow-soft' },
  networking: { swatchClassName: 'bg-purple-accent', fillClassName: 'bg-purple-soft' },
  ordering: { swatchClassName: 'bg-green-soft', fillClassName: 'bg-green-soft' },
  consensus: { swatchClassName: 'bg-purple-accent', fillClassName: 'bg-purple-soft' },
  storage: { swatchClassName: 'bg-green-accent', fillClassName: 'bg-green-soft' },
  other: { swatchClassName: 'bg-background', fillClassName: 'bg-surface' },
}
