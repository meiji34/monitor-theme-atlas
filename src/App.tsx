import { useEffect, useMemo, useState } from 'react'
import { MapView, type MapPoint } from './components/MapView'
import { NodeCard, pingLines } from './components/NodeCard'
import { NodeList, StatusBar } from './components/NodeList'
import { NodePanel } from './components/NodePanel'
import type { VisitorSettings } from './components/Settings'
import { Summary } from './components/Summary'
import { TopNav } from './components/TopNav'
import { fetchMe } from './lib/api'
import { MediaContext, useMediaProvider } from './lib/useMedia'
import { useThemeConfig } from './lib/config'
import { hubTopology, locate, parseLocations, parseTopology, type LngLat, type Place } from './lib/geo'
import { useLiveNodes, usePingSeries } from './lib/live'
import { asColours, routeFor } from './lib/routes'
import { useRoute } from './lib/router'
import type { Me, Node } from './lib/types'
import { LatencyView } from './views/LatencyView'
import { NodeDetail } from './views/NodeDetail'
import { TableView } from './views/TableView'

// Group buckets: real group names plus one ungrouped bucket. A symbol keeps
// the ungrouped key out of the namespace of free-text group names.
const ALL = Symbol('all')
const UNGROUPED = Symbol('ungrouped')
type GroupKey = string | typeof ALL | typeof UNGROUPED

// Visitor-only preferences; site-wide defaults come from the theme settings.
function usePref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void, () => void] {
  const [value, setValue] = useState<T | null>(() => {
    try {
      const v = localStorage.getItem(key) as T | null
      return v && allowed.includes(v) ? v : null
    } catch {
      return null
    }
  })
  const set = (v: T) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      /* private mode etc.: keep it for this page only */
    }
  }
  // Back to the owner's default (which may itself change later).
  const reset = () => {
    setValue(null)
    try {
      localStorage.removeItem(key)
    } catch {
      /* nothing stored */
    }
  }
  return [value ?? fallback, set, reset]
}

const LABELS = ['speed', 'name', 'name_speed', 'off'] as const
const ON_OFF = ['on', 'off'] as const

export default function App() {
  const cfg = useThemeConfig()
  const route = useRoute()
  const { nodes, loaded, error, mode: liveMode } = useLiveNodes()
  const [me, setMe] = useState<Me>({})
  const media = useMediaProvider(!!me.authed)
  const [group, setGroup] = useState<GroupKey>(ALL)
  const [query, setQuery] = useState('')
  const [focus, setFocus] = useState<LngLat | null>(null)
  const [mapMode, setMapMode, resetMapMode] = usePref('atlas:map-mode', cfg.map_mode, ['globe', 'flat'] as const)
  const [topo, setTopo, resetTopo] = usePref('atlas:topology', cfg.show_topology ? 'on' : 'off', ON_OFF)
  const [spin, setSpin, resetSpin] = usePref('atlas:rotate', cfg.globe_autorotate ? 'on' : 'off', ON_OFF)
  const [labels, setLabels, resetLabels] = usePref('atlas:labels', cfg.map_labels, LABELS)
  const [lit, setLit, resetLit] = usePref('atlas:lit', cfg.light_countries ? 'on' : 'off', ON_OFF)
  const [routesPref, setRoutes, resetRoutes] = usePref('atlas:routes', cfg.topology_routes ? 'on' : 'off', ON_OFF)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    fetchMe().then(setMe, () => {})
  }, [])
  useEffect(() => {
    if (me.site_name) document.title = me.site_name
  }, [me.site_name])

  const sorted = useMemo(() => {
    const list = [...nodes].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id)
    return cfg.offline_last ? list.sort((a, b) => Number(b.online) - Number(a.online)) : list
  }, [nodes, cfg.offline_last])

  // Groups in order of first appearance, not alphabetically.
  const groups = useMemo(() => {
    const seen: string[] = []
    for (const n of sorted) if (n.group && !seen.includes(n.group)) seen.push(n.group)
    return seen
  }, [sorted])
  const hasUngrouped = sorted.some((n) => !n.group)

  const inGroup = (n: Node) => (group === ALL ? true : group === UNGROUPED ? !n.group : n.group === group)
  const grouped = sorted.filter(inGroup)
  const visible = grouped.filter(
    (n) =>
      !query ||
      [n.name, n.group, n.country, n.arch, n.virt].filter(Boolean).some((s) => s!.toLowerCase().includes(query.toLowerCase())),
  )

  const overrides = useMemo(() => parseLocations(cfg.locations), [cfg.locations])
  const places = useMemo(() => {
    const m = new Map<number, Place>()
    for (const n of sorted) {
      const p = locate(n, overrides)
      if (p) m.set(n.id, p)
    }
    return m
  }, [sorted, overrides])

  // The overview map always shows every node; group tabs belong to the list pages.
  const points = useMemo(() => {
    const byKey = new Map<string, MapPoint>()
    for (const n of sorted) {
      const p = places.get(n.id)
      if (!p) continue
      const key = `${p.coord[0].toFixed(2)},${p.coord[1].toFixed(2)}`
      const pt = byKey.get(key) ?? {
        key,
        coord: p.coord,
        label: p.label,
        nodes: [],
      }
      pt.nodes.push(n)
      byKey.set(key, pt)
    }
    return [...byKey.values()]
  }, [sorted, places])
  const links = useMemo(() => {
    const custom = cfg.topology_mode === 'hub' ? [] : parseTopology(cfg.topology, sorted, places)
    if (cfg.topology_mode === 'custom' || custom.length) return custom
    return hubTopology(cfg.topology_hub, sorted, places)
  }, [cfg.topology, cfg.topology_mode, cfg.topology_hub, sorted, places])
  // Traced routes only matter when some shown link has one.
  const hasRoutes = useMemo(() => links.some((l) => routeFor(l)), [links])
  const asColour = useMemo(() => asColours(places), [places])
  const routesOn = hasRoutes && topo === 'on' && routesPref === 'on'

  const ids = useMemo(() => sorted.map((n) => n.id), [sorted])
  const ping = usePingSeries(ids)
  const wanted = cfg.ping_lines
    .split(/[\n,;，；]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const linesFor = (n: Node) => pingLines(ping[n.id], wanted)

  const focusNode = (n: Node) => {
    const p = places.get(n.id)
    if (p) setFocus([...p.coord])
  }

  const tab = (key: GroupKey, label: string, count: number) => (
    <button
      key={typeof key === 'string' ? key : key.toString()}
      onClick={() => setGroup(key)}
      className={`rounded-md px-3 py-1.5 text-[13px] ${
        group === key ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
      }`}
    >
      {label} <span className="font-mono text-[11px] opacity-70">{count}</span>
    </button>
  )

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1 shadow-sm">
        {tab(ALL, '全部', sorted.length)}
        {groups.map((g) => tab(g, g, sorted.filter((n) => n.group === g).length))}
        {hasUngrouped && groups.length > 0 && tab(UNGROUPED, '未分組', sorted.filter((n) => !n.group).length)}
      </nav>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋名稱／國家／架構"
        className="w-56 rounded-lg border border-line bg-white px-3 py-2 text-[13px] shadow-sm outline-none placeholder:text-muted focus:border-primary/50"
      />
    </div>
  )

  const cards = (list: Node[], withFocus: boolean) => (
    <main className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {list.map((n) => (
        <NodeCard
          key={n.id}
          node={n}
          lines={linesFor(n)}
          onFocus={withFocus ? () => focusNode(n) : undefined}
          showMedia={cfg.show_media}
        />
      ))}
    </main>
  )

  const settings: VisitorSettings = {
    mapMode,
    setMapMode,
    spin: spin === 'on',
    setSpin: (v) => setSpin(v ? 'on' : 'off'),
    topology: links.length ? topo === 'on' : null,
    setTopology: (v) => setTopo(v ? 'on' : 'off'),
    routes: hasRoutes ? routesPref === 'on' : null,
    setRoutes: (v) => setRoutes(v ? 'on' : 'off'),
    labels,
    setLabels,
    lit: lit === 'on',
    setLit: (v) => setLit(v ? 'on' : 'off'),
    reset: () => [resetMapMode, resetTopo, resetSpin, resetLabels, resetLit, resetRoutes].forEach((r) => r()),
  }

  let body: React.ReactNode
  if (!loaded) {
    body = <div className="py-20 text-center text-muted">載入中…</div>
  } else if (route.view === 'node') {
    body = <NodeDetail id={route.id} nodes={sorted} historyDays={me.history_days ?? 30} showMedia={cfg.show_media} />
  } else if (route.view === 'cards') {
    body = (
      <>
        {cfg.show_summary && <Summary nodes={grouped} />}
        {toolbar}
        {cards(visible, false)}
      </>
    )
  } else if (route.view === 'table') {
    body = (
      <>
        {toolbar}
        <TableView nodes={visible} lines={linesFor} />
      </>
    )
  } else if (route.view === 'latency') {
    body = (
      <>
        {toolbar}
        <LatencyView nodes={visible} ping={ping} />
      </>
    )
  } else if (!cfg.show_map) {
    // Map switched off by the owner: the overview falls back to the card wall.
    body = (
      <>
        {cfg.show_summary && <Summary nodes={grouped} />}
        {toolbar}
        {cards(visible, false)}
      </>
    )
  } else {
    const picked = selected === null ? undefined : sorted.find((n) => n.id === selected)
    const select = (n: Node) => {
      setSelected(n.id)
      focusNode(n)
    }
    body = (
      <section className="grid grid-cols-1 gap-4 lg:h-[calc(100vh-7.75rem)] lg:min-h-[540px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[62vh] min-h-[380px] lg:h-full">
          <MapView
            fill
            points={points}
            links={links}
            mode={mapMode}
            onModeChange={setMapMode}
            rotation={{
              on: spin === 'on',
              toggle: () => setSpin(spin === 'on' ? 'off' : 'on'),
            }}
            focus={focus}
            labels={labels}
            lightCountries={lit === 'on'}
            nodes={sorted}
            topology={
              links.length
                ? {
                    on: topo === 'on',
                    toggle: () => setTopo(topo === 'on' ? 'off' : 'on'),
                  }
                : null
            }
            routes={
              hasRoutes
                ? {
                    on: routesOn,
                    toggle: () => setRoutes(routesPref === 'on' ? 'off' : 'on'),
                    colours: asColour,
                  }
                : null
            }
            onSelect={(p) => select(p.nodes[0])}
          />
        </div>
        <div className="h-[70vh] min-h-0 lg:h-full">
          {picked ? (
            <NodePanel
              node={picked}
              ping={ping[picked.id]}
              onBack={() => setSelected(null)}
              routes={
                routesOn
                  ? links.filter((l) => routeFor(l) && [l.from, l.to].some((e) => e.kind === 'node' && e.node.id === picked.id))
                  : []
              }
              asColour={asColour}
              placeLabel={(id) => places.get(id)?.label ?? `#${id}`}
              showMedia={cfg.show_media}
            />
          ) : (
            <NodeList nodes={sorted} onFocus={select} />
          )}
        </div>
      </section>
    )
  }

  return (
    <MediaContext.Provider value={media}>
      <TopNav
        settings={settings}
        authed={!!me.authed}
        route={route}
        siteName={me.site_name || 'Monitor'}
        online={sorted.filter((n) => n.online).length}
        total={sorted.length}
      />
      <div className="page-w mx-auto flex flex-col gap-4 px-4 pt-4 pb-14 sm:px-6">
        {cfg.notice && (
          <div className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-2.5 text-[13px] text-warn">{cfg.notice}</div>
        )}
        {error && !nodes.length && (
          <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-[13px] text-bad">
            無法取得節點資料：{error}
          </div>
        )}

        {body}

        <StatusBar nodes={sorted} live={liveMode} />
      </div>
    </MediaContext.Provider>
  )
}
