import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Ajouter une famille » — /cercle/import?s=<id>, the RECIPIENT side of « Partager une
// famille ». It had no e2e at all, and it is the worst place in the app for that: the
// URL lives in links people have already TEXTED to relatives, the page is reached once
// and never again, and behind one « Ajouter » tap sits the longest unguarded write chain
// in the codebase — create-or-merge each person, copy each photo, create each
// relationship, create each pet and link it to its owner, then build the family group.
// A body assembled wrong here doesn't error: it quietly duplicates a family the person
// already has, or drops the relationships that were the whole point of sharing.
//
// So these tests read the WRITES, not the screen. What they pin:
//   · the full chain fires, in order, with the right bodies (people → links → pets → group)
//   · a person we already know is MERGED (PATCH by id), never added a second time
//   · …and that decision is reversible — the chip flips back to a new fiche
//   · unticking a row really excludes it, and a link to an excluded person is dropped
//   · an expired share says so instead of rendering a broken page
//   · a read-only guest never reaches it
//
// The dedupe cases lean on the shared cercle fixture on purpose (Sophie Gagnon = c4),
// because matchIntakePerson runs against OUR circle — a fixture-local stand-in would
// prove the test's own data, not the matcher.

const PHONE = { width: 390, height: 844 }

interface Write {
  method: string
  path: string
  body: Record<string, unknown>
}

const person = (firstName: string, lastName = '', extra: Record<string, unknown> = {}) => ({
  firstName,
  lastName,
  nickname: '',
  birthday: null,
  gender: null,
  email: '',
  phone: '',
  address: null,
  notes: '',
  photoKey: null,
  ...extra,
})

// Camille shares her household: herself, her son, the parent link between them, and the
// cat. Nobody here is in the fixture cercle, so every person is a fresh fiche.
const SHARE = {
  label: 'Famille Fortier',
  sourceName: 'Camille',
  payload: {
    self: person('Camille', 'Fortier'),
    household: [person('Théo', 'Fortier')],
    links: [{ aIndex: 0, bIndex: 1, type: 'parent' }],
    pets: [{ name: 'Grisou', species: 'chat', photoKey: null, ownerIndex: 0 }],
  },
}

// The same shape with someone we ALREADY have: « Sophie Gagnon » is c4 in the fixture,
// matched on full name by matchIntakePerson.
const SHARE_DUP = {
  label: 'Famille Gagnon',
  sourceName: 'Sophie',
  payload: {
    self: person('Sophie', 'Gagnon'),
    household: [person('Théo', 'Fortier')],
    links: [],
    pets: [],
  },
}

async function boot(page: Page, opts: { share?: unknown; status?: number } = {}): Promise<Write[]> {
  const writes: Write[] = []
  await page.setViewportSize(PHONE)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  // Registered AFTER mockApi so it matches first (Playwright walks handlers newest → oldest).
  // Reads fall through to the shared fixture — this only owns the share itself and the
  // writes the merge makes, each answered with the id the next step needs.
  let n = 0
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
    const method = route.request().method()
    if (path === 'family-share') {
      if (opts.status && opts.status !== 200) {
        return route.fulfill({
          status: opts.status,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Introuvable' }),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(opts.share ?? SHARE),
      })
    }
    if (method !== 'GET' && ['cercle', 'cercle-links', 'cercle-groups', 'pets'].includes(path)) {
      writes.push({ method, path, body: JSON.parse(route.request().postData() || '{}') })
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, id: `${path}-${++n}` }),
      })
    }
    return route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  return writes
}

const review = (page: Page) => page.getByRole('button', { name: 'Réviser et ajouter' })

test('the whole merge chain fires: people, then their link, then the pet, then the family group', async ({ page }) => {
  const writes = await boot(page)
  await page.goto('/cercle/import?s=share-1')
  await expect(page.getByText('Partagé par Camille')).toBeVisible()
  await review(page).click()

  // Two people + one pet are proposed, all preselected.
  await page.getByRole('button', { name: 'Ajouter (3)' }).click()
  await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

  const people = writes.filter((w) => w.path === 'cercle')
  expect(people.map((w) => `${w.method} ${w.body.firstName}`)).toEqual(['POST Camille', 'POST Théo'])

  // The relationship rides the ids the two POSTs just returned — the step most likely to
  // be assembled wrong, and the one whose failure is invisible (the people land, unrelated).
  const links = writes.filter((w) => w.path === 'cercle-links')
  expect(links[0].body).toMatchObject({
    aId: 'cercle-1',
    aKind: 'contact',
    bId: 'cercle-2',
    bKind: 'contact',
    type: 'parent',
  })

  const pets = writes.filter((w) => w.path === 'pets')
  expect(pets).toHaveLength(1)
  expect(pets[0].body).toMatchObject({ name: 'Grisou', species: 'chat' })
  // …and the cat is linked to ITS owner (self, index 0), not to whoever came first.
  expect(links[1].body).toMatchObject({ aId: 'cercle-1', bId: 'pets-4', bKind: 'pet', type: 'owner' })

  // The shared family's NAME becomes a group, and both people join it.
  const groups = writes.filter((w) => w.path === 'cercle-groups')
  expect(groups[0].body).toMatchObject({ name: 'Famille Fortier', kind: 'family' })
  expect(groups.slice(1).map((w) => w.body.personId)).toEqual(['cercle-1', 'cercle-2'])
})

test('someone we already know is MERGED into their fiche, not added a second time', async ({ page }) => {
  const writes = await boot(page, { share: SHARE_DUP })
  await page.goto('/cercle/import?s=share-2')
  await review(page).click()

  // The row says who it will merge into, and it is preselected — a duplicated family is
  // the failure this whole decision exists to prevent.
  await expect(page.getByRole('button', { name: /Fusionner avec Sophie Gagnon/ })).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter (2)' }).click()
  await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

  const people = writes.filter((w) => w.path === 'cercle')
  expect(people).toHaveLength(2)
  // Sophie: PATCH onto the contact we already have. Théo: a genuinely new fiche.
  expect(people[0]).toMatchObject({ method: 'PATCH', body: { id: 'c4', firstName: 'Sophie' } })
  expect(people[1]).toMatchObject({ method: 'POST', body: { firstName: 'Théo' } })
})

test('…and that call is reversible — the chip flips back to a new fiche', async ({ page }) => {
  const writes = await boot(page, { share: SHARE_DUP })
  await page.goto('/cercle/import?s=share-2')
  await review(page).click()

  await page.getByRole('button', { name: /Fusionner avec Sophie Gagnon/ }).click()
  await expect(page.getByRole('button', { name: 'Créer une nouvelle fiche' })).toBeVisible()
  await page.getByRole('button', { name: 'Ajouter (2)' }).click()
  await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

  const people = writes.filter((w) => w.path === 'cercle')
  expect(
    people.every((w) => w.method === 'POST'),
    'nothing is patched once the merge is refused',
  ).toBe(true)
})

test('unticking a person excludes them — and the link that needed them is dropped', async ({ page }) => {
  const writes = await boot(page)
  await page.goto('/cercle/import?s=share-1')
  await review(page).click()

  // Untick Théo (row 2 of person · person · pet).
  await page.locator('.review__row').nth(1).locator('input[type="checkbox"]').uncheck()
  await page.getByRole('button', { name: 'Ajouter la sélection (2)' }).click()
  await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

  expect(writes.filter((w) => w.path === 'cercle')).toHaveLength(1)
  // The parent link has an endpoint that was never imported, so it must not be written.
  expect(writes.filter((w) => w.body.type === 'parent')).toEqual([])
  // The cat still comes, still owned by the one person who did.
  expect(writes.filter((w) => w.path === 'pets')).toHaveLength(1)
  // One person is not a family: no group is invented around them.
  expect(writes.filter((w) => w.path === 'cercle-groups')).toEqual([])
})

test('an expired share says so, instead of a broken page', async ({ page }) => {
  await boot(page, { status: 404 })
  await page.goto('/cercle/import?s=gone')
  await expect(page.getByText('Ce partage n’existe plus ou a expiré.')).toBeVisible()
  await expect(review(page)).toHaveCount(0)
})

test('a read-only guest never reaches the merge at all', async ({ page }) => {
  await boot(page)
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/cercle/import?s=share-1')
  await page.waitForURL(/\/maison\?section=family/)
  await expect(review(page)).toHaveCount(0)
})
