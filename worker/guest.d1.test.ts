import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'
import { addLocalDays, localDayStart } from '../functions/_lib/ids'

// LES LIENS D'INVITÉS against a real D1 and R2: minted by an operator, carried by someone
// with no account, scoped to what the link's kind may see, and killable before their time.
// The postbox is the one link that writes, and everything it writes stays in quarantine
// until the household looks at it.

interface Minted {
  guestToken: string
  guestId: string
  kind: string
  ttlSeconds: number
  expiresAt: number
  targetKey: string | null
  standing: boolean
  label: string | null
}

const mint = (s: Session, body: Record<string, unknown>) => s.fetch('/api/guest/start', { method: 'POST', body })
const link = (s: Session, kind: string, more: Record<string, unknown> = {}) => okJson<Minted>(mint(s, { kind, ...more }))
const as = (token: string, path: string, init?: { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string> }) =>
  anon(path, { ...init, headers: { ...init?.headers, 'X-Device-Token': token } })
const whoami = (token: string) => okJson<{ scope: string; kind: string | null }>(as(token, '/api/guest/whoami'))
const member = async (s: Session, body: Record<string, unknown>) => (await okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body }))).id
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null
const links = async (s: Session) => (await okJson<{ links: { id: string; kind: string; label: string | null; standing: number }[] }>(s.fetch('/api/guest-links'))).links
const png = (token: string, path: string, type = 'image/png') => as(token, path, { method: 'POST', raw: new Uint8Array([1, 2, 3]), headers: { 'content-type': type } })

describe('créer un lien', () => {
  it('names its kind to whoever holds it; an operator has none', async () => {
    const s = await household('guest-who', undefined, { empty: true })
    expect(await okJson(s.fetch('/api/guest/whoami'))).toEqual({ scope: 'operator', kind: null })
    const { guestToken } = await link(s, 'sitter')
    expect(await whoami(guestToken)).toEqual({ scope: 'guest', kind: 'sitter' })
  })

  it('refuses an unknown kind instead of over-sharing, and a durable link needs a name', async () => {
    const s = await household('guest-kind', undefined, { empty: true })
    expect((await mint(s, { kind: 'tout-voir' })).status).toBe(400)
    expect((await mint(s, { kind: 'family', standing: true })).status).toBe(400)
    expect((await mint(s, { kind: 'family', standing: true, label: '  ' })).status).toBe(400)
    expect(await links(s)).toEqual([])
  })

  it('a link is time-boxed to its kind; the retired « intake » name is the postbox; a target binds only where it means something', async () => {
    const s = await household('guest-ttl', undefined, { empty: true })
    const short = await link(s, 'showcase', { ttlSeconds: 1 })
    expect(short.ttlSeconds, 'never below the floor').toBeGreaterThan(1)
    const huge = await link(s, 'showcase', { ttlSeconds: 10 * 365 * 86400 })
    expect(huge.ttlSeconds, 'never past the kind’s ceiling').toBeLessThan(10 * 365 * 86400)
    expect((await link(s, 'intake')).kind).toBe('postbox')
    expect((await link(s, 'welcome', { targetKey: 'member:x' })).targetKey).toBeNull()
    expect((await link(s, 'sitter', { targetKey: 'member:x' })).targetKey).toBe('member:x')
  })

  it('a durable link is listed under its name and dies with its row', async () => {
    const s = await household('guest-standing', undefined, { empty: true })
    const durable = await link(s, 'family', { standing: true, label: '  Mamie  ' })
    expect(durable).toMatchObject({ standing: true, label: 'Mamie' })
    expect(await links(s)).toEqual([expect.objectContaining({ id: durable.guestId, label: 'Mamie', standing: 1, kind: 'family' })])
    expect((await whoami(durable.guestToken)).kind).toBe('family')

    await okJson(s.fetch('/api/guest-links', { method: 'POST', body: { revokeId: durable.guestId } }))
    expect(await links(s), 'a revoked link leaves the list').toEqual([])
    expect((await as(durable.guestToken, '/api/guest/whoami')).status, 'and stops working at once').toBe(401)
  })

  it('a stranger cannot revoke my link, and the list is mine alone', async () => {
    const s = await household('guest-a', undefined, { empty: true })
    const other = await household('guest-b', undefined, { empty: true })
    const { guestId, guestToken } = await link(s, 'welcome')
    await okJson(other.fetch('/api/guest-links', { method: 'POST', body: { revokeId: guestId } }))
    expect((await whoami(guestToken)).kind).toBe('welcome')
    expect(await links(other)).toEqual([])
    expect((await s.fetch('/api/guest-links', { method: 'POST', body: {} })).status).toBe(400)
  })
})

describe('ce qu’un lien voit', () => {
  it('a guest cannot mint a link, or reach anything past its window', async () => {
    const s = await household('guest-scope', undefined, { empty: true })
    const { guestToken } = await link(s, 'sitter')
    for (const path of ['/api/board', '/api/cercle', '/api/list', '/api/transfers', '/api/guest-links']) {
      expect((await as(guestToken, path)).status, path).toBe(403)
    }
    expect((await as(guestToken, '/api/guest/start', { method: 'POST', body: { kind: 'showcase' } })).status).toBe(403)
  })

  it('the visitor card is only the visitor card', async () => {
    const s = await household('window-welcome', undefined, { empty: true })
    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { wifiSsid: 'Chalet', wifiPassword: 'sapin123', houseRules: 'On enlève ses bottes', binDay: 'mardi' } }))
    await member(s, { name: 'Zoé', isChild: true, notes: 'Allergie aux noix' })
    const { guestToken } = await link(s, 'welcome')
    const w = await okJson<Record<string, unknown>>(as(guestToken, '/api/guest/window'))
    expect(w).toMatchObject({ kind: 'welcome', wifi: { ssid: 'Chalet', password: 'sapin123' }, houseRules: 'On enlève ses bottes', binDay: 'mardi' })
    expect(JSON.stringify(w), 'no people, no agenda').not.toContain('Allergie')
    expect(Object.keys(w)).not.toContain('toKnow')
  })

  it('the sitter gets tonight’s handoff: the plan, bedtime, allergies, emergencies, the house map, and a parent', async () => {
    const s = await household('window-sitter', undefined, { empty: true })
    const today = localDayStart(new Date())
    const zoe = await member(s, { name: 'Zoé', isChild: true, notes: 'Allergie aux noix' })
    const marc = await member(s, { name: 'Marc', phone: '418 555 0101' })
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Soccer', startAt: today + 18 * 3600, memberId: zoe } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Demain', startAt: addLocalDays(today, 1) + 3600 } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: today, title: 'Pâtes', slot: 'supper' } }))
    await okJson(s.fetch('/api/routines', { method: 'POST', body: { memberId: zoe, name: 'Dodo', timeOfDay: 'evening', cards: [{ label: 'Dents', icon: '🪥' }] } }))
    await okJson(s.fetch('/api/routines', { method: 'POST', body: { memberId: zoe, name: 'Matin', timeOfDay: 'morning', cards: [] } }))
    await okJson(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Tante', lastName: 'Rose', phone: '418 555 0199', tags: ['Urgence'] } }))
    await okJson(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Voisin', phone: '418 555 0100', tags: [] } }))
    const home = await okJson<{ id: string }>(s.fetch('/api/carnets', { method: 'POST', body: { name: 'Maison', kind: 'home' } }))
    await okJson(s.fetch('/api/home-pins', { method: 'POST', body: { carnetId: home.id, label: 'Valve d’eau', detail: 'sous l’escalier' } }))

    const { guestToken } = await link(s, 'sitter', { targetKey: `member:${marc}` })
    const w = await okJson<{
      today: { events: { title: string; who: string | null }[]; meals: { title: string }[] }
      bedtimeRoutines: { name: string; who: string; cards: { label: string }[] }[]
      toKnow: { name: string; notes: string }[]
      emergency: { name: string; phone: string }[]
      pins: { label: string; home: string }[]
      reachParent: { name: string; phone: string } | null
    }>(as(guestToken, '/api/guest/window'))

    expect(w.today.events, 'today, not tomorrow').toEqual([expect.objectContaining({ title: 'Soccer', who: 'Zoé' })])
    expect(w.today.meals.map((m) => m.title)).toEqual(['Pâtes'])
    expect(w.bedtimeRoutines).toEqual([expect.objectContaining({ name: 'Dodo', who: 'Zoé', cards: [expect.objectContaining({ label: 'Dents' })] })])
    expect(w.toKnow).toEqual([expect.objectContaining({ name: 'Zoé', notes: 'Allergie aux noix' })])
    expect(w.emergency, 'only who the household tagged').toEqual([{ name: 'Tante Rose', phone: '418 555 0199' }])
    expect(w.pins).toEqual([expect.objectContaining({ label: 'Valve d’eau', home: 'Maison' })])
    expect(w.reachParent).toEqual({ name: 'Marc', phone: '418 555 0101' })

    const noTarget = await link(s, 'sitter')
    expect((await okJson<{ reachParent: unknown }>(as(noTarget.guestToken, '/api/guest/window'))).reachParent, 'opt-in').toBeNull()
  })

  it('the grandparents’ window shows the grandkids’ dates and birthdays, and no wifi', async () => {
    const s = await household('window-family', undefined, { empty: true })
    await okJson(s.fetch('/api/household', { method: 'PATCH', body: { wifiPassword: 'sapin123' } }))
    const today = localDayStart(new Date())
    const zoe = await member(s, { name: 'Zoé', isChild: true })
    const marc = await member(s, { name: 'Marc' })
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Spectacle', startAt: addLocalDays(today, 3) + 3600, memberId: zoe } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Dentiste de Marc', startAt: addLocalDays(today, 3) + 3600, memberId: marc } }))

    const { guestToken } = await link(s, 'family')
    const w = await okJson<{ upcoming: { title: string; who: string }[]; birthdays: unknown[]; photos: string[] }>(as(guestToken, '/api/guest/window'))
    expect(w.upcoming, 'only the grandkids').toEqual([expect.objectContaining({ title: 'Spectacle', who: 'Zoé' })])
    expect(JSON.stringify(w)).not.toContain('sapin123')
  })

  it('a showcase link reads the hub, not the money or the house map, and writes nothing', async () => {
    const s = await household('guest-showcase', undefined, { empty: true })
    await okJson(s.fetch('/api/list', { method: 'POST', body: { text: 'Lait' } }))
    const { guestToken } = await link(s, 'showcase')
    expect(await (await as(guestToken, '/api/board')).text()).toContain('Lait')
    for (const path of ['/api/transfers', '/api/home-pins', '/api/care-log']) expect((await as(guestToken, path)).status, path).toBe(403)
    expect((await as(guestToken, '/api/list', { method: 'POST', body: { text: 'Intrus' } })).status).toBe(403)
    expect((await as(guestToken, '/api/guest/window')).status, 'it uses the real hub, not this').toBe(403)
    expect(await (await s.fetch('/api/board')).text()).not.toContain('Intrus')
  })
})

describe('la boîte aux lettres', () => {
  const box = (s: Session) => link(s, 'postbox')
  const send = (token: string, body: Record<string, unknown>) => as(token, '/api/guest/postbox-submit', { method: 'POST', body })
  const pending = async (s: Session) => (await okJson<{ messages: { id: string; senderName: string; text: string; mediaKind: string | null; mediaKey: string | null; sceneKey: string | null }[] }>(s.fetch('/api/postbox'))).messages
  const review = (s: Session, id: string, status: string) => s.fetch('/api/postbox', { method: 'PATCH', body: { id, status } })
  const fridge = async (s: Session) => (await env.DB.prepare('SELECT text, member_id, media_kind, media_key, author_label FROM notes WHERE household_id = ?').bind(s.householdId).all<{ text: string; member_id: string | null; media_kind: string | null; media_key: string | null; author_label: string | null }>()).results

  it('a word lands in quarantine, reaches the board only when accepted, and the sender sees it was received', async () => {
    const s = await household('postbox-accept', undefined, { empty: true })
    const { guestToken } = await box(s)
    await okJson(send(guestToken, { senderName: '  Mamie  ', text: '  Bon voyage !  ' }))
    expect(await fridge(s), 'quarantined: nothing on the board yet').toEqual([])
    const m = (await pending(s))[0]!
    expect(m).toMatchObject({ senderName: 'Mamie', text: 'Bon voyage !', mediaKind: null })

    await okJson(review(s, m.id, 'accepted'))
    expect(await fridge(s)).toEqual([expect.objectContaining({ text: 'Bon voyage !', author_label: 'Mamie', member_id: null })])
    expect(await pending(s)).toEqual([])
    await okJson(review(s, m.id, 'accepted'))
    expect(await fridge(s), 'a double review is one note').toHaveLength(1)

    const w = await okJson<{ receipt: { snippet: string } | null }>(as(guestToken, '/api/guest/window'))
    expect(w.receipt?.snippet).toBe('Bon voyage !')
  })

  it('the note tints to a member only on an exact name match, never to who reviewed it', async () => {
    const s = await household('postbox-tint', undefined, { empty: true })
    const lea = await member(s, { name: 'Léa' })
    const { guestToken } = await box(s)
    await okJson(send(guestToken, { senderName: 'léa', text: 'Salut' }))
    await okJson(send(guestToken, { senderName: 'Léa-Marie', text: 'Allô' }))
    for (const m of await pending(s)) await okJson(s.fetch('/api/postbox', { method: 'PATCH', body: { id: m.id, status: 'accepted' }, headers: { 'X-Profile': lea } }))
    const notes = await fridge(s)
    expect(notes.find((n) => n.text === 'Salut')!.member_id).toBe(lea)
    expect(notes.find((n) => n.text === 'Allô')!.member_id, 'the reviewer’s face never tints it').toBeNull()
  })

  it('a dismissal frees the blobs and writes nothing; an acceptance hands them to the note', async () => {
    const s = await household('postbox-media', undefined, { empty: true })
    const { guestToken } = await box(s)
    const drawing = await okJson<{ key: string; kind: string }>(png(guestToken, '/api/guest/postbox-media'))
    const scene = await okJson<{ key: string; kind: string }>(png(guestToken, '/api/guest/postbox-media', 'application/json'))
    expect([drawing.kind, scene.kind]).toEqual(['drawing', 'scene'])
    expect(drawing.key).toMatch(/^pm_/)
    expect(scene.key).toMatch(/^ps_/)
    await okJson(send(guestToken, { senderName: 'Mamie', media_kind: 'drawing', media_key: drawing.key, scene_key: scene.key }))
    const [first] = await pending(s)
    expect(first).toMatchObject({ mediaKind: 'drawing', mediaKey: drawing.key, sceneKey: scene.key })
    await okJson(review(s, first!.id, 'dismissed'))
    expect(await stored(drawing.key)).toBe(false)
    expect(await stored(scene.key)).toBe(false)
    expect(await fridge(s)).toEqual([])

    const clip = await okJson<{ key: string }>(png(guestToken, '/api/guest/postbox-media', 'audio/webm'))
    await okJson(send(guestToken, { senderName: 'Mamie', media_kind: 'audio', media_key: clip.key }))
    await okJson(review(s, (await pending(s))[0]!.id, 'accepted'))
    expect((await fridge(s))[0]).toMatchObject({ media_kind: 'audio', media_key: clip.key })
    expect(await stored(clip.key), 'the note owns it now').toBe(true)
  })

  it('needs a name and a message; a key this link did not stage is dropped, whose ever it is', async () => {
    const s = await household('postbox-refuse', undefined, { empty: true })
    const { guestToken } = await box(s)
    const other = await box(s)
    expect((await send(guestToken, { text: 'Anonyme' })).status).toBe(400)
    expect((await send(guestToken, { senderName: 'Mamie', text: ' ' })).status).toBe(400)
    expect(await pending(s)).toEqual([])

    const elsewhere = await okJson<{ key: string }>(png(other.guestToken, '/api/guest/postbox-media'))
    expect((await send(guestToken, { senderName: 'Mamie', media_kind: 'image', media_key: elsewhere.key })).status, 'with no words left, it is an empty message').toBe(400)
    await okJson(send(guestToken, { senderName: 'Mamie', text: 'Avec des mots', media_kind: 'image', media_key: elsewhere.key }))
    expect((await pending(s))[0], 'the words go through, the guessed key does not').toMatchObject({ text: 'Avec des mots', mediaKind: null, mediaKey: null })
  })

  it('the box writes only to itself: another kind cannot post, and the box reads nothing else', async () => {
    const s = await household('postbox-kind', undefined, { empty: true })
    const sitter = await link(s, 'sitter')
    const { guestToken } = await box(s)
    expect((await send(sitter.guestToken, { senderName: 'X', text: 'Y' })).status).toBe(403)
    expect((await as(guestToken, '/api/board')).status).toBe(403)
    expect((await as(guestToken, '/api/list', { method: 'POST', body: { text: 'x' } })).status).toBe(403)
    expect((await s.fetch('/api/guest/postbox-submit', { method: 'POST', body: { senderName: 'X', text: 'Y' } })).status, 'not even an operator').toBe(403)
  })

  it('a message goes to the household that issued the link, whatever the body says', async () => {
    const s = await household('postbox-a', undefined, { empty: true })
    const other = await household('postbox-b', undefined, { empty: true })
    const { guestToken } = await box(s)
    await okJson(send(guestToken, { senderName: 'Mamie', text: 'Pour vous', household_id: other.householdId, householdId: other.householdId }))
    expect(await pending(other)).toEqual([])
    expect(await pending(s)).toHaveLength(1)
  })
})

describe('la fiche', () => {
  const box = (s: Session, more: Record<string, unknown> = {}) => link(s, 'postbox', more)
  const submit = (token: string, body: Record<string, unknown>) => as(token, '/api/guest/intake-submit', { method: 'POST', body })
  type Sub = { id: string; self: { firstName: string; email: string; birthday: string | null; photoKey: string | null }; household: unknown[]; pets: { name: string; photoKey: string | null }[]; targetKey: string | null }
  const queue = async (s: Session) => (await okJson<{ submissions: Sub[] }>(s.fetch('/api/intake'))).submissions
  const review = (s: Session, id: string, status: string) => s.fetch('/api/intake', { method: 'PATCH', body: { id, status } })

  it('greets the addressed person by first name and returns nothing else about them', async () => {
    const s = await household('intake-greet', undefined, { empty: true })
    const c = await okJson<{ id: string }>(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Marie', lastName: 'Tremblay', birthday: '1950-02-03', phone: '418 555 0100' } }))
    const { guestToken } = await box(s, { targetKey: `contact:${c.id}` })
    const w = await okJson<Record<string, unknown>>(as(guestToken, '/api/guest/window'))
    expect(w).toMatchObject({ kind: 'postbox', targetName: 'Marie' })
    expect(JSON.stringify(w), 'a write surface, not a read one').not.toMatch(/1950|555|Tremblay/)
  })

  it('a form lands pending, touches no live table, and clears when reviewed', async () => {
    const s = await household('intake-flow', undefined, { empty: true })
    const c = await okJson<{ id: string }>(s.fetch('/api/cercle', { method: 'POST', body: { firstName: 'Marie' } }))
    const { guestToken } = await box(s, { targetKey: `contact:${c.id}` })
    await okJson(submit(guestToken, { self: { firstName: '  Marie  ', email: 'marie@exemple.test', birthday: '1950-02-03' }, household: [{ firstName: 'Paul' }], pets: [{ name: 'Rex', species: 'chien', ownerIndex: 0 }] }))

    const sub = (await queue(s))[0]!
    expect(sub?.self).toMatchObject({ firstName: 'Marie', email: 'marie@exemple.test', birthday: '1950-02-03' })
    expect(sub?.household).toHaveLength(1)
    expect(sub.targetKey, 'from the signed token').toBe(`contact:${c.id}`)
    const { contacts } = await okJson<{ contacts: { firstName: string; email: string | null }[] }>(s.fetch('/api/cercle'))
    expect(contacts, 'quarantined: the live directory is untouched').toEqual([expect.objectContaining({ firstName: 'Marie', email: null })])

    await okJson(review(s, sub.id, 'merged'))
    expect(await queue(s)).toEqual([])
    expect((await s.fetch('/api/intake', { method: 'PATCH', body: { id: sub.id, status: 'peut-être' } })).status).toBe(400)
  })

  it('the link’s field scope is enforced on the server: a name-only form cannot smuggle the rest', async () => {
    const s = await household('intake-scope', undefined, { empty: true })
    const { guestToken } = await box(s, { fields: 0 })
    await okJson(submit(guestToken, { self: { firstName: 'Marie', email: 'marie@exemple.test', birthday: '1950-02-03' }, household: [{ firstName: 'Paul' }], pets: [{ name: 'Rex', ownerIndex: 0 }] }))
    const sub = (await queue(s))[0]!
    expect(sub?.self).toMatchObject({ firstName: 'Marie', email: '', birthday: null })
    expect(sub.household).toEqual([])
    expect(sub.pets).toEqual([])
  })

  it('needs a first name, and a photo this link did not stage is redacted, the form still lands', async () => {
    const s = await household('intake-photo', undefined, { empty: true })
    const { guestToken } = await box(s)
    expect((await submit(guestToken, { self: { lastName: 'Sans prénom' } })).status).toBe(400)
    await okJson(submit(guestToken, { self: { firstName: 'Marie', photoKey: 'av_quelquun-dautre' } }))
    expect((await queue(s))[0]!.self.photoKey).toBeNull()
  })

  it('a dismissed form frees its staged photo; a merged one leaves it to the contact', async () => {
    const s = await household('intake-blobs', undefined, { empty: true })
    const { guestToken } = await box(s)
    const up = async () => (await okJson<{ key: string }>(png(guestToken, '/api/guest/intake-media'))).key
    const kept = await up()
    const freed = await up()
    expect(kept).toMatch(/^ik_/)
    expect((await png(guestToken, '/api/guest/intake-media', 'audio/webm')).status, 'a photo door').toBe(400)

    await okJson(submit(guestToken, { self: { firstName: 'Garde', photoKey: kept } }))
    await okJson(submit(guestToken, { self: { firstName: 'Libère', photoKey: freed } }))
    const subs = await queue(s)
    await okJson(review(s, subs.find((x) => x.self.firstName === 'Garde')!.id, 'merged'))
    await okJson(review(s, subs.find((x) => x.self.firstName === 'Libère')!.id, 'dismissed'))
    expect(await stored(kept)).toBe(true)
    expect(await stored(freed)).toBe(false)
  })

  it('an abandoned upload is swept once it is past a link’s life, and a pending form’s photo is not', async () => {
    const s = await household('intake-sweep', undefined, { empty: true })
    const { guestToken } = await box(s)
    const abandoned = (await okJson<{ key: string }>(png(guestToken, '/api/guest/intake-media'))).key
    const inForm = (await okJson<{ key: string }>(png(guestToken, '/api/guest/intake-media'))).key
    await okJson(submit(guestToken, { self: { firstName: 'Marie', photoKey: inForm } }))

    await queue(s)
    expect(await stored(abandoned), 'too young to sweep: the form may still be open').toBe(true)
    await env.DB.prepare('UPDATE staged_media SET created_at = created_at - ? WHERE household_id = ?').bind(8 * 86400, s.householdId).run()
    await queue(s)
    expect(await stored(abandoned)).toBe(false)
    expect(await stored(inForm), 'still referenced by a pending form').toBe(true)
  })
})
