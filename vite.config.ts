import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SPA build. Pages Functions live in functions/ and are served by Cloudflare
// alongside the static dist/. Local full-stack dev is `wrangler pages dev`
// (which serves dist/ + functions/); plain `vite` gives a frontend-only loop
// with the API proxied to wrangler on 8788. Test config lives in
// vitest.config.ts (kept separate so the two vite copies don't clash in tsc).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8788',
    },
  },
})
