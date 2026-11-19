import { test, expect, type Route, type Page, type Request, type Locator } from '@playwright/test'
import { mockApi, seedState, BASE, BOARD, CERCLE, MMID } from './mocks'
import { boxOf } from './measure'
import { test as test3 } from './fixtures'

// JOURNEY — RENDEZ-VOUS (review #43; was event-peek-actions.spec.ts + event-form-bring.spec.ts + event-series-pet.spec.ts + birthday-gift.spec.ts + sa-fete.spec.ts).
//
// The event detail peek now offers basic actions — Modify / Delete / Share — alongside
// « Voir la journée ». Opened from a board activity row (.act__hit → .detail-sheet). We
// assert the buttons render and that Delete confirms then fires DELETE /api/events, and
// that Modify opens the pre-filled event form. (Matches BOARD's 'Rendez-vous dentiste' = e2.)
//
// Since the ⋯ fold, the peek splits its actions: « Voir la journée » + Modifier + Supprimer
// stay visible in `.detail-sheet__actions` (Supprimer came OUT of the ⋯ on 2026-09-16 —
// Marc: « make sure we can remove/delete easily from detail popups »; the confirm keeps
// it deliberate); Itinéraire / Partager live behind the head's `.action-menu__btn` as
// `menuitem`s (same pattern as the recipe view).

test.describe('event-peek-actions', () => {
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

  const EVENT = {
    id: 'e2',
    title: 'Rendez-vous dentiste',
    start_at: BASE + 6 * 3600,
    all_day: 0,
    member_id: 'm4',
    contact_id: null,
    business_id: null,
    recur_json: null,
    lead_seconds: null,
    car_id: null,
    passengers: null,
    bring_template_id: null,
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.routeWebSocket(/\/api\/live/, () => {})
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    // Freeze at BASE so today's timed events read as upcoming-and-live (the board otherwise
    // folds past-timed items into a « Déjà passé » disclosure vs the real clock).
    await page.clock.setFixedTime(new Date(BASE * 1000))
    // Events endpoint: GET feeds the Modify form (EventEditModal reads the base row); writes → {ok}.
    await page.route('**/api/events', (route: Route) =>
      route.fulfill(route.request().method() === 'GET' ? json({ events: [EVENT] }) : json({ ok: true })),
    )
  })

  async function openEventPeek(page: import('@playwright/test').Page) {
    await page.goto('/board')
    // An event row (no checkbox) renders as a single .act button; tapping it opens the peek.
    await page.locator('.act', { hasText: 'Rendez-vous dentiste' }).first().click()
    await page.locator('.detail-sheet').waitFor({ state: 'visible', timeout: 10_000 })
  }

  // Open the peek's ⋯ overflow (head corner) so its menuitems are clickable.
  const openPeekMenu = (page: import('@playwright/test').Page) =>
    page.locator('.detail-sheet .action-menu__btn').click()

  test('the event peek offers Modify / Delete / Share; Delete confirms → DELETE /api/events', async ({ page }) => {
    await openEventPeek(page)
    const actions = page.locator('.detail-sheet__actions')
    await expect(actions.getByText('Voir la journée', { exact: true })).toBeVisible()
    await expect(actions.getByText('Modifier', { exact: true })).toBeVisible()
    // Supprimer is a VISIBLE danger button; Partager stays behind the ⋯.
    await expect(actions.getByRole('button', { name: 'Supprimer', exact: true })).toBeVisible()
    await expect(actions.getByText('Partager', { exact: true })).toHaveCount(0)
    await openPeekMenu(page)
    await expect(page.getByRole('menuitem', { name: 'Partager' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Supprimer' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Delete → the sheet closes, the danger confirm opens → confirm fires DELETE {id}.
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'DELETE' && new URL(r.url()).pathname === '/api/events', { timeout: 20_000 }),
      (async () => {
        await actions.getByRole('button', { name: 'Supprimer', exact: true }).click()
        await page.locator('.confirm__actions').getByRole('button', { name: 'Supprimer' }).click()
      })(),
    ])
    expect(req.postDataJSON()).toMatchObject({ id: 'e2' })
  })

  test('Modify opens the event form pre-filled', async ({ page }) => {
    await openEventPeek(page)
    await page.locator('.detail-sheet__actions').getByText('Modifier', { exact: true }).click()
    const modal = page.locator('.kit-modal')
    await expect(modal).toBeVisible()
    // The EventForm's first input is the title, pre-filled from the event being edited.
    await expect(modal.locator('input').first()).toHaveValue('Rendez-vous dentiste', { timeout: 10_000 })
  })

  // « Itinéraire » — a rendez-vous whose « Avec » (business/contact) has an address
  // offers one-tap turn-by-turn: the peek opens Google Maps DIRECTIONS to it. The
  // fixture's dentist (e2) rides a business with an address; an address-less event
  // (e1 Garderie) must NOT grow the button.
  test('« Itinéraire » opens Google Maps directions when the rendez-vous has an address', async ({ page }) => {
    // The popup would load the real google.com in CI — stub the route at the context
    // level (popups inherit context routes, not page routes).
    await page.context().route('**/maps/dir/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<title>maps</title>' }),
    )
    await openEventPeek(page)
    await openPeekMenu(page)
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('menuitem', { name: 'Itinéraire' }).click(),
    ])
    expect(popup.url()).toContain('google.com/maps/dir')
    expect(popup.url()).toContain(encodeURIComponent('18 boul. Jacques-Cartier, Sherbrooke'))
    await popup.close()

    // No address → no menu row: the Garderie peek stays Itinéraire-free.
    await page.keyboard.press('Escape')
    await page.locator('.detail-sheet').waitFor({ state: 'hidden' })
    await page.locator('.act', { hasText: 'Garderie' }).first().click()
    await page.locator('.detail-sheet').waitFor({ state: 'visible' })
    await openPeekMenu(page)
    await expect(page.getByRole('menuitem', { name: 'Itinéraire' })).toHaveCount(0)
  })

  test('at phone width the peek’s buttons fill the sheet — the ⋯/✕ float steals no width', async ({ page }) => {
    // Reported from the phone 2026-09-09: the peek's action buttons stopped ~100px short
    // of the right edge and read as off-centre. The cause was pure CSS mechanics, and
    // worth naming because it will happen again: the head cluster (⋯ + ✕) is
    // `float: right` so the TITLE can flow beside it, and `.detail-sheet__body` was a
    // flex column. A flex container establishes a block formatting context, and a BFC may
    // not overlap a float — so the body shrank by the cluster's width for its WHOLE
    // height, not just the title's line. A quarter of a 390px sheet.
    //
    // The body is a block now; the HEAD still shrinks (the title must not run under the
    // buttons), which is why this asserts on both halves rather than on one width.
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await openEventPeek(page)

    const sheet = await boxOf(page.locator('.detail-sheet'))
    const actions = await boxOf(page.locator('.detail-sheet__actions'))
    const head = await boxOf(page.locator('.detail-sheet__head'))
    const menu = await boxOf(page.locator('.detail-sheet .sheet__head-actions'))

    // Symmetric gutters: whatever padding the sheet has on the left, the buttons end the
    // same distance from the right. The bug read as 16px left / 118px right.
    const left = actions.x - sheet.x
    const right = sheet.x + sheet.width - (actions.x + actions.width)
    expect(Math.abs(right - left), `action row gutters: ${left} left vs ${right} right`).toBeLessThan(8)

    // …and the head still yields to the ⋯/✕ cluster, so the title never runs under it.
    expect(head.x + head.width, 'the head stops before the ⋯/✕').toBeLessThanOrEqual(menu.x + 1)
  })
})

// ── folded from journey-events.spec.ts ──────────────────────────────────────────────
test.describe('event-form-bring', () => {
  // « À apporter » on a rendez-vous — the half of the unified event form that the
  // existing coverage stops just short of. screenshots.spec asserts the sections
  // RENDER and that a typed item becomes a chip; what nobody exercised is the round
  // trip that actually matters: pressing « Créer la liste » must POST a real
  // todo_templates list AND select it, so the event saves carrying
  // `bringTemplateId`. If the selection step breaks, everything still LOOKS right —
  // the chips are there, the button is there — and the list silently doesn't ride
  // along on the event. That's the shape of bug this file exists for.
  //
  // The second half: « Prend l'auto ». There is no separate « Trajet » noun (one
  // engagement model — taking the car is a plain yes/no on the rendez-vous), so
  // what's asserted is that the answer reaches the POST body as `carId`, since
  // /api/car resolves the household's car from this very row.

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  const NEW_LIST_ID = 'tt-new'

  async function newEvent(page: Page) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 430, height: 1200 })
    await mockApi(page)
    // The shared harness answers every write with a bare `{ok:true}`. This one create
    // is different in kind: `createBringList` needs the new list's id SYNCHRONOUSLY to
    // attach it to the event (which is also why it's the one `api()` call in the form
    // rather than a queueable `useWrite`). Registered after mockApi so it wins.
    await page.route('**/api/todo-templates', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: NEW_LIST_ID }),
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/event/new')
    await page.locator('form').first().waitFor({ timeout: 15_000 })
  }

  /** Fill the two fields the save button gates on (title + date). Addressed by
   *  accessible name, not `input[type=text]`: EditField's box carries no `type`
   *  ATTRIBUTE (the DOM property still reads "text", so a property probe lies). */
  async function fillMinimum(page: Page, title: string) {
    await page.getByLabel(/^Quoi \?/).fill(title)
    const date = page.getByLabel('Date', { exact: true })
    if (!(await date.inputValue())) await date.fill('2026-09-15')
  }

  test('« Créer la liste » posts the typed items and SELECTS the new list on the event', async ({ page }) => {
    await newEvent(page)
    await page.getByText('À apporter', { exact: true }).click()

    const item = page.getByPlaceholder(/Ajoute un article/)
    await item.fill('souliers')
    await item.press('Enter')
    await item.fill('gourde')
    await item.press('Enter')
    await expect(page.getByRole('button', { name: /souliers/ })).toBeVisible()

    await fillMinimum(page, 'Soccer')

    // The list is created against todo-templates, titled from the event, carrying both
    // typed items in order.
    const [created] = await Promise.all([
      page.waitForRequest(isApi('POST', 'todo-templates')),
      page.getByRole('button', { name: /Créer la liste/ }).click(),
    ])
    expect(created.postDataJSON()).toMatchObject({ title: 'Soccer', items: ['souliers', 'gourde'] })

    // …and it is now SELECTED: the inline builder retires (picking a list IS the
    // list), and the new list shows as the active choice.
    await expect(page.getByPlaceholder(/Ajoute un article/)).toHaveCount(0)

    // The event then saves WITH it attached — the assertion the old coverage stopped
    // short of. The mock answers a create with {id:'new-id'}, so that's what rides.
    const [saved] = await Promise.all([
      page.waitForRequest(isApi('POST', 'events')),
      page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click(),
    ])
    const body = saved.postDataJSON() as { title: string; bringTemplateId: string | null }
    expect(body.title).toBe('Soccer')
    expect(body.bringTemplateId).toBe(NEW_LIST_ID)
  })

  test('an event saved with the draft still typed creates the list first, then attaches it', async ({ page }) => {
    // The trap this closes: typing items and hitting Save WITHOUT pressing « Créer la
    // liste » used to drop the draft on the floor. Submit now creates it on the way out.
    await newEvent(page)
    await page.getByText('À apporter', { exact: true }).click()
    const item = page.getByPlaceholder(/Ajoute un article/)
    await item.fill('serviette')
    await item.press('Enter')
    await fillMinimum(page, 'Piscine')

    const created = page.waitForRequest(isApi('POST', 'todo-templates'))
    const saved = page.waitForRequest(isApi('POST', 'events'))
    await page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click()

    expect((await created).postDataJSON()).toMatchObject({ items: ['serviette'] })
    expect((await saved).postDataJSON()).toMatchObject({ title: 'Piscine' })
    expect(((await saved).postDataJSON() as { bringTemplateId: string | null }).bringTemplateId).toBe(NEW_LIST_ID)
  })

  test('an item chip can be removed before the list is created', async ({ page }) => {
    await newEvent(page)
    await page.getByText('À apporter', { exact: true }).click()
    const item = page.getByPlaceholder(/Ajoute un article/)
    await item.fill('souliers')
    await item.press('Enter')
    await item.fill('gourde')
    await item.press('Enter')

    await page.getByRole('button', { name: 'souliers — Supprimer' }).click()
    await expect(page.getByRole('button', { name: /souliers/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /gourde/ })).toBeVisible()

    await fillMinimum(page, 'Soccer')
    const [created] = await Promise.all([
      page.waitForRequest(isApi('POST', 'todo-templates')),
      page.getByRole('button', { name: /Créer la liste/ }).click(),
    ])
    expect(created.postDataJSON()).toMatchObject({ items: ['gourde'] })
  })

  test('« Prend l’auto » is a plain yes/no on the rendez-vous — the car reaches the POST', async ({ page }) => {
    // One engagement model: there is no « Trajet » entity, so this must arrive as a
    // field on the event. /api/car resolves the household's car from this row, which
    // is why the save also has to invalidate the car cache.
    await newEvent(page)
    await page.getByText('Prend l’auto', { exact: true }).click()

    // The household's cars appear as togglable chips inside the disclosure. Located
    // structurally rather than by name: with a single car the chip IS the yes/no and
    // wears a generic label, so pinning a fixture name would be pinning the wrong thing.
    const carChip = page.locator('.event-transport .cluster button').first()
    await expect(carChip).toBeVisible()
    await expect(carChip).toHaveAttribute('aria-pressed', 'false') // opt-in, not default
    await carChip.click()
    await expect(carChip).toHaveAttribute('aria-pressed', 'true')

    await fillMinimum(page, 'Rendez-vous dentiste')
    const [saved] = await Promise.all([
      page.waitForRequest(isApi('POST', 'events')),
      page.getByRole('button', { name: /Ajouter|Enregistrer/ }).click(),
    ])
    expect((saved.postDataJSON() as { carId: string | null }).carId).toBeTruthy()
  })
})


// ── folded from journey-events.spec.ts ──────────────────────────────────────────────
test3.describe('event-series-pet', () => {
  // Review #31 (2026-11-17), from a parent of two:
  //   « The dog can't be the subject of a rendez-vous. » — the vet, the groomer, the vaccines.
  //   « Repeat rules have no end date or exceptions. » — hockey ends in March, swimming runs
  //   ten weeks, and I can't skip the week the kid is at the other house.

  const AT = BASE + 4 * 3600
  const SERIES = { id: 's1', title: 'Vétérinaire', start_at: AT, all_day: 0, member_id: null, contact_id: null, business_id: null,
    recur_json: JSON.stringify({ freq: 'weekly', interval: 1 }), lead_seconds: null, car_id: null, passengers: JSON.stringify(['pet1']), bring_template_id: null }
  const occurrence = {
    ...BOARD.today[0]!, id: `s1#${AT}`, title: 'Vétérinaire', start_at: AT, member_id: null, passengers: JSON.stringify(['pet1']),
  }
  const PET = { id: 'pet1', name: 'Rex', species: null, breed: null, photoKey: null, colour: '#F2A03D', icon: null, birthday: null,
    microchip: null, feeding: null, sitterNotes: null, vetBusinessId: null, weights: [], notes: null }

  test3.beforeEach(async ({ app, page }) => {
    await page.routeWebSocket(/\/api\/live/, () => {})
    await app.boot({
      clock: 'BASE',
      api: { overrides: { board: { ...BOARD, today: [...BOARD.today, occurrence] }, cercle: { ...CERCLE, pets: [PET] }} },
    })
    // The edit form reads its row by id (`events?id=s1`); writes answer ok.
    await page.route('**/api/events**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? { events: [SERIES] } : { ok: true }) }),
    )
    await page.goto('/board')
  })

  test3('a rendez-vous FOR the dog says so on the board, and the form offers the dog in « Pour qui ? »', async ({ page }) => {
    const row = page.locator('.act', { hasText: 'Vétérinaire' }).first()
    await expect(row).toContainText('Rex')
    await row.click()
    await page.locator('.detail-sheet__actions').getByText('Modifier', { exact: true }).click()
    const pick = page.getByRole('group', { name: 'Pour qui ?' })
    await expect(pick.getByRole('button', { name: 'Rex' })).toHaveAttribute('aria-pressed', 'true')
    // « Jusqu'au »: the series' last day, offered once it repeats.
    await expect(page.getByLabel('Jusqu’au')).toBeVisible()
  })

  test3('« Pas cette fois » skips this one occurrence: PATCH { skipDay } for its local day', async ({ page }) => {
    await page.locator('.act', { hasText: 'Vétérinaire' }).first().click()
    await page.locator('.detail-sheet .action-menu__btn').click()
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/events'),
      (async () => {
        await page.getByRole('menuitem', { name: 'Pas cette fois' }).click()
        await page.locator('.confirm__actions').getByRole('button', { name: 'Pas cette fois' }).click()
      })(),
    ])
    const body = req.postDataJSON() as { id: string; skipDay: number }
    expect(body.id).toBe('s1')
    expect(body.skipDay).toBeLessThanOrEqual(AT)
    expect(AT - body.skipDay).toBeLessThan(86400)
  })
})


// ── folded from journey-events.spec.ts ──────────────────────────────────────────────
test.describe('birthday-gift', () => {
  // A BIRTHDAY WITH A GIFT IDEA WEARS THE GIFT (2026-09-30). « À régler » already nags about
  // a fête two weeks out with NO idea; the other half — « there is one » — only showed after
  // a tap. The row's picture says it now: the gift instead of the cake, nothing added to the
  // row's words. Checked on « À venir », where a birthday sits for the days before it.
  const DAY = 86_400

  test('a birthday with a gift idea wears the gift; one without keeps the cake', async ({ page }) => {
    await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, {
      overrides: {
        board: {
          ...BOARD,
          upcoming: [
            { id: 'bd1', title: 'Fête de Léa', start_at: BASE + 4 * DAY, all_day: 1, member_id: 'm3', birthday: true, gift_ideas: 'Vélo, casque' },
            { id: 'bd2', title: 'Fête de Noah', start_at: BASE + 6 * DAY, all_day: 1, member_id: 'm4', birthday: true, gift_ideas: null },
          ],
        },
      },
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    const card = page.locator('.wg-slot[data-card="upcoming"]')
    const row = (title: string) => card.locator('.act', { hasText: title }).locator('.tile')
    await expect(row('Fête de Léa')).toHaveAttribute('data-icon', 'gift-bold', { timeout: 15_000 })
    await expect(row('Fête de Noah')).toHaveAttribute('data-icon', 'cake-bold')
  })
})


// ── folded from journey-events.spec.ts ──────────────────────────────────────────────
test.describe('sa-fete', () => {
  // « Sa fête » (PLAN-mots A8, accepted 2026-09-25): in the mot composer's « Plus tard », a
  // fourth preset that appears only once the picked recipient has a birthday in the cercle,
  // and sets the mot to surface that morning at 08:00. Scheduling and the derived birthday
  // engine both existed; this is the one-tap join. Still no push — the mot lands on the
  // board like any scheduled one.
  //
  // The clock is frozen at BASE (2025-06-08, 04:00 local) so "next birthday" is a fact of
  // the fixture: Léa's June 15 is a week away, Papa has none.

  const MEMBERS = [
    { id: 'm1', display_name: 'Maman', colour: '#B06A93', is_child: 0, birthday: null },
    { id: 'm2', display_name: 'Papa', colour: '#5891AC', is_child: 0, birthday: null },
    { id: 'm3', display_name: 'Léa', colour: '#88A36F', is_child: 1, birthday: '2019-06-15' },
  ]

  // The phone composer's recipient is a chip that opens the face sheet (FaceSelect →
  // FaceSheet); the kiosk's is a row of faces. This spec runs the phone shape.
  async function pickFace(page: Page, composer: Locator, name: string) {
    await composer.locator('.profile-chip').click()
    const face = page.locator('.sheet.show .profile-face', { hasText: name })
    await expect(face).toBeVisible()
    await face.click()
    await expect(composer.locator('.profile-chip')).toContainText(name)
  }

  async function openComposer(page: Page, width = 390) {
    await page.setViewportSize({ width, height: 844 })
    await page.addInitScript(() => {
      try {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      } catch {
        /* noop */
      }
    })
    await mockApi(page)
    // Registered AFTER mockApi so it wins: the same faces, one of them with a birthday.
    await page.route('**/api/members**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ members: MEMBERS }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.clock.setFixedTime(BASE * 1000)
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.cat-pick[data-mode="mot"]').click()
    const composer = page.locator('.mot-composer')
    await expect(composer).toBeVisible()
    return composer
  }

  test('« Sa fête » shows only for a recipient with a birthday, and sets that morning at 08:00', async ({ page }) => {
    const composer = await openComposer(page)
    await composer.locator('.mot-composer__sched > .btn').click()
    await expect(composer.locator('.mot-composer__presets')).toBeVisible()
    const fete = composer.getByRole('button', { name: 'Sa fête' })

    // Toute la Maisonnée (the default) has no birthday; neither has Papa.
    await expect(fete).toHaveCount(0)
    await pickFace(page, composer, 'Papa')
    await expect(fete).toHaveCount(0)

    // Léa does: the preset appears, and one tap lands on her next birthday morning.
    await pickFace(page, composer, 'Léa')
    await expect(fete).toBeVisible()
    await fete.click()
    await expect(composer.locator('input[type="date"]')).toHaveValue('2025-06-15')
    // TimeField: an hour select and a minute select (always 24 h).
    await expect(composer.locator('.time-field select').nth(0)).toHaveValue('8')
    await expect(composer.locator('.time-field select').nth(1)).toHaveValue('0')

    // Switching back to a face without one hides it again — no stale chip.
    await pickFace(page, composer, 'Maman')
    await expect(fete).toHaveCount(0)
  })

  test('the preset row still fits the sheet at 360px with « Sa fête » in it', async ({ page }) => {
    // The overflow rule (CLAUDE.md): a row of chips wraps, it never bleeds past the sheet's
    // right edge — and the container clips, so this has to be measured per child.
    const composer = await openComposer(page, 360)
    await pickFace(page, composer, 'Léa')
    await composer.locator('.mot-composer__sched > .btn').click()
    await expect(composer.getByRole('button', { name: 'Sa fête' })).toBeVisible()
    const sheet = await boxOf(page.locator('.sheet.show'))
    const chips = composer.locator('.mot-composer__presets > *')
    // Three presets + « Sa fête » (« Me le rappeler » needs a picked profile, and this spec
    // runs as the Maisonnée) — four is the full row here.
    const n = await chips.count()
    expect(n).toBeGreaterThanOrEqual(4)
    for (let i = 0; i < n; i++) {
      const b = await boxOf(chips.nth(i))
      expect(b.x + b.width, `chip ${i} stays inside the sheet`).toBeLessThanOrEqual(sheet.x + sheet.width + 0.5)
    }
  })
})
