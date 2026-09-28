export type ComponentId = string

export interface ArchitectureConcept {
  id: string
  name: string
  summary: string
  details?: string
}

export interface ArchitectureComponent {
  id: ComponentId
  name: string

  category:
    | 'client'
    | 'gateway'
    | 'validation'
    | 'networking'
    | 'ordering'
    | 'consensus'
    | 'storage'
    | 'other'

  summary: string

  whatItDoes: string
  whyItExists: string

  inputs: string[]
  outputs: string[]

  communicatesWith: ComponentId[]
  relatedConcepts: string[]

  position?: {
    x: number
    y: number
  }
}

export interface ArchitectureConnection {
  id: string

  from: ComponentId
  to: ComponentId

  label?: string

  kind?: 'sync-call' | 'async-message' | 'gossip' | 'storage-write' | 'internal'
}

export interface ScenarioStep {
  id: string

  componentId: ComponentId

  narration: string

  txStateChanges?: Record<string, unknown>

  isFailure?: boolean

  branchLabel?: string
}

export interface Scenario {
  id: string

  name: string

  description: string

  category: 'success' | 'failure' | 'query' | 'multisig' | 'consensus' | 'other'

  initialTx: {
    from: string
    to: string
    asset: string
    amount: number
    [key: string]: unknown
  }

  steps: ScenarioStep[]
}

export interface NetworkModel {
  peerCount?: number
  quorumFormula?: string
  roles?: string[]
}

export interface BlockchainArchitecture {
  id: string

  displayName: string

  vendor: string

  shortDescription: string

  sourceLinks: {
    label: string
    url: string
  }[]

  components: ArchitectureComponent[]

  connections: ArchitectureConnection[]

  concepts: ArchitectureConcept[]

  scenarios: Scenario[]

  networkModel?: NetworkModel
}
