import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// The board's compact lens (lib/widgetGrid.isCompact + components/board/CardLens): a
// card halved on a phone renders a genuinely small tile — icon + title + at most one
// quiet hint — instead of a squeezed full card, and grows to the zone's full width in
// place when tapped. Modeled on board-edit.spec.ts's helpers.
//
// « today » (mode 'always', so it's never empty) is the halved card throughout: its
// default META size is already 1, but an UN-SIZED card falls back to 'full' on a narrow
// grid (CardSlot's `grid?.narrow ? 'full' : undefined` fallback), so the compact form
// only shows up once a device has actually CHOSEN a half — exactly what seeding
// `cardPrefs.size` here reproduces.
const HOLD = 700 // > LONG_PRESS_MS (500), mirrors board-edit.spec.ts

const open = async (page: Page, size: Record<string, number> = { today: 1 }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await mockApi(page)
  await seedState(page, { cardPrefs: { size } })
  await page.goto('/board')
  await page.waitForSelector('.board-grid .wg-slot')
}

// `page.mouse` works in viewport coordinates and never scrolls — bring the element into
// view first, same rule board-edit.spec.ts follows.
const boxOf = async (page: Page, sel: string) => {
  const loc = page.locator(sel)
  await loc.scrollIntoViewIfNeeded()
  return (await loc.boundingBox())!
}

/** Press and hold the top edge of a card, without moving, to arm edit mode. */
async function hold(page: Page, card: string, ms = HOLD) {
  const box = await boxOf(page, `.wg-slot[data-card="${card}"]`)
  await page.mouse.move(box.x + box.width / 2, box.y + 12)
  await page.mouse.down()
  await page.waitForTimeout(ms)
  await page.mouse.up()
}

test.describe('board compact lens', () => {
  test('a halved card renders its mini tile — icon + title, no mid-word wrap', async ({ page }) => {
    await open(page)
    const tile = page.locator('.wg-slot[data-card="today"] .cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toBeVisible()
    await expect(tile).toHaveAttribute('aria-expanded', 'false')
    await expect(tile.locator('.cardmini__ico')).toBeVisible()

    const title = tile.locator('.cardmini__title')
    await expect(title).toBeVisible()
    // The mini wears the short title (compactLabel) — « Aujourd'hui » ellipsizes once the
    // weather chip shares the 142px header, so the compact face reads « Auj. ».
    await expect(title).toHaveText('Auj.')

    // Never a squeezed full card ("Spaghetti" → "Spaghet/ti"): the title box must fit
    // within its 2-line clamp, not a taller stack of one-word-per-line wraps. Reading
    // clientHeight (not scrollHeight) catches the clamp actually engaging.
    const { height, lineHeight } = await title.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { height: el.getBoundingClientRect().height, lineHeight: parseFloat(cs.lineHeight) }
    })
    expect(height).toBeLessThanOrEqual(lineHeight * 2 + 1)

    // Two corner tap targets on the day tile — a pencil to « Planifier » (the day plan) and
    // a key to « Avant de partir » (the checklist) — so a halved « Auj. » reaches both
    // without growing first. Each is a Link OUTSIDE the tile's button (a sibling), never
    // nested-interactive inside it.
    const corners = page.locator('.wg-slot[data-card="today"] .cardmini__corner')
    await expect(corners).toHaveCount(2)
    await expect(page.locator('.wg-slot[data-card="today"] .cardmini__corner[href*="/kitchen/day/"]')).toHaveCount(1)
    await expect(page.locator('.wg-slot[data-card="today"] .cardmini__corner[href$="/board/departure"]')).toHaveCount(1)
    await expect(tile.locator('.cardmini__corner'), 'the corners are siblings, not inside the button').toHaveCount(0)
  })

  // #root/.hub__body clip overflow-x, so a too-wide child is HIDDEN, not caught by a
  // scrollWidth check — measure every visible descendant's own right edge instead
  // (same technique as board-edit.spec.ts's "does not bleed off the right edge" test).
  test('every visible child of the mini tile stays inside its own right edge', async ({ page }) => {
    await open(page)
    await page.locator('.wg-slot[data-card="today"] .cardmini').scrollIntoViewIfNeeded()

    const bad = await page.evaluate(() => {
      const tile = document.querySelector('.wg-slot[data-card="today"] .cardmini') as HTMLElement
      const right = tile.getBoundingClientRect().right
      const out: string[] = []
      for (const el of [tile, ...tile.querySelectorAll('*')]) {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && r.right > right + 1) out.push((el as HTMLElement).className)
      }
      return out
    })
    expect(bad, `overflowing: ${bad.join(' | ')}`).toEqual([])
  })

  test('tap grows the card in place; the reduce chip shrinks it back', async ({ page }) => {
    await open(page)
    const slot = page.locator('.wg-slot[data-card="today"]')
    const tile = slot.locator('.cardmini')
    const compactBox = await boxOf(page, '.wg-slot[data-card="today"] .cardmini')
    const gridBox = await boxOf(page, '.board-grid')

    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    await tile.click()

    await expect(slot).toHaveAttribute('data-expanded', '')
    const grownBox = (await slot.boundingBox())!
    expect(grownBox.width).toBeGreaterThan(compactBox.width * 1.5)
    // The zone's full measured width — same grid the neighbours reflow inside.
    expect(grownBox.width).toBeCloseTo(gridBox.width, 0)

    // The mini tile is gone; the ordinary header + rows are back.
    await expect(slot.locator('.cardmini')).toHaveCount(0)
    const reduce = slot.locator('.sec-label__reduce')
    await expect(reduce).toHaveAttribute('aria-expanded', 'true')
    await expect(slot.locator('.act, .sec-label')).not.toHaveCount(0)

    await reduce.click()
    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    await expect(slot.locator('.cardmini')).toBeVisible()
    const backBox = (await slot.boundingBox())!
    // Back to a half column, not necessarily the exact same sub-pixel width (a
    // neighbour's row-span can nudge the grid's rounding by a pixel or two).
    expect(Math.abs(backBox.width - compactBox.width)).toBeLessThan(6)
  })

  test('single-open: expanding a second card collapses the first', async ({ page }) => {
    await open(page, { today: 1, toFinish: 1 })
    const today = page.locator('.wg-slot[data-card="today"]')
    const toFinish = page.locator('.wg-slot[data-card="toFinish"]')

    await today.locator('.cardmini').scrollIntoViewIfNeeded()
    await today.locator('.cardmini').click()
    await expect(today).toHaveAttribute('data-expanded', '')

    await toFinish.locator('.cardmini').scrollIntoViewIfNeeded()
    await toFinish.locator('.cardmini').click()
    await expect(toFinish).toHaveAttribute('data-expanded', '')
    // Only one card is ever grown at a time.
    await expect(today).not.toHaveAttribute('data-expanded', /.*/)
    await expect(today.locator('.cardmini')).toBeVisible()
  })

  // The tile NAMES what it holds when the rows fit (lib/widgetGrid.WG_MINI_MAX_ITEMS) —
  // « À finir » should say « Pâté chinois », not « 1 ». The fixtures give it exactly one
  // leftover, so the list face is what a household actually sees here.
  test('a mini names its rows when they fit, instead of counting them', async ({ page }) => {
    await open(page, { toFinish: 1 })
    const tile = page.locator('.wg-slot[data-card="toFinish"] .cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toHaveClass(/cardmini--list/)
    await expect(tile.locator('.cardmini__title')).toHaveText('À finir')

    const rows = tile.locator('.cardmini__row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toHaveText('Pâté chinois')
    // The list face replaces the count hint — a tile never says both.
    await expect(tile.locator('.cardmini__hint')).toHaveCount(0)
  })

  // The list face carries MORE than bare titles now: a chronological card leads each
  // timed row with its hour (« Aujourd'hui », « Le fil », « À venir » with a weekday), and
  // « Aujourd'hui » / « Demain » pin a quiet weather chip to the header. Both ride the same
  // fixed-height tile — this guards that they render without breaking the shelf.
  test('a chronological mini leads its rows with a time and shows a weather chip', async ({ page }) => {
    // Freeze to the fixture's anchor so the timed events stay live (else lib/itemLife folds
    // them into « Déjà passé » vs the real clock and the tile falls to its glance face with
    // no rows to lead).
    //
    // « Demain » is the card under test, NOT « Aujourd'hui ». This asserted the today tile
    // until « Aujourd'hui » absorbed the day's timeline: it now names the timed events, the
    // work windows, the chores AND the all-day items, so the fixture's busy day runs past
    // WG_MINI_MAX_ITEMS (5) and the tile shows a COUNT instead of rows — deliberately
    // ("naming five of nine is a lie the count tells better", lib/widgetGrid). That is the
    // glance face, so the list-face assertions below could never hold there again. « Demain »
    // is the same chronological + weather-chipped tile with a day short enough to list, so it
    // still guards exactly what this test is for. The today tile's count is asserted below.
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.setViewportSize({ width: 360, height: 740 })
    await mockApi(page)
    await seedState(page, { cardPrefs: { size: { today: 1, tomorrow: 1 } } })
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')

    const tile = page.locator('.wg-slot[data-card="tomorrow"] .cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toHaveClass(/cardmini--list/)
    // A timed event row leads with its hour (the fixture's « Épicerie » is timed).
    await expect(tile.locator('.cardmini__lead').first()).toBeVisible()
    // The weather chip rides the header (the fixture stubs weather).
    await expect(tile.locator('.cardmini__headx')).toBeVisible()
    // Still one shelf tall — the extras must not spill past the fixed height.
    const spill = await tile.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(spill, 'the list face must not overflow its fixed height').toBeFalsy()

    // The other half of the contract: a day too full to name falls to the glance face and
    // says HOW MANY — with the weather chip still pinned to its header.
    const today = page.locator('.wg-slot[data-card="today"] .cardmini')
    await expect(today).toHaveClass(/cardmini--glance/)
    await expect(today.locator('.cardmini__hint')).toBeVisible()
    await expect(today.locator('.cardmini__headx')).toBeVisible()
  })

  // The weather mini is a MEDIA tile (the wonder photo), but it keeps the full card's info
  // that fits: the condition word (« Dégagé ») + temp on top, and the same three
  // few-hours-ahead windows along the bottom — not just a bare temperature chip.
  test('the weather mini keeps the condition word and its three hour windows', async ({ page }) => {
    await open(page, { heroes: 1 })
    const tile = page.locator('.wg-slot[data-card="heroes"] .cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toHaveClass(/cardmini--media/)
    // The condition label (bucket 'clear' → « Dégagé » in the fixture) rides the top.
    await expect(tile.locator('.cardmini__wx-cond')).toHaveText('Dégagé')
    // The three windows the mock's `hours` outlook provides ride the bottom.
    await expect(tile.locator('.cardmini__wx-hour')).toHaveCount(3)
    // Still one shelf tall — the extras must not spill past the fixed media height.
    const spill = await tile.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
    expect(spill, 'the weather mini must not overflow its fixed height').toBeFalsy()
  })

  // The stagger, as a test. Minis used to be MEASURED, so two tiles whose natural heights
  // straddled a 24px row boundary claimed different spans and the two columns drifted
  // apart for the rest of the board. Now every mini claims WG_MINI_ROWS without measuring.
  test('every mini is one shelf tall, and the columns never stagger', async ({ page }) => {
    // This measures LAYOUT, and a tile mounts with a one-shot `scale(0.97)` pop — a card
    // whose data lands late would otherwise be caught mid-animation and read ~3px short.
    // The pop is already gated behind `prefers-reduced-motion`, so ask for stillness.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Size every halvable grid card to a half, so the minis are contiguous and the rows
    // they form must pair up. (`reconcile` drops the ones that refuse a half.)
    await open(page, {
      autoCard: 1, today: 1, departure: 1, routineNext: 1, habitudes: 1, tomorrow: 1, countdown: 1,
      toFinish: 1, todos: 1, upcoming: 1, cercleNotes: 1, voyage: 1, carnets: 1, seasonUpkeep: 1, photos: 1,
    })
    await page.waitForSelector('.board-grid .wg-slot .cardmini')

    const geom = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('.board-grid .wg-slot')].filter((s) => s.querySelector('.cardmini'))
      const round = (n: number) => Math.round(n)
      return slots.map((s) => {
        const slot = s.getBoundingClientRect()
        const tile = s.querySelector('.cardmini')!.getBoundingClientRect()
        return { slotH: round(slot.height), tileH: round(tile.height), top: round(slot.top) }
      })
    })
    expect(geom.length, 'the fixtures should render several halved cards').toBeGreaterThan(2)

    // One shelf: every tile the same height, and every slot exactly as tall as its tile.
    // The second equality is the constant row span and `--wg-mini-h` agreeing (the pair
    // widgetGrid.test locks) — a slot taller than its tile means the card is spilling into
    // the gutter, which is how `.bento--tinted`'s border used to sneak 2px back in.
    const tileHs = [...new Set(geom.map((g) => g.tileH))]
    expect(tileHs).toHaveLength(1)
    expect([...new Set(geom.map((g) => g.slotH))]).toEqual(tileHs)

    // Aligned: with uniform spans the tiles pair off into rows, so all but at most one
    // (a lone trailing tile) share their top edge with a neighbour. A staggered board
    // shares none.
    const tops = geom.map((g) => g.top)
    const paired = tops.filter((t) => tops.filter((u) => Math.abs(u - t) <= 1).length > 1).length
    expect(paired, `tops: ${tops.join(',')}`).toBeGreaterThanOrEqual(geom.length - 1)
  })

  // « Toujours afficher » on a card with nothing to say. It keeps its colour and SAYS it
  // is empty (a dashed edge + one quiet word) — it used to render as an anonymous grey box.
  test('an empty « always » card keeps its colour and says it is empty', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await mockApi(page)
    // « Les carnets » holds nothing in the fixtures, and `always` keeps its place anyway.
    await seedState(page, { cardPrefs: { size: { carnets: 1 }, mode: { carnets: 'always' } } })
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')

    const slot = page.locator('.wg-slot[data-card="carnets"]')
    const tile = slot.locator('.cardmini')
    await tile.scrollIntoViewIfNeeded()
    await expect(tile).toBeVisible()
    await expect(tile).toHaveClass(/wg-slot__placeholder/)
    await expect(tile.locator('.cardmini__hint')).toHaveText('Rien')

    // An empty pinned card with a natural "add one" page (« Les carnets » → Le cercle)
    // taps STRAIGHT THERE instead of growing into a « Rien pour l'instant » shell: the tile
    // is an anchor, not a grow-button (BOARD_CARDS[].emptyTo → CardSlot → compactTo).
    await expect(tile).toHaveJSProperty('tagName', 'A')
    await expect(tile).toHaveAttribute('href', /\/cercle$/)

    const look = await slot.evaluate((el) => ({
      tint: getComputedStyle(el).getPropertyValue('--wg-tint').trim(),
      border: getComputedStyle(el.querySelector('.cardmini')!).borderTopStyle,
    }))
    // Colour says WHICH card; the dashed edge says it holds nothing. Two questions, two
    // answers — a grey box conflated them.
    expect(look.tint, 'the slot publishes the card’s tint').not.toBe('')
    expect(look.border).toBe('dashed')
  })

  test('arming edit mode collapses an expanded card', async ({ page }) => {
    await open(page)
    const slot = page.locator('.wg-slot[data-card="today"]')

    await slot.locator('.cardmini').scrollIntoViewIfNeeded()
    await slot.locator('.cardmini').click()
    await expect(slot).toHaveAttribute('data-expanded', '')

    await hold(page, 'today')
    await expect(page.locator('.board-edit')).toBeVisible()
    await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
    // Back to its compact tile, not the grown form, the moment edit mode arms.
    await expect(slot.locator('.cardmini')).toBeVisible()
  })
})

// « À régler » and « Moments » are hero tiles (`.now-card`), not `Section`/`BoardCard` —
// they read `useCardLens()` themselves rather than getting the compact form for free, and
// grow their own `.now-card__reduce` way-back chip since they have no shared `SecLabel`
// to grow one for them. A regression here used to leave both squeezed at half-width with
// no compact form and no escape hatch (the review finding this test guards).
const A_REGLER_SIGNAL = [{ kind: 'birthday', key: 'b1', label: 'Léa', at: Math.floor(Date.now() / 1000) + 86400, href: '/cercle' }]

async function stubARegler(page: Page) {
  // Registered AFTER mockApi so this wins over the default empty-signals fixture.
  await page.route('**/api/a-regler**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: A_REGLER_SIGNAL }) }),
  )
}

test.describe('board compact lens — bespoke band cards', () => {
  test('« À régler » and « Moments » render a mini tile when halved, and grow back via their own reduce chip', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await mockApi(page)
    await stubARegler(page)
    await seedState(page, { cardPrefs: { size: { aRegler: 1, moments: 1 } } })
    await page.goto('/board')
    await page.waitForSelector('.board-band .wg-slot')

    const reglerSlot = page.locator('.wg-slot[data-card="aRegler"]')
    const regler = reglerSlot.locator('.cardmini')
    await regler.scrollIntoViewIfNeeded()
    await expect(regler).toBeVisible()
    await expect(regler.locator('.cardmini__title')).toHaveText('À régler')

    const momentsSlot = page.locator('.wg-slot[data-card="moments"]')
    const moments = momentsSlot.locator('.cardmini')
    await moments.scrollIntoViewIfNeeded()
    await expect(moments).toBeVisible()
    await expect(moments.locator('.cardmini__title')).toHaveText('Moments')

    // Tap grows « À régler » in place, same as every other compact card.
    await regler.click()
    await expect(reglerSlot).toHaveAttribute('data-expanded', '')
    await expect(reglerSlot.locator('.cardmini')).toHaveCount(0)
    const reduce = reglerSlot.locator('.now-card__reduce')
    await expect(reduce).toBeVisible()
    await expect(reduce).toHaveAttribute('aria-expanded', 'true')

    // Single-open still holds across these bespoke cards.
    await expect(momentsSlot.locator('.cardmini')).toBeVisible()

    await reduce.click()
    await expect(reglerSlot).not.toHaveAttribute('data-expanded', /.*/)
    await expect(reglerSlot.locator('.cardmini')).toBeVisible()
  })
})
