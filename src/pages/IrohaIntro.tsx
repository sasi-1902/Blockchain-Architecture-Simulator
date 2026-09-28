import type { BlockchainArchitecture } from '../engine/types'
import { useAppStore } from '../state/appStore'

interface IrohaIntroProps {
  architecture: BlockchainArchitecture
}

export function IrohaIntro({ architecture }: IrohaIntroProps) {
  const goToLanding = useAppStore((state) => state.goToLanding)
  const enterWorkspace = useAppStore((state) => state.enterWorkspace)
  const scenario = architecture.scenarios[0]

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section aria-labelledby="intro-heading" className="panel w-full max-w-2xl p-8 sm:p-10">
        <p className="label-mono">{architecture.displayName}</p>
        <h1 id="intro-heading" className="heading-serif mt-2 text-3xl font-semibold">
          A live demonstration of a transaction moving through Iroha v1
        </h1>

        <div className="text-muted-copy mt-6 space-y-4">
          <p>This is an interactive demonstration of a transaction moving through Hyperledger Iroha v1.</p>
          {scenario && (
            <p>
              The scenario is <span className="font-semibold text-ink">{scenario.name}</span>.
            </p>
          )}
          <p>
            You will see the transaction enter the system, travel through the internal architecture, participate in
            block creation and consensus, and become committed blockchain state.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={enterWorkspace} className="btn-accent">
            Start demonstration
          </button>
          <button type="button" onClick={goToLanding} className="btn-outline">
            Back
          </button>
        </div>
      </section>
    </main>
  )
}
