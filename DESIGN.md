# Blockchain Architecture Simulator — Design Specification

## 1. Project Overview

Blockchain Architecture Simulator is an interactive educational application for exploring what happens inside a blockchain system when a transaction is submitted.

The application focuses on the internal transaction-processing pipeline rather than the traditional outward "chain of blocks" visualization.

The intended mental model is:

> A debugger for blockchain internals, not a block explorer.

The first supported architecture is:

**Hyperledger Iroha v1 — classic architecture**

The MVP demonstrates a single successful transaction:

**Alice sends 10 USD to Bob**

---

## 2. Design Principles

### 2.1 Per-chain accuracy over uniformity

Each blockchain architecture must use its real internal component names, transaction flow, terminology, and behavior.

Do not force different blockchains into one generic pipeline.

For example:

- Iroha v1 uses YAC consensus.
- Iroha v2 uses Sumeragi.
- Hyperledger Fabric has a substantially different endorsement and ordering architecture.
- Ethereum and Bitcoin follow different execution and consensus models.

The generic application engine must support these differences without redefining them.

### 2.2 Explorer first, simulator second

The static architecture explorer must be useful by itself.

A user should be able to:

- inspect the blockchain pipeline;
- click individual components;
- understand what each component does;
- understand why it exists;
- inspect its inputs and outputs;
- understand which components it communicates with;
- inspect related concepts.

Transaction simulation is an additional educational layer built on top of the architecture explorer.

### 2.3 Data-driven extensibility

Adding another blockchain architecture should primarily mean adding architecture data.

The rendering engine and generic UI should not require significant changes when another blockchain is introduced.

A blockchain architecture definition contains:

- components;
- connections;
- concepts;
- scenarios;
- optional network-model information.

### 2.4 Progressive complexity

The project starts with:

- one blockchain;
- one architecture version;
- one successful transaction scenario;
- one single-node pipeline view.

More advanced features are deliberately postponed until the core architecture explorer and simulation engine are stable.

---

## 3. MVP Scope

### 3.1 Supported blockchain

The MVP supports:

**Hyperledger Iroha v1 — classic architecture**

The interface must clearly identify this as Iroha v1 rather than implying that it represents current Iroha implementations generally.

### 3.2 Supported transaction scenario

The initial scenario is:

**Alice sends 10 USD to Bob**

Characteristics:

- successful transaction;
- single signature;
- no failure branch;
- no multisignature interaction;
- no custom transaction builder required for the MVP;
- transaction moves through the complete Iroha v1 transaction pipeline.

### 3.3 Landing page

The landing page displays four blockchain choices:

- Hyperledger Iroha;
- Hyperledger Fabric;
- Ethereum;
- Bitcoin.

Only Hyperledger Iroha is enabled in the MVP.

The remaining cards must clearly display:

**Coming soon**

They must not navigate to incomplete architecture views.

---

## 4. Explicitly Out of Scope for the MVP

The following are not part of the initial MVP:

- Iroha v2 implementation;
- Hyperledger Fabric implementation;
- Ethereum implementation;
- Bitcoin implementation;
- multisignature transaction UI;
- configurable quorum;
- multiple simultaneous transactions;
- multi-transaction proposal visualization;
- multi-peer network visualization;
- real digital-signature verification;
- production cryptography;
- backend services;
- database persistence;
- user accounts;
- saved simulations;
- collaborative sessions;
- user-authored blockchain definitions;
- mobile-first layout;
- automatic graph-layout engines;
- internationalization.

These features may be introduced after the MVP has been validated.

---

## 5. Application Architecture

The application uses three conceptual layers.

### 5.1 Architecture Definitions

Architecture definitions are pure blockchain-specific data.

They contain:

- components;
- connections;
- concepts;
- transaction scenarios;
- optional layout information;
- source references.

Architecture definitions must not contain React components or UI behavior.

For the MVP, the first architecture module is:

`src/architectures/iroha1/`

### 5.2 Generic Engine

The engine contains reusable blockchain-independent behavior.

Responsibilities include:

- architecture TypeScript interfaces;
- Zod validation;
- architecture registry;
- scenario execution;
- scenario state transitions;
- architecture-reference validation;
- transaction simulation state.

The engine must not depend directly on Iroha-specific implementation files.

The engine should operate on the generic architecture interfaces.

### 5.3 Presentation Layer

The presentation layer contains the user-facing interface.

Responsibilities include:

- blockchain selection;
- architecture visualization;
- component details;
- simulation controls;
- transaction animation;
- transaction narration;
- transaction-state display.

Generic UI components should consume architecture data through the generic engine interfaces rather than directly importing Iroha-specific objects.

---

## 6. Technology Stack

### Application Framework

- React
- TypeScript
- Vite

### Architecture Diagram

- `@xyflow/react`

React Flow provides:

- node rendering;
- edges;
- viewport controls;
- custom nodes;
- click interaction;
- pan and zoom.

### Animation

- Motion / Framer Motion ecosystem

Used for:

- transaction-token movement;
- component emphasis;
- drawer transitions;
- simulation transitions.

The exact package/import API must follow the installed library version and its current documentation.

### Simulation State

- XState

XState represents transaction-scenario execution as an explicit state machine.

### Application State

- Zustand

Used for UI/application state such as:

- selected architecture;
- selected component;
- active scenario;
- current simulation state.

### Schema Validation

- Zod

Every blockchain architecture definition must be validated before being treated as valid application data.

Validation must detect malformed or dangling references.

### Styling

- Tailwind CSS

Use the installation approach appropriate for the installed Tailwind major version.

### Testing

Unit and integration testing:

- Vitest

End-to-end testing:

- Playwright

---

## 7. Core Architecture Data Model

The application is driven by architecture data.

```ts
type ComponentId = string;

interface ArchitectureConcept {
  id: string;
  name: string;
  summary: string;
  details?: string;
}

interface ArchitectureComponent {
  id: ComponentId;
  name: string;

  category:
    | 'client'
    | 'gateway'
    | 'validation'
    | 'networking'
    | 'ordering'
    | 'consensus'
    | 'storage'
    | 'other';

  summary: string;

  whatItDoes: string;
  whyItExists: string;

  inputs: string[];
  outputs: string[];

  communicatesWith: ComponentId[];
  relatedConcepts: string[];

  position?: {
    x: number;
    y: number;
  };
}

interface ArchitectureConnection {
  id: string;

  from: ComponentId;
  to: ComponentId;

  label?: string;

  kind?:
    | 'sync-call'
    | 'async-message'
    | 'gossip'
    | 'storage-write'
    | 'internal';
}

interface ScenarioStep {
  id: string;

  componentId: ComponentId;

  narration: string;

  txStateChanges?: Record<string, unknown>;

  isFailure?: boolean;

  branchLabel?: string;
}

interface Scenario {
  id: string;

  name: string;

  description: string;

  category:
    | 'success'
    | 'failure'
    | 'query'
    | 'multisig'
    | 'consensus'
    | 'other';

  initialTx: {
    from: string;
    to: string;
    asset: string;
    amount: number;
    [key: string]: unknown;
  };

  steps: ScenarioStep[];
}

interface NetworkModel {
  peerCount?: number;
  quorumFormula?: string;
  roles?: string[];
}

interface BlockchainArchitecture {
  id: string;

  displayName: string;

  vendor: string;

  shortDescription: string;

  sourceLinks: {
    label: string;
    url: string;
  }[];

  components: ArchitectureComponent[];

  connections: ArchitectureConnection[];

  concepts: ArchitectureConcept[];

  scenarios: Scenario[];

  networkModel?: NetworkModel;
}
```

`NetworkModel` is intentionally optional and unused by the MVP. It exists only to reserve the extension point for a later multi-peer/network view.

---

## 8. Iroha v1 Architecture

The MVP models the classic C++ Hyperledger Iroha architecture.

The architecture diagram represents the following order:

1. Client
2. Torii
3. Stateless Validation
4. MST Processor
5. Peer Communication Service
6. Ordering Service
7. Proposal
8. Stateful Validation
9. Verified Proposal
10. Block Creator
11. YAC Consensus
12. Commit
13. Blockstore / World State View

The MVP is explicitly about Iroha v1. Iroha v2 and later generations have different internals and must not be presented as though this pipeline describes them.

---

## 9. Iroha v1 Core Concepts

### Torii

The primary gateway through which clients submit transactions and queries.

### Stateless Validation

Checks transaction structure and signature format without consulting blockchain state.

### MST Processor

The Multisignature Transaction Processor.

It handles partially signed transactions and allows signatures to be collected until the required account quorum is reached.

For the MVP transaction, the required signature quorum is already satisfied, so the transaction passes through this stage.

### Peer Communication Service

Handles peer-level transaction routing and communication.

### Ordering Service

Collects transactions and groups them into proposals.

### Proposal

A batch of transactions waiting to undergo state-dependent validation.

### Stateful Validation

Checks transaction validity against the current blockchain state.

Examples include:

- account existence;
- account balances;
- permissions;
- other state-dependent business rules.

### Verified Proposal

The subset of a proposal containing transactions that successfully passed stateful validation.

### Block Creator

Creates a candidate block from the verified proposal.

### YAC Consensus

Yet Another Consensus.

Peers use YAC to agree on the candidate block.

### Blockstore

Persistent storage for committed blockchain blocks.

### World State View

The current blockchain state used by queries and transaction validation.

It includes information such as:

- account balances;
- accounts;
- assets;
- permissions.

---

## 10. MVP Transaction Scenario

Scenario:

**Alice sends 10 USD to Bob**

The simulation sequence uses architecture nodes as explicit waypoints so the transaction animation does not need to skip intermediate diagram nodes.

### Step 1 — Torii

Alice's client submits the signed transfer to Torii.

### Step 2 — Stateless Validation

The transaction structure and signature format are checked.

No account-state information is required at this stage.

### Step 3 — MST Processor

The transaction already satisfies the required signature quorum.

It therefore passes through the MST Processor without waiting for additional signatures.

### Step 4 — Peer Communication Service

The fully signed transaction is routed toward the ordering pipeline.

### Step 5 — Ordering Service

The transaction is accepted for batching into a proposal.

### Step 6 — Proposal

The transaction is represented as part of the current proposal.

For the MVP it may be treated as the only transaction in that proposal.

### Step 7 — Stateful Validation

The transaction is validated against the World State View.

The simulation verifies conceptually that:

- Alice exists;
- Bob exists;
- Alice has sufficient funds;
- the transfer is permitted.

### Step 8 — Verified Proposal

The successfully validated transaction is represented in the Verified Proposal.

### Step 9 — Block Creator

The Verified Proposal is converted into a candidate block.

### Step 10 — YAC Consensus

Peers conceptually agree on the candidate block.

The MVP does not need to visualize the full peer network.

### Step 11 — Commit

The block is committed and persisted.

The World State View changes.

Visible example state change:

```text
Alice: -10 USD
Bob:   +10 USD
```

---

## 11. User Interface

### 11.1 Landing Page

The page displays the available blockchain architecture cards.

Only Iroha v1 is interactive during the MVP.

Fabric, Ethereum, and Bitcoin remain visible but disabled as **Coming soon**.

Selecting Iroha v1 navigates to an introduction screen that names the active
scenario and hands off into the workspace; the workspace itself navigates
back to the landing page.

### 11.2 Architecture View

The main architecture screen contains:

- a hand-authored pipeline diagram, laid out as a compact snake (row-wrapped)
  sequence rather than a single top-to-bottom column, with row/phase headings
  anchored to specific waypoint components;
- architecture nodes;
- architecture connections;
- component detail drawer;
- chain navigation;
- an interaction panel that is the transaction-simulation entry point and
  displays current transaction status and narration;
- a block creation/history panel showing the active run's stage and every
  previously committed block;
- a category legend.

No automatic graph-layout library is required for the MVP.

Interaction requirements:

- clicking a node opens the Component Detail Drawer;
- hovering a node highlights its `communicatesWith` edges and visually de-emphasizes unrelated graph elements;
- clicking an edge may expose its connection label/kind when available;
- the diagram must preserve the authored pipeline order.

### 11.3 Component Detail Drawer

Clicking a component opens its detail view.

The user must be able to inspect:

#### Overview

- what the component does;
- why the component exists.

#### Data Flow

- inputs;
- outputs;
- communicating components.

#### Concepts

- related architecture concepts.

A component-specific animation-preview feature is not required for the initial MVP.

### 11.4 Accessibility and responsive target

The MVP targets desktop and tablet layouts first.

At minimum:

- nodes and relevant controls must expose appropriate accessible labels;
- keyboard users must be able to navigate interactive controls;
- Enter should activate an actionable focused diagram node where practical;
- Escape should close dismissible overlays/drawers;
- the experience should remain usable at tablet widths.

Mobile-first diagram optimization is outside MVP scope.

---

## 12. Simulation Interface

The simulation interface contains:

- scenario selector;
- Next control;
- Previous control;
- Play control;
- Pause control;
- Reset control;
- narration history;
- current transaction state;
- autoplay timing/speed control if autoplay is implemented with adjustable speed.

The MVP contains one scenario.

The active/current narration must be visually identifiable, while previous narration remains available as history.

Once a scenario run completes, the interface allows starting another
transaction run of the same scenario. Each completed run is appended to a
persistent block-creation history that survives resetting the active run, and
the World State View balances shown to the user are cumulative across all
committed runs rather than reset per run.

---

## 13. Transaction Animation

A transaction marker moves through the architecture diagram as the scenario progresses.

Its current destination is derived from the active `ScenarioStep.componentId`.

Movement should visually follow the rendered connection path between consecutive scenario nodes rather than moving in a straight line.

The implementation may sample the rendered SVG path, for example through `getPointAtLength`, to calculate intermediate animation positions.

The scenario state machine is the source of truth for progression.

One scenario transition must correspond to one simulation step.

Consecutive scenario steps should correspond to directly connected diagram waypoints. Intermediate Proposal and Verified Proposal nodes therefore remain explicit scenario steps rather than being silently skipped.

---

## 14. Validation Requirements

Architecture definitions must be validated before use.

Validation must detect at minimum:

- duplicate component IDs;
- connection references to missing components;
- `communicatesWith` references to missing components;
- scenario steps referencing missing components;
- invalid concept references;
- required component fields that are empty.

Invalid architecture definitions must fail during development/testing rather than producing partially broken diagrams at runtime.

---

## 15. MVP Acceptance Criteria

The MVP is complete only when all of the following are satisfied.

- [ ] Landing page displays Iroha, Fabric, Ethereum, and Bitcoin.
- [ ] Only Iroha is enabled.
- [ ] Selecting Iroha opens the complete Iroha v1 architecture pipeline.
- [ ] Pipeline nodes appear in the intended top-to-bottom order.
- [ ] Every component contains real architecture information.
- [ ] Clicking a component opens its detail drawer.
- [ ] Hovering a component highlights its relevant communication edges.
- [ ] Every component exposes:
  - what it does;
  - why it exists;
  - inputs;
  - outputs;
  - communicating components;
  - related concepts.
- [ ] The "Alice sends 10 USD to Bob" scenario can be started.
- [ ] Next advances the simulation exactly one step.
- [ ] Previous moves backward correctly.
- [ ] Reset returns the scenario to its initial state.
- [ ] Play can advance through the scenario automatically.
- [ ] Pause stops autoplay without corrupting the current step.
- [ ] Narration updates for every simulation step.
- [ ] The transaction marker moves through the architecture diagram.
- [ ] The transaction marker follows the relevant rendered connection path between consecutive scenario nodes.
- [ ] Proposal and Verified Proposal are represented without requiring the animation to jump across missing direct edges.
- [ ] Final commit visibly updates the World State View.
- [ ] Alice displays a 10 USD decrease.
- [ ] Bob displays a 10 USD increase.
- [ ] Architecture schema validation passes.
- [ ] No dangling component, connection, scenario, communication, or concept references exist.
- [ ] Unit tests pass.
- [ ] End-to-end tests pass.
- [ ] Production build succeeds.

---

## 16. Architectural Constraints

The following boundaries are deliberate.

### Generic engine

`src/engine/` must remain blockchain-independent.

It must not directly import:

```text
src/architectures/iroha1/
```

### Generic components

Reusable components under:

```text
src/components/
```

should operate on generic architecture interfaces.

They should not require Iroha-specific implementation logic.

### Architecture modules

Files under:

```text
src/architectures/
```

contain blockchain-specific data and scenario definitions.

They must not contain React UI implementation.

The architecture boundary is successful only if another blockchain can be added without rewriting the generic engine or generic UI.

---

## 17. Future Roadmap

### Phase 1 — Iroha scenario depth

Possible additions:

- invalid signature;
- insufficient balance;
- permission failure;
- multisignature;
- configurable quorum;
- failed stateful validation;
- transaction query;
- multiple transactions per proposal.

### Phase 2 — Second architecture

Add another architecture without changing the generic engine.

Candidates:

- Iroha v2;
- Hyperledger Fabric.

Success means that adding the new blockchain primarily requires a new architecture-definition directory.

### Phase 3 — Multi-peer network visualization

Introduce a distributed network view showing communication such as:

- consensus voting;
- MST gossip;
- block propagation.

The optional `NetworkModel` extension point may be expanded at this stage.

### Phase 4 — Additional blockchains

Possible additions:

- Ethereum;
- Bitcoin;
- additional Hyperledger architectures.

---

## 18. Primary Architecture References

- [Hyperledger Iroha architecture documentation](https://iroha.readthedocs.io/en/main/concepts_architecture/architecture.html)
- [Hyperledger Iroha architecture wiki](https://wiki.hyperledger.org/display/iroha/Architecture)
- [Hyperledger Iroha source repository](https://github.com/hyperledger/iroha)
- [React Flow](https://github.com/xyflow/xyflow)
- [XState](https://github.com/statelyai/xstate)
- [Zustand](https://github.com/pmndrs/zustand)
- [Zod](https://github.com/colinhacks/zod)
- [Vitest](https://github.com/vitest-dev/vitest)
- [Playwright](https://github.com/microsoft/playwright)

Before publishing architecture content, re-check Iroha terminology against the primary architecture sources because active documentation and project status can change.

---

## 19. Definition of Architectural Success

The architecture is successful when a second blockchain can be introduced primarily by adding another architecture-definition module rather than rewriting the engine, simulation framework, or generic presentation components.
