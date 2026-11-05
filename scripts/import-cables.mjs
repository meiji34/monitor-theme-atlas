// Imports TeleGeography's Submarine Cable Map dataset (the copy they published
// on GitHub under CC BY-NC-SA 3.0, last snapshot 2022-08-05) into two compact
// files:
//   scripts/data/submarine-cables.json  everything routes.mjs needs to match
//                                       crossings to cables (3-decimal coords)
//   src/data/cables.json                the base map the theme draws (2-decimal)
//
//   node scripts/import-cables.mjs <path to …/web/public/api/v3>
//
// Both outputs are adaptations of TeleGeography's data and stay under
// CC BY-NC-SA 3.0 (see scripts/data/README.md).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const api = process.argv[2]
if (!api) {
  console.error('usage: node scripts/import-cables.mjs <path to web/public/api/v3>')
  process.exit(1)
}
const read = (p) => JSON.parse(readFileSync(join(api, p), 'utf8'))

// Country names as TeleGeography spells them -> ISO 3166 alpha-2.
const dn = new Intl.DisplayNames(['en'], { type: 'region' })
const byName = new Map()
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
for (const x of A) {
  for (const y of A) {
    const name = dn.of(x + y)
    if (name && name !== x + y) byName.set(name.toLowerCase(), x + y)
  }
}
// prettier-ignore
const ALIAS = {
  "Côte d'Ivoire": 'CI', 'Saint Martin': 'MF', 'Virgin Islands (U.S.)': 'VI', 'Virgin Islands (U.K.)': 'VG',
  'Saint Kitts and Nevis': 'KN', 'Saint Vincent and the Grenadines': 'VC', Turkey: 'TR', 'Saint Lucia': 'LC',
  'Trinidad and Tobago': 'TT', 'Antigua and Barbuda': 'AG', 'Bonaire, Sint Eustatius and Saba': 'BQ',
  'Saint Barthélemy': 'BL', 'Wallis and Futuna': 'WF', Myanmar: 'MM', 'Saint Pierre and Miquelon': 'PM',
  'Congo, Dem. Rep.': 'CD', 'Congo, Rep.': 'CG', 'Turks and Caicos Islands': 'TC',
  'Saint Helena, Ascension and Tristan da Cunha': 'SH', 'Sao Tome and Principe': 'ST',
}
const unknown = new Set()
function isoOf(country) {
  const cc = ALIAS[country] ?? byName.get(country.toLowerCase())
  if (!cc) unknown.add(country)
  return cc ?? ''
}

const r = (d) => (v) => Math.round(v * 10 ** d) / 10 ** d
const r3 = r(3)
const r2 = r(2)

// Landing points: names and countries from the per-landing files, positions
// from the GeoJSON.
const at = new Map(read('landing-point/landing-point-geo.json').features.map((f) => [f.properties.id, f.geometry.coordinates]))
const landings = {}
for (const f of readdirSync(join(api, 'landing-point'))) {
  if (!f.endsWith('.json') || f.includes('-geo')) continue
  const j = read(`landing-point/${f}`)
  const p = at.get(j.id)
  if (!p) continue
  // "Kahe Point, HI, United States" -> "Kahe Point, HI"
  const name = j.name.endsWith(`, ${j.country}`) ? j.name.slice(0, -j.country.length - 2) : j.name
  landings[j.id] = [name, isoOf(j.country), r3(p[0]), r3(p[1])]
}

// Cable geometry, grouped by cable (a few cables are split over features).
const lines = new Map()
const colour = new Map()
for (const f of read('cable/cable-geo.json').features) {
  const id = f.properties.id
  colour.set(id, f.properties.color)
  lines.set(id, [...(lines.get(id) ?? []), ...f.geometry.coordinates])
}

const cables = []
for (const f of readdirSync(join(api, 'cable'))) {
  if (!f.endsWith('.json') || f === 'cable-geo.json' || f === 'all.json') continue
  const j = read(`cable/${f}`)
  const geo = lines.get(j.id)
  if (!geo) continue
  cables.push({
    id: j.id,
    name: j.name,
    color: colour.get(j.id),
    owners: (j.owners ?? '').split(/,\s*/).filter(Boolean),
    rfs: j.rfs_year ?? null,
    planned: !!j.is_planned,
    length: j.length ?? null,
    landings: j.landing_points.map((p) => p.id).filter((id) => landings[id]),
    lines: geo.map((l) => l.map(([x, y]) => [r3(x), r3(y)])),
  })
}
cables.sort((a, b) => a.id.localeCompare(b.id))

const source = {
  title: 'Submarine Cable Map',
  author: 'TeleGeography',
  snapshot: '2022-08-05',
  url: 'https://www.submarinecablemap.com',
  license: 'CC BY-NC-SA 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
  changes: 'reformatted, coordinates rounded',
}

mkdirSync('scripts/data', { recursive: true })
writeFileSync('scripts/data/submarine-cables.json', JSON.stringify({ source, landings, cables }))

// The base map: geometry rounded to ~1 km, consecutive duplicates dropped.
const base = cables.map((c) => ({
  name: c.name,
  color: c.color,
  rfs: c.rfs,
  planned: c.planned,
  length: c.length,
  owners: c.owners,
  paths: c.lines
    .map((l) => l.map(([x, y]) => [r2(x), r2(y)]).filter((p, i, all) => !i || p[0] !== all[i - 1][0] || p[1] !== all[i - 1][1]))
    .filter((l) => l.length > 1),
}))
mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/cables.json', JSON.stringify({ source: { ...source, changes: 'reformatted, simplified' }, cables: base }))

const kb = (p) => (readFileSync(p).length / 1024).toFixed(0)
console.log(`${cables.length} cables, ${Object.keys(landings).length} landings`)
console.log(`scripts/data/submarine-cables.json ${kb('scripts/data/submarine-cables.json')} KB, src/data/cables.json ${kb('src/data/cables.json')} KB`)
if (unknown.size) console.log('countries without a code:', [...unknown].join(', '))
