import type { Node, NodeProps } from '@xyflow/react'

export type PhaseLabelNodeData = { label: string }
export type PhaseLabelFlowNode = Node<PhaseLabelNodeData, 'phaseLabel'>

/**
 * A non-interactive row heading (e.g. "ORDER + VERIFY"). Rendered as a plain
 * React Flow node (rather than an HTML overlay) so it participates in
 * `fitView` and pans/zooms with the rest of the diagram. Color is overridden
 * inline because the canvas is dark while `.label-mono` is tuned for the
 * off-white app background.
 */
export function PhaseLabelNode({ data }: NodeProps<PhaseLabelFlowNode>) {
  return (
    <div
      className="label-mono whitespace-nowrap pb-1 select-none"
      style={{ color: 'var(--color-canvas-ink)' }}
    >
      {data.label}
    </div>
  )
}
