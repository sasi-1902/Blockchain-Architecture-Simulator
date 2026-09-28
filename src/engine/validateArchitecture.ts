import { z } from 'zod'
import type { BlockchainArchitecture } from './types'

const nonEmptyString = z.string().trim().min(1)

const componentCategorySchema = z.enum([
  'client',
  'gateway',
  'validation',
  'networking',
  'ordering',
  'consensus',
  'storage',
  'other',
])

const connectionKindSchema = z.enum([
  'sync-call',
  'async-message',
  'gossip',
  'storage-write',
  'internal',
])

const scenarioCategorySchema = z.enum([
  'success',
  'failure',
  'query',
  'multisig',
  'consensus',
  'other',
])

const architectureConceptSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  summary: nonEmptyString,
  details: z.string().optional(),
})

const architectureComponentSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  category: componentCategorySchema,
  summary: nonEmptyString,
  whatItDoes: nonEmptyString,
  whyItExists: nonEmptyString,
  inputs: z.array(nonEmptyString).min(1),
  outputs: z.array(nonEmptyString).min(1),
  communicatesWith: z.array(nonEmptyString).min(1),
  relatedConcepts: z.array(nonEmptyString).min(1),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
})

const architectureConnectionSchema = z.object({
  id: nonEmptyString,
  from: nonEmptyString,
  to: nonEmptyString,
  label: z.string().optional(),
  kind: connectionKindSchema.optional(),
})

const scenarioStepSchema = z.object({
  id: nonEmptyString,
  componentId: nonEmptyString,
  narration: nonEmptyString,
  txStateChanges: z.record(z.string(), z.unknown()).optional(),
  isFailure: z.boolean().optional(),
  branchLabel: z.string().optional(),
})

const scenarioSchema = z.object({
  id: nonEmptyString,
  name: nonEmptyString,
  description: nonEmptyString,
  category: scenarioCategorySchema,
  initialTx: z
    .object({
      from: nonEmptyString,
      to: nonEmptyString,
      asset: nonEmptyString,
      amount: z.number(),
    })
    .catchall(z.unknown()),
  steps: z.array(scenarioStepSchema),
})

const networkModelSchema = z.object({
  peerCount: z.number().optional(),
  quorumFormula: z.string().optional(),
  roles: z.array(z.string()).optional(),
})

const blockchainArchitectureSchema = z
  .object({
    id: nonEmptyString,
    displayName: nonEmptyString,
    vendor: nonEmptyString,
    shortDescription: nonEmptyString,
    sourceLinks: z.array(
      z.object({
        label: nonEmptyString,
        url: nonEmptyString,
      }),
    ),
    components: z.array(architectureComponentSchema),
    connections: z.array(architectureConnectionSchema),
    concepts: z.array(architectureConceptSchema),
    scenarios: z.array(scenarioSchema),
    networkModel: networkModelSchema.optional(),
  })
  .superRefine((architecture, ctx) => {
    const componentIds = new Set<string>()

    architecture.components.forEach((component, index) => {
      if (componentIds.has(component.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate component id: "${component.id}"`,
          path: ['components', index, 'id'],
        })
      }
      componentIds.add(component.id)
    })

    const conceptIds = new Set(architecture.concepts.map((concept) => concept.id))

    architecture.connections.forEach((connection, index) => {
      if (!componentIds.has(connection.from)) {
        ctx.addIssue({
          code: 'custom',
          message: `Connection "${connection.id}" references missing component "${connection.from}" in "from"`,
          path: ['connections', index, 'from'],
        })
      }
      if (!componentIds.has(connection.to)) {
        ctx.addIssue({
          code: 'custom',
          message: `Connection "${connection.id}" references missing component "${connection.to}" in "to"`,
          path: ['connections', index, 'to'],
        })
      }
    })

    architecture.components.forEach((component, componentIndex) => {
      component.communicatesWith.forEach((targetId, targetIndex) => {
        if (!componentIds.has(targetId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Component "${component.id}" has communicatesWith reference to missing component "${targetId}"`,
            path: ['components', componentIndex, 'communicatesWith', targetIndex],
          })
        }
      })

      component.relatedConcepts.forEach((conceptId, conceptIndex) => {
        if (!conceptIds.has(conceptId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Component "${component.id}" has relatedConcepts reference to missing concept "${conceptId}"`,
            path: ['components', componentIndex, 'relatedConcepts', conceptIndex],
          })
        }
      })
    })

    architecture.scenarios.forEach((scenario, scenarioIndex) => {
      scenario.steps.forEach((step, stepIndex) => {
        if (!componentIds.has(step.componentId)) {
          ctx.addIssue({
            code: 'custom',
            message: `Scenario "${scenario.id}" step "${step.id}" references missing component "${step.componentId}"`,
            path: ['scenarios', scenarioIndex, 'steps', stepIndex, 'componentId'],
          })
        }
      })
    })
  }) satisfies z.ZodType<BlockchainArchitecture>

interface ArchitectureValidationIssue {
  path: (string | number)[]
  message: string
}

export class ArchitectureValidationError extends Error {
  readonly issues: ArchitectureValidationIssue[]

  constructor(issues: ArchitectureValidationIssue[]) {
    super(
      `Invalid blockchain architecture definition:\n${issues
        .map((issue) => `- [${issue.path.join('.')}] ${issue.message}`)
        .join('\n')}`,
    )
    this.name = 'ArchitectureValidationError'
    this.issues = issues
  }
}

/**
 * Parses and validates a blockchain architecture definition, aggregating
 * both structural issues (Zod schema) and referential issues (dangling
 * component/concept references) into a single readable error.
 */
export function validateArchitecture(data: unknown): BlockchainArchitecture {
  const result = blockchainArchitectureSchema.safeParse(data)

  if (!result.success) {
    throw new ArchitectureValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path as (string | number)[],
        message: issue.message,
      })),
    )
  }

  return result.data
}
