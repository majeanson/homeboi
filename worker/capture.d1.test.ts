import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'

// Review #10 (2026-11-17): a capture said « Ajouté : dentiste · Léa », naming neither the
// kind nor the day, so a household could not check that « mardi » had landed on the right
// Tuesday. /api/capture now returns the day it FILED ON, and this proves that day is the
// row's own, read back from D1, not a second guess (the client only formats it).
// (No AI binding here: `forceType` routes, which is the correction path's door too.)

type Routed = { kind: string; label: string; cleanup: { table: string; id: string }[]; when?: { at: number; allDay: boolean }; slot?: string }
const capture = (s: Session, text: string, forceType: string) =>
  okJson<{ type: string; degraded: boolean; routed: Routed }>(s.fetch('/api/capture', { method: 'POST', body: { text, forceType } }))

describe('a capture says what it filed and when', () => {
  it('an appointment carries its own start and all-day flag', async () => {
    const s = await household('capture-when-event', undefined, { empty: true })
    const r = await capture(s, 'dentiste', 'event')
    const row = await env.DB.prepare('SELECT start_at, all_day FROM events WHERE id = ?').bind(r.routed.cleanup[0]!.id).first<{ start_at: number; all_day: number }>()
    expect(r.routed.kind).toBe('event')
    expect(r.routed.when).toEqual({ at: row!.start_at, allDay: row!.all_day === 1 })
  })

  it('a meal carries its day and its slot', async () => {
    const s = await household('capture-when-meal', undefined, { empty: true })
    const r = await capture(s, 'tacos', 'meal')
    const row = await env.DB.prepare('SELECT date, slot FROM meals WHERE id = ?').bind(r.routed.cleanup[0]!.id).first<{ date: number; slot: string }>()
    expect(r.routed.when).toEqual({ at: row!.date, allDay: true })
    expect(r.routed.slot).toBe(row!.slot)
  })

  it('what has no day says none', async () => {
    const s = await household('capture-when-none', undefined, { empty: true })
    const note = await capture(s, 'appeler mamie', 'note')
    const task = await capture(s, 'appeler la garderie', 'task')
    expect([note.routed.when, task.routed.when]).toEqual([undefined, undefined])
  })
})
