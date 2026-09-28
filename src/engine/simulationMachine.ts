import { assign, setup } from 'xstate'
import type { Scenario, ScenarioStep } from './types'

export interface SimulationContext {
  scenario: Scenario
  stepIndex: number
}

export type SimulationEvent =
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'RESET' }
  | { type: 'PLAY' }
  | { type: 'PAUSE' }

export const AUTOPLAY_DELAY_MS = 1500

function clampStepIndex(scenario: Scenario, index: number): number {
  return Math.min(Math.max(index, -1), scenario.steps.length - 1)
}

export function createSimulationMachine(scenario: Scenario) {
  return setup({
    types: {} as {
      context: SimulationContext
      events: SimulationEvent
    },
    guards: {
      isAtLastStep: ({ context }) => context.stepIndex >= context.scenario.steps.length - 1,
    },
    actions: {
      goToNextStep: assign({
        stepIndex: ({ context }) => clampStepIndex(context.scenario, context.stepIndex + 1),
      }),
      goToPreviousStep: assign({
        stepIndex: ({ context }) => clampStepIndex(context.scenario, context.stepIndex - 1),
      }),
      resetStepIndex: assign({ stepIndex: -1 }),
    },
    delays: {
      autoplayDelay: AUTOPLAY_DELAY_MS,
    },
  }).createMachine({
    id: 'scenarioSimulation',
    context: { scenario, stepIndex: -1 },
    initial: 'paused',
    states: {
      paused: {
        on: {
          NEXT: { actions: 'goToNextStep' },
          PREVIOUS: { actions: 'goToPreviousStep' },
          RESET: { actions: 'resetStepIndex' },
          PLAY: [{ guard: 'isAtLastStep' }, { target: 'playing' }],
        },
      },
      playing: {
        always: { guard: 'isAtLastStep', target: 'paused' },
        after: {
          autoplayDelay: { actions: 'goToNextStep', target: 'playing', reenter: true },
        },
        on: {
          PAUSE: { target: 'paused' },
          RESET: { actions: 'resetStepIndex', target: 'paused' },
        },
      },
    },
  })
}

export function selectCurrentStep(context: SimulationContext): ScenarioStep | undefined {
  return context.stepIndex >= 0 ? context.scenario.steps[context.stepIndex] : undefined
}

export function selectNarrationHistory(context: SimulationContext): ScenarioStep[] {
  return context.scenario.steps.slice(0, context.stepIndex + 1)
}

export function selectAppliedTxStateChanges(context: SimulationContext): Record<string, unknown>[] {
  return selectNarrationHistory(context)
    .map((step) => step.txStateChanges)
    .filter((txStateChanges): txStateChanges is Record<string, unknown> => txStateChanges !== undefined)
}

export function selectIsComplete(context: SimulationContext): boolean {
  return context.stepIndex === context.scenario.steps.length - 1
}
