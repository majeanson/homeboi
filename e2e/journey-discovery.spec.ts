import { test, expect } from './fixtures'
import { mockApi, seedState } from './mocks'
import { boxOf, settled } from './measure'
import { type Locator, type Page, test as test5, test as test6 } from '@playwright/test'

// JOURNEY — DISCOVERY (FROZEN) (review #43; was help.spec.ts + help-every-tap.spec.ts + tour-nav.spec.ts + section-intro.spec.ts + lexicon.spec.ts + empty-doors.spec.ts).
//
// Contextual help: the section identity disc (SectionAvatar, class `.avatar--help`
// with a corner "?" pip — HelpDot folded into the icon) deep-links into the Guide
// at the matching card; an Expert switch in Réglages ▸ Affichage hides the help
// affordance. Both run frontend-only against mocked APIs.

test.describe('help', () => {
  test('the contextual ? deep-links into the matching Guide card', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', wait: '.hub, .operator' })
    const dot = page.locator('.avatar--help').first()
    await expect(dot).toBeVisible()
    await dot.click()
    // The ?card= deep-link homes onto the card's THEMED Réglages tab (Comprendre
    // lens); the card param is consumed (replaced), pinning tab+lens in the URL.
    await expect(page).toHaveURL(/\/settings\?tab=kitchen&lens=comprendre$/)
    // The Kitchen card is the one opened + highlighted, scrolled into view.
    const target = page.locator('.guide__card.is-target')
    await expect(target).toBeVisible()
    await expect(target).toHaveAttribute('open', '')
    await expect(target).toContainText('cuisine')
  })

  // Wave H (F5×D7): the « Mots » board card (the fridge, since 0142) carries an in-place « ? » help entry —
  // arm the board's help mode, tap the card title, get a bubble that deep-links to the
  // mots guide card. (Mots is a Section/div card, so the armed title explains in place
  // rather than navigating.)
  test('board ? explains « Mots » in place and links to its guide', async ({ page }) => {
    // « Mots » is the fridge card since 0142 — the board fixture's two papers make it render
    // at rest, so no per-test override is needed any more.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => {
      try {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      } catch {
        /* noop */
      }
    })
    await page.goto('/board')
    await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
    // Arm the board's help mode (the round "?" toggle in the header).
    const toggle = page.locator('.help-toggle').first()
    await expect(toggle).toBeVisible()
    await toggle.click()
    // The « Mots » card title is now a help target; tapping it explains the card in place.
    const title = page.locator('.help-title', { hasText: 'Mots' })
    await expect(title).toBeVisible()
    await title.click()
    // The armed title renders the bubble both beside the card and at board level — take the first.
    const bubble = page.locator('.help-bubble').first()
    await expect(bubble).toBeVisible()
    // « Voir le guide » deep-links to the mots guide card (no navigation off the board first).
    // « Voir le guide » opens the card over the screen (review #20); its foot link deep-links as before.
    await bubble.locator('.help-bubble__guide').click()
    await page.locator('.guide-sheet .guide-sheet__more').click()
    await expect(page).toHaveURL(/card=mots/)
  })

  test('tutorial vs expert mode shows / hides the ? dots', async ({ page, app }) => {
    // Tutorial is the default: the dot shows.
    await app.boot({ route: '/liste', wait: '.hub, .operator' })
    await expect(page.locator('.avatar--help')).toHaveCount(1)

    // Flip to expert in Réglages ▸ Affichage.
    await page.goto('/settings?tab=display')
    await page.locator('.operator__tabs').waitFor({ state: 'visible' })
    await page.getByRole('radio', { name: /Expert/ }).click()

    // Back on a hub page, every dot is gone.
    await page.goto('/liste')
    await page.locator('.hub').first().waitFor({ state: 'visible' })
    await expect(page.locator('.avatar--help')).toHaveCount(0)
  })

  // The bubble opens IN PLACE, at whatever heading you tapped — and on a phone the bottom
  // nav is a fixed overlay. A heading in the lower third therefore opened a bubble whose
  // FOOT was behind it: measured 2026-09-21 in Réglages ▸ Système at 390×844, the nav
  // starts at y≈772 and the bubble ran 587→844, so « Voir le guide » and « Signaler » were
  // rendered but covered. Nothing scrolled, because the element WAS in view by the
  // browser's definition — it intersects the viewport, it is merely obscured.
  //
  // This is the assertion that would have caught it: not "is the bubble visible" (it was)
  // but "is its LAST door above the nav".
  test('an armed bubble lands clear of the bottom nav, doors and all', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=settings&lens=regler&sub=tablets')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.operator__lensrow .help-toggle').click()
    await page.locator('.help-title').first().click()

    const bubble = page.locator('.help-bubble').first()
    await expect(bubble).toBeVisible()
    // The title is the section's FRENCH heading, never the raw registry key. Fifteen keys
    // had no label and fell through to themselves (`devices`, `members`, `chores`…);
    // src/lib/operatorHelpCoverage.test.ts holds the list, this holds the screen.
    await expect(bubble.locator('.help-bubble__title')).not.toHaveText(/^[a-z]+$/)

    const doors = bubble.locator('.help-bubble__guide, .help-bubble__report')
    await expect(doors).toHaveCount(2)
    const nav = await boxOf(page.locator('.hub__nav, nav').first())
    for (let i = 0; i < 2; i++) {
      const box = await boxOf(doors.nth(i))
      expect(box.y + box.height, 'a bubble door is under the bottom nav').toBeLessThan(nav.y)
    }
    // …and they do not touch: two inline-flex siblings with no gap rendered as
    // « Voir le guide →Signaler ». They live in a Cluster now, which owns the gap.
    const a = await boxOf(doors.nth(0))
    const b = await boxOf(doors.nth(1))
    expect(b.x - (a.x + a.width), 'the two doors are touching').toBeGreaterThan(3)
  })

  // Every board card answers the « ? » (solidify 4.3): armed, a tap on a card with no heading
  // of its own explains it, in place, and does NOT do what the card normally does.
  test('armed, a tap on a board card explains it right under the card', async ({ page, app }) => {
    await app.boot({ route: '/board', wait: '.hub, .operator' })
    await page.locator('.help-toggle').first().click()
    const slot = page.locator('.wg-slot--explain').first()
    await expect(slot).toBeVisible()
    const url = page.url()
    await slot.click()
    await expect(page.locator('.wg-help .help-bubble')).toBeVisible()
    expect(page.url()).toBe(url)
  })
})

// ── folded from help-every-tap.spec.ts ──────────────────────────────────────────────
test.describe('help-every-tap', () => {
  // Review #20 (2026-11-17), Thérèse on the board with « ? » armed:
  //   · tapping the meal row opened its real sheet (« Retirer du plan »), no explanation;
  //   · the « Ce soir » bubble popped up at the foot of the screen, over another card;
  //   · help seemed to switch itself off after one tap (the hint bar vanished);
  //   · « Voir le guide » walked off to Réglages.
  // Now: every tap in a card explains that card, beside the finger; the bar stays; the
  // guide card opens over the board.

  test('armed, a tap in a card explains it beside the finger, and help stays on', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', viewport: { width: 390, height: 844 } })
    await page.locator('.help-toggle').first().click()
    await expect(page.locator('.help-hint')).toBeVisible()

    // A control INSIDE « Aujourd'hui » that is not a help target of its own.
    const row = page.locator('.wg-slot[data-card="today"] button:not(.help-title)').first()
    await expect(row).toBeVisible()
    const r = await boxOf(row)
    await row.click()
    await expect(page.locator('.sheet.show.detail-sheet')).toHaveCount(0)
    const bubble = page.locator('.help-bubble--float')
    await expect(bubble).toBeVisible()
    // Beside the tap: its top within a bubble's height of the finger.
    const b = await boxOf(bubble)
    expect(Math.abs(b.y - (r.y + r.height / 2))).toBeLessThan(b.height + 40)
    // Still armed.
    await expect(page.locator('.help-hint')).toBeVisible()

    // « Voir le guide » opens the card over the board, not Réglages.
    await bubble.locator('.help-bubble__guide').click()
    await expect(page.locator('.guide-sheet')).toBeVisible()
    await expect(page).toHaveURL(/\/board/)
  })
})


// ── folded from tour-nav.spec.ts ──────────────────────────────────────────────
test.describe('tour-nav', () => {
  // Regression: the guided tour must NOT swallow taps. Its step 2 spotlights the
  // bottom nav (data-tour="hubnav"); before the fix the full-screen scrim caught
  // all pointer input, so tapping the highlighted nav did nothing ("navigating the
  // footer, nothing happens"). The scrim is now non-blocking (pointer-events:none),
  // so the nav works while the tour rides along. This test proves both: the tour
  // auto-starts for a signed-in parent, AND a nav tap navigates with it up.

  test('guided tour does not block the bottom nav', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, state: { calm: true, tour: true }, route: '/board' }) // tour NOT marked seen → the essentials tour auto-starts
    // The tour auto-launches (centred welcome card first). This is the diagnosis.
    await page.locator('.tour').waitFor({ state: 'visible', timeout: 10_000 })

    // The bottom nav is dimmed behind the scrim — but a tap must still land.
    await page.locator('.hubnav a[href="/kitchen"]').click()
    await expect(page).toHaveURL(/\/kitchen$/)

    // And the tour is still riding along (not dismissed by the navigation).
    await expect(page.locator('.tour')).toBeVisible()
  })

  test('a section tour walks INSIDE the ＋ sheet, then closes it', async ({ page }) => {
    // A `sheet: true` step (lib/tourContent) has HubLayout hold the section's ＋
    // chooser open while the step is active, so the tour can spotlight the tiles
    // themselves; ending the tour lets the sheet go. Entry: the La liste intro
    // card's « Faire le tour » (tours pre-seen so essentials doesn't auto-start,
    // intros left un-dismissed so the button is there).
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
    await page.goto('/liste')
    await page.locator('.section-intro__tour').click()
    await page.locator('.tour').waitFor({ state: 'visible' })

    // Walk to the last step (the in-sheet tiles step): the ＋ sheet opens under
    // the tour and the spotlighted tile grid is really visible inside it.
    const next = page.getByRole('button', { name: /Suivant|Next/ })
    while (await next.isVisible()) await next.click()
    await expect(page.locator('.sheet.show [data-tour="add-tiles"]')).toBeVisible()
    await expect(page.locator('.tour__ring')).toBeVisible()

    // Finishing the tour releases the sheet it opened.
    await page.getByRole('button', { name: /Terminé|Done/ }).click()
    await expect(page.locator('.tour')).toHaveCount(0)
    await expect(page.locator('.sheet.show')).toHaveCount(0)
  })

  // The nav restructure gave Maison its OWN tour (id 'maison' — intro, the five
  // sub-tab pills, the default Routines grid, the merged ＋ chooser); the old
  // standalone 'routines'/'cercle' tours still exist (reached from their own Guide
  // cards) but now both start on /maison too. « Les notes » split out with NO tour
  // of its own — its section-intro card offers only « En savoir plus », never
  // « Faire le tour ».
  test('the Maison first-visit card offers its own tour, spotlighting the sub-tabs', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
    await page.goto('/maison')
    const tourBtn = page.locator('.section-intro__tour')
    await expect(tourBtn).toBeVisible()
    await tourBtn.click()
    await page.locator('.tour').waitFor({ state: 'visible' })
    const next = page.getByRole('button', { name: /Suivant|Next/ })
    await next.click() // welcome → the five sub-tab pills step (data-tour="maison-sections")
    await expect(page.locator('.tour__ring')).toBeVisible()
  })

  // Les notes was the ONE hub tab with no tour — this test used to pin that absence
  // ("no tour to offer"), which is exactly the asymmetry reported on 2026-09-09: the
  // guided tour looked like a board feature. It has its own tour now, so the same test
  // pins the opposite, and the intro card offers it like every other section's does.
  test('the Les notes first-visit card offers its own tour, like every other section', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', intros: true })
    await page.goto('/notes')
    await expect(page.locator('.section-intro')).toBeVisible()
    await expect(page.locator('.section-intro__more')).toBeVisible()
    const tourBtn = page.locator('.section-intro__tour')
    await expect(tourBtn).toBeVisible()
    await tourBtn.click()
    await page.locator('.tour').waitFor({ state: 'visible' })
    // Step 0 is the centred welcome; step 1 spotlights « Pour qui » (data-tour="notes-face").
    await page.getByRole('button', { name: /Suivant|Next/ }).click()
    await expect(page.locator('.tour__ring')).toBeVisible()
  })

  // ── The « ? » bar: the same three doors on every hub tab ─────────────────────────
  //
  // What the report was really about. Arming « ? » used to mean HINTS ONLY, so a
  // section's tour was reachable from two places you had to know about already
  // (Réglages ▸ Découvrir, and the intro card that vanishes once dismissed). Every tab
  // now offers, from the same control: tap-to-explain, « Faire le tour » for THIS
  // section, and « Le guide ». The static half is guarded in src/lib/tour-rule.test.ts;
  // this is the half that proves the door actually opens the right tour.
  const HELP_TABS: { name: string; url: string; firstStep: RegExp }[] = [
    { name: 'board', url: '/board', firstStep: /Le babillard/ },
    { name: 'kitchen', url: '/kitchen', firstStep: /La cuisine/ },
    { name: 'liste', url: '/liste', firstStep: /La liste/ },
    { name: 'notes', url: '/notes', firstStep: /Les notes/ },
    // Maison offers the tour of the SECTION you are on, not the tab's generic one.
    { name: 'maison ▸ routines', url: '/maison?section=routines', firstStep: /Routines/ },
    { name: 'maison ▸ famille', url: '/maison?section=family', firstStep: /Le cercle/ },
  ]

  for (const tab of HELP_TABS) {
    test(`« ? » on ${tab.name} offers hints, its own tour and the guide`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
      await page.goto(tab.url)
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

      await page.locator('.help-toggle').first().click()
      const bar = page.locator('.help-hint')
      await expect(bar).toBeVisible()
      // 1. the hint (tap anything to have it explained), 2. the tour, 3. the guide.
      await expect(bar.locator('.help-hint__line')).toBeVisible()
      await expect(bar.getByRole('link', { name: /guide/i })).toBeVisible()

      // …and the tour door opens THIS section's tour, not the board's.
      await bar.getByRole('button', { name: /Faire le tour/ }).click()
      await expect(page.locator('.tour')).toBeVisible()
      await expect(page.locator('.tour__head')).toContainText(tab.firstStep)
    })
  }

  test('tour card names itself (capture)', async ({ page, app }) => {
    await app.boot({ viewport: { width: 390, height: 844 }, state: { calm: true, tour: true }, route: '/board' }) // tour NOT marked seen → the essentials tour auto-starts
    await page.locator('.tour').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('.tour__eyebrow').waitFor({ state: 'visible' })
    await page.screenshot({ path: 'e2e/screenshots/tour-welcome.png' })
    // Advance to the bottom-nav step so the spotlight ring shows too.
    await page.getByRole('button', { name: /Suivant|Next/ }).click()
    await page.locator('.tour__ring').waitFor({ state: 'visible' })
    await settled(page)
    await page.screenshot({ path: 'e2e/screenshots/tour-spotlight.png' })
  })

  test('Réglages has a « ? » at last — and arming it reaches its section help', async ({ page }) => {
    // Réglages carried a 34-entry help registry (lib/operatorHelp) that NOTHING could
    // arm: `HelpTitle` only becomes tappable while help mode is active, and no surface
    // ever called toggle(). So every one of those explanations was unreachable — the
    // same defect as the missing tours, one level up. The « ? » now rides the lens row
    // (Comprendre · Régler), on the Régler face only: on Comprendre the guide text IS
    // the explanation, and two explainers for one question is not help.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=board&lens=regler')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })

    const toggle = page.locator('.operator__lensrow .help-toggle')
    await expect(toggle).toBeVisible()
    await toggle.click()

    // The same bar as every hub tab: the hint line + the two doors.
    const bar = page.locator('.help-hint')
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('link', { name: /guide/i })).toBeVisible()

    // The registry is REACHABLE now: a section heading became a help target.
    await expect(page.locator('.help-title').first()).toBeVisible()

    // …and the tour door opens Réglages' own tour.
    await bar.getByRole('button', { name: /Faire le tour/ }).click()
    await expect(page.locator('.tour')).toBeVisible()
    await expect(page.locator('.tour__head')).toContainText(/Réglages/)
  })

  // The other half of « le ? ne sert qu'au babillard », found 2026-09-10 by putting help
  // mode in the state matrix and LOOKING: « Rendez-vous » sat under an armed « ? » with
  // no tap affordance while « Année scolaire », one card below it, had one. Five of the
  // most-used Réglages cards were like that — they passed a helpKey for the ?focus=
  // anchor, never the `help` prop, and OperatorSection needs both to render a HelpTitle.
  // Nobody could see it before 2026-09-09, because Réglages had no « ? » to arm.
  //
  // The unit guard (src/lib/operatorHelpCoverage.test.ts) reads the JSX; this reads the
  // SCREEN, which is the half that proves the copy actually reaches a thumb.
  test('a Réglages card that was inert now answers when tapped', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=board&lens=regler')
    await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
    await page.locator('.operator__lensrow .help-toggle').click()

    // « Rendez-vous » — the card the screenshot caught. Its heading must BE the help
    // target, not merely sit next to one.
    const heading = page.locator('.help-title', { hasText: 'Rendez-vous' }).first()
    await expect(heading).toBeVisible()
    await heading.click()
    const bubble = page.locator('.help-bubble').first()
    await expect(bubble).toBeVisible()
    // And it lands somewhere real in the guide — the dead-deep-link half is held by
    // helpRegistry.test.ts, so here we only need the door to exist.
    await expect(bubble.locator('.help-bubble__guide')).toBeVisible()
  })

  // Asked for 2026-09-10: « Première fois » should walk ALL the sections, both the
  // first time it runs by itself and when someone replays it from Réglages ▸ Découvrir
  // — so a household meets every tab on day one instead of only the board.
  //
  // The tour is BUILT from the six section tours (lib/tourContent `sectionChain`), so
  // this walks it end to end and pins that every hub route is actually visited. What it
  // really guards is the engine half: a step carrying a `route` has to navigate on
  // ENTERING it, or the tour spotlights anchors that are not on the page.
  test('the welcome card offers a QUICK tour or the full one', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', tour: true })
    await page.goto('/board')
    await page.locator('.tour').waitFor({ state: 'visible', timeout: 15_000 })

    // Both doors are on the FIRST card, and only there — a tour that asked again at
    // every step would be nagging, not offering.
    const full = page.getByRole('button', { name: /Voir les six sections|See all six/ })
    await expect(full, 'the welcome card must offer the full tour').toBeVisible()
    await page.getByRole('button', { name: /Suivant|Next/ }).click()
    await expect(full, 'the choice belongs to the welcome card alone').toHaveCount(0)
  })

  // One tap on the tour's button, and the card it leaves behind has really changed (or closed).
  async function advance(page: Page, next: Locator) {
    const card = () => page.locator('.tour').evaluateAll((els) => els[0]?.textContent ?? null)
    const before = await card()
    await next.click()
    await expect.poll(card).not.toBe(before)
  }

  test('the quick tour stays quick — it never leaves the board', async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', tour: true })
    await page.goto('/board')
    await page.locator('.tour').waitFor({ state: 'visible', timeout: 15_000 })

    const next = page.getByRole('button', { name: /Suivant|Next|Terminé|Done/ })
    const routes = new Set<string>()
    for (let i = 0; i < 60; i++) {
      if (!(await page.locator('.tour').isVisible())) break
      routes.add(new URL(page.url()).pathname)
      if (!(await next.isVisible())) break
      await advance(page, next)
    }
    // The short tour is the 30-second orientation it says it is: it introduces the six
    // tabs, it does not WALK them. Someone who wanted that has the other door.
    expect([...routes], 'the quick tour should not tour the sections').toEqual(['/board'])
  })

  test('« Première fois » walks every section, and lands back where it started', async ({ page }) => {
    test.setTimeout(180_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    // Tour NOT seen → the welcome card auto-starts, which is the first-run path itself.
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', tour: true })
    await page.goto('/board')
    await page.locator('.tour').waitFor({ state: 'visible', timeout: 15_000 })

    // Take the full-tour door. The default is the QUICK tour: the app ASKS rather than
    // deciding that a ~40-step walk is what every new household wants on first load.
    await page.getByRole('button', { name: /Voir les six sections|See all six/ }).click()
    await page.locator('.tour').waitFor({ state: 'visible' })

    // The advance button is « Suivant » until the LAST step, where it becomes
    // « Terminé » — matching only the first leaves the walk stranded on the final card
    // (which is how the first version of this test failed: every section visited, tour
    // still open).
    const next = page.getByRole('button', { name: /Suivant|Next|Terminé|Done/ })
    const visited = new Set<string>()
    const routeOf = () => new URL(page.url()).pathname

    visited.add(routeOf())
    // Walk to the end. The bound is generous but finite: a tour that never finishes is
    // itself the failure, and an infinite click loop would just hang the suite.
    for (let i = 0; i < 200; i++) {
      if (!(await page.locator('.tour').isVisible())) break
      visited.add(routeOf())
      if (!(await next.isVisible())) break
      await advance(page, next)
    }

    // Every hub tab, seen without the user having to find it.
    for (const route of ['/board', '/kitchen', '/liste', '/notes', '/maison', '/settings']) {
      expect([...visited], `the grand tour never visited ${route}`).toContain(route)
    }
    // …and it ends: the overlay is gone rather than stuck on a step whose anchor never came.
    await expect(page.locator('.tour')).toHaveCount(0)
  })
})


// ── folded from section-intro.spec.ts ──────────────────────────────────────────────
test.describe('section-intro', () => {
  // The per-section first-visit welcome card (SectionIntro): the first time a
  // parent opens a themed tab, a calm "what this is" card sits above the section,
  // links into the full Guide card, and is dismissible — once, then never again.
  // Frontend-only against mocked APIs. `intros: true` leaves the cards un-dismissed
  // (seedState pre-dismisses them everywhere else for stable screenshots).

  // Keep the first-login guided tour from auto-navigating to /board (its overlay
  // would gate the intro card off and pull us off the tab under test).

  test('the first-visit card explains the section and deep-links into the Guide', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
    const intro = page.locator('.section-intro')
    await expect(intro).toBeVisible()
    await expect(intro).toContainText('cuisine')
    // "En savoir plus" jumps into the matching Guide card (same path as HelpDot):
    // the card's themed Réglages tab, Comprendre lens, card param consumed.
    await intro.locator('.section-intro__more').click()
    await expect(page).toHaveURL(/\/settings\?tab=kitchen&lens=comprendre$/)
    const target = page.locator('.guide__card.is-target')
    await expect(target).toBeVisible()
    await expect(target).toContainText('cuisine')
  })

  // The nav restructure split the old « Le cercle » welcome card into two: Maison
  // (routines/famille/social/business/carnets) and Les notes (Comprendre-only —
  // its Guide card carries no `settings` field, but « En savoir plus » still lands
  // on its own themed tab, not a fallback).
  test('the Maison first-visit card explains the merged section', async ({ page, app }) => {
    await app.boot({ route: '/maison?section=business', state: { intros: true }, wait: '.hub' })
    const intro = page.locator('.section-intro')
    await expect(intro).toBeVisible()
    await expect(intro).toContainText('maison')
    await intro.locator('.section-intro__more').click()
    await expect(page).toHaveURL(/\/settings\?tab=maison&lens=comprendre$/)
    const target = page.locator('.guide__card.is-target')
    await expect(target).toBeVisible()
  })

  // The card follows the pill you are LOOKING at (solidify 4.4), the same table as the « ? »:
  // a welcome about the whole tab sat above the routines.
  test('Maison opens on routines, so its first-visit card is the routines one', async ({ page, app }) => {
    await app.boot({ route: '/maison', state: { intros: true }, wait: '.hub' })
    await expect(page.locator('.section-intro')).toHaveAttribute('aria-label', /routines/i)
  })

  test('the Les notes first-visit card explains the split-out section', async ({ page, app }) => {
    await app.boot({ route: '/notes', state: { intros: true }, wait: '.hub' })
    const intro = page.locator('.section-intro')
    await expect(intro).toBeVisible()
    await expect(intro).toContainText('notes')
    await intro.locator('.section-intro__more').click()
    await expect(page).toHaveURL(/\/settings\?tab=notes&lens=comprendre$/)
    const target = page.locator('.guide__card.is-target')
    await expect(target).toBeVisible()
  })

  test('dismissing the card hides it for good', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
    const intro = page.locator('.section-intro')
    await expect(intro).toBeVisible()
    await intro.locator('.section-intro__dismiss').click()
    await expect(intro).toHaveCount(0)

    // The dismissal sticks across a reload (persisted in localStorage).
    await page.reload()
    await page.locator('.hub').first().waitFor({ state: 'visible' })
    await expect(page.locator('.section-intro')).toHaveCount(0)
  })

  test('the toddler lens never sees the welcome card', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', state: { audience: 'toddler', surface: 'kiosk', intros: true }, wait: '.hub' })
    await expect(page.locator('.section-intro')).toHaveCount(0)
  })

  // Review #19 (2026-11-17): « five tabs means five tutorials to dismiss ». One « Compris »
  // now puts every section's card away, and a device that met the essentials tour (the
  // app's one welcome) gets none at all.
  test('one « Compris » puts away every tab’s card, not just this one', async ({ page, app }) => {
    await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
    await page.locator('.section-intro .section-intro__dismiss').click()
    for (const route of ['/liste', '/notes', '/maison']) {
      await page.goto(route)
      await page.locator('.hub').first().waitFor({ state: 'visible' })
      await expect(page.locator('.section-intro'), route).toHaveCount(0)
    }
  })

  test('a device that met the essentials tour gets no section cards', async ({ page, app }) => {
    await page.addInitScript(() => localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials'])))
    await app.boot({ route: '/liste', state: { intros: true }, wait: '.hub' })
    await expect(page.locator('.hub__body')).toBeVisible()
    await expect(page.locator('.section-intro')).toHaveCount(0)
  })

  // « Revoir les cartes de première visite » (Découvrir) stores an explicit EMPTY set: asked
  // for, the cards come back even on a device that met the tour long ago.
  test('cards asked back (an explicit empty set) show despite the tour', async ({ page, app }) => {
    await page.addInitScript(() => {
      localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      localStorage.setItem('babillard-sections-seen', '[]')
    })
    await app.boot({ route: '/kitchen', state: { intros: true }, wait: '.hub' })
    await expect(page.locator('.section-intro')).toBeVisible()
  })
})


// ── folded from lexicon.spec.ts ──────────────────────────────────────────────
test5.describe('lexicon', () => {
  // THE IN-APP LEXICON (UNIFY.md day 7) — a word in the manual that explains itself.
  //
  // `src/lib/glossary.ts` settles which word the app uses; `[[mot:id|label]]` in a guide
  // card marks the first place a household meets one, and tapping it pops the definition
  // where it stands. Réglages / Comprendre only, on purpose: reading the manual is a
  // one-off, so the mark costs a daily user nothing.
  //
  // This spec exists because the feature crosses TWO lazy boundaries that were added
  // after it was eye-checked — the mark itself is `lazy()` out of `renderRich` (it was in
  // the eager boot chunk and failed the bundle budget), and the term TABLE arrives through
  // a dynamic `import()` on the tap. Either one silently failing looks exactly like "the
  // word is plain text", which is also what a correct un-marked word looks like. Only an
  // assertion tells those apart.

  test5.beforeEach(async ({ page }) => {
    await mockApi(page)
    await seedState(page, {})
  })

  test5('a marked word in the guide is tappable and pops its definition', async ({ page }) => {
    // `?card=` opens the card; its POINTS are a second, nested <details>, and the marked
    // word lives in a point's detail. Opened the way a person opens it rather than by
    // `?point=<n>` — the index is 0-based and shifts whenever a point is trimmed, which
    // would turn a copy edit into a mystery failure in a spec about something else.
    await page.goto('/settings?tab=guide&card=first-time')
    const card = page.locator('.guide__card.is-target')
    await card.locator('.guide__point-title').first().click()

    const mark = page.locator('.gloss__word', { hasText: 'tâches' }).first()

    // The lazy chunk has to land before the dotted button exists at all — until then the
    // Suspense fallback renders the bare word, which is the correct-looking failure.
    await expect(mark).toBeVisible()
    await expect(mark).toHaveAttribute('aria-expanded', 'false')

    await mark.click()
    const pop = page.locator('.gloss__pop')
    await expect(pop).toBeVisible()
    // The definition comes from the term table, which arrives via its own dynamic import.
    // Asserting the MIDDLE of the sentence on purpose: a definition may explain a term in
    // ordinary language; a spec may not nail its first word down.
    await expect(pop).toContainText('case à cocher')
    await expect(mark).toHaveAttribute('aria-expanded', 'true')

    // IT FLOATS over the paragraph now, so the one thing that can go wrong is the one
    // thing inline layout used to prevent: hanging off the screen. The mark can sit
    // anywhere on a line, so this measures the real box rather than trusting the clamp.
    const box = await boxOf(pop)
    const width = page.viewportSize()!.width
    expect(box.x, 'the definition starts off the left edge').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, `the definition runs past ${width}px`).toBeLessThanOrEqual(width)

    // …and it closes again: this is an explainer, not a place you get stuck.
    await mark.click()
    await expect(pop).toHaveCount(0)
  })

  test5('the floating definition stays on screen at 320px', async ({ page }) => {
    // THE 390px CASE ABOVE DOES NOT EXERCISE THE CLAMP — proven by deleting the clamp and
    // watching it still pass: « tâches » happens to start early enough on its line that a
    // 22rem popover anchored to it still fits. A guard that cannot be made red by removing
    // the thing it guards is a decoration, so the real test is the tightest width the repo
    // supports, where the popover is wider than the room to the right of almost any word.
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/settings?tab=guide&card=first-time')
    await page.locator('.guide__card.is-target .guide__point-title').first().click()
    await page.locator('.gloss__word', { hasText: 'tâches' }).first().click()

    const pop = page.locator('.gloss__pop')
    await expect(pop).toBeVisible()
    const box = await boxOf(pop)
    expect(box.x, 'the definition starts off the left edge at 320px').toBeGreaterThanOrEqual(0)
    expect(box.x + box.width, 'the definition runs past 320px').toBeLessThanOrEqual(320)

    // AND IT MUST BE PORTALED — the assertions above are not enough on their own, which is
    // the whole reason this line exists. The first implementation floated inside the
    // paragraph and satisfied both of them (x=24, right=312 in a 320px screen,
    // `scrollWidth === clientWidth`) while being visibly clipped on BOTH sides: the guide
    // card clips its own overflow, and viewport arithmetic cannot see an ancestor's clip.
    // Only leaving the card fixes it, so that is what gets asserted.
    await expect
      .poll(() => pop.evaluate((el) => el.parentElement === document.body))
      .toBe(true)
  })

  test5('the floating definition is dismissible without finding the word again', async ({ page }) => {
    // A layer that covers text owes the reader a way out that is not "hit the same small
    // word a second time". Escape and an outside tap both close it.
    await page.goto('/settings?tab=guide&card=first-time')
    await page.locator('.guide__card.is-target .guide__point-title').first().click()
    const mark = page.locator('.gloss__word', { hasText: 'tâches' }).first()

    await mark.click()
    await expect(page.locator('.gloss__pop')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.gloss__pop')).toHaveCount(0)

    await mark.click()
    await expect(page.locator('.gloss__pop')).toBeVisible()
    await page.locator('.guide__card.is-target').click({ position: { x: 8, y: 8 } })
    await expect(page.locator('.gloss__pop')).toHaveCount(0)
  })

  test5('the mark stays out of the hub surfaces a household uses every day', async ({ page }) => {
    // The whole bargain of the lexicon is that it taxes nobody who is not reading the
    // manual. A dotted word on the board would be a permanent cost for a one-off benefit.
    for (const route of ['/board', '/kitchen', '/liste', '/notes', '/maison']) {
      await page.goto(route)
      await page.waitForSelector('.hub')
      await expect(page.locator('.gloss__word'), `a glossary mark reached ${route}`).toHaveCount(0)
    }
  })
})


// ── folded from empty-doors.spec.ts ──────────────────────────────────────────────
test6.describe('empty-doors', () => {
  // « Chaque état vide ouvre une porte » (bmad/12 #6). An empty section that explains
  // itself and then offers nothing is a dead end: the way in is the ＋ FAB, a glyph the
  // words never mention. REVIEW-PASS named one by hand — "empty recipe book has no
  // direct add-a-recipe CTA, only a guide link" — and it was one of five.
  //
  // The limit is as important as the feature: a SECTION empty gets a door, a CELL empty
  // ("Rien de prévu" on one day) does NOT. Padding a calm cell with a call to action
  // turns a quiet surface into a nag, and that contract is written in COMPONENTS.md.
  // Both halves are asserted here.

  async function fresh(page: Page, route: string) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { fresh: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(route)
    await page.locator('.hub__body, .scene__body').first().waitFor({ state: 'visible', timeout: 15_000 })
  }

  test6('an empty recipe book offers the way to add one', async ({ page }) => {
    await fresh(page, '/kitchen?tab=recipes')
    const door = page.locator('.empty-state__action')
    await expect(door.first()).toBeVisible()
    await expect(door.first()).toHaveText(/Ajouter une recette/)
    // It uses the app's own URL grammar, so the door opens the ＋ sheet on its tile
    // rather than inventing a second add route (DISCOVERY.md).
    await expect(door.first()).toHaveAttribute('href', /plus=recipe/)
  })

  test6('an empty « Mes habitudes » stops ending on a promise it cannot keep', async ({ page }) => {
    // Its copy already read « …ou ajoutes-en une » with nothing to tap.
    await fresh(page, '/board/habitudes')
    const door = page.locator('.empty-state__action')
    await expect(door.first()).toBeVisible()
    await expect(door.first()).toHaveAttribute('href', /habitude\/new/)
  })

  test6('a CELL empty stays bare — a door there would be a nag', async ({ page }) => {
    // The month grid's per-day empties, and the board's own quiet lines, are complete
    // answers on their own. If this ever fails, the sweep over-applied.
    await fresh(page, '/board')
    await expect(page.locator('.hub__body')).toBeVisible()
    const cellDoors = await page.locator('.wg-slot .empty-state__action').count()
    expect(cellDoors, 'board card cells must not sprout calls to action').toBe(0)
  })

  test6('a read-only guest sees the explanation but not the door', async ({ page }) => {
    // isGuest() gates it like every other write affordance — a babysitter has nothing
    // to add, so offering the ＋ would be a dead link with extra steps.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { fresh: true, signedIn: false })
    await page.route('**/api/guest/whoami**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/kitchen?tab=recipes')
    await page.locator('.hub__body').first().waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.empty-state__action')).toHaveCount(0)
  })
})
