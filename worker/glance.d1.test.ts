import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// LES LECTURES D'ENSEMBLE against a real D1: « À régler », « Cette semaine », l'année, le
// journal d'IA, et les partages de famille. None of them owns a table worth the name; each
// composes what other doors wrote, so the test writes through those doors and reads here.

const today = () => localDayStart(new Date())
const day = (n: number) => addLocalDays(today(), n)
const member = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body }))).id

describe('à régler', () => {
  type Signal = { kind: string; key: string; label: string; sub?: string; href: string }
  const scan = async (s: Session) => (await okJson<{ signals: Signal[] }>(s.fetch('/api/a-regler'))).signals
  const emptyTomorrow = (signals: Signal[]) => signals.find((x) => x.kind === 'meal-empty' && x.sub === 'tomorrow')

  it('names tomorrow’s empty supper, and planning one settles it', async () => {
    const s = await household('regler-meal', undefined, { empty: true })
    const signal = emptyTomorrow(await scan(s))!
    expect(signal.href).toBe(`/kitchen/day/${day(1)}`)
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: day(1), title: 'Tacos', slot: 'supper' } }))
    expect(emptyTomorrow(await scan(s))).toBeUndefined()
  })

  it('« Plus tard » quiets a signal, and undoing it brings the signal back', async () => {
    const s = await household('regler-snooze', undefined, { empty: true })
    const { key } = emptyTomorrow(await scan(s))!
    await okJson(s.fetch('/api/a-regler', { method: 'POST', body: { key } }))
    expect((await scan(s)).map((x) => x.key)).not.toContain(key)
    await okJson(s.fetch('/api/a-regler', { method: 'DELETE', body: { key } }))
    expect((await scan(s)).map((x) => x.key)).toContain(key)
    expect((await s.fetch('/api/a-regler', { method: 'POST', body: {} })).status).toBe(400)
  })

  it('mail waiting in the box is a signal, and a sitter is never handed the list', async () => {
    const s = await household('regler-mail', undefined, { empty: true })
    const box = await okJson<{ guestToken: string }>(s.fetch('/api/guest/start', { method: 'POST', body: { kind: 'showcase' } }))
    await env.DB.prepare("INSERT INTO postbox_submissions (id, household_id, guest_id, sender_name, text, status, created_at) VALUES ('m1', ?, 'g', 'Mamie', 'Allô', 'pending', 1)").bind(s.householdId).run()
    expect((await scan(s)).map((x) => x.kind)).toContain('mail-postbox')
    const res = await okJson<{ signals: unknown[] }>(anon('/api/a-regler', { headers: { 'X-Device-Token': box.guestToken } }))
    expect(res.signals).toEqual([])
  })

  it('stays short, and carries no count', async () => {
    const s = await household('regler-cap')
    const raw = await okJson<Record<string, unknown>>(s.fetch('/api/a-regler'))
    expect(Object.keys(raw)).toEqual(['signals'])
    expect((raw.signals as unknown[]).length).toBeLessThanOrEqual(6)
  })
})

describe('cette semaine', () => {
  type Week = {
    today: number
    ahead: { meals: { title: string }[]; events: { title: string }[]; birthdays: { name: string }[]; work: unknown[]; projects: { title: string }[] }
    behind: { chores: { choreTitle: string; helpers?: { name: string }[] }[]; routines: { name: string; who: string }[]; projects: { title: string }[] }
  }
  it('sets out the week ahead and what we did together, by face and never by count', async () => {
    const s = await household('week-both', undefined, { empty: true })
    const zoe = await member(s, { name: 'Zoé', isChild: true })
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: day(2), title: 'Tacos' } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Dentiste', startAt: day(3) + 3600 } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Trop loin', startAt: day(20) } }))
    await okJson(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Filtre', at: day(4) } }))
    const chore = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Vaisselle', rotation: [zoe] } }))
    await okJson(s.fetch('/api/chores', { method: 'PATCH', body: { id: chore.id } }))
    await env.DB.prepare('UPDATE task_participants SET contributed_at = ? WHERE task_id = ?').bind(day(-2) + 3600, chore.id).run()
    const r = await okJson<{ ids: string[] }>(s.fetch('/api/routines', { method: 'POST', body: { memberId: zoe, name: 'Dodo', cards: [{ label: 'Dents' }] } }))
    await okJson(s.fetch('/api/routines', { method: 'PATCH', body: { routineId: r.ids[0], cardIdx: 0 } }))
    await env.DB.prepare('UPDATE routine_runs SET date = ? WHERE routine_id = ?').bind(day(-2), r.ids[0]).run()

    const w = await okJson<Week>(s.fetch('/api/this-week'))
    expect(w.ahead.meals.map((m) => m.title)).toEqual(['Tacos'])
    expect(w.ahead.events.map((e) => e.title)).toEqual(['Dentiste'])
    expect(w.ahead.projects.map((p) => p.title)).toEqual(['Filtre'])
    expect(w.behind.chores.map((c) => c.choreTitle)).toEqual(['Vaisselle'])
    expect(w.behind.routines).toEqual([expect.objectContaining({ name: 'Dodo', who: 'Zoé' })])
    expect(JSON.stringify(w.behind), 'faces, not a tally').not.toMatch(/"(count|total|rank|score)"/)
  })
})

describe('l’année', () => {
  it('holds the year’s fixed points, and leaves a weekly rhythm out', async () => {
    const s = await household('year-points', undefined, { empty: true })
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Anniversaire de mariage', startAt: day(40), recur: { freq: 'yearly' } } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Soccer', startAt: day(1), recur: { freq: 'weekly' } } }))
    await okJson(s.fetch('/api/home-projects', { method: 'POST', body: { title: 'Ramonage', kind: 'upkeep', at: day(60) } }))
    await okJson(s.fetch('/api/trips', { method: 'POST', body: { title: 'Gaspésie', startAt: day(80), endAt: day(85) } }))

    const y = await okJson<{ events: { title: string }[]; tasks: { title: string }[]; trips: { title: string }[] }>(s.fetch(`/api/year?from=${today()}&to=${day(365)}`))
    expect(y.events.map((e) => e.title), 'a practice would repaint every cell').toEqual(['Anniversaire de mariage'])
    // Every dated task is on the year (2026-11-08): here, the one entretien.
    expect(y.tasks.map((u) => u.title)).toEqual(['Ramonage'])
    expect(y.trips.map((t) => t.title)).toEqual(['Gaspésie'])
    expect(await okJson(s.fetch('/api/year')), 'a missing window is an empty horizon').toEqual({ birthdays: [], events: [], tasks: [], life: [], trips: [] })
  })
})

describe('le journal d’IA', () => {
  const log = async (s: Session) => (await okJson<{ errors: { feature: string; message: string }[] }>(s.fetch('/api/ai-errors'))).errors

  it('takes a failure, lists it, and empties when cleared, for this household only', async () => {
    const s = await household('aierrors-a', undefined, { empty: true })
    const other = await household('aierrors-b', undefined, { empty: true })
    await okJson(s.fetch('/api/ai-errors', { method: 'POST', body: { feature: '  recap  ', message: 'x'.repeat(600) } }))
    await okJson(other.fetch('/api/ai-errors', { method: 'POST', body: { feature: 'ask', message: 'ailleurs' } }))
    const [row] = await log(s)
    expect(row?.feature).toBe('recap')
    expect(row?.message).toHaveLength(500)
    expect((await s.fetch('/api/ai-errors', { method: 'POST', body: { feature: 'x' } })).status).toBe(400)

    await okJson(s.fetch('/api/ai-errors', { method: 'DELETE' }))
    expect(await log(s)).toEqual([])
    expect(await log(other)).toHaveLength(1)
  })
})

describe('partager une famille', () => {
  const payload = { self: { firstName: 'Marie', lastName: 'Tremblay', phone: '418 555 0100' }, household: [{ firstName: 'Paul' }], pets: [{ name: 'Rex', ownerIndex: 0 }] }
  const share = (s: Session, body: Record<string, unknown>) => s.fetch('/api/family-share', { method: 'POST', body })

  it('a family is shared, read by a signed-in recipient, teased in public, listed, and revoked', async () => {
    const s = await household('fshare-a', undefined, { empty: true })
    const friend = await household('fshare-b', undefined, { empty: true })
    const made = await okJson<{ id: string; url: string; sharedPeople: number; totalPeople: number }>(share(s, { label: ' Les Tremblay ', payload }))
    expect(made).toMatchObject({ sharedPeople: 2, totalPeople: 2 })
    expect(made.url).toContain(`/cercle/import?s=${made.id}`)

    const read = await okJson<{ label: string; payload: { self: { phone: string } }; sourceName: string }>(friend.fetch(`/api/family-share?s=${made.id}`))
    expect(read.payload.self.phone, 'the full copy is for a signed-in account').toBe('418 555 0100')

    const teaser = await okJson<Record<string, unknown>>(anon(`/api/share-public?s=${made.id}`))
    expect(teaser).toMatchObject({ kind: 'family', peopleCount: 2, petCount: 1 })
    expect(JSON.stringify(teaser), 'third-party details stay behind the door').not.toMatch(/555|Tremblay.*phone|payload/)

    expect((await okJson<{ shares: { id: string }[] }>(s.fetch('/api/family-share'))).shares.map((x) => x.id)).toEqual([made.id])
    expect((await friend.fetch('/api/family-share', { method: 'DELETE', body: { id: made.id } })).status, 'only the sender revokes').toBe(404)

    await okJson(s.fetch('/api/family-share', { method: 'DELETE', body: { id: made.id } }))
    expect((await friend.fetch(`/api/family-share?s=${made.id}`)).status).toBe(404)
    expect((await anon(`/api/share-public?s=${made.id}`)).status).toBe(404)
  })

  it('needs a named person, and only copies photos the sender owns', async () => {
    const s = await household('fshare-photo', undefined, { empty: true })
    const other = await household('fshare-photo-b', undefined, { empty: true })
    expect((await share(s, { payload: { self: {} } })).status).toBe(400)
    const up = (x: Session) => okJson<{ key: string }>(x.fetch('/api/cercle', { method: 'POST', raw: new Uint8Array([1]), headers: { 'content-type': 'image/jpeg' } }))
    const mine = (await up(s)).key
    const theirs = (await up(other)).key
    await okJson(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Marie', photoKey: mine } }))

    const made = await okJson<{ id: string }>(share(s, { payload: { self: { firstName: 'Marie', photoKey: mine }, household: [{ firstName: 'Volé', photoKey: theirs }] } }))
    const { payload: p } = await okJson<{ payload: { self: { photoKey: string | null }; household: { photoKey: string | null }[] } }>(s.fetch(`/api/family-share?s=${made.id}`))
    expect(p.self.photoKey, 'a share-owned copy').toMatch(/^fs_/)
    expect(p.household[0]!.photoKey, 'an arbitrary key cannot be smuggled in').toBeNull()
    expect(await env.PHOTOS!.head(mine), 'the original stays with its contact').not.toBeNull()
  })

  it('a content share reads in full in public; an unknown id is a 404', async () => {
    const s = await household('fshare-recipe', undefined, { empty: true })
    const r = await okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Pâté chinois', ingredients: ['1 lb de boeuf'], steps: ['Cuire'] } }))
    const { id } = await okJson<{ id: string }>(s.fetch('/api/share', { method: 'POST', body: { kind: 'recipe', recipeId: r.id } }))
    const pub = await okJson<{ kind: string; payload: unknown }>(anon(`/api/share-public?s=${id}`))
    expect(pub.kind).toBe('recipe')
    expect(JSON.stringify(pub.payload)).toContain('Pâté chinois')
    expect((await anon('/api/share-public?s=pas-un-id')).status).toBe(404)
    expect((await anon('/api/share-public')).status).toBe(404)
  })
})
