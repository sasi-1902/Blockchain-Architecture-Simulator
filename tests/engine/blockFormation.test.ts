import { describe, expect, it } from 'vitest'
import {
  applyTransactions,
  formatScaledAmount,
  serializeValidationOutcome,
  validateProposal,
} from '../../src/engine/blockFormation'
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
// UC-01-E-01: Valid transaction reduces provisional balance
// ---------------------------------------------------------------------------

describe('UC-01-E-01: valid transaction', () => {
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
// UC-01-E-02: Insufficient balance rejection
// ---------------------------------------------------------------------------

describe('UC-01-E-02: insufficient balance', () => {
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
// UC-01-E-03: Partial failure — reference Scenario B
// ---------------------------------------------------------------------------

describe('UC-01-E-03: partial failure (Scenario B)', () => {
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
// UC-01-E-04: Order dependency — reversing transactions changes outcomes
// ---------------------------------------------------------------------------

describe('UC-01-E-04: order dependency', () => {
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
// UC-01-E-05: Receiver also appears as sender (later transaction)
// ---------------------------------------------------------------------------

describe('UC-01-E-05: receiver also appears as sender', () => {
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
// UC-01-E-06: Sender not found
// ---------------------------------------------------------------------------

describe('UC-01-E-06: sender not found', () => {
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
// UC-01-E-07: applyTransactions reflects only committed transactions
// ---------------------------------------------------------------------------

describe('UC-01-E-07: applyTransactions uses only committed transactions', () => {
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
// UC-01-E-08: All-rejected — empty block committed, balances unchanged
// Confirmed: simulator.cpp:processVerifiedProposal creates block unconditionally.
// ---------------------------------------------------------------------------

describe('UC-01-E-08: all-rejected proposal', () => {
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
// UC-01-E-09: Precision-aware amount validation
// Source: postgres_command_executor.cpp transfer_asset SQL, check code 5:
//   SELECT 5, count(1) = 1 FROM asset WHERE asset_id = :asset_id AND precision >= :precision
// ---------------------------------------------------------------------------

describe('UC-01-E-09a: valid fractional quantity within asset precision', () => {
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

describe('UC-01-E-09b: amount precision below asset precision is accepted', () => {
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

describe('UC-01-E-09c: excess decimal precision exceeds asset precision', () => {
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

describe('UC-01-E-09e: "1." trailing-dot amount (Iroha v1.4.0 compatibility)', () => {
  it('accepts "1." as precision=0, value=1 (matches Iroha 1 Amount class behavior)', () => {
    // Iroha 1 Amount{"1."} has precision=0, value=1 (confirmed by amount_test.cpp).
    // The previous AMOUNT_RE /^\d+(\.\d+)?$/ rejected "1." — now fixed to /^\d+(\.\d*)?$/.
    const world: WorldState = {
      balances: { alice: 5n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '1.')], world)
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 4n, bob: 1n })
  })

  it('"1." at precision=2 asset transfers 1.00 (scales correctly)', () => {
    const world: WorldState = {
      balances: { alice: 1000n }, // 10.00 USD at precision=2
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '1.')], world)
    // "1." has amountPrecision=0; asset precision=2; 0 <= 2 → passes precision check
    // scaleAmount("1.", 2) = 1 * 100 + 0 = 100n (representing 1.00 USD)
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 900n, bob: 100n })
  })
})

describe('UC-01-E-09d: malformed amount string throws precondition error', () => {
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

describe('empty proposal', () => {
  it('returns an empty ValidationOutcome without throwing', () => {
    // Iroha 1 handles empty proposals (no guard in stateful_validator_impl.cpp).
    // The Ordering Service would not normally create an empty proposal in production,
    // but the execution engine handles it correctly as a degenerate case.
    const outcome = validateProposal([], USD_P0)
    expect(outcome.results).toHaveLength(0)
    expect(outcome.validTxIds).toEqual([])
    expect(outcome.rejectedTxIds).toEqual([])
    expect(outcome.finalWorldState.balances).toEqual(USD_P0.balances)
  })
})

describe('zero-amount transfer', () => {
  it('passes validation when sender has sufficient balance', () => {
    // Zero-value transfers are not prohibited by Iroha 1 Amount class or SQL checks.
    // scaleAmount("0", 0) = 0n; 100n >= 0n passes; balance unchanged.
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '0')], USD_P0)
    expect(outcome.results[0].status).toBe('VALID')
    expect(outcome.finalWorldState.balances).toMatchObject({ alice: 100n, bob: 20n })
  })
})

describe('self-transfer (from === to)', () => {
  it('passes validation and leaves balance unchanged', () => {
    // Iroha 1 has no SQL check preventing sender === receiver.
    // The engine applies: newSenderBalance = balance - amount; then to receives amount.
    // Since from === to, the final balance is (balance - amount) + amount = balance.
    // senderProvisionalBalance reflects the intermediate post-deduction value.
    const outcome = validateProposal([tx('tx1', 'alice', 'alice', '30')], USD_P0)
    expect(outcome.results[0].status).toBe('VALID')
    // Final balance is unchanged: alice sent to herself
    expect(outcome.finalWorldState.balances['alice']).toBe(100n)
    // senderProvisionalBalance shows the intermediate deduction (documented behavior)
    expect(outcome.results[0].senderProvisionalBalance).toBe(70n)
  })

  it('is rejected when the self-transfer amount exceeds the balance', () => {
    const outcome = validateProposal([tx('tx1', 'alice', 'alice', '200')], USD_P0)
    expect(outcome.results[0].status).toBe('REJECTED')
    expect(outcome.results[0].reason).toBe('INSUFFICIENT_BALANCE')
    expect(outcome.finalWorldState.balances['alice']).toBe(100n)
  })
})

// ---------------------------------------------------------------------------
// UC-01-E-10: Duplicate transaction IDs throw a precondition error
// ---------------------------------------------------------------------------

describe('UC-01-E-10: duplicate transaction IDs within a proposal', () => {
  it('throws when two transactions share the same ID', () => {
    expect(() =>
      validateProposal(
        [tx('tx1', 'alice', 'bob', '10'), tx('tx1', 'alice', 'carol', '5')],
        USD_P0,
      ),
    ).toThrow(/transaction IDs must be unique/)
  })

  it('allows proposals where all IDs are distinct', () => {
    expect(() =>
      validateProposal(
        [tx('tx1', 'alice', 'bob', '10'), tx('tx2', 'alice', 'carol', '5')],
        USD_P0,
      ),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// UC-01-E-11: Multi-asset proposals throw a precondition error
// ---------------------------------------------------------------------------

describe('UC-01-E-11: multi-asset proposal rejected as unsupported', () => {
  it('throws when transactions reference more than one asset', () => {
    const world: WorldState = {
      balances: { alice: 1000n, bob: 500n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0, ETH: 2 },
    }
    // If allowed, alice's USD balance would be checked against an ETH transfer
    // amount — producing incorrect accept/reject decisions.
    expect(() =>
      validateProposal(
        [
          tx('tx1', 'alice', 'bob', '10', 'USD'),
          tx('tx2', 'alice', 'carol', '5', 'ETH'),
        ],
        world,
      ),
    ).toThrow(/multi-asset proposals are not supported/)
  })

  it('allows a proposal where all transactions use the same asset', () => {
    const world: WorldState = {
      balances: { alice: 1000n, bob: 500n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0, ETH: 2 },
    }
    expect(() =>
      validateProposal(
        [tx('tx1', 'alice', 'bob', '10', 'USD'), tx('tx2', 'alice', 'carol', '5', 'USD')],
        world,
      ),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// formatScaledAmount: precision-safe bigint → decimal string
// ---------------------------------------------------------------------------

describe('formatScaledAmount', () => {
  it('precision=0: returns plain integer string', () => {
    expect(formatScaledAmount(100n, 0)).toBe('100')
    expect(formatScaledAmount(0n, 0)).toBe('0')
  })

  it('precision=2: formats correctly with leading zeros as needed', () => {
    expect(formatScaledAmount(1050n, 2)).toBe('10.50')
    expect(formatScaledAmount(100n, 2)).toBe('1.00')
    expect(formatScaledAmount(5n, 2)).toBe('0.05')
    expect(formatScaledAmount(0n, 2)).toBe('0.00')
  })

  it('precision=1: single decimal place', () => {
    expect(formatScaledAmount(15n, 1)).toBe('1.5')
    expect(formatScaledAmount(0n, 1)).toBe('0.0')
  })
})

// ---------------------------------------------------------------------------
// serializeValidationOutcome: bigint → string, Set → array
// ---------------------------------------------------------------------------

describe('serializeValidationOutcome', () => {
  it('converts bigint senderProvisionalBalance to formatted string', () => {
    const world: WorldState = {
      balances: { alice: 100n, bob: 20n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 0 },
    }
    const outcome = validateProposal([tx('tx1', 'alice', 'bob', '30')], world)
    const serialized = serializeValidationOutcome(outcome, [tx('tx1', 'alice', 'bob', '30')], world.assets)

    expect(serialized.results[0].senderProvisionalBalance).toBe('70')
    expect(serialized.finalWorldState.balances['alice']).toBe('70')
    expect(serialized.finalWorldState.balances['bob']).toBe('50')
  })

  it('converts bigint balances at precision=2 to decimal strings', () => {
    const world: WorldState = {
      balances: { alice: 1000n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2 },
    }
    const transactions = [tx('tx1', 'alice', 'bob', '5')]
    const outcome = validateProposal(transactions, world)
    const serialized = serializeValidationOutcome(outcome, transactions, world.assets)

    expect(serialized.results[0].senderProvisionalBalance).toBe('5.00')
    expect(serialized.finalWorldState.balances['alice']).toBe('5.00')
    expect(serialized.finalWorldState.balances['bob']).toBe('5.00')
  })

  it('accounts Set is converted to a sorted array', () => {
    const world: WorldState = {
      balances: { alice: 100n, bob: 20n },
      accounts: new Set(['bob', 'alice']),
      assets: { USD: 0 },
    }
    const transactions = [tx('tx1', 'alice', 'bob', '10')]
    const outcome = validateProposal(transactions, world)
    const serialized = serializeValidationOutcome(outcome, transactions, world.assets)

    expect(serialized.finalWorldState.accounts).toEqual(['alice', 'bob'])
  })

  it('output is JSON.stringify-safe (no bigint values remain)', () => {
    const world: WorldState = {
      balances: { alice: 100n, bob: 20n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 0 },
    }
    const transactions = [tx('tx1', 'alice', 'bob', '30')]
    const outcome = validateProposal(transactions, world)
    const serialized = serializeValidationOutcome(outcome, transactions, world.assets)

    expect(() => JSON.stringify(serialized)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// UC-01-E-12: Asset precision validation — integer in range 0–255
// Source: Asset::precision() returns uint8 in Iroha 1 (0–255 inclusive).
// ---------------------------------------------------------------------------

describe('UC-01-E-12: asset precision out of range throws precondition error', () => {
  it('throws when an asset has precision below 0', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: -1 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '10')], world)).toThrow(
      /valid Iroha 1 asset precision/,
    )
  })

  it('throws when an asset has precision above 255', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 256 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '10')], world)).toThrow(
      /valid Iroha 1 asset precision/,
    )
  })

  it('throws when an asset has a non-integer precision', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 1.5 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '10')], world)).toThrow(
      /valid Iroha 1 asset precision/,
    )
  })

  it('accepts precision at the lower boundary (0)', () => {
    const world: WorldState = {
      balances: {},
      accounts: new Set<string>(),
      assets: { USD: 0 },
    }
    expect(() => validateProposal([], world)).not.toThrow()
  })

  it('accepts precision at the upper boundary (255)', () => {
    const world: WorldState = {
      balances: {},
      accounts: new Set<string>(),
      assets: { MICRO: 255 },
    }
    expect(() => validateProposal([], world)).not.toThrow()
  })

  it('validates all assets in the map, not just the one referenced by transactions', () => {
    const world: WorldState = {
      balances: { alice: 100n },
      accounts: new Set(['alice', 'bob']),
      assets: { USD: 2, ETH: -5 },
    }
    expect(() => validateProposal([tx('tx1', 'alice', 'bob', '10', 'USD')], world)).toThrow(
      /valid Iroha 1 asset precision/,
    )
  })
})

// ---------------------------------------------------------------------------
// applyTransactions: postcondition guard rejects unvalidated transactions
// ---------------------------------------------------------------------------

describe('applyTransactions: per-transaction negative balance guard', () => {
  it('throws when a single unvalidated transaction debits more than the sender holds', () => {
    // alice has 10n but tx debits 50n — passes only if validateProposal was bypassed.
    expect(() =>
      applyTransactions({ alice: 10n }, [tx('tx1', 'alice', 'bob', '50')], { USD: 0 }),
    ).toThrow(/negative balance/)
  })

  it('throws even when a later transaction would restore the final balance to non-negative', () => {
    // Regression: postcondition-only check (all balances after all txs) would miss this.
    // alice: 10n, bob: 100n
    // tx1: alice→bob 50  → alice goes to -40n (INVALID — debit exceeds balance)
    // tx2: bob→alice 100 → alice would become 60n, bob 50n (final balances look fine)
    // With per-transaction checking, tx1's debit is detected before tx2 runs.
    expect(() =>
      applyTransactions(
        { alice: 10n, bob: 100n },
        [tx('tx1', 'alice', 'bob', '50'), tx('tx2', 'bob', 'alice', '100')],
        { USD: 0 },
      ),
    ).toThrow(/negative balance/)
  })

  it('does not throw when all debits stay within available balance', () => {
    expect(() =>
      applyTransactions({ alice: 100n }, [tx('tx1', 'alice', 'bob', '30')], { USD: 0 }),
    ).not.toThrow()
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
