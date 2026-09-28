import { createContext, useContext } from 'react'
import type { ComponentId } from '../../engine/types'
import type { HoverHighlight } from '../../engine/highlightGraph'

export interface HoverHighlightContextValue {
  hoveredComponentId: ComponentId | null
  highlight: HoverHighlight
  /** The component the active scenario step currently targets, or null when no step is active. */
  activeComponentId: ComponentId | null
}

export const EMPTY_HOVER_HIGHLIGHT: HoverHighlight = {
  highlightedComponentIds: new Set(),
  highlightedConnectionIds: new Set(),
}

export const HoverHighlightContext = createContext<HoverHighlightContextValue>({
  hoveredComponentId: null,
  highlight: EMPTY_HOVER_HIGHLIGHT,
  activeComponentId: null,
})

export function useHoverHighlight() {
  return useContext(HoverHighlightContext)
}
