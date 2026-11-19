import { test, expect } from './fixtures'
import { RECIPES, MMID, mockApi, seedState } from './mocks'
import { openKitEntry } from './kit'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { test as test6, test as test7 } from '@playwright/test'
import { settled } from './measure'

// JOURNEY — ACCESSIBILITY (review #43; was a11y-keyboard.spec.ts + a11y-language.spec.ts + a11y-names.spec.ts + a11y-structure.spec.ts + axe.spec.ts + contrast.spec.ts + action-menu-keys.spec.ts).
//
// Review #34 (2026-11-18; Sam, keyboard + screen reader), each change approved by Marc:
//   · keyboard focus was invisible on « Bon matin » and anywhere a rule removed the outline;
//   · the locked toddler tablet could only be left by a FINGER held 3 s;
//   · the weather card was a role=button holding a real button (« Une autre image »);
//   · a row moved with ↑/↓ moved in silence.

test.describe('a11y-keyboard', () => {
  test('« Bon matin » shows a ring when the keyboard reaches it', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.greet__btn', clock: 'BASE' })
    await page.keyboard.press('Tab')
    await page.locator('.greet__btn').focus()
    await expect(page.locator('.greet__btn')).toHaveCSS('outline-style', 'solid')
  })

  test('the locked toddler tablet: holding Enter for 3 s opens the grown-up gate, releasing early disarms it', async ({ app, page }) => {
    await app.boot()
    await page.goto('/board?kid=1')
    const exit = page.locator('.kid-exit-switch')
    // A press arms the hold (the fill bar runs); releasing early disarms it.
    await exit.focus()
    await page.keyboard.down('Enter')
    await expect(exit).toHaveClass(/is-holding/)
    await page.keyboard.up('Enter')
    await expect(exit).not.toHaveClass(/is-holding/)
    await expect(page.locator('.kid-exit-modal')).toHaveCount(0)

    await exit.focus()
    await page.keyboard.down('Enter')
    await expect(page.locator('.kid-exit-modal')).toBeVisible({ timeout: 6000 })
    await page.keyboard.up('Enter')
  })

  test('the weather card is ONE named control; the ⟳ is its sibling, not inside it', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.now-card--wx', clock: 'BASE' })
    const card = page.getByRole('button', { name: /^Voir la météo et l’image du jour — / })
    await expect(card).toBeVisible()
    await expect(card.locator('button')).toHaveCount(0)
  })

  test('a row moved with ↓ says where it landed', async ({ app, page }) => {
    await app.boot({ clock: 'BASE' })
    await page.goto('/settings?tab=display&sub=layout')
    const band = page.locator('.board-layout').first()
    await band.waitFor({ state: 'visible', timeout: 15_000 })
    const rows = band.locator('.board-layout__row')
    const total = await rows.count()
    const name = (await rows.first().locator('.board-layout__name').innerText()).trim()
    await rows.first().locator('.dnd-grip').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('#sr-announce')).toHaveText(`${name}, position 2 sur ${total}`)
    await expect(page.locator('#sr-announce')).toHaveAttribute('aria-live', 'polite')
  })
})

// ── folded from a11y-language.spec.ts ──────────────────────────────────────────────
test.describe('a11y-language', () => {
  // Review #35 (2026-11-18; Sam, screen reader), each change approved by Marc:
  //   · the page said lang="fr" (a France voice) and never marked an English recipe;
  //   · repeated buttons said the same thing (« J'aime » on every heart, three « Écouter :
  //     1/2 tasse »), and who added a list item was a colour.

  test('the page is fr-CA, or en-CA from the first load of an English household', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE' })
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA')
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', state: { lang: 'en' } })
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-CA')
  })

  test('an English recipe in a French app carries lang="en"; its pills name the ingredient', async ({ app, page }) => {
    const recipes = { ...RECIPES, recipes: RECIPES.recipes.map((r) => (r.id === 'rc1' ? { ...r, lang: 'en' as const } : r)) }
    await app.boot({ route: '/kitchen/recipe/rc1', wait: '.recipe-modal', clock: 'BASE', api: { overrides: { recipes } } })
    await expect(page.locator('.recipe-modal')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('button', { name: /^Écouter : 1 c\. à thé — sel$/ })).toBeVisible()
  })

  test('a heart names its recipe, and a list row names who added it', async ({ app, page }) => {
    // The heart is a toggle only once a face is picked (as Maisonnée, hearts are read-only).
    await page.addInitScript(() => localStorage.setItem('babillard-profile', 'm1'))
    await app.boot({ route: '/kitchen?tab=recipes', wait: '.recipe-card', clock: 'BASE' })
    await expect(page.getByRole('button', { name: /— Spaghetti maison$/ }).first()).toHaveAttribute('aria-pressed', /true|false/)

    await page.goto('/liste')
    await expect(page.locator('.list-row', { hasText: 'Lait' }).first().locator('.sr-only', { hasText: 'ajouté par' })).toHaveText(', ajouté par Maman')
  })
})


// ── folded from a11y-names.spec.ts ──────────────────────────────────────────────
test.describe('a11y-names', () => {
  // Review #32 (2026-11-18; Sam, screen reader + keyboard):
  //   · Réglages toggles were named by their STATE alone (« Activée, bouton bascule ») —
  //     never WHAT is on. SettingsRow now names its row and Toggle borrows that name.
  //   · The search-and-pick field broke the combobox pattern: Tab walked every option,
  //     tabbing past the field opened it, Esc on an option did nothing, headings named no
  //     group, and a link sat inside the listbox.

  test('a Réglages toggle says WHAT it turns on, and its row is a named group', async ({ app, page }) => {
    await app.boot({ route: '/settings?focus=ambient', wait: '.operator' })
    const row = page.getByRole('group', { name: 'Ambiance du jour' })
    await expect(row).toBeVisible()
    const toggle = row.getByRole('button', { name: /^Ambiance du jour / })
    await expect(toggle).toHaveAttribute('aria-pressed', /true|false/)
  })

  test('the picker: Tab passes it by, ↓ opens it, options are not tab stops, Esc closes, headings name groups', async ({ app, page }) => {
    await app.boot({ viewport: { width: 1024, height: 800 } })
    await page.goto('/dev/kit')
    const entry = await openKitEntry(page, 'EntityCombobox')
    const input = entry.getByRole('combobox').first()
    await input.waitFor({ state: 'visible', timeout: 15_000 })

    // Reached by Tab: stays closed (it opened on any focus before).
    await input.focus()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await expect(input).toHaveAttribute('aria-expanded', 'false')

    // ↓ opens; the options are reached by the arrows, never by Tab.
    await page.keyboard.press('ArrowDown')
    await expect(input).toHaveAttribute('aria-expanded', 'true')
    const list = page.getByRole('listbox')
    await expect(list.getByRole('option')).toHaveCount(4)
    await expect(list.locator('[role="option"]:not([tabindex="-1"])')).toHaveCount(0)
    await expect(list.getByRole('group', { name: 'Recettes' }).getByRole('option')).toHaveCount(2)
    await expect(list.locator('a')).toHaveAttribute('aria-hidden', 'true')
    await expect(list.locator('a')).toHaveAttribute('tabindex', '-1')

    // Esc closes and keeps the caret in the field.
    await page.keyboard.press('Escape')
    await expect(input).toHaveAttribute('aria-expanded', 'false')
    await expect(input).toBeFocused()

    // A tap still opens it — the phone flow is unchanged.
    await input.click()
    await expect(input).toHaveAttribute('aria-expanded', 'true')
  })
})


// ── folded from a11y-structure.spec.ts ──────────────────────────────────────────────
test.describe('a11y-structure', () => {
  // Review #33 (2026-11-18; Sam, screen reader), each change approved by Marc:
  //   · the board's heading list held the H1 and nothing else; a scene started at H2 and
  //     left the browser tab saying « Babillard »;
  //   · empty cards were still named regions, and « Dessins » sat inside « Dessins »;
  //   · the month grid had no rows, named its cells « 4 », and was ~30 Tab stops;
  //   · sub-tabs had no panel to control.

  test('board cards are headings, and an empty card is not a named region', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE' })
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    expect(await page.getByRole('heading', { level: 2 }).count(), 'one per card on screen').toBeGreaterThan(3)
    await expect(page.locator('section.wg-slot[data-empty][aria-label]')).toHaveCount(0)
  })

  test('a scene is the page: its title is the H1 and names the browser tab', async ({ app, page }) => {
    await app.boot({ route: '/kitchen/recipe/rc1', wait: '.scene__head-title', clock: 'BASE' })
    const h1 = page.locator('h1.scene__head-title')
    await expect(h1).toBeVisible()
    const name = (await h1.innerText()).trim()
    await expect(page).toHaveTitle(`${name} · Babillard`)
  })

  test('the month grid: week rows, full day names, ONE Tab stop the arrows walk', async ({ app, page }) => {
    await app.boot({ route: '/board?view=month', wait: '.monthv__grid', clock: 'BASE' })
    const grid = page.getByRole('grid')
    expect(await grid.getByRole('row').count(), 'a header row and the weeks').toBeGreaterThanOrEqual(6)
    await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1)
    const first = grid.locator('[role="gridcell"][tabindex="0"]')
    await expect(first).toHaveAttribute('aria-label', / — /)
    const day = Number(await first.getAttribute('data-day'))
    await first.focus()
    await page.keyboard.press('ArrowRight')
    const next = page.locator(':focus')
    await expect(next).toHaveAttribute('role', 'gridcell')
    expect(Number(await next.getAttribute('data-day'))).toBeGreaterThan(day)
    await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    const below = Number(await page.locator(':focus').getAttribute('data-day'))
    expect(below - day, 'one week and one day on').toBeGreaterThan(7 * 86400 - 7200)
  })

  test('La cuisine’s sub-tabs control a panel named by the selected tab', async ({ app, page }) => {
    await app.boot({ route: '/kitchen', wait: '.kitchen', clock: 'BASE' })
    await expect(page.getByRole('tabpanel', { name: 'Repas' })).toBeVisible()
    await page.getByRole('tab', { name: 'Recettes' }).click()
    await expect(page.getByRole('tabpanel', { name: 'Recettes' })).toBeVisible()
    const tab = page.getByRole('tab', { name: 'Recettes' })
    await expect(page.locator(`#${await tab.getAttribute('aria-controls')}`)).toHaveAttribute('role', 'tabpanel')
  })
})


// ── folded from axe.spec.ts ──────────────────────────────────────────────
test.describe('axe', () => {
  // THE WHOLE WCAG A + AA SET, HELD (solidify 7.4, 2026-11-05). contrast.spec holds one rule
  // at zero. The matrix runs all of them and only prints. So a violation here fails unless
  // e2e/axe-allow.json names its rule, its surface and a reason, and that file only shrinks
  // (docBudget pins its size). Contrast stays in contrast.spec, which walks both themes and
  // both roles. Plant: remove an entry.
  const SURFACES = [
    { name: 'board', route: '/board' },
    { name: 'kitchen', route: '/kitchen' },
    { name: 'recipes', route: '/kitchen?tab=recipes' },
    { name: 'liste', route: '/liste' },
    { name: 'notes', route: '/notes' },
    { name: 'maison', route: '/maison' },
    { name: 'famille', route: '/maison?section=family' },
    { name: 'settings', route: '/settings' },
    { name: 'settings-systeme', route: '/settings?tab=settings' },
    { name: 'day-plan', route: `/kitchen/day/${MMID}` },
    { name: 'recipe-view', route: '/kitchen/recipe/rc1' },
    { name: 'form-recipe', route: '/kitchen/recipe/new' },
    { name: 'form-virement', route: '/virement/new' },
    { name: 'form-routine', route: '/routine/r1' },
    { name: 'trips', route: '/voyage' },
    { name: 'search', route: '/search?q=lait' },
  ]

  interface Allowed {
    rule: string
    surface: string
    reason: string
  }
  const allowed: Allowed[] = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'axe-allow.json'), 'utf8'))

  test('no unlisted WCAG A/AA violation across the app', async ({ page, app }) => {
    test.setTimeout(SURFACES.length * 8_000)
    await app.boot({ route: '/board', wait: '.hub' })
    const found: string[] = []
    for (const s of SURFACES) {
      await page.goto(s.route)
      await expect(page.locator('.loading, .skeleton')).toHaveCount(0, { timeout: 15_000 })
      const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast'])
        .analyze()
      for (const v of res.violations) {
        if (allowed.some((a) => a.rule === v.id && (a.surface === s.name || a.surface === '*'))) continue
        found.push(`${s.name}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      }
    }
    expect(found).toEqual([])
  })
})


// ── folded from contrast.spec.ts ──────────────────────────────────────────────
test6.describe('contrast', () => {
  // WCAG AA CONTRAST, ACROSS THE APP, IN BOTH THEMES AND BOTH DEVICE ROLES — a ratchet
  // at zero.
  //
  // This app is read on a wall tablet from across a kitchen, so contrast is closer to a
  // product requirement here than to a compliance box. Nothing measured it until the axe
  // pass landed in `npm run e2e:matrix` (2026-09-14), which found `color-contrast` on 78
  // of 154 states.
  //
  // Cleaned out 2026-09-15. Twelve distinct colour pairs by day, ten by night — which
  // came down to five root causes, every one of which already had a correct answer
  // elsewhere in this codebase:
  //
  //   • `opacity` used to make a line read as SECONDARY. On tinted ink over a pale ground
  //     that walks it TOWARD the ground, the one direction that costs legibility. The
  //     board's hero labels, the fridge-note age stamp, the cercle group's kind badge.
  //     They mix toward `--ink` now, which reads just as quiet and moves the other way.
  //   • a `-deep` token used as TEXT. core.css states the rule in the palette itself:
  //     "Text NEVER uses a -deep on a wash: that's what the -ink tier below is for
  //     (4.5:1)." Broken in four places — the kitchen day headers, Découvrir's « en
  //     savoir plus », the Maisonnée pill, « Notre monde »'s launcher.
  //   • a hard-coded `#fff` on an arbitrary tint — the routine card's « Faire » button,
  //     at 2.03:1, a primary action nobody could read. It takes `readableInk()` through a
  //     CSS var now, and its ground is exactly the colour that ink was chosen for.
  //   • `readableInk` handing back the WORSE of its two inks for eleven palette colours.
  //   • `tintInk`'s ramp, hand-picked before anything measured it, leaving the brighter
  //     tints near 4.0:1.
  //
  // The last two are pure functions, held by colors.test.ts. The rest are held here,
  // because only a browser can composite a translucent wash over a daypart paper.
  //
  // WHY axe RATHER THAN OUR OWN ARITHMETIC: the first version of this computed its own
  // ratios and got them wrong. It walked ancestors for a background with alpha > 0.5 —
  // which steps straight over a `wash()` at 13% alpha — so it measured text against the
  // PAGE instead of its card, and reported 11.78:1 where axe had 3.02:1. Its red and its
  // green were both fiction. axe composites layered translucency, honours opacity, knows
  // the large-text tier, and is the same engine the matrix sweep reports from, so the two
  // can no longer disagree.
  //
  // A surface added here that cannot reach zero should be FIXED, not excluded — and if it
  // truly must be, exclude the selector with its reason, never the route.
  const SURFACES = [
    { name: 'board', route: '/board' },
    { name: 'kitchen', route: '/kitchen' },
    { name: 'recipes', route: '/kitchen?tab=recipes' },
    { name: 'liste', route: '/liste' },
    { name: 'notes', route: '/notes' },
    { name: 'virements', route: '/notes?section=virements' },
    { name: 'maison', route: '/maison' },
    { name: 'famille', route: '/maison?section=family' },
    { name: 'settings', route: '/settings' },
    // The day planner, a route of its own rather than a tab — and the one the matrix
    // sweep kept reporting while this file said zero. It STILL said zero for the wrong
    // reason until 2026-09-30: the route takes a unix day, an ISO date bounces to /kitchen,
    // and the sweep measured the kitchen twice. The URL check below now catches that.
    { name: 'day-plan', route: `/kitchen/day/${MMID}` },
    // SCENES. Full-screen routes are where half the remaining debt lived, because a tab
    // sweep never opens them: a selected chip at 2.07:1 on the recipe form, a delete
    // button at 4.06, a deal's « choisir » at 2.79, a recipe tag at 4.26.
    { name: 'form-recipe', route: '/kitchen/recipe/new' },
    { name: 'form-virement', route: '/virement/new' },
    //
    // `fresh` is where an EMPTY household goes instead: a scene that opens one record
    // bounces to its tab when that record does not exist, and until 2026-09-30 the fresh
    // pass measured /maison, /kitchen and /liste under these three names. The routine
    // form has an empty twin; a recipe or a deal an empty household does not own has none.
    { name: 'form-routine', route: '/routine/r1', fresh: '/routine/new' },
    { name: 'recipe-view', route: '/kitchen/recipe/rc1', fresh: null },
    { name: 'price-match', route: '/liste/deals/l1', fresh: null },
    { name: 'monde', route: '/cercle/monde' },
    { name: 'social', route: '/maison?section=social' },
    { name: 'kitchen-history', route: '/kitchen?tab=history' },
    // Réglages' themed tabs each carry their own sub-pill row; the top-level route only
    // ever paints ONE of them, and the active pill was failing on the others.
    { name: 'settings-kitchen', route: '/settings?tab=kitchen' },
    { name: 'settings-systeme', route: '/settings?tab=settings' },
  ] as const

  // THE EMPTY HOUSEHOLD IS A REAL STATE, AND IT WAS THE BLIND SPOT.
  //
  // Nine of the sweep's remaining hits were `.empty-state__guide` — a colour that only
  // exists when there is nothing to show, which a seeded fixture never renders. A
  // household's FIRST five minutes is exactly when it can least afford unreadable text.
  const FIXTURES = [
    { name: 'seeded', fresh: false },
    { name: 'fresh', fresh: true },
  ] as const

  // BOTH ROLES, because a kiosk is not a wide phone: it renders different components
  // (MemberSwitcher in place of FaceSelect, the wall lens on several tabs), so it paints
  // colours a mobile-only run never reaches. That is not theoretical — adding the kiosk
  // pass is what caught « Notre monde »'s launcher at 3.2:1, on a control that only the
  // wall lens renders. This file absorbed a board-only contrast spec rather than letting
  // two guards claim one job.
  for (const theme of ['day', 'night'] as const) {
    for (const surface of ['mobile', 'kiosk'] as const) {
      for (const fixture of FIXTURES) {
        test6(`no WCAG AA contrast failures across the app @${surface}-${theme}-${fixture.name}`, async ({ page }) => {
          // THE BUDGET IS PER SURFACE, not per test6 (2026-09-30). One test walks every
          // route above at ~2.2 s each (goto + load gate + the 700 ms beat + axe), so 22
          // surfaces cost ~48 s — past the suite's 45 s default. The weekly flake hunt
          // timed out 18 to 22 surfaces in, on whichever route happened to be next; the
          // trace showed no page slow, only the sum. Adding a surface now buys its time.
          test6.setTimeout(SURFACES.length * 5_000)
          await page.setViewportSize(surface === 'kiosk' ? { width: 1280, height: 800 } : { width: 390, height: 844 })
          await mockApi(page, { fresh: fixture.fresh })
          await seedState(page, { theme, audience: 'parent', lang: 'fr', surface })

          const failures: string[] = []
          for (const s of SURFACES) {
            const route = fixture.fresh && 'fresh' in s ? s.fresh : s.route
            if (route === null) continue
            await page.goto(route)
            // WAIT FOR THE PAGE, NOT FOR A CLOCK (2026-09-30). This used to be the 700ms
            // beat below on its own, and on a cold CI runner the lazy route chunk can take
            // longer than that: the board was measured on its `<Loading>` fallback and
            // painted exactly 11 characters — « Chargement… ». Wait until neither
            // `Loading` nor a `Skeleton` is on screen; THEN the beat, for the cards that
            // fade their content in.
            await expect(page.locator('.loading, .skeleton'), `${s.name} finished loading`).toHaveCount(0, {
              timeout: 15_000,
            })
            await settled(page)
            // A route that bounces measures some OTHER page and reads green (day-plan did).
            // Read AFTER the page settled: a lazy scene bounces only once it has loaded and
            // judged its params, so a check right after goto() passes on the old URL.
            const at = new URL(page.url())
            expect(at.pathname + at.search, `${s.name} stayed put`).toBe(route)
            // A FALSE GREEN IS THE FAILURE MODE: an empty page reports no violations, so a
            // route that stopped rendering would read as a pass forever. Assert painted
            // TEXT rather than a container — the first version listed `main, .hub__body,
            // .scene` and every scene route failed it, because a form scene's root is
            // none of those. A text floor is route-agnostic and is what contrast is
            // measured on anyway.
            const painted = await page.evaluate(() => (document.body?.innerText ?? '').trim().length)
            expect(painted, `${s.name} painted readable text`).toBeGreaterThan(40)

            const res = await new AxeBuilder({ page })
              // THE ONE EXCLUSION, and it is a real gap rather than a clean pass.
              //
              // `.avatar__initial` is a single letter on a member's own colour, and for a
              // mid-tone neither of our two inks clears 4.5:1 — sky-deep gives 4.26 with
              // the dark ink and ~3.3 with the cream. Darkening the disc does not help:
              // measured across the palette it only moves WHICH colour is worst (3.8–3.9
              // whatever the mix). The only real fixes are to change the identity colours
              // or to make the glyph large text (it renders at 18px bold, 0.66px under
              // WCAG's 18.66px bar) — a palette decision, not a passing note in a spec.
              //
              // What HAS improved: it was a hard-coded white (3.46:1) and now takes
              // `readableInk()`, so it is as good as these colours allow. Delete this
              // exclusion, don't grow it.
              .exclude('.avatar__initial')
              .withTags(['wcag2a', 'wcag2aa'])
              .analyze()
            for (const v of res.violations.filter((x) => x.id === 'color-contrast')) {
              for (const n of v.nodes) {
                const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number }
                failures.push(`  ${s.name}: ${d.contrastRatio}:1  ${d.fgColor} on ${d.bgColor}  — ${n.target.join(' ')}`)
              }
            }
          }
          expect(failures, 'text below WCAG AA, with the colours axe measured:\n' + failures.join('\n')).toEqual([])
        })
      }
    }
  }

  // THE DAY-PART PALETTES (review #22, 2026-11-17). The two passes above pin the drift OFF
  // (seedState), so the six palettes a kiosk actually wears through the day were never
  // measured — and Sam found « Bientôt » at 1.53:1 in twilight and « Le point du jour » at
  // 2.83:1, every evening, without anyone choosing it. Here the REAL drift runs: auto on,
  // the clock stopped inside each part (Toronto, where the mock's midnights live), the hub
  // tabs on a phone. Same axe, same exclusion, same zero.
  const DAYPARTS = [
    { part: 'dawn', hour: 6.5 },
    { part: 'noon', hour: 12 },
    { part: 'afternoon', hour: 15 },
    { part: 'dusk', hour: 17.5 },
    { part: 'twilight', hour: 19 },
    { part: 'deep-twilight', hour: 19.75 },
  ] as const
  const HUB = SURFACES.filter((s) => ['board', 'kitchen', 'recipes', 'liste', 'notes', 'maison', 'famille', 'settings'].includes(s.name))

  test6.describe('day-part palettes', () => {
    test6.use({ timezoneId: 'America/Toronto' })
    for (const { part, hour } of DAYPARTS) {
      test6(`no WCAG AA contrast failures on the hub tabs @mobile-${part}`, async ({ page }) => {
        test6.setTimeout(HUB.length * 5_000)
        await page.setViewportSize({ width: 390, height: 844 })
        await page.clock.setFixedTime(new Date((MMID + hour * 3600) * 1000))
        await mockApi(page)
        await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
        // After seedState's « drift off »: the drift is the thing under test6.
        await page.addInitScript(() => localStorage.setItem('babillard-daypart-auto', '1'))
        const failures: string[] = []
        for (const s of HUB) {
          await page.goto(s.route)
          await expect(page.locator('.loading, .skeleton'), `${s.name} finished loading`).toHaveCount(0, { timeout: 15_000 })
          await settled(page)
          // The palette really is the part's: a drift that stayed off would measure « day ».
          expect(await page.evaluate(() => document.documentElement.dataset.daypart), `${s.name} wears ${part}`).toBe(part)
          const res = await new AxeBuilder({ page }).exclude('.avatar__initial').withTags(['wcag2a', 'wcag2aa']).analyze()
          for (const v of res.violations.filter((x) => x.id === 'color-contrast')) {
            for (const n of v.nodes) {
              const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number }
              failures.push(`  ${s.name}: ${d.contrastRatio}:1  ${d.fgColor} on ${d.bgColor}  — ${n.target.join(' ')}`)
            }
          }
        }
        expect(failures, `text below WCAG AA in ${part}:\n` + failures.join('\n')).toEqual([])
      })
    }
  })
})


// ── folded from action-menu-keys.spec.ts ──────────────────────────────────────────────
test7.describe('action-menu-keys', () => {
  // Keyboard reachability of the shared ⋯ overflow menu (components/ActionMenu.tsx).
  //
  // The menu is the standing answer to "this surface has too many buttons" — a
  // recipe footer, a contact peek, a meal row, a deal card all fold their long tail
  // into it. That makes it a keyboard chokepoint: if the ⋯ is the ONLY door to
  // « Supprimer », then a menu a keyboard can open but not walk has hidden those
  // actions from every non-touch user (the desktop-reachability rule in CLAUDE.md).
  //
  // The panel is portaled to <body> — the LAST node in the document — so Tab from
  // the trigger does NOT land in it. Focus has to be pulled in deliberately, and it
  // is: useModal's focus trap. But the panel spends its first layout pass
  // `visibility:hidden` while it's measured for placement, and a visibility:hidden
  // element cannot take focus — so the pull has to survive that pass.
  //
  // Guards: opening puts focus on the first item, ↑/↓ walk (and wrap), Escape closes
  // and hands focus back to the ⋯. Driven off the /dev/kit specimen so the assertions
  // are about the primitive itself, not any one caller's item list.

  const ITEMS = ['Ajouter à la liste', 'Partager', 'Modifier', 'Supprimer']

  test7('the ⋯ overflow menu opens, walks and closes on the keyboard', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.setViewportSize({ width: 1024, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/dev/kit')

    const entry = await openKitEntry(page, 'ActionMenu')
    const trigger = entry.locator('.action-menu__btn')
    await trigger.waitFor({ state: 'visible', timeout: 15_000 })

    // Open with the keyboard, the way a keyboard user would.
    await trigger.focus()
    await page.keyboard.press('Enter')
    const panel = page.locator('.action-menu__panel')
    await expect(panel).toBeVisible()

    // Focus lands INSIDE the panel, on its first item — not left behind on the ⋯
    // (from where Tab would walk the page, never the menu).
    const active = () => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
    await expect.poll(active).toBe(ITEMS[0])

    // ↓ walks down and wraps past the last row; ↑ walks back up.
    await page.keyboard.press('ArrowDown')
    expect(await active()).toBe(ITEMS[1])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect(await active()).toBe(ITEMS[3])
    await page.keyboard.press('ArrowDown')
    expect(await active()).toBe(ITEMS[0])
    await page.keyboard.press('ArrowUp')
    expect(await active()).toBe(ITEMS[3])

    // Escape closes the MENU and hands focus back to its opener.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()

    expect(errors).toEqual([])
  })
})
