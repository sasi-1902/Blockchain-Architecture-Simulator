import type { FlattenedStateChange } from './txStateChange'

/**
 * Accumulates committed transaction runs onto a set of starting numeric
 * balances, blockchain-independently: for each flattened change path, the
 * entity is the path's second-to-last segment (e.g. `worldStateView.alice
 * .balanceChange` -> `alice`), and only fields whose name ends in "Change"
 * (case-insensitive) are treated as deltas to accumulate. Any other field
 * (e.g. an asset name) is ignored here, since it is descriptive rather than
 * a numeric delta.
 *
 * `committedChangeSets` is one flattened change list per committed run, in
 * commit order, so the same helper works for one run or a full history.
 */
export function computeCumulativeBalances(
  initialBalances: Record<string, number>,
  committedChangeSets: FlattenedStateChange[][],
): Record<string, number> {
  const balances: Record<string, number> = { ...initialBalances }

  for (const changes of committedChangeSets) {
    for (const change of changes) {
      const segments = change.path.split('.')
      const fieldName = segments[segments.length - 1]

      if (!/change$/i.test(fieldName)) {
        continue
      }

      const entity = segments.length >= 2 ? segments[segments.length - 2] : change.path
      const delta = Number(change.value)

      if (!Number.isNaN(delta)) {
        balances[entity] = (balances[entity] ?? 0) + delta
      }
    }
  }

  return balances
}
