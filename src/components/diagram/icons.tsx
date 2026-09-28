import type { ReactElement } from 'react'
import type { ComponentCategory } from '../../engine/categoryStyles'

interface CategoryIconProps {
  className?: string
}

/**
 * Minimal inline SVG glyphs, one per architecture component category.
 * Deliberately simple geometric marks rather than a third-party icon
 * package, per the visual system's "small inline SVG primitives" rule.
 */
const ICON_PATHS: Record<ComponentCategory, (props: CategoryIconProps) => ReactElement> = {
  client: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="5" r="2.6" />
      <path d="M3 13c0-2.6 2.2-4 5-4s5 1.4 5 4" strokeLinecap="round" />
    </svg>
  ),
  gateway: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 13V6l5-3.5L13 6v7" strokeLinejoin="round" />
      <path d="M6 13V9h4v4" strokeLinejoin="round" />
    </svg>
  ),
  validation: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M8 2.5 13 4.5v3.6c0 3-2.1 5-5 5.9-2.9-.9-5-2.9-5-5.9V4.5Z" strokeLinejoin="round" />
      <path d="M6 8.2 7.5 9.7 10.4 6.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  networking: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="3.2" cy="4" r="1.6" />
      <circle cx="12.8" cy="4" r="1.6" />
      <circle cx="8" cy="12.5" r="1.6" />
      <path d="M4.6 4.8 6.8 11M11.4 4.8 9.2 11M4.8 4h6.4" strokeLinecap="round" />
    </svg>
  ),
  ordering: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.5" y="3" width="11" height="2.6" rx="0.6" />
      <rect x="2.5" y="6.8" width="8" height="2.6" rx="0.6" />
      <rect x="2.5" y="10.6" width="5" height="2.6" rx="0.6" />
    </svg>
  ),
  consensus: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  storage: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <ellipse cx="8" cy="4" rx="5" ry="1.8" />
      <path d="M3 4v8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V4" />
      <path d="M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8" />
    </svg>
  ),
  other: ({ className }) => (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="3" y="3" width="10" height="10" rx="2" />
      <path d="M6 8h4M8 6v4" strokeLinecap="round" />
    </svg>
  ),
}

export function CategoryIcon({ category, className }: { category: ComponentCategory; className?: string }) {
  const Icon = ICON_PATHS[category]
  return <Icon className={className} />
}
