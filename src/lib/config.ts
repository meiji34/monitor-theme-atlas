import { useEffect, useState } from 'react'
import manifest from '../../theme.json'
import { fetchThemeConfig } from './api'

export interface ThemeConfig {
  show_map: boolean
  map_mode: 'globe' | 'flat'
  globe_autorotate: boolean
  light_countries: boolean
  cable_grey: boolean
  map_labels: 'speed' | 'name' | 'name_speed' | 'off'
  locations: string
  show_topology: boolean
  topology_mode: 'auto' | 'hub' | 'custom'
  topology_hub: string
  topology: string
  topology_routes: boolean
  show_summary: boolean
  show_media: boolean
  ping_lines: string
  offline_last: boolean
  notice: string
  background_url: string
  background_blur: number
  background_dim: number
  glass: boolean
  default_lang: 'auto' | 'zh-Hant' | 'zh-Hans' | 'en'
  color_scheme: 'system' | 'light' | 'dark'
}

type Item = {
  key?: string
  type: string
  default?: unknown
  min?: number
  max?: number
  options?: { value: string; label?: string }[]
}

const items = (manifest.config as Item[]).filter((i) => i.key && i.type !== 'title')

const defaults = Object.fromEntries(items.map((i) => [i.key, i.default])) as unknown as ThemeConfig

// The hub stores whatever the panel sent; keep only values that still fit
// the declaration so a stale or mistyped value falls back to the default.
function valid(item: Item, v: unknown): boolean {
  switch (item.type) {
    case 'boolean':
      return typeof v === 'boolean'
    case 'number':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        (item.min === undefined || v >= item.min) &&
        (item.max === undefined || v <= item.max)
      )
    case 'select':
      return typeof v === 'string' && !!item.options?.some((o) => o.value === v)
    default:
      return typeof v === 'string'
  }
}

// In `npm run dev` only, theme.dev.json (git-ignored, optional) stands in for
// the values an owner would save in the panel, since the theme isn't
// installed on the hub being proxied.
const devOverrides = import.meta.env.DEV
  ? (Object.values(import.meta.glob('../../theme.dev.json', { eager: true, import: 'default' }))[0] as
      | Record<string, unknown>
      | undefined)
  : undefined

export function useThemeConfig(): ThemeConfig {
  const [cfg, setCfg] = useState<ThemeConfig>(defaults)
  useEffect(() => {
    fetchThemeConfig(manifest.short).then((fromHub) => {
      const saved = { ...fromHub, ...devOverrides }
      const merged: Record<string, unknown> = { ...defaults }
      for (const item of items) {
        let v = saved[item.key!]
        // Komari's select options are plain strings, so the package lists the labels.
        if (item.type === 'select' && typeof v === 'string') v = item.options?.find((o) => o.label === v)?.value ?? v
        if (v !== undefined && valid(item, v)) merged[item.key!] = v
      }
      setCfg(merged as unknown as ThemeConfig)
    })
  }, [])
  return cfg
}
