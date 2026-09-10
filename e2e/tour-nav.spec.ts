import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Regression: the guided tour must NOT swallow taps. Its step 2 spotlights the
// bottom nav (data-tour="hubnav"); before the fix the full-screen scrim caught
// all pointer input, so tapping the highlighted nav did nothing ("navigating the
// footer, nothing happens"). The scrim is now non-blocking (pointer-events:none),
// so the nav works while the tour rides along. This test proves both: the tour
// auto-starts for a signed-in parent, AND a nav tap navigates with it up.

async function boot(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  // Signed-in parent, tour NOT marked seen → the essentials tour auto-starts.
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true, tour: true })
  await page.goto('/board')
}

test('guided tour does not block the bottom nav', async ({ page }) => {
  await boot(page)
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

test('tour card names itself (capture)', async ({ page }) => {
  await boot(page)
  await page.locator('.tour').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('.tour__eyebrow').waitFor({ state: 'visible' })
  await page.screenshot({ path: 'e2e/screenshots/tour-welcome.png' })
  // Advance to the bottom-nav step so the spotlight ring shows too.
  await page.getByRole('button', { name: /Suivant|Next/ }).click()
  await page.locator('.tour__ring').waitFor({ state: 'visible' })
  await page.waitForTimeout(200)
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
    await next.click()
    await page.waitForTimeout(100)
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
    await next.click()
    await page.waitForTimeout(120)
  }

  // Every hub tab, seen without the user having to find it.
  for (const route of ['/board', '/kitchen', '/liste', '/notes', '/maison', '/settings']) {
    expect([...visited], `the grand tour never visited ${route}`).toContain(route)
  }
  // …and it ends: the overlay is gone rather than stuck on a step whose anchor never came.
  await expect(page.locator('.tour')).toHaveCount(0)
})
