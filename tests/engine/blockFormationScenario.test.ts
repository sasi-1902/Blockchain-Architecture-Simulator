import { createActor } from 'xstate'
import { describe, expect, it } from 'vitest'
import { generateBlockFormationScenario } from '../../src/architectures/iroha1/scenarios/blockFormation'
import type { ScenarioConfig } from '../../src/architectures/iroha1/scenarios/blockFormation'
import { serializeValidationOutcome, validateProposal } from '../../src/engine/blockFormation'
import type {
  BlockContent,
  SerializedValidationOutcome,
  TransactionSpec,
  WorldState,
} from '../../src/engine/blockFormation'
import {
  createSimulationMachine,
  selectAppliedTxStateChanges,
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

describe('UC-01-I-02: stateful-validation step carries serialized ValidationOutcome', () => {
  it('the validationOutcome in txStateChanges is a JSON-safe serialized form', () => {
    // txStateChanges stores SerializedValidationOutcome (bigint → string) not raw bigints.
    const rawOutcome = validateProposal(PARTIAL_TXS, WORLD)
    const expected: SerializedValidationOutcome = serializeValidationOutcome(
      rawOutcome,
      PARTIAL_TXS,
      WORLD.assets,
    )
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)

    const sfStep = scenario.steps.find((s) => s.componentId === 'stateful-validation')
    expect(sfStep).toBeDefined()

    const outcome = sfStep?.txStateChanges?.['validationOutcome'] as SerializedValidationOutcome
    expect(outcome.validTxIds).toEqual(expected.validTxIds)
    expect(outcome.rejectedTxIds).toEqual(expected.rejectedTxIds)
    expect(outcome.results).toHaveLength(expected.results.length)

    for (let i = 0; i < expected.results.length; i++) {
      expect(outcome.results[i].txId).toBe(expected.results[i].txId)
      expect(outcome.results[i].status).toBe(expected.results[i].status)
      expect(outcome.results[i].reason).toBe(expected.results[i].reason)
      // senderProvisionalBalance is now a formatted decimal string, not a bigint
      expect(typeof outcome.results[i].senderProvisionalBalance).toBe('string')
      expect(outcome.results[i].senderProvisionalBalance).toBe(
        expected.results[i].senderProvisionalBalance,
      )
    }

    // JSON.stringify must not throw — no raw bigints remain
    expect(() => JSON.stringify(outcome)).not.toThrow()
  })

  it('serialized balance values match expected decimal strings (WORLD has precision=0)', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const sfStep = scenario.steps.find((s) => s.componentId === 'stateful-validation')
    const outcome = sfStep?.txStateChanges?.['validationOutcome'] as SerializedValidationOutcome

    // tx1: alice→bob:30; alice provisional 100-30=70
    expect(outcome.results[0]).toMatchObject({ txId: 'tx1', status: 'VALID', senderProvisionalBalance: '70' })
    // tx2: alice→carol:90 REJECTED; alice provisional stays 70
    expect(outcome.results[1]).toMatchObject({ txId: 'tx2', status: 'REJECTED', reason: 'INSUFFICIENT_BALANCE', senderProvisionalBalance: '70' })
    // tx3: bob→alice:10; bob provisional 50-10=40
    expect(outcome.results[2]).toMatchObject({ txId: 'tx3', status: 'VALID', senderProvisionalBalance: '40' })

    expect(outcome.finalWorldState.balances['alice']).toBe('80')
    expect(outcome.finalWorldState.balances['bob']).toBe('40')
    expect(outcome.finalWorldState.balances['carol']).toBe('30')
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-03: Commit step carries the BlockContent
// ---------------------------------------------------------------------------

describe('UC-01-I-03: commit step carries committedBlock (BlockContent)', () => {
  it('all-pass: committedBlock.transactions contains all txs, rejectedHashes is empty', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block.transactions.map((t) => t.id)).toEqual(['tx1', 'tx2'])
    expect(block.rejectedTransactionIds).toEqual([])
  })

  it('partial: committedBlock.transactions has valid txs; rejectedTransactionIds has rejected ids', () => {
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block.transactions.map((t) => t.id)).toEqual(['tx1', 'tx3'])
    expect(block.rejectedTransactionIds).toEqual(['tx2'])
  })

  it('all-rejected: committedBlock.transactions is empty; all ids are in rejectedTransactionIds', () => {
    const scenario = generateBlockFormationScenario(ALL_REJECT_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')
    const block = commitStep?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block.transactions).toHaveLength(0)
    expect(block.rejectedTransactionIds).toEqual(['tx1', 'tx2'])
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

    const block1 = s1.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent
    const block2 = s2.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block1.transactions.map((t) => t.id)).toEqual(block2.transactions.map((t) => t.id))
    expect(block1.rejectedTransactionIds).toEqual(block2.rejectedTransactionIds)
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

    const blockA = orderA.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent
    const blockB = orderB.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent

    // Order A: tx1 passes (alice→bob:40, provisional 10), tx2 rejected (10 < 20)
    expect(blockA.transactions.map((t) => t.id)).toEqual(['tx1'])
    expect(blockA.rejectedTransactionIds).toEqual(['tx2'])

    // Order B: tx2 passes (alice→carol:20, provisional 30), tx1 rejected (30 < 40)
    expect(blockB.transactions.map((t) => t.id)).toEqual(['tx2'])
    expect(blockB.rejectedTransactionIds).toEqual(['tx1'])
  })

  it('increasing alice balance makes previously rejected transaction pass', () => {
    const richWorld: WorldState = {
      balances: { alice: 200n },
      accounts: new Set(['alice', 'bob', 'carol']),
      assets: { USD: 0 },
    }

    const withOriginal = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const withMore = generateBlockFormationScenario(PARTIAL_TXS, richWorld)

    const blockOrig = withOriginal.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent
    const blockRich = withMore.steps.find((s) => s.componentId === 'commit')?.txStateChanges?.['committedBlock'] as BlockContent

    expect(blockOrig.rejectedTransactionIds).toContain('tx2')
    expect(blockRich.rejectedTransactionIds).not.toContain('tx2')
  })
})

// ---------------------------------------------------------------------------
// Replay safety: committed balance cannot be applied twice
// ---------------------------------------------------------------------------

describe('replay safety', () => {
  it('stepping PREVIOUS and NEXT through the stateful-validation step returns the identical pre-computed object', () => {
    // serializedOutcome is built once at scenario construction time.
    // The XState machine only moves stepIndex — it never re-serializes or recalculates.
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    const sfIndex = scenario.steps.findIndex((s) => s.componentId === 'stateful-validation')

    for (let i = 0; i <= sfIndex; i++) actor.send({ type: 'NEXT' })
    const step1 = selectCurrentStep(actor.getSnapshot().context)
    const outcome1 = step1?.txStateChanges?.['validationOutcome'] as SerializedValidationOutcome

    actor.send({ type: 'PREVIOUS' })
    actor.send({ type: 'NEXT' })
    const step2 = selectCurrentStep(actor.getSnapshot().context)
    const outcome2 = step2?.txStateChanges?.['validationOutcome'] as SerializedValidationOutcome

    // Same object reference — no re-calculation possible
    expect(outcome1).toBe(outcome2)
    // Values remain identical across both visits
    expect(outcome1.finalWorldState.balances).toEqual(outcome2.finalWorldState.balances)
  })

  it('RESET then full replay produces identical selectAppliedTxStateChanges (no duplication)', () => {
    // selectAppliedTxStateChanges derives from steps[0..stepIndex] — it never accumulates
    // into mutable state. After RESET + replay, the same step objects are referenced again.
    const scenario = generateBlockFormationScenario(PARTIAL_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    // First complete run
    for (let i = 0; i < scenario.steps.length; i++) actor.send({ type: 'NEXT' })
    const changes1 = selectAppliedTxStateChanges(actor.getSnapshot().context)

    // RESET and replay
    actor.send({ type: 'RESET' })
    for (let i = 0; i < scenario.steps.length; i++) actor.send({ type: 'NEXT' })
    const changes2 = selectAppliedTxStateChanges(actor.getSnapshot().context)

    // Same number of changes — no duplication from the reset cycle
    expect(changes1).toHaveLength(changes2.length)
    // Each entry is the identical reference — the same step's txStateChanges object
    for (let i = 0; i < changes1.length; i++) {
      expect(changes1[i]).toBe(changes2[i])
    }
  })

  it('selectAppliedTxStateChanges shrinks on PREVIOUS and grows back on NEXT', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const actor = createActor(createSimulationMachine(scenario)).start()

    // Advance to step with txStateChanges (step-6 proposal is first step with one)
    const proposalIndex = scenario.steps.findIndex((s) => s.componentId === 'proposal')
    for (let i = 0; i <= proposalIndex; i++) actor.send({ type: 'NEXT' })
    const countAtProposal = selectAppliedTxStateChanges(actor.getSnapshot().context).length

    // Step forward to stateful-validation
    actor.send({ type: 'NEXT' })
    const countAtSf = selectAppliedTxStateChanges(actor.getSnapshot().context).length
    expect(countAtSf).toBe(countAtProposal + 1)

    // Step back — count must decrease
    actor.send({ type: 'PREVIOUS' })
    const countBack = selectAppliedTxStateChanges(actor.getSnapshot().context).length
    expect(countBack).toBe(countAtProposal)
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

// ---------------------------------------------------------------------------
// UC-01-I-06: Distinct candidate-block, consensus, and commit events
// ---------------------------------------------------------------------------

describe('UC-01-I-06: candidate-block, consensus-outcome, and committed-block are distinct', () => {
  it('block-creator step carries candidateBlock, not committedBlock', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const creatorStep = scenario.steps.find((s) => s.componentId === 'block-creator')

    expect(creatorStep?.txStateChanges).toHaveProperty('candidateBlock')
    expect(creatorStep?.txStateChanges).not.toHaveProperty('committedBlock')
    expect(creatorStep?.txStateChanges).not.toHaveProperty('consensusOutcome')
  })

  it('yac-consensus step carries consensusOutcome, not candidateBlock or committedBlock', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const consensusStep = scenario.steps.find((s) => s.componentId === 'yac-consensus')

    expect(consensusStep?.txStateChanges).toHaveProperty('consensusOutcome')
    expect(consensusStep?.txStateChanges).not.toHaveProperty('candidateBlock')
    expect(consensusStep?.txStateChanges).not.toHaveProperty('committedBlock')
  })

  it('commit step carries committedBlock, not candidateBlock', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')

    expect(commitStep?.txStateChanges).toHaveProperty('committedBlock')
    expect(commitStep?.txStateChanges).not.toHaveProperty('candidateBlock')
    expect(commitStep?.txStateChanges).not.toHaveProperty('consensusOutcome')
  })

  it('candidateBlock and committedBlock are distinct object references', () => {
    // Both carry the same payload but are separate objects — inspectors can
    // distinguish pre- and post-consensus state without ambiguity.
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const creatorStep = scenario.steps.find((s) => s.componentId === 'block-creator')
    const commitStep = scenario.steps.find((s) => s.componentId === 'commit')

    const candidateBlock = creatorStep?.txStateChanges?.['candidateBlock'] as BlockContent
    const committedBlock = commitStep?.txStateChanges?.['committedBlock'] as BlockContent

    expect(candidateBlock).not.toBe(committedBlock)
    expect(candidateBlock.transactions.map((t) => t.id)).toEqual(
      committedBlock.transactions.map((t) => t.id),
    )
  })

  it('consensusOutcome.result is "agreed", assumed=true, and blockHeight matches block height', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const consensusStep = scenario.steps.find((s) => s.componentId === 'yac-consensus')
    const consensus = consensusStep?.txStateChanges?.['consensusOutcome'] as {
      result: string
      blockHeight: number
      assumed: boolean
    }

    expect(consensus.result).toBe('agreed')
    expect(consensus.assumed).toBe(true)   // YAC is not simulated — consensus is assumed
    expect(typeof consensus.blockHeight).toBe('number')

    const committedBlock = scenario.steps.find((s) => s.componentId === 'commit')
      ?.txStateChanges?.['committedBlock'] as BlockContent
    expect(consensus.blockHeight).toBe(committedBlock.height)
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-07: ScenarioConfig — deterministic height and timestamps
// ---------------------------------------------------------------------------
// (tests for valid config inputs — invalid inputs tested in UC-01-I-08 below)
//

describe('UC-01-I-07: ScenarioConfig injection', () => {
  it('default config produces height=1, prevBlockHash="genesis", createdTime=0', () => {
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD)
    const block = scenario.steps.find((s) => s.componentId === 'commit')
      ?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block.height).toBe(1)
    expect(block.prevBlockHash).toBe('genesis')
    expect(block.createdTime).toBe(0)
  })

  it('chainHeight=4 produces block height 5', () => {
    const config: ScenarioConfig = { chainHeight: 4 }
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD, config)
    const block = scenario.steps.find((s) => s.componentId === 'commit')
      ?.txStateChanges?.['committedBlock'] as BlockContent

    expect(block.height).toBe(5)
  })

  it('prevBlockHash is reflected in both candidateBlock and committedBlock', () => {
    const config: ScenarioConfig = { prevBlockHash: 'abc123' }
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD, config)
    const candidate = scenario.steps.find((s) => s.componentId === 'block-creator')
      ?.txStateChanges?.['candidateBlock'] as BlockContent
    const committed = scenario.steps.find((s) => s.componentId === 'commit')
      ?.txStateChanges?.['committedBlock'] as BlockContent

    expect(candidate.prevBlockHash).toBe('abc123')
    expect(committed.prevBlockHash).toBe('abc123')
  })

  it('injected createdTime appears in candidateBlock and committedBlock', () => {
    const config: ScenarioConfig = { createdTime: 1700000000000 }
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD, config)
    const candidate = scenario.steps.find((s) => s.componentId === 'block-creator')
      ?.txStateChanges?.['candidateBlock'] as BlockContent
    const committed = scenario.steps.find((s) => s.componentId === 'commit')
      ?.txStateChanges?.['committedBlock'] as BlockContent

    expect(candidate.createdTime).toBe(1700000000000)
    expect(committed.createdTime).toBe(1700000000000)
  })

  it('consensusOutcome.blockHeight matches the injected chainHeight', () => {
    const config: ScenarioConfig = { chainHeight: 9 }
    const scenario = generateBlockFormationScenario(ALL_PASS_TXS, WORLD, config)
    const consensus = scenario.steps.find((s) => s.componentId === 'yac-consensus')
      ?.txStateChanges?.['consensusOutcome'] as { result: string; blockHeight: number }

    expect(consensus.blockHeight).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-08: ScenarioConfig input validation
// ---------------------------------------------------------------------------

describe('UC-01-I-08: ScenarioConfig input validation', () => {
  it('throws when chainHeight is negative', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, { chainHeight: -1 }),
    ).toThrow(/chainHeight/)
  })

  it('throws when chainHeight is a non-integer', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, { chainHeight: 1.5 }),
    ).toThrow(/chainHeight/)
  })

  it('throws when createdTime is negative', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, { createdTime: -1 }),
    ).toThrow(/createdTime/)
  })

  it('throws when createdTime is a non-integer', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, { createdTime: 1.5 }),
    ).toThrow(/createdTime/)
  })

  it('accepts chainHeight=0 and createdTime=0 as valid lower boundaries', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, { chainHeight: 0, createdTime: 0 }),
    ).not.toThrow()
  })

  it('accepts large valid integers for both fields', () => {
    expect(() =>
      generateBlockFormationScenario(ALL_PASS_TXS, WORLD, {
        chainHeight: 1_000_000,
        createdTime: 1_700_000_000_000,
      }),
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// UC-01-I-09: Empty proposal vs all-rejected — distinct narration
// ---------------------------------------------------------------------------

describe('UC-01-I-09: empty proposal narration is distinct from all-rejected narration', () => {
  it('step-7 narration for empty proposal mentions "No transactions were submitted"', () => {
    const emptyWorld: WorldState = {
      balances: {},
      accounts: new Set<string>(),
      assets: { USD: 0 },
    }
    const scenario = generateBlockFormationScenario([], emptyWorld)
    const sfStep = scenario.steps.find((s) => s.componentId === 'stateful-validation')
    expect(sfStep?.narration).toContain('No transactions were submitted')
  })

  it('step-7 narration for all-rejected mentions "fail stateful validation"', () => {
    const scenario = generateBlockFormationScenario(ALL_REJECT_TXS, WORLD)
    const sfStep = scenario.steps.find((s) => s.componentId === 'stateful-validation')
    expect(sfStep?.narration).toContain('fail stateful validation')
  })

  it('step-8 narration for empty proposal does not say "rejected"', () => {
    const emptyWorld: WorldState = {
      balances: {},
      accounts: new Set<string>(),
      assets: { USD: 0 },
    }
    const scenario = generateBlockFormationScenario([], emptyWorld)
    const vpStep = scenario.steps.find((s) => s.componentId === 'verified-proposal')
    expect(vpStep?.narration).toContain('no transactions were submitted')
    expect(vpStep?.narration).not.toContain('were rejected')
  })

  it('step-8 narration for all-rejected says "were rejected"', () => {
    const scenario = generateBlockFormationScenario(ALL_REJECT_TXS, WORLD)
    const vpStep = scenario.steps.find((s) => s.componentId === 'verified-proposal')
    expect(vpStep?.narration).toContain('were rejected')
  })
})
