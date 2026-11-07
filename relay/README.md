# Relay: live streaming checks and route tracing

Lets the theme show live streaming-check results and traced routes, and lets
a logged-in hub admin press "Check now" / "Check again" and "Trace route" / "Trace again".
Without it the theme falls back to the snapshots bundled by `scripts/media.mjs`
and `scripts/routes.mjs`.

```
browser ──/atlas-media/──▶ reverse proxy ──▶ media-relay (127.0.0.1:28090, next to the hub)
                                                  ▲            │ cookie → hub /api/me (admin?)
node: media-check.timer, every minute ────────────┘            ▼
  "is a check due?" → runs scripts/lib/media-check.sh → posts the output back
```

- **Relay** (`media-relay.py`, Python standard library): keeps the latest verdicts
  per node and a queue of requested checks. Listens on 127.0.0.1 only; systemd
  runs it as a throwaway user (`DynamicUser`) with a read-only system.
- **Nodes** (`node/report.sh` + timer, or cron without systemd): only connect out
  to the hub; nothing listens on them. They run the probes as `monitor-agent`
  (on a node with WARP policy routing that user is exempt, so the check sees
  the node's own address).
- **Who can ask**: only a session the hub itself says is logged in (the
  relay forwards the cookie to the hub's `/api/me`). Requests also need the
  theme's `X-Atlas` header and a same-site `Origin`, so other sites can't
  trigger them. Per node at most one requested check every 10 minutes
  (`COOLDOWN`); nodes also re-check on their own once a day (`EVERY`).
- **What's public**: `GET /atlas-media/results` returns verdicts and country
  codes only, never addresses.

## Route tracing

The source node (the first link in `routes.local.json`, `"1>*"` → node 1) traces
to every other node: when the relay hands it a job, its agent runs
`mtr -rwbz -c 3 --json <address>` and posts the report. The relay turns it into
a route with `route_build.py` (a Python port of `scripts/routes.mjs`: city codes
in reverse DNS, ip-api for the rest, impossible or detour locations dropped,
sea crossings along the cable data when installed) and serves it without any
address. Targets come from `/etc/media-relay/nodes.json` (written from
`routes.local.json`, root only), or for a node not listed there, the address its
agent polls from; positions not given there come from ip-api. So a **new node
gets its route on its own** once its agent is installed. Every route is
refreshed once a day; an admin can ask for one sooner (10 minutes apart per node).

On the source node, mtr's raw-socket right is a file capability, which
`NoNewPrivileges` would strip; its installer adds
`media-check.service.d/trace.conf` with `NoNewPrivileges=no`.

## API

| Request | Who | Does |
|---|---|---|
| `GET /atlas-media/results` | anyone | `{nodes, pending, known, cooldown}` |
| `POST /atlas-media/check/<id>` | logged-in admin, `X-Atlas: 1` | queue a check (202), 401 not logged in, 429 cooldown |
| `GET /atlas-media/agent/<id>` | node, `Authorization: Bearer <token>` | `1` when a check is due, else `0` |
| `POST /atlas-media/agent/<id>` | node, bearer token | the probe output; stored as verdicts |
| `GET /atlas-media/routes` | anyone | `{routes, asns, pending, traceable, sourceAlive, …}` |
| `POST /atlas-media/trace/<id>` | logged-in admin, `X-Atlas: 1` | queue a trace to that node |
| `GET /atlas-media/agent/<src>/jobs` | source node, bearer token | `trace <id> <address>` lines |
| `POST /atlas-media/agent/<src>/trace/<id>` | source node, bearer token | the mtr report |

The verdict rules exist twice, in `media-relay.py` and in `scripts/media.mjs`
(the snapshot); change both together.

## Install

Tokens live in `relay.local.json` (git-ignored):
`{"hub": "https://<hub>/atlas-media", "tokens": {"<node id>": "<random secret>"}}`.

```bash
node relay/build-installer.mjs hub 1 2 3   # writes .cache/media-install-{hub,1,2,3}.sh
```

Each script carries everything it installs inline, only adds new files, and
removes them again with `--uninstall`. Read it, copy it to the server, run it
as root:

1. **Hub**: `sh media-install-hub.sh` → `/opt/media-relay/`, `/etc/media-relay/tokens.json`
   (0600), `media-relay.service`; prints the listening socket and `/results`.
2. **Reverse proxy**: add a location for `/atlas-media/` → `http://127.0.0.1:28090`
   (no path after the port). With 1Panel: Websites → the status site → Reverse proxy →
   Create, with the front-end request path `/atlas-media/` and the back-end proxy address
   `http://127.0.0.1:28090`.
   Check: `curl https://<hub>/atlas-media/results`.
3. **Each node**: `sh media-install-<id>.sh` → `/opt/media-check/`, `/etc/media-check.env`,
   `media-check.timer` (or a line in `/etc/crontabs/monitor-agent` on Alpine);
   runs once right away, so the result shows up within a minute. In a container
   where systemd can't sandbox the unit or switch user (podman, some LXC), the
   script adds `media-check.service.d/container.conf`: started as root without
   the sandboxing, dropping to `monitor-agent` through `runuser`.

### A node added later: one line

Once the node is in the hub and its monitor agent runs (the probes run as the
agent's `monitor-agent` user), issue a one-time code on the hub:

```bash
sudo python3 /opt/media-relay/media-relay.py enroll <hub node id or name> https://<hub>
```

It prints the command to run on the new node as root:

```bash
curl -fsSL https://<hub>/atlas-media/install.sh | sh -s -- <code>
```

The code works once and for 24 hours. The node trades it for its own token
(the relay keeps only its SHA-256, in its state directory), downloads the
probes from the relay itself (no GitHub), picks systemd, the container
fallback or busybox cron as above, and runs the first check. Its route is
traced from the source node within minutes, at the address it polls from,
placed with ip-api. `… | sh -s -- --uninstall` removes it again. Running the
command with a new code re-enrolls a node (its old token stops working).

| Request | Who | Does |
|---|---|---|
| `GET /atlas-media/install.sh`, `/atlas-media/files/<name>` | anyone | the node installer and the probe files (no secrets) |
| `POST /atlas-media/enroll` | the code as the body | `{node, token}` once; 403 for a wrong, used or expired code |
