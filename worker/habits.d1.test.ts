import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// « MES HABITUDES » against a real D1: a rhythm is one field, a mark is an absolute value
// (the outbox may replay it), history is kept, and the défi du jour is one standing habit
// a face checks in on.

interface Habit {
  id: string
  member_id: string | null
  title: string
  icon: string
  kind: string
  target: number | null
  unit: string
  cadence: string
  recur: string | null
  week_times: number | null
  day_times: number | null
  every_hours: number | null
  window_start: number | null
  window_end: number | null
  reminders: number[]
  archived: boolean
  due_days: number[]
}
interface Read {
  habits: Habit[]
  days: { habit_id: string; day: number; value: number; slips: number; member_id: string | null; note: string }[]
  marks: { habit_id: string; day: number; member_id: string }[]
  today: number
}

const today = () => localDayStart(new Date())
const read = (s: Session) => okJson<Read>(s.fetch('/api/habits'))
const one = async (s: Session, id: string) => (await read(s)).habits.find((h) => h.id === id)
const add = async (s: Session, body: Record<string, unknown> = {}) =>
  (await okJson<{ id: string }>(s.fetch('/api/habits', { method: 'POST', body: { title: 'Marcher', ...body } }))).id
const edit = (s: Session, body: Record<string, unknown>) => okJson(s.fetch('/api/habits', { method: 'PATCH', body }))
const mark = (s: Session, id: string, m: Record<string, unknown>) => edit(s, { id, mark: { day: today(), value: 1, ...m } })
const member = async (s: Session, name: string) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))).id

describe('une habitude', () => {
  it('is created, due today, marked, edited, paused, and soft-deleted with its history kept', async () => {
    const s = await household('habits-crud', undefined, { empty: true })
    const id = await add(s, { title: '  Marcher  ', icon: '🚶', reminders: [1300, 480, 480, -5, 9999] })
    const made = (await one(s, id))!
    expect(made).toMatchObject({ title: 'Marcher', icon: '🚶', kind: 'do', cadence: 'recur', target: null, archived: false })
    expect(made.reminders, 'sorted, deduped, in range').toEqual([480, 1300])
    expect(made.due_days, 'no rule means every day').toContain(today())

    await mark(s, id, { value: 1, note: '  au parc  ' })
    expect((await read(s)).days).toEqual([expect.objectContaining({ habit_id: id, day: today(), value: 1, note: 'au parc' })])

    await edit(s, { id, title: 'Courir', archived: true })
    expect(await one(s, id)).toMatchObject({ title: 'Courir', archived: true })
    await edit(s, { id, archived: false })
    expect((await one(s, id))!.archived, 'a pause is reversible').toBe(false)

    await okJson(s.fetch('/api/habits', { method: 'DELETE', body: { id } }))
    const after = await read(s)
    expect(after.habits).toEqual([])
    expect(after.days, 'hidden behind deleted_at').toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM habit_days WHERE habit_id = ?').bind(id).first(), 'but history is kept').not.toBeNull()
    await expect(edit(s, { id, title: 'Revenant' }), 'a deleted habit takes no more edits').rejects.toThrow(/^404/)
  })

  it('a count or a ceiling always has a goal; a plain habit never carries one', async () => {
    const s = await household('habits-target', undefined, { empty: true })
    expect((await one(s, await add(s, { kind: 'count', target: 8, unit: ' verres ' })))).toMatchObject({ target: 8, unit: 'verres' })
    expect((await one(s, await add(s, { kind: 'limit' })))!.target, 'a bad payload still reads sanely').toBe(1)
    expect((await one(s, await add(s, { kind: 'do', target: 8 })))!.target).toBeNull()
    expect((await one(s, await add(s, { kind: 'pas-un-genre' })))!.kind).toBe('do')
  })

  it('belongs to one of ours or to the Maisonnée, never to a stranger’s member', async () => {
    const s = await household('habits-owner', undefined, { empty: true })
    const other = await household('habits-owner-b', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const stranger = await member(other, 'Zoé')
    const mine = await add(s, { memberId: lea })
    expect((await one(s, mine))!.member_id).toBe(lea)
    expect((await s.fetch('/api/habits', { method: 'POST', body: { title: 'X', memberId: stranger } })).status).toBe(400)
    expect((await s.fetch('/api/habits', { method: 'PATCH', body: { id: mine, memberId: stranger } })).status).toBe(400)
    await edit(s, { id: mine, memberId: null })
    expect((await one(s, mine))!.member_id, 'null is the whole Maisonnée').toBeNull()
    await expect(edit(other, { id: mine, title: 'Volée' })).rejects.toThrow(/^404/)
  })
})

describe('le rythme', () => {
  it('a weekday rule lands only on its days, and a floating quota has no fixed day', async () => {
    const s = await household('habits-due', undefined, { empty: true })
    const weekday = (t: number) => new Date(t * 1000).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Toronto' })
    const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday(today()))
    const on = await add(s, { cadence: 'recur', recur: { freq: 'weekly', weekdays: [todayDow] } })
    const off = await add(s, { cadence: 'recur', recur: { freq: 'weekly', weekdays: [(todayDow + 1) % 7] } })
    expect((await one(s, on))!.due_days).toContain(today())
    expect((await one(s, off))!.due_days).not.toContain(today())
    expect((await one(s, await add(s, { cadence: 'week', weekTimes: 3 })))!.due_days).toEqual([])
  })

  it('« every N hours » derives how many moments fit; a bad window is pinned, never negative', async () => {
    const s = await household('habits-hours', undefined, { empty: true })
    expect(await one(s, await add(s, { cadence: 'hours', everyHours: 4, windowStart: 480, windowEnd: 1200 }))).toMatchObject({ every_hours: 4, window_start: 480, window_end: 1200, day_times: 4 })
    expect(await one(s, await add(s, { cadence: 'hours', everyHours: 2, windowStart: 600, windowEnd: 60 })), 'an end before the start fits one moment').toMatchObject({ window_start: 600, window_end: 600, day_times: 1 })
    expect((await one(s, await add(s, { cadence: 'day', dayTimes: 999 })))!.day_times).toBe(24)
    expect((await one(s, await add(s, { cadence: 'week', weekTimes: 99 })))!.week_times).toBe(7)
  })

  it('changing rhythm rewrites all of it: no stale window behind a weekly habit', async () => {
    const s = await household('habits-switch', undefined, { empty: true })
    const id = await add(s, { cadence: 'hours', everyHours: 4 })
    await edit(s, { id, cadence: 'week', weekTimes: 3 })
    expect(await one(s, id)).toMatchObject({ cadence: 'week', week_times: 3, day_times: null, every_hours: null, window_start: null, window_end: null, recur: null })
    await edit(s, { id, cadence: 'recur', recur: { freq: 'daily' } })
    expect(await one(s, id)).toMatchObject({ cadence: 'recur', week_times: null })
    expect((await one(s, id))!.recur).toContain('daily')
  })
})

describe('la journée d’une habitude', () => {
  it('a mark is absolute: a replayed write lands the same, and two values are last-write-wins', async () => {
    const s = await household('habits-replay', undefined, { empty: true })
    const id = await add(s, { kind: 'count', target: 8 })
    await mark(s, id, { value: 3 })
    await mark(s, id, { value: 3 })
    const { days } = await read(s)
    expect(days.map((d) => d.value), 'a delta would have said 6').toEqual([3])
    await mark(s, id, { value: 0 })
    expect((await read(s)).days[0]!.value, 'a zero is a value, not an absence').toBe(0)
  })

  it('any past day can be backfilled, the future cannot', async () => {
    const s = await household('habits-backfill', undefined, { empty: true })
    const id = await add(s)
    await mark(s, id, { day: addLocalDays(today(), -5) })
    expect((await read(s)).days.map((d) => d.day), 'j’ai oublié la semaine passée').toEqual([addLocalDays(today(), -5)])
    await expect(mark(s, id, { day: addLocalDays(today(), 1) })).rejects.toThrow(/^400/)
  })

  it('an unmarked note survives a later tap; a slip only exists on a habit to avoid', async () => {
    const s = await household('habits-note', undefined, { empty: true })
    const avoid = await add(s, { kind: 'avoid' })
    const plain = await add(s)
    await mark(s, avoid, { value: 1, slips: 2, note: 'dure journée' })
    await mark(s, avoid, { value: 1, slips: 3 })
    await mark(s, plain, { value: 1, slips: 9 })
    const { days } = await read(s)
    expect(days.find((d) => d.habit_id === avoid), 'the second tap sent no note').toMatchObject({ slips: 3, note: 'dure journée' })
    expect(days.find((d) => d.habit_id === plain)!.slips).toBe(0)
  })

  it('a mark names the face at the device', async () => {
    const s = await household('habits-face', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const id = await add(s)
    await okJson(s.fetch('/api/habits', { method: 'PATCH', headers: { 'X-Profile': lea }, body: { id, mark: { day: today(), value: 1 } } }))
    expect((await read(s)).days[0]?.member_id).toBe(lea)
  })
})

describe('le défi du jour', () => {
  const defi = (s: Session, text: string) => okJson<{ id: string; day: number }>(s.fetch('/api/habits', { method: 'POST', body: { defi: { text, title: 'Le défi' } } }))

  it('is one standing habit: drawing again replaces today’s text, never a second habit', async () => {
    const s = await household('habits-defi', undefined, { empty: true })
    const first = await defi(s, '  Dire merci  ')
    const second = await defi(s, 'Chanter')
    expect(second.id).toBe(first.id)
    const r = await read(s)
    expect(r.habits.filter((h) => h.kind === 'defi')).toHaveLength(1)
    expect(r.days).toEqual([expect.objectContaining({ habit_id: first.id, day: today(), note: 'Chanter', value: 1 })])
    expect((await s.fetch('/api/habits', { method: 'POST', body: { defi: { text: '   ' } } })).status).toBe(400)
  })

  it('a check-in is one face per day: idempotent, reversible, and never anonymous', async () => {
    const s = await household('habits-defi-mark', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const zoe = await member(s, 'Zoé')
    const { id, day } = await defi(s, 'Dire merci')
    const tap = (face: string | null, on: boolean) =>
      s.fetch('/api/habits', { method: 'PATCH', headers: face ? { 'X-Profile': face } : {}, body: { id, defiMark: { day, on } } })

    expect((await tap(null, true)).status, 'a mark is always someone’s').toBe(400)
    await okJson(tap(lea, true))
    await okJson(tap(lea, true))
    await okJson(tap(zoe, true))
    expect((await read(s)).marks.map((m) => m.member_id).sort()).toEqual([lea, zoe].sort())

    await okJson(tap(lea, false))
    expect((await read(s)).marks.map((m) => m.member_id)).toEqual([zoe])
  })
})
