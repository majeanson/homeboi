// « Mon journal » — turning one received email into one journal entry.
//
// This module is deliberately PURE: parsed-MIME in, `{ title, text, at }` out. No env,
// no DB, no crypto, no Intl. That is not tidiness for its own sake — Wrangler's dev
// server cannot run an Email Worker locally (a documented limitation), so the only way
// this logic gets tested before it meets a real inbox is by keeping it a function.
// `email()` in worker/index.ts therefore stays a skeleton: parse, resolve, insert.
//
// The chain it serves (plans/JOURNAL-EWRITER.md): write by hand on an e-writer → the
// DEVICE converts the handwriting to text on itself (fr_CA, offline, free) → « send by
// email » → here. We never read handwriting ourselves, which is the whole reason the
// searchable half of this is trustworthy: this repo's own recipe corpus already
// measured the free vision reader failing on dense PRINTED pages, and one published
// comparison puts cursive at 63,4 %. An index that is 63 % right is worse than none,
// because you stop trusting search. So the device's own recognition is the index, and
// this file only files what it is handed.

// What a MIME parser hands us. Structural, not postal-mime's own types, so this module
// stays testable with plain objects and swappable if the parser ever changes.
export interface MailAttachment {
  filename?: string | null
  mimeType?: string | null
  content?: ArrayBuffer | Uint8Array | string | null
}
export interface MailInput {
  subject?: string | null
  text?: string | null
  html?: string | null
  /** The `Date` header, as the parser gives it. */
  date?: string | null
  attachments?: readonly MailAttachment[] | null
}

export interface JournalEntry {
  title: string
  text: string
  /** Unix seconds — the day the entry was WRITTEN (see `entryTime`). */
  at: number
}

// family_notes' own composer caps a note at 2000 chars (functions/api/family-notes.ts).
// An ingested handwritten page is a different animal: a full page of longhand runs
// 1500–3000 characters, and a two-page entry more, so the composer's cap would quietly
// eat the end of real entries. Hence a separate, generous ingest cap.
//
// And when it IS hit, the cut is MARKED rather than silent. Marc's standing rule, in
// CLAUDE.md as the recipe importer's: « it's easy for a user to remove extra text than
// find missing one » — so the one thing we must never do is drop words without saying
// so. A visible marker turns a lost paragraph into an obvious one.
export const JOURNAL_TEXT_CAP = 8000
export const JOURNAL_TITLE_CAP = 120
const CUT_MARKER = ' […]'

// Mail clients prefix a forward or a reply, and some e-writers send through a relay
// that does the same. These are furniture, not the entry's name. 'Tr:' is the French
// forward prefix (Thunderbird/Outlook FR), 'Fwd'/'Fw'/'Re' the rest.
const SUBJECT_PREFIX = /^\s*(?:re|ref|fwd?|tr|wg|aw)\s*(?:\[\d+\])?\s*:\s*/i

/** Strip stacked reply/forward prefixes: « Tr: Re: Fwd: Lundi » → « Lundi ». */
export function cleanSubject(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim()
  // Loop, because clients stack them. Bounded so a pathological subject can't spin.
  for (let i = 0; i < 8 && SUBJECT_PREFIX.test(s); i++) s = s.replace(SUBJECT_PREFIX, '').trim()
  return s
}

// A very small HTML→text fallback, used only when a mail carries no plain-text part at
// all. It is not a renderer and does not try to be: block tags become newlines, every
// other tag goes, and the handful of entities that actually show up in prose are
// decoded. Anything fancier would be a liability here — the plain-text part is what we
// want in practice, and `text/plain` is what a device's TXT export gives us.
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** True for the attachment an e-writer's « export to TXT » produces. */
function isTextAttachment(a: MailAttachment): boolean {
  const type = (a.mimeType ?? '').toLowerCase()
  if (type.startsWith('text/plain')) return true
  // Some devices send a .txt with no type, or as a generic octet-stream.
  return /\.txt$/i.test(a.filename ?? '')
}

function attachmentText(a: MailAttachment): string {
  const c = a.content
  if (typeof c === 'string') return c
  if (c instanceof Uint8Array) return new TextDecoder().decode(c)
  if (c instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(c))
  return ''
}

// Clock sanity for the `Date` header. An e-writer that has been off for a month, or
// whose clock was never set, can date a mail in 2043 — and an entry filed in 2043 is
// not findable by anyone, ever, which is a silent data loss dressed up as a success.
// Equally a 1970 epoch-zero date buries it below everything.
//
// So: trust the header inside a plausible window and fall back to arrival time
// otherwise. The window is generous on the past (you may well mail a notebook page a
// fortnight after writing it) and tight on the future (a day, for time zones).
const EARLIEST = Date.UTC(2015, 0, 1) / 1000
const FUTURE_SLACK = 86400

/**
 * The entry's `created_at`: the day it was WRITTEN, not the day it synced.
 * That distinction is the point of the feature — a journal is read by date.
 */
export function entryTime(dateHeader: string | null | undefined, nowSec: number): number {
  if (!dateHeader) return nowSec
  const ms = Date.parse(dateHeader)
  if (!Number.isFinite(ms)) return nowSec
  const sec = Math.floor(ms / 1000)
  if (sec < EARLIEST) return nowSec
  if (sec > nowSec + FUTURE_SLACK) return nowSec
  return sec
}

function cap(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - CUT_MARKER.length).trimEnd() + CUT_MARKER
}

/**
 * Map one received mail onto one journal entry, or `null` when there is nothing to
 * file (an empty mail, or one carrying only an unreadable attachment).
 *
 * Returning null rather than an empty note is deliberate: a titleless, textless row in
 * « Les notes » is noise the household then has to clean up, and a journal that fills
 * itself with blanks is worse than one that misses a malformed mail.
 */
export function journalEntryFromMail(mail: MailInput, nowSec: number): JournalEntry | null {
  // The body, in order of trust:
  //  1. a text/plain ATTACHMENT — this is a device's « export to TXT », i.e. the
  //     on-device fr_CA recognition, which is exactly what we came for;
  //  2. the mail's own plain-text part — a note typed on a phone, or a device that
  //     puts the converted text inline;
  //  3. the HTML part, flattened — last resort.
  const attachments = mail.attachments ?? []
  const txt = attachments.find(isTextAttachment)
  const fromAttachment = txt ? attachmentText(txt).trim() : ''
  const body = fromAttachment || (mail.text ?? '').trim() || htmlToText(mail.html ?? '')

  // Normalise line endings only. We do NOT strip signatures, footers or quoted
  // history: see JOURNAL_TEXT_CAP — extra text is cheap to delete, missing text is
  // expensive to notice.
  const text = body.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  const subject = cleanSubject(mail.subject)
  // No subject (a device that mails its export with an empty one) → the entry names
  // itself after its own first line, which is what a paper journal does anyway.
  const firstLine = text.split('\n').find((l) => l.trim().length > 0)?.trim() ?? ''
  const title = subject || firstLine

  // Nothing to file. Note this is checked on the RAW pair, before capping, so a mail
  // that is only whitespace is rejected rather than stored as ''.
  if (!title && !text) return null

  return {
    title: cap(title, JOURNAL_TITLE_CAP),
    text: cap(text, JOURNAL_TEXT_CAP),
    at: entryTime(mail.date, nowSec),
  }
}
