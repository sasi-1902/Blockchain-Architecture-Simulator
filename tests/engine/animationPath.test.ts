import { describe, expect, it } from 'vitest'
import { findConnectingEdge } from '../../src/engine/animationPath'
import type { ArchitectureConnection } from '../../src/engine/types'

const connections: ArchitectureConnection[] = [
  { id: 'client-to-torii', from: 'client', to: 'torii' },
  { id: 'torii-to-stateless-validation', from: 'torii', to: 'stateless-validation' },
]

describe('findConnectingEdge', () => {
  it('finds a connection travelled in its authored direction', () => {
    const result = findConnectingEdge(connections, 'torii', 'stateless-validation')

    expect(result).toEqual({ edge: connections[1], reversed: false })
  })

  it('finds a connection travelled against its authored direction and flags it as reversed', () => {
    const result = findConnectingEdge(connections, 'stateless-validation', 'torii')

    expect(result).toEqual({ edge: connections[1], reversed: true })
  })

  it('returns undefined when no direct connection exists between the two components', () => {
    const result = findConnectingEdge(connections, 'client', 'stateless-validation')

    expect(result).toBeUndefined()
  })

  it('returns undefined when either id is unknown', () => {
    expect(findConnectingEdge(connections, 'torii', 'does-not-exist')).toBeUndefined()
    expect(findConnectingEdge(connections, 'does-not-exist', 'torii')).toBeUndefined()
  })
})
