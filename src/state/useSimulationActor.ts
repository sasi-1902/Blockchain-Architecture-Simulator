import { useEffect, useState } from 'react'
import { createActor } from 'xstate'
import { createSimulationMachine, type SimulationEvent } from '../engine/simulationMachine'
import type { Scenario } from '../engine/types'

/**
 * Thin React binding over the generic XState scenario machine. Kept local
 * (rather than pulling in `@xstate/react`) since subscribing to an actor's
 * snapshot is a small, self-contained concern here.
 */
export function useSimulationActor(scenario: Scenario) {
  const [actor] = useState(() => createActor(createSimulationMachine(scenario)))
  const [snapshot, setSnapshot] = useState(() => actor.getSnapshot())

  useEffect(() => {
    const subscription = actor.subscribe(setSnapshot)
    // `start()` is a no-op once the actor is already running, so this
    // survives React StrictMode's mount -> cleanup -> mount dev cycle.
    // The actor is intentionally not `.stop()`-ed on cleanup: `stop()`
    // defers its work onto the actor's mailbox, and if a new subscription
    // is attached before that deferred stop is processed, XState wipes it
    // out along with every other observer -- silently freezing the UI on
    // the very next StrictMode remount.
    actor.start()

    return () => {
      subscription.unsubscribe()
    }
  }, [actor])

  const send = (event: SimulationEvent) => actor.send(event)

  return { snapshot, send }
}
