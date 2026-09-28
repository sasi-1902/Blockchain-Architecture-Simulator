import { CATEGORY_LABELS, getUsedCategories } from '../../engine/categoryStyles'
import type { ArchitectureComponent } from '../../engine/types'
import { CATEGORY_VISUALS } from './categoryVisuals'

interface CategoryLegendProps {
  components: ArchitectureComponent[]
}

export function CategoryLegend({ components }: CategoryLegendProps) {
  const categories = getUsedCategories(components)

  return (
    <ul
      aria-label="Category legend"
      className="panel-flat flex flex-wrap gap-x-4 gap-y-2 px-3 py-2 text-xs text-ink"
    >
      {categories.map((category) => (
        <li key={category} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full border border-ink ${CATEGORY_VISUALS[category].swatchClassName}`}
          />
          <span className="label-mono">{CATEGORY_LABELS[category]}</span>
        </li>
      ))}
    </ul>
  )
}
