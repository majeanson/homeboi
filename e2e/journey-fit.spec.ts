import { test, test as base, expect, type Page, test as test3, test as test5, test as test7, type Locator, test as test8, type Request, test as test11 } from '@playwright/test'
import { SETTINGS_SUBS } from '../src/lib/settingsNav'
import { mockApi, seedState, type Audience, type Lang, type Surface, MMID, BASE } from './mocks'
import { settled, boxOf, fontsReady } from './measure'
import { test as test2, test as test6, test as test9, test as test10 } from './fixtures'
import { ROUTES } from './routes'
import { addLocalDays, localDayStart } from '../src/lib/localDay'

// JOURNEY — FIT, OVERFLOW & LEAN (review #43; was layout-overflow.spec.ts + hscroll.spec.ts + rail-keyboard.spec.ts + longtext.spec.ts + spacing.spec.ts + segmented.spec.ts + row-labels.spec.ts + lean-forms.spec.ts + lean-scenes.spec.ts + tap-budget.spec.ts + section-add.spec.ts).
//
// "All platforms" layout guard. screenshots.spec.ts already hard-asserts no
// horizontal overflow on the PHONE (390px) for every tab; footer-clearance.spec
// does the fixed-bottom-nav occlusion check on the phone. The dimension neither
// covers is the BIGGER surfaces a Babillard actually runs on:
//   • a wall tablet in PORTRAIT (a cheap always-on tablet is often portrait), and
//   • a wall display / landscape tablet (kiosk).
// Both render the KIOSK surface (glance dashboard, left-column nav) whose column
// counts and grids differ from the phone — a place layouts silently overflow or
// split content onto an extra line. This sweep walks ALL SIX hub tabs (incl.
// Famille — the old « Le cercle » tab's people graphs, absent from every other
// hard layout assertion) across those two
// formats, in parent + toddler, FR + EN on the wrap-prone tabs, and:
//   1. asserts the surface actually painted content (not a blank/crashed frame),
//   2. asserts NO horizontal overflow (document + the .hub__body scroller),
//   3. asserts no interactive control is hidden behind a fixed bottom nav
//      (a no-op on kiosk, where the nav is a left column — the probe self-adapts),
//   4. writes lo-*.png for human/agent review of wrap/spacing the assertions miss
//      ("information split onto multiple lines" isn't an overflow, only eyeballable).
// Crash-smoke guarded: any pageerror fails the case.
test.describe('layout-overflow', () => {
  const test = base.extend({
    page: async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(page)
      expect(errors, 'pageerror during the layout sweep').toEqual([])
    },
  })

  // The two kiosk formats the phone sweep never exercises. 834px (iPad Air portrait)
  // sits in the 720→900 breakpoint gap, a genuinely distinct layout from both the
  // 390 phone and the 1280 wall.
  const FORMATS = [
    { name: 'tablet', width: 834, height: 1112, surface: 'kiosk' as Surface },
    { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as Surface },
  ]

  type Tab = { name: string; path: string; audiences: Audience[]; en: boolean }
  // `en: true` adds an English pass (FR→EN length changes break kiosk grids most on
  // the text-dense tabs). Settings is parent-only (operator hub).
  const TABS: Tab[] = [
    { name: 'board', path: '/board', audiences: ['parent', 'toddler'], en: true },
    { name: 'kitchen', path: '/kitchen', audiences: ['parent', 'toddler'], en: true },
    // « Le cercle » + Routines merged into Maison (Routines is its default section —
    // a bare /maison covers the old /routines case); Famille (?section=family, the
    // old cercle tab's own default) still carries the member/group graphs, so it
    // gets its own pass. « Les notes » split out of cercle into its own hub tab.
    { name: 'maison', path: '/maison', audiences: ['parent', 'toddler'], en: false },
    { name: 'maison-family', path: '/maison?section=family', audiences: ['parent', 'toddler'], en: true },
    { name: 'notes', path: '/notes', audiences: ['parent', 'toddler'], en: true },
    { name: 'liste', path: '/liste', audiences: ['parent', 'toddler'], en: false },
    { name: 'settings', path: '/settings', audiences: ['parent'], en: true },
    // The Système themed tab carries the widest pill rows in Réglages (a 9-sub
    // SubTabs row + the lens toggle) — the likeliest place a settings row overflows.
    { name: 'settings-systeme', path: '/settings?tab=settings', audiences: ['parent'], en: true },
  ]

  async function settle(page: Page) {
    await page.locator('.hub__body').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await settled(page)
  }

  // doc OR the inner hub scroller wider than its client box = a real horizontal
  // overflow. The .hubnav row is intentionally horizontal-scroll and lives outside
  // .hub__body, so it's (correctly) excluded.
  async function hOverflow(page: Page): Promise<string> {
    return page.evaluate(() => {
      const doc = document.documentElement
      const body = document.querySelector('.hub__body')
      if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
      if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow'
      return 'ok'
    })
  }

  // Controls whose visible centre is painted over by a FIXED bottom nav. Returns []
  // when the nav isn't a pinned bottom bar (kiosk left column), so it's a safe no-op
  // on the wall while still catching a regression if a format ever pins the nav.
  async function occluded(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const nav = document.querySelector('.hubnav') as HTMLElement | null
      if (!nav) return []
      const navBox = nav.getBoundingClientRect()
      if (!(getComputedStyle(nav).position === 'fixed' && navBox.top > window.innerHeight / 2)) return []
      const scope = document.querySelector('.hub__body')
      if (!scope) return []
      const out: string[] = []
      scope.querySelectorAll('button, a, input, textarea, select, [role="button"]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return
        const cy = r.top + r.height / 2
        const cx = r.left + r.width / 2
        if (!(cy > navBox.top && cy < window.innerHeight)) return
        const hit = document.elementFromPoint(cx, cy)
        if (hit && (nav === hit || nav.contains(hit))) {
          out.push((el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute('aria-label') || el.className || el.tagName).trim().slice(0, 50))
        }
      })
      return [...new Set(out)]
    })
  }

  async function scrollToBottom(page: Page) {
    await page.evaluate(() => {
      const body = document.querySelector('.hub__body') as HTMLElement | null
      if (body) body.scrollTop = body.scrollHeight
    })
    await settled(page)
  }

  for (const format of FORMATS) {
    for (const tab of TABS) {
      for (const audience of tab.audiences) {
        const langs: Lang[] = tab.en ? ['fr', 'en'] : ['fr']
        for (const lang of langs) {
          const label = `lo-${format.name}-${tab.name}-${audience}${lang === 'en' ? '-en' : ''}`
          test(label, async ({ page }) => {
            await page.setViewportSize({ width: format.width, height: format.height })
            await mockApi(page)
            await seedState(page, { theme: 'day', audience, lang, calm: true, surface: format.surface })
            await page.goto(tab.path)
            await settle(page)

            // 1. Painted content (not a blank/crashed kiosk frame).
            await expect
              .poll(async () => (await page.locator('.hub__body').innerText()).trim().length, { timeout: 8000 })
              .toBeGreaterThan(10)

            // 2. No horizontal overflow (settles after the web-font swap).
            await expect
              .poll(() => hOverflow(page), { timeout: 6000, intervals: [200, 400, 800] })
              .toBe('ok')

            // 4. Review frame BEFORE scrolling (the glance state).
            await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })

            // 3. Scroll to the end and confirm nothing strands under a fixed nav.
            await scrollToBottom(page)
            expect(await occluded(page), `controls hidden behind the bottom nav on ${tab.path} [${audience}/${lang}/${format.name}]`).toEqual([])
          })
        }
      }
    }
  }

  // ─────────────────── the widths between and beyond the formats ───────────────
  //
  // AUJOURDHUI §7: "untested intermediate widths — 520–680px (tablet transition) +
  // 1500px+ ultra-wide have no e2e frame", plus the 320px landscape/very-narrow
  // phone. The board is where width actually changes behaviour — `colsFor`
  // (lib/widgetGrid) counts the columns in JS so a card's size can be CLAMPED
  // against the count, which is precisely the code that misbehaves at a boundary:
  // too many columns and the glance goes diffuse, too few and a size-3 card
  // overflows the viewport instead of shrinking.
  //
  // Deliberately narrow: the board only, parent only, FR only — four extra cases,
  // not another full matrix. The full FORMATS×TABS sweep above already owns the
  // tab-by-tab coverage; what's missing is purely the width axis.
  const WIDTHS = [
    // 320px: the narrowest phone still in the wild, and the width the old
    // `columns: 300px` masonry could not fit (a card wider than the screen). The
    // grid is JS-counted now, so this must resolve to a single column.
    { name: 'w320', width: 320, height: 640, surface: 'mobile' as Surface, cols: { min: 1, max: 1 } },
    // 568px: a phone in LANDSCAPE. Two columns fit comfortably here.
    { name: 'w568', width: 568, height: 320, surface: 'mobile' as Surface, cols: { min: 2, max: 2 } },
    // 667px: the top of the "tablet transition" gap the sweep jumps over (390 → 834).
    { name: 'w667', width: 667, height: 900, surface: 'mobile' as Surface, cols: { min: 2, max: 2 } },
    // 1600px and 2560px: ultra-wide walls. The count is NOT pinned exactly here — it
    // depends on the kiosk nav's width and on `colMin` being 340 rather than 300 on a
    // kiosk (cards are read from across the room) — so what's asserted is the property
    // that matters: it never exceeds `maxCols`. Without that cap a 4K wall would keep
    // adding columns until the glance went diffuse, which is the AUJOURDHUI §7 worry.
    // 2560 is the one that proves the cap: uncapped it would ask for ~6 columns.
    { name: 'w1600', width: 1600, height: 900, surface: 'kiosk' as Surface, cols: { min: 3, max: 4 } },
    { name: 'w2560', width: 2560, height: 1080, surface: 'kiosk' as Surface, cols: { min: 4, max: 4 } },
  ]

  for (const w of WIDTHS) {
    test(`lo-board-${w.name}`, async ({ page }) => {
      await page.setViewportSize({ width: w.width, height: w.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: w.surface })
      await page.goto('/board')
      await settle(page)

      await expect
        .poll(async () => (await page.locator('.hub__body').innerText()).trim().length, { timeout: 8000 })
        .toBeGreaterThan(10)
      await expect
        .poll(() => hOverflow(page), { timeout: 6000, intervals: [200, 400, 800] })
        .toBe('ok')

      // The column count the width should resolve to. `--wg-cols` is what the grid
      // actually laid out with, so this pins the boundary behaviour rather than just
      // "nothing overflowed" — including the ultra-wide cap.
      const cols = await page
        .locator('.wg[data-zone="grid"]')
        .first()
        .evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--wg-cols')))
      expect(cols, `column count at ${w.width}px`).toBeGreaterThanOrEqual(w.cols.min)
      expect(cols, `column count at ${w.width}px`).toBeLessThanOrEqual(w.cols.max)

      // No card may render wider than the grid that holds it — the clamp `colsFor`
      // exists for. Measured, because a too-wide card is CLIPPED by the container's
      // overflow-x:hidden and so is invisible to a scrollWidth check.
      const spill = await page.evaluate(() => {
        const grid = document.querySelector('.wg[data-zone="grid"]')
        if (!grid) return []
        const box = grid.getBoundingClientRect()
        return [...grid.querySelectorAll('.wg-slot')]
          .filter((el) => !el.hasAttribute('hidden'))
          .filter((el) => el.getBoundingClientRect().right > box.right + 1)
          .map((el) => el.getAttribute('data-card') || '?')
      })
      expect(spill, 'cards wider than the board grid').toEqual([])

      // Every visible card is a NAMED region. `grid-auto-flow: dense` can pull a later
      // card up into an earlier hole, so on a wide board the visual order departs from
      // the DOM (tab) order — which is exactly when a keyboard/AT user needs to jump to
      // a card by name instead of tabbing the whole wall. A bare <section> has no
      // accessible name and is therefore not a landmark at all, so this is the
      // assertion that keeps the board navigable (AUJOURDHUI §7 focus order).
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll('.wg-slot')]
          .filter((el) => !el.hasAttribute('hidden'))
          .filter((el) => !(el.getAttribute('aria-label') || '').trim())
          .map((el) => el.getAttribute('data-card') || '?'),
      )
      expect(unnamed, 'board cards with no accessible name (not exposed as regions)').toEqual([])

      await page.screenshot({ path: `e2e/screenshots/lo-board-${w.name}.png`, fullPage: true })
    })
  }

  // ── Every Réglages sub, on a phone ───────────────────────────────────────────────
  // The sweep above walks the six HUB TABS, and of Réglages it opened exactly two
  // faces: Découvrir and Système. Réglages has ~28 subs, each a page of dense rows
  // (a chip, a count, two or three icon buttons, an edit/delete pair), and none of the
  // rest were ever measured at a phone width. That is how « Étiquettes de recettes »
  // shipped with its ✏️/🗑️ pushed off the right edge the moment the row grew a third
  // button: the shell's `overflow-x: hidden` CLIPS, so nothing looked broken — the
  // controls were just gone.
  //
  // Driven off SETTINGS_SUBS itself, so a sub added later is swept without anyone
  // remembering to list it here.
  //
  // 360px is the width to hold: the narrowest phone in common use, and where a row of
  // controls beside a label runs out of room first.
  for (const [tab, subs] of Object.entries(SETTINGS_SUBS)) {
    for (const sub of subs) {
      test(`lo-settings-${tab}-${sub}@360`, async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 780 })
        await mockApi(page)
        await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
        await page.goto(`/settings?tab=${tab}&sub=${sub}`)
        await settle(page)
        // The sub really rendered (a bounced/empty pane would pass every check below).
        await expect
          .poll(async () => (await page.locator('.operator__body, .hub__body').first().innerText()).trim().length, {
            timeout: 8000,
          })
          .toBeGreaterThan(10)

        // Per-CHILD bounds against the nearest CLIPPING ancestor — not scrollWidth, and
        // not just the page edge.
        //
        // scrollWidth is useless here: every clip in this app is `overflow: hidden`, so a
        // too-wide row reads as zero overflow while its right-hand controls sit off-screen
        // and untappable. And measuring only against `.hub__body` misses the other half:
        // a segmented control with its own `overflow: hidden` can swallow its second
        // option while the control itself sits comfortably inside the page (Réglages ▸
        // Système ▸ Affichage did exactly that — the « Renforcé » choice was simply gone
        // on a 360px phone).
        //
        // Two things are deliberately NOT flagged: anything inside a real horizontal
        // SCROLLER (extending past the edge is what scrolling means there), and text that
        // merely ellipsises — this compares element BOXES, and an ellipsised span's own
        // box stays inside its parent.
        const spill = await page.evaluate(() => {
          const root = document.querySelector('.hub__body') as HTMLElement | null
          if (!root) return ['no .hub__body']
          const out: string[] = []
          root.querySelectorAll<HTMLElement>('*').forEach((el) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 && r.height === 0) return
            for (let n = el.parentElement; n; n = n.parentElement) {
              const ox = getComputedStyle(n).overflowX
              if (ox === 'visible') {
                if (n === root) break
                continue
              }
              if (ox === 'auto' || ox === 'scroll') return // a scroller: overflow is the point
              // A clip. Its padding box is the last place content can still be seen.
              const b = n.getBoundingClientRect()
              const past = r.right - b.right
              if (past > 0.5) {
                out.push(
                  `+${Math.round(past)}px ${el.tagName}.${String(el.className).slice(0, 34)} clipped by .${String(n.className).slice(0, 24)}`,
                )
              }
              return
            }
          })
          return [...new Set(out)].slice(0, 6)
        })
        expect(spill, 'content clipped away (invisible and untappable)').toEqual([])
      })
    }
  }
})

// ── folded from hscroll.spec.ts ──────────────────────────────────────────────
test2.describe('hscroll', () => {
  // Desktop reachability of the side-scrolling rows.
  //
  // Every horizontal row in the app (`.subtabs`, `.rail`, `.operator__tabs`, the
  // birthday strip, the DrawPad bars) hides its scrollbar for calm. On a touch screen
  // you swipe them. On a DESKTOP that used to hide content outright: no scrollbar to
  // drag, no swipe, and a mouse wheel only emits deltaY — which no browser maps onto a
  // horizontal scroller. Réglages ▸ Régler ▸ Système had nine subs then (« Tablettes
  // jumelées » … « Diagnostics »); the ones past the right edge were unclickable.
  //
  // The fix is lib/hscroll.ts (`useHScroll`): it maps the wheel and drives the ‹ ›
  // chevrons SubTabs renders while the row overflows. Guard both paths here.
  //
  // The row under test moved (2026-09-08): Réglages went 28 → 14 pills and no pill row
  // outgrows a desktop any more, so the geometry that made the bug is a PHONE width,
  // where Maison's four (« Routines & listes · La maisonnée · L'auto & horaires ·
  // Cette année ») still outgrow 390px. The mechanics under test are identical: a
  // mouse (fine pointer) on a hidden-scrollbar row. Playwright's desktop Chromium keeps
  // a fine pointer at any viewport size, so the chevrons render.
  const PHONE = { width: 390, height: 844 }

  // THE pill row (`.operator__subs`, set by Operator) — not the « Comprendre / Régler »
  // lens toggle above it, nor a SubTabs a stacked card renders inside itself.
  const SUBS = '.operator__subs'

  const SETTINGS = { viewport: PHONE, state: { calm: true }, route: '/settings?tab=maison&lens=regler', wait: SUBS }

  const metrics = (page: Page) =>
    page.locator(SUBS).evaluate((el) => ({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))

  test2.describe('side-scrolling rows stay reachable with a mouse', () => {
    test2('the Maison pill row really does overflow at phone width', async ({ page, app }) => {
      await app.boot(SETTINGS)
      await fontsReady(page)
      const m = await metrics(page)
      // The precondition of the whole bug. If this ever stops being true the row got
      // narrower/shorter and the rest of this file is testing nothing — fail loudly.
      expect(m.scrollWidth, 'four Maison pills must outgrow a 390px panel').toBeGreaterThan(m.clientWidth + 1)
    })

    test2('a vertical mouse wheel scrolls the row sideways', async ({ page, app }) => {
      await app.boot(SETTINGS)
      await fontsReady(page)
      const row = page.locator(SUBS)
      const box = await boxOf(row)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 240) // deltaY only — what a mouse (not a trackpad) emits
      await expect.poll(async () => (await metrics(page)).scrollLeft).toBeGreaterThan(0)
    })

    test2('the wheel is handed back to the page at the end of the row (no wheel trap)', async ({ page, app }) => {
      await app.boot(SETTINGS)
      await fontsReady(page)
      const row = page.locator(SUBS)
      const box = await boxOf(row)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      // Overscroll hard: once pinned at the right edge the row must stop swallowing the
      // wheel, otherwise hovering it would freeze the page's own scrolling.
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 300)
      const m = await metrics(page)
      expect(m.scrollLeft).toBeGreaterThanOrEqual(m.scrollWidth - m.clientWidth - 2)
    })

    test2('the ‹ › chevrons page the row and reach the last sub', async ({ page, app }) => {
      await app.boot(SETTINGS)
      await fontsReady(page)
      const next = page.getByRole('button', { name: 'Onglets suivants' })
      const prev = page.getByRole('button', { name: 'Onglets précédents' })
      // Rendered only while the row overflows; hidden on coarse pointers by CSS.
      await expect(next).toBeVisible()
      // At rest the row sits at the start, so "previous" has nothing to do.
      await expect(prev).toBeDisabled()

      const tabs = page.locator(`${SUBS} [role="tab"]`)
      const last = tabs.last()
      await expect(last).not.toBeInViewport()

      // Page along until the chevron disables itself at the far end. The click is
      // tolerant: the chevron disables the moment the row hits its right edge, which can
      // land between our isDisabled() read and Playwright's own enabled-check.
      for (let i = 0; i < 8; i++) {
        if (await next.isDisabled()) break
        await next.click({ timeout: 1500 }).catch(() => {})
      }
      await expect(next).toBeDisabled()

      await expect(last).toBeInViewport()
      await expect(prev).toBeEnabled()
      // The whole point: the last sub is now clickable, and selecting it works.
      await last.click()
      await expect(last).toHaveAttribute('aria-selected', 'true')
    })

    test2('a deep-linked sub is scrolled into view instead of hiding off-edge', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      // Maison's last pill is off the right edge of a 390px row on first paint.
      await page.setViewportSize(PHONE)
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/settings?tab=maison&lens=regler&sub=annee')
      await page.locator(SUBS).waitFor({ state: 'visible', timeout: 15_000 })
      const active = page.locator(`${SUBS} [role="tab"][aria-selected="true"]`)
      await expect(active).toBeInViewport()
    })
  })

  // The THEMED TAB row had the same defect the sub row above already fixed, and it went
  // unnoticed because the finding that named it also named a component that no longer
  // exists (a second wrapping `OperatorJump` row — deleted). What survived re-checking:
  // under 60rem the tab nav is a ONE-LINE scroll row with a hidden scrollbar, and a
  // deep-linked tab beyond its right edge was lit but invisible, with no way to know the
  // page had responded at all. `SubTabs` solved this internally with `hs.toView`; the
  // tab row is hand-rolled in Operator.tsx and had no equivalent.
  test2('a deep-linked THEMED TAB is scrolled into view, not left off-edge', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Narrow: above 60rem the nav is a vertical sidebar and nothing overflows sideways.
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    // « Système » is the LAST themed tab — off the right edge on first paint at 390px.
    await page.goto('/settings?tab=settings')
    const tabs = page.locator('.operator__tabs')
    await tabs.waitFor({ state: 'visible', timeout: 15_000 })
    const active = tabs.locator('[role="tab"][aria-selected="true"]')
    await expect(active).toBeInViewport()
  })
})


// ── folded from rail-keyboard.spec.ts ──────────────────────────────────────────────
test3.describe('rail-keyboard', () => {
  // A SIDEWAYS ROW THAT OVERFLOWS MUST BE REACHABLE WITHOUT A THUMB.
  //
  // Every `Rail` here hides its scrollbar for calm, so on a desktop there is no bar to
  // drag and no swipe. `useHScroll` already fixed the MOUSE half — it maps a vertical
  // wheel onto the horizontal scroll. The KEYBOARD half was missing: a scroll container
  // that is not focusable cannot be scrolled by arrow keys at all, so whatever sits past
  // the right edge was unreachable for anyone not using a pointer.
  //
  // Found 2026-09-15 by the axe pass in `npm run e2e:matrix`
  // (`scrollable-region-focusable`, serious) on `virements-day` → `.rail`: the plan
  // card's row of upcoming due dates, which overflows at phone width.
  //
  // The fix is deliberately CONDITIONAL — a rail is a tab stop only while it actually
  // overflows. Making every rail focusable would hand a keyboard user a pile of stops
  // that scroll nothing, which is its own accessibility problem, and `useHScroll` already
  // measures exactly this.

  const DAY = 86_400
  const PLAN = {
    id: 'p1',
    title: 'Hypothèque',
    amountCents: 81282,
    recur: { freq: 'weekly', interval: 2 },
    anchorAt: MMID - 14 * DAY,
    shares: { m1: 25641, m2: 55641 },
    catchup: null,
    colour: null,
    position: 0,
    note: null,
    due: [MMID, MMID + 14 * DAY, MMID + 28 * DAY, MMID + 42 * DAY],
    projection: null,
  }

  // The card shows the next four due dates, so the DATA decides whether the row
  // overflows — not the viewport (the plan card is width-capped, so a wall tablet
  // overflows exactly as a phone does). Four dates overrun the card; two fit.
  async function openVirements(page: import('@playwright/test').Page, due: number[]) {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/transfer**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ today: MMID, plans: [{ ...PLAN, due }], transfers: [] }),
      }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/notes?section=virements')
    await expect(page.locator('.virements__plan')).toBeVisible()
  }

  test3('an overflowing rail is a tab stop, and arrow keys scroll it', async ({ page }) => {
    await openVirements(page, PLAN.due)
    const rail = page.locator('.virements__dates')
    await expect(rail).toBeVisible()

    // Guard against a false pass: if the fixture stopped overflowing, everything below
    // would be vacuously true.
    const overflows = await rail.evaluate((el) => el.scrollWidth - el.clientWidth > 1)
    expect(overflows, 'the fixture actually produced an overflowing rail to test').toBe(true)

    await expect(rail).toHaveAttribute('tabindex', '0')

    // Focus it the way a keyboard user would reach it, then drive it with the arrows —
    // which is precisely what a non-focusable scroll container cannot do.
    await rail.focus()
    await expect(rail).toBeFocused()
    const before = await rail.evaluate((el) => el.scrollLeft)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect
      .poll(() => rail.evaluate((el) => el.scrollLeft), { message: 'arrow keys move a focused rail' })
      .toBeGreaterThan(before)

    // …and it is named, so landing on it says what it is rather than "group".
    await expect(rail).toHaveAttribute('aria-label', /date/i)
  })

  test3('a rail that fits is NOT a tab stop — no stop that scrolls nothing', async ({ page }) => {
    await openVirements(page, [MMID])
    const rail = page.locator('.virements__dates')
    await expect(rail).toBeVisible()

    const overflows = await rail.evaluate((el) => el.scrollWidth - el.clientWidth > 1)
    expect(overflows, 'a single date fits the card, so there is nothing to scroll to').toBe(false)
    await expect(rail).not.toHaveAttribute('tabindex', '0')
  })
})


// ── folded from longtext.spec.ts ──────────────────────────────────────────────
test.describe('longtext', () => {
  // Screenshot-review loop, iteration 5: LONG-TEXT stress. Every text field carries
  // a long phrase + an unbreakable long word (mockApi({ longText: true })). Catches
  // truncation/overflow/word-break bugs the tidy fixtures hide. The hard assertion
  // is "no horizontal overflow" (doc + the hub scroller); screenshots (lt-*.png)
  // are for eyeballing vertical/wrap issues. Crash-smoke guarded.
  const test = base.extend({
    page: async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(page)
      expect(errors, 'pageerror under long text').toEqual([])
    },
  })

  const FORMATS = [
    { name: 'phone', w: 390, h: 844, surface: 'mobile' as Surface },
    { name: 'wall', w: 1280, h: 800, surface: 'kiosk' as Surface },
  ]

  async function noHOverflow(page: Page): Promise<string> {
    return page.evaluate(() => {
      // On failure, NAME the widest offender: an overflow here has twice been
      // CI-only (Linux system-font metrics — ui-monospace runs wider than on
      // Windows/macOS), so the log must be actionable without reproducing locally.
      const brief = (el: Element) => {
        const cls = (el as HTMLElement).className
        const c = typeof cls === 'string' && cls.trim() ? '.' + cls.trim().split(/\s+/).slice(0, 3).join('.') : ''
        return el.tagName.toLowerCase() + c
      }
      const widest = (root: Element): string => {
        const limit = root.getBoundingClientRect().right
        let worst: Element | null = null
        let over = 1
        for (const el of Array.from(root.querySelectorAll('*'))) {
          const d = el.getBoundingClientRect().right - limit
          if (d > over) {
            over = d
            worst = el
          }
        }
        return worst ? ` (${brief(worst)} +${Math.round(over)}px)` : ''
      }
      const doc = document.documentElement
      const body = document.querySelector('.hub__body')
      if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow' + widest(doc)
      if (body && body.scrollWidth > body.clientWidth + 1) return 'body-overflow' + widest(body)
      return 'ok'
    })
  }

  // All SIX hub tabs. « Le cercle » used to be one of them; the nav restructure
  // merged it into Maison (Routines · Famille · Social · Business · Carnets) and
  // split its notes board out into its own « Les notes » tab — both covered here.
  // Famille (?section=family) is the one with the long member/group names + graph
  // labels that are a prime overflow risk (the exemption below moves with it — bare
  // /maison lands on Routines by default, which never carried that risk).
  const SURFACES = [
    { name: 'board', path: '/board' },
    { name: 'kitchen', path: '/kitchen' },
    { name: 'maison', path: '/maison' },
    { name: 'maison-family', path: '/maison?section=family' },
    { name: 'notes', path: '/notes' },
    { name: 'liste', path: '/liste' },
    { name: 'settings', path: '/settings' },
  ]
  // The surface exempt from the no-horizontal-overflow rule (pan/zoom trees +
  // graphics legitimately scroll sideways there — a product decision, inherited
  // from the old « Le cercle » tab's Famille/Social section). Screenshot +
  // crash-smoke still run for it; every other surface stays guarded.
  const OVERFLOW_EXEMPT = '/maison?section=family'
  // The audience-aware tabs also render a TODDLER lens off the same (now long) data —
  // big tiles + faces wrap differently and must not overflow either. Settings is
  // parent-only.
  const TODDLER_SURFACES = [
    { name: 'board', path: '/board' },
    { name: 'kitchen', path: '/kitchen' },
    { name: 'maison', path: '/maison' },
    { name: 'maison-family', path: '/maison?section=family' },
    { name: 'notes', path: '/notes' },
    { name: 'liste', path: '/liste' },
  ]

  for (const f of FORMATS) {
    for (const { name, path } of SURFACES) {
      test(`lt ${f.name}: ${name}`, async ({ page }) => {
        await page.setViewportSize({ width: f.w, height: f.h })
        await mockApi(page, { longText: true })
        await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: f.surface })
        await page.goto(path)
        await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
        await settled(page)
        await page.screenshot({ path: `e2e/screenshots/lt-${f.name}-${name}.png`, fullPage: false })
        if (path !== OVERFLOW_EXEMPT)
          await expect.poll(() => noHOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
      })
    }

    for (const { name, path } of TODDLER_SURFACES) {
      test(`lt ${f.name}: ${name} (toddler)`, async ({ page }) => {
        await page.setViewportSize({ width: f.w, height: f.h })
        await mockApi(page, { longText: true })
        await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: f.surface })
        await page.goto(path)
        await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
        await settled(page)
        await page.screenshot({ path: `e2e/screenshots/lt-${f.name}-${name}-toddler.png`, fullPage: false })
        if (path !== OVERFLOW_EXEMPT)
          await expect.poll(() => noHOverflow(page), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
      })
    }
  }

  // ── "In use" under long text: the full-screen overlays/scenes ────────────────
  // These take over the viewport, so a long unbreakable string overflows the DOCUMENT
  // (not a .hub__body scroller). Assert no horizontal overflow at the document level
  // AND inside the overlay's own root, so a stranded wide child is caught even if the
  // page lets it scroll. Screenshots remain for eyeballing wrap/spacing.
  async function docOverflow(page: Page, root: string): Promise<string> {
    return page.evaluate((sel) => {
      const doc = document.documentElement
      if (doc.scrollWidth > doc.clientWidth + 1) return 'doc-overflow'
      const el = document.querySelector(sel) as HTMLElement | null
      if (el && el.scrollWidth > el.clientWidth + 1) return 'root-overflow'
      return 'ok'
    }, root)
  }

  // Each overlay is checked at BOTH phone widths — 360 (narrow Android) is where a
  // long unbreakable word first pushes a scene root past the viewport. The 360 shot is
  // suffixed so both frames survive for review.
  for (const w of [360, 390]) {
    const sfx = w === 390 ? '' : `-${w}`

    test(`lt phone${sfx}: recipe sheet long title`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/kitchen')
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.getByRole('tab', { name: /Recettes/ }).click().catch(() => {})
      await settled(page)
      await page.locator('.recipe-card').first().click() // → recipe view directly (peek removed)
      await page.locator('.recipe-modal').waitFor({ state: 'visible' })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/lt-recipe-sheet${sfx}.png`, fullPage: false })
      await expect.poll(() => docOverflow(page, '.recipe-modal'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })

    test(`lt phone${sfx}: cashier grid long names`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/liste')
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.getByRole('button', { name: /Montrer/ }).first().click()
      await page.locator('.cashier__tile').first().waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/lt-cashier-grid${sfx}.png`, fullPage: false })
      // Long deal names must ellipsize inside the tile, not blow out the grid.
      await expect.poll(() => docOverflow(page, '.cashier'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })

    test(`lt phone${sfx}: cook mode (full) long steps`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      // Straight to cook mode for rc1 (long ingredients/steps under longText).
      await page.goto('/kitchen/recipe/rc1/cook')
      await page.locator('.cook').waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/lt-cook-full${sfx}.png`, fullPage: false })
      await expect.poll(() => docOverflow(page, '.cook'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })

    test(`lt phone${sfx}: day editor long meal titles`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/kitchen')
      await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
      await page.locator('.kitchen__day.is-today').getByRole('button', { name: /Gérer/ }).click()
      await page.locator('.scene .day-mng__sec').first().waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/lt-day-editor${sfx}.png`, fullPage: false })
      await expect.poll(() => docOverflow(page, '.scene'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })

    // « Le cercle » full-screen overview map under long member/group names.
    test(`lt phone${sfx}: cercle « Notre monde » long names`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 844 })
      await mockApi(page, { longText: true })
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/cercle/monde')
      await page.locator('.scene').first().waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      await page.screenshot({ path: `e2e/screenshots/lt-cercle-monde${sfx}.png`, fullPage: false })
      await expect.poll(() => docOverflow(page, '.scene'), { timeout: 6000, intervals: [200, 400, 800] }).toBe('ok')
    })
  }
})


// ── folded from spacing.spec.ts ──────────────────────────────────────────────
test5.describe('spacing', () => {
  // THE GAP OWNS THE SPACING — a ratchet at zero (2026-10-01).
  //
  // A shared component carries an outer margin for the day it stands alone in the page
  // flow (SubTabs' row and MemberSwitcher 1.25rem below, a Disclosure 0.5rem above, a <p>
  // the browser's 1em). Inside a flex container that margin never collapses into the
  // container's `gap`, it ADDS to it:
  //   • in a gapped COLUMN the space is counted twice — Maison put 36px under its section
  //     pills where the page breathes 16px; « Pour qui ? » floated 28px from its field;
  //   • in a CENTRED ROW it is part of the box being centred, so the neighbours sit off
  //     the line — the Réglages « ? » sat 10px below Comprendre · Régler.
  // The fix is the « gap owns the spacing » block in core.css. This walks every route at
  // a phone and a desktop width and fails on a new one.
  //
  // The allow-list is rhythm on purpose, each with its reason — not a parking lot.

  const ALLOWED: { parent: string; child: string; why: string }[] = [
    { parent: 'qa__list', child: 'qa__grouphead', why: 'a group heading sits closer to its items than to the group above' },
    { parent: 'recipe-modal__body', child: 'recipe-sec-h', why: 'a section heading sits closer to its section than to the one above' },
    { parent: 'voyage-form', child: 'voyage-form__label', why: 'a label hugs its own field, apart from the field above' },
    { parent: 'voyage-form', child: 'btn--primary', why: 'the submit stands apart from the fields it submits' },
    { parent: 'operator__inline-form', child: 'form-footer', why: 'the submit row stands apart from the fields it submits' },
  ]

  const SIZES = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
  ] as const

  for (const size of SIZES) {
    for (const route of ROUTES) {
      const at = `${route} @${size.name}`
      test5(`the gap owns the spacing on ${at}`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height })
        await mockApi(page)
        await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
        await page.goto(route)
        await expect(page.locator('.loading, .skeleton'), `${at} finished loading`).toHaveCount(0, { timeout: 15_000 })
        await settled(page)
        const hits = await page.evaluate((allowed) => {
          const sig = (el: Element) =>
            el.tagName.toLowerCase() + [...el.classList].filter((c) => !c.startsWith('is-')).map((c) => '.' + c).join('')
          const inFlow = (el: Element) => {
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'absolute' && cs.position !== 'fixed'
          }
          const ok = (p: Element, c: Element) => allowed.some((a) => p.classList.contains(a.parent) && c.classList.contains(a.child))
          const out: string[] = []
          for (const p of document.querySelectorAll('body *')) {
            const ps = getComputedStyle(p)
            if (!ps.display.includes('flex')) continue
            const kids = [...p.children].filter(inFlow)
            if (kids.length < 2) continue
            const row = ps.flexDirection.startsWith('row')
            const gap = parseFloat(ps.rowGap) || 0
            kids.forEach((c, i) => {
              if (ok(p, c)) return
              const cs = getComputedStyle(c)
              const mt = parseFloat(cs.marginTop) || 0
              const mb = parseFloat(cs.marginBottom) || 0
              if (row && ps.alignItems === 'center' && Math.abs(mt - mb) >= 4) {
                // Only a sibling sharing the LINE can be pushed off it.
                const r = c.getBoundingClientRect()
                const shares = kids.some((k) => {
                  if (k === c) return false
                  const kr = k.getBoundingClientRect()
                  return kr.top < r.bottom && kr.bottom > r.top
                })
                if (shares) out.push(`row: ${sig(p)} > ${sig(c)} (margin ${mt}/${mb}px shifts the centre line)`)
              }
              if (!row && gap >= 4 && i > 0 && i < kids.length - 1 && (mt >= 4 || mb >= 4))
                out.push(`column: ${sig(p)} > ${sig(c)} (margin ${mt}/${mb}px on top of a ${gap}px gap)`)
            })
          }
          return [...new Set(out)]
        }, ALLOWED)
        expect(hits, `a margin adds to its container's spacing on ${at}`).toEqual([])
      })
    }
  }
})


// ── folded from segmented.spec.ts ──────────────────────────────────────────────
test6.describe('segmented', () => {
  // A value picker is ONE tab stop and arrows move + select (solidify 3.3): the eight
  // hand-rolled copies were rows of independent pressed buttons, and no radiogroup existed
  // in the app. The board's view switch is the one every household touches.
  test6('the board view switch is a radiogroup: one tab stop, arrows select', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    const group = page.getByRole('radiogroup', { name: /vue|view/i }).first()
    // Five since the « Tâches » view (unified tasks, phase 2).
    await expect(group.getByRole('radio')).toHaveCount(5)
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1)

    await group.getByRole('radio', { checked: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(group.getByRole('radio', { name: 'La semaine' })).toBeChecked()
    await expect(group.getByRole('radio', { name: 'La semaine' })).toBeFocused()
    await expect(group.locator('[tabindex="0"]')).toHaveCount(1)
  })

  // The phone's BACK inside a drilled ＋ sheet closes the SHEET (the same as its ✕), and the
  // page stays. The ← in the sheet's head is the way back to the tiles. Pinned on purpose:
  // wave 1.3 asked about these nested pickers and no spec had driven one.
  test6('back from a drilled ＋ sheet closes the sheet and stays on the page', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub' })
    await page.locator('.add-fab').click()
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await sheet.locator('.cat-pick[data-mode="todo"]').click()
    await expect(sheet.locator('.sheet__back')).toBeVisible()

    await page.goBack()
    await expect(page.locator('.sheet.show')).toHaveCount(0)
    await expect(page).toHaveURL(/\/board/)
    await expect(page.locator('.hub')).toBeVisible()
  })
})


// ── folded from row-labels.spec.ts ──────────────────────────────────────────────
test7.describe('row-labels', () => {
  // What a ROW is called to assistive tech.
  //
  // The compact-rows pass spends a row's whole width on its words: no spine, no
  // avatar disc, no always-on pencil — "who" is the title's tint, and the actions
  // hide behind the row's one door. That works on screen. It stops working the
  // moment the row's controls carry an `aria-label`, because a label REPLACES the
  // element's content instead of adding to it: every liste row announced itself as
  // « Cocher » and every todo row as « Modifier », with the item's own text — and
  // « pas pressé », the staged deal, the aisle — never reaching the a11y tree at all.
  //
  // So the contract here is about the COMPUTED accessible name, not the markup:
  //   · a labelled control names the verb AND the object (« Cocher — Lait »),
  //   · the big content button carries NO label, so its content is its name, and
  //     says its state through aria-pressed instead.
  // Both assertions fail on the pre-fix code, which is the point.

  test7('a liste row says WHICH item, not just the verb', async ({ page }) => {
    await mockApi(page)
    await seedState(page, {})
    await page.goto('/liste')
    const row = page.locator('.list-row', { hasText: 'Lait' }).first()
    await expect(row).toBeVisible()

    // The labelled controls: verb — object. « Lait » carries a staged deal WITH its
    // clipping (the fixture got the picture on 2026-09-10, for the till card), and a
    // row with a clipping shows the picture AS the picture — a zoom, named by its
    // alt, not the « Modifier » door (that moved to press-and-hold / ⚙ Avancé). So the
    // labelled edit door is checked on « Pain », a row with no deal. Both shapes are
    // the product; the first version of this test only ever saw one.
    await expect(row.locator('.list-row__img--zoom img')).toHaveAccessibleName(/Lait/)
    await expect(row.locator('.list-row__toggle')).toHaveAccessibleName(/Cocher.*Lait/)
    const plain = page.locator('.list-row', { hasText: 'Pain' }).first()
    await expect(plain.locator('button.list-row__img')).toHaveAccessibleName(/Modifier.*Pain/)

    // The row centre IS the row: its name comes from its content, so the item and
    // the quiet second line (here the staged Super C deal on « Lait ») survive.
    const name = row.locator('.list-row__name')
    await expect(name).toHaveAccessibleName(/Lait/)
    await expect(name).toHaveAccessibleName(/Super C/)
    // A toggle, and it says so — that's what replaced the bare « Cocher » label.
    await expect(name).toHaveAttribute('aria-pressed', 'false')
    await name.click()
    await expect(name).toHaveAttribute('aria-pressed', 'true')
  })

  test7('a todo row says WHICH todo, on both of its controls', async ({ page }) => {
    await mockApi(page)
    await seedState(page, {})
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')

    const todos = page.locator('.wg-slot[data-card="todos"]')
    await todos.scrollIntoViewIfNeeded()
    const row = todos.locator('.act', { hasText: 'Clés + téléphone + portefeuille' })
    await expect(row).toBeVisible()

    // The merged card's row is the shared Act: the check names the row it ticks, and the
    // body's own text names itself.
    await expect(row.locator('.act__checkbtn')).toHaveAccessibleName(/Fait.*Clés|Marquer.*Clés/)
    await expect(row.locator('.act__hit')).toHaveAccessibleName(/Clés/)
  })
})


// ── folded from lean-forms.spec.ts ──────────────────────────────────────────────
test8.describe('lean-forms', () => {
  // The "heavy form" pass: four surfaces where the chrome outweighed the content, all
  // fixed the same way — what you MUST answer leads, what you rarely touch waits behind
  // a Disclosure that opens itself the moment it holds a real answer.
  //
  // The one rule that makes the fold safe: **a fold never hides a filled field.** Every
  // case below therefore has a twin — blank form → collapsed; existing record with data
  // → already open. Without that, editing a contact would silently bury their phone
  // number, which is worse than the wall of empty boxes we started from.

  const phone = async (page: Page, path: string) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto(path)
  }

  // ── « Nouvelle personne » ───────────────────────────────────────────────────────
  test8('a new person leads with the name and the birthday; the rest waits', async ({ page }) => {
    await phone(page, '/cercle/person/new')
    await expect(page.getByText('Prénom')).toBeVisible()

    // The three that identify someone stay put…
    await expect(page.getByText('Prénom')).toBeVisible()
    await expect(page.getByText('Nom', { exact: true })).toBeVisible()
    await expect(page.getByText('Anniversaire')).toBeVisible()

    // …the six that mostly stay empty are not even in the DOM yet.
    for (const label of ['Surnom', 'Genre', 'Téléphone', 'Courriel', 'Adresse']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    }

    // The whole form now fits one phone screen: « Liens » (the last block) is reachable
    // without the two scrolls the ten stacked fields used to cost.
    const fold = page.getByRole('button', { name: 'Coordonnées et détails' })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await fold.click()
    for (const label of ['Surnom', 'Genre', 'Téléphone', 'Courriel', 'Adresse']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test8('editing a person who HAS a phone opens the fold — it never hides what is filled', async ({ page }) => {
    // c1 = Rose « Mamie » Tremblay: a nickname AND a phone number in the fixture.
    await phone(page, '/cercle/person/c1')
    await expect(page.locator('.cf')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Coordonnées et détails' })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('input[type="tel"]')).toHaveValue('450-555-0201')
  })

  // ── « Ajouter un rendez-vous » ──────────────────────────────────────────────────
  test8('the event form folds « Répéter » + « Afficher dès » away', async ({ page }) => {
    await phone(page, '/event/new')
    await expect(page.getByPlaceholder('Quoi ? (ex. dentiste)')).toBeVisible()

    await expect(page.locator('.recur')).toHaveCount(0)
    const fold = page.getByRole('button', { name: 'Répéter, afficher d’avance' })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await fold.click()
    await expect(page.locator('.recur')).toBeVisible()

    // Three optional sections, in one consistent shape.
    for (const label of ['Répéter, afficher d’avance', 'Prend l’auto', 'À apporter']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }
  })

  test8('a rendez-vous that already repeats opens the fold', async ({ page }) => {
    await phone(page, '/event/new?ride=1')
    // ?ride=1 pre-answers « Prend l'auto » — the same defaultOpen contract on the
    // sibling section, proving the pattern is the one the form already used.
    await expect(page.getByRole('button', { name: 'Prend l’auto' })).toHaveAttribute('aria-expanded', 'true')
  })

  // ── « Nouvelle recette » ────────────────────────────────────────────────────────
  test8('the recipe builder leads with the recipe’s NAME', async ({ page }) => {
    await phone(page, '/kitchen/recipe/new')
    const body = page.locator('.recipe-modal__body')
    await expect(body).toBeVisible()

    // The name is the first control in the body — it used to be the third, under the
    // photo button and a « Remplir vite » block three controls + an explainer tall.
    const firstField = body.locator('input, button, label').first()
    await expect(firstField).toHaveClass(/recipe-title-input/)

    // The fast-fill helpers (and their three-line explainer) wait behind their label.
    await expect(page.locator('.recipe-helpers')).toHaveCount(0)
    await expect(page.locator('.recipe-fill-hint')).toHaveCount(0)
    const fold = page.getByRole('button', { name: 'Remplir vite' })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await fold.click()
    await expect(page.locator('.recipe-helpers')).toBeVisible()
    await expect(page.locator('.recipe-fill-hint')).toBeVisible()
  })

  // ── The recipe builder, part two (Marc, 2026-10-27) ─────────────────────────────
  // « When you add an ingredient, THEN you see all the buttons for it; same for
  // Préparation and the other options. » Every ingredient row wore ↑ ↓ ✕ at all times,
  // every step ↑ ↓ + « Ajouter une photo », and seven optional fields stood open under
  // the steps. The furniture now belongs to the row being edited, and the options wait
  // in ONE « Détails » fold that opens itself when it holds anything.
  const toolsWidth = async (row: Locator) => (await boxOf(row.locator('.recipe-line__tools').first())).width

  test8('recipe builder: the options wait in « Détails »; a row shows its tools only while it is the one being edited', async ({ page }) => {
    await phone(page, '/kitchen/recipe/new')
    await expect(page.locator('.recipe-modal__body')).toBeVisible()

    const details = page.getByRole('button', { name: 'Détails' })
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    for (const folded of ['.recipe-meta-row', '.recipe-times-row', '.recipe-readlang', '.recipe-tags-edit', '.recipe-photo']) {
      await expect(page.locator(folded), `${folded} waits in « Détails »`).toHaveCount(0)
    }

    // A quiet ingredient row: its ↑ ↓ ✕ take no room until the row is the active one.
    const rows = page.locator('.recipe-lines .recipe-line')
    expect(await toolsWidth(rows.nth(0)), 'quiet row: no tools').toBeLessThan(1)
    await rows.nth(0).locator('input').click()
    expect(await toolsWidth(rows.nth(0)), 'the row being edited shows its tools').toBeGreaterThan(40)
    await rows.nth(0).locator('input').fill('400 g de pâtes')
    await rows.nth(0).locator('input').press('Enter') // → a fresh row, focused
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1).locator('input')).toBeFocused()
    await expect.poll(() => toolsWidth(rows.nth(0)), { message: 'the row left behind goes quiet' }).toBeLessThan(1)
    expect(await toolsWidth(rows.nth(1))).toBeGreaterThan(40)

    // Keyboard, no hover, no touch: Tab from the field reaches the row's own buttons, and
    // moving a row keeps the focus on the row that moved.
    await page.keyboard.press('Tab')
    await expect(rows.nth(1).getByRole('button', { name: 'Monter' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rows.nth(0).locator('input')).toHaveValue('')
    await expect(rows.nth(1).locator('input')).toHaveValue('400 g de pâtes')
    await expect.poll(() => toolsWidth(rows.nth(0)), { message: 'the moved row keeps its tools' }).toBeGreaterThan(40)
    expect(await toolsWidth(rows.nth(1))).toBeLessThan(1)

    // A step at rest is its text alone; opened, it carries ↑ ↓, the photo and « Retirer ».
    const step = page.locator('.recipe-steps .recipe-step').first()
    expect(await toolsWidth(step), 'quiet step: no ↑ ↓').toBeLessThan(1)
    await expect(step.locator('.recipe-step__photo')).toHaveCount(0)
    await step.locator('.recipe-step__open').click()
    await expect(step.locator('.recipe-step__memo')).toBeVisible()
    await expect(step.getByRole('button', { name: 'Retirer l’étape' })).toBeVisible()
    await expect(step.getByRole('button', { name: 'Monter' })).toBeVisible()
    await expect(step.locator('.recipe-step__photo')).toBeVisible()
  })

  test8('recipe builder twin: a recipe that HAS details opens with them, and folded it still says what it holds', async ({ page }) => {
    await phone(page, '/kitchen/recipe/rc1/edit')
    const details = page.getByRole('button', { name: /^Détails/ })
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.recipe-servings input')).toHaveValue('4')
    // Seven stored ingredients, none of them wearing furniture before one is touched.
    const rows = page.locator('.recipe-lines .recipe-line')
    await expect(rows).toHaveCount(7)
    for (let i = 0; i < 7; i++) expect(await toolsWidth(rows.nth(i))).toBeLessThan(1)

    await details.click()
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await expect(details).toContainText('4 portions · 15 + 30 min · notes · 2 étiquettes')
    const b = await boxOf(details)
    expect(b.x + b.width, 'the summary pill stays inside a 390 px phone').toBeLessThanOrEqual(390)
    // …and the note is READ, not cut: an ellipsis once ended it at « · not… ».
    const clipped = await details.locator('.disclosure__note').evaluate((el) => el.scrollWidth > el.clientWidth + 1)
    expect(clipped, 'the whole note shows').toBe(false)
  })

  // ── Maison ▸ Famille ────────────────────────────────────────────────────────────
  test8('« Compléter les familles » sits under the directory, not over it', async ({ page }) => {
    await phone(page, '/maison?section=family')
    const complete = page.locator('.cercle-complete')
    await expect(complete).toBeVisible()

    // Below the last person, not between the face chip and the first one.
    //
    // Measured through boxOf() (e2e/measure), which RETRIES. Waiting for the row to be
    // visible first is not enough and this test is the proof: it threw « Cannot read
    // properties of null » on the line below while its own toBeVisible() had just
    // passed. Visibility already implies a box — what it cannot promise is that the
    // SAME node is still attached when the next call re-resolves the selector, and this
    // list re-renders as its query settles. Fixed once here by awaiting visibility
    // (cbed72c) and it came back the next day; retrying the measurement is the fix that
    // holds.
    const firstRow = page.locator('.cercle-row').first()
    await expect(firstRow).toBeVisible()
    const rowY = (await boxOf(firstRow)).y
    const btnY = (await boxOf(complete)).y
    expect(btnY, 'the housekeeping action comes after the people').toBeGreaterThan(rowY)

    // …and it is a chip, not a full-width bar (a flex column stretches its children).
    const w = (await boxOf(complete)).width
    expect(w).toBeLessThan(300)

    // Same for the face chip above — it wore the full width too.
    const chip = page.locator('.cercle-focus .profile-chip')
    await expect(chip).toBeVisible()
    const chipW = (await boxOf(chip)).width
    expect(chipW).toBeLessThan(300)
  })

  // ── The fold only exists when it has coordonnées to hold ────────────────────────
  test8('the intake’s per-person card keeps Surnom + Genre inline — no empty-labelled fold', async ({ page }) => {
    // IntakeForm's added-family cards pass showContact={false} showAddress={false}. A
    // « Coordonnées et détails » fold holding nothing but a nickname and three gender
    // chips would be a lying label, so ContactFields renders those two inline there.
    await phone(page, '/intake')
    await page.getByRole('button', { name: 'Ajouter une personne' }).first().click()

    // The self card (full field set) folds; the added person's card does not — so the
    // page carries exactly ONE fold, and the added card shows its two fields inline.
    await expect(page.getByRole('button', { name: 'Coordonnées et détails' })).toHaveCount(1)
    await expect(page.getByText('Surnom', { exact: true })).toBeVisible()
    await expect(page.getByText('Genre', { exact: true })).toBeVisible()
  })

  // ── Réglages + le babillard ─────────────────────────────────────────────────────
  // Same pass, on the two surfaces you land on most. Réglages stacked a heading, an
  // identity line, a sign-out button and THREE control rails before its first setting
  // (~490px of a 844px phone); the board put a one-time "hold a card to rearrange"
  // note above every card on the one screen whose whole job is to be glanceable.

  test8('Réglages has no « Réglages » heading and no sign-out at the top', async ({ page }) => {
    await phone(page, '/settings?tab=board&lens=regler')
    await expect(page.locator('.operator__tabs')).toBeVisible()

    // The nav tab at the foot says the word, and it is the lit one — so the heading
    // takes NO space, while still existing for a screen reader (dropping the page's
    // only h1 would be a real regression, not a lean win).
    const h1 = page.locator('.operator h1')
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveClass(/sr-only/)
    // sr-only clips to a 1px box rather than display:none (that is what keeps it in
    // the accessibility tree), so assert the SPACE it takes, which is the real claim.
    expect((await boxOf(h1)).height).toBeLessThanOrEqual(1)
    await expect(page.getByRole('link', { name: 'Réglages' })).toBeVisible()

    // Sign-out is at the FOOT, under the settings — not second from the top.
    const out = page.locator('.operator__signout')
    await expect(out).toBeVisible()
    const head = page.locator('.operator__head')
    expect((await boxOf(out)).y).toBeGreaterThan((await boxOf(head)).y)
    const firstCard = page.locator('.operator__section').first()
    expect((await boxOf(out)).y).toBeGreaterThan((await boxOf(firstCard)).y)

    // …and the first setting is now within the first screen.
    expect((await boxOf(firstCard)).y).toBeLessThan(400)
  })

  test8('« Voir dans l’app » rides the lens row, and keeps a name when its label hides', async ({ page }) => {
    await phone(page, '/settings?tab=board&lens=regler')
    const goto = page.locator('.operator__goto')
    await expect(goto).toBeVisible()

    // Same row as Comprendre / Régler — not a line of its own above the settings.
    const lens = page.locator('.operator__lens')
    const a = await boxOf(goto)
    const b = await boxOf(lens)
    expect(Math.abs(a.y - b.y), 'the goto shares the lens row').toBeLessThan(24)

    // On a narrow phone the word hides; the control must NOT go unnamed.
    await expect(goto.locator('span')).toBeHidden()
    await expect(goto).toHaveAttribute('aria-label', 'Voir dans l’app')

    // Wider: the word comes back.
    await page.setViewportSize({ width: 900, height: 800 })
    await expect(goto.locator('span')).toBeVisible()
  })

  test8('the board’s edit hint sits under the cards, not over them', async ({ page }) => {
    await phone(page, '/board')
    const hint = page.locator('.board-edit-hint[role="note"]')
    await expect(hint).toBeVisible()

    // Below the grid it describes — it used to displace the first card.
    const grid = page.locator('.board-grid')
    expect((await boxOf(hint)).y).toBeGreaterThan((await boxOf(grid)).y)

    // Still one-time + per-device: dismissing retires the INSTRUCTION — but its slot
    // keeps a permanent quiet « Organiser » door (PARITY.md Wave C: the keyboard/
    // discoverable mirror of the hold), which survives a reload and arms edit mode.
    await hint.getByRole('button').click()
    await expect(page.locator('.board-edit-hint[role="note"]')).toHaveCount(0)
    const door = page.locator('.board-edit-hint--door')
    await expect(door).toBeVisible()
    await page.reload()
    await expect(page.locator('.board-edit-hint[role="note"]')).toHaveCount(0)
    await expect(page.locator('.board-edit-hint--door')).toBeVisible()
    await page.locator('.board-edit-hint--door button').click()
    await expect(page).toHaveURL(/edit=1/)
  })

  // ── La cuisine · Le cercle ──────────────────────────────────────────────────────

  test8('Business + Carnets drop the heading their section pill already says', async ({ page }) => {
    for (const [section, pill] of [['business', 'Commerces'], ['carnets', 'Carnets']] as const) {
      await phone(page, `/maison?section=${section}`)
      const body = page.locator('.hub__body')
      await expect(body).toBeVisible()
      // The lit pill names the section; the tab below it adds no second title and no
      // lead paragraph. Exactly ONE thing on screen says the word.
      await expect(page.locator('.cercle-section__label')).toHaveCount(0)
      await expect(page.locator('.cercle-business__hint')).toHaveCount(0)
      await expect(page.getByRole('tab', { name: pill })).toHaveAttribute('aria-selected', 'true')
    }
  })

  test8('arming « ? » on a section pill paints ONE bubble, not two', async ({ page }) => {
    // The regression this locks: BusinessesTab/CarnetsTab each carried a HelpTitle for
    // the same help key the section pill row already owns, and helpMode renders every
    // bubbleFor(k) whose key matches — so an armed pick painted the bubble TWICE.
    await phone(page, '/maison?section=business')
    await page.locator('.hub__body').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: /Aide|aide|\?/ }).first().click()
    await page.getByRole('tab', { name: 'Commerces' }).click()
    await expect(page.locator('.help-bubble')).toHaveCount(1)
  })

  test8('the pet form folds every secondary field — including the tail that hung below', async ({ page }) => {
    await phone(page, '/cercle/pet/new')
    await expect(page.getByPlaceholder('Nom')).toBeVisible()

    // Vet, colour, notes and photo used to sit BELOW the « Détails / santé » fold,
    // expanded — a disclosure with loose fields under it holds nothing worth opening.
    const fold = page.getByRole('button', { name: 'Détails / santé' })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.pet-form__weight-add')).toHaveCount(0)
    await expect(page.locator('input[type=file]')).toHaveCount(0)
    await expect(page.getByText('Couleur', { exact: true })).toHaveCount(0)

    await fold.click()
    await expect(page.locator('.pet-form__weight-add')).toBeVisible()
    await expect(page.locator('input[type=file]')).toHaveCount(1)
    // The colour moved out of the health fold into the pet's look (LookPicker, 0148): identity,
    // not health, and still folded so the form opens on the name.
    await expect(page.getByText('Couleur', { exact: true })).toHaveCount(0)
    const look = page.getByRole('button', { name: /Allure/ })
    await expect(look).toHaveAttribute('aria-expanded', 'false')
    await look.click()
    await expect(page.getByText('Couleur', { exact: true })).toBeVisible()
  })

  // ── Le mois : un jour se dé-tape ────────────────────────────────────────────────

  const mois = async (page: Page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test8('a tapped calendar day can be UNTAPPED — the drawer closes, the grid stays', async ({ page }) => {
    await mois(page)
    const open = page.locator('.monthv__cell.is-on')
    await expect(open).toHaveCount(1)
    await expect(page.locator('.monthv__day')).toBeVisible()

    // Tap the open day again → nothing is picked and the drawer is gone.
    await open.click()
    await expect(page.locator('.monthv__cell.is-on')).toHaveCount(0)
    await expect(page.locator('.monthv__day')).toHaveCount(0)
    // The calendar itself is untouched — untapping closes a drawer, it doesn't navigate.
    await expect(page.locator('.monthv__cell')).not.toHaveCount(0)

    // Tapping any day (the same one included) brings it back.
    await page.locator('.monthv__cell').nth(20).click()
    await expect(page.locator('.monthv__day')).toBeVisible()
    await expect(page.locator('.monthv__cell.is-on')).toHaveCount(1)
  })

  test8('a picked day keeps the grid’s shape — no pop-out tile', async ({ page }) => {
    await mois(page)
    // The wide floating tile is gone for good: the day PANEL says all of that, in full
    // names, with everything you can do with the day.
    await expect(page.locator('.monthv__lines')).toHaveCount(0)

    // The lit cell is the same size as its neighbours (it used to grow and float over
    // them, which changed the calendar's shape under the finger).
    const on = page.locator('.monthv__cell.is-on')
    const other = page.locator('.monthv__cell:not(.is-on)').nth(10)
    const a = await boxOf(on)
    const b = await boxOf(other)
    expect(Math.abs(a.height - b.height), 'the picked cell does not grow').toBeLessThan(2)
    expect(Math.abs(a.width - b.width), 'the picked cell does not widen').toBeLessThan(2)
  })

  // ── La liste, allégée ──────────────────────────────────────────────────────────

  test8('La liste: the add field is text + mic, and Enter writes the line', async ({ page }) => {
    await phone(page, '/liste')
    await page.locator('.list-rows').waitFor({ state: 'visible' })

    // No « Ajouter » CTA taking a third of the row from what you're typing…
    await expect(page.getByRole('button', { name: 'Ajouter', exact: true })).toHaveCount(0)
    // …but the mic stays: on this page it is hands-free ADDING, the headline flow.
    await expect(page.locator('[data-tour="liste-add"] .edit-field__box button')).not.toHaveCount(0)

    const field = page.locator('[data-tour="liste-add"] input').first()
    await field.fill('céleri')
    await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/list') && r.method() === 'POST'),
      field.press('Enter'),
    ])
  })

  test8('La liste: the three shortcuts are icons on one row', async ({ page }) => {
    await phone(page, '/liste')
    await page.locator('.list-rows').waitFor({ state: 'visible' })

    const row = page.locator('.list-actions--quiet')
    const icons = row.locator('.list-actions__icon')
    await expect(icons).toHaveCount(3)

    // One row: every chip shares the same top edge (they used to be three full-width
    // orange bars stacked 2+1, then labelled chips wrapping onto two lines).
    const tops: number[] = []
    for (const b of await icons.all()) tops.push((await boxOf(b)).y)
    expect(Math.max(...tops) - Math.min(...tops), 'all three on one line').toBeLessThan(4)

    // Icon-only, but never unnamed.
    for (const b of await icons.all()) {
      await expect(b).toHaveText('')
      expect(await b.getAttribute('aria-label')).toBeTruthy()
    }
  })

  test8('La liste: « Allées » rows all share one left margin', async ({ page }) => {
    await phone(page, '/liste')
    await page.locator('.list-rows').waitFor({ state: 'visible' })
    await page.locator('.list-actions .action-menu > button').click()

    const items = page.locator('.action-menu__item')
    await expect(items).not.toHaveCount(0)
    // The ✓ column is reserved on EVERY row now, stateful or not — « Ranger par allée »
    // carries no state and used to sit ~15px left of the choices above it.
    const lefts: number[] = []
    for (const it of await items.all()) {
      const icon = it.locator('svg').last()
      lefts.push((await boxOf(icon)).x)
    }
    expect(Math.max(...lefts) - Math.min(...lefts), 'one column, one margin').toBeLessThan(2)
  })

  test8('La liste: a staged deal with no price shows the store alone — no dangling « · »', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    // A deal that carries a merchant and NO price — money() renders '' for null, so the
    // old fixed « {merchant} · {money} » drew « Maxi · » with nothing after it.
    // The page reads only { list, members } off /api/board (BoardListData), so a
    // minimal payload is enough — and route.fetch() cannot chain here: every /api/* is
    // fulfilled synthetically, there is no backend behind the mocks to fetch from.
    await page.route('**/api/board**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const body: { list: unknown[]; members: unknown[] } = { list: [], members: [] }
      body.list = [
        {
          id: 'lp',
          text: 'Beurre',
          source: 'manual',
          checked_at: null,
          added_by: null,
          position: 0,
          non_urgent: 0,
          deal_json: JSON.stringify({ id: 1, flyerId: 1, name: 'Beurre', price: null, merchant: 'Maxi', logo: null, image: null }),
        },
      ]
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto('/liste')
    const deal = page.locator('.list-row__deal')
    await expect(deal).toBeVisible()
    await expect(deal).toHaveText(/Maxi/)
    await expect(deal).not.toHaveText(/·/)
  })

  // ── « Avant de partir » · « L'auto » ───────────────────────────────────────────

  test8('« Avant de partir » keeps its add box behind the heading ＋', async ({ page }) => {
    await phone(page, '/board/departure')
    // .sec-label renders its title in a <b>, not a heading role.
    await expect(page.locator('.todo-sec .sec-label', { hasText: 'Listes de départ' })).toBeVisible()

    // A surface you open to READ what to grab on the way out should not lead with an
    // add box. The picker waits behind the ＋ in the heading (shared SectionAdd, the
    // slot TodoSection gained for this).
    await expect(page.locator('.todo-sec .edit-field, .todo-sec .combo')).toHaveCount(0)
    const plus = page.locator('.todo-sec .sec-label__actbtn')
    await expect(plus).toBeVisible()
    await expect(plus).toHaveAttribute('aria-expanded', 'false')

    await plus.click()
    await expect(plus).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.todo-sec .edit-field, .todo-sec .combo').first()).toBeVisible()
  })

  test8('« L’auto » drops a subtitle that only echoes its title', async ({ page }) => {
    await phone(page, '/voiture')
    const head = page.locator('.scene__head-titles')
    await expect(head).toBeVisible()
    // An unrenamed car is seeded « L'auto », so under « L'auto cette semaine » the
    // subtitle said the same word twice. A real name would still show.
    await expect(head).toContainText('cette semaine')
    await expect(page.locator('.scene__head-titles .scene__sub, .scene__subtitle')).toHaveCount(0)
  })
})


// ── folded from lean-scenes.spec.ts ──────────────────────────────────────────────
test9.describe('lean-scenes', () => {
  // The 2026-08-26 lean pass over the scenes the state matrix had never opened. Each
  // test here pins ONE find, so a regression names itself instead of showing up as a
  // budget failure with no story:
  //
  //   /search             the count and « Demander à l'IA » share one line, and the CTA
  //                       no longer camps above every result (246 → 151px).
  //   /kitchen/recipe/:id a recipe that STATES its servings shows one scaling control,
  //                       not two (243 → 209px) — one that doesn't keeps its presets.
  //   /home-project/new   the one task form: the name field leads, the usual tasks that FILL it
  //                       sit under it (159 → 17px, matching every other form scene).
  //   /cercle/carnet/:id  four full-width « ＋ Ajouter … » bars became the shared
  //                       SectionAdd ＋ in each section header (the day-page anatomy).
  //   /voyage/:id       the itinerary showed an OPEN composer under every single day —
  //                       an 8-day trip opened as ~1400px of empty add boxes. One ＋ per
  //                       day header now, one composer at a time.
  //   /liste/circulaires  the header subtitle that repeated the empty state is gone.
  //
  // See LEAN.md, and the budgets in e2e/state-matrix.spec.ts.

  // ── /search ─────────────────────────────────────────────────────────────────────

  test9('search puts the count and « Demander à l’IA » on ONE line, above the results', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/search?q=spag')
    await expect(page.locator('.search__row').first()).toBeVisible({ timeout: 15_000 })

    const meta = page.locator('.search__meta')
    await expect(meta.locator('.search__count')).toHaveCount(1)
    await expect(meta.locator('.search__ask')).toHaveCount(1)

    // One line, not two: their vertical centres agree.
    const count = await meta.locator('.search__count').boundingBox()
    const ask = await meta.locator('.search__ask').boundingBox()
    const row = await page.locator('.search__row').first().boundingBox()
    expect(count && ask && row).toBeTruthy()
    expect(Math.abs(count!.y + count!.height / 2 - (ask!.y + ask!.height / 2))).toBeLessThan(12)
    // …and the whole line sits above the first hit (it is a header, not a footer).
    expect(ask!.y + ask!.height).toBeLessThanOrEqual(row!.y + 1)
  })

  // ── /kitchen/recipe/:id ─────────────────────────────────────────────────────────

  test9('a recipe that states its servings shows ONE scaling control, not two', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/kitchen/recipe/rc1')
    await expect(page.locator('.recipe-view__ings li').first()).toBeVisible({ timeout: 15_000 })
    // The stepper says it in portions — which is what you want to know.
    await expect(page.locator('.recipe-scale')).toHaveCount(1)
    await expect(page.locator('.recipe-mult')).toHaveCount(0)
  })

  test9('a recipe with NO stated servings keeps its ×½ ×1 ×2 ×3 presets', async ({ page, app }) => {
    // The presets are that recipe's whole scaling control — this is the case the fix
    // above must not cargo-cult onto (LEAN.md invariant 3).
    await app.boot({ viewport: { width: 390, height: 844 }, api: { overrides: {
      recipes: {
        recipes: [
          {
            id: 'rcX',
            title: 'Sauce à spag',
            ingredients: ['1 pot de sauce tomate', '500 g de bœuf haché'],
            steps: ['Mijoter 20 minutes.'],
            servings: null,
            prepMin: null,
            cookMin: null,
            totalMin: null,
            notes: null,
            source: null,
            image: null,
            tags: [],
            updatedAt: 1_700_000_000,
          },
        ],
      },
    } } })
    await page.goto('/kitchen/recipe/rcX')
    await expect(page.locator('.recipe-view__ings li').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.recipe-scale')).toHaveCount(0)
    await expect(page.locator('.recipe-mult')).toHaveCount(1)
  })

  // ── /home-project/new ───────────────────────────────────────────────────────────

  test9('the task form leads with its name, every layer folded under it', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/home-project/new')
    const form = page.locator('.scene .task-form')
    const field = form.locator('.edit-field__input').first()
    await expect(field).toBeVisible({ timeout: 15_000 })
    // One field open, the rest one tap away: every layer is a closed fold under the name.
    const folds = form.locator('.disclosure__summary')
    expect(await folds.count()).toBeGreaterThanOrEqual(6)
    const f = await boxOf(field)
    for (let i = 0; i < (await folds.count()); i++) {
      await expect(folds.nth(i)).toHaveAttribute('aria-expanded', 'false')
      expect((await boxOf(folds.nth(i))).y).toBeGreaterThan(f.y)
    }

    // The usual tasks still fill it in one tap, from the field's own list (they were chips).
    await form.locator('.combobox__caret').click()
    await form.locator('.combobox__row').first().click()
    await expect(field).not.toHaveValue('')
  })

  // ── /cercle/carnet/:id ──────────────────────────────────────────────────────────

  const CARNET_FIXTURE = {
    carnets: {
      carnets: [
        {
          id: 'c1',
          parentId: null,
          kind: 'home',
          name: 'La maison',
          mediaKey: null,
          color: '#8a7fd0',
          facts: null,
          installedAt: null,
          lifespanMonths: null,
          linkId: null,
          notes: null,
          sort: 0,
        },
      ],
      soon: [],
    },
  }

  test9('a carnet carries its ＋ in each section header, not as a bar under each list', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, api: { overrides: CARNET_FIXTURE } })
    await page.goto('/cercle/carnet/c1')
    await expect(page.locator('.carnet-block').first()).toBeVisible({ timeout: 15_000 })

    // Ses choses · Historique · Entretien · En cas de pépin — four ＋ chips, all in
    // their header. (Identité has none: it is edited from the scene's ⋯ menu.)
    await expect(page.locator('.carnet-block .sec-label .sec-label__actbtn')).toHaveCount(4)
    // …and none of the old full-width add bars survive.
    await expect(page.locator('.carnet-block > .btn--ghost')).toHaveCount(0)

    // The ＋ still opens what it always opened.
    await page.locator('.carnet-block').filter({ hasText: 'Ses choses' }).locator('.sec-label__actbtn').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test9('a read-only guest gets a carnet with no ＋ at all', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, { signedIn: false, overrides: CARNET_FIXTURE })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/cercle/carnet/c1')
    await expect(page.locator('.carnet-block').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.sec-label__actbtn')).toHaveCount(0)
  })

  // ── /voyage/:id ▸ Itinéraire ────────────────────────────────────────────────────

  // Local midnight in the household zone (America/Toronto), then 20 days on — never
  // Node's own zone, which is UTC on CI and lands the trip a day early there.
  // `addLocalDays` rather than `+ 20 * 86400` for the DST rule (CLAUDE.md).
  const FUTURE = addLocalDays(localDayStart(new Date()), 20)
  const TRIP = {
    trips: {
      trips: [
        {
          id: 'tp1',
          title: 'Gaspésie',
          destination: 'Percé',
          // A five-day trip, in the FUTURE (a finished trip opens on its album, not its
          // itinerary): five composers is exactly the shape this fix is about.
          start_at: FUTURE,
          end_at: FUTURE + 4 * 86_400,
          members: [],
          media_kind: null,
          media_key: null,
          colour: '#2a8f85',
          notes: null,
          position: 0,
          created_at: 1_700_000_000,
          updated_at: null,
        },
      ],
    },
    'trip-notes': { notes: [] },
  }

  test9('the itinerary shows ONE ＋ per day, not a composer under every day', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, api: { overrides: TRIP } })
    await page.goto('/voyage/tp1')
    const days = page.locator('.voyage-itin__day')
    await expect(days).toHaveCount(5, { timeout: 15_000 })

    // Five days, five ＋ chips, ZERO open composers. It used to be five open ones —
    // field + a full-width « ＋ Ajouter » + « Ajouter un document » each, ~180px apiece.
    await expect(page.locator('.voyage-itin__day .sec-label__actbtn')).toHaveCount(5)
    await expect(page.locator('.trip-note-add')).toHaveCount(0)

    // …so the whole itinerary fits where one day's composer used to sit.
    const first = await days.first().boundingBox()
    const last = await days.last().boundingBox()
    expect(last!.y + last!.height - first!.y).toBeLessThan(400)

    // The ＋ opens ONE day's composer, focused, and only that one.
    await days.nth(2).locator('.sec-label__actbtn').click()
    await expect(page.locator('.trip-note-add')).toHaveCount(1)
    await expect(days.nth(2).locator('.trip-note-add input.input')).toBeFocused()

    // Opening another day closes the first — one composer at a time.
    await days.nth(0).locator('.sec-label__actbtn').click()
    await expect(page.locator('.trip-note-add')).toHaveCount(1)
    await expect(days.nth(0).locator('.trip-note-add')).toHaveCount(1)
  })

  // ── /liste/circulaires ──────────────────────────────────────────────────────────

  test9('the flyer scene drops the subtitle its own empty state already says', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/liste/circulaires')
    await expect(page.locator('.deal-tabs')).toBeVisible({ timeout: 15_000 })
    // The header says the name once; the field's placeholder and the empty state below
    // carry the instruction (and the empty state alone explains the chips).
    await expect(page.locator('.scene__head')).not.toContainText('en aubaine cette semaine')
    await expect(page.getByText('Cherche un article, ou touche une suggestion.')).toBeVisible()
  })

  // ── /board ▸ « Aujourd'hui » ─────────────────────────────────────────────────────
  // The card opened with THREE full-width labelled pills — « Planifier aujourd'hui »,
  // « Préparer le repas · <plat> », « Avant de partir » — before a single fact about the
  // day. Two of the three were already small discs in the card's own header, so the body
  // was mostly a duplicate of the chrome above it. « Demain » had the same shape with one
  // pill. The doors live in the header now; the body is the day.
  test9("« Aujourd'hui » leads with the day, not with a stack of buttons", async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    const card = page.locator('.wg-slot[data-card="today"]')
    await expect(card).toBeVisible()

    // No pill row in the body…
    await expect(card.locator('.board-actions')).toHaveCount(0)
    // …and the doors are in the header, as discs.
    const discs = card.locator('.sec-label__act > *')
    await expect(discs).toHaveCount(2) // plan · before-you-leave
    await expect(card.getByLabel(/Planifier aujourd/)).toBeVisible()
    await expect(card.getByLabel(/Avant de partir/)).toBeVisible()

    // Cooking is NOT one of them — it is a ROW, because a disc cannot say what supper
    // is. See the next test9.

    // Each disc holds the 44px touch floor and does not eat its neighbour's: the visible
    // circle is 28px, widened by an invisible ::after, so the GAP has to be ≥ 2× that
    // bleed or the later button swallows a slice of the one before it.
    const gaps = await discs.evaluateAll((els) => {
      const r = els.map((e) => e.getBoundingClientRect())
      return r.slice(1).map((b, i) => Math.round(b.left - r[i]!.right))
    })
    for (const g of gaps) expect(g, 'discs must not overlap their 44px targets').toBeGreaterThanOrEqual(16)
  })

  test9('« Demain » does the same — one door, in the header', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    const card = page.locator('.wg-slot[data-card="tomorrow"]')
    await expect(card).toBeVisible()
    await expect(card.locator('.board-actions')).toHaveCount(0)
    await expect(card.locator('.sec-label__act > *')).toHaveCount(1)
    await expect(card.getByLabel(/Planifier demain/)).toBeVisible()
  })

  test9('on a 320px phone the card header neither clips its title nor bleeds off screen', async ({ page, app }) => {
    // The invariant, not the mechanism. Three 44px touch targets are 132px whatever
    // diameter you draw inside them; add a 26px glyph and a 94px title and a 320px
    // phone's 223px header cannot hold them on one line — it bled off the screen (CI:
    // layout-overflow « lo-board-w320 »). `.sec-label` wraps when it has to, so the
    // title stays whole and the doors stay whole and hard right, on one line or two.
    //
    // Asserting the WRAP itself would be asserting today's door count: the card carries
    // two now (cooking moved to a row that can name the dish), which fits on one line at
    // 320px. What must hold either way is that nothing is clipped and nothing escapes.
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    const head = page.locator('.wg-slot[data-card="today"] .sec-label').first()
    await expect(head).toBeVisible()
    const m = await head.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const b = el.querySelector('b')!
      const act = el.querySelector('.sec-label__act')!.getBoundingClientRect()
      return {
        titleClipped: b.scrollWidth > b.clientWidth + 1,
        actRightGap: r.right - act.right,
        actPastEdge: act.right - r.right,
      }
    })
    expect(m.titleClipped, 'the title reads in full').toBe(false)
    expect(m.actPastEdge, 'nothing bleeds off the header').toBeLessThanOrEqual(0)
    expect(m.actRightGap, 'and the doors stay hard right').toBeLessThan(2)
  })

  test9(`« Aujourd’hui » SAYS what is being cooked — a row, not a bare icon`, async ({ page, app }) => {
    // Reported after the button cull: "meal preparations in Aujourd'hui and Demain
    // widgets are completely gone". They were: « Préparer le repas · <plat> » had become
    // an unlabelled pot in the header, and that line was the ONLY place this card ever
    // named the dish — its own list carries the déjeuner/dîner/collation, while the hero
    // supper lives in « Ce soir ». The button went and took the information with it.
    //
    // The rule the cull was FOR ("information in the board, not buttons") is the same
    // rule that puts it back: a row that names the dish is information, a pot glyph is
    // not.
    await app.boot({ viewport: { width: 390, height: 844 } })
    // Mid-afternoon on purpose: the next meal is then the hero supper (the one carrying
    // a recipe), which is the case this row exists for. Unfrozen it read the real wall
    // clock and went red every evening: past 19 h (souper 17 h 30 + SLOT_GRACE_MIN) the
    // day has moved on to the dessert slot, nothing is planned there, so pickNextMeal
    // falls back to the LAST planned meal — the second souper, which the card already
    // lists — and the row correctly stands down. Zero rows, and the guard read that as a
    // regression. CI caught it; the sibling below was already frozen for the same reason.
    await page.clock.setFixedTime(new Date((MMID + 15 * 3600) * 1000))
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    const card = page.locator('.wg-slot[data-card="today"]')
    const prep = card.locator('.act', { hasText: 'Préparer le repas' })
    await expect(prep).toHaveCount(1)
    // It names the dish, not just the action.
    await expect(prep).toContainText('Spaghetti maison')
    // …and it is a door: tapping goes to cook mode for that recipe.
    await prep.click()
    await expect(page).toHaveURL(/cook$/)
  })

  test9('…and never says it twice', async ({ page, app }) => {
    // The pill this replaces printed « Préparer le repas · X » above a « Collation · X »
    // row for the SAME meal — the duplication visible in the original report. The row
    // stands down when that meal is already listed.
    //
    // The clock is frozen to breakfast time on purpose: the next meal is then the
    // déjeuner, which IS one of the card's own rows (the hero supper never is — it lives
    // in « Ce soir »), so this is the only way to actually exercise the branch. Without
    // the freeze the test passes whether the dedupe exists or not.
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.clock.setFixedTime(new Date((MMID + 7 * 3600) * 1000))
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible' })
    const card = page.locator('.wg-slot[data-card="today"]')
    const prep = card.locator('.act', { hasText: 'Préparer le repas' })
    // WAIT for the row before counting: `allInnerTexts()` reads whatever is on screen at
    // that instant, and on a loaded CI runner the meals had not answered yet — it read
    // [] and failed « named once » with 0 (2026-09-23; reproduced with a 1.5 s API delay).
    await expect(card.locator('.act .title', { hasText: 'Crêpes' }).first()).toBeVisible()
    const titles = await card.locator('.act .title').allInnerTexts()
    const crepes = titles.filter((x) => x.includes('Crêpes'))
    expect(crepes.length, 'the déjeuner is named once, by its own row').toBe(1)
    // …and the prep row stood down rather than repeating it.
    if ((await prep.count()) > 0) await expect(prep).not.toContainText('Crêpes')
  })
})


// ── folded from tap-budget.spec.ts ──────────────────────────────────────────────
test10.describe('tap-budget', () => {
  // ─────────────────────────────── The tap budget ───────────────────────────────
  // C-18 (bmad/08-the-grandma-test10.md): pin the number of TAPS each daily action
  // takes starting from the board, so a redesign can't silently make daily life
  // slower. Every budget below is the MEASURED minimal count of today's real UI —
  // reality, not an aspiration. If a flow legitimately gets FASTER, lower the
  // budget; if a change pushes a flow OVER budget, that's the regression this spec
  // exists to catch — rethink the change before raising the number.
  //
  // Rules (kept honest by the tapCounter helper — taps only ever go through it):
  //   • Every pointer interaction (a click/tap on anything) counts as 1 tap.
  //   • Typing text, filling a native date/time input, and pressing Enter are FREE
  //     — a keyboard isn't a tap, and budgets measure navigation friction, not
  //     how long a title is.
  //   • Each test boots freshly on /board (the kiosk's resting screen) — budgets
  //     measure "from the wall", not "from wherever you already were".
  //
  // Kid mode is deliberately NOT budgeted: the toddler lens is a one-way door
  // that's slow to leave BY DESIGN (see babillard-kid-view-one-way-door), and its
  // picture-card pace is a feature, not friction to minimize.
  //
  // The mock API is static for writes (POSTs succeed, data doesn't change), so
  // flows assert the INTERACTION completed — the request fired, the input
  // cleared, the scene opened — not persisted data.

  // Count taps honestly: every pointer interaction in a flow MUST go through
  // tap(); the final assertion compares the tally to the pinned budget.
  function tapCounter() {
    let taps = 0
    return {
      tap: async (loc: Locator) => {
        taps++
        await loc.click()
      },
      count: () => taps,
    }
  }

  function assertBudget(flow: string, taps: number, budget: number) {
    expect(
      taps,
      `"${flow}" took ${taps} tap(s) — over its pinned budget of ${budget}. ` +
        'A redesign made this daily action slower (C-18, bmad/08). Rework the flow or consciously re-pin the budget.',
    ).toBeLessThanOrEqual(budget)
  }

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  // Fresh boot on /board — same harness as journey-navigation.spec.ts. reducedMotion keeps
  // infinitely-animated elements (toddler float, entrance fades) stable for clicks.

  // ------------------------------------------------------------------ glance: 0

  test10('glance: supper tonight — 0 taps (the board just says it)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    // « Ce soir » is a band card, always on the resting board — the whole point
    // of the wall tablet is that supper costs zero interactions to know.
    const heroes = page.locator('.board-heroes .now-card .what')
    await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
    assertBudget('glance: supper tonight', 0, 0)
  })

  test10('auto: see who has the car — 0 taps (the board card says it)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    // The AutoCard mounts from the CAR fixture (status: Papa holds the car until
    // this evening) — "où est l'auto ?" is answered at a glance, no navigation.
    const status = page.locator('.auto-card__status')
    await expect(status).toBeVisible()
    await expect(status).toContainText('Avec Papa')
    assertBudget('auto: see who has the car', 0, 0)
  })

  // ------------------------------------------------------------------- liste

  test10('liste: check an item — 2 taps (tab + the row toggle)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
    const row = page.locator('.today-feed .list-rows .list-row', { hasText: 'Pain' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await tap(row.locator('.list-row__toggle')) // 2 — check it off (a MARK, in place)
    await expect(page.locator('.list-row__main.done')).toHaveCount(1)
    assertBudget('liste: check an item', count(), 2)
  })

  test10('liste: add an item — 2 taps (tab + field focus; typing + Enter are free)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
    const input = page.locator('.today-feed form.edit-field .input').first()
    await expect(input).toBeVisible({ timeout: 10_000 })
    await tap(input) // 2 — focus the add bar
    await input.fill('beurre')
    await Promise.all([
      page.waitForRequest(isApi('POST', 'list'), { timeout: 20_000 }),
      input.press('Enter'), // free — Enter submits (EditField convention)
    ])
    // addItem() clears the field synchronously — the interaction completed.
    await expect(input).toHaveValue('')
    assertBudget('liste: add an item', count(), 2)
  })

  // Measured: the flyer/deals browser's real front door is on LA LISTE (the visible
  // « Circulaires » shortcut under the add bar → /liste/circulaires). La cuisine has
  // no deals entry point — grocery deals belong to the shopping surface, so the
  // honest path is board → liste → Circulaires = 2 taps. (The ＋ sheet's
  // « Parcourir les circulaires » tile is the slower 3-tap road; the budget pins
  // the fastest one.)
  test10('liste: browse the flyers/deals — 2 taps (tab + the Circulaires shortcut)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.hubnav a[href="/liste"]')) // 1 — the hub tab
    // Scope to the visible shortcut row — the ＋ sheet's (closed) flyer tile shares
    // the same accessible name, so a bare role query is ambiguous.
    const browse = page.locator('.list-actions').getByRole('button', { name: 'Parcourir les circulaires' })
    await expect(browse).toBeVisible({ timeout: 10_000 })
    await tap(browse) // 2 — straight into the deals browser scene
    await expect(page).toHaveURL(/\/liste\/circulaires$/)
    await expect(page.locator('.scene .deals-search')).toBeVisible({ timeout: 10_000 })
    assertBudget('liste: browse the flyers', count(), 2)
  })

  // ------------------------------------------------------------------- kitchen

  test10('supper: cook tonight’s meal — 2 taps (the board hero peeks, then Cuisiner)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    // Re-pinned 1 → 2 on 2026-09-02, deliberately and on Marc's explicit call. « Ce soir »
    // used to land straight ON the recipe view (1 tap). What that cost: a planned meal had
    // NO door back to its day — the recipe view knows nothing about the plan — so every
    // meal peeks now, and the peek carries « Voir la journée » beside « Ouvrir la recette »
    // and the primary « Cuisiner ». A real regression on the kiosk's supper flow, budgeted
    // on purpose: if it must be 1 again, the fix is a surface-scoped useOpenMeal, NOT
    // deleting the day door.
    await tap(page.locator('.now-card__meal').filter({ hasText: 'Spaghetti maison' }).first()) // 1
    const sheet = page.locator('.detail-sheet')
    await sheet.waitFor({ state: 'visible', timeout: 10_000 })
    await expect(sheet.locator('.detail-sheet__actions').getByText('Voir la journée', { exact: true })).toBeVisible()
    await tap(sheet.locator('.detail-sheet__actions .btn--primary')) // 2 — Cuisiner
    await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1\/cook/)
    assertBudget('supper: cook tonight’s meal', count(), 2)
  })

  test10('kitchen: see the week — 1 tap (the hub tab; Repas is the default sub-tab)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.hubnav a[href="/kitchen"]')) // 1 — the hub tab
    const week = page.locator('.kitchen__week')
    await expect(week).toBeVisible({ timeout: 15_000 })
    // The week is real content, not an empty shell — day one carries the supper.
    await expect(week).toContainText('Spaghetti maison')
    assertBudget('kitchen: see the week', count(), 1)
  })

  // ------------------------------------------------------------------- event

  test10('event: add a rendez-vous — 3 taps (＋ FAB + tile + save; typing is free)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.add-fab')) // 1 — the contextual ＋
    await expect(page.locator('.sheet.show')).toBeVisible()
    const tile = page.locator('.cat-pick', { hasText: 'Rendez-vous' })
    await expect(tile).toBeVisible()
    await Promise.all([
      page.waitForURL(/\/event\/new/),
      tap(tile), // 2 — the event tile (navigates to the full-screen scene)
    ])
    const form = page.locator('.scene form.operator__inline-form')
    await form.locator('input.input').first().fill('Rendez-vous coiffeur') // free
    await form.locator('input[type="date"]').fill('2026-07-15') // free (keyboard, not a tap)
    await Promise.all([
      page.waitForRequest(isApi('POST', 'events'), { timeout: 20_000 }),
      tap(form.locator('button[type="submit"]')), // 3 — save
    ])
    assertBudget('event: add a rendez-vous', count(), 3)
  })

  // ------------------------------------------------------------------- routines

  test10('routines: open a routine to run — 2 taps (tab + the card’s ▶ Faire)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    // Routines is Maison's default section, so its hub tab lands straight on the grid.
    await tap(page.locator('.hubnav a[href="/maison"]')) // 1 — the hub tab
    // .first(): the overview renders one grid per moment-of-day group.
    await expect(page.locator('.routines-grid').first()).toBeVisible({ timeout: 15_000 })
    // Measured: each routine card carries a direct ▶ « Faire » run button — the
    // player is 2 taps away, not via the peek (card → peek → Faire would be 3).
    await tap(page.locator('.routine-card__run').first()) // 2 — straight into the player
    await expect(page).toHaveURL(/\/routine\/[^/]+\/run$/)
    await expect(page.locator('.tdl')).toBeVisible({ timeout: 10_000 })
    assertBudget('routines: open a routine to run', count(), 2)
  })

  test10('routines: tapping the CARD runs it too — no peek in between', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    const { tap, count } = tapCounter()
    await tap(page.locator('.hubnav a[href="/maison"]')) // 1 — the hub tab (Routines is its default section)
    await expect(page.locator('.routines-grid').first()).toBeVisible({ timeout: 15_000 })
    // Tap the thing, get the thing. The card body used to open a peek whose buttons
    // were « Faire la routine » / « Modifier » — a menu about the card, when the card
    // already showed the face, the moment, every step picto and carried its own ▶/✎.
    await tap(page.locator('.routine-card').first()) // 2 — the card body itself
    await expect(page).toHaveURL(/\/routine\/[^/]+\/run$/)
    await expect(page.locator('.detail-sheet.show')).toHaveCount(0)
    assertBudget('routines: tap the card to run it', count(), 2)
  })

  // ------------------------------------------------------------------- voyage

  // The default fixture has no trip, so seed one via a route override (registered
  // AFTER mockApi → it wins), the voyage.spec pattern. The clock freezes at BASE so
  // the trip (BASE → BASE+5j) reads as upcoming and the « Prochain voyage » card
  // mounts (it hides itself when nothing's coming — calm).
  test10('voyage: open the next trip — 1 tap (the board card row)', async ({ page, app }) => {
    const DAY = 86400
    const TRIP = {
      id: 'trip1',
      title: 'Vacances en Floride',
      destination: 'Orlando',
      start_at: BASE,
      end_at: BASE + 5 * DAY,
      members: [],
      media_kind: null,
      media_key: null,
      colour: '#5891AC',
      notes: null,
      position: 0,
      created_at: BASE,
      updated_at: null,
    }
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await app.boot({ viewport: { width: 390, height: 844 }, route: '/board', wait: '.board-wall' })
    await page.route('**/api/trips**', (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trips: [TRIP] }) })
        : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }),
    )
    await page.route('**/api/trip-notes**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ notes: [] }) }),
    )
    await page.route('**/api/trip-packing**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }),
    )
    await page.reload() // pick up the trip override on a clean board load
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })

    const { tap, count } = tapCounter()
    const row = page.locator('.voyage-card__open', { hasText: 'Vacances en Floride' })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await tap(row) // 1 — board card row → the trip notebook scene
    await expect(page).toHaveURL(/\/voyage\/trip1$/)
    await expect(page.locator('.scene', { hasText: 'Vacances en Floride' })).toBeVisible({ timeout: 10_000 })
    assertBudget('voyage: open the next trip', count(), 1)
  })
})


// ── folded from section-add.spec.ts ──────────────────────────────────────────────
test11.describe('section-add', () => {
  // SectionAdd — the shared "open this section's composer" ＋. A permanently-open add
  // field is the one thing on a glance surface you can't scan past, and the
  // garde-manger stacked THREE of them (à utiliser bientôt · la réserve · ce qui
  // s'achève) so its whole first screen was fields and the two or three things
  // actually running low sat below the fold.
  //
  // Guards the trade: the fields really are gone until asked for, the ＋ really opens
  // them AND lands the caret (an expand that costs a second tap is worse than the box
  // it replaced), writing really folds them away again, and a read-only guest gets no
  // ＋ at all.

  const openPantry = async (page: Page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto('/kitchen?tab=pantry')
    await page.locator('.hub__body').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'À racheter' })).toBeVisible()
  }

  test11('the garde-manger leads with its lists — every add box waits behind a ＋', async ({ page }) => {
    await openPantry(page)

    // Three sections, three ＋, and not one open field.
    await expect(page.locator('.sec-label__actbtn')).toHaveCount(3)
    await expect(page.locator('.edit-field__input')).toHaveCount(0)

    // Which means the three lists fit one screen: the last section's heading is
    // visible without scrolling (it was pushed under the fold by the composers).
    const heading = page.getByRole('heading', { name: 'À racheter' })
    const inView = await heading.evaluate((el) => {
      const b = el.getBoundingClientRect()
      return b.top >= 0 && b.bottom <= window.innerHeight
    })
    expect(inView, 'the third section fits the first screen').toBe(true)
  })

  test11('the ＋ opens the field focused, and writing folds it away', async ({ page }) => {
    await openPantry(page)

    const plus = page.getByRole('button', { name: 'Ajouter un aliment' }).first()
    await expect(plus).toHaveAttribute('aria-expanded', 'false')
    await plus.click()
    await expect(plus).toHaveAttribute('aria-expanded', 'true')

    // One tap opens AND focuses.
    const field = page.locator('.edit-field__input').first()
    await expect(field).toBeFocused()

    await field.fill('épinards')
    await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/use-soon') && r.method() === 'POST'),
      field.press('Enter'),
    ])
    // Written → folded away, and the section is a list again.
    await expect(plus).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.edit-field__input')).toHaveCount(0)
  })

  test11('a read-only guest gets no ＋ at all', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, { signedIn: false })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/kitchen?tab=pantry')
    await expect(page.getByRole('heading', { name: 'À racheter' })).toBeVisible()

    await expect(page.locator('.sec-label__actbtn')).toHaveCount(0)
    await expect(page.locator('.edit-field__input')).toHaveCount(0)
  })

  test11('La liste’s shortcuts are quiet chips, not full-width bars', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto('/liste')
    await page.locator('.list-rows').waitFor({ state: 'visible', timeout: 15_000 })

    const row = page.locator('.list-actions--quiet')
    await expect(row).toBeVisible()
    // Each shortcut sits at its NATURAL width — none of them claims the whole line
    // (the regression: three solid bars stacked above the list they exist to fill).
    const rowW = (await boxOf(row)).width
    for (const b of await row.locator('.btn').all()) {
      const w = (await boxOf(b)).width
      expect(w, 'a shortcut chip must not span the row').toBeLessThan(rowW * 0.75)
    }
    // …and the first list item still starts above the fold.
    const first = page.locator('.list-rows > *').first()
    const top = (await boxOf(first)).y
    expect(top, 'the list starts on the first screen').toBeLessThan(400)
  })
})
