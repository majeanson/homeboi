// ON-DEMAND: regenerates the landing page's product shots (public/showcase/*) and the
// link-preview card (public/og.jpg) from a REAL demo sandbox on the deployed app.
//
//   node scripts/capture-showcase.mjs [https://babillard.marcportal.com]
//   node scripts/capture-showcase.mjs --og-only   (re-compose og.jpg from the committed shots)
//
// `sharp` is NOT a declared dependency on purpose (knip ignores it): it rides in with miniflare, and
// declaring it rewrote ~1 100 lines of the lockfile for a script nobody runs in CI.
// Not part of CI — it needs the network and mints (then abandons) one throwaway sandbox
// household per language, which the 24 h sweep removes. Re-run it when the board's look
// changes enough that the landing's picture lies. Output is committed: the landing must
// never depend on a capture happening at build time.
//
// What it freezes, deliberately: day theme, no day-part drift, no onboarding chrome
// (tour seen, welcome + claim strips dismissed) — the picture is of the BOARD, not of
// the demo around it. The wide shot is the kiosk surface (the product's flagship wall
// tablet), the tall one the phone.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ogOnly = process.argv.includes('--og-only')
const base = (process.argv.find((a, i) => i > 1 && a.startsWith('http')) ?? 'https://babillard.marcportal.com').replace(/\/$/, '')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'public', 'showcase')
mkdirSync(out, { recursive: true })

const SHOTS = [
  { name: 'board-wide', viewport: { width: 1280, height: 800 }, surface: 'kiosk', scale: 1 },
  { name: 'board-phone', viewport: { width: 390, height: 844 }, surface: 'mobile', scale: 2 },
]

const browser = ogOnly ? null : await chromium.launch()
const wideBuffers = {}
for (const lang of ogOnly ? [] : ['fr', 'en']) {
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      locale: lang === 'fr' ? 'fr-CA' : 'en-CA',
      hasTouch: shot.surface === 'mobile',
    })
    await ctx.addInitScript(
      ([l, s]) => {
        const set = (k, v) => localStorage.setItem(k, v)
        set('babillard-lang', l)
        set('babillard-theme', 'day')
        set('babillard-daypart-auto', '0')
        set('babillard-surface', s)
        set('babillard-tours-seen', JSON.stringify(['essentials']))
        set('babillard-welcome', JSON.stringify({ dismissed: true, done: [] }))
        set('babillard-sample-banner', '1')
        set('babillard-claim-banner', '1')
      },
      [lang, shot.surface],
    )
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    // The demo door is the one path that mints a sandbox; /api/demo is what the button calls.
    const r = await page.evaluate(() => fetch('/api/demo', { method: 'POST', credentials: 'include' }).then((x) => x.json()))
    if (!r.sandbox) throw new Error('demo cap reached — the fallback is a read-only guest, not what we want to photograph')
    await page.goto(base + '/board', { waitUntil: 'networkidle' })
    await page.waitForTimeout(3500) // fonts + the first poll settle
    const png = await page.screenshot()
    const webp = await sharp(png).webp({ quality: 82 }).toBuffer()
    writeFileSync(path.join(out, `${shot.name}-${lang}.webp`), webp)
    if (shot.name === 'board-wide' && lang === 'fr') wideBuffers.fr = png
    console.log(`${shot.name}-${lang}.webp`, (webp.length / 1024).toFixed(0) + ' kB')
    await ctx.close()
  }
}
await browser?.close()
if (ogOnly) wideBuffers.fr = await sharp(path.join(out, 'board-wide-fr.webp')).png().toBuffer()

// The link-preview card: 1200×630, cream paper, the wordmark + promise on the left, the
// board on the right. Built from SVG text so there is no font dependency beyond the
// system stack — it is a thumbnail, not a poster.
const W = 1200
const H = 630
const shotW = 620
const shotH = Math.round((shotW * 800) / 1280)
const shot = await sharp(wideBuffers.fr).resize(shotW, shotH).png().toBuffer()
const rounded = await sharp(shot)
  .composite([{ input: Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH}" rx="18"/></svg>`), blend: 'dest-in' }])
  .png()
  .toBuffer()
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#FBF3E4"/>
  <circle cx="74" cy="92" r="16" fill="#F2A03D"/>
  <text x="104" y="102" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="700" fill="#2b2118">Babillard</text>
  <text x="56" y="260" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#2b2118">Toute la</text>
  <text x="56" y="318" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#2b2118">maisonnée,</text>
  <text x="56" y="376" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="800" fill="#2b2118">d’un coup d’œil.</text>
  <text x="56" y="450" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#6b5b4a">Sans points. Sans notifications.</text>
  <rect x="${W - shotW - 40 - 6}" y="${(H - shotH) / 2 - 6 + 8}" width="${shotW + 12}" height="${shotH + 12}" rx="24" fill="#2b2118" opacity="0.10"/>
</svg>`
const card = await sharp(Buffer.from(svg))
  .composite([{ input: rounded, left: W - shotW - 40, top: Math.round((H - shotH) / 2) }])
  .jpeg({ quality: 86 })
  .toBuffer()
writeFileSync(path.join(root, 'public', 'og.jpg'), card)
console.log('og.jpg', (card.length / 1024).toFixed(0) + ' kB')
