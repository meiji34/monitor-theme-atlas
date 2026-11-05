#!/bin/sh
# Asks the hub's streaming-check relay whether a check is due for this node
# (someone pressed 「點擊檢測」, or the last one is a day old); if so runs the
# probes and posts their output back. Started every minute by a systemd timer
# (or cron where there's no systemd), as an unprivileged user.
#
# Needs HUB (https://<hub>/atlas-media), NODE (hub node ID) and TOKEN, from
# the environment (systemd EnvironmentFile) or /etc/media-check.env.

set -u
if [ -z "${TOKEN:-}" ] && [ -r /etc/media-check.env ]; then
  . /etc/media-check.env
fi
: "${HUB:?}" "${NODE:?}" "${TOKEN:?}"

# One run at a time (cron doesn't wait for the previous one).
exec 9>"${TMPDIR:-/tmp}/media-check.lock"
flock -n 9 || exit 0

due=$(curl -fsS --max-time 10 -H "Authorization: Bearer $TOKEN" "$HUB/agent/$NODE") || exit 0
[ "$due" = 1 ] || exit 0

SERIAL="${SERIAL:-}" sh "$(dirname "$0")/media-check.sh" |
  curl -fsS --max-time 30 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: text/plain' \
    --data-binary @- "$HUB/agent/$NODE" >/dev/null
