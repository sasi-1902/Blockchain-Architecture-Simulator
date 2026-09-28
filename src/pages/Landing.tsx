import { useMemo } from 'react'
import { ChainPicker, type ChainOption } from '../components/landing/ChainPicker'
import { architectureRegistry } from '../state/registry'
import { useAppStore } from '../state/appStore'

const COMING_SOON_CHAINS: ChainOption[] = [
  {
    id: 'fabric',
    name: 'Hyperledger Fabric',
    description: 'A permissioned blockchain built around endorsement and ordering.',
    status: 'coming-soon',
  },
  {
    id: 'ethereum',
    name: 'Ethereum',
    description: 'An account-based smart contract platform.',
    status: 'coming-soon',
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    description: 'A UTXO-based proof-of-work blockchain.',
    status: 'coming-soon',
  },
]

export function Landing() {
  const selectArchitecture = useAppStore((state) => state.selectArchitecture)

  const options = useMemo<ChainOption[]>(() => {
    const enabledOptions: ChainOption[] = architectureRegistry.list().map((architecture) => ({
      id: architecture.id,
      name: architecture.displayName,
      description: architecture.shortDescription,
      status: 'enabled',
    }))

    return [...enabledOptions, ...COMING_SOON_CHAINS]
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section aria-labelledby="landing-heading" className="panel w-full max-w-3xl p-8 sm:p-10">
        <p className="label-mono">Blockchain demonstration</p>
        <h1 id="landing-heading" className="heading-serif mt-2 text-3xl font-semibold sm:text-4xl">
          Blockchain Architecture and Simulator
        </h1>
        <p className="text-muted-copy mt-3 max-w-xl">
          Explore what happens inside a blockchain system when a transaction is submitted
        </p>
        <div className="mt-8">
          <ChainPicker options={options} onSelect={selectArchitecture} />
        </div>
      </section>
    </main>
  )
}
