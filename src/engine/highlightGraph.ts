import type { ArchitectureComponent, ArchitectureConnection, ComponentId } from './types'

export interface HoverHighlight {
  highlightedComponentIds: Set<ComponentId>
  highlightedConnectionIds: Set<string>
}

const EMPTY_HIGHLIGHT: HoverHighlight = {
  highlightedComponentIds: new Set(),
  highlightedConnectionIds: new Set(),
}

/**
 * Determines which components and connections should be emphasized when a
 * component is hovered, using its `communicatesWith` list rather than raw
 * connection adjacency so the highlight reflects the authored relationship.
 */
export function computeHoverHighlight(
  hoveredComponentId: ComponentId | null,
  components: ArchitectureComponent[],
  connections: ArchitectureConnection[],
): HoverHighlight {
  if (!hoveredComponentId) {
    return EMPTY_HIGHLIGHT
  }

  const hoveredComponent = components.find((component) => component.id === hoveredComponentId)

  if (!hoveredComponent) {
    return EMPTY_HIGHLIGHT
  }

  const communicatingIds = new Set(hoveredComponent.communicatesWith)

  const highlightedComponentIds = new Set<ComponentId>([hoveredComponentId, ...communicatingIds])

  const highlightedConnectionIds = new Set(
    connections
      .filter(
        (connection) =>
          (connection.from === hoveredComponentId && communicatingIds.has(connection.to)) ||
          (connection.to === hoveredComponentId && communicatingIds.has(connection.from)),
      )
      .map((connection) => connection.id),
  )

  return { highlightedComponentIds, highlightedConnectionIds }
}
