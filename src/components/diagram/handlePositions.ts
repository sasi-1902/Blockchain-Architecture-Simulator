import { Position } from '@xyflow/react'
import type { ArchitectureComponent, ArchitectureConnection, ComponentId } from '../../engine/types'

export interface NodeHandleLayout {
  source?: Position
  target?: Position
}

function directionPositions(dx: number, dy: number): { from: Position; to: Position } {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: Position.Right, to: Position.Left } : { from: Position.Left, to: Position.Right }
  }
  return dy >= 0 ? { from: Position.Bottom, to: Position.Top } : { from: Position.Top, to: Position.Bottom }
}

/**
 * Derives which side of each node its connection handles should sit on,
 * purely from the authored `position` of the components it connects to.
 * This keeps the "snake" layout direction (rightward, then leftward, then
 * rightward again) generic rather than hard-coding Iroha-specific handle
 * sides in the UI layer.
 */
export function computeNodeHandleLayouts(
  components: ArchitectureComponent[],
  connections: ArchitectureConnection[],
): Map<ComponentId, NodeHandleLayout> {
  const positionById = new Map(components.map((component) => [component.id, component.position ?? { x: 0, y: 0 }]))
  const layouts = new Map<ComponentId, NodeHandleLayout>()

  for (const connection of connections) {
    const fromPosition = positionById.get(connection.from)
    const toPosition = positionById.get(connection.to)
    if (!fromPosition || !toPosition) {
      continue
    }

    const { from, to } = directionPositions(toPosition.x - fromPosition.x, toPosition.y - fromPosition.y)

    const fromLayout = layouts.get(connection.from) ?? {}
    fromLayout.source = from
    layouts.set(connection.from, fromLayout)

    const toLayout = layouts.get(connection.to) ?? {}
    toLayout.target = to
    layouts.set(connection.to, toLayout)
  }

  return layouts
}
