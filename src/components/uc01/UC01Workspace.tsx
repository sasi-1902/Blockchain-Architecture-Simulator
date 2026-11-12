/**
 * UC-01 Multi-Transaction Workspace — visual redesign
 *
 * Full-page layout matching the reference design:
 *   top bar  │ scenario tabs + playback controls + step counter
 *   sidebar  │ 11-step transaction lifecycle timeline
 *   canvas   │ horizontal pipeline visualization (Submitted → … → Committed)
 *   bottom   │ transaction list | inspector tabs (Validation / Event Log) | world state view
 *
 * Color rules (no green/red for status):
 *   - VALID:    neutral surface + ✓ icon
 *   - REJECTED: --color-yellow-soft + ✗ icon
 *   - Active pipeline stage: --color-yellow-soft bg + 3 px border
 *   - Current lifecycle step: --color-purple-soft bg + ► marker
 */

import { useState } from 'react'
import type { BlockchainArchitecture, Scenario, ScenarioStep } from '../../engine/types'
import type { SimulationEvent } from '../../engine/simulationMachine'

// ---------------------------------------------------------------------------
// Local types (mirror engine schema; replaced by real imports on integration)
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

interface ConsensusData {
  result: string
  blockHeight: number
  assumed: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cap(s: string) {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}


const LIFECYCLE_STEPS = [
  'Submit Transactions',
  'Stateless Validation',
  'Signature Quorum (MST)',
  'Route to Ordering',
  'Batch for Proposal',
  'Form Proposal',
  'Stateful Validation',
  'Verified Proposal',
  'Candidate Block',
  'YAC Consensus (Assumed)',
  'Commit Block',
]

// ---------------------------------------------------------------------------
// Badge components (no green/red)
// ---------------------------------------------------------------------------

function ValidBadge() {
  return (
    <span
      className="label-mono inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      style={{ background: 'var(--color-purple-soft)', fontSize: '0.6rem' }}
    >
      ✓ VALID
    </span>
  )
}

function RejectedBadge() {
  return (
    <span
      className="label-mono inline-flex items-center gap-1 rounded px-1.5 py-0.5"
      style={{ background: 'var(--color-yellow-soft)', fontSize: '0.6rem' }}
    >
      ✗ REJECTED
    </span>
  )
}

// ---------------------------------------------------------------------------
// Lifecycle sidebar
// ---------------------------------------------------------------------------

function LifecycleTimeline({
  currentStepIndex,
}: {
  currentStepIndex: number
}) {
  return (
    <aside
      className="flex w-44 shrink-0 flex-col gap-0 overflow-y-auto border-r-2 border-ink bg-surface px-3 py-4"
    >
      <p className="label-mono mb-3">Transaction Lifecycle</p>
      <ol className="flex flex-col gap-1">
        {LIFECYCLE_STEPS.map((label, i) => {
          const isCompleted = currentStepIndex >= i
          const isCurrent = currentStepIndex === i
          return (
            <li
              key={i}
              className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs"
              style={
                isCurrent
                  ? { background: 'var(--color-purple-soft)', fontWeight: 700 }
                  : { opacity: isCompleted ? 1 : 0.45 }
              }
            >
              <span
                className="mt-0.5 shrink-0 font-mono text-xs"
                style={{ width: '1.1rem', textAlign: 'center' }}
              >
                {isCurrent ? '►' : isCompleted ? '✓' : String(i + 1)}
              </span>
              <span style={{ color: isCurrent ? 'var(--color-ink)' : undefined }}>
                {label}
              </span>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Pipeline stage box
// ---------------------------------------------------------------------------

type StageStatus = 'active' | 'completed' | 'pending'

function PipelineBox({
  title,
  status,
  children,
}: {
  title: string
  status: StageStatus
  children: React.ReactNode
}) {
  const activeBg = 'var(--color-yellow-soft)'
  const completedBg = 'var(--color-surface)'
  const pendingBg = 'var(--color-background)'

  const bg = status === 'active' ? activeBg : status === 'completed' ? completedBg : pendingBg
  const borderWidth = status === 'active' ? 3 : 2
  const shadow = status === 'active' ? '4px 4px 0 0 var(--color-ink)' : '2px 2px 0 0 var(--color-ink)'
  const opacity = status === 'pending' ? 0.5 : 1

  return (
    <div
      className="flex min-w-[160px] max-w-[200px] shrink-0 flex-col gap-1.5 rounded-2xl p-3"
      style={{
        background: bg,
        border: `${borderWidth}px solid var(--color-ink)`,
        boxShadow: shadow,
        opacity,
      }}
    >
      <p
        className="label-mono"
        style={{ color: status === 'active' ? 'var(--color-ink)' : 'var(--color-muted)' }}
      >
        {title}
      </p>
      <div className="flex flex-col gap-1 font-mono text-[0.65rem] text-ink">{children}</div>
    </div>
  )
}

function Arrow() {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 self-center font-mono text-lg"
      style={{ color: 'var(--color-muted)', lineHeight: 1 }}
    >
      →
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pipeline canvas
// ---------------------------------------------------------------------------

function PipelineCanvas({
  transactions,
  currentStepIndex,
  accumulatedChanges,
}: {
  transactions: readonly TxEntry[]
  currentStepIndex: number
  accumulatedChanges: Record<string, unknown>
}) {
  function stageStatus(stageIndex: number): StageStatus {
    if (currentStepIndex < 0) return 'pending'
    if (currentStepIndex === stageIndex) return 'active'
    if (currentStepIndex > stageIndex) return 'completed'
    return 'pending'
  }

  const proposal = accumulatedChanges.proposal as { transactions: TxEntry[] } | undefined
  const validationOutcome = accumulatedChanges.validationOutcome as ValidationOutcomeData | undefined
  const verifiedProposal = accumulatedChanges.verifiedProposal as
    | { validTxIds: string[]; rejectedTxIds: string[] }
    | undefined
  const candidateBlock = accumulatedChanges.candidateBlock as BlockData | undefined
  const consensusOutcome = accumulatedChanges.consensusOutcome as ConsensusData | undefined
  const committedBlock = accumulatedChanges.committedBlock as BlockData | undefined

  // Derive valid/rejected from whichever data is available.
  const validIds: string[] = verifiedProposal?.validTxIds ?? validationOutcome?.validTxIds ?? []
  const rejectedIds: string[] = verifiedProposal?.rejectedTxIds ?? validationOutcome?.rejectedTxIds ?? []
  const hasValidationData = validationOutcome !== undefined

  // Which stage index is "active" right now.
  const activeStage = currentStepIndex

  return (
    <div className="flex flex-col gap-3">
      {/* Main pipeline row */}
      <div className="flex items-start gap-2 overflow-x-auto pb-2">
        {/* Stage 0: Submitted Transactions — always visible */}
        <PipelineBox title="Submitted Transactions" status={stageStatus(0)}>
          {transactions.map((tx) => {
            const isValid = hasValidationData && validIds.includes(tx.id)
            const isRejected = hasValidationData && rejectedIds.includes(tx.id)
            return (
              <div
                key={tx.id}
                className="flex items-center gap-1.5 rounded px-1 py-0.5"
                style={
                  isRejected ? { background: 'var(--color-yellow-soft)' } : undefined
                }
              >
                <span className="text-muted-copy">{tx.id}</span>
                <span>
                  {cap(tx.from)}→{cap(tx.to)}
                </span>
                <span className="ml-auto shrink-0">
                  {isValid ? '✓' : isRejected ? '✗' : '·'}
                </span>
              </div>
            )
          })}
        </PipelineBox>

        <Arrow />

        {/* Stage 5: Proposal */}
        <PipelineBox title="Proposal" status={stageStatus(5)}>
          {proposal ? (
            proposal.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-1">
                <span className="text-muted-copy">+</span>
                <span>{tx.id}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-copy italic">— pending —</span>
          )}
          {proposal && (
            <span className="label-mono mt-0.5">{proposal.transactions.length} transactions</span>
          )}
        </PipelineBox>

        <Arrow />

        {/* Stage 6: Stateful Validation */}
        <PipelineBox
          title={`Stateful Validation${activeStage === 6 ? ' (WSV)' : ''}`}
          status={stageStatus(6)}
        >
          {validationOutcome ? (
            validationOutcome.results.map((r, i) => (
              <div
                key={r.txId}
                className="flex items-center gap-1 rounded px-1 py-0.5"
                style={r.status === 'REJECTED' ? { background: 'var(--color-yellow-soft)' } : undefined}
              >
                <span className="text-muted-copy">{i + 1}</span>
                <span className="font-semibold">{r.txId}</span>
                <span className="ml-auto">{r.status === 'VALID' ? '✓' : '✗'}</span>
              </div>
            ))
          ) : (
            <span className="text-muted-copy italic">— pending —</span>
          )}
        </PipelineBox>

        <Arrow />

        {/* Stage 7: Verified Proposal + inline Rejected */}
        <div className="flex shrink-0 flex-col gap-2">
          <PipelineBox title="Verified Proposal" status={stageStatus(7)}>
            {validIds.length > 0 ? (
              <>
                {validIds.map((id) => (
                  <div key={id} className="flex items-center gap-1">
                    <span>✓</span>
                    <span className="font-semibold">{id}</span>
                  </div>
                ))}
                <span className="label-mono mt-0.5">{validIds.length} included</span>
              </>
            ) : (
              <span className="text-muted-copy italic">— pending —</span>
            )}
          </PipelineBox>

          {rejectedIds.length > 0 && (
            <div
              className="flex min-w-[160px] flex-col gap-1 rounded-2xl p-3"
              style={{
                background: 'var(--color-yellow-soft)',
                border: '2px solid var(--color-ink)',
                boxShadow: '2px 2px 0 0 var(--color-ink)',
              }}
            >
              <p className="label-mono">Rejected Transactions ({rejectedIds.length})</p>
              {rejectedIds.map((id) => {
                const reason = validationOutcome?.results.find((r) => r.txId === id)?.reason
                return (
                  <div key={id} className="flex flex-col">
                    <div className="flex items-center gap-1 font-mono text-[0.65rem]">
                      <span>✗</span>
                      <span className="font-semibold">{id}</span>
                    </div>
                    {reason && (
                      <span
                        className="pl-3 font-mono text-[0.6rem]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {reason.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <Arrow />

        {/* Stage 8: Candidate Block */}
        <PipelineBox title="Candidate Block" status={stageStatus(8)}>
          {candidateBlock ? (
            <>
              <div className="text-muted-copy">
                h:{candidateBlock.height} prev:{candidateBlock.prevBlockHash}
              </div>
              {candidateBlock.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-1">
                  <span className="text-muted-copy">{tx.id}</span>
                  <span>
                    {cap(tx.from)}→{cap(tx.to)}
                  </span>
                </div>
              ))}
            </>
          ) : (
            <span className="text-muted-copy italic">— pending —</span>
          )}
        </PipelineBox>

        <Arrow />

        {/* Stage 9: YAC Consensus */}
        <PipelineBox title="YAC Consensus (Assumed)" status={stageStatus(9)}>
          {consensusOutcome ? (
            <>
              <div
                className="label-mono rounded px-1.5 py-0.5 text-center"
                style={{ background: 'var(--color-purple-soft)' }}
              >
                result: {consensusOutcome.result}
              </div>
              <span className="label-mono text-muted-copy">⚠ not simulated</span>
            </>
          ) : (
            <span className="text-muted-copy italic">— pending —</span>
          )}
        </PipelineBox>

        <Arrow />

        {/* Stage 10: Committed Block */}
        <PipelineBox title="Committed Block" status={stageStatus(10)}>
          {committedBlock ? (
            <>
              <div className="text-muted-copy">
                h:{committedBlock.height} prev:{committedBlock.prevBlockHash}
              </div>
              {committedBlock.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-1">
                  <span className="text-muted-copy">{tx.id}</span>
                  <span>
                    {cap(tx.from)}→{cap(tx.to)}
                  </span>
                </div>
              ))}
              <span className="label-mono mt-0.5">committed ✓</span>
            </>
          ) : (
            <span className="text-muted-copy italic">— pending —</span>
          )}
        </PipelineBox>
      </div>

      {/* Current step description strip */}
      {currentStepIndex >= 0 && (
        <div
          className="rounded-xl px-4 py-2 font-mono text-xs"
          style={{ background: 'var(--color-purple-soft)', border: '2px solid var(--color-ink)' }}
        >
          <span className="font-semibold">Step {currentStepIndex + 1}/11:</span>{' '}
          {LIFECYCLE_STEPS[currentStepIndex]}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Transaction list panel (bottom left)
// ---------------------------------------------------------------------------

function TransactionListPanel({
  transactions,
  validationOutcome,
}: {
  transactions: readonly TxEntry[]
  validationOutcome: ValidationOutcomeData | undefined
}) {
  const statusById = new Map(validationOutcome?.results.map((r) => [r.txId, r.status]) ?? [])

  return (
    <div className="flex w-56 shrink-0 flex-col gap-2 overflow-y-auto border-r-2 border-ink p-3">
      <p className="label-mono">Transactions ({transactions.length})</p>
      <ul className="flex flex-col gap-1.5">
        {transactions.map((tx) => {
          const status = statusById.get(tx.id)
          const isRejected = status === 'REJECTED'
          return (
            <li
              key={tx.id}
              className="flex flex-col gap-0.5 rounded-lg p-2"
              style={{
                background: isRejected ? 'var(--color-yellow-soft)' : 'var(--color-surface)',
                border: '2px solid var(--color-ink)',
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="label-mono">{tx.id}</span>
                {status === 'VALID' && <ValidBadge />}
                {status === 'REJECTED' && <RejectedBadge />}
              </div>
              <span className="font-mono text-xs text-ink">
                {cap(tx.from)} → {cap(tx.to)} · {tx.amount} {tx.asset}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inspector panel (bottom center) — tabbed
// ---------------------------------------------------------------------------

function ValidationTable({
  validationOutcome,
  transactions,
}: {
  validationOutcome: ValidationOutcomeData
  transactions: readonly TxEntry[]
}) {
  const txById = new Map(transactions.map((tx) => [tx.id, tx]))

  return (
    <div className="flex flex-col gap-2">
      <p className="heading-serif text-sm font-semibold">
        Stateful Validation — Sequential WSV Check
      </p>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="pb-1 pr-3 text-left label-mono">#</th>
              <th className="pb-1 pr-3 text-left label-mono">Tx</th>
              <th className="pb-1 pr-3 text-left label-mono">Result</th>
              <th className="pb-1 text-left label-mono">Provisional Balances (after tx)</th>
            </tr>
          </thead>
          <tbody>
            {validationOutcome.results.map((r, i) => {
              const tx = txById.get(r.txId)
              const isRejected = r.status === 'REJECTED'
              return (
                <tr
                  key={r.txId}
                  className="border-b border-ink/20"
                  style={isRejected ? { background: 'var(--color-yellow-soft)' } : undefined}
                >
                  <td className="py-1.5 pr-3 text-muted-copy">{i + 1}</td>
                  <td className="py-1.5 pr-3 font-semibold">{cap(r.txId)}</td>
                  <td className="py-1.5 pr-3">
                    {isRejected ? <RejectedBadge /> : <ValidBadge />}
                  </td>
                  <td className="py-1.5 text-ink">
                    {isRejected && r.reason ? (
                      <span style={{ color: 'var(--color-muted)' }}>
                        {r.reason.replace(/_/g, ' ').toLowerCase()}
                        {r.senderProvisionalBalance !== undefined &&
                          ` (available ${r.senderProvisionalBalance})`}
                      </span>
                    ) : (
                      <span>
                        {tx && `${cap(tx.from)}: `}
                        {`→ ${r.senderProvisionalBalance} ${tx?.asset ?? ''}`}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p
        className="rounded-lg px-3 py-2 font-mono text-xs"
        style={{ background: 'var(--color-purple-soft)' }}
      >
        ℹ Each transaction&rsquo;s balance delta is applied to the provisional WSV before the next
        transaction is checked.
      </p>
    </div>
  )
}

function InspectorPanel({
  currentStep,
  narrationHistory,
  validationOutcome,
  transactions,
  currentStepIndex,
}: {
  currentStep: ScenarioStep | undefined
  narrationHistory: ScenarioStep[]
  validationOutcome: ValidationOutcomeData | undefined
  transactions: readonly TxEntry[]
  currentStepIndex: number
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'log'>('details')

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 overflow-hidden p-3">
      {/* Tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('details')}
          className={activeTab === 'details' ? 'btn-accent' : 'btn-outline'}
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
        >
          Validation Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('log')}
          className={activeTab === 'log' ? 'btn-accent' : 'btn-outline'}
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
        >
          Event Log
        </button>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'details' && (
          <>
            {validationOutcome ? (
              <ValidationTable
                validationOutcome={validationOutcome}
                transactions={transactions}
              />
            ) : currentStepIndex >= 0 ? (
              <p className="font-mono text-xs text-muted-copy">
                Validation details available from Step 7 (Stateful Validation).
              </p>
            ) : (
              <p className="font-mono text-xs text-muted-copy">
                Start the simulation to see validation details.
              </p>
            )}
          </>
        )}

        {activeTab === 'log' && (
          <div className="flex flex-col gap-1">
            {narrationHistory.length === 0 ? (
              <p className="font-mono text-xs text-muted-copy">No events yet.</p>
            ) : (
              <ol className="flex flex-col gap-0.5">
                {narrationHistory.map((step, i) => (
                  <li
                    key={step.id}
                    className="font-mono text-xs"
                    style={
                      step.id === currentStep?.id
                        ? { fontWeight: 700, color: 'var(--color-ink)' }
                        : { color: 'var(--color-muted)' }
                    }
                  >
                    <span className="mr-1.5" style={{ color: 'var(--color-muted)' }}>
                      {i + 1}.
                    </span>
                    {step.narration}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// World State panel (bottom right)
// ---------------------------------------------------------------------------

function WorldStatePanel({
  initialBalances,
  validationOutcome,
  committedBlock,
  currentStepIndex,
}: {
  initialBalances: Record<string, number>
  validationOutcome: ValidationOutcomeData | undefined
  committedBlock: BlockData | undefined
  currentStepIndex: number
}) {
  const [view, setView] = useState<'provisional' | 'committed'>('provisional')
  const isCommitted = currentStepIndex >= 10 // step 11 = index 10

  const provisionalBalances = validationOutcome?.finalWorldState?.balances
  const committedBalances = isCommitted ? provisionalBalances : undefined

  const displayBalances =
    view === 'provisional'
      ? (provisionalBalances ?? null)
      : (committedBalances ?? null)

  return (
    <div
      className="flex w-52 shrink-0 flex-col gap-2 overflow-y-auto border-l-2 border-ink p-3"
    >
      <p className="label-mono">World State View</p>

      {/* Provisional / Committed toggle */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setView('provisional')}
          className={view === 'provisional' ? 'btn-accent' : 'btn-outline'}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem' }}
          disabled={!provisionalBalances}
        >
          Provisional
        </button>
        <button
          type="button"
          onClick={() => setView('committed')}
          className={view === 'committed' ? 'btn-accent' : 'btn-outline'}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.65rem' }}
          disabled={!isCommitted}
        >
          Committed
        </button>
      </div>

      {displayBalances ? (
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="pb-1 pr-3 text-left label-mono">Account</th>
              <th className="pb-1 text-right label-mono">USD</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(displayBalances).map(([account, balance]) => (
              <tr key={account} className="border-b border-ink/20">
                <td className="py-1.5 pr-3 font-semibold text-ink">{cap(account)}</td>
                <td className="py-1.5 text-right text-ink">{balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>
          {/* Show initial balances as starting point */}
          <p className="label-mono mb-1.5 text-muted-copy">Starting balances</p>
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="pb-1 pr-3 text-left label-mono">Account</th>
                <th className="pb-1 text-right label-mono">USD</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(initialBalances).map(([account, balance]) => (
                <tr key={account} className="border-b border-ink/20">
                  <td className="py-1.5 pr-3 font-semibold text-ink">{cap(account)}</td>
                  <td className="py-1.5 text-right text-muted-copy">{balance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1.5 font-mono text-[0.6rem] text-muted-copy">
            Provisional balances available from Step 7.
          </p>
        </div>
      )}

      {view === 'provisional' && provisionalBalances && !isCommitted && (
        <p className="font-mono text-[0.6rem] text-muted-copy">
          After validation — not yet committed to the chain.
        </p>
      )}
      {view === 'committed' && isCommitted && (
        <p
          className="label-mono rounded px-2 py-1 text-center"
          style={{ background: 'var(--color-purple-soft)' }}
        >
          Block #{committedBlock?.height ?? 1} committed
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main UC01Workspace
// ---------------------------------------------------------------------------

export interface UC01WorkspaceProps {
  architecture: BlockchainArchitecture
  scenario: Scenario
  selectedScenarioIndex: number
  onSelectScenario: (index: number) => void
  goToLanding: () => void
  // simulation state
  currentStep: ScenarioStep | undefined
  currentStepIndex: number
  narrationHistory: ScenarioStep[]
  accumulatedChanges: Record<string, unknown>
  isComplete: boolean
  isPlaying: boolean
  isAtStart: boolean
  isSimulationOpen: boolean
  onStart: () => void
  onReset: () => void
  send: (event: SimulationEvent) => void
  totalSteps: number
}

export function UC01Workspace({
  architecture,
  scenario,
  selectedScenarioIndex,
  onSelectScenario,
  goToLanding,
  currentStep,
  currentStepIndex,
  narrationHistory,
  accumulatedChanges,
  isComplete,
  isPlaying,
  isAtStart,
  isSimulationOpen,
  onStart,
  onReset,
  send,
  totalSteps,
}: UC01WorkspaceProps) {
  const transactions = scenario.transactions ?? []

  const validationOutcome = accumulatedChanges.validationOutcome as
    | ValidationOutcomeData
    | undefined
  const committedBlock = accumulatedChanges.committedBlock as BlockData | undefined

  const initialBalances = (scenario.initialTx.balances as Record<string, number> | undefined) ?? {}

  return (
    <main
      className="flex flex-col bg-background"
      style={{ height: '100vh', overflow: 'hidden' }}
    >
      {/* ── Top navigation bar ── */}
      <header
        className="flex shrink-0 items-center gap-3 border-b-2 border-ink bg-surface px-4 py-2"
      >
        {/* Logo + title */}
        <button
          type="button"
          onClick={goToLanding}
          className="btn-outline"
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
          aria-label="Back to blockchain selection"
        >
          ←
        </button>
        <span className="heading-serif text-sm font-semibold text-ink whitespace-nowrap">
          Hyperledger Iroha v1
        </span>

        <div
          className="mx-2 h-5 shrink-0"
          style={{ borderLeft: '2px solid var(--color-ink)' }}
        />

        {/* Scenario tabs */}
        <div role="tablist" aria-label="Scenario" className="flex gap-1.5">
          {architecture.scenarios.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === selectedScenarioIndex}
              type="button"
              onClick={() => onSelectScenario(i)}
              className={i === selectedScenarioIndex ? 'btn-accent' : 'btn-outline'}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              {i === 0 ? 'UC-00: Happy Path' : 'UC-01: Multi-Transaction'}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Playback controls (only when simulation is open) */}
        {isSimulationOpen && (
          <div role="group" aria-label="Simulation controls" className="flex gap-1.5">
            <button
              type="button"
              onClick={() => send({ type: 'RESET' })}
              disabled={isAtStart && !isPlaying}
              className="btn-outline"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              ↺ Reset
            </button>
            <button
              type="button"
              onClick={() => send({ type: 'PREVIOUS' })}
              disabled={isAtStart || isPlaying}
              className="btn-outline"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              ◀ Prev
            </button>
            {isPlaying ? (
              <button
                type="button"
                onClick={() => send({ type: 'PAUSE' })}
                className="btn-outline"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
              >
                ⏸ Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={() => send({ type: 'PLAY' })}
                disabled={isComplete}
                className="btn-accent"
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
              >
                ▶ Play
              </button>
            )}
            <button
              type="button"
              onClick={() => send({ type: 'NEXT' })}
              disabled={isComplete || isPlaying}
              className="btn-outline"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
            >
              Next ▶
            </button>
          </div>
        )}

        {/* Step counter / start button */}
        {isSimulationOpen ? (
          <span className="label-mono whitespace-nowrap">
            Step {Math.max(currentStepIndex + 1, 0)} / {totalSteps}
          </span>
        ) : (
          <button type="button" onClick={onStart} className="btn-accent">
            Start simulation
          </button>
        )}

        {isComplete && isSimulationOpen && (
          <button
            type="button"
            onClick={onReset}
            className="btn-outline"
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
          >
            Start over
          </button>
        )}
      </header>

      {/* ── Middle: sidebar + pipeline canvas ── */}
      <div className="flex min-h-0 flex-1">
        {/* Left lifecycle sidebar */}
        <LifecycleTimeline currentStepIndex={currentStepIndex} />

        {/* Pipeline canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto p-4">
          {!isSimulationOpen ? (
            /* Pre-start prompt */
            <div
              className="panel flex flex-col items-center gap-4 p-8 text-center"
              style={{ background: 'var(--color-purple-soft)' }}
            >
              <p className="heading-serif text-xl font-semibold">{scenario.name}</p>
              <p className="max-w-lg font-mono text-sm text-muted-copy">{scenario.description}</p>
              <div className="flex flex-col gap-1.5">
                {transactions.map((tx) => (
                  <p key={tx.id} className="font-mono text-sm text-ink">
                    <span className="label-mono mr-2">{tx.id}</span>
                    {cap(tx.from)} → {cap(tx.to)} · {tx.amount} {tx.asset}
                  </p>
                ))}
              </div>
              <button type="button" onClick={onStart} className="btn-accent mt-2">
                Start simulation
              </button>
            </div>
          ) : (
            <PipelineCanvas
              transactions={transactions}
              currentStepIndex={currentStepIndex}
              accumulatedChanges={accumulatedChanges}
            />
          )}
        </div>
      </div>

      {/* ── Bottom inspection panels ── */}
      <div
        className="flex shrink-0 border-t-2 border-ink bg-surface"
        style={{ height: '220px' }}
      >
        {/* Transaction list */}
        <TransactionListPanel
          transactions={transactions}
          validationOutcome={validationOutcome}
        />

        {/* Inspector (tabs) */}
        <InspectorPanel
          currentStep={currentStep}
          narrationHistory={narrationHistory}
          validationOutcome={validationOutcome}
          transactions={transactions}
          currentStepIndex={currentStepIndex}
        />

        {/* World State View */}
        <WorldStatePanel
          initialBalances={initialBalances}
          validationOutcome={validationOutcome}
          committedBlock={committedBlock}
          currentStepIndex={currentStepIndex}
        />
      </div>
    </main>
  )
}
