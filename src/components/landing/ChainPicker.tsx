export interface ChainOption {
  id: string
  name: string
  description: string
  status: 'enabled' | 'coming-soon'
}

interface ChainPickerProps {
  options: ChainOption[]
  onSelect: (chainId: string) => void
}

export function ChainPicker({ options, onSelect }: ChainPickerProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {options.map((option) => {
        const isEnabled = option.status === 'enabled'

        return (
          <li key={option.id}>
            <button
              type="button"
              disabled={!isEnabled}
              onClick={isEnabled ? () => onSelect(option.id) : undefined}
              aria-label={isEnabled ? option.name : `${option.name} (coming soon)`}
              className={`panel-flat flex h-full w-full flex-col items-start gap-2 p-5 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-[4px_4px_0_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50 enabled:focus-visible:outline enabled:focus-visible:outline-2 enabled:focus-visible:outline-offset-2 enabled:focus-visible:outline-[var(--color-green-accent)] ${
                isEnabled ? 'bg-green-soft' : 'bg-surface'
              }`}
            >
              <span className="heading-serif text-xl font-semibold">{option.name}</span>
              <span className="text-muted-copy text-sm">{option.description}</span>
              {!isEnabled && <span className="label-mono mt-2 rounded-full border border-ink px-3 py-1">Coming soon</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
