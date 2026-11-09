import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// « PROJETS & ENTRETIEN » against a real D1: one table, two faces, and the scheduling that
// is all derived at read time, so an item owes something, goes quiet when postponed, and
// comes back on the next cycle.

interface Project {
  id: string
  kind: string
  title: string
  notes: string | null
  budget_cents: number | null
  color: string
  at: number | null
  recur_json: string | null
  recur_from: string
  lead_seconds: number | null
  last_done_at: number | null
  snoozed_until: number | null
  carnet_id: string | null
  nextAt: number | null
  overdueSince: number | null
  dueToday: boolean
}

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const projects = async (s: Session) => (await okJson<{ projects: Project[] }>(s.fetch('/api/home-projects'))).projects
const one = async (s: Session, id: string) => (await projects(s)).find((p) => p.id === id)!
const add = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Gouttières', ...body } }))).id
const patch = (s: Session, body: Record<string, unknown>) => okJson<{ ok?: boolean; done?: boolean; snoozedUntil?: number | null }>(s.fetch('/api/home-projects', { method: 'PATCH', body }))

describe('un projet', () => {
  it('is created, read back, edited in place, and deleted', async () => {
    const s = await household('projects-crud', undefined, { empty: true })
    const id = await add(s, { title: '  Toiture  ', kind: 'plan', notes: ' devis ', budgetCents: 1250099.9, color: '#123456', at: day(30), leadSeconds: 30 * 86400 })
    expect(await one(s, id)).toMatchObject({ kind: 'plan', title: 'Toiture', notes: 'devis', budget_cents: 1250099, color: '#123456', at: day(30), lead_seconds: 7 * 86400 })

    await okJson(s.fetch('/api/home-projects', { method: 'PATCH', body: { id, notes: '  ', budgetCents: null, color: 'pas-une-couleur' } }))
    expect(await one(s, id), 'cleared to null, the colour falls back').toMatchObject({ title: 'Toiture', notes: null, budget_cents: null, color: '#88a36f' })

    await okJson(s.fetch('/api/home-projects', { method: 'DELETE', body: { id } }))
    expect(await projects(s)).toEqual([])
  })

  it('needs a title, keeps no lead without a date, and a stranger’s row is a 404 for every shape of PATCH', async () => {
    const s = await household('projects-a', undefined, { empty: true })
    const other = await household('projects-b', undefined, { empty: true })
    expect((await s.fetch('/api/home-projects', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    const id = await add(s, { leadSeconds: 3600 })
    expect((await one(s, id)).lead_seconds, 'a lead needs an occurrence to anchor against').toBeNull()

    for (const body of [{ id, title: 'Volé' }, { id }, { id, snooze: 'week' }, { id, snooze: 'cycle' }]) {
      expect((await other.fetch('/api/home-projects', { method: 'PATCH', body })).status, JSON.stringify(body)).toBe(404)
    }
    expect(await one(s, id)).toMatchObject({ title: 'Gouttières', last_done_at: null, snoozed_until: null })
    expect((await s.fetch('/api/home-projects', { method: 'PATCH', body: { id, snooze: 'demain' } })).status).toBe(400)
  })

  it('a carnet link is honoured only when the household owns that carnet', async () => {
    const s = await household('projects-carnet', undefined, { empty: true })
    const other = await household('projects-carnet-b', undefined, { empty: true })
    const mine = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Maison' } }))
    const theirs = await okJson<{ id: string }>(other.fetch('/api/carnets', { method: 'POST', body: { name: 'Autre' } }))
    expect((await one(s, await add(s, { carnetId: mine.id }))).carnet_id).toBe(mine.id)
    const id = await add(s, { carnetId: theirs.id })
    expect((await one(s, id)).carnet_id, 'a foreign id stores NULL, not a dangling link').toBeNull()
    await patch(s, { id, carnetId: mine.id })
    expect((await one(s, id)).carnet_id).toBe(mine.id)
  })
})

describe('l’entretien', () => {
  it('an occurrence today is due; done, it moves to the next one', async () => {
    const s = await household('upkeep-due', undefined, { empty: true })
    const id = await add(s, { kind: 'upkeep', at: today(), recur: { freq: 'weekly' } })
    const due = await one(s, id)
    expect(due.dueToday).toBe(true)
    expect(due.overdueSince).toBeNull()

    expect((await patch(s, { id })).done).toBe(true)
    const done = await one(s, id)
    expect(done.last_done_at).toBeGreaterThan(0)
    expect(done.dueToday).toBe(false)
    expect(done.nextAt, 'the same grid, one cycle on').toBe(day(7))
  })

  it('a missed cycle stays owed, calmly, until someone does it', async () => {
    const s = await household('upkeep-overdue', undefined, { empty: true })
    const id = await add(s, { kind: 'upkeep', at: day(-10), recur: { freq: 'weekly' } })
    expect((await one(s, id)).overdueSince).toBe(day(-3))
    await patch(s, { id })
    expect((await one(s, id)).overdueSince).toBeNull()
  })

  it('« à partir de la dernière fois » re-anchors the cycle on the day it was done', async () => {
    const s = await household('upkeep-done', undefined, { empty: true })
    const fromDone = await add(s, { kind: 'upkeep', at: day(-10), recur: { freq: 'weekly' }, recurFrom: 'done' })
    await patch(s, { id: fromDone })
    expect((await one(s, fromDone)).nextAt).toBe(day(7))

    const fixed = await add(s, { kind: 'upkeep', at: day(-10), recur: { freq: 'weekly' } })
    await patch(s, { id: fixed })
    expect((await one(s, fixed)).nextAt, 'the fixed grid stays on its own weekday').toBe(day(4))
  })

  it('« Reporter » quiets it for a week or a cycle, waking is explicit, and done beats postponed', async () => {
    const s = await household('upkeep-snooze', undefined, { empty: true })
    const id = await add(s, { kind: 'upkeep', at: today(), recur: { freq: 'weekly', interval: 2 } })

    expect((await patch(s, { id, snooze: 'week' })).snoozedUntil).toBe(day(7))
    const quiet = await one(s, id)
    expect(quiet.dueToday, 'postponed means no due and nothing owed').toBe(false)
    expect(quiet.overdueSince).toBeNull()

    expect((await patch(s, { id, snooze: null })).snoozedUntil).toBeNull()
    expect((await one(s, id)).dueToday).toBe(true)

    expect((await patch(s, { id, snooze: 'cycle' })).snoozedUntil, 'the next scheduled occurrence').toBe(day(14))
    await patch(s, { id })
    expect((await one(s, id)).snoozed_until, 'a stale « reporté » never mutes the next cycle').toBeNull()
  })

  it('a one-off has no next cycle: « cycle » falls back to a week', async () => {
    const s = await household('upkeep-oneoff', undefined, { empty: true })
    const id = await add(s, { at: day(2) })
    expect((await patch(s, { id, snooze: 'cycle' })).snoozedUntil).toBe(day(7))
  })

  it('a due item reaches the calendar, and a project with no date stays off it', async () => {
    const s = await household('upkeep-month', undefined, { empty: true })
    await add(s, { title: 'Filtre', kind: 'upkeep', at: day(3), recur: { freq: 'monthly' } })
    await add(s, { title: 'Un jour' })
    const month = await okJson<{ tasks: { title: string }[] }>(s.fetch(`/api/month?from=${today()}&to=${day(10)}`))
    expect(month.tasks.map((p) => p.title)).toEqual(['Filtre'])
  })

  it('stays out of the database once deleted, whatever linked to it', async () => {
    const s = await household('upkeep-delete', undefined, { empty: true })
    const c = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Maison' } }))
    const id = await add(s, { carnetId: c.id })
    await okJson(s.fetch('/api/home-projects', { method: 'DELETE', body: { id } }))
    expect(await env.DB.prepare('SELECT 1 FROM home_projects WHERE id = ?').bind(id).first()).toBeNull()
  })
})
