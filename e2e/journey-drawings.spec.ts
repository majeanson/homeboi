import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, BOARD } from './mocks'
import { boxOf } from './measure'
import { test as test3 } from './fixtures'

// JOURNEY — DRAWINGS (review #43; was drawings.spec.ts + drawing-zoom.spec.ts + drawing-age.spec.ts).
//
// The drawing collection / gallery (#14). Smoke coverage so CI exercises the new
// surface: the kept drawings render, the ＋ opens the full draw pad, and the
// toddler lens shows the same wall (bigger tiles, no delete).

test.describe('drawings', () => {
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
})

// ── folded from journey-drawings.spec.ts ──────────────────────────────────────────────
test.describe('drawing-zoom', () => {
  // Verifies the DrawPad zoom/pan + pen-takeover (#14) in the running app. Multi-touch
  // pinch can't be driven headlessly, but the wheel zoom exercises the same viewport,
  // and a simulated pen drag exercises the takeover that replaced signature_pad's own
  // input — including drawing WHILE zoomed and the export-flatten-to-1× fix.

  async function openPad(page: Page) {
    await page.goto('/drawings')
    await expect(page.getByRole('heading', { name: 'Mes dessins' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Dessiner' }).click()
    const canvas = page.locator('.drawpad__canvas')
    await expect(canvas).toBeVisible()
    return canvas
  }

  // Drag the pen across the canvas (default mode) — content is detected via the
  // committed PointGroup, so the gallery save isn't treated as empty.
  async function drawStroke(page: Page, box: { x: number; y: number; width: number; height: number }) {
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 10 })
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.35, { steps: 10 })
    await page.mouse.up()
  }

  test('the wheel zooms the canvas; the zoom badge taps back to fit', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    const canvas = await openPad(page)
    const box = await boxOf(canvas)

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600) // zoom in

    // The badge only renders once zoomed past 100%, so its presence proves the zoom.
    const badge = page.locator('.drawpad__zoom')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('%')

    await badge.click() // snap back to fit
    await expect(badge).toHaveCount(0)
  })

  test('a freehand stroke is detected and saved (pen takeover at 1×)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    const canvas = await openPad(page)
    const box = await boxOf(canvas)

    await drawStroke(page, box)

    // Save (Épingler) → the gallery POSTs the drawing. If the takeover left the pad
    // "empty", save() would cancel without a request.
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/drawings') && r.method() === 'POST', { timeout: 10_000 }),
      page.getByRole('button', { name: 'Épingler', exact: true }).click(),
    ])
    expect(req).toBeTruthy()
  })

  test('a stroke drawn WHILE zoomed in still saves', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    const canvas = await openPad(page)
    const box = await boxOf(canvas)

    // Zoom in first…
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -600)
    await expect(page.locator('.drawpad__zoom')).toBeVisible()

    // …then draw at the zoom (coords map screen→content), and save (flattens to 1×).
    await drawStroke(page, box)
    const [req] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/api/drawings') && r.method() === 'POST', { timeout: 10_000 }),
      page.getByRole('button', { name: 'Épingler', exact: true }).click(),
    ])
    expect(req).toBeTruthy()
  })
})


// ── folded from journey-drawings.spec.ts ──────────────────────────────────────────────
test3.describe('drawing-age', () => {
  // Review #13 (2026-11-17), seen by two personas on a phone: beside a drawing on the
  // board, its age stood one word per line, « il / y / a / 65 / j ». The card is a flex
  // row and the stamp got a sliver of it; on a media card it now takes its own line.
  // Review #24 then took the stamp off drawings and photos altogether: a keepsake does not
  // « traîne depuis 65 jours ». A voice memo is still a media card with an age, so it
  // carries the layout guard.

  const DAY = 86_400

  const note = (id: string, media_kind: string, media_key: string) => ({
    ...BOARD.notes[0]!,
    id,
    text: '',
    media_kind,
    media_key,
    created_at: BASE - 65 * DAY,
  })

  test3('a drawing carries no age; a voice memo’s age reads on one line', async ({ app, page }) => {
    await app.boot({
      route: '/board',
      wait: '.hub',
      clock: 'BASE',
      viewport: { width: 390, height: 844 },
      api: { overrides: { board: { ...BOARD, notes: [note('nd1', 'drawing', 'nm_e2e'), note('na1', 'audio', 'nm_audio'), ...BOARD.notes] } } },
    })
    await expect(page.locator('[data-item="nd1"]')).toBeVisible()
    await expect(page.locator('[data-item="nd1"] .note-card__age')).toHaveCount(0)

    const age = page.locator('[data-item="na1"] .note-card__age')
    await expect(age).toContainText('il y a 65 j')
    expect((await boxOf(age)).height).toBeLessThan(20)
  })
})
