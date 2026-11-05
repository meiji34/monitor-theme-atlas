#!/usr/bin/env python3
"""Streaming-check relay for the Atlas theme.

Runs next to the monitor hub (standard library only), listening on 127.0.0.1;
the site's reverse proxy forwards /atlas-media/ to it. It keeps the latest
verdicts per node and a queue of requested checks:

  GET  /atlas-media/results       public: verdicts and country codes per node
  POST /atlas-media/check/<id>    a logged-in hub admin asks for a check
  GET  /atlas-media/agent/<id>    a node asks whether a check is due ("1"/"0")
  POST /atlas-media/agent/<id>    a node posts its probe output (key<TAB>value)

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
                body = {
                    'nodes': state['nodes'],
                    'pending': sorted(state['pending'], key=int),
                    'known': sorted(TOKEN, key=int),
                    'cooldown': COOLDOWN,
                }
            return self.reply(200, body)
        if len(parts) == 2 and parts[0] == 'agent':
            node = parts[1]
            if not self.node_token_ok(node):
                return self.reply(403, {'error': 'token'})
            with lock:
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
            with lock:
                last = max(state['asked'].get(node, 0), epoch(state['nodes'].get(node, {}).get('checked')))
                wait = int(COOLDOWN - (time.time() - last))
                if node not in state['pending'] and wait > 0:
                    return self.reply(429, {'error': 'cooldown', 'retry': wait}, {'Retry-After': str(wait)})
                state['pending'][node] = state['pending'].get(node) or time.time()
                state['asked'][node] = time.time()
                save()
            return self.reply(202, {'pending': True})
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
    print(f'media-relay on 127.0.0.1:{PORT}, {len(TOKEN)} nodes', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
