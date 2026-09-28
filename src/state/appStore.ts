import { create } from 'zustand'

export type AppView = 'landing' | 'intro' | 'workspace'

interface AppState {
  view: AppView
  selectedArchitectureId: string | null
  selectedComponentId: string | null
  isSimulationOpen: boolean
  /** Landing → Introduction: choosing an architecture card. */
  selectArchitecture: (architectureId: string) => void
  /** Introduction → Simulation workspace: "Start demonstration". */
  enterWorkspace: () => void
  /** Returns to landing from either the introduction or the workspace. */
  goToLanding: () => void
  selectComponent: (componentId: string) => void
  closeComponentDetail: () => void
  startSimulation: () => void
  closeSimulation: () => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'landing',
  selectedArchitectureId: null,
  selectedComponentId: null,
  isSimulationOpen: false,
  selectArchitecture: (architectureId) =>
    set({
      view: 'intro',
      selectedArchitectureId: architectureId,
      selectedComponentId: null,
      isSimulationOpen: false,
    }),
  enterWorkspace: () => set({ view: 'workspace' }),
  goToLanding: () =>
    set({ view: 'landing', selectedArchitectureId: null, selectedComponentId: null, isSimulationOpen: false }),
  selectComponent: (componentId) => set({ selectedComponentId: componentId }),
  closeComponentDetail: () => set({ selectedComponentId: null }),
  startSimulation: () => set({ isSimulationOpen: true }),
  closeSimulation: () => set({ isSimulationOpen: false }),
}))
