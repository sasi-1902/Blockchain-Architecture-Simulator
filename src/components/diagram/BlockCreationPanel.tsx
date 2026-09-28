import type { FlattenedStateChange } from '../../engine/txStateChange'

export type BlockStage = 'waiting' | 'proposal' | 'validated' | 'candidate' | 'consensus' | 'committed'

export interface BlockCreationTransaction {
  from: string
  to: string
  asset: string
  amount: number
}

export interface CommittedBlock {
  number: number
  transaction: BlockCreationTransaction
  /** "Genesis" for Block #1, otherwise the previous block's label. */
  previousLabel: string
  /** This block's World State View deltas, captured at the moment it committed. */
  worldStateChanges: FlattenedStateChange[]
}

interface BlockCreationPanelProps {
  /** The permanent, accumulating chain -- unaffected by resetting the active transaction. */
  committedBlocks: CommittedBlock[]
  /** The current (not-yet-committed, or just-committed) transaction run's stage. */
  activeStage: BlockStage
  activeTransaction: BlockCreationTransaction
  /** Cumulative demonstration balances (starting balances plus every committed run's deltas), by entity. */
  worldStateBalances: Record<string, number>
  /** The scenario's single asset, used to label each entity's cumulative balance (e.g. "USD balance"). */
  assetLabel: string
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

function TxLine({ transaction }: { transaction: BlockCreationTransaction }) {
  return (
    <p className="font-mono text-xs text-ink">
      {transaction.from} &rarr; {transaction.to}
      <span className="text-muted-copy">
        {' '}
        &middot; {transaction.amount} {transaction.asset}
      </span>
    </p>
  )
}

function GenesisBlock() {
  return (
    <div className="panel-flat flex min-w-[120px] shrink-0 flex-col items-center gap-1 border-ink bg-purple-soft px-4 py-3 text-center">
      <span className="label-mono">Genesis</span>
      <span className="text-muted-copy text-xs">previous block</span>
    </div>
  )
}

function Connector({ solid }: { solid: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`h-0.5 w-8 shrink-0 ${solid ? 'bg-ink' : 'border-t-2 border-dashed border-muted bg-transparent'}`}
    />
  )
}

function CommittedBlockCard({ block }: { block: CommittedBlock }) {
  return (
    <div
      data-testid="committed-block"
      className="panel-flat flex min-w-[180px] shrink-0 flex-col items-start gap-1.5 bg-green-soft px-4 py-3"
    >
      <span className="label-mono">Block #{block.number}</span>
      <TxLine transaction={block.transaction} />
      <span className="label-mono" style={{ color: 'var(--color-green-accent)' }}>
        Committed
      </span>
      <span className="text-muted-copy text-[0.65rem]">Previous: {block.previousLabel}</span>
    </div>
  )
}

/**
 * An educational visualization of how the current scenario step's
 * transaction progresses into committed blockchain state, plus the
 * accumulated chain of previously committed blocks. Purely derived from the
 * active scenario step (via `activeStage`, which the caller computes from
 * `ScenarioStep.componentId`) and the caller's committed-block history --
 * this does not run a second state machine, and does not model consensus
 * mechanics (nonce/PoW) beyond what DESIGN.md describes for Iroha v1 YAC
 * consensus.
 */
export function BlockCreationPanel({
  committedBlocks,
  activeStage,
  activeTransaction,
  worldStateBalances,
  assetLabel,
}: BlockCreationPanelProps) {
  const showsActiveProposal = activeStage === 'proposal' || activeStage === 'validated'
  const showsActiveCandidate = activeStage === 'candidate' || activeStage === 'consensus'
  const showsWaitingSlot = activeStage === 'waiting' || activeStage === 'committed'

  const balanceEntries = Object.entries(worldStateBalances)

  return (
    <section aria-label="Block creation" className="panel-flat flex h-full flex-col gap-4 overflow-y-auto p-4">
      <p className="label-mono">Block creation</p>

      <div className="flex flex-1 items-center gap-3 overflow-x-auto">
        <GenesisBlock />

        {committedBlocks.map((block) => (
          <div key={block.number} className="flex items-center gap-3">
            <Connector solid />
            <CommittedBlockCard block={block} />
          </div>
        ))}

        {(showsActiveProposal || showsActiveCandidate || showsWaitingSlot) && (
          <div className="flex items-center gap-3">
            <Connector solid={false} />

            {showsActiveProposal && (
              <div className="flex min-w-[180px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-muted px-4 py-3 text-center">
                <span className="label-mono">Proposal</span>
                <TxLine transaction={activeTransaction} />
                <span className="label-mono">{activeStage === 'validated' ? 'Validated ✓' : 'Validating…'}</span>
              </div>
            )}

            {showsActiveCandidate && (
              <div
                data-testid="candidate-block"
                className="panel-flat flex min-w-[180px] shrink-0 flex-col items-start gap-1.5 bg-yellow-soft px-4 py-3"
              >
                <span className="label-mono">Candidate block #{committedBlocks.length + 1}</span>
                <TxLine transaction={activeTransaction} />
                <span className="label-mono text-muted-copy">
                  {activeStage === 'consensus' ? 'YAC consensus: agreed' : 'Awaiting consensus'}
                </span>
              </div>
            )}

            {showsWaitingSlot && (
              <div className="flex min-w-[180px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-muted px-4 py-3 text-center">
                <span className="text-muted-copy text-xs">Waiting for next block…</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div aria-label="World state view" className="border-t-2 border-ink pt-3">
        <p className="label-mono">World state view</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
          {balanceEntries.map(([entity, balance]) => (
            <div key={entity}>
              <p className="text-sm font-semibold text-ink">{capitalize(entity)}</p>
              <p className="font-mono text-xs text-ink">
                {assetLabel} balance: {balance}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
