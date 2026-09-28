import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActor } from 'xstate'
import {
  AUTOPLAY_DELAY_MS,
  createSimulationMachine,
  selectAppliedTxStateChanges,
  selectCurrentStep,
  selectIsComplete,
  selectNarrationHistory,
} from '../../src/engine/simulationMachine'
import type { Scenario } from '../../src/engine/types'

const testScenario: Scenario = {
  id: 'test-scenario',
  name: 'Test scenario',
  description: 'A minimal scenario used to test the generic simulation engine.',
  category: 'success',
  initialTx: { from: 'alice', to: 'bob', asset: 'USD', amount: 10 },
  steps: [
    { id: 'step-1', componentId: 'a', narration: 'First step.' },
    { id: 'step-2', componentId: 'b', narration: 'Second step.' },
    {
      id: 'step-3',
      componentId: 'c',
      narration: 'Third and final step.',
      txStateChanges: { worldStateView: { alice: -10, bob: 10 } },
    },
  ],
}

describe('scenario simulation machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in the initial state before any step has run', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    expect(selectCurrentStep(actor.getSnapshot().context)).toBeUndefined()
    expect(selectNarrationHistory(actor.getSnapshot().context)).toEqual([])
    expect(selectIsComplete(actor.getSnapshot().context)).toBe(false)
  })

  it('advances exactly one step per NEXT event', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-1')

    actor.send({ type: 'NEXT' })
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-2')
  })

  it('does not advance past the final step', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })

    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-3')
    expect(selectIsComplete(actor.getSnapshot().context)).toBe(true)
  })

  it('moves backward on PREVIOUS without going before the initial state', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    actor.send({ type: 'PREVIOUS' })
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-1')

    actor.send({ type: 'PREVIOUS' })
    actor.send({ type: 'PREVIOUS' })
    expect(selectCurrentStep(actor.getSnapshot().context)).toBeUndefined()
  })

  it('returns to the initial state on RESET', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    actor.send({ type: 'RESET' })

    expect(selectCurrentStep(actor.getSnapshot().context)).toBeUndefined()
    expect(selectNarrationHistory(actor.getSnapshot().context)).toEqual([])
  })

  it('accumulates narration history up to and including the current step', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })

    expect(selectNarrationHistory(actor.getSnapshot().context).map((step) => step.id)).toEqual([
      'step-1',
      'step-2',
    ])
  })

  it('exposes applied transaction state changes only once the relevant step is reached', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'NEXT' })
    actor.send({ type: 'NEXT' })
    expect(selectAppliedTxStateChanges(actor.getSnapshot().context)).toEqual([])

    actor.send({ type: 'NEXT' })
    expect(selectAppliedTxStateChanges(actor.getSnapshot().context)).toEqual([
      { worldStateView: { alice: -10, bob: 10 } },
    ])
  })

  it('automatically advances one step at a time while playing', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'PLAY' })
    expect(selectCurrentStep(actor.getSnapshot().context)).toBeUndefined()

    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-1')

    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-2')
  })

  it('stops autoplay without corrupting the current step when paused', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'PLAY' })
    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS)
    actor.send({ type: 'PAUSE' })

    const stepAtPause = selectCurrentStep(actor.getSnapshot().context)?.id
    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 3)

    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe(stepAtPause)
    expect(stepAtPause).toBe('step-1')
  })

  it('stops autoplay automatically once the final step is reached', () => {
    const actor = createActor(createSimulationMachine(testScenario)).start()

    actor.send({ type: 'PLAY' })
    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 10)

    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-3')
    expect(selectIsComplete(actor.getSnapshot().context)).toBe(true)

    vi.advanceTimersByTime(AUTOPLAY_DELAY_MS * 3)
    expect(selectCurrentStep(actor.getSnapshot().context)?.id).toBe('step-3')
  })
})
