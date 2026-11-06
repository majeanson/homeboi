import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// A DEVICE STILL WEARING A DELETED FACE (2026-11-06). X-Profile went straight into a foreign
// key, so a phone that opened Notes before the board cleared its stale face, or an offline
// write replayed days later, got a 500 and lost what was typed. Owner decision: keep the
// write and drop the author. Attribution is never worth a person's words.

const addFace = async (s: Session) =>
  (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name: 'Léa', colour: '#4d9' } }))).id

const goneFace = async (s: Session) => {
  const id = await addFace(s)
  await okJson(s.fetch('/api/members', { method: 'DELETE', body: { id } }))
  return { 'X-Profile': id }
}

const day = addLocalDays(localDayStart(new Date()), 3)

describe('a write from a face that no longer exists', () => {
  it('lands with no author: a day note', async () => {
    const s = await household('gone-day', undefined, { empty: true })
    const headers = await goneFace(s)
    await okJson(s.fetch('/api/day-notes', { method: 'POST', body: { date: day, text: 'Garder ça' }, headers }))
    const row = await env.DB.prepare('SELECT text, member_id FROM day_notes WHERE household_id = ?')
      .bind(s.householdId)
      .first<{ text: string; member_id: string | null }>()
    expect(row).toEqual({ text: 'Garder ça', member_id: null })
  })

  it('lands with no author: a fridge note', async () => {
    const s = await household('gone-note', undefined, { empty: true })
    const headers = await goneFace(s)
    await okJson(s.fetch('/api/notes', { method: 'POST', body: { text: 'Sur le frigo' }, headers }))
    const row = await env.DB.prepare('SELECT text FROM notes WHERE household_id = ?')
      .bind(s.householdId)
      .first<{ text: string }>()
    expect(row?.text).toBe('Sur le frigo')
  })

  it('lands with no author: a family note', async () => {
    const s = await household('gone-family', undefined, { empty: true })
    const headers = await goneFace(s)
    await okJson(s.fetch('/api/family-notes', { method: 'POST', body: { text: 'Pour tous', scope: 'family' }, headers }))
    const row = await env.DB.prepare('SELECT author_member_id FROM family_notes WHERE household_id = ?')
      .bind(s.householdId)
      .first<{ author_member_id: string | null }>()
    expect(row).toEqual({ author_member_id: null })
  })

  it('a heart needs a face, so it is refused in words, never a 500', async () => {
    const s = await household('gone-love', undefined, { empty: true })
    const headers = await goneFace(s)
    const { id } = await okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Tourtière' } }))
    const res = await s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id }, headers })
    expect(res.status).toBe(400)
  })

  it('a replay of the same write is still one row', async () => {
    const s = await household('gone-replay', undefined, { empty: true })
    const headers = { ...(await goneFace(s)), 'Idempotency-Key': 'gone-1' }
    const first = await s.fetch('/api/notes', { method: 'POST', body: { text: 'Une fois' }, headers })
    const replay = await s.fetch('/api/notes', { method: 'POST', body: { text: 'Une fois' }, headers })
    expect(first.status).toBe(replay.status)
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM notes WHERE household_id = ?')
      .bind(s.householdId)
      .first<{ n: number }>()
    expect(n?.n).toBe(1)
  })
})

describe('a real face is untouched', () => {
  it('still signs what it writes', async () => {
    const s = await household('kept-face', undefined, { empty: true })
    const lea = await addFace(s)
    await okJson(s.fetch('/api/day-notes', { method: 'POST', body: { date: day, text: 'Signé' }, headers: { 'X-Profile': lea } }))
    const row = await env.DB.prepare('SELECT member_id FROM day_notes WHERE household_id = ?')
      .bind(s.householdId)
      .first<{ member_id: string | null }>()
    expect(row?.member_id).toBe(lea)
  })

  it('a face from another household signs nothing here', async () => {
    const a = await household('face-a', undefined, { empty: true })
    const b = await household('face-b', undefined, { empty: true })
    const theirs = await addFace(a)
    await okJson(b.fetch('/api/day-notes', { method: 'POST', body: { date: day, text: 'Chez nous' }, headers: { 'X-Profile': theirs } }))
    const row = await env.DB.prepare('SELECT member_id FROM day_notes WHERE household_id = ?')
      .bind(b.householdId)
      .first<{ member_id: string | null }>()
    expect(row).toEqual({ member_id: null })
  })
})
