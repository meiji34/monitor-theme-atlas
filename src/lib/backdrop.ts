import { useEffect, useState } from 'react'

// The page background: an image behind everything, blurred and dimmed, with
// the panels turned to frosted glass over it. The site owner sets a default in
// the theme settings; a visitor can use their own (a URL, or a picture from
// their computer kept only in this browser), tune the blur and dimming, or
// switch the glass off.

export interface Backdrop {
  url: string // '' when there's no image
  blur: number // px, 0–30
  dim: number // %, 0–90
  glass: boolean // panels as frosted glass (only with an image)
  glassBlur: number // px the glass blurs what's behind it, 0–40
  glassOpacity: number // %, how solid the glass is: 10 clear … 95 nearly opaque
  own: boolean // the visitor's own image rather than the site's
}

const K = {
  url: 'atlas:bg',
  blur: 'atlas:bg-blur',
  dim: 'atlas:bg-dim',
  glass: 'atlas:glass',
  glassBlur: 'atlas:glass-blur',
  glassOpacity: 'atlas:glass-opacity',
}
const NONE = 'none' // stored when a visitor turns the site's image off

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, v: string | null): boolean {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, v)
    return true
  } catch {
    return false
  }
}

// Only pictures by URL or embedded pictures; anything else is ignored.
export function safeImageUrl(raw: string): string {
  const s = raw.trim()
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s
  try {
    const u = new URL(s, location.href)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
  } catch {
    return ''
  }
}
export const cssUrl = (u: string) => `url("${u.replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
const num = (s: string | null, fallback: number, lo: number, hi: number) => {
  const n = s === null ? NaN : Number(s)
  return Number.isFinite(n) ? clamp(n, lo, hi) : clamp(fallback, lo, hi)
}

export interface SiteBackdrop {
  background_url: string
  background_blur: number
  background_dim: number
  glass: boolean
  glass_blur: number
  glass_opacity: number
}

export interface BackdropCtl {
  bd: Backdrop
  hasSite: boolean // the owner set an image
  setUrl: (url: string) => string | null // error message, or null
  upload: (file: File) => Promise<string | null>
  hideImage: () => void
  setBlur: (v: number) => void
  setDim: (v: number) => void
  setGlass: (v: boolean) => void
  setGlassBlur: (v: number) => void
  setGlassOpacity: (v: number) => void
  reset: () => void
}

// A picture from the visitor's computer, scaled down and re-encoded so it
// fits in the browser's storage (a few hundred KB).
async function shrink(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('type')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  let out = c.toDataURL('image/webp', 0.82)
  if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.82)
  return out
}

export function useBackdrop(site: SiteBackdrop): BackdropCtl {
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)

  const stored = read(K.url)
  const siteUrl = safeImageUrl(site.background_url || '')
  const own = !!stored && stored !== NONE ? safeImageUrl(stored) : ''
  const url = stored === NONE ? '' : own || siteUrl
  const glassPref = read(K.glass)
  const bd: Backdrop = {
    url,
    blur: num(read(K.blur), site.background_blur, 0, 30),
    dim: num(read(K.dim), site.background_dim, 0, 90),
    glass: !!url && (glassPref === null ? site.glass !== false : glassPref === 'on'),
    own: !!own,
    glassBlur: num(read(K.glassBlur), site.glass_blur ?? 18, 0, 40),
    glassOpacity: num(read(K.glassOpacity), site.glass_opacity ?? 62, 10, 95),
  }

  // Glass panels and the transparent page are driven from <html>.
  useEffect(() => {
    const root = document.documentElement
    if (bd.url) root.dataset.backdrop = ''
    else delete root.dataset.backdrop
    if (bd.glass) root.dataset.glass = ''
    else delete root.dataset.glass
  }, [bd.url, bd.glass])
  // The glass's own blur and tint, read by the .panel rules in index.css.
  useEffect(() => {
    const st = document.documentElement.style
    st.setProperty('--glass-blur', `${bd.glassBlur}px`)
    st.setProperty('--glass-alpha', `${bd.glassOpacity}%`)
  }, [bd.glassBlur, bd.glassOpacity])

  return {
    bd,
    hasSite: !!siteUrl,
    setUrl: (raw) => {
      const u = safeImageUrl(raw)
      if (!u) return 'url'
      if (!write(K.url, u)) return 'storage'
      refresh()
      return null
    },
    upload: async (file) => {
      let data: string
      try {
        data = await shrink(file)
      } catch {
        return 'type'
      }
      if (!write(K.url, data)) return 'storage'
      refresh()
      return null
    },
    hideImage: () => {
      write(K.url, NONE)
      refresh()
    },
    setBlur: (v) => {
      write(K.blur, String(clamp(v, 0, 30)))
      refresh()
    },
    setDim: (v) => {
      write(K.dim, String(clamp(v, 0, 90)))
      refresh()
    },
    setGlass: (v) => {
      write(K.glass, v ? 'on' : 'off')
      refresh()
    },
    setGlassBlur: (v) => {
      write(K.glassBlur, String(clamp(v, 0, 40)))
      refresh()
    },
    setGlassOpacity: (v) => {
      write(K.glassOpacity, String(clamp(v, 10, 95)))
      refresh()
    },
    reset: () => {
      Object.values(K).forEach((k) => write(k, null))
      refresh()
    },
  }
}
