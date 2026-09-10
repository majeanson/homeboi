import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The drawing collection / gallery (#14). Smoke coverage so CI exercises the new
// surface: the kept drawings render, the ＋ opens the full draw pad, and the
// toddler lens shows the same wall (bigger tiles, no delete).

test('gallery renders the kept drawings and opens the draw pad', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  await page.goto('/drawings')
  await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible({ timeout: 15_000 })
  // Two kept drawings from the fixture.
  await expect(page.locator('.drawgallery__item')).toHaveCount(2)

  // ＋ Dessiner opens the full pad (full-screen overlay with the tool bar).
  await page.getByRole('button', { name: 'Dessiner' }).click()
  await expect(page.locator('.drawpad')).toBeVisible()
  await expect(page.locator('.drawpad__canvas')).toBeVisible()
})

test('toddler gallery shows the wall without delete controls', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 1280 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })

  await page.goto('/drawings')
  await expect(page.locator('.drawgallery__grid--kid')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.drawgallery__item')).toHaveCount(2)
  // Toddler lens never exposes destructive delete.
  await expect(page.locator('.drawgallery__del')).toHaveCount(0)
})

// A tile's overlay controls belong over the PICTURE, never over the credit line.
//
// `.drawgallery__item` is the positioned ancestor and it is taller than the drawing
// (image, then « qui · quand »), so a `bottom`-anchored overlay lands on the credit
// rather than on the picture. That is what shipped: the pin sat straight over the
// author's face and the first letters of their name — visible in any screenshot of
// the wall, and invisible to every assertion, because overlapping boxes still render
// and still pass a visibility check (2026-09-10).
//
// Measured, not eyeballed: two boxes overlap or they do not.
test('the pin never covers who drew it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/drawings')
  await expect(page.locator('.drawgallery__item').first()).toBeVisible({ timeout: 15_000 })

  const hits = await page.locator('.drawgallery__item').evaluateAll((items) =>
    items
      .map((item) => {
        const box = (sel: string) => {
          const el = item.querySelector(sel)
          return el ? el.getBoundingClientRect() : null
        }
        const credit = box('.drawgallery__meta')
        const img = box('.drawgallery__open img') ?? box('.drawgallery__img')
        const overlaps = (a: DOMRect | null, b: DOMRect | null) =>
          !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
        return ['.drawgallery__pin', '.drawgallery__del']
          .map((sel) => {
            const c = box(sel)
            if (!c) return null
            if (overlaps(c, credit)) return `${sel} covers the credit line`
            // …and it must actually be ON the picture, not floating in the gap.
            if (!overlaps(c, img)) return `${sel} sits outside the drawing`
            return null
          })
          .filter(Boolean)
      })
      .flat(),
  )
  expect(hits, 'a tile overlay must sit on the drawing, never on « qui · quand »').toEqual([])
})
