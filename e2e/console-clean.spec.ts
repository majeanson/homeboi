import { test, expect } from '@playwright/test'
import { mockApi, seedState, MMID } from './mocks'

// EVERY ROUTE OPENS WITH A SILENT CONSOLE — a ratchet at zero (2026-09-30).
//
// React reports its whole class of "this works by accident" defects as a dev
// console.error or warning, not as a thrown error: an invalid nesting (a <form> in a
// <form>, a <div> in a <p>), two siblings with one key, an input flipping between
// controlled and uncontrolled, a setState during another component's render. The e2e
// suite only ever collected `pageerror`, so none of them could fail a build.
//
// The one that started this: `/routine/r1` logged « <form> cannot contain a nested
// <form> » for months. RoutineForm is a <form>, and CardDeckEditor rendered each card's
// word through an EditField in its default `as="form"` mode — the tip field beside it
// already passed `as="div"`. It lost no data (React builds the DOM by API, so the inner
// form existed and swallowed Enter), but it was invalid HTML that worked by accident:
// an HTML parser drops the inner tag, and then Enter in a card word submits the routine.
//
// A survey of 64 routes under both the live clock and the fixtures' fixed day, then under
// the four lenses below, found no
// other console error or warning, so this holds the whole console to zero, not a list of
// known messages. A new route belongs here; a message that is genuinely not ours would
// be excluded by its text, with the reason.
//
// Two false greens this also guards, both of which it met on its first runs:
//   • a scene that CRASHED into ErrorBoundary paints fallback text and renders nothing
//     to warn about — /voyage/new did, on a mock that lacked `trips` (the boundary logs,
//     so the listener sees it);
//   • a route that BOUNCES sweeps some other page — the contrast spec measured /kitchen
//     as « day-plan » for weeks, because /kitchen/day/ takes a unix day, not an ISO date.
const ROUTES = [
  // Hub tabs and their sections.
  '/board',
  '/kitchen',
  '/kitchen?tab=pantry',
  '/kitchen?tab=recipes',
  '/kitchen?tab=history',
  '/liste',
  '/notes',
  '/notes?section=virements',
  '/maison',
  '/maison?section=family',
  '/maison?section=social',
  '/maison?section=business',
  '/maison?section=carnets',
  '/settings',
  '/settings?tab=board',
  '/settings?tab=kitchen',
  '/settings?tab=liste',
  '/settings?tab=notes',
  '/settings?tab=maison',
  '/settings?tab=systeme',
  // Scenes.
  '/liste/circulaires',
  '/liste/cashier',
  '/liste/quick',
  '/liste/deals/l1',
  '/liste/item/l1',
  `/kitchen/day/${MMID}`,
  '/kitchen/idees',
  '/kitchen/book',
  '/kitchen/recipe/rc1',
  '/kitchen/recipe/rc1/cook',
  '/cercle/person/c1',
  '/cercle/monde',
  '/cercle/import',
  '/jouer',
  '/routine/r1/run',
  '/drawings',
  '/search',
  '/board/departure',
  '/board/habitudes',
  '/voiture',
  '/courrier',
  '/family',
  '/welcome',
  '/handoff',
  // Form scenes — where a primitive that owns its own <form> (EditField) meets a host
  // that owns one too. EntityCombobox is a <div> on purpose; EditField has `as="div"`.
  '/routine/r1',
  '/routine/new',
  '/kitchen/recipe/new',
  '/kitchen/recipe/rc1/edit',
  '/event/new',
  '/chore/new',
  '/home-project/new',
  '/habitude/new',
  '/habitude/hb1/edit',
  '/virement/new',
  '/virement/plan/new',
  '/cercle/person/new',
  '/cercle/pet/new',
  '/cercle/family/new',
  '/voyage/new',
  '/liste-modele/tpl1',
]

// The lenses render different components off the same routes (MemberSwitcher on the
// wall, the picture-card views under toddler, the EN dictionary), so each paints its
// own chance to warn. A survey of all four found only one difference, and it is by
// design: the toddler lens never reaches Réglages (HubLayout sends it to /board).
const LENSES = [
  { name: 'phone', surface: 'mobile', audience: 'parent', lang: 'fr', size: { width: 390, height: 844 } },
  { name: 'wall', surface: 'kiosk', audience: 'parent', lang: 'fr', size: { width: 1280, height: 800 } },
  { name: 'toddler', surface: 'kiosk', audience: 'toddler', lang: 'fr', size: { width: 1280, height: 800 } },
  { name: 'en', surface: 'mobile', audience: 'parent', lang: 'en', size: { width: 390, height: 844 } },
] as const

for (const lens of LENSES) {
  for (const route of ROUTES) {
    if (lens.audience === 'toddler' && route.startsWith('/settings')) continue
    const at = `${route} @${lens.name}`
    test(`the console stays clean on ${at}`, async ({ page }) => {
      const noise: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') noise.push(`${m.type()}: ${m.text().split('\n')[0]}`)
      })
      page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`))
      await page.setViewportSize(lens.size)
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: lens.audience, lang: lens.lang, surface: lens.surface })
      await page.goto(route)
      await expect(page.locator('.loading, .skeleton'), `${at} finished loading`).toHaveCount(0, { timeout: 15_000 })
      // Settle: a lazy scene bounces, and an effect warns, only after its first render.
      await page.waitForTimeout(500)
      const u = new URL(page.url())
      expect(u.pathname + u.search, `${at} stayed put`).toBe(route)
      const painted = await page.evaluate(() => (document.body?.innerText ?? '').trim().length)
      expect(painted, `${at} painted`).toBeGreaterThan(30)
      expect(noise, `console noise on ${at}`).toEqual([])
    })
  }
}
