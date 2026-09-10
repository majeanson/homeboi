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
  // Les notes is absent on purpose (2026-09-04): the ＋ FAB now NAVIGATES straight
  // to a blank note (FORM_ROUTES.cnote) rather than opening an in-sheet composer —
  // same shape as `event`/`chore`/`routine`/`voyage`/`habit`, which this list
  // already excludes. The quick voice/text/📎 composer still exists, but only
  // behind a HOLD on the ＋ (see fab-hold-voice.spec.ts), not a plain tap.
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

      // Minus 3: canvas metrics vs real layout differ by a couple px across
      // platforms (CI's Linux fonts measured this exact placeholder 1px wider
      // than the field and failed an honest layout). The bug this guards against
      // is tens of px over (« Ajouter un » was ~54px short) — sub-glyph slack
      // keeps the guard meaningful without a 1px cross-platform flake.
      expect(
        m!.width,
        `${c.name} @${width}: the placeholder « ${m!.placeholder} » needs ${m!.placeholderPx}px but the field is ${m!.width}px — it renders clipped.`,
      ).toBeGreaterThanOrEqual(m!.placeholderPx - 3)
    })
  }
}

// — SCENE-FORM FIELDS, which the block above cannot reach: they are not behind the
// ＋ sheet, they are a route you open. Same rule, same `measure()`: a field's own
// placeholder must fit in the field.
//
// The bug that earned this (2026-09-10 matrix pass): the birthday row is three
// controls — Mois · Jour · Année — and the year carried a FIXED `flex: 0 0 6.5rem`,
// i.e. 104px for a placeholder needing ~109px. « Année (opt.) » rendered
// « Année (o| ». A filled year fits, so the only state that was cut is the empty
// one — the state an empty form exists to explain. `CLAUDE.md` names the fixed
// flex-basis as the trap by name; the row wraps by container query now.
const SCENE_FIELDS: { name: string; route: string; field: string }[] = [
  // Both of these render the SAME <BirthdayPicker>, and so does /intake — but the
  // guest intake route needs its own session, and two hosts already prove the
  // shared component. Named separately so a failure says which form you can see it on.
  // Plain names, no guillemets: glossary.test.ts scans specs for « quoted labels »
  // and requires the app to really say them — a test's own description is not copy.
  { name: 'person form birth year', route: '/cercle/person/new', field: '.cf__bday-year' },
  { name: 'pet form birth year', route: '/cercle/pet/new', field: '.cf__bday-year' },
]

for (const width of [360, 390]) {
  for (const f of SCENE_FIELDS) {
    test(`scene form keeps its placeholder readable — ${f.name} @${width}`, async ({ page }) => {
      await boot(page, width)
      await page.goto(f.route)
      await expect(page.locator(f.field).first()).toBeVisible({ timeout: 15_000 })

      const m = await measure(page, f.field)
      expect(m, `${f.name}: no field found at ${f.field}`).not.toBeNull()
      expect(m!.placeholder.length, `${f.name}: the field has no placeholder to measure`).toBeGreaterThan(0)
      console.log(`[scene-fit] ${f.name} @${width}: ${m!.width}px wide, placeholder « ${m!.placeholder} » needs ${m!.placeholderPx}px`)

      // Same −3 slack as the composer block, for the same cross-platform reason.
      expect(
        m!.width,
        `${f.name} @${width}: the placeholder « ${m!.placeholder} » needs ${m!.placeholderPx}px but the field is ${m!.width}px — it renders clipped.`,
      ).toBeGreaterThanOrEqual(m!.placeholderPx - 3)
    })
  }
}
