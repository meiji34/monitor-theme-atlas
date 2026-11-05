# Streaming-check relay (流媒體即時檢測)

Lets the theme show live streaming-check results and lets a logged-in hub
admin press 「點擊檢測」 / 「重新檢測」. Without it the theme falls back to the
snapshot bundled by `scripts/media.mjs`.

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

## API

| Request | Who | Does |
|---|---|---|
| `GET /atlas-media/results` | anyone | `{nodes, pending, known, cooldown}` |
| `POST /atlas-media/check/<id>` | logged-in admin, `X-Atlas: 1` | queue a check (202), 401 not logged in, 429 cooldown |
| `GET /atlas-media/agent/<id>` | node, `Authorization: Bearer <token>` | `1` when a check is due, else `0` |
| `POST /atlas-media/agent/<id>` | node, bearer token | the probe output; stored as verdicts |

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
   (no path after the port). With 1Panel: 網站 → the status site → 反向代理 →
   建立, 前端請求路徑 `/atlas-media/`, 後端代理地址 `http://127.0.0.1:28090`.
   Check: `curl https://<hub>/atlas-media/results`.
3. **Each node**: `sh media-install-<id>.sh` → `/opt/media-check/`, `/etc/media-check.env`,
   `media-check.timer` (or a line in `/etc/crontabs/monitor-agent` on Alpine);
   runs once right away, so the result shows up within a minute. In a container
   where systemd can't sandbox the unit or switch user (podman, some LXC), the
   script adds `media-check.service.d/container.conf`: started as root without
   the sandboxing, dropping to `monitor-agent` through `runuser`.

A node added later: give it a token in `relay.local.json`, rebuild and reinstall
the hub script (it rewrites `tokens.json` and restarts the relay), then run
that node's script.
