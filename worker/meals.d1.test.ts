import { describe, it, expect } from 'vitest'
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
})
