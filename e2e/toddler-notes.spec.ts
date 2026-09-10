import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The toddler lens on « Les notes » — and the promise its own hint makes.
//
// The surface says « Touche l'image pour l'écouter », and until 2026-09-10 there was
// no image: every tile drew the same document glyph, differing only by the author's
// tint, so a pre-reader could tell two notes apart only by a WORD they cannot read.
// The kitchen and liste toddler views are genuinely picture-first (a taco, an apple);
// this one — the last tab to get a toddler lens — kept the shape without the picture.
//
// A picture now comes from the first source that knows one:
//   1. the note's OWN media (a drawing, a shared photo) — it IS the note
//   2. a picto from the title, else from the body (`pictoFor`, the list rows' map)
//   3. the kind glyph in the author's colour — the old behaviour, now the fallback
//
// This holds all three, because tier 3 is a legitimate outcome and a regression that
// collapsed everything back to it would otherwise look exactly like "no picto matched".
const NOTE = (over: Record<string, unknown>) => ({
  id: 'x',
  member_id: null,
  author_member_id: null,
  title: '',
  text: '',
  media_kind: null,
  media_key: null,
  scene_key: null,
  position: 0,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
  ...over,
})

const FIXTURE = {
  'family-notes': {
    notes: [
      // 1. its own drawing
      NOTE({ id: 'n1', title: 'Mon dessin', media_kind: 'drawing', media_key: 'draw-key', position: 0 }),
      // 2a. a picto from the TITLE (« Garderie » → 🏫)
      NOTE({ id: 'n2', title: 'Garderie', text: 'apporter les bottes', position: 1, author_member_id: 'm1' }),
      // 2b. nothing in the title, a picto from the BODY (« lait » → 🥛)
      NOTE({ id: 'n3', title: 'Épicerie', text: 'la marque de lait que Léa boit', position: 2 }),
      // 3. nothing anywhere → the kind glyph, still tinted by its author
      NOTE({ id: 'n4', title: 'Zzzzz', text: 'qqqq', position: 3, author_member_id: 'm2' }),
    ],
  },
}

async function kidNotes(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page, { overrides: FIXTURE })
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
  await page.goto('/notes')
  await page.locator('.cercle-kid').waitFor({ state: 'visible', timeout: 15_000 })
}

const card = (page: Page, name: string) => page.locator('.cercle-kid__card', { hasText: name })

test('every note tile carries a picture, from the best source it has', async ({ page }) => {
  await kidNotes(page)

  // 1. the note's own drawing, as the actual image — not a 🖼 glyph in front of it.
  const drawn = card(page, 'Mon dessin')
  await expect(drawn.locator('img.cercle-kid__pic')).toBeVisible()
  await expect(drawn.locator('img.cercle-kid__pic')).toHaveAttribute('src', /draw-key/)

  // 2a / 2b. a picto, from the title and from the body.
  await expect(card(page, 'Garderie').locator('.cercle-kid__emoji')).toHaveText('🏫')
  await expect(card(page, 'Épicerie').locator('.cercle-kid__emoji')).toHaveText('🥛')

  // 3. the fallback is still a real tier, and still wears its author's colour — the
  //    thing that made two untitled notes distinguishable before any of this.
  const plain = card(page, 'Zzzzz')
  await expect(plain.locator('img.cercle-kid__pic')).toHaveCount(0)
  await expect(plain.locator('.cercle-kid__emoji')).toHaveCount(0)
  await expect(plain.locator('svg')).toBeVisible()

  // And the promise the hint makes: four tiles, four DIFFERENT pictures. A pre-reader
  // picks by picture, so "they all render something" is not the same as "you can tell
  // them apart" — which is the state this replaced.
  const pics = await page.locator('.cercle-kid__card').evaluateAll((cards) =>
    cards.map((c) => {
      const img = c.querySelector('img.cercle-kid__pic')
      if (img) return 'img:' + (img.getAttribute('src') ?? '')
      const em = c.querySelector('.cercle-kid__emoji')
      if (em) return 'emoji:' + (em.textContent ?? '')
      const svg = c.querySelector('svg')
      return 'glyph:' + (svg?.getAttribute('color') ?? getComputedStyle(svg as Element).color)
    }),
  )
  expect(new Set(pics).size, `four tiles must not share one picture — got ${pics.join(', ')}`).toBe(pics.length)
})
