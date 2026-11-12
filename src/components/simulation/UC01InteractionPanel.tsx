import type { ScenarioStep } from '../../engine/types'
import type { SimulationEvent } from '../../engine/simulationMachine'

// ---------------------------------------------------------------------------
// Local types — mirror the engine's output schema (SerializedValidationOutcome,
// BlockContent) but are defined here to keep the prototype independent of the
// execution engine. Replace with engine imports when connecting.
// ---------------------------------------------------------------------------

interface TxEntry {
  id: string
  from: string
  to: string
  asset: string
  amount: string
}

interface ValidationResult {
  txId: string
  status: 'VALID' | 'REJECTED'
  reason?: string
  senderProvisionalBalance: string
}

interface ValidationOutcomeData {
  results: ValidationResult[]
  validTxIds: string[]
  rejectedTxIds: string[]
  finalWorldState: {
    balances: Record<string, string>
    accounts: string[]
    assets: Record<string, number>
  }
}

interface BlockData {
  height: number
  prevBlockHash: string
  createdTime: number
  transactions: TxEntry[]
  rejectedTransactionIds: string[]
}

interface ConsensusOutcomeData {
  result: string
  blockHeight: number
  assumed: boolean
}

// ---------------------------------------------------------------------------
// Step-specific inspectors
// ---------------------------------------------------------------------------

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

function TransitInspector({ transactions }: { transactions: readonly TxEntry[] }) {
  return (
    <div className="panel-flat p-3">
      <p className="label-mono">Transactions in transit</p>
      <ul className="mt-2 space-y-1.5">
        {transactions.map((tx) => (
          <li key={tx.id} className="font-mono text-xs text-ink">
            <span className="text-muted-copy">{tx.id}</span>{' '}
            {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProposalInspector({ proposal }: { proposal: { transactions: TxEntry[] } }) {
  return (
    <div className="panel-flat p-3">
      <p className="label-mono">Proposal contents — {proposal.transactions.length} transactions</p>
      <ul className="mt-2 space-y-1.5">
        {proposal.transactions.map((tx) => (
          <li key={tx.id} className="flex items-baseline gap-2 font-mono text-xs text-ink">
            <span className="text-muted-copy w-8 shrink-0">{tx.id}</span>
            <span>
              {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
            </span>
            <span
              className="label-mono ml-auto shrink-0 rounded px-1.5 py-0.5"
              style={{ background: 'var(--color-purple-soft)' }}
            >
              In Proposal
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ValidationInspector({
  outcome,
  transactions,
}: {
  outcome: ValidationOutcomeData
  transactions: readonly TxEntry[]
}) {
  const txById = new Map(transactions.map((tx) => [tx.id, tx]))

  return (
    <div className="panel-flat p-3">
      <p className="label-mono">Stateful validation — sequential WSV check</p>
      <ul className="mt-2 space-y-2">
        {outcome.results.map((result) => {
          const tx = txById.get(result.txId)
          const isValid = result.status === 'VALID'
          return (
            <li key={result.txId} className="text-xs">
              <div className="flex items-baseline gap-2 font-mono text-ink">
                <span className="text-muted-copy w-8 shrink-0">{result.txId}</span>
                {tx && (
                  <span>
                    {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
                  </span>
                )}
                <span
                  className="label-mono ml-auto shrink-0 rounded px-1.5 py-0.5"
                  style={{
                    background: isValid ? 'var(--color-green-soft)' : 'rgba(217, 74, 74, 0.12)',
                    color: isValid ? 'var(--color-green-accent)' : 'var(--color-transaction-red)',
                  }}
                >
                  {isValid ? '✓ VALID' : '✕ REJECTED'}
                </span>
              </div>
              {!isValid && result.reason && (
                <p className="mt-0.5 pl-10 font-mono text-muted-copy" style={{ color: 'var(--color-transaction-red)' }}>
                  {result.reason.replace(/_/g, ' ')}
                </p>
              )}
              <p className="mt-0.5 pl-10 font-mono text-muted-copy">
                {capitalize(tx?.from ?? result.txId)} provisional balance after: {result.senderProvisionalBalance}{' '}
                {tx?.asset}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-copy">
        Each passing transaction&rsquo;s balance delta is applied to the provisional WSV before the next transaction
        is checked.
      </p>
    </div>
  )
}

function VerifiedProposalInspector({
  verifiedProposal,
  outcome,
  transactions,
}: {
  verifiedProposal: { validTxIds: string[]; rejectedTxIds: string[] }
  outcome: ValidationOutcomeData | undefined
  transactions: readonly TxEntry[]
}) {
  const txById = new Map(transactions.map((tx) => [tx.id, tx]))
  const reasonById = new Map(outcome?.results.map((r) => [r.txId, r.reason]) ?? [])

  return (
    <div className="panel-flat p-3">
      <p className="label-mono">Verified Proposal — {verifiedProposal.validTxIds.length} included</p>
      <ul className="mt-2 space-y-2">
        {verifiedProposal.validTxIds.map((txId) => {
          const tx = txById.get(txId)
          return (
            <li key={txId} className="flex items-baseline gap-2 font-mono text-xs text-ink">
              <span className="text-muted-copy w-8 shrink-0">{txId}</span>
              {tx && (
                <span>
                  {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
                </span>
              )}
              <span
                className="label-mono ml-auto shrink-0 rounded px-1.5 py-0.5"
                style={{ background: 'var(--color-green-soft)', color: 'var(--color-green-accent)' }}
              >
                Included
              </span>
            </li>
          )
        })}
        {verifiedProposal.rejectedTxIds.map((txId) => {
          const tx = txById.get(txId)
          const reason = reasonById.get(txId)
          return (
            <li key={txId} className="font-mono text-xs" style={{ color: 'var(--color-transaction-red)' }}>
              <div className="flex items-baseline gap-2">
                <span className="w-8 shrink-0 opacity-60">{txId}</span>
                {tx && (
                  <span className="line-through opacity-60">
                    {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
                  </span>
                )}
                <span
                  className="label-mono ml-auto shrink-0 rounded px-1.5 py-0.5"
                  style={{ background: 'rgba(217, 74, 74, 0.12)' }}
                >
                  Excluded
                </span>
              </div>
              {reason && (
                <p className="mt-0.5 pl-10 opacity-80">{reason.replace(/_/g, ' ')}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function BlockInspector({ block, label }: { block: BlockData; label: string }) {
  return (
    <div className="panel-flat p-3">
      <p className="label-mono">{label}</p>
      <div className="mt-1.5 font-mono text-xs text-muted-copy">
        <span>height: {block.height}</span>
        <span className="ml-3">prev: {block.prevBlockHash}</span>
      </div>
      {block.transactions.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-semibold text-ink">
            Committed transactions ({block.transactions.length})
          </p>
          <ul className="mt-1 space-y-1">
            {block.transactions.map((tx) => (
              <li key={tx.id} className="flex items-baseline gap-2 font-mono text-xs text-ink">
                <span className="text-muted-copy w-8 shrink-0">{tx.id}</span>
                <span>
                  {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 font-mono text-xs text-muted-copy">No committed transactions.</p>
      )}
      {block.rejectedTransactionIds.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-semibold" style={{ color: 'var(--color-transaction-red)' }}>
            Rejected hashes ({block.rejectedTransactionIds.length})
          </p>
          <ul className="mt-1 space-y-0.5">
            {block.rejectedTransactionIds.map((id) => (
              <li key={id} className="font-mono text-xs" style={{ color: 'var(--color-transaction-red)' }}>
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ConsensusInspector({ outcome }: { outcome: ConsensusOutcomeData }) {
  return (
    <div className="panel-flat border-dashed p-3">
      <div className="flex items-center gap-2">
        <span className="text-base">⚠</span>
        <p className="label-mono">YAC Consensus — Assumed (not simulated)</p>
      </div>
      <p className="mt-2 text-xs text-muted-copy">
        Peers vote on candidate block #{outcome.blockHeight} via the YAC protocol. The vote outcome is assumed to
        succeed — the YAC algorithm is not simulated in this prototype.
      </p>
      <p
        className="mt-2 label-mono rounded px-2 py-1 text-center"
        style={{ background: 'var(--color-green-soft)', color: 'var(--color-green-accent)' }}
      >
        result: {outcome.result}
      </p>
    </div>
  )
}

function WorldStateInspector({ balances, asset }: { balances: Record<string, string>; asset: string }) {
  return (
    <div className="panel-flat p-3" style={{ background: 'var(--color-green-soft)' }}>
      <p className="label-mono" style={{ color: 'var(--color-green-accent)' }}>
        World State View — final balances
      </p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {Object.entries(balances).map(([account, balance]) => (
          <div key={account}>
            <p className="text-sm font-semibold text-ink">{capitalize(account)}</p>
            <p className="font-mono text-xs text-ink">
              {asset} balance: {balance}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface UC01InteractionPanelProps {
  transactions: readonly TxEntry[]
  scenarioName: string
  isSimulationOpen: boolean
  onStart: () => void
  onReset: () => void
  send: (event: SimulationEvent) => void
  currentStep: ScenarioStep | undefined
  currentStepIndex: number
  narrationHistory: ScenarioStep[]
  accumulatedChanges: Record<string, unknown>
  isComplete: boolean
  isPlaying: boolean
  isAtStart: boolean
}

export function UC01InteractionPanel({
  transactions,
  scenarioName,
  isSimulationOpen,
  onStart,
  onReset,
  send,
  currentStep,
  currentStepIndex,
  narrationHistory,
  accumulatedChanges,
  isComplete,
  isPlaying,
  isAtStart,
}: UC01InteractionPanelProps) {
  const totalSteps = 11

  // Cast accumulated change data to typed shapes.
  const proposal = accumulatedChanges.proposal as { transactions: TxEntry[] } | undefined
  const validationOutcome = accumulatedChanges.validationOutcome as ValidationOutcomeData | undefined
  const verifiedProposal = accumulatedChanges.verifiedProposal as
    | { validTxIds: string[]; rejectedTxIds: string[] }
    | undefined
  const candidateBlock = accumulatedChanges.candidateBlock as BlockData | undefined
  const consensusOutcome = accumulatedChanges.consensusOutcome as ConsensusOutcomeData | undefined
  const committedBlock = accumulatedChanges.committedBlock as BlockData | undefined

  const componentId = currentStep?.componentId

  function renderInspector() {
    if (!currentStep) return null

    if (componentId === 'proposal' && proposal) {
      return <ProposalInspector proposal={proposal} />
    }
    if (componentId === 'stateful-validation' && validationOutcome) {
      return <ValidationInspector outcome={validationOutcome} transactions={transactions} />
    }
    if (componentId === 'verified-proposal' && verifiedProposal) {
      return (
        <VerifiedProposalInspector
          verifiedProposal={verifiedProposal}
          outcome={validationOutcome}
          transactions={transactions}
        />
      )
    }
    if (componentId === 'block-creator' && candidateBlock) {
      return <BlockInspector block={candidateBlock} label="Candidate Block — awaiting consensus" />
    }
    if (componentId === 'yac-consensus' && consensusOutcome) {
      return <ConsensusInspector outcome={consensusOutcome} />
    }
    if (componentId === 'commit' && committedBlock) {
      return (
        <div className="flex flex-col gap-3">
          <BlockInspector block={committedBlock} label="Committed Block #1" />
          {committedBlock.transactions[0] && (
            <WorldStateInspector
              balances={
                (accumulatedChanges.validationOutcome as ValidationOutcomeData | undefined)?.finalWorldState
                  ?.balances ?? {}
              }
              asset={committedBlock.transactions[0].asset}
            />
          )}
        </div>
      )
    }

    // Steps 1–5: transactions in transit
    return <TransitInspector transactions={transactions} />
  }

  return (
    <section aria-label="Interaction" className="panel flex h-full flex-col gap-5 overflow-y-auto p-5">
      <div>
        <p className="label-mono">Interaction</p>
        <h2 className="heading-serif mt-1 text-lg font-semibold">{scenarioName}</h2>
      </div>

      {/* Transaction summary */}
      <div aria-label="Transaction summary" className="panel-flat p-3">
        <p className="label-mono">Submitted transactions</p>
        <ul className="mt-1.5 space-y-1">
          {transactions.map((tx) => (
            <li key={tx.id} className="font-mono text-xs text-ink">
              <span className="text-muted-copy">{tx.id}</span>{' '}
              {capitalize(tx.from)} &rarr; {capitalize(tx.to)} &middot; {tx.amount} {tx.asset}
            </li>
          ))}
        </ul>
      </div>

      {!isSimulationOpen && (
        <div className="panel-flat flex flex-col gap-3 p-4" style={{ background: 'var(--color-purple-soft)' }}>
          <p className="text-sm text-ink">
            3 transactions ready for submission to the Iroha pipeline. Step through each stage of the Iroha v1
            transaction lifecycle to see how the proposal is validated and committed.
          </p>
          <p className="label-mono text-xs text-muted-copy">[PLACEHOLDER — engine integration pending]</p>
          <button type="button" onClick={onStart} className="btn-accent self-start">
            Start simulation
          </button>
        </div>
      )}

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
            Step {Math.max(currentStepIndex + 1, 0)} of {totalSteps}
          </p>

          <div aria-live="polite" aria-label="Current step" className="heading-serif text-base">
            {currentStep ? currentStep.narration : 'Press Next or Play to begin the scenario.'}
          </div>

          {/* Step-specific inspector */}
          {renderInspector()}

          {/* Process log */}
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

          {isComplete && (
            <button type="button" onClick={onReset} className="btn-outline self-start">
              Start over
            </button>
          )}
        </>
      )}
    </section>
  )
}
