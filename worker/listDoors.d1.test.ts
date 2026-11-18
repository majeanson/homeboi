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
    expect(after[0]!.checked_at, 'the ticked line comes back to buy').toBeNull()
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

// The other side of the cold-cache coin (2026-10-06): a DELETE that matched nothing used to
// answer a vacuous « ok », the client's deferred removal trusted it, and Marc watched swiped
// items « always come back » (six {"ok":true} writes in production, zero rows gone). The 404
// stays. What went (review #39) is the text-matched « heal » that stood a same-named row in for
// a stale optimistic `tmp-…` id: the client now mints the real id (src/lib/rowId) and the
// create keeps it, so there is no stand-in id left to guess for, and a guess by name could
// delete the wrong one of two « lait ».
describe('an optimistic create keeps the id the client minted', () => {
  const uuid = () => crypto.randomUUID()

  it('list, todos and tasks: the row lives under the client’s id, and a tick or delete on it lands', async () => {
    const s = await household('rowid-kept', undefined, { empty: true })
    const L = uuid()
    expect(((await (await s.fetch('/api/list', { method: 'POST', body: { id: L, text: 'Lait' } })).json()) as { id: string }).id).toBe(L)
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { id: L, checked: true } })).status).toBe(200)
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: [L] } })).status).toBe(200)
    expect(await lines(s)).toEqual([])
    const T = uuid()
    expect(((await (await s.fetch('/api/todos', { method: 'POST', body: { id: T, title: 'Appeler' } })).json()) as { id: string }).id).toBe(T)
    expect((await s.fetch('/api/todos', { method: 'DELETE', body: { id: T } })).status).toBe(200)
    const K = uuid()
    expect(((await (await s.fetch('/api/tasks', { method: 'POST', body: { id: K, title: 'Toit' } })).json()) as { id: string }).id).toBe(K)
    expect((await s.fetch('/api/tasks', { method: 'DELETE', body: { id: K } })).status).toBe(200)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE household_id = ?').bind(s.householdId).first<{ n: number }>())?.n).toBe(0)
  })

  it('anything but a UUID gets a server id, as before', async () => {
    const s = await household('rowid-refused', undefined, { empty: true })
    const res = (await (await s.fetch('/api/list', { method: 'POST', body: { id: 'tmp-1759780000-zz', text: 'Pain' } })).json()) as { id: string }
    expect(res.id).not.toBe('tmp-1759780000-zz')
    expect((await lines(s)).map((l) => l.text)).toEqual(['Pain'])
  })
})

describe('a delete or a clear that names nothing says so, and touches nothing', () => {
  const tick = (s: Session, id: string) => s.fetch('/api/list', { method: 'PATCH', body: { id, checked: true } })
  const mk = async (s: Session, text: string) => ((await (await s.fetch('/api/list', { method: 'POST', body: { text } })).json()) as { id: string }).id
  const bought = async (s: Session) =>
    (await env.DB.prepare('SELECT text FROM purchase_log WHERE household_id = ?').bind(s.householdId).all<{ text: string }>()).results.map((r) => r.text)
  const titles = async (s: Session) =>
    (await env.DB.prepare('SELECT title FROM tasks WHERE household_id = ? AND kind IS NULL AND cleared_at IS NULL ORDER BY created_at').bind(s.householdId).all<{ title: string }>()).results.map((r) => r.title)

  it('list: a stale id is a 404 — even with a same-named line there, which is NOT a stand-in', async () => {
    const s = await household('del-stale', undefined, { empty: true })
    await mk(s, 'Lait')
    // An old bundle still sends text + asOf: they are ignored now.
    const res = await s.fetch('/api/list', { method: 'DELETE', body: { id: 'Zstale0rowZZ', text: 'lait', asOf: Math.floor(Date.now() / 1000) + 5 } })
    expect(res.status, 'a delete that removed nothing must say so').toBe(404)
    expect((await lines(s)).map((l) => l.text), 'and the other « lait » lives').toEqual(['Lait'])
  })

  it('list: a clear naming nothing that exists is a 404; a real one logs the buy; a bare clear-all with nothing ticked is a no-op', async () => {
    const s = await household('clear-plain', undefined, { empty: true })
    const id = await mk(s, 'Pommes')
    await tick(s, id)
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-1759780000-zz'] } })).status).toBe(404)
    expect((await lines(s)).map((l) => l.text), 'touched nothing').toEqual(['Pommes'])
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: [id] } })).status).toBe(200)
    expect(await lines(s)).toEqual([])
    expect(await bought(s), 'clearing still records the purchase').toEqual(['Pommes'])
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true } })).status).toBe(200)
  })

  it('todos: a stale delete or clear is a 404, and a real clear stamps the task out of the day', async () => {
    const s = await household('clear-todo', undefined, { empty: true })
    const mkTodo = async (title: string) => ((await (await s.fetch('/api/todos', { method: 'POST', body: { title } })).json()) as { id: string }).id
    const done = await mkTodo('Appeler le dentiste')
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: done, done: true } })
    await mkTodo('Payer le loyer')
    expect((await s.fetch('/api/todos', { method: 'DELETE', body: { id: 'tmp-1759780000-zz' } })).status).toBe(404)
    expect((await s.fetch('/api/todos', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-2'] } })).status).toBe(404)
    expect(await titles(s)).toEqual(['Appeler le dentiste', 'Payer le loyer'])
    expect((await s.fetch('/api/todos', { method: 'PATCH', body: { clearChecked: true, ids: [done] } })).status).toBe(200)
    expect(await titles(s)).toEqual(['Payer le loyer'])
    // Cleared, not deleted: every task stays as history (0153, the owner's decision 2).
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM tasks WHERE id = ? AND cleared_at IS NOT NULL').bind(done).first<{ n: number }>())?.n).toBe(1)
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
