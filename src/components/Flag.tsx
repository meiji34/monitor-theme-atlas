import * as flags from 'country-flag-icons/string/3x2'

const svgs = flags as unknown as Record<string, string>

// SVG strings ship with the theme; going through a data URL in <img>/<image>
// keeps any markup out of the page DOM.
export function flagDataUrl(code?: string): string | null {
  const svg = code ? svgs[code.toUpperCase()] : undefined
  return svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : null
}

export function Flag({ code, className = 'h-3.5 w-5' }: { code?: string; className?: string }) {
  const src = flagDataUrl(code)
  if (!src) {
    return (
      <span className={`${className} inline-flex items-center justify-center rounded-[2px] bg-line text-[8px] text-muted`}>
        {code?.toUpperCase() || '??'}
      </span>
    )
  }
  return (
    <img src={src} alt={code} className={`${className} shrink-0 rounded-[2px] object-cover ring-1 ring-black/10`} />
  )
}
