import type { Page } from '@playwright/test'
import type { Lang } from '../../e2e/mocks'
import type { Driver, SurfaceName } from '../scripts/types'

// The choreography driver: glides the recorded cursor + performs real clicks/scrolls
// while a beat's play() runs. Shared by the video capture (capture.spec.ts) and the
// fast still preview (preview.spec.ts) so both drive the app identically.

export async function pointOf(page: Page, target: string | { x: number; y: number }) {
  if (typeof target !== 'string') return target
  // Fast-fail: don't let a missing selector burn the actionTimeout.
  const box = await page.locator(target).first().boundingBox({ timeout: 1800 })
  if (!box) throw new Error(`target not found: ${target}`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

export function makeDriver(page: Page, surface: SurfaceName, lang: Lang): Driver {
  // Resilient: a missing target is logged and skipped rather than aborting the whole
  // (long) capture run. The clip still records the settle + hold, so the beat survives.
  const warn = (msg: string) => {
    // eslint-disable-next-line no-console
    console.warn(`  ⚠ choreography: ${msg}`)
  }
  const move = async (target: string | { x: number; y: number }) => {
    try {
      const p = await pointOf(page, target)
      await page.mouse.move(p.x, p.y, { steps: 26 })
      await page.waitForTimeout(120)
    } catch {
      warn(`move target not found: ${typeof target === 'string' ? target : 'point'}`)
    }
  }
  const clickPoint = async (p: { x: number; y: number }) => {
    await page.mouse.move(p.x, p.y, { steps: 26 })
    await page.waitForTimeout(160)
    await page.mouse.down()
    await page.waitForTimeout(80)
    await page.mouse.up()
    await page.waitForTimeout(420)
  }
  const click = async (target: string) => {
    try {
      await clickPoint(await pointOf(page, target))
    } catch {
      warn(`click target not found: ${target}`)
    }
  }
  return {
    page,
    surface,
    lang,
    move,
    click,
    async clickText(text) {
      try {
        const box = await page.getByText(text[lang], { exact: false }).first().boundingBox({ timeout: 1800 })
        if (!box) return warn(`text not found: ${text[lang]}`)
        await clickPoint({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
      } catch {
        warn(`text not found: ${text[lang]}`)
      }
    },
    async type(target, txt) {
      await click(target)
      await page.keyboard.type(txt, { delay: 55 })
      await page.waitForTimeout(250)
    },
    async scrollTo(target) {
      await page.locator(target).first().scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(300)
    },
    async wheel(_target, dy) {
      // Scroll at the parked pointer (centre) — no locator wait, so it never stalls.
      await page.mouse.wheel(0, dy)
      await page.waitForTimeout(450)
    },
    async wait(ms) {
      await page.waitForTimeout(ms)
    },
  }
}
