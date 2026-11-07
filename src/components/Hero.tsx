import { useEffect, useMemo, useState } from 'react'
import manifest from '../../theme.json'
import { safeImageUrl } from '../lib/backdrop'
import { locale, t } from '../lib/i18n'

export interface HeroImage {
  name: string
  url: string
  focus: string // CSS object-position: the point of the picture kept in frame
}

const FOCUS = /^(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%$/
const DEFAULT_FOCUS = '50% 35%'

// "name | url | focus" per line, name and focus optional: a bare URL is named
// after its position; focus is "x% y%", the spot of the picture (a face, say)
// that must stay in frame, default 50% 35%. Lines that aren't an http(s) or
// site-relative image address are dropped.
export function parseHeroImages(text: string): HeroImage[] {
  const out: HeroImage[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split('|').map((p) => p.trim())
    const [name, rawUrl, rawFocus] = parts.length === 1 ? ['', parts[0], ''] : parts
    const url = safeImageUrl(rawUrl ?? '')
    const f = FOCUS.exec(rawFocus ?? '')
    const focus = f && Number(f[1]) <= 100 && Number(f[2]) <= 100 ? `${f[1]}% ${f[2]}%` : DEFAULT_FOCUS
    if (url && !url.startsWith('data:')) out.push({ name, url, focus })
  }
  return out
}

const KEY = 'atlas:hero'
const readIndex = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

function Arrow({ dir, onClick, label }: { dir: 'prev' | 'next'; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg border border-white/25 bg-black/25 text-white/90 backdrop-blur-sm hover:bg-black/40"
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d={dir === 'prev' ? 'M7.5 3 4.5 6l3 3' : 'M4.5 3l3 3-3 3'} />
      </svg>
    </button>
  )
}

// The banner above the overview: an eyebrow, the site's headline and a
// subtitle over the owner's pictures (switchable, optionally rotating), with
// a live status line. Without pictures it's a plain glass card.
export function Hero({
  eyebrow,
  title,
  subtitle,
  images,
  rotate,
  avatar,
  online,
  total,
}: {
  eyebrow: string
  title: string
  subtitle: string
  images: HeroImage[]
  rotate: number // seconds, 0 = manual only
  avatar: string
  online: number
  total: number
}) {
  const [index, setIndex] = useState(readIndex)
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState<Set<string>>(new Set())
  const [paused, setPaused] = useState(false)
  const [avatarOk, setAvatarOk] = useState(true)
  const usable = useMemo(() => images.filter((i) => !failed.has(i.url)), [images, failed])
  const at = usable.length ? ((index % usable.length) + usable.length) % usable.length : 0
  const current = usable[at]

  const go = (step: number) =>
    setIndex((i) => {
      const n = usable.length ? (((i + step) % usable.length) + usable.length) % usable.length : 0
      try {
        localStorage.setItem(KEY, String(n))
      } catch {
        /* this page only */
      }
      return n
    })

  useEffect(() => {
    if (!rotate || usable.length < 2 || paused) return
    const timer = window.setInterval(() => !document.hidden && go(1), Math.max(5, rotate) * 1000)
    return () => clearInterval(timer)
  }, [rotate, usable.length, paused]) // eslint-disable-line react-hooks/exhaustive-deps

  // The next picture is fetched ahead so switching fades instead of popping.
  const next = usable.length > 1 ? usable[(at + 1) % usable.length] : undefined
  const avatarUrl = safeImageUrl(avatar)
  const date = new Date().toLocaleDateString(locale(), { year: 'numeric', month: '2-digit', day: '2-digit' })
  const hasImage = !!current
  // The name chip and arrows only mean something with more than one picture.
  const switchable = usable.length > 1

  return (
    <section
      // With a picture the banner keeps one shape (about 4.7 : 1) from laptop
      // to wide screen, so the same part of the picture shows everywhere and
      // the focus point (a face) stays whole; phones size it by its text.
      className={`panel relative isolate overflow-hidden ${hasImage ? 'sm:aspect-[47/10] sm:max-h-[400px]' : ''}`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      aria-label={title}
    >
      {/* Picture layers: every usable one stacked, only the current visible. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--color-primary)_22%,transparent),transparent_55%,color-mix(in_srgb,var(--color-accent)_16%,transparent))]">
        {/* The picture covers the whole banner, kept around its focus point. */}
        <div className="absolute inset-0">
        {usable.map((img) =>
          img === current || img === next || loaded.has(img.url) ? (
            <img
              key={img.url}
              src={img.url}
              alt=""
              decoding="async"
              loading={img === current ? 'eager' : 'lazy'}
              onLoad={() => setLoaded((s) => new Set(s).add(img.url))}
              onError={() => setFailed((s) => new Set(s).add(img.url))}
              style={{ objectPosition: img.focus }}
              className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${
                img === current && loaded.has(img.url) ? 'opacity-100' : 'opacity-0'
              }`}
            />
          ) : null,
        )}
        </div>
        {hasImage && (
          // A tint under the headline only, so the picture stays bright elsewhere.
          <div className="absolute inset-0 bg-[linear-gradient(0deg,color-mix(in_srgb,var(--color-card)_88%,transparent)_0%,color-mix(in_srgb,var(--color-card)_55%,transparent)_45%,transparent_72%)] sm:bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-card)_70%,transparent)_0%,color-mix(in_srgb,var(--color-card)_35%,transparent)_28%,transparent_45%)]" />
        )}
      </div>

      <div className={`flex items-stretch gap-4 p-4 sm:h-full sm:min-h-[210px] sm:p-6 lg:p-8 ${hasImage ? 'min-h-[270px]' : 'min-h-[150px]'}`}>
        <div className={`flex min-w-0 flex-1 flex-col gap-1.5 sm:justify-center sm:gap-2 sm:pb-0 ${hasImage ? `justify-end ${switchable ? 'pb-10' : ''}` : 'justify-center'}`}>
          {eyebrow && (
            <div className={`items-center gap-2 font-mono text-[11.5px] font-semibold tracking-[0.18em] text-accent uppercase sm:flex sm:text-[12px] ${hasImage ? 'hidden' : 'flex'}`}>
              <span className="h-px w-5 bg-accent" />
              <span className="truncate">{eyebrow}</span>
            </div>
          )}
          <h1 className="font-display text-[26px] leading-[1.1] font-bold tracking-[0.01em] break-words sm:text-[40px]">{title}</h1>
          {subtitle && <p className="text-[13.5px] text-muted sm:text-[15px]">{subtitle}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted sm:mt-2 sm:text-[13px]">
            <span className="flex items-center gap-2 text-fg">
              <span className="eq" aria-hidden>
                <i />
                <i />
                <i />
                <i />
              </span>
              {t('{n} / {total} 台伺服器在線', { n: online, total })}
            </span>
            <span className="h-3 w-px bg-line" />
            <span className="font-mono">{date}</span>
            <span className="hidden h-3 w-px bg-line sm:block" />
            <span className="font-mono">ATLAS v{manifest.version}</span>
          </div>
        </div>

        {(switchable || (avatarUrl && avatarOk)) && (
          <div className="absolute right-3 bottom-3 flex shrink-0 flex-col items-end justify-between gap-2 sm:static">
            {avatarUrl && avatarOk ? (
              <img
                src={avatarUrl}
                alt=""
                loading="lazy"
                onError={() => setAvatarOk(false)}
                className="hidden size-24 rounded-2xl border border-white/25 object-cover shadow-lg sm:block lg:size-28"
              />
            ) : (
              <span />
            )}
            {switchable && (
              <div className="flex items-center gap-1.5">
                <span className="rounded-md border border-white/25 bg-black/30 px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.12em] text-white/95 uppercase backdrop-blur-sm">
                  {(current.name || t('圖片')).slice(0, 24)} / {String(at + 1).padStart(2, '0')}
                </span>
                {usable.length > 1 && (
                  <>
                    <Arrow dir="prev" onClick={() => go(-1)} label={t('上一張')} />
                    <Arrow dir="next" onClick={() => go(1)} label={t('換一張')} />
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
