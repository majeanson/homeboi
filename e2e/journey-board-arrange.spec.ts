import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, BOARD, MMID, boardTask } from './mocks'
import { boxOf } from './measure'
import { test as test3 } from './fixtures'

// JOURNEY — ARRANGING THE BOARD (review #43; was board-edit.spec.ts + board-customize.spec.ts + dnd-mirrors.spec.ts).
//
// « Réorganise ton babillard » — the on-board widget editor. Holding any card arms edit
// mode (lib/useLongPress); from there a card can be dragged (between zones, not just
// within one), resized, or removed. Everything writes the SAME per-device store the
// Réglages panel does (lib/boardCards), so the two stay in sync without any plumbing.
test.describe('board-edit', () => {
  const HOLD = 700 // > LONG_PRESS_MS (500)

  const open = async (page: Page) => {
    await mockApi(page)
    await seedState(page, {})
    await page.goto('/board')
    await page.waitForSelector('.board-grid .wg-slot')
  }

  // `page.mouse` works in viewport coordinates and never scrolls, unlike `.click()`, so
  // anything it presses must be brought into view first — the board is a long inner
  // scroller.
  /** Press and hold the top edge of a card, without moving (travel aborts the hold).
   *
   * The press aims at the card's TOP edge, so that edge must be on screen — which
   * `scrollIntoViewIfNeeded()` does NOT guarantee: it settles for the cheapest scroll, so a
   * card TALLER THAN THE VIEWPORT gets aligned by its BOTTOM and its top lands ABOVE the
   * viewport (y < 0). The pointer then presses off-screen, hits nothing, and edit mode never
   * arms. That is what reddened this suite the day « Aujourd'hui » absorbed the day's
   * timeline and grew past 1000px — the board itself was fine. `block: 'start'` pins the top
   * edge in view. (Drags below keep scrollIntoViewIfNeeded: they aim at a grip, not an edge,
   * and forcing a top-align there re-scrolls the target out from under the drop.) */
  async function hold(page: Page, card: string, ms = HOLD) {
    const sel = `.wg-slot[data-card="${card}"]`
    await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }))
    // The LAST bare `boundingBox()!` in the suite, converted 2026-09-09 once CI had ruled
    // on it rather than on a hunch. Evidence: this helper's test failed once on CI in
    // **6.6s** — 5s of that is the `.board-edit` timeout, so the press landed on nothing
    // and edit mode never armed — then passed on the next run in 1.7s, and 4/4 locally. A
    // measurement taken from a node React detached between the two selector resolves is
    // exactly that shape, and it is the one thing here that is machine-speed dependent.
    const box = await boxOf(page.locator(sel))
    await page.mouse.move(box.x + box.width / 2, box.y + 12)
    await page.mouse.down()
    // The hold IS the gesture: a press lasts a duration, and no signal stands in for one.
    await page.waitForTimeout(ms)
    await page.mouse.up()
  }

  /** Drag `from`'s grip onto `to`'s slot, landing on the named HALF of it.
   *
   *  Which half is the whole gesture now: lib/dnd reads the pointer's side of the
   *  hovered slot to pick "insert before" vs "insert after". Aiming at the exact
   *  centre (what this helper used to do) sits on the boundary between the two, so
   *  every caller says which side it means. */
  async function dragOnto(
    page: Page,
    from: string,
    to: string,
    side: 'before' | 'after' = 'before',
    /** Runs while the pointer is still DOWN over the target — for reading the live cue. */
    whileOver?: () => Promise<void>,
  ) {
    const fromSel = `.wg-slot[data-card="${from}"]`
    const toSel = `.wg-slot[data-card="${to}"]`
    // Scroll ONCE — bringing the HIGHER of the two cards to the top of the scroller — then
    // measure both boxes without touching the scroll again. The old helper scrolled per
    // measurement (scrollIntoViewIfNeeded inside boxOf, twice), and the second scroll
    // silently invalidated the first box: the press then landed on stale pixels and the
    // card dropped onto the wrong neighbour. Harmless while every card was short; once
    // « Aujourd'hui » grew past 1000px, scrolling it into view pushed its drag partner
    // clean off the screen. Anchoring the higher card at the top keeps the grip AND the
    // drop target on screen together, whichever way the drag runs.
    const higher = await page.evaluate(
      ([a, b]) => {
        const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top
        return top(a!) <= top(b!) ? a : b
      },
      [fromSel, toSel],
    )
    // …then back off 150px, so neither card sits in the drag's EDGE AUTO-SCROLL band
    // (lib/dnd pans the page when the pointer nears the top/bottom of the scroller).
    // `block:'start'` alone parks the higher card at y≈0, i.e. squarely in the top
    // band — the drop point then scrolled away under the pointer mid-gesture and the
    // card landed on whatever the scroll brought under it.
    await page.locator(higher!).evaluate((el) => {
      el.scrollIntoView({ block: 'start', behavior: 'instant' })
      const sc = el.closest('.hub__body') as HTMLElement | null
      if (sc) sc.scrollTop = Math.max(0, sc.scrollTop - 150)
    })
    const grip = await boxOf(page.locator(`${fromSel} .wg-slot__grip`))
    const target = await boxOf(page.locator(toSel))
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    // Clear the 6px engage threshold, then land on the target.
    await page.mouse.move(grip.x + 30, grip.y + 30, { steps: 4 })
    // A quarter in from the leading/trailing edge — unambiguously one half, and far
    // enough from the boundary that a sub-pixel layout shift can't flip it.
    const at = side === 'after' ? target.x + target.width * 0.75 : target.x + target.width * 0.25
    await page.mouse.move(at, target.y + target.height / 2, { steps: 8 })
    await whileOver?.()
    await page.mouse.up()
  }

  const zoneOf = (page: Page, card: string) =>
    page.locator(`.wg[data-zone] .wg-slot[data-card="${card}"]`).evaluate(
      (el) => (el.closest('.wg') as HTMLElement).dataset.zone,
    )

  test.describe('board edit mode', () => {
    test('a long press arms edit mode; « Terminé » leaves it', async ({ page }) => {
      await open(page)
      await expect(page.locator('.board-edit')).toHaveCount(0)

      await hold(page, 'today')
      await expect(page.locator('.board-edit')).toBeVisible()
      await expect(page.locator('.board-grid.wg--editing')).toBeVisible()
      // The state lives in the URL so Réglages can deep-link into it.
      await expect(page).toHaveURL(/[?&]edit=1/)

      await page.getByRole('button', { name: 'Terminé' }).click()
      await expect(page.locator('.board-edit')).toHaveCount(0)
      await expect(page).not.toHaveURL(/[?&]edit=1/)
    })

    test('a quick tap never arms it — that press belongs to the card', async ({ page }) => {
      await open(page)
      await page.locator('.wg-slot[data-card="today"]').click({ position: { x: 10, y: 6 } })
      await expect(page.locator('.board-edit')).toHaveCount(0)
    })

    test('/board?edit=1 opens straight into it (the Réglages deep-link)', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.goto('/board?edit=1')
      await expect(page.locator('.board-edit')).toBeVisible()
    })

    test('✕ removes a card, and the bar says where it went', async ({ page }) => {
      await open(page)
      await hold(page, 'today')
      await page.locator('.wg-slot[data-card="today"] .wg-slot__hide').click()

      await expect(page.locator('.wg-slot[data-card="today"]')).toHaveCount(0)
      // A one-way door would be a trap: the bar names the way back.
      await expect(page.locator('.board-edit')).toContainText('cachée')
      await expect(page.locator('.board-edit a')).toHaveAttribute('href', /tab=board&sub=layout/)

      // It survives a reload — this is a persisted device preference.
      await page.reload()
      await expect(page.locator('.wg-slot[data-card="today"]')).toHaveCount(0)
    })

    test('the size chip cycles the card through the widths', async ({ page }) => {
      await open(page)
      // A masonry card that is always there at size 1 (« Aujourd'hui » moved up into the
      // band, full width, review #15).
      await hold(page, 'departure')
      const slot = page.locator('.wg-slot[data-card="departure"]')
      const chip = slot.locator('.wg-slot__size')

      await expect(chip).toHaveText('1')
      await chip.click()
      await expect(chip).toHaveText('2')
      await expect(slot).toHaveAttribute('style', /--wg-span-cols: ?2/)
      await chip.click()
      await expect(chip).toHaveText('3')
      await chip.click()
      await expect(chip).toHaveText('Max')
      await chip.click()
      await expect(chip).toHaveText('1')
    })

    test('a card drags from the band down into the masonry — the split is gone', async ({ page }) => {
      // Tall enough that the band and the first masonry card share a screen.
      await page.setViewportSize({ width: 1280, height: 1100 })
      await open(page)
      await hold(page, 'notes')
      expect(await zoneOf(page, 'notes')).toBe('band')

      await dragOnto(page, 'notes', 'autoCard')
      expect(await zoneOf(page, 'notes')).toBe('grid')

      await page.reload()
      await expect(page.locator('.wg-slot[data-card="notes"]')).toBeVisible()
      expect(await zoneOf(page, 'notes')).toBe('grid')
    })

    const order = (page: Page) =>
      page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.card),
      )

    test('reordering UP inside the masonry persists', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await open(page)
      await hold(page, 'departure')

      const before = await order(page)
      await dragOnto(page, 'departure', 'autoCard')
      const after = await order(page)
      expect(after).not.toEqual(before)
      expect(after.indexOf('departure')).toBeLessThan(before.indexOf('departure'))
      // It lands exactly where it was dropped: immediately before that card.
      expect(after[after.indexOf('autoCard') - 1]).toBe('departure')
    })

    test(`dropping on a card's TRAILING half lands after it — the reported bug`, async ({ page }) => {
      // From the phone: « Demain » could not be placed to the right of « Aujourd'hui »,
      // while the other way round worked. A drop used to mean "insert BEFORE this card"
      // whatever half you released on, so the only way to reach the LAST position was the
      // zone's trailing empty space — and a band row that two cards fill edge to edge has
      // none. The pointer's half of the hovered card decides now (lib/dnd).
      await page.setViewportSize({ width: 1280, height: 1200 })
      await open(page)
      await hold(page, 'autoCard')

      const before = await order(page)
      const first = before[0]!
      const second = before[1]!
      // Drop the FIRST card on the trailing half of the second: it must end up after it.
      await dragOnto(page, first, second, 'after')
      const after = await order(page)
      expect(after[after.indexOf(second) + 1]).toBe(first)
      expect([...after].sort()).toEqual([...before].sort()) // nothing lost or duplicated
    })

    test('the two halves of one card are different drops, and the cue says which', async ({ page }) => {
      // The cue is a PROMISE: whichever line you see is where it will land. Read it
      // mid-drag, through the SAME helper that performs the drop — a probe with its own
      // copy of the gesture would be free to drift from the thing it claims to describe.
      await page.setViewportSize({ width: 1280, height: 1200 })
      await open(page)
      await hold(page, 'autoCard')

      async function lineOn(side: 'before' | 'after') {
        const cards = await order(page)
        let cls: string | null = null
        await dragOnto(page, cards[0]!, cards[1]!, side, async () => {
          // React state drives the cue, so poll rather than read on the move's own tick.
          const line = page.locator(`.wg-slot[data-card="${cards[1]}"] .dnd-drop`)
          await expect(line).toBeAttached({ timeout: 3000 })
          cls = await line.evaluate((el) => el.className)
        })
        return cls
      }

      expect(await lineOn('before'), 'leading half → the LEFT line').toContain('dnd-drop--left')
      expect(await lineOn('after'), 'trailing half → the RIGHT line').toContain('dnd-drop--right')
    })

    // ── Edge auto-scroll ────────────────────────────────────────────────────────────
    // A live drag preventDefaults every pointermove so the page can't scroll out from
    // under the drop — which also meant a card could only travel one screenful per drag,
    // and reaching the bottom of a long board took several. The drag pans the page itself
    // now when the finger nears an edge.
    //
    // Both tests grab a card whose grip is clear of BOTH the top auto-scroll band and the
    // hub's bottom tab bar: the bar overlays the scroller's own lower edge, so a grip
    // under it is simply not pressable (that is how this test first "proved" auto-scroll
    // broken when it was the press that never landed).
    const reachableCard = (page: Page) =>
      page.evaluate(() => {
        for (const g of Array.from(document.querySelectorAll('.wg-slot__grip'))) {
          const r = g.getBoundingClientRect()
          if (r.top > 130 && r.bottom < 600) return (g.closest('.wg-slot') as HTMLElement).dataset.card ?? null
        }
        return null
      })

    const scrollTopOf = (page: Page) =>
      page.locator('.hub__body').evaluate((el) => Math.round((el as HTMLElement).scrollTop))

    test('holding a dragged card at the bottom edge scrolls the board under it', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 700 })
      await open(page)
      await hold(page, 'autoCard')

      const bottom = await page.locator('.hub__body').evaluate((el) => {
        const n = el as HTMLElement
        n.scrollTop = 0
        return Math.round(n.getBoundingClientRect().bottom)
      })
      const card = await reachableCard(page)
      expect(card, 'a grip clear of the band and the tab bar').not.toBeNull()
      const grip = await boxOf(page.locator(`.wg-slot[data-card="${card}"] .wg-slot__grip`))

      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
      await page.mouse.down()
      // Out of the band first — auto-scroll ARMS only once the finger has been clear of
      // it (see the next test), then hold near the scroller's own bottom edge.
      await page.mouse.move(grip.x + 40, 350, { steps: 6 })
      await expect(page.locator('.dnd-ghost'), 'the drag engaged').toHaveCount(1)
      await page.mouse.move(grip.x + 40, bottom - 20, { steps: 6 })
      await expect.poll(() => scrollTopOf(page), { timeout: 4000 }).toBeGreaterThan(400)
      await page.mouse.up()
    })

    // The other half of the rule — that grabbing a card ALREADY in an edge band must
    // NOT fly the page away until the finger has left the band once — is unit-tested in
    // src/lib/dnd.test.ts (« autoScrollStep — the arming latch ») rather than here. It
    // cannot be driven from this spec: a grip parked in the TOP band sits under the
    // board's own edit bar, so the press never lands, and the test passed vacuously —
    // a card the press never reached cannot scroll the page either, which looks exactly
    // like the latch working.

    test('reordering DOWN lands on the drop target, not one slot past it', async ({ page }) => {
      // The index-based drop overshot downward drags: removing the dragged card first shifts
      // every later index left by one, so the card sailed past its target (often to the end).
      await page.setViewportSize({ width: 1280, height: 1200 })
      await open(page)
      await hold(page, 'autoCard')

      const before = await order(page)
      const target = before[2]!
      await dragOnto(page, 'autoCard', target)

      const after = await order(page)
      expect(after.indexOf('autoCard')).toBeGreaterThan(before.indexOf('autoCard'))
      // Immediately BEFORE the card it was dropped on — not after it, not at the end.
      expect(after[after.indexOf(target) - 1]).toBe('autoCard')
      expect(after.at(-1)).toBe(before.at(-1))
      expect([...after].sort()).toEqual([...before].sort()) // nothing lost or duplicated
    })

    // Edit mode hangs ✕ / ⠿ / size badges OUTSIDE each card's box (top:-8px, left/right:-8px).
    // On a phone the wall's padding is only 0.9rem, so this is exactly the kind of row that
    // has silently bled off the right edge here before — and `#root`/`.hub__body` set
    // `overflow-x:hidden`, so it would be CLIPPED, not caught. Measure per child.
    test('edit mode does not bleed off the right edge on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 })
      await mockApi(page)
      await seedState(page, {})
      await page.goto('/board?edit=1')
      await page.waitForSelector('.wg-slot__grip')

      const bad = await page.evaluate(() => {
        const wall = document.querySelector('.board-wall') as HTMLElement
        const right = wall.getBoundingClientRect().right
        const out: string[] = []
        for (const el of [...wall.querySelectorAll('.wg-slot, .wg-slot__ctl, .board-edit, .board-edit *')]) {
          const r = (el as HTMLElement).getBoundingClientRect()
          if (r.width > 0 && r.right > right + 1) out.push(`${(el as HTMLElement).className}`.slice(0, 48))
        }
        return [...new Set(out)]
      })
      expect(bad, `overflowing: ${bad.join(' | ')}`).toEqual([])
      // A phone grid has TWO columns (so a card CAN be halved), but a card nobody sized
      // still spans both — the default phone board is unchanged.
      const spans = await page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).style.getPropertyValue('--wg-span-cols')),
      )
      expect([...new Set(spans)]).toEqual(['2'])
    })

    test('on a phone the size chip splits a card in two, and back', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 })
      await open(page)
      await hold(page, 'today')
      const slot = page.locator('.wg-slot[data-card="today"]')
      const chip = slot.locator('.wg-slot__size')

      // Un-sized on a phone reads « Max »: the chip shows what the grid will RENDER, so the
      // first tap does something visible instead of jumping to a 2 that clamps back to full.
      await expect(chip).toHaveText('Max')
      const full = (await boxOf(slot)).width

      await chip.click()
      await expect(chip).toHaveText('1')
      await expect(slot).toHaveAttribute('style', /--wg-span-cols: ?1/)
      const half = (await boxOf(slot)).width
      expect(half).toBeLessThan(full * 0.6)

      // 2 and 3 clamp to the same width here, so the chip toggles half ↔ full instead of
      // sitting dead for two taps.
      await chip.click()
      await expect(chip).toHaveText('Max')
      expect((await boxOf(slot)).width).toBeCloseTo(full, 0)
    })

    test('two half cards sit side by side on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 })
      await open(page)
      await hold(page, 'departure')

      // The two cards that actually neighbour each other in the rendered flow — `nth(1)`
      // would be whatever the seed happens to put second, collapsed cards included.
      const visible = await page.locator('.board-grid > .wg-slot:not([hidden])').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.card!),
      )
      const i = visible.indexOf('departure')
      const other = visible[i + 1]!

      for (const card of ['departure', other]) {
        await page.locator(`.wg-slot[data-card="${card}"] .wg-slot__size`).click()
        await expect(page.locator(`.wg-slot[data-card="${card}"]`)).toHaveAttribute('style', /--wg-span-cols: ?1/)
      }

      const a = await boxOf(page.locator('.wg-slot[data-card="departure"]'))
      const b = await boxOf(page.locator(`.wg-slot[data-card="${other}"]`))
      // Same row, different columns — the whole point of giving a phone two of them.
      expect(Math.abs(a.y - b.y), `${other} did not share a row with departure`).toBeLessThan(4)
      expect(b.x).toBeGreaterThan(a.x + a.width - 4)
    })

    // The ONE device that must never edit: a cast display, which renders this very <Board/>
    // on a TV with no pointer to hold. Note this is a capability check, not a permission
    // one — see the guest tests below for why the read-only guest is NOT in this list.
    test('a cast display can never arm edit mode', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript(() => localStorage.setItem('babillard-display', '1'))
      await page.goto('/board')
      await page.waitForSelector('.board-grid')
      await hold(page, 'today').catch(() => {})
      await expect(page.locator('.board-edit')).toHaveCount(0)
      await expect(page.locator('.wg-slot__grip')).toHaveCount(0)
    })

    test('a cast display cannot force it with ?edit=1 either', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript(() => localStorage.setItem('babillard-display', '1'))
      await page.goto('/board?edit=1')
      await page.waitForSelector('.board-grid')
      await expect(page.locator('.board-edit')).toHaveCount(0)
    })

    // A read-only guest — the babysitter, and the public demo, which is nothing but a
    // `showcase` guest token (functions/api/demo.ts) — MAY rearrange. The layout is a
    // per-device localStorage store (lib/boardCards): dragging a card writes nothing to the
    // server and changes nothing for the household. This used to be gated on `isGuest()`
    // alongside the real write guards, which left the demo unable to touch the one feature
    // that best shows the widget space off. Guarding these two directions so it stays fixed.
    test('a read-only guest can arm edit mode and rearrange their own screen', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
      await page.goto('/board')
      await page.waitForSelector('.board-grid')
      await hold(page, 'today')
      await expect(page.locator('.board-edit')).toBeVisible()
      await expect(page.locator('.wg-slot__grip').first()).toBeVisible()
    })

    test('a read-only guest still cannot write to the household', async ({ page }) => {
      // The corollary, on the same page: edit mode is reachable, the ＋ FAB is not. If this
      // ever flips, the guard was widened past device-local prefs.
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
      await page.goto('/board?edit=1')
      await page.waitForSelector('.board-grid')
      await expect(page.locator('.board-edit')).toBeVisible()
      await expect(page.locator('.add-fab')).toHaveCount(0)
    })
  })

  // A card DRAGGED ACROSS ZONES must keep rendering: the two zones used to build
  // separate node registries inside their own children, so a band card living in the
  // grid array (or vice versa) looked itself up in the wrong map — `undefined` read as
  // "empty", and the card either vanished (mode auto) or lingered as a bare
  // « Rien pour l'instant » shell. Board.tsx now builds ONE registry above both
  // WidgetGrids; this guards it. (Seeded directly rather than dragged — moveCard's own
  // cross-zone behaviour is unit-tested; what regressed was the RENDER.)
  test.describe('cross-zone cards keep rendering', () => {
    test('« Notes (frigo) » in the masonry and « Aujourd’hui » in the band both render real content', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {
        cardPrefs: {
          band: ['heroes', 'mots', 'aRegler', 'today'],
          grid: [
            'autoCard', 'routineNext', 'habitudes', 'tomorrow', 'countdown', 'toFinish',
            'todos', 'upcoming', 'cercleNotes', 'voyage', 'carnets', 'seasonUpkeep', 'drawings',
            'photos', 'notes',
          ],
        },
      })
      await page.goto('/board')
      await page.waitForSelector('.board-grid .wg-slot')

      // « Notes (frigo) » now lives in the GRID — and still renders its real fridge notes.
      const notes = page.locator('.board-grid .wg-slot[data-card="notes"]')
      await notes.scrollIntoViewIfNeeded()
      await expect(notes.locator('.notes__grid .note-card').first()).toBeVisible()

      // « Aujourd’hui » now lives in the BAND — full Section, not a placeholder. Its OWN
      // label is the first: the card also folds today's « Avant de partir » checklists in
      // at the foot of the agenda (a nested TodoSection with its own .sec-label), so a bare
      // `.sec-label` here is no longer unique and trips strict mode.
      const today = page.locator('.board-band .wg-slot[data-card="today"]')
      await today.scrollIntoViewIfNeeded()
      await expect(today.locator('.sec-label').first()).toContainText('Aujourd’hui')
      await expect(today.locator('.wg-slot__placeholder')).toHaveCount(0)
      await expect(notes.locator('.wg-slot__placeholder')).toHaveCount(0)
    })
  })

  // « Avant de partir » split (mig 0116): checklist instances live on the departure
  // card; « Tâches » shows only the loose todos. The fixtures serve two loose
  // standing todos + an instantiated « Avant de partir » pinned to today.
  test.describe('the departure card owns the checklists', () => {
    test('instances fold on « Avant de partir »; « Tâches » stays loose-only', async ({ page }) => {
      await open(page)

      const dep = page.locator('.wg-slot[data-card="departure"]')
      await dep.scrollIntoViewIfNeeded()
      // The instantiated list folds under its title (collapsed Disclosure + count).
      const fold = dep.locator('.todo-fold .disclosure__summary', { hasText: 'Avant de partir' })
      await expect(fold).toBeVisible()
      await expect(fold).toHaveAttribute('aria-expanded', 'false')
      await fold.click()
      await expect(dep.locator('.todo-row', { hasText: 'Vérifier les portes' })).toBeVisible()
      // The door to the full departure scene rides the card on every day.
      await expect(dep.locator('a[href$="/board/departure"]')).toBeVisible()

      // « Tâches » keeps the loose todos and must NOT show the instance rows or the
      // template picker (instantiation is a departure gesture now — plain text add only).
      const todos = page.locator('.wg-slot[data-card="todos"]')
      await todos.scrollIntoViewIfNeeded()
      await expect(todos.locator('.act', { hasText: 'Clés + téléphone + portefeuille' })).toBeVisible()
      await expect(todos.locator('.act', { hasText: 'Vérifier les portes' })).toHaveCount(0)
      await expect(todos.locator('.todo-fold')).toHaveCount(0)
    })

    // The agenda card's foot carries the same checklists as a REMINDER — and the whole
    // premise of a reminder is that the thing it points at is somewhere else. On a phone
    // (one column, both cards size 1, `departure` mode `always`) it was always the very
    // next card down: two « Avant de partir » headers and two identical folds inside
    // ~400px, the second pair being the one that can actually add. Nothing above the fold
    // showed it, which is why it took the sweep learning to scroll (2026-09-13). Both
    // directions are pinned here: a reminder that never fires is as wrong as one that
    // fires twice.
    test('the agenda does not repeat the checklists while the departure card is on the board', async ({ page }) => {
      await open(page)
      const today = page.locator('.wg-slot[data-card="today"]')
      await today.scrollIntoViewIfNeeded()
      await expect(today.locator('.todo-fold')).toHaveCount(0)
      // …and the card that owns them still has them.
      await expect(page.locator('.wg-slot[data-card="departure"] .todo-fold')).toHaveCount(1)
    })

    test('…and picks them back up when that card is hidden from the layout', async ({ page }) => {
      await mockApi(page)
      await seedState(page, { cardPrefs: { mode: { departure: 'never' } } })
      await page.goto('/board')
      await page.waitForSelector('.board-grid .wg-slot')

      await expect(page.locator('.wg-slot[data-card="departure"]')).toHaveCount(0)
      const today = page.locator('.wg-slot[data-card="today"]')
      await today.scrollIntoViewIfNeeded()
      const fold = today.locator('.todo-fold .disclosure__summary', { hasText: 'Avant de partir' })
      await expect(fold).toBeVisible()
    })

    test('picking a template on the departure card POSTs the instantiation', async ({ page }) => {
      await open(page)
      const dep = page.locator('.wg-slot[data-card="departure"]')
      await dep.scrollIntoViewIfNeeded()
      // Focus the add field → the template options open; picking one instantiates it
      // (the server pins a day-less template POST to today — mig 0116).
      await dep.locator('.edit-field input').click()
      const post = page.waitForRequest((r) => r.url().includes('/api/todos') && r.method() === 'POST')
      await page.getByRole('option', { name: /Sac des enfants/ }).click()
      const body = (await post).postDataJSON() as { templateId?: string }
      expect(body.templateId).toBe('tpl2')
    })

    test('a read-only guest sees the card without any write control', async ({ page }) => {
      await mockApi(page)
      await seedState(page, {})
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
      await page.goto('/board')
      await page.waitForSelector('.board-grid .wg-slot')

      const dep = page.locator('.wg-slot[data-card="departure"]')
      await dep.scrollIntoViewIfNeeded()
      await expect(dep.locator('a[href$="/board/departure"]')).toBeVisible()
      // No add field, no tappable checks — TodoSection's read-only path.
      await expect(dep.locator('.edit-field')).toHaveCount(0)
      await expect(dep.locator('button.todo-row__check')).toHaveCount(0)
    })
  })
})

// ── folded from board-customize.spec.ts ──────────────────────────────────────────────
test.describe('board-customize', () => {
  // Board customization + lens coverage — the §6 e2e gaps from AUJOURDHUI.md that the
  // static screenshot frames never exercise: the « Disposition du babillard » toggle UI
  // (only its rendered RESULT was covered) and the board re-rendering under a picked face
  // (the face lens, beyond the greeting).
  // Same frontend-only harness as interactions-*.spec.ts: Vite + stubbed /api/**.

  async function board(page: Page, freezeClock = false) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    // Only the face-lens test freezes the clock (to the mock epoch) so the timed
    // Garderie event stays live and visible — the board lifecycle folds "past" items
    // into a collapsed disclosure vs the real clock.
    if (freezeClock) await page.clock.setFixedTime(new Date(BASE * 1000))
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  }

  // ─────────────────────── the retired « Moments » scene ─────────────────

  test.describe('/moment is retired', () => {
    test('an old /moment link lands on the board instead of a blank shell', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      // A texted link, a bookmark or a kiosk mid-navigation still hits this path.
      await page.goto('/moment?scope=week')
      await page.waitForURL('**/board')
      await expect(page.locator('.hub')).toBeVisible()
    })
  })

  // ───────────────── « Disposition du babillard » toggle UI ───────────────

  test.describe('board layout customization', () => {
    // Navigate to Réglages ▸ Affichage where the BoardLayoutSection lives. Seeding is
    // done once in the test (addInitScript persists across page.goto), so this only
    // navigates + opens the tab — re-seeding would stack duplicate route handlers.
    async function openLayout(page: Page) {
      // « Disposition du babillard » is its own sub-section under « Le babillard » —
      // deep-link to it (?tab=display&sub=layout) so the layout panel renders.
      await page.goto('/settings?tab=display&sub=layout')
      await page.locator('.operator__tabs').waitFor({ state: 'visible', timeout: 15_000 })
      // Two zone lists (the band + the masonry) — wait for the first.
      await page.locator('.board-layout').first().waitFor({ state: 'visible' })
    }

    const rowFor = (page: Page, name: string) => page.locator('.board-layout__row', { hasText: name })
    /** Click the tri-state until the card reads « Jamais » (always → auto → never). */
    async function setNever(page: Page, name: string) {
      const btn = rowFor(page, name).locator('.board-layout__toggle')
      for (let i = 0; i < 3; i++) {
        if ((await btn.textContent())?.includes('Jamais')) return
        await btn.click()
      }
      await expect(btn).toContainText('Jamais')
    }

    test('hiding a card in Réglages removes it from the Grille; reset brings it back', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await openLayout(page)
      // « À venir » defaults to « Si non vide » — one more click reaches « Jamais ».
      await setNever(page, 'À venir')

      // The per-device pref is localStorage-backed, so a fresh board load honours it:
      // the « À venir » bento is gone (the fixture has upcoming items, so it WOULD show).
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible' })
      await expect(page.locator('.bento .sec-label b', { hasText: /^À venir$/ })).toHaveCount(0)

      // Reset from the panel restores the default layout → the card comes back.
      // The button now confirms first (2026-09-03 — a factory-reset button sharing
      // undo's icon, with no confirm, was the predictability audit's #1 finding).
      await openLayout(page)
      await page.getByRole('button', { name: 'Réinitialiser' }).click()
      await page.locator('.confirm').getByRole('button', { name: 'Réinitialiser', exact: true }).click()
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible' })
      await expect(page.locator('.bento .sec-label b', { hasText: /^À venir$/ })).toHaveCount(1)
    })

    test('a band card (Notes) hides too — and now drags, like every other card', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible' })
      await expect(page.locator('.wg-slot[data-card="notes"]')).toBeVisible()

      await openLayout(page)
      // The band lists its seven cards: since review #15 it opens with the day (« Aujourd'hui »,
      // « Ce soir », routine, tâches, à régler) before the fridge and Souvenirs, and every
      // one of them carries a drag grip: band cards used to be show/hide-only, pinned in
      // place. That asymmetry is gone.
      const band = page.locator('.board-layout').first()
      await expect(band.locator('.board-layout__row')).toHaveCount(7)
      await expect(band.locator('.board-layout__row .dnd-grip')).toHaveCount(7)
      // Each zone ends in a drop target, so a card can be moved into an emptied group.
      await expect(page.locator('.board-layout__end')).toHaveCount(2)

      // `setNever` clicks the tri-state until it reads « Jamais », whatever it started on.
      // Exact label matters: « Les notes » is a row here too.
      await setNever(page, 'Mots')
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible' })
      await expect(page.locator('.wg-slot[data-card="notes"]')).toHaveCount(0)
    })

    // The grip's ↑/↓ keyboard mirror (PARITY.md's desktop-reachability rule) —
    // added 2026-09-03 after a code-review pass found DragPill drag-only across all
    // 8 of its call sites, boardLayout.tsx among them despite CLAUDE.md documenting
    // this exact panel as "the ACCESSIBLE MIRROR" of the board's press-and-drag
    // editor. A mirror that's itself drag-only isn't one.
    test('the grip is a real Tab stop — ↑/↓ reorders within the band, mouse-only', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await openLayout(page)
      const band = page.locator('.board-layout').first()
      const names = () => band.locator('.board-layout__row .board-layout__name')
      const before = await names().allTextContents()
      expect(before.length).toBeGreaterThan(1)

      // Tab reaches the first row's grip — never a click, so this proves the door is
      // open to a keyboard/mouse user with no pointer drag at all.
      const firstGrip = band.locator('.board-layout__row').first().locator('.dnd-grip')
      await firstGrip.focus()
      await expect(firstGrip).toBeFocused()
      await firstGrip.press('ArrowDown')

      // The first two rows swapped; nothing else moved.
      const after = await names().allTextContents()
      expect(after[0]).toBe(before[1])
      expect(after[1]).toBe(before[0])
      expect(after.slice(2)).toEqual(before.slice(2))

      // Persisted (localStorage-backed, like every board-layout knob) — survives a
      // fresh open of the panel, not just an in-memory re-render.
      await openLayout(page)
      await expect(band.locator('.board-layout__row .board-layout__name').first()).toHaveText(before[1]!)
    })

    test('the width control resizes the card on the board', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await openLayout(page)
      // « À venir » starts one column wide; one click takes it to two.
      const size = rowFor(page, 'À venir').locator('.board-layout__size')
      await expect(size).toContainText('1')
      await size.click()
      await expect(size).toContainText('2')

      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/board')
      await page.waitForSelector('.board-grid .wg-slot')
      await expect(page.locator('.wg-slot[data-card="upcoming"]')).toHaveAttribute('style', /--wg-span-cols: ?2/)
    })

    // Every already-shipped wall tablet carries the v1 `{order, hidden}` shape under the
    // SAME localStorage key. If `reconcile` ever stops reading it, a household silently
    // loses its layout on upgrade — the failure no test would otherwise notice.
    test('a device carrying the OLD v1 layout keeps it after the upgrade', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await page.addInitScript(() =>
        localStorage.setItem(
          'babillard-card-prefs',
          JSON.stringify({ order: ['upcoming', 'today'], hidden: ['todos', 'moments'] }),
        ),
      )

      await page.goto('/board')
      await page.waitForSelector('.board-grid .wg-slot')
      // v1 `hidden` → v2 `never`: the card isn't mounted at all. « moments » is a RETIRED
      // id — `reconcile` drops what it doesn't recognise, so an upgraded device sheds it
      // rather than rendering a ghost slot.
      await expect(page.locator('.wg-slot[data-card="todos"]')).toHaveCount(0)
      await expect(page.locator('.wg-slot[data-card="moments"]')).toHaveCount(0)
      // …and its chosen order survived (« À venir » was pulled ahead of « Aujourd'hui »).
      const order = await page.locator('.board-grid > .wg-slot').evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset.card),
      )
      expect(order.indexOf('upcoming')).toBeLessThan(order.indexOf('today'))
      // The band it never stored is reconstructed, canonically.
      await expect(page.locator('.board-band > .wg-slot[data-card="heroes"]')).toHaveCount(1)

      // The panel reads the migrated value, not the raw one. Read « Tâches »: the other
      // seeded id, « moments », is retired and has no row at all any more.
      await openLayout(page)
      await expect(rowFor(page, 'Tâches').locator('.board-layout__toggle')).toContainText('Jamais')
    })

    test('« Voir dans l’app » on the layout sub opens the board’s own editor', async ({ page }) => {
      // The old per-section « Réorganiser sur le babillard » button became the
      // shared « Voir dans l'app » backlink (SUB_GOTO in lib/settingsNav) — same
      // destination, one pattern for every sub.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await openLayout(page)
      await page.locator('.operator__goto').click()
      await expect(page).toHaveURL(/\/board\?edit=1/)
      await expect(page.locator('.board-edit')).toBeVisible()
    })
  })

  // ────────────────────── « À régler » kiosk visibility ───────────────────
  // A-4 of bmad/10: the card used to be gated `surface === 'mobile'`, hiding it on the
  // one always-glanced surface a household shares. It's now `audience === 'parent' &&
  // !ro` — visible on a kiosk under the parent lens, still hidden for toddler/guest.

  const A_REGLER_SIGNAL = [{ kind: 'birthday', key: 'b1', label: 'Léa', at: BASE + 86400, href: '/maison?section=family' }]

  async function stubARegler(page: Page) {
    // Registered AFTER mockApi so this wins over the default empty-signals fixture.
    await page.route('**/api/a-regler**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signals: A_REGLER_SIGNAL }) }),
    )
  }

  test.describe('« À régler » kiosk visibility', () => {
    test('the card renders on a kiosk under the parent lens (no longer mobile-only)', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await stubARegler(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      await expect(page.locator('.now-card--regler')).toBeVisible()
    })

    test('hidden under the toddler lens, even on a kiosk with frictions pending', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await stubARegler(page)
      await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true, surface: 'kiosk' })
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      await expect(page.locator('.now-card--regler')).toHaveCount(0)
    })

    test('hidden for a read-only guest, even on a kiosk with frictions pending', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mockApi(page)
      await stubARegler(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
      await page.addInitScript(() => localStorage.setItem('babillard-guest-preview', '1'))
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      await expect(page.locator('.now-card--regler')).toHaveCount(0)
    })
  })

  // ───────────────────────────── face lens ───────────────────────────────

  test('picking a face re-renders the board, hiding another member’s items', async ({ page }) => {
    await board(page, true) // freeze clock so the timed Garderie event stays live under the lens
    // Maisonnée (everyone): Garderie (Léa, m3) shows in Aujourd'hui.
    await expect(page.locator('.act', { hasText: 'Garderie' })).toBeVisible()
    // Pick Papa (m2) via the mobile profile chip → face picker sheet.
    await page.locator('.profile-chip').click()
    await expect(page.locator('.sheet.show')).toBeVisible()
    await page.locator('.profile-face', { hasText: 'Papa' }).click()
    await expect(page.locator('.greet')).toContainText('Papa')
    // The board re-renders under the lens: an event that's neither Papa's nor shared
    // (Garderie = Léa's) drops out, while a shared, unassigned row stays. (Match by
    // text, not `.act`: under Papa only the one shared timed event remains, so « Le fil
    // du jour » collapses and it surfaces as the Prochainement headline — still visible,
    // just not a plain Act row.)
    await expect(page.locator('.act', { hasText: 'Garderie' })).toHaveCount(0)
    await expect(page.getByText('Rappel: facture')).toBeVisible()
  })

  // ─────────── D-21 « Sortir le bac » — evening-before chore announce ─────────
  // The 86400-day-scale "evening before" line (src/lib/boardModel.ts + migration
  // 0109): a chore flagged `announce_evening` due TOMORROW shows a « Ce soir »
  // board line tonight. Needs an EVENING frozen clock (MMID + 19h local, distinct
  // from the other tests' 04:00-local BASE) since the model gates on timeOfDay.

  const DAY = 86400
  const EVENING = MMID + 19 * 3600 // 19:00 local — well inside the 'evening' window
  const FLAGGED_TITLE = 'Sortir le bac bleu'

  // A task in « À venir » (the payload's `tasksAhead`, one list for every task since
  // 2026-11-08) whose next occurrence lands exactly on tomorrow's local midnight — the
  // model's own match condition.
  const flaggedChore = boardTask({ source: 'task', id: 'bac1', title: FLAGGED_TITLE, color: '#88A36F', recurring: true, day: MMID + DAY, dueToday: false, onBoard: false, announceEvening: true })

  async function boardWithTasksAhead(page: Page, tasksAhead: unknown[]) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(new Date(EVENING * 1000))
    await mockApi(page)
    // Registered AFTER mockApi so this wins over the default BOARD fixture.
    await page.route('**/api/board**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOARD, tasksAhead }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
  }

  test.describe('« Sortir le bac » evening-before announce (D-21)', () => {
    // The SAME chore also legitimately renders as an ordinary « Demain » nav row (a task dated
    // tomorrow sits on « Demain » since 2026-11-18, the way tomorrow's events do)
    // (a `<button class="act act--nav">`, tappable to its detail) — announce_evening
    // doesn't remove it from there, it only ADDS the evening line. So scope every
    // assertion to `div.act` (a static, non-interactive card — the announce/fête
    // shape, see Act.tsx) rather than the bare `.act` class, which would also match
    // that other, unrelated row.
    const announceRow = (page: Page) => page.locator('div.act', { hasText: FLAGGED_TITLE })

    test('a flagged chore due tomorrow announces itself tonight as « Ce soir »', async ({ page }) => {
      await boardWithTasksAhead(page, [flaggedChore])
      const row = announceRow(page)
      await expect(row).toBeVisible()
      await expect(row.locator('.when')).toHaveText('Ce soir')
    })

    test('an UNFLAGGED chore due tomorrow stays silent tonight', async ({ page }) => {
      await boardWithTasksAhead(page, [{ ...flaggedChore, announceEvening: false }])
      await expect(announceRow(page)).toHaveCount(0)
    })

    test('a flagged chore due tomorrow stays silent when this device opted out', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.clock.setFixedTime(new Date(EVENING * 1000))
      await mockApi(page)
      await page.route('**/api/board**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...BOARD, tasksAhead: [flaggedChore] }) }),
      )
      // Per-device opt-out (lib/choreAnnounce), same persisted-before-load pattern
      // as the theme/audience seeds below.
      await page.addInitScript(() => localStorage.setItem('babillard-bac', '0'))
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      await expect(announceRow(page)).toHaveCount(0)
    })

    test('a flagged chore due further out (not tomorrow) stays silent tonight', async ({ page }) => {
      // e.g. the OTHER week of a biweekly rotation — its next occurrence isn't
      // tomorrow, so it must not announce even though the flag is on.
      await boardWithTasksAhead(page, [{ ...flaggedChore, day: MMID + 8 * DAY }])
      await expect(announceRow(page)).toHaveCount(0)
    })
  })
})


// ── folded from dnd-mirrors.spec.ts ──────────────────────────────────────────────
test3.describe('dnd-mirrors', () => {
  // A DRAG IS NEVER THE ONLY DOOR (solidify 1.8, 2026-11-05). Two surfaces had a
  // press-and-hold as their one way to move a thing, while PARITY.md's matrix called
  // them ✅ non-touch: a meal could only change DAYS by dragging it on the week grid, and
  // a face could only reach a generation band in the family builder by being dragged
  // there. Both now have a menu door a mouse, a keyboard and a screen reader can drive —
  // and `src/lib/dnd-mirror.test3.ts` keeps every usePointerDnd host paired with its
  // mirror. These two cases drive the new doors end to end, mouse only, no drag.

  test3('a meal moves to another day and slot from its row ⋯ « Déplacer… » — and « Annuler » moves it back', async ({ page, app }) => {
    // The day scene on the fixture's first day (clock BASE: that day is today, so its
    // meals read as live). Souper holds « Spaghetti maison » (meal1, recipe-linked).
    await app.boot({ route: `/kitchen/day/${MMID}?vue=repas`, clock: 'BASE', wait: '.scene' })
    const posts: Record<string, unknown>[] = []
    await page.route('**/api/meals', (route) => {
      if (route.request().method() === 'POST') posts.push(JSON.parse(route.request().postData() || '{}'))
      return route.fallback()
    })

    const row = page.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row', { hasText: 'Spaghetti maison' })
    await expect(row).toBeVisible()
    await row.locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Déplacer…' }).click()

    // The shared day + slot picker, in a sheet named after the meal.
    const sheet = page.locator('.sheet.show')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Déplacer « Spaghetti maison »')
    // Pick « Dîner », then the third day of the window (two days on).
    await sheet.locator('.slot-picker .chip', { hasText: 'Dîner' }).click()
    await sheet.locator('.meal-plan-pick__days .chip:not(.meal-plan-pick__unplaced)').nth(2).click()

    // ONE reschedule through the owner (mealMutations.reschedule): id, the picked day,
    // the picked slot — the same body the drag sends.
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ action: 'reschedule', id: 'meal1', toDate: MMID + 2 * 86_400, slot: 'lunch' })
    await expect(page.locator('.sheet.show')).toBeHidden()

    // The undo is the INVERSE move — nothing is deleted or recreated.
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect.poll(() => posts.length).toBe(2)
    expect(posts[1]).toMatchObject({ action: 'reschedule', id: 'meal1', toDate: MMID, slot: 'supper' })
  })

  test3('a face reaches a generation band from its chip ⋯ « Placer » — no drag', async ({ page, app }) => {
    // Editing the fixture's « Famille Tremblay » opens the builder with its three contacts
    // in the tray (nothing placed yet).
    await app.boot({ route: '/cercle/family/g1', wait: '.cercle-fam__bands' })
    const tray = page.locator('[data-dnd-zone="tray"]')
    const parents = page.locator('[data-dnd-zone="parents"]')
    const trayBefore = await tray.locator('.cercle-fam__chip').count()
    expect(trayBefore).toBeGreaterThan(0)
    await expect(parents.locator('.cercle-fam__chip')).toHaveCount(0)

    const chip = tray.locator('.cercle-fam__chip').first()
    const name = await chip.locator('.cercle-fam__chip-name').innerText()
    await chip.locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'Parents', exact: true }).click() // not « Grands-parents »

    // The chip now sits in the Parents band — the same state a drop would leave.
    await expect(parents.locator('.cercle-fam__chip', { hasText: name })).toHaveCount(1)
    await expect(tray.locator('.cercle-fam__chip')).toHaveCount(trayBefore - 1)

    // …and the way back: a placed face's ⋯ offers the tray.
    await parents.locator('.cercle-fam__chip', { hasText: name }).locator('.action-menu__btn').click()
    await page.getByRole('menuitem', { name: 'À placer' }).click()
    await expect(parents.locator('.cercle-fam__chip')).toHaveCount(0)
    await expect(tray.locator('.cercle-fam__chip')).toHaveCount(trayBefore)
  })
})
