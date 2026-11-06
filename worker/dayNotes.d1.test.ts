import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// LES MOTS DU JOUR against a real D1: one memo per calendar day, whichever instant of that
// day it was written from, and two devices cannot double it.

type DayNote = { id: string; date: number; text: string; member_id: string | null; updated_at: number }

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const notes = async (s: Session) => (await okJson<{ notes: DayNote[] }>(s.fetch('/api/day-notes'))).notes
const save = (s: Session, date: number, text: string, headers?: Record<string, string>) => s.fetch('/api/day-notes', { method: 'POST', body: { date, text }, headers })
const clear = (s: Session, date: number) => okJson(s.fetch('/api/day-notes', { method: 'DELETE', body: { date } }))

describe('le mot du jour', () => {
  it('is written, read back, overwritten in place, and cleared', async () => {
    const s = await household('daynotes-crud', undefined, { empty: true })
    await okJson(save(s, day(1), '  Apporter la tarte  '))
    const made = (await notes(s))[0]!
    expect(made).toMatchObject({ date: day(1), text: 'Apporter la tarte' })

    await okJson(save(s, day(1), 'Apporter le gâteau'))
    const after = await notes(s)
    expect(after, 'one memo per day').toHaveLength(1)
    expect(after[0]).toMatchObject({ id: made.id, text: 'Apporter le gâteau' })

    await clear(s, day(1))
    expect(await notes(s)).toEqual([])
    expect(await env.DB.prepare('SELECT 1 FROM day_notes WHERE id = ?').bind(made.id).first()).toBeNull()
  })

  it('any instant of a day is that day, on the write and on the clear', async () => {
    const s = await household('daynotes-instant', undefined, { empty: true })
    await okJson(save(s, day(2) + 8 * 3600, 'matin'))
    await okJson(save(s, day(2) + 22 * 3600, 'soir'))
    expect((await notes(s)).map((n) => [n.date, n.text])).toEqual([[day(2), 'soir']])
    await clear(s, day(2) + 3600)
    expect(await notes(s)).toEqual([])
  })

  it('reads today forward in order; a past memo stays stored but out of the kitchen', async () => {
    const s = await household('daynotes-window', undefined, { empty: true })
    await okJson(save(s, day(3), 'plus tard'))
    await okJson(save(s, today(), 'aujourd’hui'))
    await okJson(save(s, day(-1), 'hier'))
    expect((await notes(s)).map((n) => n.text)).toEqual(['aujourd’hui', 'plus tard'])
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM day_notes WHERE household_id = ?').bind(s.householdId).first<{ n: number }>()).toEqual({ n: 3 })
  })

  it('caps the memo and refuses an empty one; it names the face that wrote it', async () => {
    const s = await household('daynotes-text', undefined, { empty: true })
    const lea = await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } }))
    expect((await save(s, day(1), '   ')).status).toBe(400)
    await okJson(save(s, day(1), 'x'.repeat(400), { 'X-Profile': lea.id }))
    const [n] = await notes(s)
    expect(n?.text).toHaveLength(280)
    expect(n?.member_id).toBe(lea.id)
  })

  it('stays inside its household, and reaches the calendar, today’s board and « Depuis ce matin »', async () => {
    const s = await household('daynotes-a', undefined, { empty: true })
    const other = await household('daynotes-b', undefined, { empty: true })
    await okJson(save(s, today(), 'Sortir les bacs'))
    await okJson(save(other, today(), 'Autre maison'))
    expect((await notes(s)).map((n) => n.text)).toEqual(['Sortir les bacs'])

    const month = await okJson<{ dayNotes: { text: string }[] }>(s.fetch(`/api/month?from=${today()}&to=${day(7)}`))
    expect(month.dayNotes.map((n) => n.text)).toEqual(['Sortir les bacs'])
    expect(await (await s.fetch('/api/board')).text()).toContain('Sortir les bacs')
    expect(await (await s.fetch('/api/today-changes')).text()).toContain('Sortir les bacs')
  })
})
