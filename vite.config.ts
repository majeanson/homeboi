import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SPA build. The app is a Cloudflare Worker with static assets: worker/index.ts
// serves dist/ and routes /api/* to the handlers in functions/. Local full-stack
// dev is `npm run cf:dev` (wrangler dev — serves assets + Worker on :8787);
// plain `vite` gives a frontend-only loop with HMR and the API proxied to that
// wrangler instance. Test config lives in vitest.config.ts (kept separate so the
// two vite copies don't clash in tsc).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
