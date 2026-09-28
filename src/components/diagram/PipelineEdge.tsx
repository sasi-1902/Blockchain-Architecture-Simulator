import { SmoothStepEdge, type EdgeProps } from '@xyflow/react'
import { useHoverHighlight } from './HoverHighlightContext'

export function PipelineEdge(props: EdgeProps) {
  const { hoveredComponentId, highlight } = useHoverHighlight()
  const isDimmed = hoveredComponentId !== null && !highlight.highlightedConnectionIds.has(props.id)

  return (
    <SmoothStepEdge
      {...props}
      pathOptions={{ borderRadius: 8 }}
      style={{ ...props.style, stroke: 'var(--color-canvas-ink)', strokeWidth: 1.5, opacity: isDimmed ? 0.2 : 1 }}
    />
  )
}
