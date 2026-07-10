import { test, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'
import { BOARD_CARDS, type BoardCardId } from '../src/lib/boardCards'

// A VISUAL harness (not a pixel-regression suite) for the board's compact lens: it
// shoots every board card, one at a time, at its three widths —
//   • mini   — a half-width slot on a 360px phone → the compact tile (lib/widgetGrid
//              .isCompact, ~160px < WG_COMPACT_MAX 220), the face we're enriching.
//   • medium — a size-2 slot on a roomy phone.
//   • big    — a full-width slot on a wall tablet.
// It writes tight ELEMENT crops to e2e/screenshots/cards/<id>-<face>.png so a human/
// agent can review "what does each mini actually say" card by card. Run:
//   npx playwright test card-lens-shots
// then look at e2e/screenshots/cards/*.png.
//
// Each card is shot ALONE: every other card is forced to mode 'never' (skips mount),
// the target to 'always' (so an empty card still paints its placeholder) at the size
// we want. The mock fixture (e2e/mocks.ts BOARD) already seeds leftovers/chores/todos/
// events so most cards have real content.

const OTHERS = (keep: BoardCardId): Record<string, 'never'> =>
  Object.fromEntries(BOARD_CARDS.filter((c) => c.id !== keep).map((c) => [c.id, 'never'])) as Record<
    string,
    'never'
  >

type Face = { face: 'mini' | 'medium' | 'big'; width: number; height: number; size: number | 'full'; surface: 'mobile' | 'kiosk' }
const FACES: Face[] = [
  { face: 'mini', width: 360, height: 900, size: 1, surface: 'mobile' },
  { face: 'medium', width: 760, height: 900, size: 2, surface: 'mobile' },
  { face: 'big', width: 1280, height: 900, size: 'full', surface: 'kiosk' },
]

async function shoot(page: Page, card: BoardCardId, f: Face) {
  await page.setViewportSize({ width: f.width, height: f.height })
  // Freeze the clock to the fixture's anchor so today's timed meals/events stay live
  // (lib/itemLife folds "past" timed items into « Déjà passé » against the REAL clock,
  // which otherwise empties the today/fil minis).
  await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, {
    theme: 'day',
    audience: 'parent',
    lang: 'fr',
    calm: true,
    surface: f.surface,
    cardPrefs: { size: { [card]: f.size }, mode: { ...OTHERS(card), [card]: 'always' } },
  })
  await page.goto('/board')
  const slot = page.locator(`.wg-slot[data-card="${card}"]`)
  await slot.first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {})
  await page.waitForTimeout(400)
  await slot
    .first()
    .screenshot({ path: `e2e/screenshots/cards/${card}-${f.face}.png` })
    .catch(async () => {
      // A card that self-hid despite 'always' (or never mounted): shoot the board so the
      // absence is visible rather than a silent skip.
      await page.screenshot({ path: `e2e/screenshots/cards/${card}-${f.face}-MISSING.png` })
    })
}

for (const meta of BOARD_CARDS) {
  test(`card ${meta.id}`, async ({ page }) => {
    for (const f of FACES) await shoot(page, meta.id, f)
  })
}
