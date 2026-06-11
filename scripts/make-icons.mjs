// One-off PWA icon generator — renders the Babillard "fridge magnet" tile with
// headless Chromium (Playwright is already a dev dep) and screenshots it at the
// sizes iOS/Android want. Re-run if the look changes:  node scripts/make-icons.mjs
// Outputs are committed (CI never runs this).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve('public/icons')
mkdirSync(OUT, { recursive: true })

// scale: how much of the tile the magnet fills. Maskable icons get the smaller
// safe-zone scale so launcher masks (circle, squircle) never clip the glyph.
const page_html = (scale) => `<!doctype html><html><head><style>
  * { margin: 0; padding: 0; }
  body { width: 100vw; height: 100vh; display: flex; align-items: center;
         justify-content: center; background: #FBF3E4; overflow: hidden;
         font-family: 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif; }
  span { font-size: ${scale}vw; line-height: 1; transform: rotate(-8deg);
         filter: drop-shadow(0 ${scale / 16}vw ${scale / 10}vw rgba(72,54,30,0.25)); }
</style></head><body><span>🧲</span></body></html>`

const JOBS = [
  { file: 'icon-512.png', size: 512, scale: 58 },
  { file: 'icon-192.png', size: 192, scale: 58 },
  { file: 'apple-touch-icon.png', size: 180, scale: 58 },
  { file: 'icon-maskable-512.png', size: 512, scale: 42 }, // safe zone
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
