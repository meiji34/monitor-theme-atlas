// Builds the package the hub installs, with no wrapping folder:
//  - monitor: theme.tar.gz with theme.json, an optional preview.png and dist/
//  - Komari (--komari): atlas-komari.zip with komari-theme.json (generated
//    from theme.json), preview.png and dist/
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

const komari = process.argv.includes('--komari')
if (komari) {
  packKomari()
  process.exit(0)
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

// theme.json's settings as Komari's "managed" configuration. Komari's select
// options are bare strings, so they carry the labels (config.ts maps them back).
function komariManifest() {
  const data = manifest.config.map((i) => {
    if (i.type === 'title') return { type: 'title', name: i.label }
    const base = { key: i.key, name: i.label, ...(i.help ? { help: i.help } : {}) }
    switch (i.type) {
      case 'boolean':
        return { ...base, type: 'switch', default: i.default }
      case 'select':
        return {
          ...base,
          type: 'select',
          options: i.options.map((o) => o.label.replaceAll(',', '，')).join(','),
          default: i.options.find((o) => o.value === i.default)?.label.replaceAll(',', '，'),
        }
      case 'text':
        return { ...base, type: 'textbox', default: i.default }
      case 'number':
        return { ...base, type: 'number', default: i.default }
      default:
        return { ...base, type: 'string', default: i.default }
    }
  })
  return {
    name: manifest.name,
    short: manifest.short,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    url: manifest.url,
    ...(existsSync('preview.png') ? { preview: 'preview.png' } : {}),
    configuration: { type: 'managed', name: manifest.name, data },
  }
}

// bsdtar writes zip with -a: Windows ships it in System32 (a Git Bash GNU tar
// may come first on PATH and can't), macOS as plain tar. Linux uses Info-ZIP.
function bsdtar() {
  return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar'
}

function packKomari() {
  const out = 'atlas-komari.zip'
  const stage = mkdtempSync(join(tmpdir(), 'atlas-komari-'))
  try {
    writeFileSync(join(stage, 'komari-theme.json'), JSON.stringify(komariManifest(), null, 2))
    cpSync('dist', join(stage, 'dist'), { recursive: true })
    const entries = ['komari-theme.json', 'dist']
    if (existsSync('preview.png')) {
      cpSync('preview.png', join(stage, 'preview.png'))
      entries.push('preview.png')
    }
    rmSync(out, { force: true })
    const dest = join(process.cwd(), out)
    if (process.platform === 'linux') execFileSync('zip', ['-qr', dest, ...entries], { cwd: stage, stdio: 'inherit' })
    else execFileSync(bsdtar(), ['-a', '-cf', dest, ...entries], { cwd: stage, stdio: 'inherit' })
  } finally {
    rmSync(stage, { recursive: true, force: true })
  }
  const listing = (
    process.platform === 'linux'
      ? execFileSync('unzip', ['-Z1', out], { encoding: 'utf8' })
      : execFileSync(bsdtar(), ['-tf', out], { encoding: 'utf8' })
  )
    .trim()
    .split(/\r?\n/)
  if (!listing.includes('komari-theme.json')) throw new Error(`${out}: komari-theme.json is not at the archive root`)
  const mib = statSync(out).size / 1048576
  console.log(`${out}: ${manifest.short} v${manifest.version} for Komari, ${listing.length} entries, ${mib.toFixed(2)} MiB`)
}
