import { describe, expect, it } from 'vitest'
import { flattenTxStateChange } from '../../src/engine/txStateChange'

describe('flattenTxStateChange', () => {
  it('flattens nested plain objects into dot-separated path/value rows', () => {
    const change = {
      worldStateView: {
        alice: { asset: 'USD', balanceChange: -10 },
        bob: { asset: 'USD', balanceChange: 10 },
      },
    }

    expect(flattenTxStateChange(change)).toEqual([
      { path: 'worldStateView.alice.asset', value: 'USD' },
      { path: 'worldStateView.alice.balanceChange', value: '-10' },
      { path: 'worldStateView.bob.asset', value: 'USD' },
      { path: 'worldStateView.bob.balanceChange', value: '+10' },
    ])
  })

  it('prefixes positive numbers with a plus sign and leaves negative numbers as-is', () => {
    expect(flattenTxStateChange({ amount: 5 })).toEqual([{ path: 'amount', value: '+5' }])
    expect(flattenTxStateChange({ amount: -5 })).toEqual([{ path: 'amount', value: '-5' }])
    expect(flattenTxStateChange({ amount: 0 })).toEqual([{ path: 'amount', value: '0' }])
  })

  it('renders string and boolean values without transformation', () => {
    expect(flattenTxStateChange({ status: 'committed', permitted: true })).toEqual([
      { path: 'status', value: 'committed' },
      { path: 'permitted', value: 'true' },
    ])
  })

  it('returns an empty array for an empty object', () => {
    expect(flattenTxStateChange({})).toEqual([])
  })
})
