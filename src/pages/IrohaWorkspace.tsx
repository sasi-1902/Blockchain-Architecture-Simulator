import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArchitectureDiagram, type PhaseLabel } from '../components/diagram/ArchitectureDiagram'
import { BlockCreationPanel, type BlockStage, type CommittedBlock } from '../components/diagram/BlockCreationPanel'
import { ComponentDrawer } from '../components/drawer/ComponentDrawer'
import { InteractionPanel } from '../components/simulation/InteractionPanel'
import {
  selectAppliedTxStateChanges,
  selectCurrentStep,
  selectIsComplete,
  selectNarrationHistory,
} from '../engine/simulationMachine'
import { flattenTxStateChange } from '../engine/txStateChange'
import type { BlockchainArchitecture, ComponentId } from '../engine/types'
import { computeCumulativeBalances } from '../engine/worldState'
import { useAppStore } from '../state/appStore'
import { useSimulationActor } from '../state/useSimulationActor'

interface IrohaWorkspaceProps {
  architecture: BlockchainArchitecture
}

/**
 * Row headings for the compact snake diagram layout, anchored to this
 * architecture's authored node positions. The first row intentionally has
 * no heading (per human review) -- only the row transitions need one.
 */
const PHASE_LABELS: PhaseLabel[] = [
  { label: 'Order + verify', anchorComponentId: 'verified-proposal' },
  { label: 'Consensus + commit', anchorComponentId: 'block-creator' },
]

/** Maps this architecture's pipeline waypoints onto the generic block-creation stages. */
const BLOCK_STAGE_BY_COMPONENT: Partial<Record<ComponentId, BlockStage>> = {
  proposal: 'proposal',
  'stateful-validation': 'proposal',
  'verified-proposal': 'validated',
  'block-creator': 'candidate',
  'yac-consensus': 'consensus',
  commit: 'committed',
  'blockstore-wsv': 'committed',
}

/** Maps this architecture's pipeline waypoints onto a plain-language transaction status. */
const TRANSACTION_STATUS_BY_COMPONENT: Partial<Record<ComponentId, string>> = {
  torii: 'Submitted',
  'stateless-validation': 'Statelessly validated',
  'mst-processor': 'Statelessly validated',
  'peer-communication-service': 'Statelessly validated',
  'ordering-service': 'Ordered',
  proposal: 'In proposal',
  'stateful-validation': 'Statefully validated',
  'verified-proposal': 'Statefully validated',
  'block-creator': 'Consensus reached',
  'yac-consensus': 'Consensus reached',
  commit: 'Committed',
  'blockstore-wsv': 'Committed',
}

export function IrohaWorkspace({ architecture }: IrohaWorkspaceProps) {
  const selectedComponentId = useAppStore((state) => state.selectedComponentId)
  const isSimulationOpen = useAppStore((state) => state.isSimulationOpen)
  const goToLanding = useAppStore((state) => state.goToLanding)
  const selectComponent = useAppStore((state) => state.selectComponent)
  const closeComponentDetail = useAppStore((state) => state.closeComponentDetail)
  const startSimulation = useAppStore((state) => state.startSimulation)
  const closeSimulation = useAppStore((state) => state.closeSimulation)

  const scenario = architecture.scenarios[0]
  const { snapshot, send } = useSimulationActor(scenario)
  const { context } = snapshot

  const currentStep = selectCurrentStep(context)
  const narrationHistory = selectNarrationHistory(context)
  const isComplete = selectIsComplete(context)
  const isPlaying = snapshot.matches('playing')
  const isAtStart = context.stepIndex === -1
  const stateChanges = selectAppliedTxStateChanges(context).flatMap((change) => flattenTxStateChange(change))

  const activeComponentId = isSimulationOpen ? (currentStep?.componentId ?? null) : null

  // Committed-block history: appended once per successful transaction run,
  // and intentionally kept outside the scenario's own XState machine (which
  // continues to represent exactly one transaction run at a time) so that
  // "Make another transaction" can reset the active run without losing the
  // demonstration's accumulated chain.
  const [committedBlocks, setCommittedBlocks] = useState<CommittedBlock[]>([])
  const hasRecordedRunRef = useRef(false)

  useLayoutEffect(() => {
    if (isSimulationOpen && isComplete && !hasRecordedRunRef.current) {
      hasRecordedRunRef.current = true
      setCommittedBlocks((previousBlocks) => [
        ...previousBlocks,
        {
          number: previousBlocks.length + 1,
          transaction: scenario.initialTx,
          previousLabel: previousBlocks.length === 0 ? 'Genesis' : `Block #${previousBlocks.length}`,
          worldStateChanges: stateChanges,
        },
      ])
    }
  }, [isSimulationOpen, isComplete, scenario.initialTx, stateChanges])

  const handleSend = useCallback(() => {
    hasRecordedRunRef.current = false
    startSimulation()
  }, [startSimulation])

  const handleMakeAnotherTransaction = useCallback(() => {
    hasRecordedRunRef.current = false
    send({ type: 'RESET' })
    closeSimulation()
  }, [send, closeSimulation])

  // `initialTx` is an intentionally architecture-agnostic catch-all record
  // (DESIGN.md §7), so this scenario's authored starting World State View
  // balances are read out with a narrow, local cast rather than widening the
  // generic `Scenario` type for one architecture's demonstration data.
  const initialBalances = useMemo(
    () => (scenario.initialTx.balances as Record<string, number> | undefined) ?? {},
    [scenario.initialTx],
  )

  // Cumulative demonstration balances: derived, not stored -- the starting
  // balances plus every committed block's own captured deltas, in order.
  // During an in-progress run this is exactly the "before this transaction"
  // balance (the active run hasn't been appended to `committedBlocks` yet),
  // which is what the Stateful Validation check below needs to display.
  const currentBalances = useMemo(
    () => computeCumulativeBalances(initialBalances, committedBlocks.map((block) => block.worldStateChanges)),
    [initialBalances, committedBlocks],
  )

  const transactionStatus =
    isSimulationOpen && currentStep ? (TRANSACTION_STATUS_BY_COMPONENT[currentStep.componentId] ?? 'Ready') : 'Ready'
  const showStatefulValidationCheck = isSimulationOpen && currentStep?.componentId === 'stateful-validation'

  const componentsById = useMemo(
    () => new Map(architecture.components.map((component) => [component.id, component])),
    [architecture],
  )
  const selectedComponent = selectedComponentId ? componentsById.get(selectedComponentId) : undefined
  const relatedConcepts = selectedComponent
    ? architecture.concepts.filter((concept) => selectedComponent.relatedConcepts.includes(concept.id))
    : []

  const blockStage: BlockStage =
    isSimulationOpen && currentStep ? (BLOCK_STAGE_BY_COMPONENT[currentStep.componentId] ?? 'waiting') : 'waiting'

  const handleSelectComponent = useCallback((componentId: ComponentId) => selectComponent(componentId), [selectComponent])

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-background p-4 sm:p-6 lg:h-screen lg:overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <button type="button" onClick={goToLanding} className="btn-outline">
          &larr; Back to blockchain selection
        </button>
        <div className="text-right">
          <p className="label-mono">{architecture.displayName}</p>
        </div>
      </div>

      <h1 className="heading-serif text-2xl font-semibold">{architecture.displayName}</h1>

      <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,35%)_minmax(0,1fr)]">
        <div className="lg:min-h-0">
          <InteractionPanel
            scenario={scenario}
            isSimulationOpen={isSimulationOpen}
            onSend={handleSend}
            onMakeAnotherTransaction={handleMakeAnotherTransaction}
            send={send}
            currentStep={currentStep}
            currentStepIndex={context.stepIndex}
            narrationHistory={narrationHistory}
            stateChanges={stateChanges}
            isComplete={isComplete}
            isPlaying={isPlaying}
            isAtStart={isAtStart}
            transactionStatus={transactionStatus}
            showStatefulValidationCheck={showStatefulValidationCheck}
            currentFromBalance={currentBalances[scenario.initialTx.from] ?? 0}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-[420px] lg:min-h-0">
            <p className="label-mono mb-1">Internal architecture</p>
            <div className="h-[calc(100%-1.25rem)]">
              <ArchitectureDiagram
                components={architecture.components}
                connections={architecture.connections}
                onSelectComponent={handleSelectComponent}
                currentComponentId={activeComponentId}
                phaseLabels={PHASE_LABELS}
              />
            </div>
          </div>

          <div className="max-h-72 min-h-56">
            <BlockCreationPanel
              committedBlocks={committedBlocks}
              activeStage={blockStage}
              activeTransaction={scenario.initialTx}
              worldStateBalances={currentBalances}
              assetLabel={scenario.initialTx.asset}
            />
          </div>
        </div>
      </div>

      {selectedComponent && (
        <ComponentDrawer
          component={selectedComponent}
          componentsById={componentsById}
          concepts={relatedConcepts}
          onClose={closeComponentDetail}
        />
      )}
    </main>
  )
}
