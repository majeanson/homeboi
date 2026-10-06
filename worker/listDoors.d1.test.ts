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

// The other side of the cold-cache coin (2026-10-06): the DOORS add through a
// matcher, but the DELETE trusted the client's id blindly — and answered a vacuous
// « ok » when that id matched nothing. On a device holding a stale frame (rows
// cleared/re-added elsewhere, or a persisted optimistic `tmp-…` row from a dead
// session) every swipe-delete therefore "succeeded" while deleting NOTHING, the next
// fresh frame repainted the same-named line, and Marc watched items « always come
// back » — with three generations of client-side resurrection fixes unable to help,
// because the lie was the server's. Verified against production D1: six vacuous
// {"ok":true} writes that afternoon, zero rows gone.
describe('a swiped line dies even when the client aimed at a stale id', () => {
  const nowSec = () => Math.floor(Date.now() / 1000)

  it('an id the server never had answers 404, not a vacuous ok', async () => {
    const s = await household('del-stale', undefined, { empty: true })
    await s.fetch('/api/list', { method: 'POST', body: { text: 'Couscous' } })
    const res = await s.fetch('/api/list', { method: 'DELETE', body: { id: 'tmp-1759780000-zz' } })
    expect(res.status, 'a delete that removed nothing must say so').toBe(404)
    expect((await lines(s)).map((l) => l.text), 'and touch nothing').toEqual(['Couscous'])
  })

  it('…but heals onto the SAME item when the client says what it was deleting', async () => {
    const s = await household('del-heal', undefined, { empty: true })
    await s.fetch('/api/list', { method: 'POST', body: { text: 'Coeurs de romaine' } })
    // The swiped row's id comes from a frame the server has since replaced — the
    // text + the gesture's time are what still identify the user's intent.
    const res = await s.fetch('/api/list', {
      method: 'DELETE',
      body: { id: 'Zstale0rowZZ', text: 'coeurs de romaine', asOf: nowSec() + 5 },
    })
    expect(res.status).toBe(200)
    expect((await lines(s)).length, 'the same-named line is the one the user meant').toBe(0)
  })

  it('the heal never reaches a line added AFTER the gesture', async () => {
    const s = await household('del-future', undefined, { empty: true })
    // The row exists NOW; the delete claims it was gestured a minute AGO — a queued
    // offline delete replaying late must not eat a line someone re-added meanwhile.
    await s.fetch('/api/list', { method: 'POST', body: { text: 'Lait' } })
    const res = await s.fetch('/api/list', {
      method: 'DELETE',
      body: { id: 'Zstale0rowZZ', text: 'Lait', asOf: nowSec() - 60 },
    })
    expect(res.status, 'nothing safe to delete → say so').toBe(404)
    expect((await lines(s)).map((l) => l.text), 'the newer line survives').toEqual(['Lait'])
  })
})

// Todos mint optimistic `tmp-…` rows too (TodoSection), so the same stale-id hole existed there:
// a vacuous « ok » on an id the database never had. Same three truths, same helper.
describe('a deleted todo dies even when the client aimed at a stale id', () => {
  const nowSec = () => Math.floor(Date.now() / 1000)
  const titles = async (s: Session) =>
    (await env.DB.prepare('SELECT title FROM todos WHERE household_id = ? ORDER BY created_at').bind(s.householdId).all<{ title: string }>()).results.map(
      (r) => r.title,
    )

  it('an id the server never had answers 404, not a vacuous ok', async () => {
    const s = await household('todo-stale', undefined, { empty: true })
    await s.fetch('/api/todos', { method: 'POST', body: { title: 'Sortir les poubelles' } })
    const res = await s.fetch('/api/todos', { method: 'DELETE', body: { id: 'tmp-1759780000-zz' } })
    expect(res.status).toBe(404)
    expect(await titles(s)).toEqual(['Sortir les poubelles'])
  })

  it('heals onto the same item when the client says what it was deleting', async () => {
    const s = await household('todo-heal', undefined, { empty: true })
    await s.fetch('/api/todos', { method: 'POST', body: { title: 'Appeler le dentiste' } })
    const res = await s.fetch('/api/todos', { method: 'DELETE', body: { id: 'Zstale0rowZZ', text: 'appeler le dentiste', asOf: nowSec() + 5 } })
    expect(res.status).toBe(200)
    expect(await titles(s)).toEqual([])
  })

  it('never reaches a todo added AFTER the gesture', async () => {
    const s = await household('todo-future', undefined, { empty: true })
    await s.fetch('/api/todos', { method: 'POST', body: { title: 'Payer le loyer' } })
    const res = await s.fetch('/api/todos', { method: 'DELETE', body: { id: 'Zstale0rowZZ', text: 'Payer le loyer', asOf: nowSec() - 60 } })
    expect(res.status).toBe(404)
    expect(await titles(s)).toEqual(['Payer le loyer'])
  })
})

// « Vider les cochés » with a STALE snapshot — the batch twin of the swipe bug. The client
// names the ticked rows by id; ids the database never had used to clear NOTHING and answer
// ok, and the ticked lines repainted. Same two helpers, same three truths, for the list
// (which also logs the buy) and for todos.
describe('« Vider les cochés » survives a stale snapshot', () => {
  const nowSec = () => Math.floor(Date.now() / 1000)
  const tick = (s: Session, id: string) => s.fetch('/api/list', { method: 'PATCH', body: { id, checked: true } })
  const mk = async (s: Session, text: string) =>
    ((await (await s.fetch('/api/list', { method: 'POST', body: { text } })).json()) as { id: string }).id
  const bought = async (s: Session) =>
    (await env.DB.prepare('SELECT text FROM purchase_log WHERE household_id = ?').bind(s.householdId).all<{ text: string }>()).results.map((r) => r.text)

  it('list: a stale id heals onto the same ticked line, and the buy is still logged', async () => {
    const s = await household('clear-heal', undefined, { empty: true })
    const id = await mk(s, 'Coeurs de romaine')
    await tick(s, id)
    const res = await s.fetch('/api/list', {
      method: 'PATCH',
      body: { clearChecked: true, ids: ['tmp-1759780000-zz'], items: [{ id: 'tmp-1759780000-zz', text: 'coeurs de romaine' }], asOf: nowSec() + 5 },
    })
    expect(res.status).toBe(200)
    expect(await lines(s)).toEqual([])
    expect(await bought(s), 'clearing still records the purchase').toEqual(['Coeurs de romaine'])
  })

  it('list: when nothing named exists any more it says 404 — not a vacuous ok', async () => {
    const s = await household('clear-404', undefined, { empty: true })
    await mk(s, 'Pain')
    const res = await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-1759780000-zz'] } })
    expect(res.status).toBe(404)
    expect((await lines(s)).map((l) => l.text), 'and touched nothing').toEqual(['Pain'])
  })

  it('list: never clears an UNTICKED line, nor one added after the gesture', async () => {
    const s = await household('clear-safe', undefined, { empty: true })
    await mk(s, 'Lait') // present but NOT ticked
    const body = { clearChecked: true, ids: ['tmp-1'], items: [{ id: 'tmp-1', text: 'Lait' }] }
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { ...body, asOf: nowSec() + 5 } })).status).toBe(404)
    const id2 = await mk(s, 'Oeufs')
    await tick(s, id2)
    const late = { clearChecked: true, ids: ['tmp-2'], items: [{ id: 'tmp-2', text: 'Oeufs' }], asOf: nowSec() - 60 }
    expect((await s.fetch('/api/list', { method: 'PATCH', body: late })).status, 'a re-add after the gesture survives').toBe(404)
    expect((await lines(s)).map((l) => l.text)).toEqual(['Lait', 'Oeufs'])
  })

  it('list: the plain clear (real ids) still works and a bare clear-all with nothing ticked is a no-op', async () => {
    const s = await household('clear-plain', undefined, { empty: true })
    const id = await mk(s, 'Pommes')
    await tick(s, id)
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true, ids: [id] } })).status).toBe(200)
    expect(await lines(s)).toEqual([])
    expect((await s.fetch('/api/list', { method: 'PATCH', body: { clearChecked: true } })).status).toBe(200)
  })

  it('todos: heals a stale id, 404s on nothing, and spares an undone todo', async () => {
    const s = await household('clear-todo', undefined, { empty: true })
    const mkTodo = async (title: string) =>
      ((await (await s.fetch('/api/todos', { method: 'POST', body: { title } })).json()) as { id: string }).id
    const titles = async () =>
      (await env.DB.prepare('SELECT title FROM todos WHERE household_id = ? ORDER BY created_at').bind(s.householdId).all<{ title: string }>()).results.map((r) => r.title)
    const done = await mkTodo('Appeler le dentiste')
    await s.fetch('/api/todos', { method: 'PATCH', body: { id: done, done: true } })
    await mkTodo('Payer le loyer') // not done: must survive
    const heal = await s.fetch('/api/todos', {
      method: 'PATCH',
      body: { clearChecked: true, ids: ['tmp-1'], items: [{ id: 'tmp-1', text: 'appeler le dentiste' }], asOf: nowSec() + 5 },
    })
    expect(heal.status).toBe(200)
    expect(await titles()).toEqual(['Payer le loyer'])
    const gone = await s.fetch('/api/todos', { method: 'PATCH', body: { clearChecked: true, ids: ['tmp-2'] } })
    expect(gone.status).toBe(404)
    expect(await titles()).toEqual(['Payer le loyer'])
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
