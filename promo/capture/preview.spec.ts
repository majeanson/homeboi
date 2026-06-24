import { test } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { SCRIPTS } from '../scripts'
import { installCursor } from './cursor'
import { makeDriver } from './driver'
import { preparePage } from './setup'

// One still per clip beat (END state, after choreography) for the chosen surface+lang.
// Lets us SEE every screen the tour will show — full vs empty, where the cursor lands,
// what a punch would zoom into — and iterate the script fast, before any webm/render.
const SURFACE = (process.env.PREVIEW_SURFACE as 'wall' | 'phone') || 'wall'
const LANG = (process.env.PREVIEW_LANG as 'fr' | 'en') || 'fr'
const OUT = process.env.PREVIEW_OUT || path.join(process.cwd(), 'promo', '.pw-output', 'preview')
const VIEWPORT = SURFACE === 'wall' ? { width: 1280, height: 800 } : { width: 390, height: 844 }

test(`preview tour [${SURFACE}/${LANG}]`, async ({ browser }) => {
  test.setTimeout(600_000)
  fs.mkdirSync(OUT, { recursive: true })
  const script = SCRIPTS.find((s) => s.id === 'tour')!
  for (const beat of script.beats) {
    if (beat.titleCard || !beat.route || !beat.surfaces.includes(SURFACE)) continue
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    try {
      await preparePage(page, beat, SURFACE, LANG)
      await page.goto(beat.route!)
      await page
        .locator('.hub, .page, .scene, main, #root > *')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})
      await page.waitForTimeout(beat.settle ?? 700)
      await page.evaluate(installCursor)
      if (beat.play) {
        try {
          await beat.play(makeDriver(page, SURFACE, LANG))
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn(`  ⚠ ${beat.id} play() failed: ${(e as Error).message}`)
        }
      }
      await page.waitForTimeout(300)
      await page.screenshot({ path: path.join(OUT, `${beat.id}-${SURFACE}-${LANG}.png`) })
      // eslint-disable-next-line no-console
      console.log(`✓ ${beat.id}`)
    } finally {
      await ctx.close()
    }
  }
})
