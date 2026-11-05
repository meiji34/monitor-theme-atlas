// Streaming / AI service availability per node, written by scripts/media.mjs
// (probes run on each node over SSH; a snapshot bundled into the theme).

export type MediaStatus = 'yes' | 'partial' | 'no' | 'error'
export interface MediaResult {
  status: MediaStatus
  region?: string // country the service places the node in
  note?: string
}
export interface MediaData {
  generated: string
  nodes: Record<string, { checked: string; services: Record<string, MediaResult> }>
}

// `vite build --mode base` (npm run pack:base, the public release) leaves the
// deployment's own data out even when the file exists locally.
const files = import.meta.env.VITE_ATLAS_BASE
  ? {}
  : import.meta.glob<MediaData>('../data/media.json', { eager: true, import: 'default' })
export const MEDIA: MediaData | null = Object.values(files)[0] ?? null

export const mediaFor = (id: number) => MEDIA?.nodes[id] ?? null
export const mediaCheckedOn = (id: number) => {
  const d = mediaFor(id)
  return d ? new Date(d.checked).toLocaleDateString() : null
}

export const MEDIA_GROUPS: { label: string; items: { id: string; name: string }[] }[] = [
  {
    label: '影音',
    items: [
      { id: 'netflix', name: 'Netflix' },
      { id: 'disney', name: 'Disney+' },
      { id: 'youtube', name: 'YouTube Premium' },
      { id: 'prime', name: 'Prime Video' },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'chatgpt', name: 'ChatGPT' },
      { id: 'claude', name: 'Claude' },
      { id: 'gemini', name: 'Gemini' },
    ],
  },
  {
    label: '港台日',
    items: [
      { id: 'bilibili', name: 'Bilibili 港澳台' },
      { id: 'abema', name: 'Abema' },
    ],
  },
  {
    label: '音樂與社群',
    items: [
      { id: 'spotify', name: 'Spotify' },
      { id: 'tiktok', name: 'TikTok' },
    ],
  },
]

export const STATUS_LABEL: Record<MediaStatus, string> = {
  yes: '可用',
  partial: '部分可用',
  no: '不可用',
  error: '無法判斷',
}
