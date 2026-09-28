import { useEffect, type ReactNode } from 'react'
import type { ArchitectureComponent, ArchitectureConcept, ComponentId } from '../../engine/types'

interface ComponentDrawerProps {
  component: ArchitectureComponent
  componentsById: Map<ComponentId, ArchitectureComponent>
  concepts: ArchitectureConcept[]
  onClose: () => void
}

function FlowStep({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function FlowArrow() {
  return (
    <div aria-hidden="true" className="text-muted-copy py-1 text-center font-mono text-sm">
      &darr;
    </div>
  )
}

export function ComponentDrawer({ component, componentsById, concepts, onClose }: ComponentDrawerProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${component.name} details`}
      className="panel fixed top-20 right-6 bottom-6 z-20 w-full max-w-sm overflow-y-auto p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-mono">Component detail</p>
          <h2 className="heading-serif mt-1 text-2xl font-semibold">{component.name}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close component details" className="btn-outline px-2 py-1">
          Close
        </button>
      </div>
      <p className="text-muted-copy mt-2">{component.summary}</p>

      <section aria-label="Overview" className="mt-6">
        <h3 className="label-mono">Why it exists</h3>
        <p className="mt-1 text-sm text-ink">{component.whyItExists}</p>
      </section>

      <section aria-label="Data Flow" className="mt-6 space-y-1">
        <h3 className="label-mono">Data flow</h3>

        <FlowStep label="Input">
          <ul className="list-inside list-disc text-sm text-ink">
            {component.inputs.map((input) => (
              <li key={input}>{input}</li>
            ))}
          </ul>
        </FlowStep>

        <FlowArrow />

        <FlowStep label="Process">
          <p className="text-sm text-ink">{component.whatItDoes}</p>
        </FlowStep>

        <FlowArrow />

        <FlowStep label="Output">
          <ul className="list-inside list-disc text-sm text-ink">
            {component.outputs.map((output) => (
              <li key={output}>{output}</li>
            ))}
          </ul>
        </FlowStep>

        <div className="mt-4">
          <p className="label-mono">Communicates with</p>
          <ul className="mt-1 list-inside list-disc text-sm text-ink">
            {component.communicatesWith.map((componentId) => (
              <li key={componentId}>{componentsById.get(componentId)?.name ?? componentId}</li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Concepts" className="mt-6">
        <h3 className="label-mono">Related concepts</h3>
        <ul className="mt-2 space-y-3">
          {concepts.map((concept) => (
            <li key={concept.id} className="panel-flat p-3">
              <p className="text-sm font-semibold text-ink">{concept.name}</p>
              <p className="text-muted-copy mt-1 text-sm">{concept.summary}</p>
              {concept.details && <p className="text-muted-copy mt-1 text-sm">{concept.details}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
