import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The toddler lens on Maison's cercle sections (`?section=family|social|…`) —
// « C'est qui ? », a grid of faces a pre-reader taps to hear a name and then see who
// that person's family is. It was the last kid surface with no e2e, and it is the one
// carrying real LOGIC rather than a rendering: every card is computed twice over, and
// both computations are invisible on a screenshot.
//
//   · the label is read from the OTHER person's side. Tapping Léa, her mother's card
//     says « Mère » — the inverse of Léa's own role in that link. Read the wrong way it
//     says « Fille » under Maman's face, which is exactly wrong and looks fine.
//   · relationships are CLOSED (closedLinks): a grandparent linked once to a parent
//     shows for the grandchild too, without a stored link between them.
//   · nothing here writes. A toddler kiosk has no in-app escape (the one-way door), so
//     a stray write from a wandering finger would be unattributable and unreachable.
//
// The fixture cercle is the shared one on purpose: it holds a real household (Maman,
// Papa, two children) plus grandparents one hop away, which is the shape the closure
// exists for.

async function kidMaison(page: Page, section = 'family') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
  await page.goto(`/maison?section=${section}`)
  await page.locator('.cercle-kid').waitFor({ state: 'visible', timeout: 15_000 })
}

const card = (page: Page, name: string) => page.locator('.cercle-kid__card', { hasText: name })
const rel = (page: Page, name: string) => page.locator('.cercle-kid__rel-card', { hasText: name })

test('the kid lens shows faces, not the parent directory', async ({ page }) => {
  await kidMaison(page)
  await expect(page.locator('.cercle-kid__grid')).toBeVisible()
  await expect(card(page, 'Léa')).toBeVisible()
  // The control: the parent Maison's section pills are not rendered on this face.
  await expect(page.locator('.subtabs')).toHaveCount(0)
})

test('a tapped face names each relative by THEIR role toward the child', async ({ page }) => {
  await kidMaison(page)
  await card(page, 'Léa').click()

  // Léa is the hero; the cards around her are the other people.
  await expect(page.locator('.cercle-kid--focused .cercle-kid__name').first()).toHaveText('Léa')
  // Maman is Léa's MOTHER — not « Fille », which is what reading the link from Léa's
  // own side would print under her mother's face.
  await expect(rel(page, 'Maman').locator('.cercle-kid__rel-label')).toHaveText('Mère')
  await expect(rel(page, 'Papa').locator('.cercle-kid__rel-label')).toHaveText('Père')
})

test('…including the ones nobody stored — a grandparent shows for the grandchild', async ({ page }) => {
  await kidMaison(page)
  await card(page, 'Léa').click()

  // Rose is linked to Maman, never to Léa. The closure is what puts her here.
  await expect(rel(page, 'Rose')).toBeVisible()
  await expect(rel(page, 'Rose').locator('.cercle-kid__rel-label')).toHaveText('Grand-mère')
})

test('the face grid comes back, and nothing was ever written', async ({ page }) => {
  await kidMaison(page)
  const writes: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (r.method() !== 'GET' && u.pathname.startsWith('/api/')) writes.push(`${r.method()} ${u.pathname}`)
  })

  await card(page, 'Léa').click()
  await rel(page, 'Maman').click() // reads the relation aloud — a read, nothing more
  await page.locator('.cercle-kid__back').click()
  await expect(page.locator('.cercle-kid__grid')).toBeVisible()

  expect(writes, 'the toddler cercle is read-only, and the kid lens has no way back out').toEqual([])
})
