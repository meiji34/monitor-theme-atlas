// Builds theme.tar.gz the way the hub expects it: theme.json, an optional
// preview.png and dist/ at the archive root, with no wrapping folder.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('theme.json', 'utf8'))
for (const key of ['name', 'short', 'description', 'version', 'author', 'url']) {
  if (typeof manifest[key] !== 'string') throw new Error(`theme.json: "${key}" must be a string`)
}
if (!/^[A-Za-z0-9_-]+$/.test(manifest.short)) throw new Error('theme.json: "short" may only use letters, digits, - and _')
if (!existsSync('dist/index.html')) throw new Error('dist/index.html missing, run the build first')

// The route data ships in the bundle; make sure no node address came with it.
if (existsSync('routes.local.json')) {
  const ips = Object.values(JSON.parse(readFileSync('routes.local.json', 'utf8')).nodes ?? {}).flatMap((n) => [n.ip, n.trace].filter(Boolean))
  for (const f of readdirSync('dist', { recursive: true })) {
    const path = join('dist', String(f))
    if (!statSync(path).isFile()) continue
    const text = readFileSync(path, 'latin1')
    const hit = ips.find((ip) => text.includes(ip))
    if (hit) throw new Error(`${path} contains node address ${hit}; refusing to pack`)
  }
}

const entries = ['theme.json', 'dist']
if (existsSync('preview.png')) entries.push('preview.png')

rmSync('theme.tar.gz', { force: true })
execFileSync('tar', ['-czf', 'theme.tar.gz', ...entries], { stdio: 'inherit' })

// Reading the archive back proves the gzip stream is complete.
const listing = execFileSync('tar', ['-tzf', 'theme.tar.gz'], { encoding: 'utf8' }).trim().split('\n')
const mib = statSync('theme.tar.gz').size / 1048576
if (mib > 32) throw new Error(`theme.tar.gz is ${mib.toFixed(1)} MiB, over the hub's 32 MiB limit`)
console.log(`theme.tar.gz: ${manifest.short} v${manifest.version}, ${listing.length} entries, ${mib.toFixed(2)} MiB`)
