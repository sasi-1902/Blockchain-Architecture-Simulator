import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArchitectureDiagram, type PhaseLabel } from '../components/diagram/ArchitectureDiagram'
import { BlockCreationPanel, type BlockStage, type CommittedBlock } from '../components/diagram/BlockCreationPanel'
import { ComponentDrawer } from '../components/drawer/ComponentDrawer'
import { InteractionPanel } from '../components/simulation/InteractionPanel'
import { UC01Workspace } from '../components/uc01/UC01Workspace'
import {
  selectAppliedTxStateChanges,
  selectCurrentStep,
  selectIsComplete,
  selectNarrationHistory,
} from '../engine/simulationMachine'
import { flattenTxStateChange } from '../engine/txStateChange'
import type { BlockchainArchitecture, ComponentId, Scenario } from '../engine/types'
import { computeCumulativeBalances } from '../engine/worldState'
import { useAppStore } from '../state/appStore'
import { useSimulationActor } from '../state/useSimulationActor'

interface IrohaWorkspaceProps {
  architecture: BlockchainArchitecture
}

const PHASE_LABELS: PhaseLabel[] = [
  { label: 'Order + verify', anchorComponentId: 'verified-proposal' },
  { label: 'Consensus + commit', anchorComponentId: 'block-creator' },
]

const BLOCK_STAGE_BY_COMPONENT: Partial<Record<ComponentId, BlockStage>> = {
  proposal: 'proposal',
  'stateful-validation': 'proposal',
  'verified-proposal': 'validated',
  'block-creator': 'candidate',
  'yac-consensus': 'consensus',
  commit: 'committed',
  'blockstore-wsv': 'committed',
}

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

// ---------------------------------------------------------------------------
// ScenarioRunner — keyed by scenario.id so the XState actor remounts on switch
// ---------------------------------------------------------------------------

interface ScenarioRunnerProps {
  architecture: BlockchainArchitecture
  scenario: Scenario
  selectedScenarioIndex: number
  onSelectScenario: (index: number) => void
  goToLanding: () => void
}

function ScenarioRunner({
  architecture,
  scenario,
  selectedScenarioIndex,
  onSelectScenario,
  goToLanding,
}: ScenarioRunnerProps) {
  const isSimulationOpen = useAppStore((state) => state.isSimulationOpen)
  const startSimulation = useAppStore((state) => state.startSimulation)
  const closeSimulation = useAppStore((state) => state.closeSimulation)
  const selectComponent = useAppStore((state) => state.selectComponent)

  const { snapshot, send } = useSimulationActor(scenario)
  const { context } = snapshot

  const currentStep = selectCurrentStep(context)
  const narrationHistory = selectNarrationHistory(context)
  const isComplete = selectIsComplete(context)
  const isPlaying = snapshot.matches('playing')
  const isAtStart = context.stepIndex === -1

  const rawStateChanges = selectAppliedTxStateChanges(context)
  const stateChanges = rawStateChanges.flatMap((change) => flattenTxStateChange(change))
  const accumulatedChanges = useMemo(
    () => Object.assign({}, ...rawStateChanges) as Record<string, unknown>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context.stepIndex],
  )

  const activeComponentId = isSimulationOpen ? (currentStep?.componentId ?? null) : null

  const [committedBlocks, setCommittedBlocks] = useState<CommittedBlock[]>([])
  const hasRecordedRunRef = useRef(false)

  useLayoutEffect(() => {
    if (isSimulationOpen && isComplete && !hasRecordedRunRef.current) {
      hasRecordedRunRef.current = true

      if (scenario.transactions) {
        const blockData = accumulatedChanges.committedBlock as
          | { transactions: Array<{ from: string; to: string; asset: string; amount: string }>; rejectedTransactionIds: string[] }
          | undefined

        setCommittedBlocks((prev) => [
          ...prev,
          {
            number: prev.length + 1,
            transaction: scenario.initialTx,
            transactions: blockData?.transactions?.map((tx) => ({
              from: tx.from,
              to: tx.to,
              asset: tx.asset,
              amount: Number(tx.amount),
            })),
            previousLabel: prev.length === 0 ? 'Genesis' : `Block #${prev.length}`,
            worldStateChanges: stateChanges,
          },
        ])
      } else {
        setCommittedBlocks((prev) => [
          ...prev,
          {
            number: prev.length + 1,
            transaction: scenario.initialTx,
            previousLabel: prev.length === 0 ? 'Genesis' : `Block #${prev.length}`,
            worldStateChanges: stateChanges,
          },
        ])
      }
    }
  }, [isSimulationOpen, isComplete, scenario.initialTx, scenario.transactions, accumulatedChanges, stateChanges])

  const handleSend = useCallback(() => {
    hasRecordedRunRef.current = false
    startSimulation()
  }, [startSimulation])

  const handleMakeAnotherTransaction = useCallback(() => {
    hasRecordedRunRef.current = false
    send({ type: 'RESET' })
    closeSimulation()
  }, [send, closeSimulation])

  const handleResetUC01 = useCallback(() => {
    hasRecordedRunRef.current = false
    send({ type: 'RESET' })
    closeSimulation()
  }, [send, closeSimulation])

  const initialBalances = useMemo(
    () => (scenario.initialTx.balances as Record<string, number> | undefined) ?? {},
    [scenario.initialTx],
  )

  const uc01WorldStateBalances = useMemo(() => {
    if (!scenario.transactions) return {}
    const validationData = accumulatedChanges.validationOutcome as
      | { finalWorldState?: { balances: Record<string, string> } }
      | undefined
    const balancesStr = validationData?.finalWorldState?.balances
    if (balancesStr) {
      return Object.fromEntries(Object.entries(balancesStr).map(([k, v]) => [k, Number(v)]))
    }
    return initialBalances
  }, [scenario.transactions, accumulatedChanges, initialBalances])

  const currentBalances = useMemo(
    () =>
      scenario.transactions
        ? uc01WorldStateBalances
        : computeCumulativeBalances(initialBalances, committedBlocks.map((b) => b.worldStateChanges)),
    [scenario.transactions, uc01WorldStateBalances, initialBalances, committedBlocks],
  )

  const transactionStatus =
    isSimulationOpen && currentStep ? (TRANSACTION_STATUS_BY_COMPONENT[currentStep.componentId] ?? 'Ready') : 'Ready'
  const showStatefulValidationCheck = isSimulationOpen && currentStep?.componentId === 'stateful-validation'

  const blockStage: BlockStage =
    isSimulationOpen && currentStep ? (BLOCK_STAGE_BY_COMPONENT[currentStep.componentId] ?? 'waiting') : 'waiting'

  const uc01ActiveTransactions = useMemo(() => {
    if (!scenario.transactions) return undefined
    const blockData = accumulatedChanges.candidateBlock as
      | { transactions: Array<{ from: string; to: string; asset: string; amount: string }> }
      | undefined
    const proposalData = accumulatedChanges.proposal as
      | { transactions: Array<{ from: string; to: string; asset: string; amount: string }> }
      | undefined
    const source = blockData ?? proposalData
    return source?.transactions?.map((tx) => ({
      from: tx.from,
      to: tx.to,
      asset: tx.asset,
      amount: Number(tx.amount),
    }))
  }, [scenario.transactions, accumulatedChanges])

  const handleSelectComponent = useCallback(
    (componentId: ComponentId) => selectComponent(componentId),
    [selectComponent],
  )

  const isUC01 = scenario.transactions !== undefined

  // UC-01: render the redesigned full-page workspace
  if (isUC01) {
    return (
      <UC01Workspace
        architecture={architecture}
        scenario={scenario}
        selectedScenarioIndex={selectedScenarioIndex}
        onSelectScenario={onSelectScenario}
        goToLanding={goToLanding}
        currentStep={currentStep}
        currentStepIndex={context.stepIndex}
        narrationHistory={narrationHistory}
        accumulatedChanges={accumulatedChanges}
        isComplete={isComplete}
        isPlaying={isPlaying}
        isAtStart={isAtStart}
        isSimulationOpen={isSimulationOpen}
        onStart={handleSend}
        onReset={handleResetUC01}
        send={send}
        totalSteps={scenario.steps.length}
      />
    )
  }

  // UC-00: original grid layout
  return (
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
            activeTransactions={uc01ActiveTransactions}
            worldStateBalances={currentBalances}
            assetLabel={scenario.initialTx.asset}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IrohaWorkspace — outer shell: for UC-00 adds header + scenario tabs
// ---------------------------------------------------------------------------

export function IrohaWorkspace({ architecture }: IrohaWorkspaceProps) {
  const goToLanding = useAppStore((state) => state.goToLanding)
  const selectedComponentId = useAppStore((state) => state.selectedComponentId)
  const closeComponentDetail = useAppStore((state) => state.closeComponentDetail)

  const [selectedScenarioIndex, setSelectedScenarioIndex] = useState(0)
  const scenario = architecture.scenarios[selectedScenarioIndex]
  const isUC01 = scenario.transactions !== undefined

  const componentsById = useMemo(
    () => new Map(architecture.components.map((component) => [component.id, component])),
    [architecture],
  )
  const selectedComponent = selectedComponentId ? componentsById.get(selectedComponentId) : undefined
  const relatedConcepts = selectedComponent
    ? architecture.concepts.filter((concept) => selectedComponent.relatedConcepts.includes(concept.id))
    : []

  // UC-01 renders its own full-page layout (including its own header)
  if (isUC01) {
    return (
      <ScenarioRunner
        key={scenario.id}
        architecture={architecture}
        scenario={scenario}
        selectedScenarioIndex={selectedScenarioIndex}
        onSelectScenario={setSelectedScenarioIndex}
        goToLanding={goToLanding}
      />
    )
  }

  // UC-00: existing layout with header
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

      {architecture.scenarios.length > 1 && (
        <div role="tablist" aria-label="Scenario" className="flex gap-2">
          {architecture.scenarios.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === selectedScenarioIndex}
              type="button"
              onClick={() => setSelectedScenarioIndex(i)}
              className={i === selectedScenarioIndex ? 'btn-accent text-sm' : 'btn-outline text-sm'}
            >
              {i === 0 ? 'UC-00: Happy Path' : 'UC-01: Multi-Transaction'}
            </button>
          ))}
        </div>
      )}

      <ScenarioRunner
        key={scenario.id}
        architecture={architecture}
        scenario={scenario}
        selectedScenarioIndex={selectedScenarioIndex}
        onSelectScenario={setSelectedScenarioIndex}
        goToLanding={goToLanding}
      />

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
