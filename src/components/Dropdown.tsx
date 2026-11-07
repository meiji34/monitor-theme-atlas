import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface Option<T> {
  value: T
  label: string
}

// A select in the theme's own style: a button, and a listbox drawn in a portal
// at fixed coordinates, so it isn't clipped by a dialog or a scrolling panel
// and stays on screen near the edges (opening upwards when there's no room
// below). On phones it's a sheet at the bottom of the screen.
//
// Keyboard: Enter / Space / ↓ open it; ↑ ↓ Home End move; Enter or Space
// picks; Esc or Tab closes; typing a letter jumps to the next match.
export function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  label,
  icon,
  align = 'start',
  className = '',
}: {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  label: string // accessible name; also the sheet's title on phones
  icon?: React.ReactNode
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; minWidth: number; maxHeight: number } | null>(null)
  const [sheet, setSheet] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const current = options.findIndex((o) => o.value === value)
  const typed = useRef({ text: '', at: 0 })

  const place = () => {
    const b = btn.current?.getBoundingClientRect()
    if (!b) return
    const phone = window.innerWidth < 640
    setSheet(phone)
    if (phone) return
    const gap = 6
    const below = window.innerHeight - b.bottom - gap - 8
    const above = b.top - gap - 8
    const want = Math.min(320, options.length * 36 + 12)
    const up = below < want && above > below
    const width = Math.max(b.width, 140)
    let left = align === 'end' ? b.right - width : b.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    setPos({
      left,
      minWidth: width,
      maxHeight: Math.max(120, up ? above : below),
      ...(up ? { bottom: window.innerHeight - b.top + gap } : { top: b.bottom + gap }),
    })
  }

  const show = (at = current < 0 ? 0 : current) => {
    setActive(at)
    place()
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  const pick = (i: number) => {
    const o = options[i]
    if (o) onChange(o.value)
    close()
  }

  useLayoutEffect(() => {
    if (open) list.current?.focus({ preventScroll: true })
  }, [open])
  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  // Outside clicks close it; scrolling or resizing moves it along.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false)
    }
    const onMove = () => place()
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1
    const go = (i: number) => {
      e.preventDefault()
      setActive(Math.max(0, Math.min(last, i)))
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(active + 1)
      case 'ArrowUp':
        return go(active - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(last)
      case 'Enter':
      case ' ':
        e.preventDefault()
        return pick(active)
      case 'Escape':
        // Only the list closes, not a dialog it sits in.
        e.preventDefault()
        e.stopPropagation()
        return close()
      case 'Tab':
        return close()
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      const t = typed.current
      t.text = now - t.at < 700 ? t.text + e.key.toLowerCase() : e.key.toLowerCase()
      t.at = now
      const from = t.text.length > 1 ? active : active + 1
      const order = [...options.keys()].map((k) => (k + from) % options.length)
      const hit = order.find((i) => options[i].label.toLowerCase().startsWith(t.text))
      if (hit !== undefined) setActive(hit)
    }
  }

  const items = options.map((o, i) => {
    const selected = o.value === value
    return (
      <div
        key={String(o.value)}
        id={`${id}-${i}`}
        data-i={i}
        role="option"
        aria-selected={selected}
        onPointerEnter={() => setActive(i)}
        onClick={() => pick(i)}
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 whitespace-nowrap ${
          sheet ? 'py-3 text-[15px]' : 'py-2 text-[13.5px]'
        } ${i === active ? 'bg-primary-soft text-fg' : 'text-fg/85'} ${selected ? 'font-semibold text-primary!' : ''}`}
      >
        <span>{o.label}</span>
        {selected && (
          <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        )}
      </div>
    )
  })

  const listbox = (extra: string, style?: React.CSSProperties) => (
    <div
      ref={list}
      role="listbox"
      tabIndex={-1}
      aria-label={label}
      aria-activedescendant={`${id}-${active}`}
      onKeyDown={onListKey}
      style={style}
      className={`glass overflow-y-auto border border-line bg-raised p-1.5 shadow-2xl outline-none ${extra}`}
    >
      {items}
    </div>
  )

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && !open) {
            e.preventDefault()
            show(e.key === 'ArrowUp' ? Math.max(0, current - 1) : current < 0 ? 0 : current)
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-line bg-card text-[13px] whitespace-nowrap text-muted outline-none hover:border-primary/40 hover:text-fg focus-visible:border-primary/60 ${
          open ? 'border-primary/50 text-fg' : ''
        } ${className}`}
      >
        {icon}
        <span className="font-medium">{options[current]?.label ?? ''}</span>
        <svg viewBox="0 0 12 12" className={`size-3 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </button>
      {open &&
        createPortal(
          sheet ? (
            <div className="fixed inset-0 z-[80] flex flex-col justify-end">
              <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
              <div className="relative">
                <div className="glass rounded-t-2xl border border-b-0 border-line bg-raised px-3 pt-3 pb-1 shadow-2xl">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
                  <div className="px-2 pb-1 text-[13px] text-muted">{label}</div>
                </div>
                {listbox('max-h-[60vh] rounded-none border-t-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]')}
              </div>
            </div>
          ) : (
            pos && listbox('fixed z-[80] rounded-xl', { left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.minWidth, maxHeight: pos.maxHeight })
          ),
          document.body,
        )}
    </>
  )
}
