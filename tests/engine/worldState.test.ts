import { describe, expect, it } from 'vitest'
import { computeCumulativeBalances } from '../../src/engine/worldState'

describe('computeCumulativeBalances', () => {
  it('returns the initial balances unchanged when no runs have committed', () => {
    const balances = computeCumulativeBalances({ alice: 100, bob: 20 }, [])

    expect(balances).toEqual({ alice: 100, bob: 20 })
  })

  it('accumulates a single committed run onto the initial balances', () => {
    const balances = computeCumulativeBalances({ alice: 100, bob: 20 }, [
      [
        { path: 'worldStateView.alice.asset', value: 'USD' },
        { path: 'worldStateView.alice.balanceChange', value: '-10' },
        { path: 'worldStateView.bob.asset', value: 'USD' },
        { path: 'worldStateView.bob.balanceChange', value: '+10' },
      ],
    ])

    expect(balances).toEqual({ alice: 90, bob: 30 })
  })

  it('accumulates multiple committed runs in order', () => {
    const run = [
      { path: 'worldStateView.alice.balanceChange', value: '-10' },
      { path: 'worldStateView.bob.balanceChange', value: '+10' },
    ]

    const balances = computeCumulativeBalances({ alice: 100, bob: 20 }, [run, run])

    expect(balances).toEqual({ alice: 80, bob: 40 })
  })

  it('ignores fields that are not deltas, such as a static asset name', () => {
    const balances = computeCumulativeBalances({ alice: 100 }, [
      [{ path: 'worldStateView.alice.asset', value: 'USD' }],
    ])

    expect(balances).toEqual({ alice: 100 })
  })

  it('ignores a non-numeric change value rather than corrupting the balance', () => {
    const balances = computeCumulativeBalances({ alice: 100 }, [
      [{ path: 'worldStateView.alice.balanceChange', value: 'not-a-number' }],
    ])

    expect(balances).toEqual({ alice: 100 })
  })

  it('introduces a new entity at zero starting balance if only mentioned in a later change', () => {
    const balances = computeCumulativeBalances({ alice: 100 }, [
      [{ path: 'worldStateView.carol.balanceChange', value: '+5' }],
    ])

    expect(balances).toEqual({ alice: 100, carol: 5 })
  })
})
