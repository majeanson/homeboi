import { describe, it, expect, vi } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// LA CUISINE against a real D1: the rolling plan, the pool of restants, the pool of ideas
// and the history. What a slot IS (a list, in order) and what planning a leftover DOES
// (it is eaten once) are decided here on the server, so that is where they are held.

interface Meal {
  id: string
  date: number
  slot: string
  title: string
  cook_member_id: string | null
  suggested_by: string | null
  recipe_id: string | null
  position: number
  is_leftover: number
}
interface MealsRead {
  days: Meal[]
  weekStart: number
  windowDays: number
  recent: Meal[]
  unplaced: { id: string; title: string; recipe_id: string | null; slot: string | null; is_leftover: number; position: number; link_id: string | null }[]
}

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const plan = (s: Session) => okJson<MealsRead>(s.fetch('/api/meals'))
const add = (s: Session, body: Record<string, unknown>) =>
  okJson<{ id: string; addedToList?: number; suggested?: boolean }>(s.fetch('/api/meals', { method: 'POST', body: { date: day(1), title: 'Tacos', ...body } }))
const action = (s: Session, body: Record<string, unknown>) => okJson<{ ok: boolean; cleared?: number }>(s.fetch('/api/meals', { method: 'POST', body }))
const slotOf = async (s: Session, date: number, slot: string) =>
  (await okJson<MealsRead>(s.fetch(`/api/meals?date=${date}`))).days.filter((m) => m.slot === slot).map((m) => m.title)
const member = (s: Session, name: string) => okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))

describe('le plan des repas', () => {
  it('a meal is planned, read back, renamed, and removed', async () => {
    const s = await household('meals-crud', undefined, { empty: true })
    const noon = day(2) + 12 * 3600
    const { id } = await add(s, { title: '  Pâté chinois  ', date: noon, slot: 'supper' })

    const read = await plan(s)
    expect(read.weekStart, 'weekStart is today: five call sites read it so').toBe(today())
    expect(read.windowDays).toBe(10)
    expect(read.days).toHaveLength(1)
    expect(read.days[0], 'any instant of the day files under its local midnight').toMatchObject({ id, title: 'Pâté chinois', date: day(2), slot: 'supper', position: 0, is_leftover: 0 })

    await okJson(s.fetch('/api/meals', { method: 'PATCH', body: { id, title: 'Pâté au poulet', recipeId: 'recette-1' } }))
    const renamed = (await plan(s)).days[0]
    expect(renamed).toMatchObject({ title: 'Pâté au poulet', recipe_id: 'recette-1', position: 0 })
    expect((await s.fetch('/api/meals', { method: 'PATCH', body: { id, title: '   ' } })).status, 'a blank title is no edit').toBe(400)

    await okJson(s.fetch('/api/meals', { method: 'DELETE', body: { id } }))
    expect((await plan(s)).days).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM meals WHERE id = ?').bind(id).first()).toBeNull()
  })

  it('the window rolls from today: a day past it and yesterday are out, ?date= reaches either', async () => {
    const s = await household('meals-window', undefined, { empty: true })
    await add(s, { title: 'Hier', date: day(-1) })
    await add(s, { title: 'Dernier jour', date: day(9) })
    await add(s, { title: 'Trop loin', date: day(10) })
    expect((await plan(s)).days.map((m) => m.title)).toEqual(['Dernier jour'])
    expect((await okJson<MealsRead>(s.fetch(`/api/meals?date=${day(-1)}`))).days.map((m) => m.title), 'the day scene reaches a past date').toEqual(['Hier'])

    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { mealWindowDays: 14 } }))
    expect((await plan(s)).days.map((m) => m.title), '« Jours affichés » widens the plan').toEqual(['Dernier jour', 'Trop loin'])
  })

  it('a slot is a list: adds append, ↑/↓ swaps neighbours, an edge is a no-op', async () => {
    const s = await household('meals-move', undefined, { empty: true })
    const date = day(1)
    const a = await add(s, { title: 'A', date, slot: 'supper' })
    const b = await add(s, { title: 'B', date, slot: 'supper' })
    await add(s, { title: 'C', date, slot: 'supper' })
    await add(s, { title: 'Autre', date, slot: 'lunch' })
    expect(await slotOf(s, date, 'supper')).toEqual(['A', 'B', 'C'])

    await action(s, { action: 'move', id: b.id, dir: 'up' })
    expect(await slotOf(s, date, 'supper')).toEqual(['B', 'A', 'C'])
    await action(s, { action: 'move', id: a.id, dir: 'down' })
    expect(await slotOf(s, date, 'supper')).toEqual(['B', 'C', 'A'])
    await action(s, { action: 'move', id: b.id, dir: 'up' })
    expect(await slotOf(s, date, 'supper'), 'already first').toEqual(['B', 'C', 'A'])
    expect(await slotOf(s, date, 'lunch'), 'another slot does not move').toEqual(['Autre'])
  })

  it('rescheduling appends to the target, keeps the slot unless told, and displaces nothing', async () => {
    const s = await household('meals-resched', undefined, { empty: true })
    const m = await add(s, { title: 'Mobile', date: day(1), slot: 'lunch' })
    await add(s, { title: 'Déjà là', date: day(3), slot: 'lunch' })

    await action(s, { action: 'reschedule', id: m.id, toDate: day(3) + 7200 })
    expect(await slotOf(s, day(3), 'lunch'), 'a day→day drag keeps the slot and goes last').toEqual(['Déjà là', 'Mobile'])
    expect(await slotOf(s, day(1), 'lunch')).toEqual([])

    await action(s, { action: 'reschedule', id: m.id, toDate: day(3), slot: 'supper' })
    expect(await slotOf(s, day(3), 'supper')).toEqual(['Mobile'])
    expect(await slotOf(s, day(3), 'lunch')).toEqual(['Déjà là'])
  })

  it('clears one slot or the whole day, and a misspelled slot wipes nothing', async () => {
    const s = await household('meals-clear', undefined, { empty: true })
    const date = day(1)
    await add(s, { title: 'Souper 1', date, slot: 'supper' })
    await add(s, { title: 'Souper 2', date, slot: 'supper' })
    await add(s, { title: 'Dîner', date, slot: 'lunch' })
    await add(s, { title: 'Le lendemain', date: day(2), slot: 'supper' })

    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'clear', date, slot: 'brunch' } })).status).toBe(400)
    expect(await slotOf(s, date, 'supper'), 'clearing « brunch » must not wipe the souper').toHaveLength(2)

    expect((await action(s, { action: 'clear', date, slot: 'supper' })).cleared).toBe(2)
    expect(await slotOf(s, date, 'lunch')).toEqual(['Dîner'])
    expect((await action(s, { action: 'clear', date })).cleared, 'no slot = the whole day').toBe(1)
    expect((await plan(s)).days.map((m) => m.title), 'and only that day').toEqual(['Le lendemain'])
  })

  it('an unstated slot files under the household’s own hero meal, never a hardcoded souper', async () => {
    const s = await household('meals-hero', undefined, { empty: true })
    await add(s, { title: 'Par défaut' })
    expect((await plan(s)).days[0]?.slot).toBe('supper')

    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { mealHero: 'lunch' } }))
    await add(s, { title: 'Le grand repas du midi', slot: 'pas-un-repas' })
    expect((await plan(s)).days.find((m) => m.title.startsWith('Le grand'))!.slot).toBe('lunch')
  })

  it('missing staples reach the list as buyable names; a kid’s suggestion reaches nothing', async () => {
    const s = await household('meals-staples', undefined, { empty: true })
    const kid = await member(s, 'Zoé')
    const cook = await member(s, 'Marc')

    const planned = await add(s, { cookMemberId: cook.id, staples: ['500 g de boeuf haché', '2 tasses de riz'] })
    expect(planned.addedToList).toBe(2)
    const { results } = await env.DB.prepare('SELECT text, source FROM list_items WHERE household_id = ? ORDER BY created_at, text').bind(s.householdId).all<{ text: string; source: string }>()
    expect(results.every((r) => r.source === 'meal')).toBe(true)
    expect(results.map((r) => r.text.toLowerCase()).join(' '), 'an item, not a measured recipe line').toMatch(/riz/)
    expect(results.some((r) => /\d/.test(r.text))).toBe(false)

    const suggested = await add(s, { title: 'Pizza', suggest: true, suggestedBy: kid.id, cookMemberId: cook.id, staples: ['farine'] })
    expect(suggested.suggested).toBe(true)
    const row = (await plan(s)).days.find((m) => m.title === 'Pizza')!
    expect(row, 'a suggestion names who asked and assigns no cook').toMatchObject({ suggested_by: kid.id, cook_member_id: null })
    const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM list_items WHERE household_id = ?').bind(s.householdId).first<{ n: number }>()
    expect(after!.n, 'a suggestion buys nothing').toBe(results.length)
  })

  it('« recent » offers each dish once, skips what is itself a leftover, and looks back three days', async () => {
    const s = await household('meals-recent', undefined, { empty: true })
    await add(s, { title: 'Lasagne', date: today() })
    await add(s, { title: ' lasagne ', date: day(-1) })
    await add(s, { title: 'Restes', date: day(-1), isLeftover: true })
    await add(s, { title: 'Trop vieux', date: day(-4) })
    expect((await plan(s)).recent.map((m) => m.title)).toEqual(['Lasagne'])
  })
})

describe('les restants', () => {
  const pool = async (s: Session) => (await okJson<{ leftovers: { id: string; title: string; recipe_id: string | null; source_meal_id: string | null }[] }>(s.fetch('/api/meal-leftovers'))).leftovers
  const post = (s: Session, body: Record<string, unknown>) => okJson<{ ok: boolean; id?: string; planned?: boolean; mealId?: string; title?: string }>(s.fetch('/api/meal-leftovers', { method: 'POST', body }))

  it('a leftover joins the pool, is renamed, is eaten', async () => {
    const s = await household('leftovers-crud', undefined, { empty: true })
    const made = await post(s, { title: '  Chili  ', recipeId: 'r1', sourceMealId: 'm1' })
    expect(await pool(s)).toEqual([expect.objectContaining({ id: made.id, title: 'Chili', recipe_id: 'r1', source_meal_id: 'm1' })])

    await okJson(s.fetch('/api/meal-leftovers', { method: 'PATCH', body: { id: made.id, title: 'Chili du dimanche' } }))
    expect((await pool(s))[0]?.title).toBe('Chili du dimanche')
    expect((await s.fetch('/api/meal-leftovers', { method: 'PATCH', body: { id: made.id, title: ' ' } })).status).toBe(400)

    await okJson(s.fetch('/api/meal-leftovers', { method: 'DELETE', body: { id: made.id } }))
    expect(await pool(s)).toEqual([])
  })

  it('planning consumes it: the pool row becomes one tagged meal, at the end of the slot, with its recipe', async () => {
    const s = await household('leftovers-plan', undefined, { empty: true })
    await add(s, { title: 'Premier', date: day(1), slot: 'supper' })
    const { id } = await post(s, { title: 'Chili', recipeId: 'r1' })

    const done = await post(s, { action: 'plan', id, date: day(1) + 3600 })
    expect(done).toMatchObject({ planned: true, title: 'Chili' })
    expect(await pool(s), 'you eat leftovers once').toEqual([])

    const meal = (await plan(s)).days.find((m) => m.id === done.mealId)!
    expect(meal, 'the undo needs this very meal').toMatchObject({ title: 'Chili', recipe_id: 'r1', is_leftover: 1, date: day(1), slot: 'supper', position: 1 })
  })

  it('planning something already gone plans nothing, and the slot falls to the household’s hero', async () => {
    const s = await household('leftovers-gone', undefined, { empty: true })
    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { mealHero: 'lunch' } }))
    await post(s, { action: 'plan', id: 'déjà-mangé', date: day(1) })
    expect((await plan(s)).days, 'a second device’s double tap makes no ghost meal').toEqual([])

    const { id } = await post(s, { title: 'Soupe' })
    await post(s, { action: 'plan', id, date: day(1) })
    expect((await plan(s)).days[0]).toMatchObject({ title: 'Soupe', slot: 'lunch', is_leftover: 1 })
  })
  it('two devices planning the same leftover at once make ONE meal (claim and consume are one batch)', async () => {
    const s = await household('leftovers-race', undefined, { empty: true })
    const { id } = await post(s, { title: 'Pâté chinois' })
    const answers = await Promise.all([1, 2, 3, 4].map(() => post(s, { action: 'plan', id, date: day(1) })))
    expect(answers.filter((a) => a.planned), 'only one tap wins').toHaveLength(1)
    expect((await plan(s)).days.filter((m) => m.title === 'Pâté chinois')).toHaveLength(1)
    expect(await pool(s)).toEqual([])
  })

  it('the client may mint the meal id (an offline plan’s undo needs it); a junk id is ignored', async () => {
    const s = await household('leftovers-mint', undefined, { empty: true })
    const a = await post(s, { title: 'Chili' })
    const done = await post(s, { action: 'plan', id: a.id, date: day(1), mealId: 'AbCdEfGhJk23' })
    expect(done.mealId).toBe('AbCdEfGhJk23')
    expect((await plan(s)).days.find((m) => m.id === 'AbCdEfGhJk23')).toMatchObject({ title: 'Chili', is_leftover: 1 })

    const b = await post(s, { title: 'Soupe' })
    const junk = await post(s, { action: 'plan', id: b.id, date: day(1), mealId: "x'; DROP" })
    expect(junk.planned).toBe(true)
    expect(junk.mealId).not.toBe("x'; DROP")
    expect((await plan(s)).days.find((m) => m.id === junk.mealId)?.title).toBe('Soupe')
  })
})

describe('le plan des repas compte en jours, pas en 24 h (un jour a 23 h ou 25 h)', () => {
  // America/Toronto falls back on 2026-11-01 and springs forward on 2027-03-14. A span of
  // N × 86 400 s across either is an hour off a local midnight (CLAUDE.md, « Day
  // arithmetic »): looking BACK over the 25 h day misses the oldest day, looking AHEAD
  // over the 23 h day reaches into the next one.
  const at = async <T>(instant: string, fn: () => Promise<T>) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(instant))
    try {
      return await fn()
    } finally {
      vi.useRealTimers()
    }
  }

  it('Restants’ « déjà mangé » chips keep the oldest of the three days', async () => {
    await at('2026-11-03T17:00:00Z', async () => {
      const s = await household('recent-spring', undefined, { empty: true })
      await add(s, { title: 'Lasagne', date: day(-3) })
      expect((await plan(s)).recent.map((m) => m.title)).toEqual(['Lasagne'])
    })
  })

  it('the rolling window never pulls in the day after its last one', async () => {
    await at('2027-03-10T16:00:00Z', async () => {
      // Signed in INSIDE the faked clock: a session minted today has expired by 2027.
      const s = await household('window-spring', undefined, { empty: true })
      const w = (await plan(s)).windowDays
      await add(s, { title: 'Dernier jour', date: day(w - 1) })
      await add(s, { title: 'Hors fenêtre', date: day(w) })
      expect((await plan(s)).days.map((m) => m.title)).toEqual(['Dernier jour'])
    })
  })
})

describe('les idées', () => {
  const ideas = async (s: Session) => (await okJson<{ ideas: { id: string; title: string; recipe_id: string | null; suggested_by: string | null; date: number | null }[] }>(s.fetch('/api/meal-ideas'))).ideas

  it('an idea is added, renamed without losing its link or its author, and removed', async () => {
    const s = await household('ideas-crud', undefined, { empty: true })
    const zoe = await member(s, 'Zoé')
    const { id } = await okJson<{ id: string }>(s.fetch('/api/meal-ideas', { method: 'POST', body: { title: ' Tacos ', recipeId: 'r1', suggestedBy: zoe.id, date: day(2) } }))
    expect(await ideas(s)).toEqual([expect.objectContaining({ id, title: 'Tacos', recipe_id: 'r1', suggested_by: zoe.id, date: day(2) })])

    await okJson(s.fetch('/api/meal-ideas', { method: 'PATCH', body: { id, title: 'Tacos au poisson' } }))
    expect((await ideas(s))[0]).toMatchObject({ title: 'Tacos au poisson', recipe_id: 'r1', suggested_by: zoe.id })

    expect((await s.fetch('/api/meal-ideas', { method: 'POST', body: { title: '  ' } })).status).toBe(400)
    await okJson(s.fetch('/api/meal-ideas', { method: 'DELETE', body: { id } }))
    expect(await ideas(s)).toEqual([])
  })
})

describe('l’historique', () => {
  it('pages by whole days, newest first, and the future stays out', async () => {
    const s = await household('history-pages', undefined, { empty: true })
    await add(s, { title: 'Demain', date: day(1) })
    await add(s, { title: 'Aujourd’hui', date: today() })
    // Sixteen past days with two meals on the day a page boundary falls on.
    for (let n = 1; n <= 15; n++) await add(s, { title: `Jour ${n}`, date: day(-n), slot: 'supper' })
    await add(s, { title: 'Jour 13 midi', date: day(-13), slot: 'lunch' })

    type Page = { days: Meal[]; nextBefore: number | null }
    const first = await okJson<Page>(s.fetch('/api/meal-history'))
    expect(first.days[0]!.title, 'today is already what we are eating').toBe('Aujourd’hui')
    expect(first.days.map((m) => m.title)).not.toContain('Demain')
    expect(new Set(first.days.map((m) => m.date)).size, 'fourteen planned days').toBe(14)
    expect(first.days.filter((m) => m.date === day(-13)).map((m) => m.title), 'a day is never torn across pages').toEqual(['Jour 13 midi', 'Jour 13'])
    expect(first.nextBefore).toBe(day(-13))

    const second = await okJson<Page>(s.fetch(`/api/meal-history?before=${first.nextBefore}`))
    expect(second.days.map((m) => m.title)).toEqual(['Jour 14', 'Jour 15'])
    expect(second.nextBefore, 'history is exhausted').toBeNull()
  })

  it('« Déjà mangé » ranks by how often, ships no count, and ignores replanned restants', async () => {
    const s = await household('history-summary', undefined, { empty: true })
    await add(s, { title: 'Spaghetti', date: day(-9) })
    await add(s, { title: 'spaghetti', date: day(-2), recipeId: 'r-sp' })
    await add(s, { title: 'Soupe', date: day(-1) })
    await add(s, { title: 'Soupe', date: day(-3), isLeftover: true })
    await add(s, { title: 'Soupe', date: day(-4), isLeftover: true })
    await add(s, { title: 'Pas encore', date: day(2) })

    const { dishes } = await okJson<{ dishes: Record<string, unknown>[] }>(s.fetch('/api/meal-history?summary=1'))
    expect(dishes.map((d) => String(d.title).toLowerCase())).toEqual(['spaghetti', 'soupe'])
    expect(dishes[0], 'the most recent spelling and recipe link win').toMatchObject({ title: 'spaghetti', recipe_id: 'r-sp', last_at: day(-2) })
    expect(Object.keys(dishes[0]!).sort(), 'calm: « dernière fois », never « 12 fois »').toEqual(['last_at', 'recipe_id', 'title'])
  })

  // « Oubliées » read « jamais encore » for anything served more than 3 days ago: it
  // was derived from /api/meals' 3-day `recent`. This read covers the whole history.
  it('« Oubliées » knows when each recipe was last served — weeks back, by link, not the future', async () => {
    const s = await household('history-last-served', undefined, { empty: true })
    await add(s, { title: 'Lasagne', date: day(-40), recipeId: 'r-las' })
    await add(s, { title: 'Lasagne du dimanche', date: day(-20), recipeId: 'r-las' })
    await add(s, { title: 'Chili', date: day(0), recipeId: 'r-chili' })
    await add(s, { title: 'Chili', date: day(-1), recipeId: 'r-chili', isLeftover: true })
    await add(s, { title: 'Tarte', date: day(3), recipeId: 'r-tarte' })
    await add(s, { title: 'Sans lien', date: day(-5) })

    const { served } = await okJson<{ served: { recipe_id: string; last_at: number }[] }>(s.fetch('/api/meal-history?lastServed=1'))
    const byId = Object.fromEntries(served.map((x) => [x.recipe_id, x.last_at]))
    expect(byId, 'the latest serving per recipe, whatever it was called that night; today counts; a planned future day and a title-only meal do not').toEqual({
      'r-las': day(-20),
      'r-chili': day(0),
    })
  })
})

// « À placer » (mig 0155): the week's meals with no day yet. A meal keeps its ID as it
// moves between the bin and a day — the client paints each move as a row changing
// lists, so the server must move the SAME row, not mint a copy.
describe('« À placer » — the week without its days', () => {
  it('park, place on a day, take it back off, and remove — one meal, one id throughout', async () => {
    const s = await household('meals-unplaced', undefined, { empty: true })
    const parked = await okJson<{ id: string }>(s.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: ' Tacos ', recipeId: 'r-tacos' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: 'Soupe' } }))
    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: '  ' } })).status, 'a blank title parks nothing').toBe(400)

    let read = await plan(s)
    expect(read.unplaced.map((u) => u.title), 'in the order they were parked').toEqual(['Tacos', 'Soupe'])
    expect(read.unplaced[0]).toMatchObject({ id: parked.id, recipe_id: 'r-tacos', slot: null, position: 0 })
    expect(read.days).toEqual([])

    // Place it: no slot asked and none remembered → the household's hero (souper).
    await action(s, { action: 'place', id: parked.id, toDate: day(3) + 7200 })
    read = await plan(s)
    expect(read.unplaced.map((u) => u.title)).toEqual(['Soupe'])
    expect(read.days, 'the same row, now dated, linked to its recipe').toEqual([
      expect.objectContaining({ id: parked.id, title: 'Tacos', date: day(3), slot: 'supper', recipe_id: 'r-tacos' }),
    ])
    await action(s, { action: 'place', id: parked.id, toDate: day(4) })
    expect((await plan(s)).days.map((m) => m.date), 'a replayed place finds nothing left to move').toEqual([day(3)])

    // A side meal dragged off its day keeps its slot for the way back.
    const lunch = await add(s, { title: 'Sandwichs', date: day(1), slot: 'lunch' })
    await action(s, { action: 'unplace', id: lunch.id })
    read = await plan(s)
    expect(read.days.map((m) => m.title)).toEqual(['Tacos'])
    expect(read.unplaced.find((u) => u.id === lunch.id)).toMatchObject({ title: 'Sandwichs', slot: 'lunch' })
    await action(s, { action: 'place', id: lunch.id, toDate: day(2) })
    expect(await slotOf(s, day(2), 'lunch'), 'still a dîner').toEqual(['Sandwichs'])

    // Remove from the bin: the DELETE with { unplaced } targets the bin, never a meal.
    const soupe = (await plan(s)).unplaced[0]!
    await okJson(s.fetch('/api/meals', { method: 'DELETE', body: { id: parked.id, unplaced: true } }))
    expect((await plan(s)).days.map((m) => m.id), 'a planned meal with that id is untouched').toContain(parked.id)
    await okJson(s.fetch('/api/meals', { method: 'DELETE', body: { id: soupe.id, unplaced: true } }))
    expect((await plan(s)).unplaced).toEqual([])
  })

  // Mig 0156 (Marc, 2026-11-16: « link two recipes together … they move together until
  // explicitly unlinked »). The server only stores the grouping; moving a group as one is
  // the client's (Kitchen's dayDnd, UnplacedDay's picker) — e2e/unplaced-meals.spec.ts.
  it('« À placer » rows link into a group, split back, and a headline unplaces as a pair', async () => {
    const s = await household('meals-unplaced-link', undefined, { empty: true })
    const park = async (title: string) => (await okJson<{ id: string }>(s.fetch('/api/meals', { method: 'POST', body: { action: 'park', title } }))).id
    const a = await park('Spaghetti')
    const b = await park('Salade César')
    const c = await park('Tacos')
    const keys = async () => Object.fromEntries((await plan(s)).unplaced.map((u) => [u.id, u.link_id]))

    expect(Object.values(await keys()), 'a parked row is alone').toEqual([null, null, null])
    await action(s, { action: 'link', groups: [[a, b]] })
    let k = await keys()
    expect(k[a], 'linked rows share one key').toBeTruthy()
    expect(k[b]).toBe(k[a])
    expect(k[c], 'a row outside the gesture is untouched').toBeNull()

    // Grow the group, then cut it after its first row: one write each.
    await action(s, { action: 'link', groups: [[a, b, c]] })
    k = await keys()
    expect(new Set([k[a], k[b], k[c]]).size).toBe(1)
    await action(s, { action: 'link', groups: [[a], [b, c]] })
    k = await keys()
    expect(k[a], 'a group of one reads as alone').toBeNull()
    expect(k[b]).toBeTruthy()
    expect(k[c]).toBe(k[b])
    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'link', groups: [] } })).status).toBe(400)
    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'link', groups: [['x'.repeat(65)]] } })).status).toBe(400)

    // A supper headline of two meals dragged off its day joins the bin as ONE group.
    const m1 = await add(s, { title: 'Poulet', date: day(1), slot: 'supper' })
    const m2 = await add(s, { title: 'Riz', date: day(1), slot: 'supper' })
    await action(s, { action: 'unplace', id: m1.id, linkId: 'pairKey123' })
    await action(s, { action: 'unplace', id: m2.id, linkId: 'pairKey123' })
    k = await keys()
    expect(k[m1.id]).toBe('pairKey123')
    expect(k[m2.id]).toBe('pairKey123')
    const m3 = await add(s, { title: 'Soupe', date: day(2), slot: 'supper' })
    await action(s, { action: 'unplace', id: m3.id, linkId: 'not a key; DROP' })
    expect((await keys())[m3.id], 'a malformed key is dropped, the move still happens').toBeNull()
  })

  it('« À placer » rows change meal type — the group as one, an unknown slot refused, never across households', async () => {
    const s = await household('meals-unplaced-slot', undefined, { empty: true })
    const other = await household('meals-unplaced-slot-b', undefined, { empty: true })
    const park = async (title: string) => (await okJson<{ id: string }>(s.fetch('/api/meals', { method: 'POST', body: { action: 'park', title } }))).id
    const a = await park('Brocoli')
    const b = await park('Trempette')
    const slots = async () => Object.fromEntries((await plan(s)).unplaced.map((u) => [u.id, u.slot]))
    await action(s, { action: 'slot', ids: [a, b], slot: 'snack' })
    expect(await slots()).toEqual({ [a]: 'snack', [b]: 'snack' })
    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'slot', ids: [a], slot: 'brunch' } })).status).toBe(400)
    expect((await s.fetch('/api/meals', { method: 'POST', body: { action: 'slot', ids: [], slot: 'snack' } })).status).toBe(400)
    await action(other, { action: 'slot', ids: [a], slot: 'dessert' })
    expect((await slots())[a], 'another household changes nothing').toBe('snack')
    // …and the row lands in its own slot when placed without one.
    await action(s, { action: 'place', id: a, toDate: day(1) })
    expect((await plan(s)).days.find((m) => m.id === a)?.slot).toBe('snack')
  })

  it('one household never links another one’s bin rows', async () => {
    const a = await household('meals-unplaced-link-a', undefined, { empty: true })
    const b = await household('meals-unplaced-link-b', undefined, { empty: true })
    const x = (await okJson<{ id: string }>(a.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: 'Lasagne' } }))).id
    const y = (await okJson<{ id: string }>(a.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: 'Pain à l’ail' } }))).id
    await action(b, { action: 'link', groups: [[x, y]] })
    expect((await plan(a)).unplaced.map((u) => u.link_id)).toEqual([null, null])
  })

  it('one household never sees, places or removes another one’s bin', async () => {
    const a = await household('meals-unplaced-a', undefined, { empty: true })
    const b = await household('meals-unplaced-b', undefined, { empty: true })
    const { id } = await okJson<{ id: string }>(a.fetch('/api/meals', { method: 'POST', body: { action: 'park', title: 'Lasagne' } }))
    expect((await plan(b)).unplaced).toEqual([])
    await action(b, { action: 'place', id, toDate: day(1) })
    await okJson(b.fetch('/api/meals', { method: 'DELETE', body: { id, unplaced: true } }))
    expect((await plan(b)).days).toEqual([])
    expect((await plan(a)).unplaced.map((u) => u.title)).toEqual(['Lasagne'])
  })
})
