import type { Node } from './types'

// [longitude, latitude], the order d3-geo expects.
export type LngLat = [number, number]

interface City {
  name: string
  coord: LngLat
  // Matched case-insensitively against node names and config entries.
  // Short IATA-style codes only match as whole words.
  aliases: string[]
}

const CITIES: City[] = [
  { name: 'Hong Kong', coord: [114.17, 22.32], aliases: ['hong kong', 'hongkong', '香港', 'HKG', 'HK'] },
  { name: 'Taipei', coord: [121.56, 25.03], aliases: ['taipei', '台北', '臺北', 'TPE'] },
  { name: 'Tokyo', coord: [139.69, 35.69], aliases: ['tokyo', '东京', '東京', 'TYO', 'NRT', 'HND'] },
  { name: 'Osaka', coord: [135.5, 34.69], aliases: ['osaka', '大阪', 'KIX'] },
  { name: 'Seoul', coord: [126.98, 37.57], aliases: ['seoul', '首尔', '首爾', 'ICN', 'SEL'] },
  { name: 'Singapore', coord: [103.82, 1.35], aliases: ['singapore', '新加坡', '狮城', '獅城', 'SIN', 'SG'] },
  { name: 'Kuala Lumpur', coord: [101.69, 3.14], aliases: ['kuala lumpur', '吉隆坡', 'KUL'] },
  { name: 'Bangkok', coord: [100.5, 13.75], aliases: ['bangkok', '曼谷', 'BKK'] },
  { name: 'Ho Chi Minh City', coord: [106.63, 10.82], aliases: ['ho chi minh', 'saigon', '胡志明', 'SGN'] },
  { name: 'Jakarta', coord: [106.85, -6.21], aliases: ['jakarta', '雅加达', '雅加達', 'CGK'] },
  { name: 'Manila', coord: [120.98, 14.6], aliases: ['manila', '马尼拉', '馬尼拉', 'MNL'] },
  { name: 'Mumbai', coord: [72.88, 19.08], aliases: ['mumbai', '孟买', '孟買', 'BOM'] },
  { name: 'Dubai', coord: [55.27, 25.2], aliases: ['dubai', '迪拜', '杜拜', 'DXB'] },
  { name: 'Beijing', coord: [116.41, 39.9], aliases: ['beijing', '北京', 'PEK'] },
  { name: 'Shanghai', coord: [121.47, 31.23], aliases: ['shanghai', '上海', 'SHA', 'PVG'] },
  { name: 'Guangzhou', coord: [113.26, 23.13], aliases: ['guangzhou', '广州', '廣州', 'CAN'] },
  { name: 'Shenzhen', coord: [114.06, 22.54], aliases: ['shenzhen', '深圳', 'SZX'] },
  { name: 'Hangzhou', coord: [120.16, 30.27], aliases: ['hangzhou', '杭州', 'HGH'] },
  { name: 'Chengdu', coord: [104.07, 30.57], aliases: ['chengdu', '成都', 'CTU'] },
  { name: 'Sydney', coord: [151.21, -33.87], aliases: ['sydney', '悉尼', '雪梨', 'SYD'] },
  { name: 'Melbourne', coord: [144.96, -37.81], aliases: ['melbourne', '墨尔本', '墨爾本', 'MEL'] },
  { name: 'Brisbane', coord: [153.03, -27.47], aliases: ['brisbane', '布里斯班', 'BNE'] },
  { name: 'Perth', coord: [115.86, -31.95], aliases: ['perth', '珀斯', 'PER'] },
  { name: 'Auckland', coord: [174.76, -36.85], aliases: ['auckland', '奥克兰', '奧克蘭', 'AKL'] },
  { name: 'Los Angeles', coord: [-118.24, 34.05], aliases: ['los angeles', '洛杉矶', '洛杉磯', 'LAX', 'LA'] },
  { name: 'San Jose', coord: [-121.89, 37.34], aliases: ['san jose', '圣何塞', '聖荷西', '硅谷', '矽谷', 'SJC'] },
  { name: 'San Francisco', coord: [-122.42, 37.77], aliases: ['san francisco', '旧金山', '舊金山', 'SFO'] },
  { name: 'Seattle', coord: [-122.33, 47.61], aliases: ['seattle', '西雅图', '西雅圖', 'SEA'] },
  { name: 'Phoenix', coord: [-112.07, 33.45], aliases: ['phoenix', '凤凰城', '鳳凰城', 'PHX'] },
  { name: 'Las Vegas', coord: [-115.14, 36.17], aliases: ['las vegas', '拉斯维加斯', '拉斯維加斯', 'LAS'] },
  { name: 'Denver', coord: [-104.99, 39.74], aliases: ['denver', '丹佛', 'DEN'] },
  { name: 'Dallas', coord: [-96.8, 32.78], aliases: ['dallas', '达拉斯', '達拉斯', 'DFW'] },
  { name: 'Kansas City', coord: [-94.58, 39.1], aliases: ['kansas city', '堪萨斯城', '堪薩斯城', 'MCI'] },
  { name: 'St. Louis', coord: [-90.2, 38.63], aliases: ['st. louis', 'st louis', 'saint louis', '圣路易斯', '聖路易斯', 'STL'] },
  { name: 'Chicago', coord: [-87.63, 41.88], aliases: ['chicago', '芝加哥', 'ORD'] },
  { name: 'Atlanta', coord: [-84.39, 33.75], aliases: ['atlanta', '亚特兰大', '亞特蘭大', 'ATL'] },
  { name: 'Miami', coord: [-80.19, 25.76], aliases: ['miami', '迈阿密', '邁阿密', 'MIA'] },
  { name: 'Ashburn', coord: [-77.49, 39.04], aliases: ['ashburn', 'virginia', '弗吉尼亚', '維吉尼亞', 'IAD'] },
  { name: 'New York', coord: [-74.01, 40.71], aliases: ['new york', '纽约', '紐約', 'NYC', 'JFK'] },
  { name: 'Toronto', coord: [-79.38, 43.65], aliases: ['toronto', '多伦多', '多倫多', 'YYZ'] },
  { name: 'Montreal', coord: [-73.57, 45.5], aliases: ['montreal', 'montréal', '蒙特利尔', '蒙特利爾', '蒙特婁', 'YUL', 'MTL'] },
  { name: 'Vancouver', coord: [-123.12, 49.28], aliases: ['vancouver', '温哥华', '溫哥華', 'YVR'] },
  { name: 'São Paulo', coord: [-46.63, -23.55], aliases: ['sao paulo', 'são paulo', '圣保罗', '聖保羅', 'GRU'] },
  { name: 'London', coord: [-0.13, 51.51], aliases: ['london', '伦敦', '倫敦', 'LHR', 'LON'] },
  { name: 'Amsterdam', coord: [4.9, 52.37], aliases: ['amsterdam', '阿姆斯特丹', 'AMS'] },
  { name: 'Frankfurt', coord: [8.68, 50.11], aliases: ['frankfurt', '法兰克福', '法蘭克福', 'FRA'] },
  { name: 'Paris', coord: [2.35, 48.86], aliases: ['paris', '巴黎', 'CDG'] },
  { name: 'Stockholm', coord: [18.07, 59.33], aliases: ['stockholm', '斯德哥尔摩', '斯德哥爾摩', 'ARN'] },
  { name: 'Helsinki', coord: [24.94, 60.17], aliases: ['helsinki', '赫尔辛基', '赫爾辛基', 'HEL'] },
  { name: 'Warsaw', coord: [21.01, 52.23], aliases: ['warsaw', '华沙', '華沙', 'WAW'] },
  { name: 'Milan', coord: [9.19, 45.46], aliases: ['milan', '米兰', '米蘭', 'MXP'] },
  { name: 'Madrid', coord: [-3.7, 40.42], aliases: ['madrid', '马德里', '馬德里', 'MAD'] },
  { name: 'Istanbul', coord: [28.98, 41.01], aliases: ['istanbul', '伊斯坦布尔', '伊斯坦堡', 'IST'] },
  { name: 'Moscow', coord: [37.62, 55.76], aliases: ['moscow', '莫斯科', 'MOW'] },
  { name: 'Johannesburg', coord: [28.05, -26.2], aliases: ['johannesburg', '约翰内斯堡', '約翰尼斯堡', 'JNB'] },
  // McMurdo Station, the continent's largest base.
  { name: 'Antarctica', coord: [166.67, -77.85], aliases: ['antarctica', 'mcmurdo', '南极', '南極'] },
]

// Rough country centres for nodes whose name says nothing about the city.
// Canada uses Montreal rather than its geographic centre in the far north:
// that's where hosting there mostly is. Antarctica uses McMurdo Station.
const COUNTRIES: Record<string, LngLat> = {
  AQ: [166.67, -77.85],
  CN: [104.2, 35.9], HK: [114.17, 22.32], TW: [121.0, 23.7], MO: [113.55, 22.2], JP: [138.25, 36.2],
  KR: [127.77, 35.9], SG: [103.82, 1.35], MY: [101.98, 4.2], TH: [100.99, 15.87], VN: [108.28, 14.06],
  ID: [113.92, -0.79], PH: [121.77, 12.88], IN: [78.96, 20.59], AE: [53.85, 23.42], AU: [133.78, -25.27],
  NZ: [174.89, -40.9], US: [-95.71, 37.09], CA: [-73.57, 45.5], MX: [-102.55, 23.63], BR: [-51.93, -14.24],
  GB: [-3.44, 55.38], NL: [5.29, 52.13], DE: [10.45, 51.17], FR: [2.21, 46.23], SE: [18.64, 60.13],
  FI: [25.75, 61.92], PL: [19.15, 51.92], IT: [12.57, 41.87], ES: [-3.75, 40.46], TR: [35.24, 38.96],
  RU: [105.32, 61.52], ZA: [22.94, -30.56], CH: [8.23, 46.82], IE: [-8.24, 53.41], NO: [8.47, 60.47],
}

// ISO 3166 alpha-2 -> numeric, the id world-atlas uses for country shapes.
// Places too small for the 110m atlas (SG, HK, MO, ...) have no shape and
// are lit as a spot instead.
export const ISO_NUMERIC: Record<string, string> = {
  CN: '156', TW: '158', JP: '392', KR: '410', MY: '458', TH: '764', VN: '704', ID: '360', PH: '608',
  IN: '356', AE: '784', AU: '036', NZ: '554', US: '840', CA: '124', MX: '484', BR: '076', GB: '826',
  NL: '528', DE: '276', FR: '250', SE: '752', FI: '246', PL: '616', IT: '380', ES: '724', TR: '792',
  RU: '643', ZA: '710', CH: '756', IE: '372', NO: '578', AT: '040', BE: '056', CZ: '203', DK: '208',
  PT: '620', RO: '642', UA: '804', KZ: '398', IL: '376', SA: '682', AR: '032', CL: '152', EG: '818',
}

// "37.81°S 144.96°E": where a node sits, the way a chart labels a position.
export const coordText = ([lng, lat]: LngLat) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lng).toFixed(2)}°${lng < 0 ? 'W' : 'E'}`

export const countryCentre = (cc: string | undefined): LngLat | null =>
  (cc && COUNTRIES[cc.toUpperCase()]) || null

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Latin aliases get word boundaries so "LA" doesn't fire inside "Atlas";
// CJK aliases have no word boundaries and match as substrings.
const MATCHERS = CITIES.map((c) => ({
  city: c,
  re: new RegExp(
    c.aliases
      .map((a) => (/^[\x20-\x7e]+$/.test(a) ? `(?<![a-z0-9])${escapeRe(a)}(?![a-z0-9])` : escapeRe(a)))
      .join('|'),
    'i',
  ),
}))

export function findCity(text: string): City | null {
  // Prefer the longest alias that matches so "San Jose" beats "SJ"-like noise.
  let best: { city: City; len: number } | null = null
  for (const { city, re } of MATCHERS) {
    const m = re.exec(text)
    if (m && (!best || m[0].length > best.len)) best = { city, len: m[0].length }
  }
  return best?.city ?? null
}

function parseCoord(s: string): LngLat | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return [lng, lat]
}

export interface Place {
  coord: LngLat
  label: string
  source: 'config' | 'name' | 'country'
}

// "name or #id = city | lat,lng" lines from the theme settings.
export function parseLocations(text: string): Map<string, Place> {
  const out = new Map<string, Place>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const eq = line.lastIndexOf('=')
    if (!line || line.startsWith('//') || eq < 0) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    const coord = parseCoord(val)
    const city = coord ? null : findCity(val)
    const place = coord ? { coord, label: val } : city ? { coord: city.coord, label: city.name } : null
    if (key && place) out.set(key.toLowerCase(), { ...place, source: 'config' })
  }
  return out
}

export function locate(node: Node, overrides: Map<string, Place>): Place | null {
  const o = overrides.get(`#${node.id}`) ?? overrides.get(node.name.toLowerCase())
  if (o) return o
  const city = findCity(node.name)
  if (city) return { coord: city.coord, label: city.name, source: 'name' }
  const cc = node.country?.toUpperCase()
  if (cc && COUNTRIES[cc]) return { coord: COUNTRIES[cc], label: cc, source: 'country' }
  return null
}

// --- topology ----------------------------------------------------------------

export type Endpoint =
  | { kind: 'node'; node: Node; coord: LngLat }
  | { kind: 'city'; label: string; coord: LngLat }

export interface Link {
  from: Endpoint
  to: Endpoint
  label: string
}

function resolveEndpoint(token: string, nodes: Node[], places: Map<number, Place>): Endpoint | null {
  const t = token.trim()
  const byId = /^#(\d+)$/.exec(t)
  const node = byId
    ? nodes.find((n) => n.id === Number(byId[1]))
    : nodes.find((n) => n.name.toLowerCase() === t.toLowerCase())
  if (node) {
    const p = places.get(node.id)
    return p ? { kind: 'node', node, coord: p.coord } : null
  }
  const coord = parseCoord(t)
  if (coord) return { kind: 'city', label: t, coord }
  const city = findCity(t)
  return city ? { kind: 'city', label: city.name, coord: city.coord } : null
}

// Automatic topology: one hub node linked to every other located node. The
// hub is the node named in the settings (name or #id), else the first node.
// Nodes sharing the hub's spot are skipped, a zero-length arc draws nothing.
export function hubTopology(token: string, nodes: Node[], places: Map<number, Place>): Link[] {
  const t = token.trim()
  const byId = /^#(\d+)$/.exec(t)
  const hub =
    (t &&
      (byId
        ? nodes.find((n) => n.id === Number(byId[1]))
        : nodes.find((n) => n.name.toLowerCase() === t.toLowerCase()))) ||
    nodes.find((n) => places.has(n.id))
  const hp = hub && places.get(hub.id)
  if (!hub || !hp) return []
  const from: Endpoint = { kind: 'node', node: hub, coord: hp.coord }
  const out: Link[] = []
  for (const n of nodes) {
    const p = places.get(n.id)
    if (n === hub || !p || (p.coord[0] === hp.coord[0] && p.coord[1] === hp.coord[1])) continue
    out.push({ from, to: { kind: 'node', node: n, coord: p.coord }, label: '' })
  }
  return out
}

// Each line is a chain "A -> B -> C | label"; unresolvable hops are skipped.
export function parseTopology(text: string, nodes: Node[], places: Map<number, Place>): Link[] {
  const links: Link[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    const bar = line.indexOf('|')
    const chain = (bar < 0 ? line : line.slice(0, bar)).split('->')
    const label = bar < 0 ? '' : line.slice(bar + 1).trim()
    const hops = chain.map((t) => resolveEndpoint(t, nodes, places))
    for (let i = 0; i < hops.length - 1; i++) {
      const a = hops[i]
      const b = hops[i + 1]
      if (a && b) links.push({ from: a, to: b, label })
    }
  }
  return links
}
