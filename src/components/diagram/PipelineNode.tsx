import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { CATEGORY_LABELS } from '../../engine/categoryStyles'
import type { ArchitectureComponent, ComponentId } from '../../engine/types'
import { CATEGORY_VISUALS } from './categoryVisuals'
import { useHoverHighlight } from './HoverHighlightContext'
import { CategoryIcon } from './icons'
import type { NodeHandleLayout } from './handlePositions'

export type PipelineNodeData = {
  component: ArchitectureComponent
  onSelect: (componentId: ComponentId) => void
  handleLayout: NodeHandleLayout
}

export type PipelineFlowNode = Node<PipelineNodeData, 'pipeline'>

export const NODE_WIDTH_PX = 220

export function PipelineNode({ data }: NodeProps<PipelineFlowNode>) {
  const { component, onSelect, handleLayout } = data
  const { hoveredComponentId, highlight, activeComponentId } = useHoverHighlight()
  const isActive = activeComponentId === component.id
  const isDimmed = hoveredComponentId !== null && !highlight.highlightedComponentIds.has(component.id) && !isActive
  const visual = CATEGORY_VISUALS[component.category]

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${component.name}: ${component.summary}`}
      data-emphasis={isDimmed ? 'dimmed' : 'normal'}
      data-active={isActive}
      onClick={() => onSelect(component.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          onSelect(component.id)
        }
      }}
      style={{
        width: NODE_WIDTH_PX,
        boxShadow: isActive
          ? '0 0 0 3px var(--color-canvas-dark), 0 0 0 6px var(--color-transaction-red)'
          : '2px 2px 0 0 var(--color-ink)',
      }}
      className={`flex flex-col items-start gap-2 rounded-xl border-2 border-ink px-4 py-3.5 text-left transition-opacity duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-green-accent)] ${visual.fillClassName} ${
        isDimmed ? 'opacity-35' : 'opacity-100'
      }`}
    >
      <Handle type="target" position={handleLayout.target ?? Position.Top} style={{ opacity: 0 }} />
      <CategoryIcon category={component.category} className="h-5 w-5 text-ink" />
      <span className="font-mono text-sm leading-tight font-semibold text-ink">{component.name}</span>
      <span className="label-mono text-[0.75rem]">{CATEGORY_LABELS[component.category]}</span>
      <Handle type="source" position={handleLayout.source ?? Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}
