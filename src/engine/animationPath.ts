import type { ArchitectureConnection, ComponentId } from './types'

export interface ConnectingEdge {
  edge: ArchitectureConnection
  /** True when `toId` is the connection's `from` side, i.e. travel is against the authored edge direction. */
  reversed: boolean
}

/**
 * Finds the single connection joining two components, regardless of which
 * side is authored as `from`/`to`, so the transaction marker can animate
 * along the rendered edge path for both forward (Next) and backward
 * (Previous) simulation steps.
 */
export function findConnectingEdge(
  connections: ArchitectureConnection[],
  fromId: ComponentId,
  toId: ComponentId,
): ConnectingEdge | undefined {
  const forward = connections.find((connection) => connection.from === fromId && connection.to === toId)
  if (forward) {
    return { edge: forward, reversed: false }
  }

  const backward = connections.find((connection) => connection.from === toId && connection.to === fromId)
  if (backward) {
    return { edge: backward, reversed: true }
  }

  return undefined
}
