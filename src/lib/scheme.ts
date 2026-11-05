import { createContext, useContext } from 'react'

// Light or dark, resolved from the visitor's choice (or the system's).
// SVG drawings (map, charts) can't read CSS variables in every attribute, so
// they pick their palette from this.
export type Scheme = 'system' | 'light' | 'dark'
export const SCHEMES = ['system', 'light', 'dark'] as const
export const DarkContext = createContext(false)
export const useDark = () => useContext(DarkContext)
