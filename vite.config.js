import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // The sandbox preview is served from a proxied host (https://<port>-<id>.e2b.app),
    // so the dev server must not reject unknown Host headers. HMR is left at its
    // defaults: Vite derives the socket URL from `location`, which is exactly what
    // the reverse proxy in front of this dev server serves.
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Keep the physics WASM and renderer out of the lightweight atlas entry.
        manualChunks(id) {
          if (id.includes('/@dimforge/rapier3d')) return 'rapier'
          if (id.includes('/node_modules/three/')) return 'three'
        },
      },
    },
  },
})
