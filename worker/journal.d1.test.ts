import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household } from '../functions/test/d1'
import { ingestJournalMail, handleJournalMail } from '../functions/_lib/journalIngest'
import { inboxIdFromAddress, resolveJournalInbox } from '../functions/_lib/journalInbox'

// « Mon journal » against the REAL Worker and a REAL D1 (migration 0146).
//
// The pure half is covered in functions/_lib/journalMail.test.ts. What only a real
// runtime can answer is the half that touches the database: does the address mint and
// rotate through the route table and authed(); does `member_id IS ?` actually match the
// Maisonnée's NULL row (it is the kind of thing that silently matches nothing and mints
// a duplicate on every read); does the partial unique index hold; and does an arriving
// mail become a note the household can really see.
//
// The `email()` handler itself is NOT driven here — it owns a Cloudflare EmailMessage,
// which is exactly why every decision was pushed down into `handleJournalMail`. That
// function is the seam, and it is what this file exercises.

interface Inbox {
  address: string | null
  enabled: boolean
}
type H = Awaited<ReturnType<typeof household>>

const read = async (s: H, profile?: string) =>
  (await (await s.fetch('/api/journal-inbox', profile ? { headers: { 'X-Profile': profile } } : {})).json()) as Inbox

const mint = async (s: H, body: Record<string, unknown> = {}, profile?: string) =>
  (await (
    await s.fetch('/api/journal-inbox', {
      method: 'POST',
      body,
      ...(profile ? { headers: { 'X-Profile': profile } } : {}),
    })
  ).json()) as Inbox

const members = async (s: H) =>
  ((await (await s.fetch('/api/cercle')).json()) as { members: { id: string; name: string }[] }).members

const notes = async (s: H) =>
  ((await (await s.fetch('/api/family-notes')).json()) as {
    notes: { id: string; title: string; text: string; member_id: string | null; created_at: number }[]
  }).notes

describe('« Mon journal » — l’adresse', () => {
  it('starts with no address, and minting is an explicit action', async () => {
    const a = await household('jrnl-mint', undefined, { empty: true })

    // A read must not mint. Opening the Réglages card out of curiosity should not
    // create a credential — that is the whole reason POST exists separately.
    const before = await read(a)
    expect(before.enabled).toBe(true)
    expect(before.address).toBeNull()

    const made = await mint(a)
    expect(made.address).toMatch(/^jrnl-[a-z0-9]{16}@jrnl\.d1\.test$/)

    // And it is stable: a second read returns the same one, a second POST does not
    // mint a rival. This is the `member_id IS ?` case — with `= ?` the SELECT would
    // match nothing and every call would try to INSERT again.
    expect((await read(a)).address).toBe(made.address)
    expect((await mint(a)).address).toBe(made.address)
  })

  it('fits inside the 64-character local-part bound', async () => {
    // The reason 0146 is a table and not a signed token. If this ever fails, the
    // address has stopped being deliverable.
    const a = await household('jrnl-len', undefined, { empty: true })
    const { address } = await mint(a)
    expect((address ?? '').split('@')[0].length).toBeLessThanOrEqual(64)
  })

  it('gives each face its own address, and the Maisonnée its own', async () => {
    const a = await household('jrnl-faces', undefined, { empty: true })
    const maisonnee = (await mint(a)).address
    const mine = (await mint(a, {}, 'member-jrnl-1')).address
    const theirs = (await mint(a, {}, 'member-jrnl-2')).address

    expect(maisonnee).toBeTruthy()
    expect(new Set([maisonnee, mine, theirs]).size).toBe(3)
    // Each face reads back its own, not the last one minted.
    expect((await read(a, 'member-jrnl-1')).address).toBe(mine)
    expect((await read(a)).address).toBe(maisonnee)
  })

  it('rotating kills the old address on the spot', async () => {
    const a = await household('jrnl-rot', undefined, { empty: true })
    const old = (await mint(a)).address
    const next = (await mint(a, { rotate: true })).address
    expect(next).not.toBe(old)

    // The revoked row is KEPT, so a mail still arriving at the retired address
    // resolves to nothing rather than to whoever is minted next.
    expect(await resolveJournalInbox(env, old!)).toBeNull()
    expect((await resolveJournalInbox(env, next!))?.householdId).toBe(a.householdId)
  })

  it('refuses a stranger and a guest', async () => {
    const res = await anon('/api/journal-inbox')
    expect(res.status).toBe(401)
  })
})

describe('« Mon journal » — une page qui arrive', () => {
  it('files a mailed page as a dated, searchable note', async () => {
    // A SEEDED household, because family_notes.member_id carries a real FK to
    // members(id): the scoping this asserts only means anything against a face that
    // actually exists.
    const a = await household('jrnl-in')
    const me = (await members(a))[0]
    const { address } = await mint(a, {}, me.id)

    const written = 'Tue, 28 Oct 2025 21:14:00 -0400'
    const result = await handleJournalMail(
      env,
      address!,
      {
        subject: 'Lundi',
        // The Supernote shape: the fr_CA recognition rides as a TXT attachment.
        attachments: [{ filename: 'Lundi.txt', mimeType: 'text/plain', content: 'Il a neigé toute la nuit.' }],
        date: written,
      },
      resolveJournalInbox,
    )
    expect(result.ok).toBe(true)

    // Found by title: a seeded household already has notes of its own, and the point
    // here is that the mailed page JOINS them rather than that it is alone.
    const note = (await notes(a)).find((n) => n.title === 'Lundi')!
    expect(note).toBeTruthy()
    expect(note.text).toBe('Il a neigé toute la nuit.')
    // Scoped to the face whose address it arrived at — so it shows in THAT journal.
    expect(note.member_id).toBe(me.id)
    // And dated the day it was WRITTEN, not the day it synced. This is the whole
    // point of the feature: a journal is read by date.
    expect(note.created_at).toBe(Math.floor(Date.parse(written) / 1000))
  })

  it('drops a mail to an address nobody owns, without saying so', async () => {
    const a = await household('jrnl-unknown', undefined, { empty: true })
    const r = await handleJournalMail(
      env,
      'jrnl-aaaaaaaaaaaaaaaa@jrnl.d1.test',
      { subject: 'Bonjour', text: 'x' },
      resolveJournalInbox,
    )
    expect(r).toEqual({ ok: false, reason: 'unknown-inbox' })
    expect(await notes(a)).toHaveLength(0)
  })

  it('files nothing for a blank mail', async () => {
    const a = await household('jrnl-blank', undefined, { empty: true })
    const { address } = await mint(a)
    const inbox = (await resolveJournalInbox(env, address!))!
    expect(await ingestJournalMail(env, inbox, { subject: '  ', text: '\n ' })).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(await notes(a)).toHaveLength(0)
  })

  it('still files the page when the face is GONE — never loses it to a dead ref', async () => {
    // The bug this file found. journal_inboxes.member_id is a soft ref, but
    // family_notes.member_id has a real FK, so an address minted for a face that was
    // later removed from the Maisonnée made the INSERT fail the constraint — and the
    // caller is a fire-and-forget mail handler, so every page after that vanished
    // silently. It now falls back to the Maisonnée instead of dropping the entry.
    const a = await household('jrnl-ghost', undefined, { empty: true })
    const { address } = await mint(a, {}, 'member-who-was-deleted')

    const r = await handleJournalMail(
      env,
      address!,
      { subject: 'Écrit quand même', text: 'ma page' },
      resolveJournalInbox,
    )
    expect(r.ok).toBe(true)

    const [note] = await notes(a)
    expect(note.title).toBe('Écrit quand même')
    // Filed to the Maisonnée rather than lost. Moving it costs one gesture; a page
    // that never arrived cannot be recovered.
    expect(note.member_id).toBeNull()
  })

  it('never crosses households', async () => {
    // The address is the only thing identifying the household, so this is the one
    // that matters most: a mail to A's address must never land in B.
    const a = await household('jrnl-iso-a', undefined, { empty: true })
    const b = await household('jrnl-iso-b', undefined, { empty: true })
    const { address } = await mint(a)

    await handleJournalMail(env, address!, { subject: 'À moi', text: 'privé' }, resolveJournalInbox)
    expect((await notes(a)).map((n) => n.title)).toEqual(['À moi'])
    expect(await notes(b)).toHaveLength(0)
  })

  it('bounds a flood — a leaked address cannot fill D1 overnight', async () => {
    const a = await household('jrnl-cap', undefined, { empty: true })
    const { address } = await mint(a)
    const inbox = (await resolveJournalInbox(env, address!))!

    // PER_DAY is 60; walk past it and the door closes rather than keeps writing.
    let capped = 0
    for (let i = 0; i < 64; i++) {
      const r = await ingestJournalMail(env, inbox, { subject: `n${i}`, text: 'x' })
      if (!r.ok && r.reason === 'capped') capped++
    }
    expect(capped).toBeGreaterThan(0)
    expect((await notes(a)).length).toBeLessThanOrEqual(60)
  })
})

describe('inboxIdFromAddress', () => {
  it('survives a server lowercasing the local part in transit', () => {
    // The reason the ids are generated from a lowercase alphabet (0146).
    expect(inboxIdFromAddress('JRNL-ABC23456789XYZMN@Example.COM')).toBe('abc23456789xyzmn')
  })

  it('rejects anything that is not one of our addresses', () => {
    expect(inboxIdFromAddress('hello@example.com')).toBeNull()
    expect(inboxIdFromAddress('jrnl-@example.com')).toBeNull()
    expect(inboxIdFromAddress('jrnl-short@example.com')).toBeNull()
    expect(inboxIdFromAddress('jrnl-has.a.dot.in.it@example.com')).toBeNull()
    expect(inboxIdFromAddress(null)).toBeNull()
  })
})
