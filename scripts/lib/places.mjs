// Tables for placing routers and naming networks, shared by scripts/routes.mjs
// and (serialised by relay/build-installer.mjs) the relay's route tracing.

// --- places carriers name in reverse DNS ------------------------------------------

// name, country, lng, lat, codes (airport / CLLI / carrier site codes, city names)
export const PLACE_ROWS = [
  ['Melbourne', 'AU', 144.96, -37.81, 'mel melb melbourne mlb'],
  ['Sydney', 'AU', 151.21, -33.87, 'syd sydney sydn sydnau sydo'],
  ['Brisbane', 'AU', 153.03, -27.47, 'bne brisbane bris'],
  ['Perth', 'AU', 115.86, -31.95, 'per perth'],
  ['Adelaide', 'AU', 138.6, -34.93, 'adl adelaide'],
  ['Auckland', 'NZ', 174.76, -36.85, 'akl auckland'],
  ['Wellington', 'NZ', 174.78, -41.29, 'wlg wellington'],
  ['Christchurch', 'NZ', 172.64, -43.53, 'chc christchurch'],
  ['Guam', 'GU', 144.79, 13.44, 'gum guam'],
  ['Honolulu', 'US', -157.86, 21.31, 'hnl honolulu'],
  ['Singapore', 'SG', 103.82, 1.35, 'sin sgp sng sngpsi singapore'],
  ['Hong Kong', 'HK', 114.17, 22.32, 'hkg hnk hkgchk hongkong'],
  ['Tokyo', 'JP', 139.69, 35.69, 'nrt hnd tyo tok tky tokyjp tokyo'],
  ['Osaka', 'JP', 135.5, 34.69, 'kix osa osakjp osaka'],
  ['Seoul', 'KR', 126.98, 37.57, 'icn sel seoul'],
  ['Taipei', 'TW', 121.56, 25.03, 'tpe taipei'],
  ['Kuala Lumpur', 'MY', 101.69, 3.14, 'kul kualalumpur'],
  ['Bangkok', 'TH', 100.5, 13.76, 'bkk bangkok'],
  ['Jakarta', 'ID', 106.85, -6.21, 'cgk jkt jakarta'],
  ['Manila', 'PH', 120.98, 14.6, 'mnl manila'],
  ['Mumbai', 'IN', 72.88, 19.08, 'bom mumbai'],
  ['Chennai', 'IN', 80.27, 13.08, 'maa chennai'],
  ['Dubai', 'AE', 55.27, 25.2, 'dxb dubai'],
  // tlot: Telstra Global's One Wilshire site
  ['Los Angeles', 'US', -118.24, 34.05, 'lax lsanca tlot losangeles'],
  ['San Jose', 'US', -121.89, 37.34, 'sjc snjsca sjo sanjose'],
  ['Palo Alto', 'US', -122.14, 37.44, 'pao plalca palo paloalto'],
  ['San Francisco', 'US', -122.42, 37.77, 'sfo sanfrancisco'],
  ['Fremont', 'US', -121.99, 37.55, 'fmt fremont'],
  ['Seattle', 'US', -122.33, 47.61, 'sea sttlwa seattle'],
  ['Portland', 'US', -122.68, 45.52, 'pdx portland'],
  ['Las Vegas', 'US', -115.14, 36.17, 'las lsvgnv lasvegas'],
  ['Phoenix', 'US', -112.07, 33.45, 'phx phnxaz phoenix'],
  ['Salt Lake City', 'US', -111.89, 40.76, 'slc saltlake'],
  ['Denver', 'US', -104.99, 39.74, 'den dnvrco denver'],
  ['Omaha', 'US', -95.94, 41.26, 'oma omaha'],
  ['Kansas City', 'US', -94.58, 39.1, 'mci kscymo kcy kansascity'],
  ['Minneapolis', 'US', -93.27, 44.98, 'msp minneapolis'],
  ['Chicago', 'US', -87.63, 41.88, 'ord chi chcgil chicago'],
  ['St. Louis', 'US', -90.2, 38.63, 'stl stlsmo stlouis'],
  ['Dallas', 'US', -96.8, 32.78, 'dfw dal dllstx dallas'],
  ['Houston', 'US', -95.37, 29.76, 'iah hou hstntx houston'],
  ['Atlanta', 'US', -84.39, 33.75, 'atl atlnga atlanta'],
  ['Miami', 'US', -80.19, 25.76, 'mia miamfl miami'],
  ['Ashburn', 'US', -77.49, 39.04, 'iad ash asbnva ashburn'],
  ['Washington', 'US', -77.04, 38.91, 'dca wdc washington'],
  ['New York', 'US', -74.0, 40.71, 'nyc jfk nyk ewr nycmny newyork'],
  ['Boston', 'US', -71.06, 42.36, 'bos boston'],
  ['Toronto', 'CA', -79.38, 43.65, 'yyz tor toronto'],
  ['Vancouver', 'CA', -123.12, 49.28, 'yvr vancouver'],
  ['Amsterdam', 'NL', 4.9, 52.37, 'ams adm amstnl amsterdam'],
  ['Frankfurt', 'DE', 8.68, 50.11, 'fra ffm frnkge frankfurt'],
  ['Düsseldorf', 'DE', 6.78, 51.23, 'dus dusseldorf'],
  ['Hamburg', 'DE', 9.99, 53.55, 'ham hamburg'],
  ['Berlin', 'DE', 13.4, 52.52, 'ber berlin'],
  ['Munich', 'DE', 11.58, 48.14, 'muc munich'],
  ['London', 'GB', -0.13, 51.51, 'lon lhr ldn londen london'],
  ['Paris', 'FR', 2.35, 48.86, 'par cdg prs parsfr paris'],
  ['Marseille', 'FR', 5.37, 43.3, 'mrs marseille'],
  ['Brussels', 'BE', 4.35, 50.85, 'bru brussels'],
  ['Zurich', 'CH', 8.54, 47.38, 'zrh zurich'],
  ['Vienna', 'AT', 16.37, 48.21, 'vie vienna'],
  ['Milan', 'IT', 9.19, 45.46, 'mil mxp mlanit milan'],
  ['Madrid', 'ES', -3.7, 40.42, 'mad mdrdsp madrid'],
  ['Lisbon', 'PT', -9.14, 38.72, 'lis lisbon'],
  ['Dublin', 'IE', -6.26, 53.35, 'dub dublin'],
  ['Stockholm', 'SE', 18.07, 59.33, 'sto arn stockholm'],
  ['Copenhagen', 'DK', 12.57, 55.68, 'cph kbn copenhagen'],
  ['Oslo', 'NO', 10.75, 59.91, 'osl oslo'],
  ['Helsinki', 'FI', 24.94, 60.17, 'hel helsinki'],
  ['Warsaw', 'PL', 21.01, 52.23, 'waw warsaw'],
  ['Prague', 'CZ', 14.42, 50.08, 'prg prague'],
]
export const PLACE_CODES = new Map()
for (const [name, cc, lng, lat, codes] of PLACE_ROWS) {
  for (const code of codes.split(' ')) PLACE_CODES.set(code, { city: name, cc, at: [lng, lat] })
}
// Australian carriers often name only the state (…lsr01.melb.vic.vocus.network).
export const STATE_CODES = { vic: 'mel', nsw: 'syd', qld: 'bne' }
// Exchange points name their site: 31898-me1-ix.equinix.com is Equinix ME1, Melbourne.
export const IBX = { me: 'mel', sy: 'syd', sg: 'sin', hk: 'hkg', ty: 'tyo', os: 'osa', la: 'lax', sv: 'sjc', se: 'sea', ch: 'chi', da: 'dal', ny: 'nyc', dc: 'ash', am: 'ams', fr: 'fra', ld: 'lon', pa: 'par' }

export function placeFromHostname(host) {
  if (!host) return null
  const tokens = host.toLowerCase().split(/[.\-_]+/).filter(Boolean)
  if (/(^|\.)equinix\.com$/.test(host.toLowerCase())) {
    for (const t of tokens) {
      const m = /^([a-z]{2})\d{1,2}$/.exec(t)
      if (m && IBX[m[1]]) return PLACE_CODES.get(IBX[m[1]])
    }
  }
  const forms = (t) => [t, t.replace(/\d+$/, ''), t.replace(/^\d+/, '').replace(/\d+$/, '')]
  for (let i = 0; i < tokens.length; i++) {
    const pair = tokens[i + 1] ? [tokens[i] + tokens[i + 1]] : []
    for (const f of [...forms(tokens[i]), ...pair]) {
      if (f.length >= 3 && PLACE_CODES.has(f)) return PLACE_CODES.get(f)
    }
  }
  for (const t of tokens) if (STATE_CODES[t]) return PLACE_CODES.get(STATE_CODES[t])
  return null
}

// Friendly names for the networks these routes usually cross; others fall back
// to what ip-api reports.
export const AS_NAMES = {
  174: 'Cogent',
  701: 'Verizon',
  1221: 'Telstra',
  1299: 'Arelion',
  2516: 'KDDI',
  2914: 'NTT',
  3257: 'GTT',
  3320: 'Deutsche Telekom',
  3356: 'Lumen',
  3491: 'PCCW',
  4134: 'China Telecom 163',
  4637: 'Telstra Global',
  4713: 'NTT OCN',
  4788: 'TM Net',
  4809: 'China Telecom CN2',
  4826: 'Vocus',
  4837: 'China Unicom',
  5511: 'Orange',
  6453: 'Tata',
  6461: 'Zayo',
  6762: 'Sparkle',
  6939: 'Hurricane Electric',
  7018: 'AT&T',
  7393: 'QuadraNet',
  7474: 'Optus',
  7578: 'GSL Networks',
  7473: 'Singtel',
  7922: 'Comcast',
  8075: 'Microsoft',
  9002: 'RETN',
  9009: 'M247',
  9304: 'HGC',
  9500: 'One NZ',
  9929: 'China Unicom 9929',
  10026: 'PCCW Global',
  13335: 'Cloudflare',
  14061: 'DigitalOcean',
  15169: 'Google',
  16276: 'OVH',
  16509: 'Amazon',
  17676: 'SoftBank',
  20473: 'Vultr',
  24482: 'SG.GS',
  24940: 'Hetzner',
  31898: 'Oracle Cloud',
  38195: 'Superloop',
  58453: 'China Mobile CMI',
  9808: 'China Mobile Guangdong',
  60781: 'LeaseWeb NL',
  137409: 'GSL Networks NZ',
  58807: 'China Mobile CMIN2',
  9299: 'PLDT',
  4775: 'Globe',
  4657: 'StarHub',
  4766: 'Korea Telecom',
  3786: 'LG U+',
  7713: 'Telkom Indonesia',
  9498: 'Airtel',
  4755: 'Tata Comm. India',
}
