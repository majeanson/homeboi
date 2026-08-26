import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mockApi, seedState, type Audience, type Lang, type Surface, type Theme } from './mocks'
import { installVvStub, openKeyboard } from './kb'
import { worstRightBleed } from './overflow'

// The STATE MATRIX — a declarative sweep of "the app in a state": a route, an
// optional interaction that opens something (sheet / scene / editor), a lens
// combination, optionally the fake keyboard. Each state yields:
//   • a screenshot   → e2e/screenshots/matrix/<name>.png
//   • assertions     → no page error, no per-child right-edge bleed (overflow.ts),
//                      focused element above the keyboard when one is open (kb.ts)
//   • a manifest row → merged into e2e/screenshots/matrix/manifest.json by
//                      sm.teardown.ts — THE entry point for a Claude review pass:
//                      read the manifest, then read the flagged/sampled PNGs.
//
// Capture + assert, deliberately NO pixel baselines: an intentional restyle never
// breaks this suite; a structural regression (bleed, crash, hidden field) does.
// Runs ONLY under e2e/sm.config.ts (`npm run e2e:matrix`) — testIgnore'd from the
// default harness so the per-push e2e stays fast.

const OUT = join(fileURLToPath(new URL('.', import.meta.url)), 'screenshots', 'matrix')

type Entry = {
  name: string
  route: string
  /** Open the state (sheet/scene/editor) after navigation; also does any focusing. */
  setup?: (page: Page) => Promise<void>
  /** Box whose descendants must not bleed right (default '#root'; portals need their own). */
  scope?: string
  viewport?: { w: number; h: number }
  themes?: Theme[]
  audience?: Audience
  lang?: Lang
  surface?: Surface
  longText?: boolean
  fresh?: boolean
  /** A brand-new VISITOR: no session at all (the marketing door, the sign-up form). */
  signedOut?: boolean
  /** The demo sandbox session (the claim banner, the try-this card). */
  sandbox?: boolean
  /** Fake-keyboard height (px) to slide in after setup. Requires setup to focus a field. */
  keyboard?: number
  /** The page's FIRST content item — the thing you came to this surface to see (a
   *  list row, a card, a form's first field). Its distance from the top of the
   *  scroller is `contentTopPx`: how much chrome you scroll past before the
   *  content starts. Omit and the state is measured for text only, never budgeted. */
  content?: string
  /** Ceiling for `contentTopPx`. A RATCHET, not a taste judgement: every number
   *  here was read off a real baseline run and given ~10% tolerance, so a surface
   *  can never grow its chrome back — and a surface that legitimately leads with a
   *  hero simply carries a bigger number. Tighten it in the same commit as a lean
   *  pass; it only ever moves down. See LEAN.md. */
  budgetPx?: number
}

const PHONE = { w: 390, h: 844 }
const WALL = { w: 1280, h: 800 }
const KB = 336

const openAddSheet = async (page: Page) => {
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
}

const openNoteEditor = async (page: Page) => {
  // NOT « Nouvelle note »: that button is advanced-mode chrome (lib/notesMode), and
  // Les notes defaults to its lean READING face. ?add=1 is the canonical door in
  // both faces — the same one advanced's own button navigates to.
  await page.goto('/notes?add=1')
  await expect(page.locator('.note-editor')).toBeVisible()
  await page.locator('.note-editor__body').click()
}

// CHROME BUDGETS (`budgetPx`) — baselined 2026-08-26 at 390px from a real run,
// each set to its own measured `contentTopPx` + ~10% (min +16px) for font and
// rounding drift. They are a RATCHET: a surface may never push its content further
// down than the day its number was set, and the number only ever moves DOWN, in the
// same commit as the lean pass that earns it. Raising one is allowed but must be
// deliberate and said out loud in the commit — silently re-baselining is the exact
// drift this exists to stop. See LEAN.md.
//
// Read them as a worklist, not a verdict: maison-family (540px) and maison-social
// (392px) are the two worst and the obvious next targets — though Famille's height
// is partly the « Anniversaires à venir » card, which is content, not chrome. The
// number is a signal; the screenshot beside it is the judgement.
const MATRIX: Entry[] = [
  // — the six hub tabs at rest, phone, both themes —
  { name: 'board', route: '/board', content: '.wg-slot', budgetPx: 235 },
  { name: 'kitchen', route: '/kitchen', content: '.kitchen__meal-list, .kitchen__week', budgetPx: 160 },
  { name: 'liste', route: '/liste', content: '.list-rows > *', budgetPx: 218 },
  { name: 'notes', route: '/notes', content: '.cnote, .cercle-notes__empty', budgetPx: 230 },
  { name: 'maison', route: '/maison', content: '.routine-card, .cercle-row', budgetPx: 244 },
  { name: 'settings', route: '/settings', content: '.operator__section, .operator__tabs', budgetPx: 90 },
  // — signature opened states —
  { name: 'board-addsheet', route: '/board', setup: openAddSheet, scope: '.sheet.show' },
  {
    name: 'kitchen-ideas',
    route: '/kitchen',
    setup: async (page) => {
      await page.locator('.kitchen__ideas-opener .btn--primary').click()
      await expect(page.locator('.ideas-drawer .scene__body')).toBeVisible()
    },
    scope: '.ideas-drawer .scene__body',
  },
  { name: 'note-editor', route: '/notes', setup: openNoteEditor, scope: '.note-editor' },
  // — THE SUB-SURFACES. The matrix used to stop at each hub tab's DEFAULT sub-tab,
  //   which is why every one of the 2026-08 lean passes found its fat somewhere the
  //   sweep had never looked: the garde-manger's three stacked composers, the recipe
  //   book's permanent filter rows, the five Maison sections, and the heavy form
  //   scenes. Phone + day only — these are measured for chrome, not for theming.
  { name: 'kitchen-meals', route: '/kitchen?tab=meals', content: '.kitchen__meal-list, .kitchen__week', budgetPx: 160, themes: ['day'] },
  { name: 'kitchen-pantry', route: '/kitchen?tab=pantry', content: '.kitchen__soon li, .kitchen__low li', budgetPx: 249, themes: ['day'] },
  { name: 'kitchen-recipes', route: '/kitchen?tab=recipes', content: '.recipe-card', budgetPx: 214, themes: ['day'] },
  { name: 'kitchen-history', route: '/kitchen?tab=history', content: '.kitchen__history .kitchen__week, .empty-state', budgetPx: 200, themes: ['day'] },

  { name: 'maison-routines', route: '/maison?section=routines', content: '.routine-card', budgetPx: 244, themes: ['day'] },
  { name: 'maison-family', route: '/maison?section=family', content: '.cercle-row', budgetPx: 594, themes: ['day'] },
  { name: 'maison-social', route: '/maison?section=social', content: '.cercle-row', budgetPx: 432, themes: ['day'] },
  { name: 'maison-business', route: '/maison?section=business', content: '.cercle-row, .empty-state', budgetPx: 194, themes: ['day'] },
  { name: 'maison-carnets', route: '/maison?section=carnets', content: '.cercle-row, .empty-state', budgetPx: 194, themes: ['day'] },

  { name: 'settings-board', route: '/settings?tab=board&lens=regler', content: '.operator__section', budgetPx: 308, themes: ['day'] },
  { name: 'settings-systeme', route: '/settings?tab=settings&lens=regler', content: '.operator__section', budgetPx: 308, themes: ['day'] },

  // — THE FORM SCENES. Four of these opened as a wall of fields before the lean
  //   pass; the budget is what keeps them from filling back up.
  { name: 'form-event', route: '/event/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'form-chore', route: '/chore/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'form-person', route: '/cercle/person/new', content: '.cf__input', budgetPx: 156, themes: ['day'] },
  { name: 'form-pet', route: '/cercle/pet/new', content: '.input', budgetPx: 32, themes: ['day'] },
  { name: 'form-recipe', route: '/kitchen/recipe/new', content: '.recipe-title-input', budgetPx: 32, themes: ['day'] },
  { name: 'form-habit', route: '/habitude/new', content: '.edit-field__input, .input', budgetPx: 33, themes: ['day'] },
  { name: 'departure', route: '/board/departure', content: '.todo-sec, .departure__wx', budgetPx: 32, themes: ['day'] },
  { name: 'voiture', route: '/voiture', content: '.voiture__day, .voiture__week > *', budgetPx: 189, themes: ['day'] },

  // — lenses —
  { name: 'board-toddler', route: '/board', audience: 'toddler' },
  { name: 'board-kiosk', route: '/board', surface: 'kiosk', viewport: WALL },
  { name: 'board-en', route: '/board', lang: 'en', themes: ['day'] },
  // — data extremes —
  { name: 'liste-longtext', route: '/liste', longText: true },
  // — FIRST RUN: the whole walk a brand-new household takes. `fresh` empties every
  //   household array (mocks.ts), so these are the screens a real first day shows —
  //   the front door, the sign-up, then each tab with genuinely nothing in it. An
  //   empty tab that dead-ends (no door, no words) is the bug this set exists to find.
  { name: 'first-home', route: '/', signedOut: true, themes: ['day'] },
  { name: 'first-signup', route: '/signup', signedOut: true, themes: ['day'] },
  { name: 'board-fresh', route: '/board', fresh: true, themes: ['day'] },
  { name: 'first-kitchen', route: '/kitchen', fresh: true, themes: ['day'] },
  { name: 'first-liste', route: '/liste', fresh: true, themes: ['day'] },
  { name: 'first-notes', route: '/notes', fresh: true, themes: ['day'] },
  { name: 'first-maison', route: '/maison', fresh: true, themes: ['day'] },
  { name: 'first-settings', route: '/settings', fresh: true, themes: ['day'] },
  // — THE DEMO: what a curious visitor actually gets. The sandbox is an ordinary
  //   operator session marked by its email, so the board wears the claim banner.
  { name: 'demo-board', route: '/board', sandbox: true, themes: ['day'] },
  // — keyboard-open states (the stub from kb.ts; setup must leave a field focused) —
  { name: 'note-editor-kb', route: '/notes', setup: openNoteEditor, scope: '.note-editor', keyboard: KB, themes: ['day'] },
  {
    name: 'board-addsheet-kb',
    route: '/board',
    setup: async (page) => {
      await openAddSheet(page)
      await page.locator('.sheet.show input:visible, .sheet.show textarea:visible, .sheet.show [contenteditable]:visible').first().click()
    },
    scope: '.sheet.show',
    keyboard: KB,
    themes: ['day'],
  },
]

mkdirSync(OUT, { recursive: true })

for (const entry of MATRIX) {
  for (const theme of entry.themes ?? (['day', 'night'] as Theme[])) {
    const id = `${entry.name}-${theme}`
    test(`state ${id}`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(String(e)))
      const vp = entry.viewport ?? PHONE
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: vp.w, height: vp.h })
      if (entry.keyboard) await installVvStub(page)
      await mockApi(page, {
        longText: entry.longText,
        fresh: entry.fresh,
        sandbox: entry.sandbox,
        signedIn: entry.signedOut ? false : undefined,
      })
      await seedState(page, {
        theme,
        audience: entry.audience ?? 'parent',
        lang: entry.lang ?? 'fr',
        // A brand-new VISITOR has chosen no surface — and `/` redirects straight to
        // /board the moment one is stored (router Entry: `chosen || isPaired()`), so
        // seeding it would have photographed the board and called it the front door.
        surface: entry.signedOut ? undefined : (entry.surface ?? 'mobile'),
      })
      await page.goto(entry.route)
      await page
        .locator('.hub, .page, .board-wall')
        .first()
        .waitFor({ state: 'visible', timeout: 15_000 })
        .catch(() => {})
      if (entry.setup) await entry.setup(page)
      if (entry.keyboard) await openKeyboard(page, entry.keyboard)
      await page.waitForTimeout(300) // settle animations/late paints

      // A BLANK capture must never pass. An empty page still has #root, so the
      // bleed check reads 0 and every other assertion holds — a cold-compile race
      // silently shipped white PNGs that looked like green states. Demand real
      // painted text before we believe (and photograph) the state.
      const painted = await page.evaluate(() => (document.body.innerText ?? '').trim().length)
      if (painted < 10) {
        await page.waitForTimeout(1200) // one grace period for a slow first paint
      }

      // Measure BEFORE asserting so a failing state still lands in the manifest
      // and on disk — a red test with no evidence is exactly what this suite
      // exists to avoid.
      const textLen = await page.evaluate(() => (document.body.innerText ?? '').trim().length)
      // …and neither may the CRASH SCREEN pass. React's error boundary renders a
      // calm "Oups — un pépin" card: plenty of painted text, no pageerror (it was
      // caught) — so a state that blew up photographed green. It is the loudest
      // possible failure; assert it explicitly.
      const crashed = await page.locator('.errboundary').count()
      const { bleed, culprit } = await worstRightBleed(page, entry.scope ?? '#root')

      // HOW MUCH CHROME BEFORE THE CONTENT. The number this whole lean programme
      // turns on: the distance from the top of the surface's scroller to the top of
      // its first content item. It is exactly what I had been eyeballing on
      // screenshots all along ("« Ce soir » at ~470px → ~380px"); as a manifest
      // column it stops being taste and starts being something that can regress
      // loudly. null when the entry declares no content selector.
      const contentTopPx = entry.content
        ? await page.evaluate((sel: string) => {
            const el = document.querySelector(sel)
            if (!el) return null
            // Measure inside the SCROLLER, not the viewport: .hub__body (hub tabs)
            // and .scene__body (scenes) are the app's real scroll containers, and a
            // viewport-relative y would drift with whatever the page had scrolled to.
            const scroller = el.closest('.hub__body, .scene__body, .recipe-modal__body') ?? document.body
            const top = scroller.getBoundingClientRect().top - (scroller === document.body ? 0 : scroller.scrollTop)
            return Math.round(el.getBoundingClientRect().top - top)
          }, entry.content)
        : null

      // A taxonomy-free companion: how much REAL text the first screen shows. A
      // leaner surface spends less of that screen on chrome, so this rises as
      // contentTopPx falls. Reported, never asserted — it is a review signal.
      const aboveFoldChars = await page.evaluate((foldY: number) => {
        let n = 0
        const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
          const text = (node.textContent ?? '').trim()
          if (!text) continue
          const parent = node.parentElement
          if (!parent) continue
          const r = parent.getBoundingClientRect()
          if (r.top < foldY && r.bottom > 0 && r.width > 0) n += text.length
        }
        return n
      }, vp.h)
      let focusedBottom: number | null = null
      if (entry.keyboard) {
        const box = await page.locator(':focus').boundingBox()
        focusedBottom = box ? box.y + box.height : null
      }
      const visible = vp.h - (entry.keyboard ?? 0)
      const kbOk = !entry.keyboard || (focusedBottom !== null && focusedBottom <= visible + 1)
      await page.screenshot({ path: join(OUT, `${id}.png`) })
      writeFileSync(
        join(OUT, `.frag-${id}.json`),
        JSON.stringify({
          name: id,
          file: `${id}.png`,
          route: entry.route,
          levers: {
            theme,
            audience: entry.audience ?? 'parent',
            lang: entry.lang ?? 'fr',
            surface: entry.surface ?? 'mobile',
            viewport: vp,
            longText: !!entry.longText,
            fresh: !!entry.fresh,
            keyboard: entry.keyboard ?? 0,
          },
          assertions: {
            pageErrors: errors,
            bleedPx: Math.round(bleed * 10) / 10,
            bleedCulprit: bleed > 1 ? culprit : undefined,
            focusedAboveKeyboard: entry.keyboard ? kbOk : undefined,
            paintedChars: textLen,
            crashed: crashed > 0 || undefined,
            contentTopPx,
            contentBudgetPx: entry.budgetPx,
            aboveFoldChars,
          },
          pass:
            errors.length === 0 &&
            bleed <= 1 &&
            kbOk &&
            textLen >= 10 &&
            crashed === 0 &&
            (entry.budgetPx == null || contentTopPx == null || contentTopPx <= entry.budgetPx),
        }),
      )

      expect(crashed, `${id}: the error boundary rendered — this state crashed`).toBe(0)
      expect(textLen, `${id}: the page painted nothing (blank capture)`).toBeGreaterThanOrEqual(10)
      expect(errors, `${id}: page errors`).toEqual([])
      expect(bleed, `${id}: "${culprit}" bleeds off the right edge`).toBeLessThanOrEqual(1)
      // The ratchet. A surface that declares a budget may not push its content
      // further down than the day the budget was set — the failure names both
      // numbers so the fix (or a deliberate re-baseline) is obvious.
      if (entry.budgetPx != null && contentTopPx != null) {
        expect(
          contentTopPx,
          `${id}: ${contentTopPx}px of chrome before "${entry.content}" (budget ${entry.budgetPx}px). ` +
            'Either lean it back down, or re-baseline the budget deliberately — see LEAN.md.',
        ).toBeLessThanOrEqual(entry.budgetPx)
      }
      if (entry.content) {
        expect(contentTopPx, `${id}: no element matched content selector "${entry.content}"`).not.toBeNull()
      }
      if (entry.keyboard) {
        expect(focusedBottom, `${id}: a field is focused`).not.toBeNull()
        expect(focusedBottom!, `${id}: focused field above the keyboard`).toBeLessThanOrEqual(visible + 1)
      }
    })
  }
}
