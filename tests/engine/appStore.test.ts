import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '../../src/state/appStore'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      view: 'landing',
      selectedArchitectureId: null,
      selectedComponentId: null,
      isSimulationOpen: false,
    })
  })

  it('starts on the landing view with no architecture or component selected', () => {
    const state = useAppStore.getState()

    expect(state.view).toBe('landing')
    expect(state.selectedArchitectureId).toBeNull()
    expect(state.selectedComponentId).toBeNull()
    expect(state.isSimulationOpen).toBe(false)
  })

  it('transitions to the introduction view when an architecture is selected', () => {
    useAppStore.getState().selectArchitecture('iroha1')

    const state = useAppStore.getState()
    expect(state.view).toBe('intro')
    expect(state.selectedArchitectureId).toBe('iroha1')
  })

  it('transitions from the introduction view to the simulation workspace', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()

    const state = useAppStore.getState()
    expect(state.view).toBe('workspace')
    expect(state.selectedArchitectureId).toBe('iroha1')
  })

  it('returns to the landing view and clears the architecture and component selection from the introduction', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().goToLanding()

    const state = useAppStore.getState()
    expect(state.view).toBe('landing')
    expect(state.selectedArchitectureId).toBeNull()
  })

  it('returns to the landing view and clears the architecture and component selection from the workspace', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().selectComponent('torii')
    useAppStore.getState().goToLanding()

    const state = useAppStore.getState()
    expect(state.view).toBe('landing')
    expect(state.selectedArchitectureId).toBeNull()
    expect(state.selectedComponentId).toBeNull()
  })

  it('selects a component for detail viewing', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().selectComponent('torii')

    expect(useAppStore.getState().selectedComponentId).toBe('torii')
  })

  it('clears the selected component without leaving the workspace view', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().selectComponent('torii')
    useAppStore.getState().closeComponentDetail()

    const state = useAppStore.getState()
    expect(state.selectedComponentId).toBeNull()
    expect(state.view).toBe('workspace')
    expect(state.selectedArchitectureId).toBe('iroha1')
  })

  it('clears any previously selected component when selecting a new architecture', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().selectComponent('torii')
    useAppStore.getState().selectArchitecture('iroha1')

    expect(useAppStore.getState().selectedComponentId).toBeNull()
  })

  it('opens the simulation panel', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().startSimulation()

    expect(useAppStore.getState().isSimulationOpen).toBe(true)
  })

  it('closes the simulation panel without leaving the workspace view', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().startSimulation()
    useAppStore.getState().closeSimulation()

    const state = useAppStore.getState()
    expect(state.isSimulationOpen).toBe(false)
    expect(state.view).toBe('workspace')
    expect(state.selectedArchitectureId).toBe('iroha1')
  })

  it('closes the simulation panel when returning to the landing view', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().startSimulation()
    useAppStore.getState().goToLanding()

    expect(useAppStore.getState().isSimulationOpen).toBe(false)
  })

  it('closes the simulation panel when selecting a new architecture', () => {
    useAppStore.getState().selectArchitecture('iroha1')
    useAppStore.getState().enterWorkspace()
    useAppStore.getState().startSimulation()
    useAppStore.getState().selectArchitecture('iroha1')

    expect(useAppStore.getState().isSimulationOpen).toBe(false)
  })
})
