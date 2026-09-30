import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household } from '../functions/test/d1'
import { nowSec } from '../functions/_lib/ids'

// « Mots » on the fridge (migration 0142), against a real D1: the member-to-member mot
// moved onto `notes`, and three things are decided by the SERVER, where a client hide
// would still ship the row — so each is asserted here, not in a component test:
//   · the recipient must be a member of THIS household;
//   · a mot scheduled for later is not on the board payload until its moment
//     (« Sa fête » must not ride the poll to the face it is for);
//   · a KEPT mot survives being taken down (the Souvenirs shelf still reads it), an
//     ordinary one does not.

type Note = { id: string; text: string; member_id: string | null; for_member_id: string | null; saved_at: number | null; dismissed_at: number | null }

describe('mots on the fridge (0142)', () => {
  it('addresses a mot to a member of THIS household only', async () => {
    const s = await household('mots-to', undefined, { empty: true })
    const other = await household('mots-other', undefined, { empty: true })
    const lea = (await (await s.fetch('/api/members', { method: 'POST', body: { name: 'Léa' } })).json()) as { id: string }
    const stranger = (await (await other.fetch('/api/members', { method: 'POST', body: { name: 'Zoé' } })).json()) as { id: string }

    expect((await s.fetch('/api/notes', { method: 'POST', body: { text: 'Bravo !', recipient_id: lea.id } })).status).toBe(200)
    // Red against trusting a posted id: a member of ANOTHER household is not a recipient.
    expect((await s.fetch('/api/notes', { method: 'POST', body: { text: 'Coucou', recipient_id: stranger.id } })).status).toBe(400)

    const { notes } = (await (await s.fetch('/api/notes')).json()) as { notes: Note[] }
    expect(notes.find((n) => n.text === 'Bravo !')?.for_member_id).toBe(lea.id)
  })

  it('keeps a scheduled mot off the board until its moment', async () => {
    const s = await household('mots-later', undefined, { empty: true })
    const later = nowSec() + 3 * 86_400
    expect((await s.fetch('/api/notes', { method: 'POST', body: { text: 'Bonne fête !', surface_at: later } })).status).toBe(200)
    expect((await s.fetch('/api/notes', { method: 'POST', body: { text: 'Maintenant' } })).status).toBe(200)

    const board = (await (await s.fetch('/api/board')).json()) as { notes: Note[] }
    expect(board.notes.map((n) => n.text)).toContain('Maintenant')
    expect(board.notes.map((n) => n.text), 'a surprise must not ride the board poll early').not.toContain('Bonne fête !')
    // …while the author's raw read (the outbox) still has it, to move or pull back.
    const { notes } = (await (await s.fetch('/api/notes')).json()) as { notes: Note[] }
    expect(notes.map((n) => n.text)).toContain('Bonne fête !')
  })

  it('a kept mot outlives being taken down; an ordinary one does not', async () => {
    const s = await household('mots-keep', undefined, { empty: true })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'À garder' } })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'Éphémère' } })
    const before = (await (await s.fetch('/api/notes')).json()) as { notes: Note[] }
    const keep = before.notes.find((n) => n.text === 'À garder')!
    const plain = before.notes.find((n) => n.text === 'Éphémère')!

    expect((await s.fetch('/api/notes', { method: 'PATCH', body: { id: keep.id, saved: true } })).status).toBe(200)
    await s.fetch('/api/notes', { method: 'DELETE', body: { id: keep.id } })
    await s.fetch('/api/notes', { method: 'DELETE', body: { id: plain.id } })

    const after = (await (await s.fetch('/api/notes')).json()) as { notes: Note[] }
    const kept = after.notes.find((n) => n.id === keep.id)
    expect(kept, 'the Souvenirs shelf reads a kept mot after it left the fridge').toBeTruthy()
    expect(kept!.dismissed_at).not.toBeNull()
    expect(after.notes.find((n) => n.id === plain.id)).toBeUndefined()
    // …and it is off the fridge itself.
    const board = (await (await s.fetch('/api/board')).json()) as { notes: Note[] }
    expect(board.notes.find((n) => n.id === keep.id)).toBeUndefined()
  })

  it('the mots live on notes, and the retired table is gone (0142 → 0143)', async () => {
    // 0142 moved the live mots onto `notes`; 0143 dropped `mots` once nothing read it. Assert
    // the shape those two leave on this database: no `mots` table, the columns on `notes`.
    const table = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mots'").first<{ name: string }>()
    expect(table, 'a second answer to « where are the mots? »').toBeNull()
    const cols = await env.DB.prepare("SELECT name FROM pragma_table_info('notes')").all<{ name: string }>()
    const names = cols.results.map((c) => c.name)
    for (const c of ['for_member_id', 'opened_at', 'saved_at', 'surface_at', 'transcript', 'updated_at']) expect(names).toContain(c)
  })

  // A private mot loses its meaning without its member (functions/_lib/members.ts) — and
  // since 0142 it lives on `notes`, so deleting a member must reach there, in BOTH
  // directions, while a family-wide paper they wrote only loses its author.
  it('deleting a member takes their private mots with them — and only those', async () => {
    const s = await household('mots-leave', undefined, { empty: true })
    const add = async (name: string) => ((await (await s.fetch('/api/members', { method: 'POST', body: { name } })).json()) as { id: string }).id
    const lea = await add('Léa')
    const papa = await add('Papa')
    const as = (face: string) => ({ 'X-Profile': face })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'Pour Léa', recipient_id: lea }, headers: as(papa) })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'Pour Papa', recipient_id: papa }, headers: as(lea) })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'Pour tous' }, headers: as(lea) })

    expect((await s.fetch('/api/members', { method: 'DELETE', body: { id: lea } })).status).toBeLessThan(300)

    const { notes } = (await (await s.fetch('/api/notes')).json()) as { notes: Note[] }
    const texts = notes.map((n) => n.text)
    expect(texts, 'a mot TO the departed member goes').not.toContain('Pour Léa')
    expect(texts, 'a mot FROM them to someone goes too — never re-broadcast as an anonymous one').not.toContain('Pour Papa')
    const shared = notes.find((n) => n.text === 'Pour tous')
    expect(shared, 'a family-wide paper stays on the fridge').toBeTruthy()
    expect(shared!.member_id).toBeNull()
  })
})
