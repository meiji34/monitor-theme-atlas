#!/bin/sh
# Streaming / AI service availability probes, run on a node by
# scripts/media.mjs (piped over SSH into `sh -s`) or the relay's poller. POSIX sh
# (busybox ash, dash, bash). Plain HTTPS requests over
# IPv4 from the node's own address; nothing is installed or written to disk.
# Prints raw indicators as "key<TAB>value" lines; the script on the other end
# turns them into results. Never print response bodies wholesale: they can
# carry the node's address.

UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
c() { curl -4 -sS --max-time 15 -A "$UA" "$@" 2>/dev/null; }
out() { printf '%s\t%s\n' "$1" "$2"; }
count() { printf '%s
' "$2" | grep -c -- "$1"; }
first() { printf '%s
' "$2" | grep -oE -- "$1" | head -n 1; }

netflix() {
  # Two licensed (non-Netflix) titles, then a Netflix original.
  out netflix.a "$(c -L -o /dev/null -w '%{http_code}' https://www.netflix.com/title/81280792)"
  out netflix.b "$(c -L -o /dev/null -w '%{http_code}' https://www.netflix.com/title/70143836)"
  local o
  o=$(c -L -o /dev/null -w '%{http_code} %{url_effective}' https://www.netflix.com/title/80018499)
  out netflix.o "${o%% *}"
  out netflix.url "${o#* }"
}

disney() {
  local k='ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84' a t r g
  a=$(c -X POST https://disney.api.edge.bamgrid.com/devices -H "authorization: Bearer $k" \
    -H 'content-type: application/json; charset=UTF-8' \
    -d '{"deviceFamily":"browser","applicationRuntime":"chrome","deviceProfile":"windows","attributes":{}}')
  a=$(first '"assertion":"[^"]+"' "$a" | cut -d'"' -f4)
  [ -z "$a" ] && { out disney.err device; return; }
  t=$(c -X POST https://disney.api.edge.bamgrid.com/token -H "authorization: Bearer $k" \
    --data-urlencode 'grant_type=urn:ietf:params:oauth:grant-type:token-exchange' \
    --data-urlencode latitude=0 --data-urlencode longitude=0 --data-urlencode platform=browser \
    --data-urlencode "subject_token=$a" \
    --data-urlencode 'subject_token_type=urn:bamtech:params:oauth:token-type:device')
  [ "$(count forbidden-location "$t")" -gt 0 ] && { out disney.forbidden 1; return; }
  r=$(first '"refresh_token":"[^"]+"' "$t" | cut -d'"' -f4)
  [ -z "$r" ] && { out disney.err token; return; }
  g=$(c -X POST https://disney.api.edge.bamgrid.com/graph/v1/device/graphql -H "authorization: $k" \
    -H 'content-type: application/json' \
    -d "{\"query\":\"mutation refreshToken(\$input: RefreshTokenInput!) { refreshToken(refreshToken: \$input) { activeSession { sessionId } } }\",\"variables\":{\"input\":{\"refreshToken\":\"$r\"}}}")
  out disney.supported "$(first '"inSupportedLocation":(true|false)' "$g" | cut -d: -f2)"
  out disney.cc "$(first '"countryCode":"[A-Z]{2}"' "$g" | cut -d'"' -f4)"
}

youtube() {
  local p
  p=$(c -L -H 'Accept-Language: en' -b 'CONSENT=YES+cb' https://www.youtube.com/premium)
  out youtube.size "${#p}"
  out youtube.gl "$(first '"INNERTUBE_CONTEXT_GL":"[A-Z]{2}"' "$p" | cut -d'"' -f4)"
  out youtube.unavailable "$(count 'Premium is not available in your country' "$p")"
  out youtube.cn "$(count 'www.google.cn' "$p")"
}

prime() {
  local p
  p=$(c -L https://www.primevideo.com)
  out prime.size "${#p}"
  out prime.territory "$(first '"currentTerritory":"[A-Z]{2}"' "$p" | cut -d'"' -f4)"
  out prime.restricted "$(count '"isServiceRestricted":true' "$p")"
}

chatgpt() {
  local a b
  a=$(c -H 'authorization: Bearer null' https://api.openai.com/compliance/cookie_requirements)
  b=$(c https://ios.chat.openai.com/)
  out chatgpt.api "${#a}"
  out chatgpt.unsupported "$(count unsupported_country "$a")"
  out chatgpt.vpn "$(count VPN "$b")"
  out chatgpt.loc "$(c https://chatgpt.com/cdn-cgi/trace | grep '^loc=' | cut -d= -f2)"
}

claude() {
  out claude.url "$(c -L -o /dev/null -w '%{url_effective}' https://claude.ai/)"
  out claude.loc "$(c https://claude.ai/cdn-cgi/trace | grep '^loc=' | cut -d= -f2)"
}

gemini() {
  local p
  p=$(c -L -H 'Accept-Language: en' https://gemini.google.com)
  out gemini.size "${#p}"
  out gemini.unsupported "$(printf '%s
' "$p" | grep -ciE "(not|isn.t) (currently )?(supported|available) in your (country|region)")"
  out gemini.cc3 "$(first ',2,1,200,"[A-Z]{3}"' "$p" | cut -d'"' -f2)"
}

bilibili() {
  local q='qn=0&type=&otype=json&fourk=1&fnver=0&fnval=16'
  out bilibili.hkmotw "$(first '"code":-?[0-9]+' "$(c "https://api.bilibili.com/pgc/player/web/playurl?avid=18281381&cid=29892777&ep_id=183799&$q")" | cut -d: -f2)"
  out bilibili.tw "$(first '"code":-?[0-9]+' "$(c "https://api.bilibili.com/pgc/player/web/playurl?avid=50762638&cid=100279344&ep_id=268176&$q")" | cut -d: -f2)"
}

abema() {
  local p
  p=$(c 'https://api.abema.io/v1/ip/check?device=android')
  out abema.cc "$(first '"isoCountryCode":"[A-Z]{2}"' "$p" | cut -d'"' -f4)"
  out abema.message "$(first '"message":"[a-z_]+"' "$p" | cut -d'"' -f4)"
}

spotify() {
  out spotify.redirect "$(c -o /dev/null -w '%{redirect_url}' https://www.spotify.com/premium/)"
}

tiktok() {
  # Now and then TikTok answers with a small challenge page instead: retry.
  local p region i
  for i in 1 2 3; do
    p=$(c -L https://www.tiktok.com/)
    region=$(first '"region":"[A-Z]{2}"' "$p" | cut -d'"' -f4)
    [ -n "$region" ] && break
    sleep 2
  done
  out tiktok.size "${#p}"
  out tiktok.region "$region"
}

command -v curl >/dev/null || { out error no-curl; exit 0; }
PROBES='netflix disney youtube prime chatgpt claude gemini bilibili abema spotify tiktok'
if [ -n "${SERIAL:-}" ]; then
  # One at a time, for nodes with very little memory (all at once peaked at ~50 MB).
  for f in $PROBES; do $f; done
else
  for f in $PROBES; do $f & done
  wait
fi
out done 1
