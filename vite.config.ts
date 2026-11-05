import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// The theme is served same-origin by the hub, so in dev every /api call
// (including the WebSocket) is proxied to a live hub: MONITOR_HUB, from the
// environment or a git-ignored .env.local (MONITOR_HUB=https://status.example.com).
export default defineConfig(({ command, mode }) => {
  const hub = process.env.MONITOR_HUB || loadEnv(mode, process.cwd(), '').MONITOR_HUB || ''
  if (command === 'serve' && !hub) console.warn('MONITOR_HUB is not set: /api requests will fail (see README → Development)')
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // The streaming-check relay next to the hub (relay/): live results in
        // dev; asking for a check only works on the hub's own origin.
        '/atlas-media': { target: hub, changeOrigin: true, secure: true },
        '/api': {
          target: hub,
          changeOrigin: true,
          secure: true,
          ws: true,
          // The hub checks Origin on the WebSocket handshake; present the hub's own.
          configure: (proxy) => {
            proxy.on('proxyReqWs', (req) => req.setHeader('Origin', hub))
            proxy.on('proxyReq', (req) => req.setHeader('Origin', hub))
          },
        },
      },
    },
  }
})
