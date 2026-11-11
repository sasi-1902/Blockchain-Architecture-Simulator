import { describe, expect, it } from 'vitest'
import { applyTransactions, validateProposal } from '../../src/engine/blockFormation'
import type { TransactionSpec, WorldState } from '../../src/engine/blockFormation'

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const USD_P0: WorldState = {
  balances: { alice: 100n, bob: 20n },
  accounts: new Set(['alice', 'bob']),
  assets: { USD: 0 },
}

function tx(id: string, from: string, to: string, amount: string, asset = 'USD'): TransactionSpec {
  return { id, from, to, asset, amount }
}

// ---------------------------------------------------------------------------
// UC-03-E-01: Valid transaction reduces provisional balance
// ---------------------------------------------------------------------------

describe('UC-03-E-01: valid transaction', () => {
  it('passes and reduces the sender provisional balance', () => {
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '30')], USD_P0)

    expect(outcome.results).toHaveLength(1)
    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'VALID',
      senderProvisionalBalance: 70n,
    })
    expect(outcome.validTxIds).toEqual(['tx1'])
    expect(outcome.rejectedTxIds).toEqual([])
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 70n, bob: 50n })
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-02: Insufficient balance rejection
// ---------------------------------------------------------------------------

describe('UC-03-E-02: insufficient balance', () => {
  it('rejects the transaction and leaves balances unchanged', () => {
    const world: WorldState = {
      balances: { alice: 20n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '50')], world)

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'INSUFFICIENT_BALANCE',
      senderProvisionalBalance: 20n,
    })
    expect(outcome.validTxIds).toEqual([])
    expect(outcome.rejectedTxIds).toEqual(['tx1'])
    expect(outcome.finalWorldState.balances.alice).toBe(20n)
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-03: Partial failure — reference Scenario B
// ---------------------------------------------------------------------------

describe('UC-03-E-03: partial failure (Scenario B)', () => {
  it('commits passing transactions and rejects the failing one in proposal order', () => {
    const world: WorldState = {
      balances: { alice: 100n, bob: 20n, carol: 30n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal(
      [
        tx('tx1', 'alice', 'bob', '30'),
        tx('tx2', 'alice', 'carol', '90'), // alice provisional is 70 after tx1 — fails
        tx('tx3', 'bob', 'alice', '10'),
      ],
      world,
    )

    expect(outcome.results[0]).toMatchObject({ txId: 'tx1', status: 'VALID', senderProvisionalBalance: 70n })
    expect(outcome.results[1]).toMatchObject({
      txId: 'tx2',
      status: 'REJECTED',
      reason: 'INSUFFICIENT_BALANCE',
      senderProvisionalBalance: 70n,
    })
    // Bob's provisional balance before tx3: 20n (initial) + 30n (received from tx1) = 50n.
    // After sending 10n: 50n - 10n = 40n. The spec listed 10n incorrectly (used initial balance
    // instead of provisional). Sequential WSV accumulation makes the correct value 40n.
    expect(outcome.results[2]).toMatchObject({ txId: 'tx3', status: 'VALID', senderProvisionalBalance: 40n })
    expect(outcome.validTxIds).toEqual(['tx1', 'tx3'])
    expect(outcome.rejectedTxIds).toEqual(['tx2'])
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 80n, bob: 40n, carol: 30n })
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-04: Order dependency — reversing transactions changes outcomes
// ---------------------------------------------------------------------------

describe('UC-03-E-04: order dependency', () => {
  const world: WorldState = {
    balances: { alice: 50n },
    accounts: new Set(['alice', 'bob', 'carol']),
    assets: { USD: 0 },
  }

  it('Order A: tx1(alice→bob:40) then tx2(alice→carol:20) — tx2 rejected', () => {
    const outcome = validateProposal(
      [tx('tx1', 'alice', 'bob', '40'), tx('tx2', 'alice', 'carol', '20')],
      world,
    )
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.results[0].senderProvisionalBalance).toBe(10n)
    expect(outcome.results[1].status).toBe('REJECTED')
    expect(outcome.results[1].reason).toBe('INSUFFICIENT_BALANCE')
  })

  it('Order B: tx2(alice→carol:20) then tx1(alice→bob:40) — tx1 rejected', () => {
    const outcome = validateProposal(
      [tx('tx2', 'alice', 'carol', '20'), tx('tx1', 'alice', 'bob', '40')],
      world,
    )
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.results[0].senderProvisionalBalance).toBe(30n)
    expect(outcome.results[1].status).toBe('REJECTED')
    expect(outcome.results[1].reason).toBe('INSUFFICIENT_BALANCE')
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-05: Receiver also appears as sender (later transaction)
// ---------------------------------------------------------------------------

describe('UC-03-E-05: receiver also appears as sender', () => {
  it('tracks receiver provisional balance and uses it when that account sends later', () => {
    const outcome = validateProposal(
      [
        tx('tx1', 'alice', 'bob', '30'), // bob receives; provisional 20n+30n = 50n
        tx('tx2', 'bob', 'alice', '40'), // bob sends 40; 50n >= 40n — VALID
      ],
      USD_P0,
    )

    expect(outcome.results[0]).toMatchObject({ txId: 'tx1', status: 'VALID', senderProvisionalBalance: 70n })
    expect(outcome.results[1]).toMatchObject({ txId: 'tx2', status: 'VALID', senderProvisionalBalance: 10n })
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 110n, bob: 10n })
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-06: Sender not found
// ---------------------------------------------------------------------------

describe('UC-03-E-06: sender not found', () => {
  it('rejects with SENDER_NOT_FOUND when the sender account does not exist', () => {
    const world: WorldState = {
      balances: { bob: 20n },
      accounts: new Set(['bob']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '10')], world)

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'SENDER_NOT_FOUND',
    })
  })

  it('rejects with RECEIVER_NOT_FOUND when only the receiver is missing', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'carol', '10')], world)

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'RECEIVER_NOT_FOUND',
    })
  })

  it('rejects with ASSET_NOT_FOUND when the asset is not registered', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'bob']),
      assets: {},
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '10')], world)

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'ASSET_NOT_FOUND',
    })
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-07: applyTransactions reflects only committed transactions
// ---------------------------------------------------------------------------

describe('UC-03-E-07: applyTransactions uses only committed transactions', () => {
  it('applies tx1 and tx3 from Scenario B — tx2 (rejected) is excluded', () => {
    const initial = { alice: 100n, bob: 20n, carol: 30n }
    const assets = { USD: 0 }
    const result = applyTransactions(
      initial,
      [tx('tx1', 'alice', 'bob', '30'), tx('tx3', 'bob', 'alice', '10')],
      assets,
    )

    expect(result).toMatchObject({ alice: 80n, bob: 40n, carol: 30n })
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-08: All-rejected — empty block committed, balances unchanged
// Confirmed: simulator.cpp:processVerifiedProposal creates block unconditionally.
// ---------------------------------------------------------------------------

describe('UC-03-E-08: all-rejected proposal', () => {
  it('rejects all transactions and leaves the world state unchanged', () => {
    const world: WorldState = {
      balances: { alice: 5n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal(
      [tx('tx1', 'alice', 'bob', '20'), tx('tx2', 'alice', 'bob', '30')],
      world,
    )

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'INSUFFICIENT_BALANCE',
    })
    expect(outcome.results[1]).toMatchObject({
      txId: 'tx2',
      status: 'REJECTED',
      reason: 'INSUFFICIENT_BALANCE',
    })
    expect(outcome.validTxIds).toEqual([])
    expect(outcome.rejectedTxIds).toEqual(['tx1', 'tx2'])
    expect(outcome.finalWorldState.balances.alice).toBe(5n)
  })
})

// ---------------------------------------------------------------------------
// UC-03-E-09: Precision-aware amount validation
// Source: postgres_command_executor.cpp transfer_asset SQL, check code 5:
//   SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision
// ---------------------------------------------------------------------------

describe('UC-03-E-09a: valid fractional quantity within asset precision', () => {
  it('accepts amount with decimal places equal to asset precision', () => {
    const world: WorldState = {
      balances: { alice: 1050n }, // 10.50 USD at precision=2
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '10.50')], world)

    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.validTxIds).toEqual(['tx1'])
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 0n, bob: 1050n })
  })
})

describe('UC-03-E-09b: amount precision below asset precision is accepted', () => {
  it('accepts an integer amount when asset precision=2 (SQL: 2 >= 0)', () => {
    const world: WorldState = {
      balances: { alice: 1000n }, // 10.00 USD at precision=2
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '5')], world)

    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 500n, bob: 500n })
  })
})

describe('UC-03-E-09c: excess decimal precision exceeds asset precision', () => {
  it('rejects amount with more decimal places than asset precision', () => {
    const world: WorldState = {
      balances: { alice: 10000n }, // 100.00 USD at precision=2
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    // "10.500" has precision=3; asset precision=2; SQL check 2 >= 3 fails → code 5
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '10.500')], world)

    expect(outcome.results[0]).toMatchObject({
      txId: 'tx1',
      status: 'REJECTED',
      reason: 'AMOUNT_PRECISION_EXCEEDS_ASSET_PRECISION',
    })
    expect(outcome.validTxIds).toEqual([])
    expect(outcome.finalWorldState.balances.alice).toBe(10000n)
  })
})

describe('UC-03-E-09d: malformed amount string throws precondition error', () => {
  it('throws for a negative amount string', () => {
    const world: WorldState = {
      balances: { alice: 1000n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '-5.00')], world)).toThrow(
      /invalid amount string/,
    )
  })

  it('throws for an empty amount string', () => {
    const world: WorldState = {
      balances: { alice: 1000n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '')], world)).toThrow(
      /invalid amount string/,
    )
  })

  it('throws for an amount starting with a dot', () => {
    const world: WorldState = {
      balances: { alice: 1000n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '.50')], world)).toThrow(
      /invalid amount string/,
    )
  })

  it('throws for an amount with non-digit characters', () => {
    const world: WorldState = {
      balances: { alice: 1000n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '10a')], world)).toThrow(
      /invalid amount string/,
    )
  })
})

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe('zero-amount transfer', () => {
  it('passes validation when sender has sufficient balance', () => {
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '0')], USD_P0)
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 100n, bob: 20n })
  })
})

describe('receiver with no initial balance receives funds', () => {
  it('correctly initialises receiver balance from zero when first receiving', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'carol']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'carol', '25')], world)

    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 75n, carol: 25n })
  })
})
