import { describe, it, expect } from 'vitest'
import {
  cleanSubject,
  entryTime,
  htmlToText,
  journalEntryFromMail,
  JOURNAL_TEXT_CAP,
  JOURNAL_TITLE_CAP,
} from './journalMail'

// « Mon journal » — the mail→entry mapping (plans/JOURNAL-EWRITER.md).
//
// This is the whole reason journalMail.ts is a pure function: Wrangler cannot run an
// Email Worker locally, so without these cases the first time the mapping ran would be
// against Marc's real inbox, on a device he had just paid C$910 for.
//
// The cases below are written from what the DEVICES actually send, not from what would
// be convenient: Supernote exports PDF/DOCX/TXT and mails it from its own mail app
// (hence a .txt attachment carrying the fr_CA recognition), a phone sends a typed body
// with no attachment, and relays stack « Tr: Re: » on the subject.

const NOW = 1_762_000_000 // ~2025-11

describe('cleanSubject', () => {
  it('strips one prefix', () => {
    expect(cleanSubject('Re: Lundi')).toBe('Lundi')
  })

  it('strips STACKED prefixes, including the French Tr:', () => {
    // A forward of a reply is the normal shape once a relay is involved, and « Tr: »
    // is what a French Thunderbird/Outlook writes.
    expect(cleanSubject('Tr: Re: Fwd: Lundi matin')).toBe('Lundi matin')
  })

  it('collapses whitespace and trims', () => {
    expect(cleanSubject('  Lundi   matin \n')).toBe('Lundi matin')
  })

  it('leaves a colon that is part of the real subject', () => {
    expect(cleanSubject('Jour 3 : la neige')).toBe('Jour 3 : la neige')
  })

  it('is empty for nothing', () => {
    expect(cleanSubject(null)).toBe('')
    expect(cleanSubject('   ')).toBe('')
  })
})

describe('entryTime', () => {
  it('uses the Date header — the day the entry was WRITTEN', () => {
    const at = entryTime('Tue, 28 Oct 2025 21:14:00 -0400', NOW)
    expect(at).toBe(Math.floor(Date.parse('Tue, 28 Oct 2025 21:14:00 -0400') / 1000))
    expect(at).not.toBe(NOW)
  })

  it('falls back to arrival when there is no header or it is unparseable', () => {
    expect(entryTime(null, NOW)).toBe(NOW)
    expect(entryTime('pas une date', NOW)).toBe(NOW)
  })

  it('refuses a FUTURE date — an entry filed in 2043 is lost, not saved', () => {
    // The real case this is written for: an e-writer whose clock was never set.
    expect(entryTime('Sat, 01 Jan 2050 00:00:00 +0000', NOW)).toBe(NOW)
  })

  it('allows a day of future slack, for time zones', () => {
    const soon = new Date((NOW + 3600) * 1000).toUTCString()
    expect(entryTime(soon, NOW)).toBe(NOW + 3600)
  })

  it('refuses an epoch-zero date, which would bury the entry below everything', () => {
    expect(entryTime('Thu, 01 Jan 1970 00:00:00 +0000', NOW)).toBe(NOW)
  })

  it('accepts a fortnight-old page — you mail a notebook late', () => {
    const past = new Date((NOW - 14 * 86400) * 1000).toUTCString()
    expect(entryTime(past, NOW)).toBe(NOW - 14 * 86400)
  })
})

describe('htmlToText', () => {
  it('flattens blocks to newlines and drops tags', () => {
    expect(htmlToText('<p>Un</p><p>Deux</p>')).toBe('Un\nDeux')
  })

  it('decodes the entities that show up in French prose', () => {
    expect(htmlToText('<p>C&#39;est l&amp;#xA0;...</p>')).toContain("C'est")
    expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b')
  })

  it('drops script and style bodies entirely', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Un</p>')).toBe('Un')
  })
})

describe('journalEntryFromMail', () => {
  it('prefers the .txt ATTACHMENT — that is the device fr_CA recognition', () => {
    // The Supernote shape: the converted text rides as a TXT attachment, and the mail
    // body is whatever the device's mail app put there. The attachment must win.
    const e = journalEntryFromMail(
      {
        subject: 'Lundi',
        text: 'Envoyé depuis mon Supernote',
        attachments: [{ filename: 'Lundi.txt', mimeType: 'text/plain', content: 'Il a neigé toute la nuit.' }],
        date: null,
      },
      NOW,
    )
    expect(e?.text).toBe('Il a neigé toute la nuit.')
    expect(e?.title).toBe('Lundi')
  })

  it('recognises a .txt by FILENAME when the type is octet-stream', () => {
    const e = journalEntryFromMail(
      {
        subject: 'Mardi',
        attachments: [{ filename: 'page.txt', mimeType: 'application/octet-stream', content: 'Deux lignes.' }],
      },
      NOW,
    )
    expect(e?.text).toBe('Deux lignes.')
  })

  it('decodes an attachment that arrives as bytes', () => {
    const bytes = new TextEncoder().encode('Écrit à la main.')
    const e = journalEntryFromMail(
      { subject: 'Jeudi', attachments: [{ filename: 'a.txt', mimeType: 'text/plain', content: bytes }] },
      NOW,
    )
    // The accents are the point: a mis-decoded attachment is how « é » becomes « Ã© ».
    expect(e?.text).toBe('Écrit à la main.')
  })

  it('falls back to the plain-text body — a note typed on a phone', () => {
    const e = journalEntryFromMail({ subject: 'Test', text: 'Depuis le téléphone.' }, NOW)
    expect(e?.text).toBe('Depuis le téléphone.')
  })

  it('falls back to the HTML part when there is no plain text at all', () => {
    const e = journalEntryFromMail({ subject: 'Test', html: '<p>Un</p><p>Deux</p>' }, NOW)
    expect(e?.text).toBe('Un\nDeux')
  })

  it('names itself after its FIRST LINE when the subject is empty', () => {
    // A device that mails its export with no subject. A paper journal does the same.
    const e = journalEntryFromMail({ subject: '', text: 'Jour 1\n\nIl faisait doux.' }, NOW)
    expect(e?.title).toBe('Jour 1')
    expect(e?.text).toBe('Jour 1\n\nIl faisait doux.')
  })

  it('skips blank leading lines when borrowing a title', () => {
    const e = journalEntryFromMail({ text: '\n\n   \nJour 2\nsuite' }, NOW)
    expect(e?.title).toBe('Jour 2')
  })

  it('returns NULL for an empty mail rather than filing a blank note', () => {
    // A blank row in « Les notes » is noise the household has to clean up.
    expect(journalEntryFromMail({}, NOW)).toBeNull()
    expect(journalEntryFromMail({ subject: '   ', text: '  \n ' }, NOW)).toBeNull()
    expect(journalEntryFromMail({ subject: 'Re:  ', text: '' }, NOW)).toBeNull()
  })

  it('keeps a mail that has a subject but no body', () => {
    // One line written on the device and sent as a subject is still an entry.
    const e = journalEntryFromMail({ subject: 'Rien à signaler' }, NOW)
    expect(e?.title).toBe('Rien à signaler')
    expect(e?.text).toBe('')
  })

  it('does NOT strip a signature or quoted history', () => {
    // Marc's standing rule (CLAUDE.md, the recipe importer's): extra text is cheap to
    // delete, missing text is expensive to notice. So the footer stays.
    const e = journalEntryFromMail({ subject: 'x', text: 'Mon entrée.\n\n--\nEnvoyé depuis mon Supernote' }, NOW)
    expect(e?.text).toContain('Envoyé depuis mon Supernote')
  })

  it('normalises CRLF and collapses runs of blank lines', () => {
    const e = journalEntryFromMail({ subject: 'x', text: 'Un\r\n\r\n\r\n\r\nDeux' }, NOW)
    expect(e?.text).toBe('Un\n\nDeux')
  })

  it('MARKS the cut when an entry is longer than the cap', () => {
    // Never drop words silently: a visible marker turns a lost paragraph into an
    // obvious one.
    const long = 'a'.repeat(JOURNAL_TEXT_CAP + 500)
    const e = journalEntryFromMail({ subject: 'x', text: long }, NOW)
    expect(e?.text.length).toBe(JOURNAL_TEXT_CAP)
    expect(e?.text.endsWith('[…]')).toBe(true)
  })

  it('caps a long title the same way', () => {
    const e = journalEntryFromMail({ subject: 'b'.repeat(JOURNAL_TITLE_CAP + 50) }, NOW)
    expect(e?.title.length).toBe(JOURNAL_TITLE_CAP)
    expect(e?.title.endsWith('[…]')).toBe(true)
  })

  it('does not cap an entry that fits, and adds no marker', () => {
    const e = journalEntryFromMail({ subject: 'x', text: 'c'.repeat(JOURNAL_TEXT_CAP) }, NOW)
    expect(e?.text.length).toBe(JOURNAL_TEXT_CAP)
    expect(e?.text).not.toContain('[…]')
  })

  it('carries the written date through end to end', () => {
    const e = journalEntryFromMail(
      { subject: 'Lundi', text: 'x', date: 'Tue, 28 Oct 2025 21:14:00 -0400' },
      NOW,
    )
    expect(e?.at).toBe(Math.floor(Date.parse('Tue, 28 Oct 2025 21:14:00 -0400') / 1000))
  })
})
