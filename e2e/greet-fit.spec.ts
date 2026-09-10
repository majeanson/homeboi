import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { localDayStart } from '../src/lib/localDay'

// THE GREETING IS NEVER CUT — in either language, on the phone widths this app is
// actually used at.
//
// It has now been broken twice by the same shape of fix. 2026-07-14: a fixed 32px
// ellipsized « Bon apr… », and the answer was `font-size: clamp(16px, 4.4vw, 32px)`.
// 2026-09-10: the state matrix photographed « Good afterno… » at 390px — the vw
// clamp is a GUESS at the room the title has, and it under-shot by a few pixels in
// the language nobody was looking at. Measured, FR was cut at 360 too.
//
// The room is knowable: the header's right-hand cluster is a fixed 197px of round
// buttons, so `.app-head__main` IS the room, and `.greet` sizes off it with `cqw`
// (a container query) instead of `vw`. That can only stay true if something checks
// it in both languages — the matrix shoots one language per state, which is exactly
// how half of this bug hid.
//
// « après-midi » / « afternoon » is the longest greeting, so the clock is pinned to
// the afternoon: testing the short one would pass over the bug.
const AFTERNOON = localDayStart(new Date()) + 13 * 3600 + 20 * 60

// 320px is deliberately NOT here: below ~76px of room there is no honest wrap (FR
// breaks « après-midi » at its own hyphen onto three lines), so that width keeps the
// one-line ellipsis on purpose — see the @container block in today.css. 360 is the
// floor this suite hardened to (mobile pass, 2026-07-03).
for (const lang of ['fr', 'en'] as const)
  for (const width of [360, 390, 430]) {
    test(`the greeting fits whole — ${lang} @${width}px`, async ({ page }) => {
      await page.clock.setFixedTime(new Date(AFTERNOON * 1000))
      await page.setViewportSize({ width, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang, surface: 'mobile' })
      await page.goto('/board')
      const greet = page.locator('.greet').first()
      await expect(greet).toBeVisible()

      const m = await greet.evaluate((el) => {
        // The text's own rects, not the element's — an ellipsized line still reports
        // the element's clipped width, so asking the BOX whether it overflowed is how
        // a truncation check comes back green over a visible « … ».
        const r = document.createRange()
        r.selectNodeContents(el)
        const lines = Array.from(r.getClientRects())
        const box = el.getBoundingClientRect()
        return {
          text: el.textContent ?? '',
          widest: Math.max(...lines.map((l) => l.width)),
          boxW: box.width,
          font: parseFloat(getComputedStyle(el).fontSize),
        }
      })

      expect(m.text.length, 'the afternoon greeting is the long one — pin the clock').toBeGreaterThan(9)
      expect(
        Math.round(m.widest),
        `« ${m.text} » is ${Math.round(m.widest)}px wide in a ${Math.round(m.boxW)}px box at ${m.font}px — it is being cut`,
      ).toBeLessThanOrEqual(Math.round(m.boxW) + 1)
      // …and not by shrinking into unreadability instead.
      expect(m.font, 'the greeting must stay legible, not fit by vanishing').toBeGreaterThanOrEqual(14)
    })
  }
