// Maps the monitor hub's node ids (which routes.json, media.json and the relay
// use) to Komari uuids, matching nodes by name, and writes src/data/ids.json
// for the Komari build (npm run pack:komari).
//
//   node scripts/komari-ids.mjs                      # hubs from .env.local
//   node scripts/komari-ids.mjs <monitor url> <komari url>
//
// Only ids and uuids are written. Nodes without a twin of the same name are
// listed so you can rename one side or add them to the file by hand.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

function env(key) {
  if (process.env[key]) return process.env[key]
  if (!existsSync('.env.local')) return ''
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

const monitor = (process.argv[2] || env('MONITOR_HUB')).replace(/\/$/, '')
const komari = (process.argv[3] || env('KOMARI_HUB')).replace(/\/$/, '')
if (!monitor || !komari) {
  console.error('usage: node scripts/komari-ids.mjs <monitor hub url> <komari url> (or MONITOR_HUB / KOMARI_HUB in .env.local)')
  process.exit(1)
}

const getJSON = async (url) => {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const norm = (s) => s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
const old = (await getJSON(`${monitor}/api/nodes`)).nodes ?? []
const fresh = (await getJSON(`${komari}/api/nodes`)).data ?? []

const byName = new Map(fresh.map((n) => [norm(n.name), n.uuid]))
const map = {}
const missing = []
for (const n of old) {
  const uuid = byName.get(norm(n.name))
  if (uuid) map[String(n.id)] = uuid
  else missing.push(`#${n.id} ${n.name}`)
}
const matched = new Set(Object.values(map))
const extra = fresh.filter((n) => !matched.has(n.uuid)).map((n) => n.name)

writeFileSync('src/data/ids.json', JSON.stringify(map, null, 1) + '\n')
console.log(`src/data/ids.json: ${Object.keys(map).length} of ${old.length} monitor nodes matched`)
if (missing.length) console.log(`  not on Komari: ${missing.join(', ')}`)
if (extra.length) console.log(`  only on Komari (no routes / streaming data yet): ${extra.join(', ')}`)
