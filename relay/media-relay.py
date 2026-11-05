#!/usr/bin/env python3
"""Streaming-check and route-tracing relay for the Atlas theme.

Runs next to the monitor hub (standard library only), listening on 127.0.0.1;
the site's reverse proxy forwards /atlas-media/ to it. It keeps the latest
verdicts per node and a queue of requested checks:

  GET  /atlas-media/results       public: verdicts and country codes per node
  POST /atlas-media/check/<id>    a logged-in hub admin asks for a check
  GET  /atlas-media/agent/<id>    a node asks whether a check is due ("1"/"0")
  POST /atlas-media/agent/<id>    a node posts its probe output (key<TAB>value)

and traced routes from the source node (TRACE_FROM) to every other node:

  GET  /atlas-media/routes                 public: routes (no addresses)
  POST /atlas-media/trace/<id>             a logged-in hub admin asks for a trace
  GET  /atlas-media/agent/<src>/jobs       the source node asks what to trace
  POST /atlas-media/agent/<src>/trace/<id> it posts the mtr report
New nodes get traced on their own once their agent has polled; every route
is refreshed once a day.

Admins are recognised by passing their cookie to the hub's own /api/me. Nodes
authenticate with a per-node token. Nodes only ever connect out to the hub;
the relay holds no credentials for them.
"""

import hmac
import json
import os
import re
import threading
import time
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('PORT', '28090'))
HUB = os.environ.get('HUB', 'http://127.0.0.1:28080')
STATE = os.path.join(os.environ.get('STATE_DIRECTORY', '.'), 'state.json')
TOKENS = os.environ.get('TOKENS') or os.path.join(os.environ.get('CREDENTIALS_DIRECTORY', '.'), 'tokens')
PREFIX = '/atlas-media'
COOLDOWN = int(os.environ.get('COOLDOWN', '600'))  # s between checks someone can ask for, per node
EVERY = int(os.environ.get('EVERY', '86400'))  # s after which a node re-checks on its own
MAX_BODY = 32 * 1024
ALIVE = 300  # s since a node's last poll for it to count as running the agent
STALE = 600  # s after which a request no node picked up is dropped

with open(TOKENS, encoding='utf-8') as f:
    TOKEN = {str(k): str(v) for k, v in json.load(f).items()}

lock = threading.Lock()
try:
    with open(STATE, encoding='utf-8') as f:
        state = json.load(f)
except (OSError, ValueError):
    state = {}
state.setdefault('nodes', {})  # id -> {checked, services}
state.setdefault('pending', {})  # id -> epoch asked
state.setdefault('asked', {})  # id -> epoch of the last request
state.setdefault('routes', {})  # target id -> route from the source node
state.setdefault('asns', {})  # AS number -> holder name, for the routes
state.setdefault('trace_pending', {})  # target id -> epoch asked
state.setdefault('trace_asked', {})  # target id -> epoch of the last request
seen = {}  # id -> epoch of the node's last poll (memory only: nodes poll every minute)
addr = {}  # id -> the address a node polls from (memory only, never served)
sent = {}  # target id -> epoch a trace job went out to the source node
geo_cache = {}  # address -> ip-api answer

try:
    import route_build
except Exception as e:  # tables not installed: route tracing stays off
    print(f'route tracing off: {e}', flush=True)
    route_build = None
try:
    with open(os.environ.get('NODES') or os.path.join(os.environ.get('CREDENTIALS_DIRECTORY', '.'), 'nodes'), encoding='utf-8') as f:
        NODEINFO = json.load(f)
except (OSError, ValueError):
    NODEINFO = {}
NODEINFO.setdefault('nodes', {})
SOURCE = os.environ.get('TRACE_FROM') or str(NODEINFO.get('source') or '1')
IPV4 = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}\b')


def target_of(node):
    return (NODEINFO['nodes'].get(node) or {}).get('ip') or addr.get(node)


def traceable():
    if not route_build:
        return []
    ids = set(TOKEN) | set(NODEINFO['nodes'])
    return sorted((n for n in ids if n != SOURCE and target_of(n)), key=int)


def endpoint(node):
    """Address and position of a node: from nodes.json, else ip-api."""
    info = NODEINFO['nodes'].get(node) or {}
    ip = target_of(node)
    out = {'ip': ip, 'at': info.get('at'), 'cc': info.get('cc')}
    if not out['at'] and ip:
        if ip not in geo_cache:
            geo_cache.update(route_build.ip_api([ip]))
        g = geo_cache.get(ip)
        if g:
            out['at'], out['cc'] = [g['lon'], g['lat']], g.get('countryCode')
    return out if out['at'] else None


def process_trace(to, text):
    try:
        src, dst = endpoint(SOURCE), endpoint(to)
        if not src or not dst:
            raise ValueError('no position for an endpoint')
        hops = route_build.parse_mtr(text)
        lookup = sorted({h['ip'] for h in hops if h['ip'] and not route_build.PRIVATE.match(h['ip']) and h['ip'] not in (src['ip'], dst['ip'])})
        geo = route_build.ip_api(lookup)
        names = {}
        route = route_build.build_route(hops, src, dst, geo, names)
        used = {h['asn'] for h in route['hops'] if h['asn']} | ({route['dstAsn']} if route['dstAsn'] else set())
        known = {int(k) for k in state['asns']}
        names.update(route_build.as_names([n for n in used if n not in route_build.AS_NAMES and n not in names and n not in known]))

        def label(n):
            return route_build.AS_NAMES.get(n) or names.get(n) or state['asns'].get(str(n), '')

        route_build.add_crossings(route, src, dst, label)
        route = {'from': int(SOURCE), 'to': int(to), 'traced': now_iso(), **route}
        if IPV4.search(json.dumps(route)):
            raise ValueError('route would carry an address')
        with lock:
            state['routes'][to] = route
            for n in used:
                if label(n):
                    state['asns'][str(n)] = label(n)
            state['trace_pending'].pop(to, None)
            save()
        print(f'traced {SOURCE}>{to}: {len(route["hops"])} hops, reached={route["reached"]}', flush=True)
    except Exception as e:
        print(f'trace {SOURCE}>{to} failed: {e}', flush=True)
        with lock:
            state['trace_pending'].pop(to, None)
            save()


def trace_jobs():
    """Targets the source node should trace now (two per poll at most)."""
    now = time.time()
    jobs = []
    with lock:
        for to in traceable():
            if now - sent.get(to, 0) < STALE:
                continue  # handed out lately, still running
            route = state['routes'].get(to)
            due = to in state['trace_pending'] or not route or now - epoch(route.get('traced')) > EVERY
            if due:
                jobs.append((to, target_of(to)))
                sent[to] = now
            if len(jobs) == 2:
                break
    return jobs


def prune():
    """Drop requests nobody picked up (node offline, or no agent on it)."""
    now = time.time()
    for node, at in list(state['pending'].items()):
        if now - at > STALE:
            del state['pending'][node]


def alive(node):
    return time.time() - seen.get(node, 0) < ALIVE


def save():
    tmp = STATE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp, STATE)


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def epoch(iso):
    try:
        return datetime.strptime(iso, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc).timestamp()
    except (TypeError, ValueError):
        return 0


# --- verdicts (kept in step with verdicts() in scripts/media.mjs) -------------

CODE = re.compile(r'^[A-Z]{2,3}$')
CC3 = {
    'AUS': 'AU', 'USA': 'US', 'NLD': 'NL', 'NZL': 'NZ', 'SGP': 'SG', 'MYS': 'MY', 'HKG': 'HK', 'MAC': 'MO',
    'TWN': 'TW', 'JPN': 'JP', 'KOR': 'KR', 'CHN': 'CN', 'GBR': 'GB', 'DEU': 'DE', 'FRA': 'FR', 'CAN': 'CA',
    'IND': 'IN', 'IDN': 'ID', 'THA': 'TH', 'VNM': 'VN', 'PHL': 'PH', 'RUS': 'RU', 'BRA': 'BR', 'ARE': 'AE',
    'TUR': 'TR', 'ITA': 'IT', 'ESP': 'ES', 'POL': 'PL', 'SWE': 'SE', 'CHE': 'CH',
}
GEMINI_OFF = {'CN', 'HK', 'MO', 'RU', 'BY', 'IR', 'KP', 'CU', 'SY'}


def v(status, region='', note=''):
    out = {'status': status}
    region = (region or '').upper()
    if CODE.match(region):
        out['region'] = region
    if note:
        out['note'] = note
    return out


def verdicts(raw):
    r = {}
    for line in raw.splitlines():
        k, sep, val = line.partition('\t')
        if sep and re.match(r'^[a-z]+\.[a-z0-9]+$', k):
            r[k] = val.strip()[:300]

    def num(k):
        try:
            return int(r.get(k) or 0)
        except ValueError:
            return 0

    out = {}

    a, b, o = r.get('netflix.a'), r.get('netflix.b'), r.get('netflix.o')
    m = re.search(r'netflix\.com/([a-z]{2})(?:-[a-z]{2})?/title', r.get('netflix.url', ''))
    region = m.group(1) if m else ('us' if o == '200' else '')
    if a == '200' or b == '200':
        out['netflix'] = v('yes', region)
    elif o == '200':
        out['netflix'] = v('partial', region, '僅自製劇')
    elif any(x in ('403', '404') for x in (a, b, o)):
        out['netflix'] = v('no')
    else:
        out['netflix'] = v('error')

    if r.get('disney.forbidden'):
        out['disney'] = v('no', '', 'IP 被擋')
    elif r.get('disney.supported') == 'true':
        out['disney'] = v('yes', r.get('disney.cc'))
    elif r.get('disney.supported') == 'false':
        out['disney'] = v('no', r.get('disney.cc'), '尚未開放')
    else:
        out['disney'] = v('error')

    if not num('youtube.size'):
        out['youtube'] = v('error')
    elif num('youtube.cn'):
        out['youtube'] = v('no', 'CN')
    elif num('youtube.unavailable'):
        out['youtube'] = v('no', r.get('youtube.gl'))
    elif r.get('youtube.gl'):
        out['youtube'] = v('yes', r.get('youtube.gl'))
    else:
        out['youtube'] = v('error')

    if not num('prime.size'):
        out['prime'] = v('error')
    elif num('prime.restricted'):
        out['prime'] = v('no', r.get('prime.territory'))
    elif r.get('prime.territory'):
        out['prime'] = v('yes', r.get('prime.territory'))
    else:
        out['prime'] = v('error')

    if not num('chatgpt.api'):
        out['chatgpt'] = v('error')
    elif num('chatgpt.unsupported'):
        out['chatgpt'] = v('no', r.get('chatgpt.loc'))
    elif num('chatgpt.vpn'):
        out['chatgpt'] = v('partial', r.get('chatgpt.loc'), '僅網頁版')
    else:
        out['chatgpt'] = v('yes', r.get('chatgpt.loc'))

    url = r.get('claude.url', '')
    if 'unavailable-in-region' in url:
        out['claude'] = v('no', r.get('claude.loc'))
    elif 'claude.ai' in url:
        out['claude'] = v('yes', r.get('claude.loc'))
    else:
        out['claude'] = v('error')

    cc3 = r.get('gemini.cc3', '')
    cc = CC3.get(cc3, cc3)
    if not num('gemini.size'):
        out['gemini'] = v('error')
    elif num('gemini.unsupported') or cc in GEMINI_OFF:
        out['gemini'] = v('no', cc, f'Google 判定為 {cc}' if CODE.match(cc or '') else '')
    elif cc:
        out['gemini'] = v('yes', cc)
    else:
        out['gemini'] = v('error')

    hk, tw = r.get('bilibili.hkmotw'), r.get('bilibili.tw')
    if hk == '0':
        out['bilibili'] = v('yes', '', '港澳台')
    elif tw == '0':
        out['bilibili'] = v('yes', 'TW', '僅台灣')
    elif hk or tw:
        out['bilibili'] = v('no')
    else:
        out['bilibili'] = v('error')

    acc = r.get('abema.cc')
    if acc == 'JP':
        out['abema'] = v('yes', 'JP')
    elif acc:
        out['abema'] = v('no', acc, '僅限日本')
    elif r.get('abema.message') == 'anonymous_ip':
        out['abema'] = v('no', '', '機房 IP 被擋')
    else:
        out['abema'] = v('error')

    m = re.search(r'spotify\.com/([a-z]{2})(?:-[a-z]{2})?/premium', r.get('spotify.redirect', ''))
    out['spotify'] = v('yes', m.group(1)) if m else v('no') if r.get('spotify.redirect') else v('error')

    out['tiktok'] = v('yes', r.get('tiktok.region')) if r.get('tiktok.region') else v('error')
    return out


# --- HTTP ----------------------------------------------------------------------


def hub_admin(cookie):
    """Whether this cookie is a logged-in session on the hub."""
    if not cookie:
        return False
    req = urllib.request.Request(HUB + '/api/me', headers={'Cookie': cookie, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.load(res).get('authed') is True
    except (OSError, ValueError):
        return False


class Handler(BaseHTTPRequestHandler):
    server_version = 'media-relay'
    sys_version = ''

    def log_message(self, fmt, *args):  # journald gets one short line per request
        print(f'{self.command} {self.path.split("?")[0]} -> {fmt % args}', flush=True)

    def reply(self, code, body=None, headers=None):
        data = b'' if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        self.send_response(code)
        self.send_header('Content-Type', 'application/json' if not isinstance(body, bytes) else 'text/plain')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        for k, val in (headers or {}).items():
            self.send_header(k, val)
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        path = self.path.split('?')[0]
        if path.startswith(PREFIX):
            path = path[len(PREFIX):]
        return path.strip('/').split('/')

    def node_token_ok(self, node):
        auth = self.headers.get('Authorization', '')
        token = TOKEN.get(node)
        return bool(token) and auth.startswith('Bearer ') and hmac.compare_digest(auth[7:], token)

    def do_GET(self):
        parts = self.route()
        if parts == ['results']:
            with lock:
                prune()
                body = {
                    'nodes': state['nodes'],
                    'pending': sorted(state['pending'], key=int),
                    'known': sorted(TOKEN, key=int),
                    # Nodes whose agent polled lately: only these can take a request.
                    'agents': sorted((n for n in TOKEN if alive(n)), key=int),
                    'cooldown': COOLDOWN,
                }
            return self.reply(200, body)
        if parts == ['routes']:
            with lock:
                now = time.time()
                for to, at in list(state['trace_pending'].items()):
                    if now - at > STALE:
                        del state['trace_pending'][to]
                body = {
                    'enabled': route_build is not None,
                    'source': SOURCE,
                    'routes': list(state['routes'].values()),
                    'asns': state['asns'],
                    'pending': sorted(state['trace_pending'], key=int),
                    'traceable': traceable(),
                    'sourceAlive': alive(SOURCE),
                    'cooldown': COOLDOWN,
                }
            return self.reply(200, body)
        if len(parts) == 3 and parts[0] == 'agent' and parts[2] == 'jobs':
            node = parts[1]
            if not self.node_token_ok(node):
                return self.reply(403, {'error': 'token'})
            if node != SOURCE or not route_build:
                return self.reply(200, b'')
            lines = ''.join(f'trace {to} {ip}\n' for to, ip in trace_jobs())
            return self.reply(200, lines.encode())
        if len(parts) == 2 and parts[0] == 'agent':
            node = parts[1]
            if not self.node_token_ok(node):
                return self.reply(403, {'error': 'token'})
            ip = self.headers.get('X-Real-IP')
            if ip:
                addr[node] = ip
            with lock:
                seen[node] = time.time()
                last = epoch(state['nodes'].get(node, {}).get('checked'))
                due = node in state['pending'] or time.time() - last > EVERY
            return self.reply(200, b'1' if due else b'0')
        return self.reply(404, {'error': 'not found'})

    def do_POST(self):
        parts = self.route()
        if len(parts) == 2 and parts[0] == 'check':
            node = parts[1]
            # Only the theme's own requests: a custom header can't be sent
            # cross-site without a preflight this server never answers.
            if self.headers.get('X-Atlas') != '1':
                return self.reply(403, {'error': 'header'})
            origin = self.headers.get('Origin')
            host = self.headers.get('Host', '')
            if origin and origin.split('://', 1)[-1] != host:
                return self.reply(403, {'error': 'origin'})
            if node not in TOKEN:
                return self.reply(404, {'error': 'node'})
            if not hub_admin(self.headers.get('Cookie')):
                return self.reply(401, {'error': 'login'})
            if not alive(node):
                return self.reply(409, {'error': 'agent'})
            with lock:
                last = max(state['asked'].get(node, 0), epoch(state['nodes'].get(node, {}).get('checked')))
                wait = int(COOLDOWN - (time.time() - last))
                if node not in state['pending'] and wait > 0:
                    return self.reply(429, {'error': 'cooldown', 'retry': wait}, {'Retry-After': str(wait)})
                state['pending'][node] = state['pending'].get(node) or time.time()
                state['asked'][node] = time.time()
                save()
            return self.reply(202, {'pending': True})
        if len(parts) == 2 and parts[0] == 'trace':
            to = parts[1]
            if self.headers.get('X-Atlas') != '1':
                return self.reply(403, {'error': 'header'})
            origin = self.headers.get('Origin')
            if origin and origin.split('://', 1)[-1] != self.headers.get('Host', ''):
                return self.reply(403, {'error': 'origin'})
            if to not in traceable():
                return self.reply(404, {'error': 'node'})
            if not hub_admin(self.headers.get('Cookie')):
                return self.reply(401, {'error': 'login'})
            if not alive(SOURCE):
                return self.reply(409, {'error': 'agent'})
            with lock:
                last = max(state['trace_asked'].get(to, 0), epoch((state['routes'].get(to) or {}).get('traced')))
                wait = int(COOLDOWN - (time.time() - last))
                if to not in state['trace_pending'] and wait > 0:
                    return self.reply(429, {'error': 'cooldown', 'retry': wait}, {'Retry-After': str(wait)})
                state['trace_pending'][to] = state['trace_pending'].get(to) or time.time()
                state['trace_asked'][to] = time.time()
                sent.pop(to, None)
                save()
            return self.reply(202, {'pending': True})
        if len(parts) == 4 and parts[0] == 'agent' and parts[2] == 'trace':
            node, to = parts[1], parts[3]
            if not self.node_token_ok(node) or node != SOURCE or not route_build:
                return self.reply(403, {'error': 'token'})
            size = int(self.headers.get('Content-Length') or 0)
            if size <= 0 or size > 512 * 1024:
                return self.reply(413, {'error': 'size'})
            text = self.rfile.read(size).decode('utf-8', 'replace')
            threading.Thread(target=process_trace, args=(to, text), daemon=True).start()
            return self.reply(202)
        if len(parts) == 2 and parts[0] == 'agent':
            node = parts[1]
            if not self.node_token_ok(node):
                return self.reply(403, {'error': 'token'})
            size = int(self.headers.get('Content-Length') or 0)
            if size <= 0 or size > MAX_BODY:
                return self.reply(413, {'error': 'size'})
            raw = self.rfile.read(size).decode('utf-8', 'replace')
            if 'done\t1' not in raw:
                return self.reply(400, {'error': 'incomplete'})
            with lock:
                state['nodes'][node] = {'checked': now_iso(), 'services': verdicts(raw)}
                state['pending'].pop(node, None)
                save()
            return self.reply(204)
        return self.reply(404, {'error': 'not found'})


if __name__ == '__main__':
    print(f'media-relay on 127.0.0.1:{PORT}, {len(TOKEN)} nodes, tracing from #{SOURCE}: {"on" if route_build else "off"}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
