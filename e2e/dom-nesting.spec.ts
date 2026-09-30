import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// NO INVALID DOM NESTING ON ANY FORM SCENE (2026-09-30).
//
// `/routine/r1` logged « <form> cannot contain a nested <form> » for months: RoutineForm
// is a <form>, and CardDeckEditor rendered each card's word through an EditField in its
// default `as="form"` mode — the tip field three screens down already passed `as="div"`,
// the word field beside it did not. It lost no data — React builds the DOM by API, so
// the inner form really existed and its handler swallowed Enter — but it is invalid
// HTML that only worked by accident: an HTML parser (a saved page, any server render)
// drops the inner tag, and then Enter in a card word submits the routine.
//
// It survived because nothing listened. React reports every invalid nesting as a dev
// console.error (a nested form, a <div> in a <p>, a button in a button), and the e2e
// suite only ever collected `pageerror`. This listens on the form scenes — where a
// primitive that owns its own <form> (EditField) meets a host that owns one too — plus
// a few create scenes that render fields without a <form> (person, family, voyage). EntityCombobox is a <div> on purpose; EditField has `as="div"` for
// exactly this. A new form scene belongs in this list.
const ROUTES = [
  '/routine/r1',
  '/routine/new',
  '/kitchen/recipe/new',
  '/kitchen/recipe/rc1/edit',
  '/event/new',
  '/chore/new',
  '/home-project/new',
  '/habitude/new',
  '/virement/new',
  '/virement/plan/new',
  '/cercle/person/new',
  '/cercle/pet/new',
  '/cercle/family/new',
  '/voyage/new',
  '/liste-modele/tpl1',
  '/settings?tab=kitchen',
  '/settings?tab=systeme',
]

// React 19's wording, matched on the parts that survive its `%s` placeholders (the
// console text Playwright hands back is not printf-formatted).
const NESTING = /cannot contain a nested|cannot be a descendant of|cannot be a child of|validateDOMNesting/
// The other false green: a scene that crashed into ErrorBoundary still paints its
// fallback text, and renders no form to nest. /voyage/new did exactly that on its
// first run here — `mockApi`'s `{}` fallback had no `trips` array.
const CRASHED = /Babillard a planté/

for (const route of ROUTES) {
  test(`no invalid DOM nesting on ${route}`, async ({ page }) => {
    const bad: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && (NESTING.test(m.text()) || CRASHED.test(m.text()))) bad.push(m.text().split('\n')[0])
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(route)
    // A redirect is a false green too: it would sweep some other page.
    await expect.poll(() => { const u = new URL(page.url()); return u.pathname + u.search }).toBe(route)
    await expect(page.locator('.loading, .skeleton'), `${route} finished loading`).toHaveCount(0, { timeout: 15_000 })
    // A false green is an empty page: nothing rendered, nothing nested.
    const painted = await page.evaluate(() => (document.body?.innerText ?? '').trim().length)
    expect(painted, `${route} painted`).toBeGreaterThan(40)
    expect(bad, `invalid DOM nesting on ${route}`).toEqual([])
  })
}
