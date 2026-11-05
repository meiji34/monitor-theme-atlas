#!/bin/sh
# Asks the hub's relay whether a streaming check is due for this node
# (someone pressed 「點擊檢測」, or the last one is a day old); if so runs the
# probes and posts their output back. On the node routes are traced from, it
# also asks which nodes to trace and posts an mtr report for each. Started
# every minute by a systemd timer (or cron where there's no systemd), as an
# unprivileged user.
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
if [ "$due" = 1 ]; then
  SERIAL="${SERIAL:-}" sh "$(dirname "$0")/media-check.sh" |
    curl -fsS --max-time 30 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: text/plain' \
      --data-binary @- "$HUB/agent/$NODE" >/dev/null
fi

# Route tracing: only the source node gets jobs, one "trace <id> <address>" per line.
command -v mtr >/dev/null || exit 0
jobs=$(curl -fsS --max-time 10 -H "Authorization: Bearer $TOKEN" "$HUB/agent/$NODE/jobs") || exit 0
printf '%s\n' "$jobs" | while read -r kind to target; do
  [ "$kind" = trace ] || continue
  case "$to" in '' | *[!0-9]*) continue ;; esac
  case "$target" in '' | *[!0-9a-fA-F.:]*) continue ;; esac
  mtr -rwbz -c 3 --json "$target" 2>/dev/null |
    curl -fsS --max-time 30 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data-binary @- "$HUB/agent/$NODE/trace/$to" >/dev/null
done
