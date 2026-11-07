#!/bin/sh
# Atlas probe for a monitor node: streaming / AI checks once a day, and route
# tracing when it's the source node. Run as root with the one-time code from
#   python3 /opt/media-relay/media-relay.py enroll <node>      (on the hub)
#
#   curl -fsSL https://<hub>/atlas-media/install.sh | sh -s -- <code>
#   curl -fsSL https://<hub>/atlas-media/install.sh | sh -s -- --uninstall
#
# It trades the code for this node's own token, then installs:
#   /opt/media-check/{media-check.sh,report.sh}   the probes and the poller
#   /etc/media-check.env                          hub URL, node ID, token
#   a job every minute, as user monitor-agent: a systemd timer
#   (media-check.timer), or without systemd a line in /etc/crontabs/monitor-agent
# Each minute it asks the hub whether a check is due and only then runs the
# probes (plain HTTPS requests). It only connects out; nothing listens on the
# node, and the hub can't make it run anything else.
set -eu
HUB='__HUB__'

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
if [ "${1:-}" = --uninstall ]; then
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
code="${1:-}"
[ -n "$code" ] || { echo "usage: sh install.sh <one-time code>   (get one on the hub: media-relay.py enroll <node>)" >&2; exit 1; }
id monitor-agent >/dev/null 2>&1 || { echo "user monitor-agent missing: install the monitor agent first (hub admin -> node -> install command)" >&2; exit 1; }
for t in curl flock; do command -v $t >/dev/null || { echo "$t missing (Alpine: apk add curl util-linux; Debian: apt install curl util-linux)" >&2; exit 1; }; done

# 1. The code for this node's token (the code stops working right away).
answer=$(curl -fsS --max-time 20 -X POST -H 'Content-Type: text/plain' --data-binary "$code" "$HUB/enroll") ||
  { echo "enrolment refused: the code is wrong, used or older than 24 hours" >&2; exit 1; }
node=$(printf '%s' "$answer" | sed -n 's/.*"node": *"\([0-9]*\)".*/\1/p')
token=$(printf '%s' "$answer" | sed -n 's/.*"token": *"\([A-Za-z0-9_-]*\)".*/\1/p')
[ -n "$node" ] && [ -n "$token" ] || { echo "unexpected answer from the hub" >&2; exit 1; }
echo "enrolled as hub node #$node"

# 2. The probes, from the hub (no GitHub needed).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for f in media-check.sh report.sh media-check.service media-check.timer; do
  curl -fsS --max-time 30 -o "$tmp/$f" "$HUB/files/$f" || { echo "download of $f failed" >&2; exit 1; }
done
install -d -m 755 /opt/media-check
install -m 755 "$tmp/media-check.sh" /opt/media-check/media-check.sh
install -m 755 "$tmp/report.sh" /opt/media-check/report.sh

# Under ~400 MB of memory the probes run one at a time.
mem=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
serial=''
[ "${mem:-0}" -lt 400000 ] && serial='SERIAL=1'
umask 077
printf 'HUB=%s\nNODE=%s\nTOKEN=%s\n%s\n' "$HUB" "$node" "$token" "$serial" > /etc/media-check.env
umask 022

# 3. Every minute, as monitor-agent (on a node with WARP policy routing that
#    user is exempt, so the checks see the node's own address).
if [ -d /run/systemd/system ]; then
  chmod 600 /etc/media-check.env
  install -m 644 "$tmp/media-check.service" /etc/systemd/system/media-check.service
  install -m 644 "$tmp/media-check.timer" /etc/systemd/system/media-check.timer
  systemctl daemon-reload
  systemctl enable --now media-check.timer
  echo "installed: systemd timer"
  echo "--- first run:"
  if systemctl start media-check.service; then
    echo ok
  else
    # Some containers (podman, LXC, OpenVZ) won't let systemd sandbox the unit
    # or switch user itself: start it as root without the sandboxing and drop
    # to monitor-agent with runuser instead.
    echo "retrying with runuser, no sandboxing (container?)"
    command -v runuser >/dev/null || { echo "runuser missing" >&2; exit 1; }
    install -d -m 755 /etc/systemd/system/media-check.service.d
    printf '[Service]\nUser=\nExecStart=\nExecStart=%s -u monitor-agent -- /opt/media-check/report.sh\nPrivateTmp=no\nPrivateDevices=no\nProtectSystem=no\nProtectHome=no\n' \
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
  pgrep crond >/dev/null && echo "crond is running" || echo "crond is NOT running: start it (rc-service crond start; rc-update add crond)"
  echo "--- first run:"
  su -s /bin/sh monitor-agent -c /opt/media-check/report.sh && echo ok
else
  echo "no systemd and no /etc/crontabs: add '* * * * * /opt/media-check/report.sh' to monitor-agent's crontab" >&2
  exit 1
fi
echo "done: results show on the status page within a few minutes; its route is traced from the source node soon after"
