import { useEffect, useRef } from 'react'
import { animate, type AnimationPlaybackControls } from 'motion'
import { useInternalNode, ViewportPortal } from '@xyflow/react'
import { findConnectingEdge } from '../../engine/animationPath'
import type { ArchitectureConnection, ComponentId } from '../../engine/types'

const MARKER_SIZE_PX = 16
const STEP_ANIMATION_DURATION_S = 0.6

interface TransactionMarkerProps {
  connections: ArchitectureConnection[]
  /** The component the active scenario step targets, or null when no step is active. */
  currentComponentId: ComponentId | null
}

/**
 * Renders the moving transaction token described in DESIGN.md section 13.
 * Position is driven imperatively (rather than through React state) so each
 * animation frame can sample the *rendered* edge path via `getPointAtLength`
 * without triggering a re-render per frame.
 */
export function TransactionMarker({ connections, currentComponentId }: TransactionMarkerProps) {
  const markerRef = useRef<HTMLDivElement>(null)
  const previousComponentIdRef = useRef<ComponentId | null>(null)
  const currentNode = useInternalNode(currentComponentId ?? '')

  useEffect(() => {
    const marker = markerRef.current
    const previousComponentId = previousComponentIdRef.current
    if (!marker) {
      return
    }

    if (!currentComponentId || !currentNode) {
      marker.style.opacity = '0'
      previousComponentIdRef.current = currentComponentId
      return
    }

    const width = currentNode.measured?.width ?? 0
    const height = currentNode.measured?.height ?? 0
    const destination = {
      x: currentNode.internals.positionAbsolute.x + width / 2,
      y: currentNode.internals.positionAbsolute.y + height / 2,
    }

    const placeAt = (point: { x: number; y: number }) => {
      marker.style.transform = `translate(${point.x - MARKER_SIZE_PX / 2}px, ${point.y - MARKER_SIZE_PX / 2}px)`
    }

    marker.style.opacity = '1'

    const connecting =
      previousComponentId && previousComponentId !== currentComponentId
        ? findConnectingEdge(connections, previousComponentId, currentComponentId)
        : undefined

    let controls: AnimationPlaybackControls | undefined

    if (connecting) {
      const pathElement = document.getElementById(connecting.edge.id)
      if (pathElement instanceof SVGPathElement) {
        const totalLength = pathElement.getTotalLength()
        const [from, to] = connecting.reversed ? [totalLength, 0] : [0, totalLength]
        controls = animate(from, to, {
          duration: STEP_ANIMATION_DURATION_S,
          ease: 'easeInOut',
          onUpdate: (length) => placeAt(pathElement.getPointAtLength(length)),
          // The path's endpoint is the target's *handle* position (its edge),
          // which no longer coincides with the node's center now that handles
          // sit on the left/right/top/bottom sides of a horizontally laid out
          // node rather than always top/bottom on a single vertical column.
          // Snap to the true center once the path-follow animation finishes.
          onComplete: () => placeAt(destination),
        })
      }
    }

    if (!controls) {
      placeAt(destination)
    }

    previousComponentIdRef.current = currentComponentId

    return () => {
      controls?.stop()
    }
  }, [connections, currentComponentId, currentNode])

  return (
    <ViewportPortal>
      <div
        ref={markerRef}
        aria-hidden="true"
        data-testid="transaction-marker"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: MARKER_SIZE_PX,
          height: MARKER_SIZE_PX,
          borderRadius: '9999px',
          backgroundColor: 'var(--color-transaction-red)',
          border: '2px solid var(--color-canvas-ink)',
          boxShadow: '0 0 0 4px rgba(217, 74, 74, 0.4)',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </ViewportPortal>
  )
}
