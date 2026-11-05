"""Turns an mtr report into a route for the Atlas map, on the relay.

A port of buildRoute() / addCrossings() from scripts/routes.mjs and the cable
graph from scripts/lib/cables.mjs (keep them in step). The tables come from
route-tables.json, written by relay/build-installer.mjs from
scripts/lib/places.mjs and scripts/lib/sea.mjs; the cable data, when present,
is TeleGeography's snapshot imported by scripts/import-cables.mjs.

The output holds AS numbers, cities, coordinates and RTTs only, never
addresses.
"""

import array
import base64
import heapq
import json
import math
import os
import re
import urllib.request
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'route-tables.json'), encoding='utf-8') as f:
    TABLES = json.load(f)

PLACE_CODES = {}
for name, cc, lng, lat, codes in TABLES['places']:
    for code in codes.split(' '):
        PLACE_CODES[code] = {'city': name, 'cc': cc, 'at': [lng, lat]}
STATE_CODES = TABLES['states']
IBX = TABLES['ibx']
AS_NAMES = {int(k): v for k, v in TABLES['asNames'].items()}

IPV4 = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}\b')
PRIVATE = re.compile(r'^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)')


def km(a, b):
    (lng1, lat1), (lng2, lat2) = a, b
    r = math.radians
    h = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))


def place_from_hostname(host):
    if not host:
        return None
    low = host.lower()
    tokens = [t for t in re.split(r'[.\-_]+', low) if t]
    if re.search(r'(^|\.)equinix\.com$', low):
        for t in tokens:
            m = re.match(r'^([a-z]{2})\d{1,2}$', t)
            if m and m.group(1) in IBX:
                return PLACE_CODES.get(IBX[m.group(1)])
    for i, t in enumerate(tokens):
        forms = [t, re.sub(r'\d+$', '', t), re.sub(r'\d+$', '', re.sub(r'^\d+', '', t))]
        if i + 1 < len(tokens):
            forms.append(t + tokens[i + 1])
        for f in forms:
            if len(f) >= 3 and f in PLACE_CODES:
                return PLACE_CODES[f]
    for t in tokens:
        if t in STATE_CODES:
            return PLACE_CODES.get(STATE_CODES[t])
    return None


def parse_as(s):
    m = re.match(r'^AS(\d+)\s*(.*)$', s or '')
    if not m:
        return None
    name = m.group(2).split(',')[0].strip()
    if len(name) > 28:
        name = re.sub(r'\s+\S*$', '', name[:28]) + '…'
    return int(m.group(1)), name


def parse_mtr(text):
    """mtr --json -> hops [{name, ip, asn, best, avg, loss}]"""
    hubs = json.loads(text)['report']['hubs']
    out = []
    for h in hubs:
        host = h.get('host', '')
        m = re.match(r'^(.*) \(([\d.]+)\)$', host)
        name, ip = (m.group(1), m.group(2)) if m else (None, host if IPV4.fullmatch(host or '') else None)
        a = re.match(r'^AS(\d+)$', h.get('ASN') or '')
        out.append({
            'name': name, 'ip': ip, 'asn': int(a.group(1)) if a else 0,
            'best': float(h.get('Best') or 0), 'avg': float(h.get('Avg') or 0), 'loss': float(h.get('Loss%') or 0),
        })
    return out


def ip_api(ips):
    out = {}
    for i in range(0, len(ips), 100):
        req = urllib.request.Request(
            'http://ip-api.com/batch?fields=status,countryCode,city,lat,lon,as,query',
            data=json.dumps(ips[i:i + 100]).encode(), method='POST',
            headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=15) as res:
            for r in json.load(res):
                if r.get('status') == 'success':
                    out[r['query']] = r
    return out


def as_names(asns):
    """Holder names from RIPEstat (AS numbers only leave the hub)."""
    out = {}
    for n in asns:
        try:
            with urllib.request.urlopen(f'https://stat.ripe.net/data/as-overview/data.json?resource=AS{n}', timeout=10) as res:
                holder = (json.load(res).get('data') or {}).get('holder')
            if holder:
                clean = re.sub(r'^[A-Z0-9]+(-[A-Z0-9]+)*\s+-?\s*', '', holder)
                p = parse_as(f'AS{n} {clean}')
                if p and p[1]:
                    out[n] = p[1]
        except (OSError, ValueError):
            pass
    return out


def build_route(hops, src, dst, geo, names):
    """src / dst: {'ip', 'at', 'cc'}; geo: ip-api results by address."""
    target = dst['ip']
    dst_hop = next((h for h in reversed(hops) if h['ip'] == target), None)
    dst_asn = dst_hop['asn'] if dst_hop else 0

    def near(a, b):
        return km(a, b) < 80

    lst = []
    for h in hops:
        if not h['ip'] or h['ip'] in (target, src['ip']) or PRIVATE.match(h['ip']) or h['loss'] >= 100:
            continue
        g = geo.get(h['ip'])
        a = parse_as(g.get('as')) if g else None
        if a and a[1] and a[0] not in names:
            names[a[0]] = a[1]
        ix = bool(re.search(r'equinix|(^|[.-])ix([.-]|$)', h['name'] or '', re.I))
        place = place_from_hostname(h['name'])
        how = 'dns' if place else None
        if not place and g and isinstance(g.get('lat'), (int, float)):
            place = {'city': g.get('city') or None, 'cc': g.get('countryCode'), 'at': [g['lon'], g['lat']]}
            how = 'api'
        # Light in fibre covers ~200 km/ms: no farther than half the RTT allows.
        if place and km(src['at'], place['at']) > (h['best'] / 2) * 200 + 100:
            place, how = None, None
        lst.append({'asn': 0 if ix else (h['asn'] or (a[0] if a else 0)), 'ix': ix, 'best': h['best'], 'place': place, 'how': how})

    # Database locations that send the path on a detour go, worst first.
    while True:
        pts = [{'at': src['at']}] + [{'h': h, 'at': h['place']['at']} for h in lst if h['place']] + [{'at': dst['at']}]
        worst = None
        for i in range(1, len(pts) - 1):
            if pts[i]['h']['how'] != 'api':
                continue
            a, b, c = pts[i - 1]['at'], pts[i]['at'], pts[i + 1]['at']
            extra = km(a, b) + km(b, c) - km(a, c)
            if extra > 300 + km(a, c) * 0.3 and (not worst or extra > worst[1]):
                worst = (pts[i]['h'], extra)
        if not worst:
            break
        worst[0]['place'], worst[0]['how'] = None, None

    for i, h in enumerate(lst):
        if h['place']:
            continue
        if h['best'] < 4:
            h['how'] = 'src'
            continue
        prev = next((x for x in reversed(lst[:i]) if x['place'] or x['how'] == 'src'), None)
        if prev and abs(h['best'] - prev['best']) < 2:
            h['place'], h['how'] = prev['place'], ('src' if prev['how'] == 'src' else 'near')

    canon = [h['place'] for h in lst if h['how'] == 'dns']
    for h in lst:
        if not h['place']:
            continue
        c = next((p for p in canon if near(p['at'], h['place']['at'])), None)
        if c:
            h['place'] = c
        else:
            canon.append(h['place'])
    for h in lst:
        if h['place'] and near(h['place']['at'], src['at']):
            h['place'], h['how'] = None, 'src'

    i = len(lst) - 1
    while i >= 0 and dst_asn:
        h = lst[i]
        if h['place'] and not near(h['place']['at'], dst['at']):
            break
        if not h['asn'] and not h['ix']:
            h['asn'] = dst_asn
        if h['asn'] != dst_asn:
            break
        h['place'], h['how'] = None, 'dst'
        i -= 1
    for h in lst:
        if h['place'] and near(h['place']['at'], dst['at']):
            h['place'], h['how'] = None, 'dst'

    i = 1
    while i < len(lst):
        if lst[i]['asn'] or lst[i]['ix'] or not lst[i - 1]['asn']:
            i += 1
            continue
        j = i
        while j < len(lst) and not lst[j]['asn'] and not lst[j]['ix']:
            j += 1
        if j < len(lst) and lst[j]['asn'] == lst[i - 1]['asn']:
            for k in range(i, j):
                lst[k]['asn'] = lst[i - 1]['asn']
        i = j + 1

    out = []
    for h in lst:
        where = h['how'] if h['how'] in ('src', 'dst') else (h['place']['city'] if h['place'] else None)
        key = (h['asn'], h['ix'], where)
        last = out[-1] if out else None
        if last and (last['key'] == key or (where is None and last['asn'] == h['asn'] and last['ix'] == h['ix'])):
            last['rtt'] = min(last['rtt'], h['best'])
            continue
        hop = {'key': key, 'asn': h['asn'], 'ix': h['ix'], 'rtt': h['best']}
        if where in ('src', 'dst'):
            hop['near'] = where
        elif h['place']:
            hop['city'] = h['place']['city']
            hop['cc'] = h['place']['cc']
            hop['at'] = [round(v, 2) for v in h['place']['at']]
        out.append(hop)
    result = []
    for h in out:
        if not (h['asn'] or h['ix'] or h.get('at')):
            continue
        r = {k: v for k, v in h.items() if k not in ('key', 'ix', 'rtt')}
        if h['ix']:
            r['ix'] = True
        r['rtt'] = round(h['rtt'], 1)
        result.append(r)
    return {
        'hops': result,
        'dstAsn': dst_asn,
        'reached': dst_hop is not None,
        'rtt': round(dst_hop['avg'], 1) if dst_hop else None,
    }


# --- sea crossings (cables.mjs) ---------------------------------------------------

LM = TABLES.get('landmass')
LM_GRID = None
if LM:
    LM_GRID = array.array('h')
    LM_GRID.frombytes(zlib.decompress(base64.b64decode(LM['data'])))


def landmass(at):
    if not LM_GRID:
        return -1
    w, h, res = LM['w'], LM['h'], LM['res']
    i0 = int(((math.floor((at[0] + 180) / res)) % w + w) % w)
    j0 = min(h - 1, max(0, int(math.floor((90 - at[1]) / res))))
    if LM_GRID[j0 * w + i0] >= 0:
        return LM_GRID[j0 * w + i0]
    best, best_d = -1, float('inf')
    for dj in range(-4, 5):
        for di in range(-4, 5):
            j = j0 + dj
            if j < 0 or j >= h:
                continue
            c = j * w + (i0 + di + w) % w
            if LM_GRID[c] < 0:
                continue
            d = km(at, [-180 + ((c % w) + 0.5) * res, 90 - (c // w + 0.5) * res])
            if d < best_d:
                best, best_d = LM_GRID[c], d
    return best


GROUPS = [
    ['US', 'CA', 'MX'],
    ['NL', 'DE', 'FR', 'BE', 'LU', 'CH', 'AT', 'IT', 'ES', 'PT', 'PL', 'CZ', 'DK', 'SE', 'NO', 'FI'],
    ['SG', 'MY', 'TH'],
    ['CN', 'HK'],
]


def group(cc):
    return next((i for i, g in enumerate(GROUPS) if cc in g), -1)


def over_land(a, b):
    if km(a['at'], b['at']) < 300:
        return True
    same = (a.get('cc') and a.get('cc') == b.get('cc')) or (group(a.get('cc')) >= 0 and group(a.get('cc')) == group(b.get('cc')))
    if not same:
        return False
    ma, mb = landmass(a['at']), landmass(b['at'])
    return ma < 0 or mb < 0 or ma == mb


CABLE_FILE = os.path.join(HERE, 'submarine-cables.json')
BOARD, REACH, LAND = 300, 4000, 1.2
_graph = None


def graph():
    global _graph
    if _graph is not None:
        return _graph
    if not os.path.exists(CABLE_FILE):
        _graph = False
        return _graph
    with open(CABLE_FILE, encoding='utf-8') as f:
        data = json.load(f)
    landings = {k: {'id': k, 'name': v[0], 'cc': v[1], 'at': [v[2], v[3]]} for k, v in data['landings'].items()}
    cables = [c for c in data['cables'] if not c.get('planned')]
    ids, at, adj, name = {}, [], [], {}

    def node(key, p):
        n = ids.get(key)
        if n is None:
            n = len(at)
            ids[key] = n
            at.append(p)
            adj.append([])
        return n

    def vkey(ci, p):
        return f"{ci}:{-180 if p[0] == 180 else p[0]},{p[1]}"

    for l in landings.values():
        name[node('L:' + l['id'], l['at'])] = l['name']
    for ci, c in enumerate(cables):
        for line in c['lines']:
            for k in range(1, len(line)):
                u = node(vkey(ci, line[k - 1]), line[k - 1])
                v = node(vkey(ci, line[k]), line[k])
                if u == v:
                    continue
                d = km(line[k - 1], line[k])
                adj[u].append((v, d, ci))
                adj[v].append((u, d, ci))
        for lid in c['landings']:
            l = landings.get(lid)
            if not l:
                continue
            best, best_d = None, float('inf')
            for line in c['lines']:
                for p in line:
                    d = km(l['at'], p)
                    if d < best_d:
                        best, best_d = p, d
            if not best or best_d > 50:
                continue
            v = ids[vkey(ci, best)]
            u = ids['L:' + lid]
            adj[u].append((v, BOARD + best_d, ci))
            adj[v].append((u, best_d, ci))
            name[v] = l['name']
    buckets = {}
    for l in landings.values():
        buckets.setdefault((math.floor(l['at'][0]), math.floor(l['at'][1])), []).append(l)
    for l in landings.values():
        x, y = math.floor(l['at'][0]), math.floor(l['at'][1])
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for o in buckets.get((x + dx, y + dy), []):
                    if o['id'] == l['id']:
                        continue
                    d = km(l['at'], o['at'])
                    if d < 60 and over_land(l, o):
                        adj[ids['L:' + l['id']]].append((ids['L:' + o['id']], d * LAND, -1))
    _graph = {'ids': ids, 'at': at, 'adj': adj, 'name': name, 'landings': list(landings.values()), 'cables': cables}
    return _graph


def owner_token(as_name):
    words = (as_name or '').lower().split()
    return ' '.join(words[:2] if words[:1] == ['china'] else words[:1])


def plan_crossing(a, b, as_name):
    """{'cables': [...], 'points': [{'at', 'name'?}]}; no cable data or no fit:
    an empty crossing, which the theme draws as a straight sea leg."""
    g = graph()
    empty = {'cables': [], 'points': []}
    if not g:
        return empty
    ids, at, adj, cables = g['ids'], g['at'], g['adj'], g['cables']
    token = owner_token(as_name)
    owned = [len(token) >= 3 and any(token in o.lower() for o in c['owners']) for c in cables]
    n = len(at)
    S, T = n, n + 1
    dist = {S: 0.0}
    prev, via, into = {}, {}, {}
    heap = []
    for l in g['landings']:
        u = ids['L:' + l['id']]
        da = km(a['at'], l['at'])
        if da < REACH and over_land(a, l):
            dist[u] = da * LAND
            prev[u] = S
            heapq.heappush(heap, (dist[u], u))
        db = km(l['at'], b['at'])
        if db < REACH and over_land(l, b):
            into[u] = db * LAND
    done = set()
    while heap:
        d, u = heapq.heappop(heap)
        if u in done:
            continue
        done.add(u)
        if u == T:
            break
        if u in into and d + into[u] < dist.get(T, float('inf')):
            dist[T] = d + into[u]
            prev[T] = u
            heapq.heappush(heap, (dist[T], T))
        for v, w, ci in adj[u] if u < n else ():
            cost = d + (w * 0.8 if ci >= 0 and owned[ci] else w)
            if cost < dist.get(v, float('inf')):
                dist[v] = cost
                prev[v] = u
                via[v] = ci
                heapq.heappush(heap, (cost, v))
    if T not in prev:
        return empty
    chain = []
    u = prev[T]
    while u != S:
        chain.insert(0, u)
        u = prev[u]
    names = []
    for u in chain:
        ci = via.get(u, -1)
        if ci >= 0 and (not names or names[-1] != cables[ci]['name']):
            names.append(cables[ci]['name'])
    direct = km(a['at'], b['at'])
    if not names or dist[T] >= max(direct * 2.5, direct + 3000):
        return empty
    points = []
    for u in chain:
        p = {'at': at[u]}
        if u in g['name']:
            p['name'] = g['name'][u]
        last = points[-1] if points else None
        if last and km(last['at'], p['at']) < 2:
            if p.get('name') and not last.get('name'):
                last['name'] = p['name']
            continue
        named = [q for q in points if q.get('name')]
        if p.get('name') and named and named[-1]['name'] == p['name']:
            del p['name']
        points.append(p)
    return {'cables': names, 'points': points}


def add_crossings(route, src, dst, label):
    src_pt = {'at': src['at'], 'cc': src.get('cc')}
    dst_pt = {'at': dst['at'], 'cc': dst.get('cc')}
    prev = src_pt
    route.pop('tail', None)
    for h in route['hops']:
        h.pop('via', None)
        cur = src_pt if h.get('near') == 'src' else dst_pt if h.get('near') == 'dst' else ({'at': h['at'], 'cc': h.get('cc')} if h.get('at') else None)
        if not cur:
            continue
        if not over_land(prev, cur):
            h['via'] = plan_crossing(prev, cur, label(h['asn']))
        prev = cur
    if route['reached'] and not over_land(prev, dst_pt):
        route['tail'] = plan_crossing(prev, dst_pt, label(route['dstAsn']))
    return route
