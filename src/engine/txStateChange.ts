export interface FlattenedStateChange {
  path: string
  value: string
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'number') {
    if (value > 0) return `+${value}`
    return `${value}`
  }
  return String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `ScenarioStep.txStateChanges` is intentionally architecture-agnostic
 * (`Record<string, unknown>`), so the generic engine cannot assume any
 * particular field names (e.g. Iroha's `worldStateView.alice`). Flattening
 * to dot-separated paths lets generic UI display arbitrary nested state
 * changes without hard-coding a per-architecture shape.
 */
export function flattenTxStateChange(change: Record<string, unknown>, prefix = ''): FlattenedStateChange[] {
  return Object.entries(change).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key

    if (isPlainObject(value)) {
      return flattenTxStateChange(value, path)
    }

    return [{ path, value: stringifyValue(value) }]
  })
}
