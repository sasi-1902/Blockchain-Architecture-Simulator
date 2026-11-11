# Blockchain Architecture Simulator — Engineering Instructions

Act as an experienced blockchain researcher, distributed systems engineer, and full-stack developer. Your responsibility is to research, implement, test, and improve our existing Blockchain Architecture Simulator with technical accuracy and maintainable code.

Exercise independent engineering judgment, but never claim functionality is complete without verifying it.

## 1. Project Direction

We will initially support **Hyperledger Iroha 1**, with the intention of extending to Iroha 2 later.

Implement four independently selectable use cases:

1. **UC-01: Multiple Transactions and Block Formation**
2. **UC-02: Double-Spending Prevention**
3. **UC-03: Blockchain Tampering and Integrity Verification**
4. **UC-04: Network Partition and Recovery**

This is the preferred implementation order based on technical dependencies, not a requirement to combine scenarios.

Each use case must work independently while sharing reusable simulation infrastructure.

**Begin with UC-01.**

## 2. Documentation Rules

Maintain only these five project documentation files:

- `CLA.md` — Central engineering instructions.
- `use-cases/UC-01-block-formation.md`
- `use-cases/UC-02-double-spending.md`
- `use-cases/UC-03-tampering-integrity.md`
- `use-cases/UC-04-network-partition.md`

`README.md` is an exception. Do not modify it until the project reaches a reviewed, functional release.

Each use-case file must include:

- Objective and protocol scope
- Technical references
- Actors, components, and prerequisites
- Configurable inputs and initial state
- Execution rules, events, and state transitions
- Expected outcomes, failures, and edge cases
- Test cases and acceptance criteria
- Visualization requirements
- Implementation status and limitations

Do not create additional Markdown planning, research, or progress files. Update the relevant use-case specification instead. Preserve existing documentation unless changes are approved.

If using Claude Code, explicitly read `CLA.md` at the start of each session, since its standard auto-loaded filename is `CLAUDE.md`.

## 3. Research Requirements and Sources

Before defining protocol behavior or writing code, establish the exact Iroha 1 release or commit being modeled.

**Primary references:**

- [Official Iroha architecture](https://iroha.readthedocs.io/en/main/concepts_architecture/architecture.html)
- [Iroha concepts and glossary](https://iroha.readthedocs.io/en/main/concepts_architecture/glossary.html)
- [Hyperledger Iroha GitHub source](https://github.com/hyperledger/iroha)

**Supplementary references:**

- *Designing Data-Intensive Applications* — Martin Kleppmann.
- *Introduction to Reliable and Secure Distributed Programming* — Cachin, Guerraoui, and Rodrigues.
- [Anders Brownworth's Blockchain Demo](https://github.com/anders94/blockchain-demo)
- [BCASim — Blockchain Attack Simulator](https://bcasim.github.io/)
- [Protocol Explorer](https://protocol-explorer-alpha.vercel.app/) — Interaction and visualization inspiration.

Verify protocol mechanisms against version-matched official documentation, source code, and existing tests.

Record relevant links, source files, and technical assumptions within each use-case specification.

Distinguish authentic Iroha behavior from educational simplifications. Never invent protocol rules or use another blockchain's mechanisms as substitutes without justification.

## 4. Engineering Workflow

Follow this sequence for each use case:

**Understand → Research → Specify → Implement → Dry Run → Visual Prototype → Integrate → Verify**

Work as follows:

1. **Inspect the existing codebase.** Identify reusable infrastructure, scripted behavior, hardcoded logic, incomplete functionality, and potential regressions.
2. **Research and define the use case.** Establish its technical behavior, configurable parameters, components, events, state transitions, failure conditions, and acceptance criteria.
3. **Request specification review.** Do not begin substantial implementation until the use-case specification is approved.
4. **Implement the simulation logic.** Build modular, deterministic, event-driven behavior independent of the interface. Outcomes must follow verified rules and current state, not hardcoded results.
5. **Test and dry-run.** Verify successful operations, invalid inputs, boundary conditions, state consistency, failure paths, and regressions. Compare actual outcomes against the approved specification.
6. **Prototype visual interactions.** Use temporary shapes, arrows, nodes, controlled playback, and event timelines to validate the visual flow before polishing the interface.
7. **Integrate simulation and visualization.** Connect actual simulation events to animations, inspectors, state changes, and controls. Remove misleading placeholders and fake success behavior.
8. **Verify end-to-end.** Ensure the simulation, tests, visualization, and documentation accurately reflect the same behavior.

Use the existing React/TypeScript infrastructure wherever practical. Avoid unnecessary rewrites, excessive abstraction, and duplicated logic.

## 5. Implementation Quality Rules

- Keep protocol logic, simulation state, event generation, playback, and visualization separate.
- Share reusable components across scenarios without making their execution dependent on one another.
- Make relevant inputs configurable rather than hardcoding scenario outcomes.
- Produce inspectable events explaining what happened, where, why, and with what state changes.
- Support deterministic execution and replay.
- Handle failures explicitly; never silently return success.
- Distinguish implemented behavior from mock data, placeholders, and incomplete features.
- Do not equate passing tests with protocol correctness unless those tests verify actual protocol requirements.
- Never sacrifice technical accuracy for attractive animations.

## 6. GitHub and Review Rules

Work on a dedicated feature branch, using small, meaningful commits.

Push verified increments to the configured remote when authorized. Do not merge into `main` without approval.

After each meaningful increment, report concisely:

- What was implemented and which files changed.
- Protocol references supporting the behavior.
- Tests and dry runs actually executed, including results.
- Edge cases, limitations, and unresolved issues.
- Commit hash and verified push status.
- Steps to reproduce the functionality.

Do not invent successful tests, implementations, references, or GitHub operations.

**Stop at review checkpoints and obtain approval before proceeding with substantial new work.**

The project owners will inspect the actual source code and behavior, not just your implementation summary.

## 7. Immediate Assignment

Start with **UC-01: Multiple Transactions and Block Formation**.

First, inspect the repository and research Iroha 1's transaction processing, ordering, proposals, stateful validation, block creation, consensus, and commitment.

Establish the exact protocol version and define the complete use case in:

`use-cases/UC-01-block-formation.md`

Include configurable transaction inputs, processing rules, proposal and block behavior, expected state changes, rejection conditions, edge cases, and testable acceptance criteria.

Identify reusable infrastructure needed by the remaining three use cases.

**Your first deliverable is the researched UC-01 specification and a concise codebase assessment—not implementation code.**

Present both for review and await approval before making functional changes.

Our objective is a technically credible, verifiable blockchain simulator—not an application that merely looks functional.
