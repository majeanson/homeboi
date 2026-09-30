import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, type Session } from '../functions/test/d1'

// THE DOORS ONTO THE LIST, and a fridge note that cannot go blank (2026-09-30), against a
// real D1 — each is a decision the SERVER makes, so a client-only check would still ship
// the row:
//   · capture (＋ sheet, mic) re-uses a line that is the SAME item, brings a ticked one
//     back, and never lets its undo delete a line it did not create;
//   · …but only the SAME item: a flyer's containment match is not capture's business;
//   · a flyer door's backstop matches on the whole title it was sent (`match_text`),
//     while the line keeps the calm name;
//   · an edit that would leave a fridge note with no words and no media is refused.

type Line = { id: string; text: string; checked_at: number | null }

const lines = async (s: Session): Promise<Line[]> =>
  (
    await env.DB.prepare('SELECT id, text, checked_at FROM list_items WHERE household_id = ? ORDER BY created_at')
      .bind(s.householdId)
      .all<Line>()
  ).results

const capture = async (s: Session, text: string, forceType = 'list-item') =>
  (await (await s.fetch('/api/capture', { method: 'POST', body: { text, forceType } })).json()) as {
    routed: { cleanup: { table: string; id: string }[] }
  }

describe('the doors onto the list', () => {
  it('capture re-uses the same item, brings a ticked one back, and keeps it out of the undo', async () => {
    const s = await household('doors-same', undefined, { empty: true })
    const made = (await (await s.fetch('/api/list', { method: 'POST', body: { text: 'Oeufs' } })).json()) as { id: string }
    await s.fetch('/api/list', { method: 'PATCH', body: { id: made.id, checked: true } })

    const r = await capture(s, 'œufs')
    const after = await lines(s)
    expect(after.map((l) => l.text), 'no twin beside « Oeufs »').toEqual(['Oeufs'])
    expect(after[0].checked_at, 'the ticked line comes back to buy').toBeNull()
    expect(r.routed.cleanup, 'a correction must not delete a line this capture did not make').toEqual([])

    // Running low goes the same way: the flag is new, the line is the one already there.
    const low = await capture(s, 'oeufs', 'pantry-low')
    expect((await lines(s)).length).toBe(1)
    expect(low.routed.cleanup.map((c) => c.table)).toEqual(['pantry_low'])
  })

  it('capture adds a new line for anything that is not the same item — no containment', async () => {
    const s = await household('doors-new', undefined, { empty: true })
    await s.fetch('/api/list', { method: 'POST', body: { text: 'Oeufs' } })
    const r = await capture(s, 'œufs en chocolat')
    expect((await lines(s)).map((l) => l.text)).toEqual(['Oeufs', 'œufs en chocolat'])
    expect(r.routed.cleanup.map((c) => c.table), 'what it created, it may undo').toEqual(['list_items'])
  })

  it('a flyer door matches on the whole title while the line keeps the calm name', async () => {
    const s = await household('doors-flyer', undefined, { empty: true })
    // The case `match_text` exists for: a line named by the part of the title the calm
    // name CUTS. The client matches the full title and lands the deal on « Courgettes »;
    // a cold-cache backstop matching only the calm « Tomates des champs » would insert a
    // twin instead — the two sides deciding differently on the same add.
    const courgettes = (await (await s.fetch('/api/list', { method: 'POST', body: { text: 'Courgettes' } })).json()) as { id: string }
    const TITLE = 'TOMATES DES CHAMPS, OU COURGETTES VERTES'
    const r = (await (
      await s.fetch('/api/list', { method: 'POST', body: { text: 'Tomates des champs', match_text: TITLE, match: true, deal: { id: 1, name: TITLE } } })
    ).json()) as { id: string; matched?: boolean }
    expect(r.matched).toBe(true)
    expect(r.id).toBe(courgettes.id)
    expect((await lines(s)).map((l) => l.text)).toEqual(['Courgettes'])
    const deal = await env.DB.prepare('SELECT deal_json FROM list_items WHERE id = ?').bind(courgettes.id).first<{ deal_json: string }>()
    expect(JSON.parse(deal!.deal_json).name, 'the deal keeps the whole flyer title').toBe(TITLE)

    // A true miss inserts the calm name, not the shout.
    await s.fetch('/api/list', { method: 'POST', body: { text: 'Fraises', match_text: 'FRAISES, 1 L', match: true } })
    expect((await lines(s)).map((l) => l.text)).toEqual(['Courgettes', 'Fraises'])
  })
})

describe('a fridge note cannot go blank', () => {
  it('refuses an edit to no words on a text note, allows it on a memo', async () => {
    const s = await household('note-blank', undefined, { empty: true })
    await s.fetch('/api/notes', { method: 'POST', body: { text: 'Acheter du pain' } })
    const { notes } = (await (await s.fetch('/api/notes')).json()) as { notes: { id: string; text: string }[] }
    const n = notes.find((x) => x.text === 'Acheter du pain')!
    expect((await s.fetch('/api/notes', { method: 'PATCH', body: { id: n.id, text: '   ' } })).status).toBe(400)
    const row = await env.DB.prepare('SELECT text FROM notes WHERE id = ?').bind(n.id).first<{ text: string }>()
    expect(row?.text, 'the words survive the refused edit').toBe('Acheter du pain')

    // A memo carries its payload in its media: clearing its caption is fine.
    await env.DB.prepare("UPDATE notes SET media_kind = 'drawing', media_key = 'k1' WHERE id = ?").bind(n.id).run()
    expect((await s.fetch('/api/notes', { method: 'PATCH', body: { id: n.id, text: '' } })).status).toBe(200)
  })
})
