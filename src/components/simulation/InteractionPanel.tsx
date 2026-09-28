import { useState } from 'react'
import type { FlattenedStateChange } from '../../engine/txStateChange'
import type { Scenario, ScenarioStep } from '../../engine/types'
import type { SimulationEvent } from '../../engine/simulationMachine'

interface InteractionPanelProps {
  scenario: Scenario
  isSimulationOpen: boolean
  onSend: () => void
  onMakeAnotherTransaction: () => void
  send: (event: SimulationEvent) => void
  currentStep: ScenarioStep | undefined
  currentStepIndex: number
  narrationHistory: ScenarioStep[]
  stateChanges: FlattenedStateChange[]
  isComplete: boolean
  isPlaying: boolean
  isAtStart: boolean
  /** Plain-language status mapped from the current scenario step (e.g. "Ordered", "Committed"). */
  transactionStatus: string
  /** True while the active step is Stateful Validation, so the educational balance check can be shown. */
  showStatefulValidationCheck: boolean
  /** The sender's demonstration balance as of just before this transaction run. */
  currentFromBalance: number
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

function StickFigure({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 24 32" className="h-8 w-6 text-ink" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="6" r="4.4" />
        <path d="M12 10.4V22M5 30l7-8 7 8M4 17l8 3 8-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="label-mono">{label}</span>
    </div>
  )
}

export function InteractionPanel({
  scenario,
  isSimulationOpen,
  onSend,
  onMakeAnotherTransaction,
  send,
  currentStep,
  currentStepIndex,
  narrationHistory,
  stateChanges,
  isComplete,
  isPlaying,
  isAtStart,
  transactionStatus,
  showStatefulValidationCheck,
  currentFromBalance,
}: InteractionPanelProps) {
  const [hasStartedDialogue, setHasStartedDialogue] = useState(false)
  const { from, to, amount, asset } = scenario.initialTx
  const fromName = capitalize(from)
  const toName = capitalize(to)
  const sufficientFunds = currentFromBalance >= amount

  const handleMakeAnotherTransaction = () => {
    setHasStartedDialogue(false)
    onMakeAnotherTransaction()
  }

  return (
    <section aria-label="Interaction" className="panel flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <p className="label-mono">Interaction</p>
        <h2 className="heading-serif mt-1 text-lg font-semibold">{scenario.name}</h2>
      </div>

      <div aria-label="Transaction summary" className="panel-flat p-3">
        <p className="label-mono">Transaction</p>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs text-ink">
          <dt className="text-muted-copy">From</dt>
          <dd>{fromName}</dd>
          <dt className="text-muted-copy">To</dt>
          <dd>{toName}</dd>
          <dt className="text-muted-copy">Asset</dt>
          <dd>{asset}</dd>
          <dt className="text-muted-copy">Amount</dt>
          <dd>{amount}</dd>
          <dt className="text-muted-copy">Status</dt>
          <dd className="font-semibold">{transactionStatus}</dd>
        </dl>
      </div>

      <div aria-label="Alice and Bob interaction" className="panel-flat flex flex-col gap-3 bg-purple-soft p-4">
        <div className="flex items-center justify-between px-2">
          <StickFigure label={fromName} />
          <StickFigure label={toName} />
        </div>

        {!isSimulationOpen && !hasStartedDialogue && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              {fromName}: &ldquo;I want to send {amount} {asset} to {toName}.&rdquo;
            </p>
            <button type="button" onClick={() => setHasStartedDialogue(true)} className="btn-accent self-start">
              Start
            </button>
          </div>
        )}

        {!isSimulationOpen && hasStartedDialogue && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">Ready to submit {fromName}&rsquo;s transaction.</p>
            <button type="button" onClick={onSend} className="btn-accent self-start">
              Send {amount} {asset}
            </button>
          </div>
        )}

        {isSimulationOpen && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              {isComplete ? (
                <>
                  {toName}: &ldquo;Received {amount} {asset}.&rdquo;
                </>
              ) : (
                'Wait for the confirmation…'
              )}
            </p>
            {isComplete && (
              <button type="button" onClick={handleMakeAnotherTransaction} className="btn-accent self-start">
                Make another transaction
              </button>
            )}
          </div>
        )}
      </div>

      {isSimulationOpen && (
        <>
          <div role="group" aria-label="Simulation controls" className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => send({ type: 'RESET' })}
              disabled={isAtStart && !isPlaying}
              className="btn-outline"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => send({ type: 'PREVIOUS' })}
              disabled={isAtStart || isPlaying}
              className="btn-outline"
            >
              Previous
            </button>
            {isPlaying ? (
              <button type="button" onClick={() => send({ type: 'PAUSE' })} className="btn-outline">
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send({ type: 'PLAY' })}
                disabled={isComplete}
                className="btn-outline"
              >
                Play
              </button>
            )}
            <button
              type="button"
              onClick={() => send({ type: 'NEXT' })}
              disabled={isComplete || isPlaying}
              className="btn-outline"
            >
              Next
            </button>
          </div>

          <p className="label-mono">
            Step {Math.max(currentStepIndex + 1, 0)} of {scenario.steps.length}
          </p>

          <div aria-live="polite" aria-label="Current step" className="heading-serif text-base">
            {currentStep ? currentStep.narration : 'Press Next or Play to begin the scenario.'}
          </div>

          {showStatefulValidationCheck && (
            <div aria-label="Stateful validation checks" className="panel-flat border-dashed p-3">
              <p className="label-mono">Stateful validation checks</p>
              <ul className="mt-1.5 space-y-0.5 text-sm text-ink">
                <li>✓ {fromName} exists</li>
                <li>✓ {toName} exists</li>
                <li>✓ {asset} asset exists</li>
                <li>
                  {sufficientFunds ? '✓' : '✕'} {fromName} has sufficient {asset} to transfer {amount}
                </li>
              </ul>
              <div className="mt-2 space-y-0.5 border-t border-ink pt-2 font-mono text-xs text-ink">
                <p>
                  Current {fromName} balance: {currentFromBalance}
                </p>
                <p>
                  Transfer amount: {amount} {asset}
                </p>
                <p className="font-semibold">Result: {sufficientFunds ? 'sufficient funds' : 'insufficient funds'}</p>
              </div>
            </div>
          )}

          <div>
            <p className="label-mono">Process log</p>
            <ol
              aria-label="Narration history"
              className="mt-1 max-h-36 list-inside list-decimal space-y-1 overflow-y-auto rounded-lg border-2 border-ink bg-surface p-2 text-sm text-muted-copy"
            >
              {narrationHistory.map((step) => (
                <li
                  key={step.id}
                  aria-current={step.id === currentStep?.id ? 'step' : undefined}
                  className="aria-[current=step]:font-semibold aria-[current=step]:text-ink"
                >
                  {step.narration}
                </li>
              ))}
            </ol>
          </div>

          {stateChanges.length > 0 && (
            <div aria-label="Transaction state">
              <p className="label-mono">Transaction state</p>
              <ul className="mt-1 list-inside list-disc font-mono text-xs text-ink">
                {stateChanges.map((entry) => (
                  <li key={entry.path}>
                    {entry.path}: {entry.value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  )
}
