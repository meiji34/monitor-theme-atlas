#!/usr/bin/env node
// Writes self-contained install scripts for the streaming-check relay:
//
//   node relay/build-installer.mjs hub     .cache/media-install-hub.sh
//   node relay/build-installer.mjs 2 7     .cache/media-install-2.sh, …-7.sh
//
// Tokens come from relay.local.json (git-ignored): {"hub": "https://…/atlas-media",
// "tokens": {"<node id>": "<secret>"}}. Each script carries everything it
// installs inline (no downloads), only adds new files, and takes `--uninstall`.
// Read one before running it as root on a server.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { AS_NAMES, IBX, PLACE_ROWS, STATE_CODES } from '../scripts/lib/places.mjs'
import { landmassGrid } from '../scripts/lib/sea.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')
const cfg = JSON.parse(read('relay.local.json'))
// A quoted heredoc writing `text` to `dest` (nothing in it is expanded).
const here = (tag, text, dest) => `cat > ${dest} <<'${tag}'\n${text.replace(/\n?$/, '\n')}${tag}`

// Route tracing on the relay: the place / AS tables and the landmass raster
// (compressed), so its Python port matches scripts/routes.mjs.
function routeTables() {
  const lm = landmassGrid()
  const grid = Int16Array.from(lm.grid)
  return JSON.stringify({
    places: PLACE_ROWS,
    states: STATE_CODES,
    ibx: IBX,
    asNames: AS_NAMES,
    landmass: { w: lm.w, h: lm.h, res: lm.res, data: deflateSync(Buffer.from(grid.buffer)).toString('base64') },
  })
}

// What the relay knows about nodes it traces between: the address to trace
// and the coordinates, from routes.local.json (git-ignored; root-only on the
// hub). Nodes missing here are traced at the address they poll from and placed
// with ip-api.
function nodeInfo() {
  if (!existsSync(resolve(root, 'routes.local.json'))) return { source: cfg.traceFrom ?? '1', nodes: {} }
  const local = JSON.parse(read('routes.local.json'))
  const nodes = {}
  for (const [id, n] of Object.entries(local.nodes ?? {})) {
    if (n.ip || n.trace) nodes[id] = { ip: n.trace || n.ip, ...(n.at ? { at: n.at } : {}), ...(n.cc ? { cc: n.cc } : {}) }
  }
  const source = cfg.traceFrom ?? String(local.links?.[0] ?? '1>*').split('>')[0]
  return { source, nodes }
}

function hubScript() {
  return `#!/bin/sh
# Atlas relay (streaming checks, route tracing), hub side. Installs:
#   /opt/media-relay/media-relay.py            the relay (Python standard library)
#   /opt/media-relay/route_build.py, route-tables.json[, submarine-cables.json]
#   /etc/media-relay/tokens.json               node tokens (root only, 0600)
#   /etc/media-relay/nodes.json                node addresses to trace (root only, 0600)
#   /etc/systemd/system/media-relay.service    listens on 127.0.0.1:28090 only
# No existing file is changed. The site's reverse proxy still needs a
# location for /atlas-media/ -> http://127.0.0.1:28090 (see relay/README.md).
# Remove with: sh $0 --uninstall
set -eu
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
if [ "\${1:-}" = --uninstall ]; then
  systemctl disable --now media-relay.service 2>/dev/null || true
  rm -f /etc/systemd/system/media-relay.service
  rm -rf /opt/media-relay /etc/media-relay
  systemctl daemon-reload
  echo "removed (state in /var/lib/private/media-relay is left; delete it by hand if wanted)"
  exit 0
fi
command -v python3 >/dev/null || { echo "python3 missing" >&2; exit 1; }
install -d -m 755 /opt/media-relay
${here('__RELAY__', read('relay/media-relay.py'), '/opt/media-relay/media-relay.py')}
${here('__ROUTEPY__', read('relay/route_build.py'), '/opt/media-relay/route_build.py')}
${here('__TABLES__', routeTables(), '/opt/media-relay/route-tables.json')}
${existsSync(resolve(root, 'scripts/data/submarine-cables.json')) ? here('__CABLES__', read('scripts/data/submarine-cables.json'), '/opt/media-relay/submarine-cables.json') : 'rm -f /opt/media-relay/submarine-cables.json'}
chmod 644 /opt/media-relay/*
install -d -m 700 /etc/media-relay
umask 077
${here('__TOKENS__', JSON.stringify(cfg.tokens, null, 1), '/etc/media-relay/tokens.json')}
${here('__NODES__', JSON.stringify(nodeInfo(), null, 1), '/etc/media-relay/nodes.json')}
umask 022
${here('__UNIT__', read('relay/media-relay.service'), '/etc/systemd/system/media-relay.service')}
systemctl daemon-reload
systemctl enable --now media-relay.service
systemctl restart media-relay.service
sleep 2
systemctl --no-pager --lines=3 status media-relay.service | head -n 5
echo "--- listening:"; ss -ltn | grep ':28090 ' || echo "not listening"
echo "--- results:"; curl -s --max-time 5 http://127.0.0.1:28090/atlas-media/results; echo
`
}

function nodeScript(id, serial) {
  const token = cfg.tokens[id]
  if (!token) throw new Error(`no token for node ${id} in relay.local.json`)
  const env = `HUB=${cfg.hub}\nNODE=${id}\nTOKEN=${token}${serial ? '\nSERIAL=1' : ''}`
  // The node routes are traced from runs mtr, whose raw-socket right is a
  // file capability: NoNewPrivileges would strip it.
  const source = String(id) === String(nodeInfo().source)
  const traceDropIn = source
    ? `install -d -m 755 /etc/systemd/system/media-check.service.d
  printf '[Service]\\nNoNewPrivileges=no\\n' > /etc/systemd/system/media-check.service.d/trace.conf`
    : 'rm -f /etc/systemd/system/media-check.service.d/trace.conf'
  return `#!/bin/sh
# Atlas streaming check for hub node #${id}. Installs:
#   /opt/media-check/{media-check.sh,report.sh}   the probes and the poller
#   /etc/media-check.env                          hub URL, node ID, token
#   a job every minute, as user monitor-agent: a systemd timer
#   (media-check.timer), or without systemd a line in /etc/crontabs/monitor-agent
# Each minute it asks the hub whether a check is due; only then does it run the
# probes (plain HTTPS requests) and post the verdict inputs back. Nothing
# listens on the node. No existing file is changed.
# Remove with: sh $0 --uninstall
set -eu
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
if [ "\${1:-}" = --uninstall ]; then
  if [ -d /run/systemd/system ]; then
    systemctl disable --now media-check.timer 2>/dev/null || true
    rm -f /etc/systemd/system/media-check.service /etc/systemd/system/media-check.timer
    rm -rf /etc/systemd/system/media-check.service.d
    systemctl daemon-reload
  fi
  [ -f /etc/crontabs/monitor-agent ] && sed -i '/media-check/d' /etc/crontabs/monitor-agent
  rm -rf /opt/media-check /etc/media-check.env
  echo removed
  exit 0
fi
id monitor-agent >/dev/null 2>&1 || { echo "user monitor-agent missing" >&2; exit 1; }
for t in curl flock; do command -v $t >/dev/null || { echo "$t missing" >&2; exit 1; }; done
install -d -m 755 /opt/media-check
${here('__PROBE__', read('scripts/lib/media-check.sh'), '/opt/media-check/media-check.sh')}
${here('__REPORT__', read('relay/node/report.sh'), '/opt/media-check/report.sh')}
chmod 755 /opt/media-check/media-check.sh /opt/media-check/report.sh
umask 077
${here('__ENV__', env, '/etc/media-check.env')}
umask 022
if [ -d /run/systemd/system ]; then
  chmod 600 /etc/media-check.env
${here('__SERVICE__', read('relay/node/media-check.service'), '/etc/systemd/system/media-check.service')}
${here('__TIMER__', read('relay/node/media-check.timer'), '/etc/systemd/system/media-check.timer')}
  ${traceDropIn}
  systemctl daemon-reload
  systemctl enable --now media-check.timer
  echo "installed: systemd timer"
  echo "--- first run:"
  if systemctl start media-check.service; then
    echo ok
  else
    # Some containers (podman, LXC, OpenVZ) won't let systemd sandbox the
    # unit or switch user itself: start it as root without the sandboxing
    # and drop to monitor-agent with runuser instead.
    echo "retrying with runuser, no sandboxing (container?)"
    command -v runuser >/dev/null || { echo "runuser missing" >&2; exit 1; }
    install -d -m 755 /etc/systemd/system/media-check.service.d
    printf '[Service]\\nUser=\\nExecStart=\\nExecStart=%s -u monitor-agent -- /opt/media-check/report.sh\\nPrivateTmp=no\\nPrivateDevices=no\\nProtectSystem=no\\nProtectHome=no\\n' \\
      "$(command -v runuser)" > /etc/systemd/system/media-check.service.d/container.conf
    systemctl daemon-reload
    systemctl start media-check.service && echo ok
  fi
elif [ -d /etc/crontabs ]; then
  chgrp "$(id -gn monitor-agent)" /etc/media-check.env
  chmod 640 /etc/media-check.env
  f=/etc/crontabs/monitor-agent
  grep -qs media-check "$f" || echo '* * * * * /opt/media-check/report.sh' >> "$f"
  chmod 600 "$f"
  # busybox crond only rereads a user's crontab when it's listed here.
  echo monitor-agent >> /etc/crontabs/cron.update
  echo "installed: $f"
  pgrep crond >/dev/null && echo "crond is running" || echo "crond is NOT running: start it (e.g. rc-service crond start; rc-update add crond)"
  echo "--- first run:"; su -s /bin/sh monitor-agent -c /opt/media-check/report.sh && echo ok
else
  echo "no systemd and no /etc/crontabs: add '* * * * * /opt/media-check/report.sh' to monitor-agent's crontab" >&2
  exit 1
fi
`
}

// --serial: probes one at a time, for nodes with very little memory.
const serial = process.argv.includes('--serial')
const args = process.argv.slice(2).filter((a) => a !== '--serial')
if (!args.length) {
  console.error('usage: node relay/build-installer.mjs hub | <node id>… [--serial]')
  process.exit(1)
}
mkdirSync(resolve(root, '.cache'), { recursive: true })
for (const a of args) {
  const out = resolve(root, `.cache/media-install-${a}.sh`)
  writeFileSync(out, a === 'hub' ? hubScript() : nodeScript(a, serial), { mode: 0o600 })
  console.log(`wrote ${out}`)
}
