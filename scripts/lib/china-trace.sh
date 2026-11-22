#!/bin/sh
# Return path from this node to the three Chinese carriers, for the theme's
# 「三網回程」: run by scripts/china-lines.mjs (piped over SSH into `sh -s`). POSIX
# sh. Nothing is installed or written to disk; it uses whichever tracer the
# node already has. Prints "tool<TAB>carrier<TAB>name" and
# "hop<TAB>carrier<TAB>ttl<TAB>address" lines; the addresses are classified,
# then dropped, on the machine that ran it.
#
# Targets: the same Fujian addresses as the hub's latency tasks (TCP port 80).

TARGETS="ct fj-ct-v4.ip.zstaticcdn.com
cu fj-cu-v4.ip.zstaticcdn.com
cm fj-cm-v4.ip.zstaticcdn.com"

root=0
[ "$(id -u)" = 0 ] && root=1

# "ttl address" per line of any tracer's output (the first IPv4 on the line).
hops() {
  awk '{
    ttl = $1; sub(/\.$/, "", ttl); sub(/\.[|]--$/, "", ttl)
    if (ttl !~ /^[0-9]+$/) next
    if (match($0, /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) print ttl, substr($0, RSTART, RLENGTH)
  }'
}

# TTL-limited pings: the router that drops each one answers "From <address>".
pingtrace() {
  ttl=1
  while [ "$ttl" -le 30 ]; do
    r=$(ping -n -c 1 -W 1 -t "$ttl" "$1" 2>/dev/null)
    a=$(printf '%s\n' "$r" | sed -n 's/^From \([0-9.]*\).*/\1/p' | head -n 1)
    [ -n "$a" ] && echo "$ttl $a"
    b=$(printf '%s\n' "$r" | sed -n 's/.*bytes from \([0-9.]*\).*/\1/p' | head -n 1)
    [ -n "$b" ] && { echo "$ttl $b"; break; }
    ttl=$((ttl + 1))
  done
}

# Prints "tool <name>", then "ttl address" lines.
trace() {
  if [ $root = 1 ] && traceroute --version 2>&1 | grep -qi 'modern traceroute'; then
    echo 'tool traceroute-tcp'
    traceroute -n -q 2 -w 1 -m 30 -T -p 80 "$1" 2>/dev/null | hops
  elif command -v mtr >/dev/null 2>&1; then
    # TCP needs mtr-packet's raw-socket right (root, or the file capability).
    out=$(mtr -n -r -c 3 -T -P 80 "$1" 2>/dev/null | hops)
    if [ -n "$out" ]; then
      echo 'tool mtr-tcp'
    else
      echo 'tool mtr'
      out=$(mtr -n -r -c 3 "$1" 2>/dev/null | hops)
    fi
    [ -n "$out" ] && printf '%s\n' "$out"
  elif [ $root = 1 ] && busybox traceroute 2>&1 | grep -q -- '-I'; then
    echo 'tool busybox-icmp'
    busybox traceroute -n -q 1 -w 1 -m 30 -I "$1" 2>/dev/null | hops
  elif command -v traceroute >/dev/null 2>&1; then
    echo 'tool traceroute-udp'
    traceroute -n -q 1 -w 1 -m 30 "$1" 2>/dev/null | hops
  elif [ $root = 1 ] && command -v ping >/dev/null 2>&1; then
    echo 'tool ping-ttl'
    pingtrace "$1"
  else
    echo 'tool none'
  fi
}

printf '%s\n' "$TARGETS" | while read -r carrier host; do
  trace "$host" | while read -r a b; do
    if [ "$a" = tool ]; then
      printf 'tool\t%s\t%s\n' "$carrier" "$b"
    elif [ -n "$b" ]; then
      printf 'hop\t%s\t%s\t%s\n' "$carrier" "$a" "$b"
    fi
  done
done
printf 'done\t1\n'
