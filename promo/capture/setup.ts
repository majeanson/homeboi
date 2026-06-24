import type { Page } from '@playwright/test'
import { mockApi, seedState, type Lang } from '../../e2e/mocks'
import type { Beat, SurfaceName } from '../scripts/types'

// One fixed promo "now" so EVERY beat agrees on the date. The e2e mocks mix the real
// clock on the board (it showed "24 juin") with a fixed June-8 anchor in the kitchen/
// auto ("8 juin") — fine for tests, but a polished promo can't show two different
// "todays" across cuts. Freezing the page clock to the fixture's own anchor day makes
// the board, kitchen, auto and flyer dates all read the same Monday afternoon.
// 2026-06-08 14:00 America/Toronto (EDT = UTC-4) → a warm "Bon après-midi".
export const PROMO_NOW = Date.UTC(2026, 5, 8, 18, 0, 0)
const DAY = 86_400_000

// Real flyer deals for the « circulaires » beat. Identical shape to /api/deals, but
// with dates the card can format (the e2e fixture put validTo in SECONDS, which the
// DealCard reads as ms → "jusqu'au 21 janv. 1970"). Anchored to PROMO_NOW in ms.
const PROMO_DEALS = {
  deals: [
    { id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, wasPrice: 6.49, unitPrice: 1.25, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'Super C', logo: null, premium: true, image: null, validFrom: PROMO_NOW - 2 * DAY, validTo: PROMO_NOW + 5 * DAY },
    { id: 102, flyerId: 5002, name: 'Lait 1% 2L', price: 2.99, wasPrice: 3.79, unitPrice: 1.5, unitLabel: '/L', unitKind: 'volume', unitApprox: false, merchant: 'IGA', logo: null, premium: true, image: null, validFrom: PROMO_NOW - 2 * DAY, validTo: PROMO_NOW + 5 * DAY },
  ],
}

// Shared per-beat page prep for BOTH the video capture and the still preview, so the
// two drive the app identically: API stubs, a frozen clock, the welcome card dismissed,
// then the seed (with the toddler override when recording a PiP take).
export async function preparePage(
  page: Page,
  beat: Beat,
  surface: SurfaceName,
  lang: Lang,
  opts: { pip?: boolean } = {},
) {
  await mockApi(page, beat.mock ?? {})
  // Override the date-sensitive deals route AFTER mockApi (Playwright runs the last
  // registered handler first), so the « circulaires » deal cards show a real date.
  await page.route('**/api/deals*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROMO_DEALS) })
  })
  // Freeze the clock so every beat's date agrees (and runs are deterministic).
  await page.clock.setFixedTime(new Date(PROMO_NOW))
  await page.addInitScript(() => {
    try {
      localStorage.setItem('babillard-welcome', JSON.stringify({ dismissed: true, done: [] }))
    } catch {
      /* noop */
    }
  })
  const isMarketing = beat.mock?.signedIn === false
  await seedState(page, {
    theme: 'day',
    audience: 'parent',
    lang,
    calm: true,
    surface: isMarketing ? undefined : surface === 'wall' ? 'kiosk' : 'mobile',
    ...beat.seed,
    // A PiP take records the SAME view in kid mode (toddler audience), + overrides.
    ...(opts.pip ? { audience: 'toddler', ...(beat.pip?.seed ?? {}) } : {}),
  })
}
