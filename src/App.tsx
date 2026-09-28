import { IrohaIntro } from './pages/IrohaIntro'
import { IrohaWorkspace } from './pages/IrohaWorkspace'
import { Landing } from './pages/Landing'
import { architectureRegistry } from './state/registry'
import { useAppStore } from './state/appStore'

function App() {
  const view = useAppStore((state) => state.view)
  const selectedArchitectureId = useAppStore((state) => state.selectedArchitectureId)

  const architecture = selectedArchitectureId ? architectureRegistry.get(selectedArchitectureId) : undefined

  if ((view === 'intro' || view === 'workspace') && architecture) {
    if (view === 'intro') {
      return <IrohaIntro architecture={architecture} />
    }
    return <IrohaWorkspace architecture={architecture} />
  }

  return <Landing />
}

export default App
