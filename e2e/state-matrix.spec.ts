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
}

const PHONE = { w: 390, h: 844 }
const WALL = { w: 1280, h: 800 }
const KB = 336

const openAddSheet = async (page: Page) => {
  await page.locator('.add-fab').click()
  await expect(page.locator('.sheet.show')).toBeVisible()
}

const openNoteEditor = async (page: Page) => {
  await page.getByRole('button', { name: 'Nouvelle note' }).click()
  await expect(page.locator('.note-editor')).toBeVisible()
  await page.locator('.note-editor__body').click()
}

const MATRIX: Entry[] = [
  // — the six hub tabs at rest, phone, both themes —
  { name: 'board', route: '/board' },
  { name: 'kitchen', route: '/kitchen' },
  { name: 'liste', route: '/liste' },
  { name: 'cercle', route: '/cercle' },
  { name: 'routines', route: '/routines' },
  { name: 'settings', route: '/settings' },
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
  { name: 'note-editor', route: '/cercle?section=notes', setup: openNoteEditor, scope: '.note-editor' },
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
  { name: 'first-cercle', route: '/cercle', fresh: true, themes: ['day'] },
  { name: 'first-routines', route: '/routines', fresh: true, themes: ['day'] },
  { name: 'first-settings', route: '/settings', fresh: true, themes: ['day'] },
  // — THE DEMO: what a curious visitor actually gets. The sandbox is an ordinary
  //   operator session marked by its email, so the board wears the claim banner.
  { name: 'demo-board', route: '/board', sandbox: true, themes: ['day'] },
  // — keyboard-open states (the stub from kb.ts; setup must leave a field focused) —
  { name: 'note-editor-kb', route: '/cercle?section=notes', setup: openNoteEditor, scope: '.note-editor', keyboard: KB, themes: ['day'] },
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
          },
          pass: errors.length === 0 && bleed <= 1 && kbOk && textLen >= 10 && crashed === 0,
        }),
      )

      expect(crashed, `${id}: the error boundary rendered — this state crashed`).toBe(0)
      expect(textLen, `${id}: the page painted nothing (blank capture)`).toBeGreaterThanOrEqual(10)
      expect(errors, `${id}: page errors`).toEqual([])
      expect(bleed, `${id}: "${culprit}" bleeds off the right edge`).toBeLessThanOrEqual(1)
      if (entry.keyboard) {
        expect(focusedBottom, `${id}: a field is focused`).not.toBeNull()
        expect(focusedBottom!, `${id}: focused field above the keyboard`).toBeLessThanOrEqual(visible + 1)
      }
    })
  }
}
