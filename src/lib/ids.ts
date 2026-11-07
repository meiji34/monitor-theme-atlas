// Node ids as the data knows them vs. as the hub knows them.
//
// Routes, streaming results and the relay key nodes by the monitor hub's
// numeric ids. On Komari nodes are uuids; src/data/ids.json (written by
// scripts/komari-ids.mjs, git-ignored) maps each data id to a Komari uuid.
// Without the file both sides are the same and these are identities.

const files = import.meta.env.VITE_ATLAS_BASE
  ? {}
  : import.meta.glob<Record<string, string>>('../data/ids.json', { eager: true, import: 'default' })
const TO_NODE: Record<string, string> = import.meta.env.VITE_ATLAS_HUB === 'komari' ? (Object.values(files)[0] ?? {}) : {}
const TO_DATA: Record<string, string> = Object.fromEntries(Object.entries(TO_NODE).map(([d, n]) => [n, d]))

// A data id (number or string) as the node id the hub uses.
export const nodeId = (dataId: string | number) => TO_NODE[String(dataId)] ?? String(dataId)
// A hub node id as the id the data and the relay use.
export const dataId = (id: string) => TO_DATA[id] ?? id
