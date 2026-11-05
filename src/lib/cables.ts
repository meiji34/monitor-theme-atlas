import type { LngLat } from './geo'

// The submarine cable base map: TeleGeography's Submarine Cable Map as they
// published it on GitHub under CC BY-NC-SA 3.0 (snapshot 2022-08-05), written
// by scripts/import-cables.mjs. Loaded on demand; a theme built without the
// file just draws no cables.

export interface Cable {
  name: string
  color: string
  rfs: number | null
  planned: boolean // still planned at the snapshot
  length: string | null
  owners: string[]
  paths: LngLat[][]
}
export interface CableData {
  source: {
    title: string
    author: string
    snapshot: string
    url: string
    license: string
    licenseUrl: string
    changes: string
  }
  cables: Cable[]
}

// `vite build --mode base` (npm run pack:base, the public release) leaves the
// deployment's own data out even when the file exists locally.
const files = import.meta.env.VITE_ATLAS_BASE ? {} : import.meta.glob<CableData>('../data/cables.json', { import: 'default' })
const load = Object.values(files)[0]
let pending: Promise<CableData> | null = null
export const hasCables = !!load
export function loadCables(): Promise<CableData> | null {
  if (!load) return null
  pending ??= load()
  return pending
}
