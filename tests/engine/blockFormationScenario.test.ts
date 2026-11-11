import { createActor } from 'xstate'
import { describe, expect, it } from 'vitest'
import { generateBlockFormationScenario } from '../../src/architectures/iroha1/scenarios/blockFormation'
import { validateProposal } from '../../src/engine/blockFormation'
import type { TransactionSpec, WorldState, ValidationOutcome, BlockContent } from '../../src/engine/blockFormation'
import {
  createSimulationMachine,
  selectCurrentStep,
  selectIsComplete,
} from '../../src/engine/simulationMachine'
import { iroha1Architecture } from '../../src/architectures/iroha1/index'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const WORLD: WorldState = {
  balances: { alice: 100n, bob: 20n, carol: 30n },
  accounts: new Set(['alice', 'bob', 'carol']),
  assets: { USD: 0 },
}

function tx(id: string, from: string, to: string, amount: string): TransactionSpec {
  return { id, from, to, asset: 'USD', amount }
}

const ALL_PASS_TXS: readonly TransactionSpec[] = [
  tx('tx1', 'alice', 'bob', '30'),
  tx('tx2', 'alice', 'carol', '20'),
]

const PARTIAL_TXS: readonly TransactionSpec[] = [
  tx('tx1', 'alice', 'bob', '30'),
  tx('tx2', 'alice', 'carol', '90'), // fails: alice provisional is 70
  tx('tx3', 'bob', 'alice', '10'),
]

const ALL_REJECT_TXS: readonly TransactionSpec[] = [
  tx('tx1', 'alice', 'bob', '200'), // exceeds 100n
  tx('tx2', 'alice', 'carol', '150'),
]

// ---------------------------------------------------------------------------
// UC-01-I-01: Scenario step count matches pipeline stages
// ---------------------------------------------------------------------------

describe('UC-01-I-01: generated scenario step count', () => {
  it('produces exactly 11 steps matching the Iroha v1 pipeline', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    expect(scenario.steps).toHaveLength(11)
  })

  it('each step references a component that exists in iroha1Architecture', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const knownIds = new Set(iroha1Architecture.components.map((c) => c.id))
    for (const step of scenario.steps) {
      expect(knownIds).toContain(step.componentId)
    }
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-02: Stateful-validation step embeds the ValidationOutcome
// ---------------------------------------------------------------------------

describe('UC-01-I-02: stateful-validation step carries ValidationOutcome', () => {
  it('the validationOutcome in txStateChanges equals validateProposal output', () => {
    const expected: ValidationOutcome = validateProposal(PARTIAL_TXS, WORLD)
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)

    const sfStep = scenario.steps.find((s) => s.componentId === 'stateful-validation')
    expect(sfStep).toBeDefined()

    const outcome = sfStep?.txStateChanges?.['validationOutcome'] as ValidationOutcome
    expect(outcome.validTxIds).toEqual(expected.validTxIds)
    expect(outcome.rejectedTxIds).toEqual(expected.rejectedTxIds)
    expect(outcome.results).toHaveLength(expected.results.length)

    for (let i = 0; i < expected.results.length; i++) {
      expect(outcome.results[i].txId).toBe(expected.results[i].txId)
      expect(outcome.results[i].status).toBe(expected.results[i].status)
      expect(outcome.results[i].reason).toBe(expected.results[i].reason)
      expect(outcome.results[i].senderProvisionalBalance).toBe(
        expected.results[i].senderProvisionalBalance,
      )
    }
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-03: Commit step carries the BlockContent
// ---------------------------------------------------------------------------

describe('UC-01-I-03: commit step carries BlockContent', () => {
  it('all-pass: block.transactions contains all txs, rejectedHashes is empty', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['block'] as BlockContent

    expect(block.transactions.map((t) => t.id)).toEqual(['tx1', 'tx2'])
    expect(block.rejectedTransactionHashes).toEqual([])
  })

  it('partial: block.transactions has valid txs; rejectedHashes has rejected ids', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['block'] as BlockContent

    expect(block.transactions.map((t) => t.id)).toEqual(['tx1', 'tx3'])
    expect(block.rejectedTransactionHashes).toEqual(['tx2'])
  })

  it('all-rejected: block.transactions is empty; all ids are in rejectedHashes', () => {
    const scenario = generateBlockFormationScenario(ALL_REJECT_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['block'] as BlockContent

    expect(block.transactions).toHaveLength(0)
    expect(block.rejectedTransactionHashes).toEqual(['tx1', 'tx2'])
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-04: Generated scenario works with the XState playback controller
// ---------------------------------------------------------------------------

describe('UC-01-I-04: XState playback controller compatibility', () => {
  it('advances through all 11 steps and reaches completion', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    for (let i = 0; i < scenario.steps.length; i++) {
      actor.send({ type: 'NEXT' })
    }

    expect(selectIsComplete(actor.getSnapshot().context)).toBe(true)
    expect(selectCurrentStep(actor.getSnapshot().context)?.componentId).toBe('commit')
  })

  it('stepping PREVIOUS from the commit step lands on yac-consensus', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    for (let i = 0; i < scenario.steps.length; i++) {
      actor.send({ type: 'NEXT' })
    }
    actor.send({ type: 'PREVIOUS' })

    expect(selectCurrentStep(actor.getSnapshot().context)?.componentId).toBe('yac-consensus')
  })

  it('RESET returns to stepIndex -1 without corrupting step data', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    actor.send({ type: 'RESET' })

    expect(selectCurrentStep(actor.getSnapshot().context)).toBeUndefined()
    expect(selectIsComplete(actor.getSnapshot().context)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-05: Determinism — same inputs always produce the same scenario
// ---------------------------------------------------------------------------

describe('UC-01-I-05: scenario generation is deterministic', () => {
  it('calling generateBlockFormationScenario twice with identical inputs returns structurally equal scenarios', () => {
    const s1 = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const s2 = generateBlockFormationScenario(PARTIAL_TXS, WORLD)

    expect(s1.id).toBe(s2.id)
    expect(s1.steps).toHaveLength(s2.steps.length)
    expect(s1.steps.map((s) => s.componentId)).toEqual(s2.steps.map((s) => s.componentId))

    const block1 = s1.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent
    const block2 = s2.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent

    expect(block1.transactions.map((t) => t.id)).toEqual(block2.transactions.map((t) => t.id))
    expect(block1.rejectedTransactionHashes).toEqual(block2.rejectedTransactionHashes)
  })
})

// ---------------------------------------------------------------------------
// Input sensitivity: changing inputs changes generated events
// ---------------------------------------------------------------------------

describe('input sensitivity: changing transactions changes generated scenario', () => {
  it('swapping transaction order changes which one is rejected', () => {
    const world: WorldState = {
      balances: { alice: 50n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0 },
    }

    const orderA = generateBlockFormationScenario(
      [tx('tx1', 'alice', 'bob', '40'), tx('tx2', 'alice', 'carol', '20')],
      world,
    )
    const orderB = generateBlockFormationScenario(
      [tx('tx2', 'alice', 'carol', '20'), tx('tx1', 'alice', 'bob', '40')],
      world,
    )

    const blockA = orderA.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent
    const blockB = orderB.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent

    // Order A: tx1 passes (alice→bob:40, provisional 10), tx2 rejected (10 < 20)
    expect(blockA.transactions.map((t) => t.id)).toEqual(['tx1'])
    expect(blockA.rejectedTransactionHashes).toEqual(['tx2'])

    // Order B: tx2 passes (alice→carol:20, provisional 30), tx1 rejected (30 < 40)
    expect(blockB.transactions.map((t) => t.id)).toEqual(['tx2'])
    expect(blockB.rejectedTransactionHashes).toEqual(['tx1'])
  })

  it('increasing alice balance makes previously rejected transaction pass', () => {
    const richWorld: WorldState = {
      balances: { alice: 200n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0 },
    }

    const withOriginal = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const withMore = generateBlockFormationScenario(PARTIAL_TXS, richWorld)

    const blockOrig = withOriginal.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent
    const blockRich = withMore.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['block'] as BlockContent

    expect(blockOrig.rejectedTransactionHashes).toContain('tx2')
    expect(blockRich.rejectedTransactionHashes).not.toContain('tx2')
  })
})

// ---------------------------------------------------------------------------
// Replay safety: committed balance cannot be applied twice
// ---------------------------------------------------------------------------

describe('replay safety', () => {
  it('steppping PREVIOUS and NEXT through the commit step does not duplicate balance changes', () => {
    // Balance changes live in pre-computed txStateChanges.block, not in the
    // XState machine. The machine only moves stepIndex — it never re-runs
    // validateProposal or reapplies deltas. This test verifies that the
    // finalWorldState embedded in the ValidationOutcome is identical on each
    // forward pass through the stateful-validation step.
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    const sfIndex = scenario.steps.findIndex((s) => s.componentId === 'stateful-validation')

    // Advance to stateful-validation step
    for (let i = 0; i <= sfIndex; i++) {
      actor.send({ type: 'NEXT' })
    }
    const step1 = selectCurrentStep(actor.getSnapshot().context)
    const outcome1 = step1?.txStateChanges?.['validationOutcome'] as ValidationOutcome

    // Go back one and forward again
    actor.send({ type: 'PREVIOUS' })
    actor.send({ type: 'NEXT' })
    const step2 = selectCurrentStep(actor.getSnapshot().context)
    const outcome2 = step2?.txStateChanges?.['validationOutcome'] as ValidationOutcome

    // Both passes return the same pre-computed object — no re-calculation
    expect(outcome1).toBe(outcome2)
    expect(Object.fromEntries(Object.entries(outcome1.finalWorldState.balances))).toEqual(
      Object.fromEntries(Object.entries(outcome2.finalWorldState.balances)),
    )
  })
})

// ---------------------------------------------------------------------------
// Scenario metadata reflects validation outcome
// ---------------------------------------------------------------------------

describe('scenario metadata', () => {
  it('category is "success" when all transactions pass', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    expect(scenario.category).toBe('success')
  })

  it('category is "other" when any transaction is rejected', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    expect(scenario.category).toBe('other')
  })

  it('transactions field on scenario equals the input transactions', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    expect(scenario.transactions).toBe(PARTIAL_TXS)
  })
})
