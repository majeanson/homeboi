import { type Page, type Request, test as test3, test as test6, test as test7 } from '@playwright/test'
import { test, expect, type App } from './fixtures'
import { boxOf, settled } from './measure'
import { mockApi, seedState, type Theme, BASE } from './mocks'

// JOURNEY — THE CERCLE (review #43; was cercle-crud.spec.ts + cercle-drag-group.spec.ts + cercle-visual.spec.ts + contact-photos.spec.ts + family-import.spec.ts + intake.spec.ts + postbox.spec.ts).
//
// Behavioural coverage for the « Le cercle » create flows, now hosted on Maison
// (the nav restructure merged Le cercle + Routines into one /maison tab). The ＋
// FAB chooser deep-links to /maison?add=<mode> — the page reads the param and opens
// the matching modal (group / business / carnet), page-level so it works from any
// Maison subtab.
// Each test fills the form and asserts the CORRECT write fires (method + path), the
// same discipline interactions-*.spec.ts use (every mock write returns { ok:true }, so
// we assert the request, not a refetched outcome). Closes the §424 gap: group /
// business / carnet CRUD had zero behavioural coverage (screenshots only).

test.describe('cercle-crud', () => {
  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  // Arm the request waiter BEFORE the action so a fast POST can't slip through.
  async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
    await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
  }

  test.beforeEach(async ({ app }) => {
    await app.boot()
  })

  test('creating a named group posts to cercle-groups', async ({ page }) => {
    await page.goto('/maison?add=group')
    const dialog = page.locator('.kit-modal')
    await expect(dialog).toBeVisible()
    await dialog.getByPlaceholder('Nom du groupe').fill('Voisins')
    // The submit carries the create label (t.cercle.addGroup); Annuler sits beside it.
    await expectApi(page, 'POST', 'cercle-groups', () =>
      dialog.getByRole('button', { name: 'Nouveau groupe' }).click(),
    )
  })

  test('creating a business posts to businesses', async ({ page }) => {
    await page.goto('/maison?add=business')
    const dialog = page.locator('.kit-modal')
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Nom', { exact: true }).fill('Garage Roy')
    await expectApi(page, 'POST', 'businesses', () =>
      dialog.getByRole('button', { name: 'Ajouter un commerce' }).click(),
    )
  })

  test('creating a carnet posts to carnets', async ({ page }) => {
    await page.goto('/maison?add=carnet')
    const dialog = page.locator('.kit-modal')
    await expect(dialog).toBeVisible()
    // defaultKind="home" → just a name is required to submit.
    await dialog.getByLabel('Nom', { exact: true }).fill('Notre maison')
    await expectApi(page, 'POST', 'carnets', () =>
      dialog.getByRole('button', { name: 'Ajouter un carnet' }).click(),
    )
  })

  // F23 Animaux (PARITY Wave E, entry 10) — /cercle/pet/new was layout-smoke-rendered
  // only; unlike group/business/carnet above it had no create-and-POST spec. A pet needs
  // just a name to submit (species/owner are optional).
  test('creating a pet posts to pets', async ({ page }) => {
    await page.goto('/cercle/pet/new')
    await page.getByLabel('Nom', { exact: true }).fill('Rex')
    await expectApi(page, 'POST', 'pets', () =>
      page.getByRole('button', { name: 'Ajouter un animal' }).click(),
    )
  })

  // The weight log is one reading PER DATE. Re-entering a date you already logged
  // REPLACES it — two rows for one day is never what someone means (they re-weighed, or
  // mistyped the first number), and it quietly corrupts the trend the log exists to show.
  // It is also the only edit door: a weight row is a date and a number, so re-entering it
  // IS the edit; the row itself carries only a ✕. (REVIEW-PASS « frm ».)
  test('a second weight on the same date corrects the first instead of duplicating it', async ({ page }) => {
    await page.goto('/cercle/pet/new')
    await page.getByLabel('Nom', { exact: true }).fill('Rex')

    // The weight log lives inside the « Détails / santé » disclosure.
    await page.getByRole('button', { name: 'Détails / santé' }).click()
    const weights = page.locator('.pet-form__weight-add')
    const date = weights.getByLabel('Date')
    const kg = weights.getByLabel('Poids (kg)')
    const add = weights.getByRole('button', { name: 'Ajouter' })
    const rows = page.locator('.pet-form__weight')

    await date.fill('2026-08-01')
    await kg.fill('12')
    await add.click()
    await expect(rows).toHaveCount(1)

    // Same day, corrected number.
    await date.fill('2026-08-01')
    await kg.fill('12.4')
    await add.click()
    await expect(rows, 'one reading per date').toHaveCount(1)
    await expect(rows.first()).toContainText('12.4')

    // A DIFFERENT day is a new reading, and the log stays sorted by date.
    await date.fill('2026-07-01')
    await kg.fill('11')
    await add.click()
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('2026-07-01')
  })
})

// ── folded from cercle-drag-group.spec.ts ──────────────────────────────────────────────
test.describe('cercle-drag-group', () => {
  // Dragging a person onto a named group in Maison ▸ Social/Famille — the last
  // uncovered write in the cercle, and one whose failure modes are all silent:
  //
  //   · it writes the membership the drop implies (and only that one)
  //   · « Annuler » writes the EXACT inverse. An undo that DELETEs a different body
  //     leaves the person in the group while the toast says otherwise — the worst
  //     shape of bug, because the screen agrees with you until the next poll.
  //   · a person already in that group is not a drop target at all — and this one is
  //     asserted on the CUE, not on the write. `canDrop` greys the zone out; the write
  //     is ALSO refused by onDrop's own membership check, so a "nothing was posted"
  //     assertion passes whether canDrop works or not. It did, with canDrop deleted —
  //     the decoration this file's house rule exists to catch. What canDrop alone owns
  //     is the highlight (lib/dnd: "also greys the zone out so it never shows a drop cue
  //     it won't honour"), so that is what is measured, with the allowed drag as the
  //     control so the assertion can't pass by the class never appearing at all.
  //
  // The drag is driven with the mouse on purpose. `usePointerDnd` here runs in classic
  // mode (engage past a 6px threshold, no press-and-hold), and a desktop mouse is also
  // the reachability half of the standing rule: a gesture no mouse can perform is a
  // feature only a thumb has. Measurements go through `boxOf` (e2e/measure.ts), never a
  // bare `boundingBox()!`.

  interface Write {
    method: string
    path: string
    body: Record<string, unknown>
  }

  // The one difference: this spec owns the group writes, so it can read them back. Registered
  // AFTER mockApi so it matches first; the route has to exist before the page asks.
  async function openSection(app: App, section = 'social'): Promise<Write[]> {
    const { page } = app
    const writes: Write[] = []
    // Wide enough that a person row and the group below it are on screen together —
    // the drag needs both without an intervening scroll.
    await app.boot({ viewport: { width: 900, height: 1400 } })
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
      const method = route.request().method()
      if (method !== 'GET' && path === 'cercle-groups') {
        writes.push({ method, path, body: JSON.parse(route.request().postData() || '{}') })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
      }
      return route.fallback()
    })
    await page.goto(`/maison?section=${section}`)
    await page.locator('.cercle-row').first().waitFor({ state: 'visible', timeout: 15_000 })
    return writes
  }

  // The row is found by what it SHOWS, which for Luc Bélanger is his nickname « Voisin »
  // — and a loose 'Luc' also matches Pierre-Luc Caron, who is already in the hockey
  // group, so the drag silently became the refusal case and posted nothing.
  async function dragToGroup(
    page: Page,
    personName: string,
    groupId: string,
    whileOver?: () => Promise<void>,
  ) {
    const grip = page.locator('.cercle-row', { hasText: personName }).first().locator('.dnd-grip').first()
    const zone = page.locator(`[data-dnd-zone="group:${groupId}"]`)
    await expect(zone).toBeVisible()
    const from = await boxOf(grip)
    const to = await boxOf(zone)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    // Clear the engage threshold first, then land inside the group's own box.
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + Math.min(40, to.height / 2), { steps: 8 })
    await whileOver?.()
    await page.mouse.up()
  }

  test('dropping a person on a group adds them to it', async ({ page, app }) => {
    const writes = await openSection(app)
    await dragToGroup(page, 'Voisin', 'g2')

    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
    expect(writes[0]).toMatchObject({
      method: 'POST',
      body: { groupId: 'g2', personId: 'c6', personKind: 'contact' },
    })
  })

  test('…and « Annuler » writes the exact inverse', async ({ page, app }) => {
    const writes = await openSection(app)
    await dragToGroup(page, 'Voisin', 'g2')
    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)

    await expect(page.locator('.undo-toast')).toBeVisible()
    await expect(page.locator('.undo-toast')).toContainText('Le hockey')
    await page.locator('.undo-toast__btn').first().click()

    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(2)
    // Same three fields, opposite verb — anything else and the person quietly stays in.
    expect(writes[1]).toEqual({ ...writes[0], method: 'DELETE' })
  })

  test('a group a person is ALREADY in never lights up as a target', async ({ page, app }) => {
    const writes = await openSection(app)
    const zone = page.locator('[data-dnd-zone="group:g2"]')

    // The control first: an allowed drag DOES light the zone. Without this, the
    // assertion below would also pass if the cue simply never appeared for anyone.
    await dragToGroup(page, 'Voisin', 'g2', async () => {
      await expect(zone, 'the control: an allowed drop is cued').toHaveClass(/dnd-over/)
    })
    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)

    // Karim is one of « Le hockey »'s own members in the fixture: no cue, no write.
    await page.reload()
    await page.locator('.cercle-row').first().waitFor({ state: 'visible', timeout: 15_000 })
    await dragToGroup(page, 'Karim', 'g2', async () => {
      await expect(zone, 'a group he is already in offers no drop cue').not.toHaveClass(/dnd-over/)
    })
    // Proving the drop posted nothing: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(500)
    expect(writes.length, 'and the drop itself posts nothing').toBe(1)
  })
})


// ── folded from cercle-visual.spec.ts ──────────────────────────────────────────────
test3.describe('cercle-visual', () => {
  // Visual sweep for « Le cercle » — now Maison's Famille/Social sections (the nav
  // restructure merged the old standalone Le cercle tab into /maison) — NOT covered
  // by screenshots.spec.ts (which only visits /maison and /notes bare). Shoots the
  // populated people graph so the new family COLOURS + the generational grouping are
  // actually visible: the Liste directory, the Liens (ego) graph, and the Arbre
  // (tree). Famille (Maisonnée + Famille Tremblay) and Social (Amis / Collègues /
  // Autres), day + night, phone + wall. Writes PNGs to e2e/screenshots/cercle-*.png
  // for human/agent review.

  const THEMES: Theme[] = ['day', 'night']
  const FORMATS = [
    { name: 'phone', width: 390, height: 844, surface: 'mobile' as const },
    { name: 'wall', width: 1280, height: 800, surface: 'kiosk' as const },
  ]

  // section × view states worth a frame. Tree/links carry the new colour+grouping work.
  const STATES = [
    { name: 'family-list', q: 'section=family&view=list', ready: '.cercle-group' },
    { name: 'family-tree', q: 'section=family&view=tree', ready: '.cercle-tree__svg' },
    { name: 'family-links', q: 'section=family&view=links', ready: '.cercle-ego__svg' },
    { name: 'social-list', q: 'section=social&view=list', ready: '.cercle-group' },
    // Social shows the whole web at once. Liens = your circles as named islands
    // (CercleWeb); Arbre = each friend's family as its own framed tree, side by side,
    // joined by dashed friendships (CercleTree social). Both live in a PanZoom.
    { name: 'social-links', q: 'section=social&view=links', ready: '.cercle-web .cercle-tree__svg' },
    { name: 'social-tree', q: 'section=social&view=tree', ready: '.tree-frame__box' },
  ]

  async function settle(page: Page, ready: string) {
    await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
    await page.evaluate(() => document.fonts?.ready).catch(() => {})
    await settled(page)
  }

  // NOTE: Maison's Famille/Social sections (ex-« Le cercle ») are deliberately EXEMPT
  // from the app-wide no-horizontal-overflow rule — its pan/zoom trees + graphics
  // (Liens/Arbre/Web) and wide member/group rows are allowed to scroll sideways here
  // (a product decision). So these specs only capture screenshots for review; the
  // overflow guard stays enforced on every OTHER surface (screenshots.spec.ts
  // OVERFLOW_CASES, journey-fit.spec.ts).

  for (const state of STATES) {
    for (const theme of THEMES) {
      for (const format of FORMATS) {
        const label = `cercle-${state.name}-${theme}-${format.name}`
        test3(label, async ({ page }) => {
          await page.setViewportSize({ width: format.width, height: format.height })
          await mockApi(page)
          await seedState(page, { theme, audience: 'parent', lang: 'fr', calm: true, surface: format.surface })
          await page.goto(`/maison?${state.q}`)
          await settle(page, state.ready)
          await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
        })
      }
    }
  }

  // « Joindre » (A-6) — the quick-dial rail: present on mobile (the seeded mock has
  // several members/contacts with a phone — well above the ≥2 eligible floor), with
  // real tel: hrefs on its tiles; absent on the kiosk wall (a shared surface never
  // dials out on its own).
  test3('joindre rail — present on mobile with tel: hrefs', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/maison?section=family')
    await settle(page, '.joindre')
    const items = page.locator('.joindre a.joindre__item')
    await expect(items.first()).toBeVisible()
    expect(await items.count()).toBeGreaterThanOrEqual(2)
    const hrefs = await items.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
    expect(hrefs.every((h) => h?.startsWith('tel:') || h?.startsWith('mailto:'))).toBe(true)
    expect(hrefs.some((h) => h?.startsWith('tel:'))).toBe(true)
  })

  test3('joindre rail — absent on the kiosk wall', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.goto('/maison?section=family')
    await settle(page, '.cercle-group')
    await expect(page.locator('.joindre')).toHaveCount(0)
  })

  // Regression guard: the rail is a Rail (its own inner strip scrolls sideways on
  // overflow, per CLAUDE.md Horizontal overflow) but its OUTER wrapper must still sit
  // fully inside the viewport at the tightest phone widths — it must never be the
  // thing that forces the whole page to pan. Checked at both 360 and 390 (Maison's
  // Famille/Social sections themselves stay exempt from the app-wide guard for their
  // pan/zoom trees; the rail is not one of those, so it gets its own hard assertion
  // here).
  for (const width of [360, 390]) {
    test3(`joindre rail never bleeds off the right edge @phone-${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto('/maison?section=family')
      await settle(page, '.joindre')
      await expect(page.locator('.joindre')).toBeVisible()
      const bleed = await page.evaluate(() => {
        const rail = document.querySelector('.joindre') as HTMLElement
        return rail.getBoundingClientRect().right - document.documentElement.clientWidth
      })
      expect(bleed, 'joindre rail bleeds off the right edge').toBeLessThanOrEqual(1)
    })
  }

  // ── Social ▸ Liens: the circles are legible ──────────────────────────────────
  // The regression this guards: Liens used to group people by connected component, and
  // because a « friends »-kind group makes its members a clique, the whole social web
  // collapsed into ONE ring — whose radius was capped by a constant, so eighteen faces
  // were dealt onto a circle with room for nine and the avatars sat on top of each other.
  // Now each named group / detected family is its own island, sized from its count.
  //
  // Measured on the DISCS (`.avatar`), because that is what visibly overlapped. Two faces
  // may have neighbouring label boxes; two faces must never have touching discs.
  for (const width of [390, 1280]) {
    test3(`social links — no two faces overlap @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: width < 700 ? 'mobile' : 'kiosk' })
      await page.goto('/maison?section=social&view=links')
      await settle(page, '.cercle-web .cercle-tree__svg')

      const worst = await page.evaluate(() => {
        const discs = [...document.querySelectorAll('.cercle-web .ego-node .avatar')] as HTMLElement[]
        const circles = discs.map((d) => {
          const r = d.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: r.width }
        })
        let ratio = Infinity // (centre distance) / (disc diameter); < 1 means overlap
        for (let i = 0; i < circles.length; i++)
          for (let j = i + 1; j < circles.length; j++) {
            const a = circles[i]!
            const b = circles[j]!
            ratio = Math.min(ratio, Math.hypot(a.x - b.x, a.y - b.y) / Math.max(a.d, b.d))
          }
        return { count: circles.length, ratio }
      })
      expect(worst.count, 'no faces drawn in Social Liens').toBeGreaterThan(6)
      expect(worst.ratio, 'two faces overlap in Social Liens').toBeGreaterThanOrEqual(0.99)
    })
  }

  test3('social links — each circle is its own named island, not one blob', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.goto('/maison?section=social&view=links')
    await settle(page, '.cercle-web .cercle-tree__svg')

    // Famille Gagnon + Famille Roy (auto-detected) + Le hockey + Collègues + Autres.
    expect(await page.locator('.cercle-web .world-island').count()).toBeGreaterThanOrEqual(4)
    const labels = await page.locator('.cercle-web .world-island__label').allTextContents()
    expect(labels).toContain('Le hockey')
    expect(labels.some((l) => l.includes('Gagnon'))).toBe(true)
    expect(labels.some((l) => l.includes('Roy'))).toBe(true)
    // A person who ties two circles draws a bridge between them.
    expect(await page.locator('.cercle-web .world-bridge').count()).toBeGreaterThan(0)
  })

  // ── Social ▸ Arbre: each friend's family, joined by their friendships ────────
  test3('social tree — families are framed, and friendships connect them', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'kiosk' })
    await page.goto('/maison?section=social&view=tree')
    await settle(page, '.tree-frame__box')

    // Sophie's family and Thomas's family each get their own named frame…
    const frames = await page.locator('.tree-frame__label').allTextContents()
    expect(frames.some((f) => f.includes('Gagnon'))).toBe(true)
    expect(frames.some((f) => f.includes('Roy'))).toBe(true)
    // …the friendships between them are drawn (dashed), and blood ties still are too.
    expect(await page.locator('.tree-edge--social').count()).toBeGreaterThan(0)
    expect(await page.locator('.tree-edge:not(.tree-edge--social)').count()).toBeGreaterThan(0)

    // Sophie ↔ Thomas are friends and both parents, so the alignment puts them level:
    // the friendship reads as a horizontal line rather than a diagonal across the forest.
    const y = async (name: string) => {
      const box = await boxOf(page.locator(`.cercle-tree .ego-node[aria-label*="${name}"] .avatar`).first())
      return box.y + box.height / 2
    }
    expect(Math.abs((await y('Sophie')) - (await y('Thomas')))).toBeLessThan(2)
    expect(await y('Zoé')).toBeGreaterThan(await y('Sophie')) // children below their parents
    // A friend with no family of their own is still drawn (a tree of one), not dropped.
    // (Luc Bélanger's display name is his nickname — fullName() prefers it.)
    await expect(page.locator('.cercle-tree .ego-node[aria-label="Voisin"]')).toHaveCount(1)
  })

  // Toddler « Qui est-ce ? » faces grid — its own audience/layout, day + night phone.
  for (const theme of THEMES) {
    const label = `cercle-toddler-${theme}-phone`
    test3(label, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await mockApi(page)
      await seedState(page, { theme, audience: 'toddler', lang: 'fr', calm: true, surface: 'mobile' })
      // A bare toddler /maison renders ToddlerView (Routines' picture-story run, the
      // default section) — ?section=family is what shows the circle faces grid.
      await page.goto('/maison?section=family')
      await settle(page, '.cercle-kid__grid')
      await page.screenshot({ path: `e2e/screenshots/${label}.png`, fullPage: true })
    })
  }

  // The row spends its width on the RELATION, not on furniture. « Conjointe de P… » was
  // being cut at 390px (and « Conjointe … » at 360) because the row's ☎/✉ shortcuts took
  // the line, while the sibling beside it — same layout, no icons — read « Conjoint de
  // Maman » in full. `.cercle-row__sub` is nowrap-with-ellipsis on purpose (a long NAME
  // used to widen the whole card on a landscape tablet), so the relation is what loses.
  // The icons moved into the peek on 2026-09-13 — the compact-rows precedent.
  //
  // The second half is the half that matters: MOVING a door only counts if it lands.
  // `buildMemberPerson` had never offered « Appeler »/« Écrire » (only `buildContact`
  // did), so stripping the row without that would have deleted a member's only one-tap
  // reach rather than relocating it.
  test3('a person row keeps its relation whole — the reach moved into the peek', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    await page.goto('/maison?section=family')
    await settle(page, '.cercle-group')

    // No row furniture competing for the line…
    await expect(page.locator('.cercle-row .cercle-row__quick')).toHaveCount(0)
    // …so the relation prints in full rather than ellipsing.
    const maman = page
      .locator('.cercle-row')
      .filter({ has: page.locator('.cercle-row__name', { hasText: /^Maman$/ }) })
      .first()
    await expect(maman.locator('.cercle-row__sub')).toHaveText('Conjointe de Papa')

    // What this does NOT assert, deliberately: that no relation anywhere ellipses. The
    // first draft did, and it was a guard claiming more than the app promises — it passed
    // only because this section's relations are short. One frame further into the same
    // sweep, Social shows « Conjointe d'Étienne Gagn… » on a row with no furniture on it
    // at all: the words are simply longer than the line. That is the ACCEPTED state —
    // `.cercle-row__sub` stays nowrap-with-ellipsis (Marc, 2026-09-13, choosing to move
    // the icons rather than to let the line wrap), so a test forbidding every ellipsis
    // would be re-litigating a decision and would go red on a household with long names.
    // The invariant that was actually won is the one above: nothing but the relation is
    // spending that line. Measured at 390 and 360 (`maison-family-narrow`).
    //
    // The rule of thumb this cost: a guard written the day a bug is fixed tends to assert
    // the SYMPTOM it just watched disappear. Assert the decision instead.

    // …and the peek carries the two doors the row gave up (a MEMBER's peek, which is
    // the one that never had them).
    await maman.locator('.cercle-row__open').click()
    const sheet = page.locator('.detail-sheet, .sheet.show').first()
    await expect(sheet).toBeVisible()
    await expect(sheet.getByRole('button', { name: /Appeler/ })).toBeVisible()
  })
})


// ── folded from contact-photos.spec.ts ──────────────────────────────────────────────
test.describe('contact-photos', () => {
  // A contact's photo gallery (`ContactPhotos`, inside the person scene) — the last
  // entry on the coverage backlog, and until now only ever smoke-rendered.
  //
  // The three things worth holding, none of them visible in a screenshot:
  //   · a caption saves on blur, by id, trimmed
  //   · an UNCHANGED caption writes nothing. Blurring a field is not an edit, and this
  //     surface blurs constantly (tab away, tap another photo, close the scene) — a
  //     write per blur would be a write per glance.
  //   · the delete asks first, and « Annuler » really cancels. Deleting frees the R2
  //     blob server-side, so there is no undo to fall back on: the confirm IS the
  //     guarantee, which makes "cancel writes nothing" the load-bearing half.

  interface Write {
    method: string
    body: Record<string, unknown>
  }

  const PHOTOS = {
    photos: [
      { id: 'ph1', photoKey: 'cer_a1', caption: 'Au chalet' },
      { id: 'ph2', photoKey: 'cer_b2', caption: null },
    ],
  }

  async function openPerson(app: App): Promise<Write[]> {
    const { page } = app
    const writes: Write[] = []
    await app.boot({ viewport: { width: 390, height: 844 } })
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
      if (path !== 'cercle-photos') return route.fallback()
      const method = route.request().method()
      if (method === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PHOTOS) })
      }
      writes.push({ method, body: JSON.parse(route.request().postData() || '{}') })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    // Sophie Gagnon (c4) in the shared cercle fixture. The gallery lives inside the
    // « Cadeaux, étiquettes et groupes » disclosure — closed unless the person already
    // has gift ideas or tags, so open it explicitly rather than depending on fixture data.
    await page.goto('/cercle/person/c4')
    const more = page.locator('.cf__more')
    await more.waitFor({ state: 'visible', timeout: 15_000 })
    if ((await page.locator('.cf-photos').count()) === 0) await more.locator('summary, button').first().click()
    await page.locator('.cf-photos__item').first().waitFor({ state: 'visible', timeout: 15_000 })
    return writes
  }

  const captionAt = (page: Page, n: number) => page.locator('.cf-photos__item .cf-photos__caption').nth(n)

  test('a caption saves on blur, by id and trimmed', async ({ page, app }) => {
    const writes = await openPerson(app)
    const field = captionAt(page, 0)
    await field.fill('  Au lac  ')
    await field.blur()

    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
    expect(writes[0]).toEqual({ method: 'PATCH', body: { id: 'ph1', caption: 'Au lac' } })
  })

  test('…and an unchanged caption writes nothing at all', async ({ page, app }) => {
    const writes = await openPerson(app)
    const field = captionAt(page, 0)
    // Focus, leave it exactly as it was, blur — the everyday case on this surface.
    await field.click()
    await field.blur()
    // A caption that was never set is the other half of "unchanged" (null vs '').
    const empty = captionAt(page, 1)
    await empty.click()
    await empty.blur()

    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(700)
    expect(writes, 'blurring a field the user did not change is not an edit').toEqual([])
  })

  test('deleting asks first — and « Annuler » really cancels', async ({ page, app }) => {
    const writes = await openPerson(app)
    await page.locator('.cf-photos__del').first().click()

    const dialog = page.locator('.confirm')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Annuler' }).click()
    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(500)
    expect(writes, 'the blob is freed server-side, so a mis-tap must cost nothing').toEqual([])

    // Confirming does delete it, by id.
    await page.locator('.cf-photos__del').first().click()
    await dialog.getByRole('button', { name: 'Supprimer' }).click()
    await expect.poll(() => writes.length, { timeout: 5000 }).toBe(1)
    expect(writes[0]).toEqual({ method: 'DELETE', body: { id: 'ph1' } })
  })
})


// ── folded from family-import.spec.ts ──────────────────────────────────────────────
test.describe('family-import', () => {
  // « Ajouter une famille » — /cercle/import?s=<id>, the RECIPIENT side of « Partager une
  // famille ». It had no e2e at all, and it is the worst place in the app for that: the
  // URL lives in links people have already TEXTED to relatives, the page is reached once
  // and never again, and behind one « Ajouter » tap sits the longest unguarded write chain
  // in the codebase — create-or-merge each person, copy each photo, create each
  // relationship, create each pet and link it to its owner, then build the family group.
  // A body assembled wrong here doesn't error: it quietly duplicates a family the person
  // already has, or drops the relationships that were the whole point of sharing.
  //
  // So these tests read the WRITES, not the screen. What they pin:
  //   · the full chain fires, in order, with the right bodies (people → links → pets → group)
  //   · a person we already know is MERGED (PATCH by id), never added a second time
  //   · …and that decision is reversible — the chip flips back to a new fiche
  //   · unticking a row really excludes it, and a link to an excluded person is dropped
  //   · an expired share says so instead of rendering a broken page
  //   · a read-only guest never reaches it
  //
  // The dedupe cases lean on the shared cercle fixture on purpose (Sophie Gagnon = c4),
  // because matchIntakePerson runs against OUR circle — a fixture-local stand-in would
  // prove the test's own data, not the matcher.

  const PHONE = { width: 390, height: 844 }

  interface Write {
    method: string
    path: string
    body: Record<string, unknown>
  }

  const person = (firstName: string, lastName = '', extra: Record<string, unknown> = {}) => ({
    firstName,
    lastName,
    nickname: '',
    birthday: null,
    gender: null,
    email: '',
    phone: '',
    address: null,
    notes: '',
    photoKey: null,
    ...extra,
  })

  // Camille shares her household: herself, her son, the parent link between them, and the
  // cat. Nobody here is in the fixture cercle, so every person is a fresh fiche.
  const SHARE = {
    label: 'Famille Fortier',
    sourceName: 'Camille',
    payload: {
      self: person('Camille', 'Fortier'),
      household: [person('Théo', 'Fortier')],
      links: [{ aIndex: 0, bIndex: 1, type: 'parent' }],
      pets: [{ name: 'Grisou', species: 'chat', photoKey: null, ownerIndex: 0 }],
    },
  }

  // The same shape with someone we ALREADY have: « Sophie Gagnon » is c4 in the fixture,
  // matched on full name by matchIntakePerson.
  const SHARE_DUP = {
    label: 'Famille Gagnon',
    sourceName: 'Sophie',
    payload: {
      self: person('Sophie', 'Gagnon'),
      household: [person('Théo', 'Fortier')],
      links: [],
      pets: [],
    },
  }

  async function serveShare(app: App, opts: { share?: unknown; status?: number } = {}): Promise<Write[]> {
    const { page } = app
    const writes: Write[] = []
    await app.boot({ viewport: PHONE })
    // Registered AFTER mockApi so it matches first (Playwright walks handlers newest → oldest).
    // Reads fall through to the shared fixture — this only owns the share itself and the
    // writes the merge makes, each answered with the id the next step needs.
    let n = 0
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api\//, '')
      const method = route.request().method()
      if (path === 'family-share') {
        if (opts.status && opts.status !== 200) {
          return route.fulfill({
            status: opts.status,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Introuvable' }),
          })
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(opts.share ?? SHARE),
        })
      }
      if (method !== 'GET' && ['cercle', 'cercle-links', 'cercle-groups', 'pets'].includes(path)) {
        writes.push({ method, path, body: JSON.parse(route.request().postData() || '{}') })
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, id: `${path}-${++n}` }),
        })
      }
      return route.fallback()
    })
    return writes
  }

  const review = (page: Page) => page.getByRole('button', { name: 'Réviser et ajouter' })

  test('the whole merge chain fires: people, then their link, then the pet, then the family group', async ({ page, app }) => {
    const writes = await serveShare(app)
    await page.goto('/cercle/import?s=share-1')
    await expect(page.getByText('Partagé par Camille')).toBeVisible()
    await review(page).click()

    // Two people + one pet are proposed, all preselected.
    await page.getByRole('button', { name: 'Ajouter (3)' }).click()
    await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

    const people = writes.filter((w) => w.path === 'cercle')
    expect(people.map((w) => `${w.method} ${w.body.firstName}`)).toEqual(['POST Camille', 'POST Théo'])

    // The relationship rides the ids the two POSTs just returned — the step most likely to
    // be assembled wrong, and the one whose failure is invisible (the people land, unrelated).
    const links = writes.filter((w) => w.path === 'cercle-links')
    expect(links[0]?.body).toMatchObject({
      aId: 'cercle-1',
      aKind: 'contact',
      bId: 'cercle-2',
      bKind: 'contact',
      type: 'parent',
    })

    const pets = writes.filter((w) => w.path === 'pets')
    expect(pets).toHaveLength(1)
    expect(pets[0]?.body).toMatchObject({ name: 'Grisou', species: 'chat' })
    // …and the cat is linked to ITS owner (self, index 0), not to whoever came first.
    expect(links[1]?.body).toMatchObject({ aId: 'cercle-1', bId: 'pets-4', bKind: 'pet', type: 'owner' })

    // The shared family's NAME becomes a group, and both people join it.
    const groups = writes.filter((w) => w.path === 'cercle-groups')
    expect(groups[0]?.body).toMatchObject({ name: 'Famille Fortier', kind: 'family' })
    expect(groups.slice(1).map((w) => w.body.personId)).toEqual(['cercle-1', 'cercle-2'])
  })

  test('someone we already know is MERGED into their fiche, not added a second time', async ({ page, app }) => {
    const writes = await serveShare(app, { share: SHARE_DUP })
    await page.goto('/cercle/import?s=share-2')
    await review(page).click()

    // The row says who it will merge into, and it is preselected — a duplicated family is
    // the failure this whole decision exists to prevent.
    await expect(page.getByRole('button', { name: /Fusionner avec Sophie Gagnon/ })).toBeVisible()
    await page.getByRole('button', { name: 'Ajouter (2)' }).click()
    await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

    const people = writes.filter((w) => w.path === 'cercle')
    expect(people).toHaveLength(2)
    // Sophie: PATCH onto the contact we already have. Théo: a genuinely new fiche.
    expect(people[0]).toMatchObject({ method: 'PATCH', body: { id: 'c4', firstName: 'Sophie' } })
    expect(people[1]).toMatchObject({ method: 'POST', body: { firstName: 'Théo' } })
  })

  test('…and that call is reversible — the chip flips back to a new fiche', async ({ page, app }) => {
    const writes = await serveShare(app, { share: SHARE_DUP })
    await page.goto('/cercle/import?s=share-2')
    await review(page).click()

    await page.getByRole('button', { name: /Fusionner avec Sophie Gagnon/ }).click()
    await expect(page.getByRole('button', { name: 'Créer une nouvelle fiche' })).toBeVisible()
    await page.getByRole('button', { name: 'Ajouter (2)' }).click()
    await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

    const people = writes.filter((w) => w.path === 'cercle')
    expect(
      people.every((w) => w.method === 'POST'),
      'nothing is patched once the merge is refused',
    ).toBe(true)
  })

  test('unticking a person excludes them — and the link that needed them is dropped', async ({ page, app }) => {
    const writes = await serveShare(app)
    await page.goto('/cercle/import?s=share-1')
    await review(page).click()

    // Untick Théo (row 2 of person · person · pet).
    await page.locator('.review__row').nth(1).locator('input[type="checkbox"]').uncheck()
    await page.getByRole('button', { name: 'Ajouter la sélection (2)' }).click()
    await expect(page.getByText('Ajouté à ton cercle !')).toBeVisible()

    expect(writes.filter((w) => w.path === 'cercle')).toHaveLength(1)
    // The parent link has an endpoint that was never imported, so it must not be written.
    expect(writes.filter((w) => w.body.type === 'parent')).toEqual([])
    // The cat still comes, still owned by the one person who did.
    expect(writes.filter((w) => w.path === 'pets')).toHaveLength(1)
    // One person is not a family: no group is invented around them.
    expect(writes.filter((w) => w.path === 'cercle-groups')).toEqual([])
  })

  test('an expired share says so, instead of a broken page', async ({ page, app }) => {
    await serveShare(app, { status: 404 })
    await page.goto('/cercle/import?s=gone')
    await expect(page.getByText('Ce partage n’existe plus ou a expiré.')).toBeVisible()
    await expect(review(page)).toHaveCount(0)
  })

  test('a read-only guest never reaches the merge at all', async ({ page, app }) => {
    await serveShare(app)
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    await page.goto('/cercle/import?s=share-1')
    await page.waitForURL(/\/maison\?section=family/)
    await expect(review(page)).toHaveCount(0)
  })
})


// ── folded from intake.spec.ts ──────────────────────────────────────────────
test6.describe('intake', () => {
  // The « intake » (family-info) flow end-to-end (REVIEW-PASS §559), both sides:
  //   1. GUEST SUBMIT — a relative opens the /intake form and sends their card
  //      (POST guest/intake-submit → the thank-you screen).
  //   2. OPERATOR REVIEW → ACCEPT — the quarantined submission shows in Réglages ▸
  //      Partage (IntakeReview); reviewing + accepting it merges the person into Le
  //      cercle (POST cercle …) and marks the submission merged (PATCH intake).
  // The shared mock returns {ok:true} for writes, so we assert the request fired.

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
    await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
  }

  // One quarantined submission (self-only) for the operator side.
  const PENDING = {
    id: 'sub1',
    targetKey: null,
    createdAt: BASE,
    self: { firstName: 'Mamie', lastName: 'Rose', nickname: '', birthday: null, gender: 'f', email: '', phone: '', address: null, notes: '', photoKey: null },
    household: [],
    links: [],
    pets: [],
  }

  test6.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  })

  test6('a relative fills the intake form and submits it', async ({ page }) => {
    // guest/window returns {} (base mock) → the form defaults to all sections + renders.
    await page.goto('/intake')
    const name = page.getByLabel('Prénom')
    await expect(name).toBeVisible()
    await name.fill('Mamie')
    await expectApi(page, 'POST', 'guest/intake-submit', () =>
      page.getByRole('button', { name: 'Envoyer' }).click(),
    )
    // Success flips the form to the thank-you screen.
    await expect(page.getByText('Merci !')).toBeVisible()
  })

  test6('the operator reviews a pending intake and accepts it into the cercle', async ({ page }) => {
    await page.route('**/api/intake**', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ submissions: [PENDING] }) })
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    // Merge creates the person via POST cercle — hand back an id so the flow completes;
    // GET cercle falls through to the base fixture (used to suggest dedupe matches).
    await page.route('**/api/cercle**', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'c99' }) })
      }
      return route.fallback()
    })

    // IntakeReview lives under the guest-links card of Système ▸ « Appareils & accès ».
    await page.goto('/settings?tab=settings&sub=tablets&focus=guestLinks')
    // IntakeReview surfaces the quarantined submission by the sender's name.
    await expect(page.getByText(/Mamie/).first()).toBeVisible()
    // « Réviser » opens THE review scene for a family coming in (2026-09-29, « fiche
    // famille ») — the same one a shared family opens, fed by ?intake=<id>.
    await page.getByRole('link', { name: 'Réviser' }).click()
    await expect(page).toHaveURL(/\/cercle\/import\?intake=/)
    await page.getByRole('button', { name: 'Réviser et ajouter' }).click()

    // The review checklist opens (all items preselected); "Ajouter (1)" applies the
    // merge → POST cercle then PATCH intake (status: merged). Assert the completion.
    const dialog = page.locator('.kit-modal')
    await expect(dialog).toBeVisible()
    await expectApi(page, 'PATCH', 'intake', () =>
      dialog.getByRole('button', { name: 'Ajouter (1)' }).click(),
    )
  })

  // ONE BOX, TWO SLOTS (2026-09-29). The details form stopped being a link kind and a route
  // of its own: it is the second slot of « La boîte aux lettres » at /courrier. A link
  // already sent to /intake still lands on it; an open box offers both slots, each at the
  // END of the other (the first screen stays the form); a link aimed at one person opens
  // on their details and offers nothing else.
  test6('/intake lands on the details slot of the box, and an open box switches both ways', async ({ page }) => {
    await page.goto('/intake')
    await expect(page).toHaveURL(/\/courrier\?.*quoi=fiche/)
    await expect(page.getByLabel('Prénom')).toBeVisible()

    await page.getByRole('button', { name: 'Plutôt nous laisser un mot ?' }).click()
    await expect(page).not.toHaveURL(/quoi=fiche/)
    await expect(page.getByRole('button', { name: 'Plutôt remplir ta fiche ?' })).toBeVisible()

    await page.getByRole('button', { name: 'Plutôt remplir ta fiche ?' }).click()
    await expect(page).toHaveURL(/quoi=fiche/)
    await expect(page.getByLabel('Prénom')).toBeVisible()
  })

  test6('a box aimed at one person opens on THEIR details, with no way to a message', async ({ page }) => {
    await page.route('**/api/guest/window**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'postbox', householdName: 'Maison Tremblay', receipt: null, targetName: 'Rose', scope: null }),
      }),
    )
    await page.goto('/courrier')
    await expect(page.getByText(/Rose/).first()).toBeVisible()
    await expect(page.getByLabel('Prénom')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plutôt nous laisser un mot ?' })).toHaveCount(0)
  })
})


// ── folded from postbox.spec.ts ──────────────────────────────────────────────
test7.describe('postbox', () => {
  // « La boîte aux lettres » (/courrier) — a relative's postbox share link: say who you
  // are, leave a message (text and/or ONE memo: voice / drawing / photo), staged to R2
  // then sent in one submit. Locks the guest submit flow (text-only + photo-staged)
  // as the regression net for the useMemoAttach staging model (REVIEW-PASS theme 6).

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  )

  async function stubPostbox(page: import('@playwright/test').Page) {
    await page.route('**/api/guest/window**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'postbox', householdName: 'Maison Tremblay' }) }),
    )
    await page.route('**/api/guest/postbox-media**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'pm_e2e' }) }),
    )
    const submits: Record<string, unknown>[] = []
    await page.route('**/api/guest/postbox-submit**', (r) => {
      try {
        submits.push(JSON.parse(r.request().postData() || '{}'))
      } catch {
        /* no body */
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    return submits
  }

  test7.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 1100 })
  })

  test7('a text-only message sends with the sender name', async ({ page }) => {
    await mockApi(page)
    const submits = await stubPostbox(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/courrier')

    await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Papi')
    await page.getByPlaceholder('Écris un petit mot…').fill('Bonne fête !')
    await page.getByRole('button', { name: 'Envoyer' }).click()

    await expect(page.getByText('Merci !')).toBeVisible()
    expect(submits).toHaveLength(1)
    expect(submits[0]).toMatchObject({ senderName: 'Papi', text: 'Bonne fête !' })
  })

  test7('a photo is staged then sent with the message', async ({ page }) => {
    await mockApi(page)
    const submits = await stubPostbox(page)
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/courrier')

    await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Mamie')
    // The Record / Draw / Photo trio lives behind the message field's 📎 now
    // (useMemoAttach), so open it before the hidden file input exists.
    await page.locator('.memo-attach__btn').click()
    const staged = page.waitForResponse((r) => r.url().includes('/api/guest/postbox-media') && r.request().method() === 'POST')
    await page.locator('.scene.intake input[type="file"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG })
    await staged
    await expect(page.locator('.memo-attach__chip')).toBeVisible() // the staged memo preview

    await page.getByRole('button', { name: 'Envoyer' }).click()
    await expect(page.getByText('Merci !')).toBeVisible()
    expect(submits[0]).toMatchObject({ senderName: 'Mamie', media_kind: 'image', media_key: 'pm_e2e' })
  })

  // D-18 reçu-✓ (bmad/10) — a returning sender (a durable/standing link, e.g. « Mamie »)
  // sees a quiet confirmation line the NEXT time she opens the same link, once her prior
  // message was accepted. Rides the same greeting fetch — no new poll, no unread state.
  test7('a returning sender sees a quiet reçu-✓ line for their last accepted message', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/guest/window**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'postbox',
          householdName: 'Maison Tremblay',
          receipt: { lastAcceptedAt: 1_720_000_000, snippet: 'Bonne fête' },
        }),
      }),
    )
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/courrier')

    await expect(page.getByText('Reçu ✓', { exact: false })).toBeVisible()
    await expect(page.getByText('Bonne fête', { exact: false })).toBeVisible()
  })

  // The missing case (D-18): a revoked STANDING durable link must read as "this link
  // no longer works", not a stuck/broken form — the same GuestExpired every other guest
  // scene (HandoffPage/WelcomePage/FamilyWindowPage) already shows on a 401/403.
  test7('a revoked link shows the expired state, not the form', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/guest/window**', (r) =>
      r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Forbidden.' }) }),
    )
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/courrier')

    await expect(page.locator('.guest-expired')).toBeVisible()
    await expect(page.getByPlaceholder('Papi, Mamie, Tante Lou…')).toHaveCount(0)
  })

  // A double-send must not create a second quarantine row (bmad/11 tier-2 #2).
  //
  // The two ordinary things a relative does — double-tapping « Envoyer » on a slow
  // phone, and resending when the response is lost — each used to land a SECOND
  // pending row in the operator's review queue, indistinguishable from a genuine
  // second message. The server has deduped keyed writes for a long while
  // (functions/_lib/idempotency.ts, applied centrally in authed()); this form just
  // never sent a key, because a guest writes through raw api() rather than the
  // outbox's useWrite.
  //
  // What this guards is the CLIENT half: that a key is sent at all, and that it is
  // the SAME key across retries of one composed message — which is exactly what
  // makes the server's ledger able to recognise the retry.
  test7('a resend carries the SAME Idempotency-Key, so the server can dedup it', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/guest/window**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'postbox', householdName: 'Maison Tremblay' }) }),
    )
    const keys: string[] = []
    let failFirst = true
    await page.route('**/api/guest/postbox-submit**', (r) => {
      keys.push(r.request().headers()['idempotency-key'] ?? '')
      // The first attempt fails, so the relative taps « Envoyer » again — the case.
      if (failFirst) {
        failFirst = false
        return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await seedState(page, { theme: 'day', lang: 'fr' })
    await page.goto('/courrier')

    await page.getByPlaceholder('Papi, Mamie, Tante Lou…').fill('Papi')
    await page.getByPlaceholder('Écris un petit mot…').fill('Bonne fête !')
    const send = page.getByRole('button', { name: 'Envoyer' })
    await send.click()
    await expect.poll(() => keys.length).toBe(1)
    await send.click()
    await expect.poll(() => keys.length).toBe(2)

    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })
})
