import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'
// The same per-child right-edge check add-sheet-overflow.spec.ts uses: a composer
// that gained a full-width line is also the shape most likely to bleed past it.
import { assertClean } from './overflow'

// « Generous inside » — the counterpart to LEAN.md's chrome ratchet, and its exact
// mirror image.
//
// LEAN measures a BROWSE surface: how much chrome you scroll past before the
// content (`contentTopPx`), a ceiling that only ever moves down. It says nothing
// about a surface you deliberately OPENED to do one thing — the ＋ sheet's
// composer, an expanded section add box, a scene form. There, the field IS the
// content, and the failure runs the other way: the chrome (a labeled CTA, a mic, a
// 📎, a caret) eats the line and the text gets ~60px. That shipped — « Restants »
// on a 390px phone showed a placeholder clipped to « Ajouter un ».
//
// So this file budgets the opposite direction: a FLOOR on the typing width, which
// only ever moves UP. Tighten a floor in the same commit as the pass that earned
// it; lowering one is the thing this file exists to prevent (say why in the commit
// if you ever must).
//
// The second assertion is the one that actually reads like the bug: the field's
// own placeholder, measured in the field's own font, must FIT. A number can drift
// past a reviewer; « Ajouter un… » cannot.

async function boot(page: Page, width: number) {
  await page.setViewportSize({ width, height: 844 })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
    } catch {
      /* noop */
    }
  })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}

type Composer = {
  /** What a human calls it — this is what a failure prints. */
  name: string
  route: string
  /** The chooser tile to drill into. null = the sheet opens straight on the field. */
  mode: string | null
  /** Where the field lives once open (scoped to the shown sheet). */
  field?: string
  /** Typing-width FLOOR in px, per phone width. Measured, never invented. */
  floor: Record<number, number>
}

// Floors were read off a real baseline run (2026-08-26, the pass that stacked the
// CTA) minus ~10% for font and rounding drift — never invented, exactly like
// LEAN.md's ceilings. Each test prints the number it measured, so re-baselining
// upward is a copy from the run log.
//
// The in-sheet composers, i.e. every ＋ tile that opens a field rather than
// navigating away. `meal` is absent on purpose: it opens a day-chip picker, not a
// text field.
const COMPOSERS: Composer[] = [
  // The board's hoisted « Note rapide » — the fastest path in the app, and the
  // field carrying the most in-box furniture (clear ✕ + mic + 📎).
  { name: 'board ▸ note rapide', route: '/board', mode: null, field: '.addsheet__lead .edit-field__input', floor: { 360: 160, 390: 188 } },
  { name: 'board ▸ à compléter', route: '/board', mode: 'todo', floor: { 360: 150, 390: 177 } },
  { name: 'board ▸ laisse un mot', route: '/board', mode: 'mot', floor: { 360: 150, 390: 177 } },
  { name: 'liste ▸ un article', route: '/liste', mode: 'list-item', floor: { 360: 170, 390: 197 } },
  { name: 'cuisine ▸ garde-manger', route: '/kitchen', mode: 'pantry', floor: { 360: 170, 390: 197 } },
  { name: 'cuisine ▸ la réserve', route: '/kitchen', mode: 'reserve', floor: { 360: 202, 390: 229 } },
  // The one that started this pass: « ＋ À finir bientôt » is the longest CTA in
  // the app, and the box also carries the combobox caret.
  { name: 'cuisine ▸ restants', route: '/kitchen', mode: 'leftovers', floor: { 360: 150, 390: 177 } },
  // Les notes opens straight on its composer (a single mode, no chooser).
  { name: 'notes ▸ note rapide', route: '/notes', mode: null, floor: { 360: 182, 390: 209 } },
]

// The field's usable typing width, and whether its own placeholder fits in it —
// measured in the field's computed font via a canvas, which is what the browser
// itself uses to lay the text out.
async function measure(page: Page, selector: string) {
  return await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null
    if (!el) return null
    const cs = getComputedStyle(el)
    const inner = el.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0')
    const ctx = document.createElement('canvas').getContext('2d')
    let text = 0
    if (ctx) {
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      text = ctx.measureText(el.placeholder || '').width
    }
    return { width: Math.round(inner), placeholder: el.placeholder || '', placeholderPx: Math.round(text) }
  }, selector)
}

for (const width of [360, 390]) {
  for (const c of COMPOSERS) {
    test(`composer keeps its typing width — ${c.name} @${width}`, async ({ page }) => {
      await boot(page, width)
      await page.goto(c.route)
      await expect(page.locator('.hub__body')).toBeVisible({ timeout: 15_000 })

      await page.locator('.add-fab').click()
      await expect(page.locator('.sheet.show')).toBeVisible()

      if (c.mode) {
        const tile = page.locator(`.sheet.show .cat-pick[data-mode="${c.mode}"]`)
        // Never silently skip: a renamed/removed mode must fail loudly, or this
        // whole guard quietly stops guarding.
        await expect(tile, `the « ${c.name} » tile is missing from the ＋ sheet`).toHaveCount(1)
        await tile.click()
      }

      const field = c.field ?? '.sheet.show .addsheet__panel .edit-field__input'
      await expect(page.locator(field).first()).toBeVisible()

      await assertClean(page, `${c.name} composer`)

      const m = await measure(page, field)
      expect(m, `${c.name}: no field found at ${field}`).not.toBeNull()
      // Printed on every run: this is the number you read off to set a floor.
      console.log(`[composer-fit] ${c.name} @${width}: ${m!.width}px typing width, placeholder « ${m!.placeholder} » needs ${m!.placeholderPx}px`)

      expect(
        m!.width,
        `${c.name} @${width}: ${m!.width}px of typing width, floor is ${c.floor[width]}px. This floor only moves UP — see the header of this file.`,
      ).toBeGreaterThanOrEqual(c.floor[width])

      expect(
        m!.width,
        `${c.name} @${width}: the placeholder « ${m!.placeholder} » needs ${m!.placeholderPx}px but the field is ${m!.width}px — it renders clipped.`,
      ).toBeGreaterThanOrEqual(m!.placeholderPx)
    })
  }
}
