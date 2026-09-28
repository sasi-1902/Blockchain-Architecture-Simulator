import { useCallback, useMemo, useState } from 'react'
import { Background, MarkerType, ReactFlow, type Edge, type NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ArchitectureComponent, ArchitectureConnection, ComponentId } from '../../engine/types'
import { computeHoverHighlight } from '../../engine/highlightGraph'
import { CategoryLegend } from './CategoryLegend'
import { computeNodeHandleLayouts } from './handlePositions'
import { HoverHighlightContext, type HoverHighlightContextValue } from './HoverHighlightContext'
import { PhaseLabelNode, type PhaseLabelFlowNode } from './PhaseLabelNode'
import { PipelineEdge } from './PipelineEdge'
import { PipelineNode, type PipelineFlowNode } from './PipelineNode'
import { TransactionMarker } from './TransactionMarker'

const nodeTypes = { pipeline: PipelineNode, phaseLabel: PhaseLabelNode }
const edgeTypes = { pipeline: PipelineEdge }

const FALLBACK_ROW_HEIGHT = 80
const PHASE_LABEL_OFFSET_Y = 52

export interface PhaseLabel {
  label: string
  /** The component whose position the label is anchored above. */
  anchorComponentId: ComponentId
}

interface ArchitectureDiagramProps {
  components: ArchitectureComponent[]
  connections: ArchitectureConnection[]
  onSelectComponent: (componentId: ComponentId) => void
  /** The component the active scenario step targets, or null when no simulation step is active. */
  currentComponentId?: ComponentId | null
  /** Optional row/phase headings, anchored above a given component's authored position. */
  phaseLabels?: PhaseLabel[]
}

export function ArchitectureDiagram({
  components,
  connections,
  onSelectComponent,
  currentComponentId = null,
  phaseLabels = [],
}: ArchitectureDiagramProps) {
  const [hoveredComponentId, setHoveredComponentId] = useState<ComponentId | null>(null)

  const highlight = useMemo(
    () => computeHoverHighlight(hoveredComponentId, components, connections),
    [hoveredComponentId, components, connections],
  )

  // Hover/active state is delivered through context rather than embedded in
  // node/edge data, because giving xyflow brand-new node/edge objects on
  // every hover resets their internal `measured` state and briefly breaks
  // click hit-testing.
  const contextValue = useMemo<HoverHighlightContextValue>(
    () => ({ hoveredComponentId, highlight, activeComponentId: currentComponentId }),
    [hoveredComponentId, highlight, currentComponentId],
  )

  const handleLayouts = useMemo(() => computeNodeHandleLayouts(components, connections), [components, connections])

  const componentPositionById = useMemo(
    () => new Map(components.map((component, index) => [component.id, component.position ?? { x: 0, y: index * FALLBACK_ROW_HEIGHT }])),
    [components],
  )

  const pipelineNodes = useMemo<PipelineFlowNode[]>(
    () =>
      components.map((component, index) => ({
        id: component.id,
        type: 'pipeline',
        position: component.position ?? { x: 0, y: index * FALLBACK_ROW_HEIGHT },
        data: { component, onSelect: onSelectComponent, handleLayout: handleLayouts.get(component.id) ?? {} },
        draggable: false,
      })),
    [components, onSelectComponent, handleLayouts],
  )

  const phaseLabelNodes = useMemo<PhaseLabelFlowNode[]>(
    () =>
      phaseLabels.flatMap((phase) => {
        const anchor = componentPositionById.get(phase.anchorComponentId)
        if (!anchor) {
          return []
        }
        return [
          {
            id: `phase-label-${phase.anchorComponentId}`,
            type: 'phaseLabel' as const,
            position: { x: anchor.x, y: anchor.y - PHASE_LABEL_OFFSET_Y },
            data: { label: phase.label },
            draggable: false,
            selectable: false,
          },
        ]
      }),
    [phaseLabels, componentPositionById],
  )

  const nodes = useMemo(() => [...pipelineNodes, ...phaseLabelNodes], [pipelineNodes, phaseLabelNodes])

  const edges = useMemo<Edge[]>(
    () =>
      connections.map((connection) => ({
        id: connection.id,
        source: connection.from,
        target: connection.to,
        label: connection.label,
        type: 'pipeline',
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--color-canvas-ink)', width: 16, height: 16 },
      })),
    [connections],
  )

  const handleNodeMouseEnter = useCallback<NodeMouseHandler>((_event, node) => {
    setHoveredComponentId(node.id)
  }, [])

  const handleNodeMouseLeave = useCallback<NodeMouseHandler>(() => {
    setHoveredComponentId(null)
  }, [])

  return (
    <div className="flex h-full min-h-[340px] flex-col gap-2">
      <div className="flex justify-end">
        <CategoryLegend components={components} />
      </div>
      <div
        role="group"
        aria-label="Architecture pipeline diagram"
        className="panel-canvas-dark min-h-0 flex-1 overflow-hidden"
      >
        <HoverHighlightContext.Provider value={contextValue}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            minZoom={0.1}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Background color="var(--color-canvas-grid)" gap={24} size={1} />
            <TransactionMarker connections={connections} currentComponentId={currentComponentId} />
          </ReactFlow>
        </HoverHighlightContext.Provider>
      </div>
    </div>
  )
}
