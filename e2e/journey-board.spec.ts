import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, boardTask, BASE, BOARD, MMID, ROUTES, notesFromMots } from './mocks'
import { APP, settle, expectApi } from './interact'
import { boxOf, settled } from './measure'
import { test as test4, type App, test as test6, test as test9, test as test11 } from './fixtures'
import { localDayStart } from '../src/lib/localDay'
import { BOARD_CARDS, type BoardCardId } from '../src/lib/boardCards'

// JOURNEY — THE BOARD AT A GLANCE (review #43; was interactions-board.spec.ts + board-compact.spec.ts + board-empty-cards.spec.ts + board-day-first.spec.ts + en-cours.spec.ts + pour-toi.spec.ts + greet-fit.spec.ts + card-lens-shots.spec.ts + house-diary.spec.ts + this-week-calm.spec.ts + calm-nags.spec.ts).
//
// Interaction coverage, the board: faces, chores, fridge notes, toddler habits. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

test.describe('interactions-board', () => {
  test.describe('profile', () => {
    test('picking a face greets you on the board', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await page.locator('.profile-chip').click()
      await expect(page.locator('.sheet.show')).toBeVisible()
      await page.locator('.profile-face', { hasText: 'Maman' }).click()
      await expect(page.locator('.greet')).toContainText('Maman')
    })

    test('the shared list shows who added an item', async ({ page }) => {
      await APP('/liste')(page)
      await settle(page, '.today-feed')
      // l1 (Lait) is seeded added_by m1 (Maman, #B06A93) → since the compact-rows
      // pass, "who" is the TITLE's tint (tintInk inlines the member hex), not an
      // avatar disc.
      const title = page.locator('.list-row', { hasText: 'Lait' }).locator('.title')
      await expect(title).toHaveAttribute('style', /#B06A93/i)
    })

    test('kiosk switcher flips between a member and Maisonnée', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
      await page.goto('/board')
      await settle(page, '.hub')
      await expect(page.locator('.mswitch')).toBeVisible()
      await page.locator('.mswitch__opt', { hasText: 'Papa' }).click()
      await expect(page.locator('.greet')).toContainText('Papa')
      await page.locator('.mswitch__opt', { hasText: 'Maisonnée' }).click()
      await expect(page.locator('.greet')).not.toContainText('Papa')
    })
  })

  test.describe('recurring chores on the board', () => {
    test('a chore due today shows in Aujourd\'hui and checks off (PATCH /api/tasks, done)', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      const chore = page.locator('.act', { hasText: 'Sortir les poubelles' })
      await expect(chore).toBeVisible()
      await expect(chore).toContainText('Léa') // whose turn
      // The row is split now (body peeks the detail, the check disc ticks) — click the check.
      await expectApi(page, 'PATCH', 'tasks', () => chore.locator('.act__checkbtn').click())
    })

    test('an upcoming chore shows under À venir with its day', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      await expect(page.locator('.act', { hasText: 'Vaisselle' })).toBeVisible()
    })

    test('a task can be given a weekly schedule in its own scene (PATCH recur)', async ({ page }) => {
      // Tasks left Réglages: the peek's « Modifier » opens /chore/:id, one editor with the
      // RecurPicker, the same form that creates one.
      await APP('/chore/c1')(page)
      // The one task form: the schedule is the « Quand ? » layer, folded until asked for.
      const form = page.locator('.scene .task-form')
      await form.getByRole('button', { name: /^Quand/ }).click()
      await form.locator('.recur select').selectOption('weekly')
      // Since 0150 the form writes ONE endpoint, /api/tasks (lib/taskSave); the server picks the face.
      await expectApi(page, 'PATCH', 'tasks', () =>
        form.getByRole('button', { name: 'Enregistrer' }).click(),
      )
    })
  })

  test.describe('fridge notes', () => {
    test('a note shows on the board and clears with a tap (DELETE)', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      const note = page.locator('.note-card', { hasText: 'examen' })
      await expect(note).toBeVisible()
      // The paper is a card since 0142 (its « Garder » badge can't sit inside a button); the
      // tap that takes it down is its own target.
      await expectApi(page, 'DELETE', 'notes', () => note.locator('.note-card__tap').click())
      await expect(note).toHaveCount(0) // optimistically removed
    })

    // Review #25: a parent's TEXT note is not for a pre-reader; the toddler lens keeps only
    // drawings from the fridge (behind « Tout voir »), and their own mots, read aloud.
    test('toddler does not get the parents’ text notes', async ({ page }) => {
      await APP('/board', 'toddler')(page)
      await settle(page, '.kid__main')
      await page.locator('.today-kid__more .disclosure__summary').click()
      await expect(page.locator('.today-kid__more .today-kid__section').first()).toBeVisible()
      await expect(page.locator('.note-card', { hasText: 'examen' })).toHaveCount(0)
    })

    // Tidy seam #1: « Tout effacer » empties the whole strip as ONE undoable action —
    // the notes hide at once, the writes wait behind the single undo toast, and
    // « Annuler » brings every note back (nothing was deleted server-side yet).
    test('« Tout retirer » batch-dismisses the strip behind one undo toast', async ({ page }) => {
      await APP('/board')(page)
      await settle(page, '.hub')
      // Scope to the fridge-notes strip — the DAY note (DayNote, .notes.day-note)
      // wears .note-card too but is read-only and must survive the sweep.
      const notes = page.locator('.notes:not(.day-note) .note-card')
      await expect(notes).toHaveCount(2)
      await page.getByRole('button', { name: 'Tout retirer' }).click()
      await expect(notes).toHaveCount(0)
      await expect(page.locator('.undo-toast')).toBeVisible()
      await page.locator('.undo-toast__btn').click()
      await expect(notes).toHaveCount(2)
    })
  })

  // F6 × D8 (Wave T): the toddler board now folds « Mes habitudes » in as read-aloud
  // tiles, so a pre-reader hears what today is still asking (« brosse tes dents »).
  test('toddler board shows « Mes habitudes » due today, read-aloud not marked', async ({ page }) => {
    await APP('/board', 'toddler')(page)
    await settle(page, '.kid__main')
    // « Bouger un peu » is an every-day 'hours' household habit — due today under any
    // clock — so it surfaces as a picture-first hear-first tile (no frozen clock needed).
    // It sits behind « Tout voir » since review #25.
    await page.locator('.today-kid__more .disclosure__summary').click()
    const tile = page.locator('.today-kid__section .bigtile', { hasText: 'Bouger un peu' })
    await expect(tile).toBeVisible()
    // Reading is a nicety, not a mark: a tap on a habit tile must NOT fire a habits write
    // (a parent still marks it in « Le point du jour »).
    let wrote = false
    page.on('request', (r) => {
      if (r.method() !== 'GET' && new URL(r.url()).pathname.endsWith('/api/habits')) wrote = true
    })
    await tile.click()
    await expect(tile).toBeVisible()
    expect(wrote).toBe(false)
  })
})

// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('board-compact', () => {
  // The board's compact lens (lib/widgetGrid.isCompact + components/board/CardLens): a
  // card halved on a phone renders a genuinely small tile — icon + title + at most one
  // quiet hint — instead of a squeezed full card, and grows to the zone's full width in
  // place when tapped. Modeled on journey-board-arrange.spec.ts's helpers.
  //
  // « today » (mode 'always', so it's never empty) is the halved card throughout: its
  // default META size is already 1, but an UN-SIZED card falls back to 'full' on a narrow
  // grid (CardSlot's `grid?.narrow ? 'full' : undefined` fallback), so the compact form
  // only shows up once a device has actually CHOSEN a half — exactly what seeding
  // `cardPrefs.size` here reproduces.
  const HOLD = 700 // > LONG_PRESS_MS (500), mirrors journey-board-arrange.spec.ts

  const open = async (page: Page, size: Record<string, number> = { today: 1 }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await mockApi(page)
    await seedState(page, { cardPrefs: { size } })
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')
  }

  // `page.mouse` works in viewport coordinates and never scrolls — bring the element into
  // view first, same rule journey-board-arrange.spec.ts follows.
  // Named for what it ADDS — the scroll — now that the measuring half is the shared
  // retrying `boxOf` (e2e/measure.ts) instead of a second local copy wearing the same name.
  const scrolledBox = async (page: Page, sel: string) => {
    const loc = page.locator(sel)
    await loc.scrollIntoViewIfNeeded()
    return boxOf(loc)
  }

  /** Press and hold the top edge of a card, without moving, to arm edit mode. */
  async function hold(page: Page, card: string, ms = HOLD) {
    const box = await scrolledBox(page, `.wg-slot[data-card="${card}"]`)
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    // The hold IS the gesture: a press lasts a duration, and no signal stands in for one.
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
    // (same technique as journey-board-arrange.spec.ts's "does not bleed off the right edge" test).
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
      const compactBox = await scrolledBox(page, '.wg-slot[data-card="today"] .cardmini')
      const gridBox = await scrolledBox(page, '.board-grid')

      await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
      await tile.click()

      await expect(slot).toHaveAttribute('data-expanded', '')
      const grownBox = await boxOf(slot)
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
      const backBox = await boxOf(slot)
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

      // VISIBLE rows: every row stays mounted (the fit is measured by un-hiding them —
      // see BoardCard), so a bare element count would also count what is hidden.
      const rows = tile.locator('.cardmini__row:not([hidden])')
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
      // what the shelf holds — it still names what fits and folds the rest into a
      // trailing "+N de plus" row rather than falling back to a bare count (lib/widgetGrid).
      // « Demain » is the same chronological + weather-chipped tile with a day short enough to
      // list in full, so it still guards exactly what this test is for. The today tile's
      // overflow row is asserted below.
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

      // The other half of the contract: a day too full to name in full still lists what fits
      // (never falls back to a bare count) and folds the rest into a "+N de plus" row — with
      // the weather chip still pinned to its header.
      const today = page.locator('.wg-slot[data-card="today"] .cardmini')
      await expect(today).toHaveClass(/cardmini--list/)
      await expect(today.locator('.cardmini__row--more')).toBeVisible()
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

      // An empty pinned card with a natural "add one" page (« Les carnets » → Maison,
      // Carnets section) taps STRAIGHT THERE instead of growing into a « Rien pour
      // l'instant » shell: the tile is an anchor, not a grow-button (BOARD_CARDS[].emptyTo
      // → CardSlot → compactTo).
      await expect(tile).toHaveJSProperty('tagName', 'A')
      await expect(tile).toHaveAttribute('href', '/maison?section=carnets&plus=carnet')

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

    // THE THING YOU OPENED MUST STAY UNDER YOUR EYE.
    // A grown card is full-width, and `grid-auto-flow: dense` can only put a full-width item
    // where EVERY column is free — i.e. below everything already placed. So the tile on the
    // RIGHT of a shelf could never grow where it stood: it was bumped a whole shelf (168px,
    // measured) past its own neighbour, and on a board of stacked shelves that is the card
    // opening somewhere you are not looking. `CardSlot` pins the open slot to the row it was
    // already on, so the other cards move beneath it instead.
    //
    // The card under test is `departure` — the SECOND of the today/departure shelf — on
    // purpose: the left-hand tile of a shelf never moved (its row is already the first free
    // one), so expanding `today` here would pass with the pin ripped out.
    test('an opened card holds its place — the others move beneath it, not the other way round', async ({
      page,
    }) => {
      await open(page, { today: 1, departure: 1 })

      // Everything measured against the GRID's own top, so a page scroll can't flatter the
      // result: these are layout positions, not viewport ones.
      const boxes = () =>
        page.locator('.board-grid .wg-slot:not([hidden])').evaluateAll((els) =>
          els.map((el) => {
            const g = el.parentElement!.getBoundingClientRect()
            const r = el.getBoundingClientRect()
            return { card: el.getAttribute('data-card')!, top: r.top - g.top, bottom: r.bottom - g.top }
          }),
        )
      const find = (all: Awaited<ReturnType<typeof boxes>>, card: string) => all.find((b) => b.card === card)!

      const slot = page.locator('.wg-slot[data-card="departure"]')
      const before = await boxes()
      const beforeTop = find(before, 'departure').top

      await slot.locator('.cardmini').scrollIntoViewIfNeeded()
      await slot.locator('.cardmini').click()
      await expect(slot).toHaveAttribute('data-expanded', '')

      const during = await boxes()
      const grown = find(during, 'departure')
      // It grew DOWN from where it already was — same row line, not a new one further on.
      expect(Math.abs(grown.top - beforeTop)).toBeLessThan(2)
      expect(grown.bottom).toBeGreaterThan(grown.top)

      // Nothing shares its rows any more: a full-width card can't, and the pin is what
      // makes the neighbours yield to it instead of it yielding to them.
      for (const other of during.filter((b) => b.card !== 'departure')) {
        const overlaps = other.top < grown.bottom - 1 && other.bottom > grown.top + 1
        expect(overlaps, `${other.card} still overlaps the opened card's rows`).toBe(false)
      }

      // …and closing it puts it back exactly where it started, so the eye doesn't have to
      // find it again.
      await slot.locator('.sec-label__reduce').click()
      await expect(slot).not.toHaveAttribute('data-expanded', /.*/)
      expect(Math.abs(find(await boxes(), 'departure').top - beforeTop)).toBeLessThan(2)
    })
  })

  // « À régler » is a hero tile (`.now-card`), not a `Section`/`BoardCard` — it reads
  // `useCardLens()` itself rather than getting the compact form for free, and grows its own
  // `.now-card__reduce` way-back chip since it has no shared `SecLabel` to grow one for it.
  // A regression here used to leave it squeezed at half-width with no compact form and no
  // escape hatch (the review finding this test guards). (« Moments » was the other such
  // tile until it was retired; single-open across cards is covered above.)
  const A_REGLER_SIGNAL = [{ kind: 'birthday', key: 'b1', label: 'Léa', at: Math.floor(Date.now() / 1000) + 86400, href: '/maison?section=family' }]

  async function stubARegler(page: Page) {
    // Registered AFTER mockApi so this wins over the default empty-signals fixture.
    await page.route('**/api/a-regler**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: A_REGLER_SIGNAL }) }),
    )
  }

  test.describe('board compact lens — bespoke band cards', () => {
    test('« À régler » renders a mini tile when halved, and grows back via its own reduce chip', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 740 })
      await mockApi(page)
      await stubARegler(page)
      await seedState(page, { cardPrefs: { size: { aRegler: 1 } } })
      await page.goto('/board')
      await page.waitForSelector('.board-band .wg-slot')

      const reglerSlot = page.locator('.wg-slot[data-card="aRegler"]')
      const regler = reglerSlot.locator('.cardmini')
      await regler.scrollIntoViewIfNeeded()
      await expect(regler).toBeVisible()
      await expect(regler.locator('.cardmini__title')).toHaveText('À régler')

      // Tap grows « À régler » in place, same as every other compact card.
      await regler.click()
      await expect(reglerSlot).toHaveAttribute('data-expanded', '')
      await expect(reglerSlot.locator('.cardmini')).toHaveCount(0)
      const reduce = reglerSlot.locator('.now-card__reduce')
      await expect(reduce).toBeVisible()
      await expect(reduce).toHaveAttribute('aria-expanded', 'true')

      await reduce.click()
      await expect(reglerSlot).not.toHaveAttribute('data-expanded', /.*/)
      await expect(reglerSlot.locator('.cardmini')).toBeVisible()
    })
  })

  // ── How many rows a mini names ───────────────────────────────────────────────────
  // Reported: "we changed how widgets showed their info (+N more if too big), however
  // there were cases where I could see 5 items and now only 2 show + 3 more — loss of
  // information." The cap was a CONSTANT that had to survive the worst case (every row
  // wrapping onto two lines), and the worst case is rare. It is measured now (`fitRows`,
  // lib/widgetGrid), so a tile of short things names as many as physically fit.
  // The card reads the board's one `tasks` list (2026-11-08): these are due today.
  const dueTodos = (prefix: string, titles: string[]) => ({
    board: { ...BOARD, tasks: titles.map((title, i) => boardTask({ source: 'task', id: `${prefix}${i}`, title })) },
  })
  const SHORT_TODOS = dueTodos('s', ['Lait', 'Pain', 'Œufs', 'Beurre', 'Café', 'Miel'])
  const LONG_TODOS = dueTodos('l', [
    'Rendez-vous chez le dentiste pour Noah',
    'Rapporter les livres à la bibliothèque',
    'Vider et nettoyer la piscine avant lundi',
    'Changer les pneus d’hiver de la voiture',
  ])

  async function miniRows(page: Page, overrides: Record<string, unknown>) {
    await page.setViewportSize({ width: 390, height: 900 })
    await mockApi(page, { overrides })
    await seedState(page, { cardPrefs: { size: { todos: 1 } } })
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')
    const mini = page.locator('.wg-slot[data-card="todos"] .cardmini--list')
    await expect(mini).toBeVisible()
    return mini.evaluate((el) => {
      const rows = Array.from(el.querySelectorAll('[data-mini-row]')) as HTMLElement[]
      const more = el.querySelector('[data-mini-more]') as HTMLElement | null
      const shown = rows.filter((r) => !r.hidden)
      const moreShown = more && !more.hidden ? more : null
      const bottoms = [...shown, ...(moreShown ? [moreShown] : [])].map((r) => r.getBoundingClientRect().bottom)
      return {
        shown: shown.length,
        more: moreShown?.textContent?.trim() ?? null,
        // Positive = everything the tile draws ends inside it. The tile clips, so a
        // negative number is a summary row (or a title) cut in half.
        spare: el.getBoundingClientRect().bottom - Math.max(...bottoms, 0),
      }
    })
  }

  test('a mini of SHORT rows names as many as fit, not a fixed two', async ({ page }) => {
    const m = await miniRows(page, SHORT_TODOS)
    expect(m.shown, 'more than the old fixed cap of 2').toBeGreaterThan(2)
    expect(m.spare, 'and nothing is cut off by the tile').toBeGreaterThanOrEqual(0)
  })

  test('a mini of LONG rows names fewer — the wrap is what costs, not a constant', async ({ page }) => {
    const long = await miniRows(page, LONG_TODOS)
    const short = await miniRows(page, SHORT_TODOS)
    expect(long.shown, 'wrapping rows take two lines each').toBeLessThan(short.shown)
    expect(long.spare).toBeGreaterThanOrEqual(0)
    expect(long.more, 'and the rest are still counted, never silently dropped').toMatch(/\+\d/)
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('board-empty-cards', () => {
  // « Une carte qui n'a rien à dire s'en va » — the board's empty-card contract, and
  // the one AUJOURDHUI §6 gap no spec covered: every frame we shoot has a full
  // fixture, so nothing ever asserted that a card LEAVES when its data empties.
  //
  // The mechanism is `useReportEmpty` (lib/useReportEmpty.ts) plus each card's `mode`
  // in lib/boardCards. Three states, and the middle one is the subtle one:
  //
  //   • 'never'  — dropped before it reaches a slot; not in the DOM at all (that's
  //     the « Jamais » pref, covered by board-customize.spec).
  //   • 'auto'   — collapsed when empty. The slot stays MOUNTED under the `hidden`
  //     attribute rather than unmounting, because a self-fetching card can only
  //     discover it is empty AFTER it has fetched — unmounting it would take the
  //     fetch with it and the card could never come back. So the assertion here is
  //     "hidden", never "absent"; a card that unmounts itself is the bug.
  //   • 'always' — holds its place with a uniform placeholder, because its door is
  //     unconditional: leaving the house isn't contingent on the agenda.
  //
  // A regression in either direction is invisible in a screenshot of a seeded
  // household — which is exactly why it went untested for so long.

  const slot = (page: Page, card: string) => page.locator(`.wg-slot[data-card="${card}"]`)

  // Everything « Demain » counts as content. It is deliberately a WIDE net
  // (boardModel `hasTomorrow`): tomorrow's forecast alone earns the card, because
  // "il va pleuvoir demain" is a real thing to say about tomorrow even when the
  // agenda is bare. Emptying only the events is not emptying the card.
  const NO_TOMORROW = { tomorrow: [], tomorrowMeal: null, tomorrowMeals: [], tomorrowNote: null }
  const wxNoTomorrow = () => ({ ...ROUTES.weather, tomorrow: null })

  // THE CLOCK IS FROZEN, and it has to be: "empty" here means the fixture is empty, and
  // the board's own idea of a day is WIDER than the fixture. Holidays and school-year
  // edges are DERIVED from the real date (lib/year), so on the eve of a real holiday
  // « Demain » had something to say — « Congé férié · Fête du Travail » — and refused to
  // collapse. Three specs went red on 2026-09-06 for exactly that, and would have on the
  // eve of every holiday since. Freezing to the fixture's own anchor makes these tests
  // about emptiness again rather than about the calendar. (Same family as the fixed-86400
  // DST trap CLAUDE.md names — a test that passes most days is not passing.)
  async function board(page: Page, overrides?: Record<string, unknown>) {
    await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, overrides ? { overrides } : {})
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test('the control: with the seeded household, both auto cards are on the board', async ({ page }) => {
    // Without this, every assertion below could pass because the selector is wrong.
    await board(page)
    await expect(slot(page, 'tomorrow')).toBeVisible()
    await expect(slot(page, 'toFinish')).toBeVisible()
  })

  test('« Demain » collapses when tomorrow holds nothing at all — forecast included', async ({ page }) => {
    await board(page, { board: { ...BOARD, ...NO_TOMORROW }, weather: wxNoTomorrow() })
    await expect(slot(page, 'toFinish')).toBeVisible() // the rest of the board is intact
    await expect(slot(page, 'tomorrow')).toBeHidden()
    // Mounted, not unmounted — see the header note. If this ever becomes 0, the card
    // started returning null on its own and lost the ability to reappear.
    await expect(slot(page, 'tomorrow')).toHaveCount(1)
  })

  test('« Demain » STAYS when only its events are empty but a supper is planned', async ({ page }) => {
    // The half of the contract a naive `!events.length && return null` breaks: an
    // empty agenda with tacos planned is still something to say about tomorrow.
    await board(page, { board: { ...BOARD, tomorrow: [] }, weather: wxNoTomorrow() })
    await expect(slot(page, 'tomorrow')).toBeVisible()
  })

  test('« Demain » STAYS on a bare day when the forecast alone has something to say', async ({ page }) => {
    // The wide net, asserted on purpose so nobody "tidies" the weather out of
    // hasTomorrow: no events, no meals, no note — but rain tomorrow, so the card earns
    // its place. This is also why the fresh-household test below still shows it.
    await board(page, { board: { ...BOARD, ...NO_TOMORROW } })
    await expect(slot(page, 'tomorrow')).toBeVisible()
  })

  test('« À finir » collapses when there are no leftovers', async ({ page }) => {
    await board(page, { board: { ...BOARD, leftovers: [] } })
    await expect(slot(page, 'tomorrow')).toBeVisible() // again: the board still renders
    await expect(slot(page, 'toFinish')).toBeHidden()
  })

  test('a « toujours » card keeps its place on a completely empty day', async ({ page }) => {
    // `fresh` empties every fixture — a brand-new household. The auto cards collapse;
    // the always cards must NOT, or a new household lands on a blank board with no
    // door into anything.
    // Frozen for the same reason as the helper above — and this one needs the calendar
    // to COOPERATE rather than stay quiet: it asserts « À venir » survives an empty
    // household because the fêtes are derived. Which fête is next depends on the date,
    // so a real clock makes this test depend on the season.
    await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { fresh: true })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

    await expect(slot(page, 'today')).toBeVisible() // mode: 'always'
    await expect(slot(page, 'departure')).toBeVisible() // mode: 'always'
    await expect(slot(page, 'toFinish')).toBeHidden() // mode: 'auto', genuinely empty

    // The two 'auto' cards that legitimately SURVIVE an empty household, both because
    // their content is DERIVED rather than stored — worth pinning, since "tidying" the
    // derivation out would silently blank a new household's board:
    //   • « Demain » — `weather` is FRESH_EXEMPT (a new household still has a sky), so
    //     tomorrow's forecast alone earns the card (see the test above).
    //   • « À venir » — the fêtes QC/CA are derived client-side (lib/year), not rows.
    await expect(slot(page, 'tomorrow')).toBeVisible()
    await expect(slot(page, 'upcoming')).toBeVisible()
    // A row, not merely a header — deliberately NOT asserted by name: which fête is
    // next depends on today's date, and pinning "Fête du Travail" would quietly rot
    // into a failure a fortnight later.
    await expect(slot(page, 'upcoming').locator('.act__text .title').first()).toBeVisible()

    // …and an 'always' card that has nothing to say still draws a real card, not an
    // empty frame: the slot supplies the shared header + a calm empty line.
    await expect(slot(page, 'departure').locator('.bento, .wg-slot__placeholder').first()).toBeVisible()
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test4.describe('board-day-first', () => {
  // Review #15 (2026-11-17): a fresh device opened its board on the fridge notes, the
  // weather photo and « À régler »; « Aujourd'hui » was the fifth card and « Tâches » the
  // eleventh. Marc chose « the day first »: the band opens with the agenda, « Ce soir »,
  // then routine | tâches | à régler, and only then the fridge. Defaults only: a device
  // that saved its own layout keeps it.

  const bandOrder = (page: Page) =>
    page.locator('.board-band > .wg-slot:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card))

  test4('a fresh device opens on the day, then supper, before the fridge', async ({ app, page }) => {
    await app.boot({ route: '/board', wait: '.board-band' })
    await expect(page.locator('.board-band > .wg-slot[data-card="today"]')).toBeVisible()
    const order = await bandOrder(page)
    expect(order[0]).toBe('today')
    expect(order.indexOf('heroes')).toBeLessThan(order.indexOf('notes'))
    expect(order.indexOf('today')).toBeLessThan(order.indexOf('notes'))
  })

  test4('a saved layout keeps its own order', async ({ app, page }) => {
    // The previous default, saved by a device that customised its board.
    const saved = {
      band: ['notes', 'heroes', 'souvenirs', 'aRegler'],
      grid: ['autoCard', 'today', 'departure', 'routineNext', 'habitudes', 'tomorrow', 'countdown', 'toFinish', 'todos', 'upcoming', 'cercleNotes', 'voyage', 'carnets', 'seasonUpkeep', 'drawings', 'photos', 'remarks'],
      size: {},
      mode: {},
    }
    await page.addInitScript((v) => localStorage.setItem('babillard-card-prefs', v), JSON.stringify(saved))
    await app.boot({ route: '/board', wait: '.board-band' })
    await expect(page.locator('.board-band > .wg-slot[data-card="notes"]')).toBeVisible()
    expect((await bandOrder(page))[0]).toBe('notes')
    await expect(page.locator('.board-band > .wg-slot[data-card="today"]')).toHaveCount(0)
    await expect(page.locator('.board-grid > .wg-slot[data-card="today"]')).toBeVisible()
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('en-cours', () => {
  // The board lifecycle's two softenings (PLAN-mots B2 + B3, accepted 2026-09-25):
  //
  //   B2 « En cours » — a rendez-vous with a « Jusqu'à » (end_at) used to be binary on the
  //   flat « Aujourd'hui » list: full strength, then STRUCK the moment it started (the Fil
  //   already waited for its end). Now it carries a static accent while its window spans
  //   now, and strikes only once it has ended.
  //
  //   B3 the « maintenant » line — the Fil had a quiet now-divider between past and
  //   future rows; the plain list did not. It now sits above the struck rows, so both
  //   surfaces read « past below, next above » the same way — and only when something is
  //   behind us.
  //
  // The clock is frozen (page.clock) so "now" is a fact of the fixture, not of the hour
  // the suite happens to run.

  const HOUR = 3600
  // 13:00 local on BASE's day (BASE is 04:00 local): breakfast's slot is behind us, so the
  // fixture's « Crêpes » is a struck row; supper is the hero and never strikes.
  const ONE_PM = BASE + 9 * HOUR

  function board(today: object[]) {
    return JSON.stringify({ ...BOARD, today })
  }

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test('a rendez-vous whose window spans now reads « en cours », not struck — and the now-line sits above the past rows', async ({ page }) => {
    // ONE timed event keeps the card on the plain list (the Fil takes over at two).
    // Started 45 min ago, ends in 30 min: live. Not « Prochainement » either: that selector
    // keeps a start up to 30 min behind us (BOARD_NEXTUP's grace, a 'just started' still
    // reads as next), so a window past that grace is a list row.
    await page.route('**/api/board', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: board([{ id: 'live', title: 'Réunion de parents', start_at: ONE_PM - 45 * 60, end_at: ONE_PM + HOUR / 2, all_day: 0, member_id: null }]),
      }),
    )
    await page.clock.setFixedTime(ONE_PM * 1000)
    await page.goto('/board')
    const card = page.locator('.wg-slot[data-card="today"]')
    await card.waitFor({ state: 'visible', timeout: 15_000 })

    const live = card.locator('.act--live')
    await expect(live).toHaveCount(1)
    await expect(live).toContainText('Réunion de parents')
    // Red against striking at start_at (the old rule): the same row would carry act--past.
    await expect(card.locator('.act--past', { hasText: 'Réunion de parents' })).toHaveCount(0)

    // The breakfast is behind us → struck; the now-line divides live from past.
    const past = card.locator('.act--past', { hasText: 'Crêpes' })
    await expect(past).toHaveCount(1)
    const line = card.locator('.fil__now')
    await expect(line).toHaveCount(1)
    await expect(line).toContainText('13')
    const [l, n, p] = await Promise.all([boxOf(live), boxOf(line), boxOf(past)])
    expect(n.y, 'the now-line sits below the live row').toBeGreaterThan(l.y + l.height - 1)
    expect(p.y, 'and above the struck row').toBeGreaterThan(n.y + n.height - 1)
  })

  test('with nothing behind us there is no line to draw', async ({ page }) => {
    await page.route('**/api/board', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: board([{ id: 'later', title: 'Soccer', start_at: BASE + 5 * HOUR, all_day: 0, member_id: null }]),
      }),
    )
    // 04:00 local: nothing has happened yet, no meal slot has closed.
    await page.clock.setFixedTime(BASE * 1000)
    await page.goto('/board')
    const card = page.locator('.wg-slot[data-card="today"]')
    await card.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(card.locator('.act--past')).toHaveCount(0)
    await expect(card.locator('.fil__now')).toHaveCount(0)
  })

  test('on the Fil, a started-but-unfinished window is neither dimmed nor struck; an ended one is both', async ({ page }) => {
    // Three timed events → the ribbon. The ribbon's own `until` already knew the end; the
    // row inside it now agrees (act--live), and an ENDED window dims + strikes together.
    await page.route('**/api/board', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: board([
          { id: 'ended', title: 'Dentiste', start_at: ONE_PM - 3 * HOUR, end_at: ONE_PM - 2 * HOUR, all_day: 0, member_id: null },
          { id: 'live', title: 'Réunion de parents', start_at: ONE_PM - HOUR / 2, end_at: ONE_PM + HOUR / 2, all_day: 0, member_id: null },
          { id: 'later', title: 'Soccer', start_at: ONE_PM + 4 * HOUR, all_day: 0, member_id: null },
        ]),
      }),
    )
    await page.clock.setFixedTime(ONE_PM * 1000)
    await page.goto('/board')
    const fil = page.locator('.wg-slot[data-card="today"] .fil')
    await fil.waitFor({ state: 'visible', timeout: 15_000 })

    const liveRow = fil.locator('.fil__row', { hasText: 'Réunion de parents' })
    await expect(liveRow).not.toHaveClass(/fil__row--past/)
    await expect(liveRow.locator('.act--live')).toHaveCount(1)
    await expect(liveRow.locator('.act--past')).toHaveCount(0)

    const endedRow = fil.locator('.fil__row', { hasText: 'Dentiste' })
    await expect(endedRow).toHaveClass(/fil__row--past/)
    await expect(endedRow.locator('.act--past')).toHaveCount(1)
    await expect(endedRow.locator('.act--live')).toHaveCount(0)
  })

  // Review 2026-11-17, P1 #9 (Marco): on a busy day the ribbon drew its own « maintenant »,
  // and the card drew a SECOND one under it — after the 19 h yoga — with the morning's
  // « Crêpes » below that. A past meal is not on the ribbon's time axis; it sits, struck,
  // with the day's meals above it, and the line is drawn once.
  test('on the Fil, the morning meal sits above the ribbon and « maintenant » is drawn once', async ({ page }) => {
    await page.route('**/api/board', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: board([
          { id: 'ended', title: 'Dentiste', start_at: ONE_PM - 3 * HOUR, end_at: ONE_PM - 2 * HOUR, all_day: 0, member_id: null },
          { id: 'live', title: 'Réunion de parents', start_at: ONE_PM - HOUR / 2, end_at: ONE_PM + HOUR / 2, all_day: 0, member_id: null },
          { id: 'later', title: 'Yoga', start_at: ONE_PM + 6 * HOUR, all_day: 0, member_id: null },
        ]),
      }),
    )
    await page.clock.setFixedTime(ONE_PM * 1000)
    await page.goto('/board')
    const card = page.locator('.wg-slot[data-card="today"]')
    const fil = card.locator('.fil')
    await fil.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(card.locator('.fil__now')).toHaveCount(1)
    const crepes = card.getByText('Crêpes').first()
    await expect(crepes).toBeVisible()
    expect((await boxOf(crepes)).y).toBeLessThan((await boxOf(fil)).y)
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test6.describe('pour-toi', () => {
  // « Pour toi » (PLAN-mots C2, accepted 2026-09-25): with a face picked, ONE calm line
  // under the board's controls says what is theirs right now — a mot waiting (presence,
  // never a count), their next rendez-vous today, the routine of the moment. Absent for the
  // Maisonnée and absent when nothing is pending: the calm inverse of a notification centre.
  //
  // Clock frozen at BASE (04:00 local, a morning): Léa (m3) has « Garderie » at 05:00 in
  // the shared fixture, a « Matin » routine served here with her memberId, and one mot
  // waiting; Papa (m2) has nothing of his own.

  const MOT = {
    id: 'mo1',
    member_id: 'm3',
    author_member_id: 'm1',
    text: 'Bonne journée ma puce',
    media_kind: null,
    media_key: null,
    scene_key: null,
    created_at: BASE - 3600,
    updated_at: null,
    opened_at: null,
    saved_at: null,
    surface_at: null,
    reply_to: null,
  }
  const ROUTINES = [
    { id: 'r1', name: 'Matin', memberId: 'm3', memberName: 'Léa', color: '#88A36F', timeOfDay: 'morning', cards: [{ icon: 'tooth' }], doneIdx: [] },
    { id: 'r2', name: 'Dodo', memberId: 'm3', memberName: 'Léa', color: '#88A36F', timeOfDay: 'evening', cards: [{ icon: 'bed' }], doneIdx: [] },
  ]

  async function openBoard(app: App, face: string | null, mots: object[] = [MOT]) {
    const { page } = app
    await app.boot({ viewport: { width: 390, height: 844 }, clock: 'BASE' })
    if (face) await page.addInitScript((f) => localStorage.setItem('babillard-profile', f), face)
    // Mots are fridge notes since 0142 — served in the notes shape.
    await page.route('**/api/notes**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notesFromMots(mots as Record<string, unknown>[])) }))
    await page.route('**/api/routines**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ routines: ROUTINES }) }))
    await page.goto('/board')
    await expect(page.locator('.board-wall')).toBeVisible({ timeout: 15_000 })
  }

  test6('Léa reads her line: the waiting mot, her next rendez-vous, her morning routine — and not the evening one', async ({ page, app }) => {
    await openBoard(app, 'm3')
    const line = page.locator('.pourtoi')
    await expect(line).toBeVisible()
    await expect(line.locator('.pourtoi__name')).toHaveText('Léa')
    await expect(line).toContainText('un mot t’attend')
    await expect(line).toContainText('Garderie 5 h')
    await expect(line).toContainText('routine Matin')
    // Red against handing every routine to the ambient picker: « Dodo » would be named at 04:00.
    await expect(line).not.toContainText('Dodo')
    // The whole line is one paragraph — presence, no count anywhere in it.
    await expect(line).not.toContainText(/\d+ mots?/)
  })

  test6('the Maisonnée has no line, and neither does a face with nothing pending', async ({ page, app }) => {
    await openBoard(app, null)
    await expect(page.locator('.pourtoi')).toHaveCount(0)
    await page.close()
  })

  test6('a face with nothing of their own reads nothing — no empty frame', async ({ page, app }) => {
    // Papa: no mot addressed to him, no rendez-vous naming him today, no routine.
    await openBoard(app, 'm2', [])
    await expect(page.locator('.board-controls')).toBeVisible()
    await expect(page.locator('.pourtoi')).toHaveCount(0)
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('greet-fit', () => {
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
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('card-lens-shots', () => {
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
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await settled(page)
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
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test9.describe('house-diary', () => {
  // « La maison cette année » (PARITY, late rows). A deep link lands on the section, and a
  // household with nothing yet reads one calm line, not a blank card.
  test9('a fresh household reads the empty line', async ({ page, app }) => {
    await app.boot({ route: '/settings?focus=houseDiary', api: { fresh: true }, wait: '.operator__section' })
    await expect(page.getByText('L’année s’écrira ici, un moment à la fois.')).toBeVisible()
  })

  test9('a household with history sees its months', async ({ page, app }) => {
    const at = Math.floor(Date.now() / 1000) - 5 * 86_400
    const entries = [{ id: 'cl1', carnetId: 'ca1', at, kind: 'service', title: 'Ramonage cheminée', note: null }]
    await app.boot({ route: '/settings?focus=houseDiary', api: { overrides: { 'care-log': { entries } } }, wait: '.operator__section' })
    await expect(page.locator('.ledger')).toContainText('Ramonage cheminée')
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test.describe('this-week-calm', () => {
  // « Cette semaine ensemble » widens the chore-ledger pattern to the whole household, and
  // inherits its one hard rule: it says WHO, never HOW MANY. No tally, no ranking, no
  // streak, no score (NFR-CALM-1) — the file says so at the top, and until now nothing
  // held it there. The section rendered in the screenshot sweep, but nothing ever
  // ASSERTED faces-not-counts (REVIEW-PASS « e2e gaps »), so a well-meaning "3 tâches
  // cette semaine" could have landed without a single test objecting.
  //
  // The fixture deliberately gives one chore THREE helpers and repeats a face across
  // rows: that is exactly the shape that tempts a summary number.

  const face = (id: string, name: string, colour: string) => ({
    memberId: id, name, avatarKind: 'color', avatarRef: colour, colour,
  })

  const WEEK = {
    ahead: { meals: [], events: [], birthdays: [], work: [], projects: [] },
    behind: {
      chores: [
        { date: 0, choreTitle: 'Vaisselle', choreColor: '#88a36f', helpers: [face('m1', 'Léa', '#88a36f'), face('m2', 'Bo', '#c2563a'), face('m3', 'Cy', '#2a8f85')] },
        { date: 0, choreTitle: 'Recyclage', choreColor: '#c2563a', helpers: [face('m1', 'Léa', '#88a36f')] },
      ],
      routines: [{ name: 'Matin', who: 'm2', face: face('m2', 'Bo', '#c2563a') }],
      projects: [],
    },
  }

  test('« Cette semaine » shows WHICH faces helped — and never a count', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await page.route('**/api/this-week**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(WEEK) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/settings?tab=board&lens=regler&sub=events&focus=thisWeek')
    await page.locator('.operator').waitFor({ state: 'visible', timeout: 15_000 })

    const week = page.locator('.tweek')
    await expect(week).toBeVisible({ timeout: 15_000 })

    // Nothing to sort (the fixture's a-regler is empty): « À régler » drops its marigold ⚠
    // frame for a quiet one — an alarm around « Tout est sous contrôle » read as trouble.
    await expect(page.locator('.tweek__regler')).toHaveClass(/tweek__regler--clear/)

    // The faces are the content: three helpers on the first chore, named, not tallied.
    const firstChore = week.locator('.tweek__row--faces', { hasText: 'Vaisselle' })
    await expect(firstChore.locator('.ledger__helper')).toHaveCount(3)
    await expect(firstChore).toContainText('Léa')
    await expect(firstChore).toContainText('Bo')
    await expect(firstChore).toContainText('Cy')

    // A face repeating across rows must NOT become a per-person total anywhere.
    await expect(week.locator('.tweek__row--faces', { hasText: 'Recyclage' }).locator('.ledger__helper')).toHaveCount(1)

    // THE CALM ASSERTION: no bare number anywhere in the week block. Dates carry digits,
    // so this section is checked with none in the fixture — every digit here would be a
    // tally, a rank or a score, which is exactly what this surface may never grow.
    const text = (await week.innerText()).replace(/\s+/g, ' ')
    expect(text, `no count/tally/rank may appear: "${text}"`).not.toMatch(/\d/)
  })
})


// ── folded from journey-board.spec.ts ──────────────────────────────────────────────
test11.describe('calm-nags', () => {
  // Review #24 (2026-11-17), the calm pass on counts and nags:
  //   · « À régler +2 » was a mystery number, and its tap went into Réglages;
  //   · « Compléter les familles 6 » wore a count badge;
  //   · « Compter les dodos jusqu'à Noël ? » was asked every morning, from July;
  //   · drawings wore « il y a 65 j » (journey-drawings.spec.ts holds that one).

  test11.use({ timezoneId: 'America/Toronto' })

  test11('« À régler » names each friction with its own fix: no « +N », no detour into Réglages', async ({ app, page }) => {
    const signals = [
      { kind: 'meal-empty', key: 'meal-empty:tomorrow', label: 'souper', sub: 'tomorrow', at: MMID + 86_400, href: '/kitchen?item=a' },
      { kind: 'birthday', key: 'birthday:b1', label: 'Mamie', at: MMID + 3 * 86_400, href: '/maison?item=b' },
    ]
    await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE', api: { overrides: { 'a-regler': { signals } } } })
    const card = page.locator('.now-card--regler')
    await expect(card).toBeVisible()
    await expect(card).not.toContainText(/\+\d/)
    const links = card.locator('.now-card__frictions a')
    await expect(links).toHaveCount(2)
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['/kitchen?item=a', '/maison?item=b'])
  })

  test11('the décompte is offered only for a day within three weeks', async ({ app, page }) => {
    // Early August: nothing major for over three weeks → no question on the board.
    await app.boot({ route: '/board', wait: '.board-band', clock: Date.UTC(2025, 7, 1, 16) / 1000 })
    await expect(page.locator('.countdown-card__ask')).toHaveCount(0)
  })
})
