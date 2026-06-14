// One-off PWA icon generator — renders the Babillard home-screen tile with
// headless Chromium (Playwright is already a dev dep) and screenshots it at the
// sizes iOS/Android want. Re-run if the look changes:  node scripts/make-icons.mjs
// Outputs are committed (CI never runs this).
//
// The mark is the Phosphor "sun" glyph (the same bold icon set the app's <Icon>
// uses) in Pip's marigold on the cream paper background — warm, calm, on-brand.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('public/icons')
mkdirSync(OUT, { recursive: true })

// Pip palette (src/styles/core.css): cream paper background + marigold-deep ink,
// matching the manifest's background_color/theme_color (#FBF3E4).
const BG = '#FBF3E4'
const FILL = '#d9842a' // --marigold-deep
// Phosphor `sun-bold`, viewBox 0 0 256 256 (the glyph fills ~84% of its box).
const SUN =
  'M116,36V20a12,12,0,0,1,24,0V36a12,12,0,0,1-24,0Zm80,92a68,68,0,1,1-68-68A68.07,68.07,0,0,1,196,128Zm-24,0a44,44,0,1,0-44,44A44.05,44.05,0,0,0,172,128ZM51.51,68.49a12,12,0,1,0,17-17l-12-12a12,12,0,0,0-17,17Zm0,119-12,12a12,12,0,0,0,17,17l12-12a12,12,0,1,0-17-17ZM196,72a12,12,0,0,0,8.49-3.51l12-12a12,12,0,0,0-17-17l-12,12A12,12,0,0,0,196,72Zm8.49,115.51a12,12,0,0,0-17,17l12,12a12,12,0,0,0,17-17ZM48,128a12,12,0,0,0-12-12H20a12,12,0,0,0,0,24H36A12,12,0,0,0,48,128Zm80,80a12,12,0,0,0-12,12v16a12,12,0,0,0,24,0V220A12,12,0,0,0,128,208Zm108-92H220a12,12,0,0,0,0,24h16a12,12,0,0,0,0-24Z'

// scale: the glyph's width as a % of the tile. Maskable icons get the smaller
// safe-zone scale so launcher masks (circle, squircle) never clip the rays.
const page_html = (scale) => `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; }
  body { width: 100vw; height: 100vh; display: flex; align-items: center;
         justify-content: center; background: ${BG}; overflow: hidden; }
  svg { width: ${scale}vw; height: ${scale}vw;
        filter: drop-shadow(0 ${scale / 16}vw ${scale / 10}vw rgba(72,54,30,0.25)); }
</style></head><body>
  <svg viewBox="0 0 256 256" fill="${FILL}"><path d="${SUN}"/></svg>
</body></html>`

const JOBS = [
  { file: 'icon-512.png', size: 512, scale: 56 },
  { file: 'icon-192.png', size: 192, scale: 56 },
  { file: 'apple-touch-icon.png', size: 180, scale: 56 },
  { file: 'icon-maskable-512.png', size: 512, scale: 40 }, // safe zone
]

const browser = await chromium.launch()
for (const job of JOBS) {
  const page = await browser.newPage({ viewport: { width: job.size, height: job.size } })
  await page.setContent(page_html(job.scale))
  await page.screenshot({ path: resolve(OUT, job.file) })
  await page.close()
  console.log(`✓ ${job.file} (${job.size}×${job.size})`)
}
await browser.close()
