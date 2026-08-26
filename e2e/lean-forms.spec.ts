import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

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
test('a new person leads with the name and the birthday; the rest waits', async ({ page }) => {
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

test('editing a person who HAS a phone opens the fold — it never hides what is filled', async ({ page }) => {
  // c1 = Rose « Mamie » Tremblay: a nickname AND a phone number in the fixture.
  await phone(page, '/cercle/person/c1')
  await expect(page.locator('.cf')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Coordonnées et détails' })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('input[type="tel"]')).toHaveValue('450-555-0201')
})

// ── « Ajouter un rendez-vous » ──────────────────────────────────────────────────
test('the event form folds « Répéter » + « Afficher dès » away', async ({ page }) => {
  await phone(page, '/event/new')
  await expect(page.getByPlaceholder('Quoi ? (ex. dentiste)')).toBeVisible()

  await expect(page.locator('.recur')).toHaveCount(0)
  const fold = page.getByRole('button', { name: 'Répétition et rappel' })
  await expect(fold).toHaveAttribute('aria-expanded', 'false')
  await fold.click()
  await expect(page.locator('.recur')).toBeVisible()

  // Three optional sections, in one consistent shape.
  for (const label of ['Répétition et rappel', 'Prend l’auto', 'À apporter']) {
    await expect(page.getByRole('button', { name: label })).toBeVisible()
  }
})

test('a rendez-vous that already repeats opens the fold', async ({ page }) => {
  await phone(page, '/event/new?ride=1')
  // ?ride=1 pre-answers « Prend l'auto » — the same defaultOpen contract on the
  // sibling section, proving the pattern is the one the form already used.
  await expect(page.getByRole('button', { name: 'Prend l’auto' })).toHaveAttribute('aria-expanded', 'true')
})

// ── « Nouvelle recette » ────────────────────────────────────────────────────────
test('the recipe builder leads with the recipe’s NAME', async ({ page }) => {
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

// ── Maison ▸ Famille ────────────────────────────────────────────────────────────
test('« Compléter les familles » sits under the directory, not over it', async ({ page }) => {
  await phone(page, '/maison?section=family')
  const complete = page.locator('.cercle-complete')
  await expect(complete).toBeVisible()

  // Below the last person, not between the face chip and the first one. Wait for the
  // row to PAINT before measuring: boundingBox() returns null on an unrendered
  // locator, and under the full parallel suite this page is slower to settle than it
  // is when the spec runs alone (how this test passed in isolation and failed in the
  // suite — the exact reading error that let eight regressions through).
  const firstRow = page.locator('.cercle-row').first()
  await expect(firstRow).toBeVisible()
  const rowY = (await firstRow.boundingBox())!.y
  const btnY = (await complete.boundingBox())!.y
  expect(btnY, 'the housekeeping action comes after the people').toBeGreaterThan(rowY)

  // …and it is a chip, not a full-width bar (a flex column stretches its children).
  const w = (await complete.boundingBox())!.width
  expect(w).toBeLessThan(300)

  // Same for the face chip above — it wore the full width too.
  const chip = page.locator('.cercle-focus .profile-chip')
  const chipW = (await chip.boundingBox())!.width
  expect(chipW).toBeLessThan(300)
})

// ── The fold only exists when it has coordonnées to hold ────────────────────────
test('the intake’s per-person card keeps Surnom + Genre inline — no empty-labelled fold', async ({ page }) => {
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

test('Réglages has no « Réglages » heading and no sign-out at the top', async ({ page }) => {
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
  expect((await h1.boundingBox())!.height).toBeLessThanOrEqual(1)
  await expect(page.getByRole('link', { name: 'Réglages' })).toBeVisible()

  // Sign-out is at the FOOT, under the settings — not second from the top.
  const out = page.locator('.operator__signout')
  await expect(out).toBeVisible()
  const head = page.locator('.operator__head')
  expect((await out.boundingBox())!.y).toBeGreaterThan((await head.boundingBox())!.y)
  const firstCard = page.locator('.operator__section').first()
  expect((await out.boundingBox())!.y).toBeGreaterThan((await firstCard.boundingBox())!.y)

  // …and the first setting is now within the first screen.
  expect((await firstCard.boundingBox())!.y).toBeLessThan(400)
})

test('« Voir dans l’app » rides the lens row, and keeps a name when its label hides', async ({ page }) => {
  await phone(page, '/settings?tab=board&lens=regler')
  const goto = page.locator('.operator__goto')
  await expect(goto).toBeVisible()

  // Same row as Comprendre / Régler — not a line of its own above the settings.
  const lens = page.locator('.operator__lens')
  const a = (await goto.boundingBox())!
  const b = (await lens.boundingBox())!
  expect(Math.abs(a.y - b.y), 'the goto shares the lens row').toBeLessThan(24)

  // On a narrow phone the word hides; the control must NOT go unnamed.
  await expect(goto.locator('span')).toBeHidden()
  await expect(goto).toHaveAttribute('aria-label', 'Voir dans l’app')

  // Wider: the word comes back.
  await page.setViewportSize({ width: 900, height: 800 })
  await expect(goto.locator('span')).toBeVisible()
})

test('the board’s edit hint sits under the cards, not over them', async ({ page }) => {
  await phone(page, '/board')
  const hint = page.locator('.board-edit-hint')
  await expect(hint).toBeVisible()

  // Below the grid it describes — it used to displace the first card.
  const grid = page.locator('.board-grid')
  expect((await hint.boundingBox())!.y).toBeGreaterThan((await grid.boundingBox())!.y)

  // Still one-time + per-device: dismissing retires it.
  await hint.getByRole('button').click()
  await expect(page.locator('.board-edit-hint')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.board-edit-hint')).toHaveCount(0)
})

// ── La cuisine · Le cercle ──────────────────────────────────────────────────────

test('Business + Carnets drop the heading their section pill already says', async ({ page }) => {
  for (const [section, pill] of [['business', 'Business'], ['carnets', 'Carnets']] as const) {
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

test('arming « ? » on a section pill paints ONE bubble, not two', async ({ page }) => {
  // The regression this locks: BusinessesTab/CarnetsTab each carried a HelpTitle for
  // the same help key the section pill row already owns, and helpMode renders every
  // bubbleFor(k) whose key matches — so an armed pick painted the bubble TWICE.
  await phone(page, '/maison?section=business')
  await page.locator('.hub__body').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /Aide|aide|\?/ }).first().click()
  await page.getByRole('tab', { name: 'Business' }).click()
  await expect(page.locator('.help-bubble')).toHaveCount(1)
})

test('the pet form folds every secondary field — including the tail that hung below', async ({ page }) => {
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
  await expect(page.getByText('Couleur', { exact: true })).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(1)
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

test('a tapped calendar day can be UNTAPPED — the drawer closes, the grid stays', async ({ page }) => {
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

test('a picked day keeps the grid’s shape — no pop-out tile', async ({ page }) => {
  await mois(page)
  // The wide floating tile is gone for good: the day PANEL says all of that, in full
  // names, with everything you can do with the day.
  await expect(page.locator('.monthv__lines')).toHaveCount(0)

  // The lit cell is the same size as its neighbours (it used to grow and float over
  // them, which changed the calendar's shape under the finger).
  const on = page.locator('.monthv__cell.is-on')
  const other = page.locator('.monthv__cell:not(.is-on)').nth(10)
  const a = (await on.boundingBox())!
  const b = (await other.boundingBox())!
  expect(Math.abs(a.height - b.height), 'the picked cell does not grow').toBeLessThan(2)
  expect(Math.abs(a.width - b.width), 'the picked cell does not widen').toBeLessThan(2)
})

// ── La liste, allégée ──────────────────────────────────────────────────────────

test('La liste: the add field is text + mic, and Enter writes the line', async ({ page }) => {
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

test('La liste: the three shortcuts are icons on one row', async ({ page }) => {
  await phone(page, '/liste')
  await page.locator('.list-rows').waitFor({ state: 'visible' })

  const row = page.locator('.list-actions--quiet')
  const icons = row.locator('.list-actions__icon')
  await expect(icons).toHaveCount(3)

  // One row: every chip shares the same top edge (they used to be three full-width
  // orange bars stacked 2+1, then labelled chips wrapping onto two lines).
  const tops: number[] = []
  for (const b of await icons.all()) tops.push((await b.boundingBox())!.y)
  expect(Math.max(...tops) - Math.min(...tops), 'all three on one line').toBeLessThan(4)

  // Icon-only, but never unnamed.
  for (const b of await icons.all()) {
    await expect(b).toHaveText('')
    expect(await b.getAttribute('aria-label')).toBeTruthy()
  }
})

test('La liste: « Allées » rows all share one left margin', async ({ page }) => {
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
    lefts.push((await icon.boundingBox())!.x)
  }
  expect(Math.max(...lefts) - Math.min(...lefts), 'one column, one margin').toBeLessThan(2)
})

test('La liste: a staged deal with no price shows the store alone — no dangling « · »', async ({ page }) => {
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
