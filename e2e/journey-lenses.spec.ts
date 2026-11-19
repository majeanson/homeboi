import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BOARD, MMID } from './mocks'
import { test as test3, test as test6, test as test7 } from './fixtures'
import { boxOf } from './measure'
import { type Audience } from '../src/lib/audience'

// JOURNEY — THE TODDLER & SIMPLE LENSES (review #43; was toddler-board.spec.ts + toddler-kitchen.spec.ts + toddler-liste.spec.ts + toddler-maison.spec.ts + toddler-notes.spec.ts + toddler-one-screen.spec.ts + lens-gates.spec.ts).
//
// The toddler board — the wall tablet's other face, and until now screenshot-only.
// A picture can't test what actually matters here, which is what a tap DOESN'T do.
//
// On the kid lens the board is **hear-first**: a chore, an event, a meal is a tile
// you tap to have read to you, and that is all. None of them carries an `onTap`, so
// none of them can be checked off from here — a pre-reader's finger wanders across a
// wall tablet all day, and a board where touching « Sortir les poubelles » ticked it
// would quietly corrupt the household's day. (The two-tap arm exists for the few
// tiles that DO commit — the défi, the routine filmstrip — and is covered where those
// live; on the board the guarantee is stronger: no write at all.)
//
// Also covered: the « Rien de prévu » all-clear, which is deliberately a WIDER check
// than the parent board's `dayClear` (boardModel: weather/notes/tomorrow count for
// the kid lens, decided in bmad/10) — so an empty day still reads as intentional to
// someone who can't read the empty sections.

// THE CLOCK IS FROZEN, and it has to be: "empty" here means the fixture is empty, and
// the board's own idea of a day is WIDER than the fixture. Holidays and school-year
// edges are DERIVED from the real date (lib/year), so on the eve of a real holiday
// « Demain » had something to say — « Congé férié · Fête du Travail » — and refused to
// collapse. Three specs went red on 2026-09-06 for exactly that, and would have on the
// eve of every holiday since. Freezing to the fixture's own anchor makes these tests
// about emptiness again rather than about the calendar. (Same family as the fixed-86400
// DST trap CLAUDE.md names — a test that passes most days is not passing.)
test.describe('toddler-board', () => {
  async function kidBoard(page: Page, opts: Parameters<typeof mockApi>[1] = {}) {
    await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, opts)
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
    await page.goto('/board')
    await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
    // Since review #25 the first screen is tonight / now-next / routine / doors, and the
    // rest folds behind « Tout voir »; these tests are about that rest, so open it.
    const more = page.locator('.today-kid__more .disclosure__summary')
    await more.waitFor({ state: 'visible', timeout: 15_000 })
    await more.click()
  }

  test('the toddler board renders picture tiles, not the parent bento', async ({ page }) => {
    await kidBoard(page)
    await expect(page.locator('.bigtile').first()).toBeVisible()
    // The control: without this the assertions below could pass against a parent
    // surface that simply has no `.bigtile` to click.
    await expect(page.locator('.today-kid__section').first()).toBeVisible()
    await expect(page.locator('.wg-slot')).toHaveCount(0)
  })

  test('tapping a tile reads it aloud and writes nothing — the board is hear-first', async ({ page }) => {
    await kidBoard(page)

    // Any /api/* write at all would be a bug here, so watch for the method, not a path.
    const writes: string[] = []
    page.on('request', (r) => {
      if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url())
    })

    const chore = page.locator('.bigtile', { hasText: 'Sortir les poubelles' })
    await expect(chore).toBeVisible()
    await chore.click()
    // The tap registers visibly even when the device has no FR-CA voice installed —
    // otherwise a child taps and nothing at all happens.
    await expect(chore).toHaveClass(/is-speaking/)

    // Tap again: still nothing committed. A read-aloud tile never arms, so a second
    // touch can't become a confirmation by accident.
    await chore.click()
    await expect(chore).not.toHaveClass(/is-armed/)
    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    expect(writes, 'the toddler board must not write from a tile tap').toEqual([])
    // …and the chore is still not marked done.
    await expect(chore).not.toHaveClass(/is-done/)
  })

  test('an empty day says « Rien de prévu » instead of leaving a blank wall', async ({ page }) => {
    // Two things `fresh` alone doesn't clear, and the kid all-clear counts both — which
    // is exactly the point of it being a WIDER check than the parent's `dayClear`:
    //   • the sky — `weather` is FRESH_EXEMPT (a new household still has weather);
    //   • the suppers — `fresh` empties arrays, and `tonight`/`tomorrowMeal` are objects
    //     (see the note in mocks.ts), so they have to be nulled explicitly.
    await kidBoard(page, {
      fresh: true,
      overrides: {
        weather: { weather: null, tomorrow: null, hours: [] },
        board: { ...BOARD, tonight: null, tomorrowMeal: null, dayNote: null, tomorrowNote: null },
      },
    })

    const clear = page.locator('.today-kid__clear')
    await expect(clear).toBeVisible()
    await expect(clear).toContainText('Rien de prévu')
    // Tap-to-hear, like everything else on this lens: the audience can't read it.
    await expect(clear).toHaveJSProperty('tagName', 'BUTTON')
    await expect(page.locator('.bigtile')).toHaveCount(0)
  })

  test('the weather stays on an otherwise empty day — and then it is NOT all-clear', async ({ page }) => {
    // The other side of that same wider check: rain tomorrow is something to tell a
    // pre-reader about, so the all-clear line must not claim the day is empty.
    await kidBoard(page, { fresh: true })
    await expect(page.locator('.today-kid__clear')).toHaveCount(0)
    await expect(page.locator('.today-hero--weather')).toBeVisible()
  })

  // « Avant de partir » on the kid lens (bmad/11 tier-1 seam #4). On a locked kiosk
  // (?kid=1) the parent departure CARD sits behind a 3 s hold + an arithmetic gate —
  // every morning, for the one-tablet household that needs it most at 7h10. The items
  // did already reach this board, but folded into « Tâches », where « prends ta boîte
  // à lunch » read the same as « ranger ta chambre ». They are their own section now.
  test('the leaving checklist is its own section, not mixed into « Tâches »', async ({ page }) => {
    await kidBoard(page)

    // The fixture's departure instances (source_template_id set) group under their own
    // heading, separate from the to-dos.
    // WAIT for the sections before reading them: `allInnerTexts()` does not wait, and on
    // a loaded CI runner the to-dos had not answered yet — it read [] (2026-09-23;
    // reproduced with a 1.5 s API delay).
    await expect(page.locator('.today-kid__h', { hasText: 'Avant de partir' })).toBeVisible()
    await expect(page.locator('.today-kid__h', { hasText: 'Tâches' })).toBeVisible()
    const heads = await page.locator('.today-kid__h').allInnerTexts()
    expect(heads).toContain('Avant de partir')
    expect(heads).toContain('Tâches')

    const depart = page.locator('.today-kid__section', { hasText: 'Avant de partir' })
    await expect(depart.locator('.bigtile').first()).toBeVisible()
    // A checklist item is in the leaving section…
    await expect(depart).toContainText('Vérifier les portes')
    // …and NOT duplicated into the to-do section beside it.
    const todoSec = page.locator('.today-kid__section', { hasText: /^À faire/ })
    if (await todoSec.count()) await expect(todoSec).not.toContainText('Vérifier les portes')
  })

  test('the leaving tiles are hear-first too — tapping one writes nothing', async ({ page }) => {
    // The whole board's contract, extended to the new section: a wandering finger must
    // not be able to tick the household's morning off the wall.
    await kidBoard(page)
    const writes: string[] = []
    page.on('request', (r) => {
      if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith('/api/')) writes.push(r.url())
    })

    const tile = page.locator('.today-kid__section', { hasText: 'Avant de partir' }).locator('.bigtile').first()
    await tile.click()
    await expect(tile).toHaveClass(/is-speaking/)
    await tile.click()
    await expect(tile).not.toHaveClass(/is-armed/)
    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    expect(writes, 'the leaving checklist must not be tickable from the kid board').toEqual([])
  })
})

// ── folded from toddler-kitchen.spec.ts ──────────────────────────────────────────────
test.describe('toddler-kitchen', () => {
  // The toddler lens on La cuisine — the other half of the wall tablet's kid face, and
  // screenshot-only until now. `journey-lenses.spec.ts` covers the board's guarantee
  // (hear-first, no tap can write at all). The kitchen is the surface where a child CAN
  // commit something, so its guarantees are different and need their own guard:
  //
  //   · a child's pick is an IDEA (POST meal-ideas), never a plan — nothing may ever
  //     reach /api/meals from here, or a pre-reader's finger rewrites the household's week
  //   · one tap never commits: every acting tile arms first, and only the second tap fires
  //   · a day that already has a supper is TAKEN — greyed, and it stays read-only
  //   · a read-only guest keeps the week (reading is fine) and loses the pick shelf
  //
  // THE CLOCK IS FROZEN, same reason as the toddler board: the week here is "the next 7
  // days" off the real date, and which day cells are empty is what these tests point at.
  // Frozen to the fixture's own anchor (a Sunday), today and tomorrow carry a supper and
  // the rest of the week is free.
  async function kidKitchen(page: Page, opts: Parameters<typeof mockApi>[1] = {}) {
    await page.clock.setFixedTime(new Date((MMID + 12 * 3600) * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, opts)
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
    await page.goto('/kitchen')
    await page.locator('.kid__main').waitFor({ state: 'visible', timeout: 15_000 })
  }

  // Every non-GET /api/* call the page makes, watched by METHOD rather than by path —
  // the point is that nothing unexpected is written, so an allow-list would be the wrong
  // shape here.
  function watchWrites(page: Page): { method: string; path: string; body: string }[] {
    const writes: { method: string; path: string; body: string }[] = []
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (r.method() !== 'GET' && u.pathname.startsWith('/api/')) {
        writes.push({ method: r.method(), path: u.pathname.replace('/api/', ''), body: r.postData() || '' })
      }
    })
    return writes
  }

  // « Quel jour ? » — the SECOND step of the pick. Both steps are a `.kid-pick`
  // section; only the day chooser carries the « ← Retour » door, so that is what tells
  // them apart (asserting on `.kid-pick` alone silently matches the shelf too).
  const dayStep = (page: Page) => page.locator('.kid-pick:has(.kid-pick__back)')

  // BigTiles arms on the first tap and commits on the second (« tape encore »). Both
  // taps are the product behaviour, so the helper is deliberately not called "click".
  async function tapTwice(tile: ReturnType<Page['locator']>) {
    await tile.click()
    await expect(tile).toHaveClass(/is-armed/)
    await tile.click()
  }

  test('the kid lens replaces the parent kitchen, week first', async ({ page }) => {
    await kidKitchen(page)
    // The control: without this, every assertion below could pass on a surface that
    // simply has no tiles to tap.
    await expect(page.locator('.bigtile').first()).toBeVisible()
    // …and it is the KID surface: the parent kitchen's sub-tab row is not rendered.
    await expect(page.locator('.subtabs')).toHaveCount(0)
    // Today's planned supper is on it, named.
    await expect(page.locator('.bigtile', { hasText: 'Spaghetti maison' }).first()).toBeVisible()
  })

  test('a child’s pick is an IDEA, never a plan — meal-ideas is written, meals is not', async ({ page }) => {
    await kidKitchen(page)
    const writes = watchWrites(page)

    // Pick a recipe off the shelf, then a free day for it.
    await tapTwice(page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first())
    await expect(dayStep(page)).toBeVisible()
    const freeDay = dayStep(page).locator('.bigtile:not(.is-done)').first()
    await tapTwice(freeDay)

    await expect.poll(() => writes.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(writes.map((w) => w.path)).toEqual(['meal-ideas'])
    const body = JSON.parse(writes[0]!.body || '{}')
    expect(body).toMatchObject({ title: 'Tacos au poulet', recipeId: 'rc2' })
    expect(typeof body.date, 'the idea carries the day the child chose').toBe('number')
    // The pick closes itself, so a wandering finger can't fire it twice.
    await expect(dayStep(page)).toHaveCount(0)
  })

  test('one tap never commits — the tile arms and waits', async ({ page }) => {
    await kidKitchen(page)
    const writes = watchWrites(page)

    const recipe = page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first()
    await recipe.click()
    await expect(recipe).toHaveClass(/is-armed/)
    // A single tap opened nothing and wrote nothing: it only read the tile aloud.
    await expect(dayStep(page)).toHaveCount(0)
    expect(writes).toEqual([])
  })

  test('a day that already has a supper is taken — tapping it writes nothing', async ({ page }) => {
    await kidKitchen(page)
    const writes = watchWrites(page)

    await tapTwice(page.locator('.bigtile', { hasText: 'Tacos au poulet' }).first())
    const taken = dayStep(page).locator('.bigtile.is-done').first()
    // Today's supper is planned, so the week always has at least one taken day.
    await expect(taken).toBeVisible()
    await taken.click()
    await taken.click()
    // It never arms (no onTap), and nothing is written over the plan that exists.
    await expect(taken).not.toHaveClass(/is-armed/)
    expect(writes).toEqual([])
  })

  test('a read-only guest still hears the week, but is offered no pick', async ({ page }) => {
    await kidKitchen(page)
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/kitchen')
    await page.locator('.kid__main').waitFor({ state: 'visible', timeout: 15_000 })

    // The week reads as before — a sitter's toddler can still hear what supper is.
    await expect(page.locator('.bigtile', { hasText: 'Spaghetti maison' }).first()).toBeVisible()
    // …and the shelf that commits a suggestion is not there at all.
    await expect(page.locator('.bigtile', { hasText: 'Tacos au poulet' })).toHaveCount(0)
  })

  // A pre-reader picks by sight, so two things that mean different things may not wear
  // the same picture. The « Choisis un repas » heading used to carry 📖 — the same glyph,
  // in the same white disc, ~150px above the « Mon livre » door that also carries 📖.
  // Same rule the notes tab earned in the 2026-09-10 pass: rendering a picture is not the
  // same as being able to tell them apart. Asserted as the RULE, not as one emoji: no
  // section heading may share its glyph with any tile beneath it.
  test('no heading wears the same picture as a door under it', async ({ page }) => {
    await kidKitchen(page)

    const heads = await page.locator('.kid-head__emoji').allInnerTexts()
    const tiles = await page.locator('.bigtile__icon').allInnerTexts()
    expect(heads.length, 'no kid heading found — the selector moved').toBeGreaterThan(0)
    const clash = heads.map((h) => h.trim()).filter((h) => h && tiles.map((x) => x.trim()).includes(h))
    expect(clash, `a heading and a tile share a picture: ${clash.join(', ')}`).toEqual([])
  })
})


// ── folded from toddler-liste.spec.ts ──────────────────────────────────────────────
test3.describe('toddler-liste', () => {
  // The toddler lens on « La liste » (solidify 4.4: the one toddler tab without a spec). The
  // promise is in Liste.tsx: a pre-reader sees what is still needed, as pictures, and a tap
  // reads it aloud WITHOUT ticking it. A write from this lens would change a real shopping
  // trip behind a parent's back.
  const list = [
    { id: 'a', text: 'Lait', checked_at: null },
    { id: 'b', text: 'Pommes', checked_at: null },
    { id: 'c', text: 'Pain', checked_at: 1_700_000_000 },
  ]

  test3('only what is still needed shows, as tiles', async ({ page, app }) => {
    await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list } } }, wait: '.bigtiles' })
    await expect(page.locator('.bigtile')).toHaveCount(2)
    await expect(page.locator('.bigtiles')).not.toContainText('Pain')
  })

  test3('a tap never writes', async ({ page, app }) => {
    const writes: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`)
    })
    await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list } } }, wait: '.bigtiles' })
    await page.locator('.bigtile').first().click()
    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    await expect(page.locator('.bigtile')).toHaveCount(2)
    expect(writes).toEqual([])
  })

  test3('an empty list says so, in the same big frame', async ({ page, app }) => {
    await app.boot({ route: '/liste', state: { audience: 'toddler' }, api: { overrides: { board: { ...BOARD, list: [] } } }, wait: '.bigtiles__empty' })
    await expect(page.locator('.bigtile')).toHaveCount(0)
  })
})


// ── folded from toddler-maison.spec.ts ──────────────────────────────────────────────
test.describe('toddler-maison', () => {
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
})


// ── folded from toddler-notes.spec.ts ──────────────────────────────────────────────
test.describe('toddler-notes', () => {
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

  // The same promise, one tab over. « Couches » is an ordinary grocery line and the picto
  // map had no household half at all — so it fell through to La liste's fallback, 🛒,
  // which is the SAME cart the page wears in its own header. A pre-reader was shown the
  // picture for "shopping" and nothing about diapers, and two tiles that share a picture
  // are one picture (2026-09-14, second frame of liste-toddler).
  //
  // Asserted as the RULE, not the emoji: no heading may wear the same picture as a tile
  // beneath it, and no two tiles may share one. Its twin lives in journey-lenses.spec.ts
  // — that surface had the same defect between its heading and its first door.
  test('the toddler list gives every line its own picture, and none of them the header’s', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', calm: true })
    await page.goto('/liste')
    await page.locator('.bigtiles').first().waitFor({ state: 'visible', timeout: 15_000 })

    const heads = (await page.locator('.kid-head__emoji').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
    const tiles = (await page.locator('.bigtile__icon').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
    expect(tiles.length, 'no list tiles found — the selector moved').toBeGreaterThan(2)

    const clash = heads.filter((h) => tiles.includes(h))
    expect(clash, `the header picture is also a tile's: ${clash.join(', ')}`).toEqual([])
    expect(new Set(tiles).size, `two lines share one picture: ${tiles.join(' ')}`).toBe(tiles.length)
  })
})


// ── folded from toddler-one-screen.spec.ts ──────────────────────────────────────────────
test6.describe('toddler-one-screen', () => {
  // Review #25 (2026-11-17), Sam: the toddler board stacked greeting, heroes, notes, mots,
  // doors, timeline, meals, leftovers, events, tasks, departure, défi, habits, tomorrow and
  // photos — many screens for a three-year-old who does not scroll on purpose. Now the
  // first screen is tonight, now / next, the routine and the doors; the rest waits behind
  // « Tout voir ». A parent's text note is not for a pre-reader.

  test6('on a wall tablet, the toddler board’s first screen fits, and the rest folds', async ({ app, page }) => {
    await app.boot({
      route: '/board',
      wait: '.today-kid',
      clock: 'BASE',
      viewport: { width: 768, height: 1024 },
      state: { audience: 'toddler', surface: 'kiosk' },
    })
    const fold = page.locator('.today-kid__more')
    await expect(fold).toBeVisible()
    // Everything above the fold is on the first screen.
    expect((await boxOf(fold)).y).toBeLessThan(1024)
    await expect(page.locator('.today-kid__doors')).toBeVisible()
    // No parent text papers on the first screen, folded or not.
    await expect(page.locator('.today-kid .note-card__text')).toHaveCount(0)
    // The rest is one tap away (for a parent).
    await fold.locator('summary, button').first().click()
    await expect(page.locator('.today-kid__more .today-kid__section').first()).toBeVisible()
  })
})


// ── folded from lens-gates.spec.ts ──────────────────────────────────────────────
test7.describe('lens-gates', () => {
  // THE LENS TABLE (lib/audience.ts `useLens()`, decided by Marc 2026-11-05):
  //
  //                 teaches   acts   interrupts
  //   parent          ✓        ✓        ✓
  //   simple          ✓        ✓        ✗      ← the calm lens: reads, acts, is never prompted
  //   toddler         ✗        ✗        ✗
  //
  // Before useLens() the `simple` column was per-file luck — three sites showed it the
  // help layer, six hid the edit doors from it. This spec holds the table so the next
  // inline `audience === …` (which the lint rule babillard/lens-flag already refuses) cannot bring that
  // back. One observable door per column:
  //   teaches    → the kitchen's SectionIntro card (seeded fresh with `intros: true`)
  //   acts       → the hub head's loupe (`data-tour="search"`; HubHead gates it on `acts`)
  //   interrupts → the first-run tour auto-offer on the board (`tour: true` = not seen)
  // /kitchen rather than /board for the first two: the simple board is SimpleBoard, which
  // has no hub head by design (four giant tiles), while the kitchen keeps the parent shell.

  const ROWS: { audience: Audience; teaches: boolean; acts: boolean; interrupts: boolean }[] = [
    { audience: 'parent', teaches: true, acts: true, interrupts: true },
    { audience: 'simple', teaches: true, acts: true, interrupts: false },
    { audience: 'toddler', teaches: false, acts: false, interrupts: false },
  ]

  for (const row of ROWS) {
    test7(`${row.audience}: teaches=${row.teaches} acts=${row.acts} interrupts=${row.interrupts}`, async ({ page, app }) => {
      await app.boot({ clock: 'BASE', state: { audience: row.audience, tour: true, intros: true } })

      await page.goto('/kitchen')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      // A tour that auto-offers here (parent) sits over the page; it changes nothing below.
      await expect(page.locator('[data-tour="search"]'), 'acts — the hub-head loupe').toHaveCount(row.acts ? 1 : 0)
      await expect(page.locator('.section-intro'), 'teaches — the section intro card').toHaveCount(row.teaches ? 1 : 0)

      await page.goto('/board')
      await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
      if (row.interrupts) {
        await expect(page.locator('.tour'), 'interrupts — the first-run tour offers itself').toBeVisible({ timeout: 15_000 })
      } else {
        // Proving the tour did NOT come: nothing marks an absence, so give the offer every
        // chance it would have had (it waits for the shell + session).
        await page.waitForTimeout(1500)
        await expect(page.locator('.tour'), 'interrupts — nothing may arrive uninvited').toHaveCount(0)
        await expect(page).toHaveURL(/\/board(\?|$)/)
      }
    })
  }
})
