import { cssUrl, type Backdrop as BD } from '../lib/backdrop'

// The background picture, fixed behind the page. Blurred a little past its
// edges (scaled up so the blur doesn't show a soft border), then dimmed with
// the page colour so text on the glass panels stays readable.
export function Backdrop({ bd }: { bd: BD }) {
  if (!bd.url) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: cssUrl(bd.url),
          filter: bd.blur ? `blur(${bd.blur}px)` : undefined,
          transform: bd.blur ? `scale(${1 + bd.blur / 120})` : undefined,
        }}
      />
      <div className="absolute inset-0 bg-bg" style={{ opacity: bd.dim / 100 }} />
    </div>
  )
}
