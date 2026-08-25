// E-22 (bmad/10) — pure snapshot→prompt-lines composition for `/api/ask`, pulled
// out of the handler so it's independently testable (formatting, recurring-event
// expansion, birthdays, contacts/carnet next-dues, caps, FR/EN) without a live D1
// binding or Workers AI. `functions/api/ask.ts` stays the thin I/O shell: gather a
// bounded snapshot of the household's own data, call `buildAskPromptLines`, hand
// the joined text to `answerQuestion`. ONE bounded snapshot, ONE inference per
// question — never a poll, never a background fetch.
//
// v1 retrieval scope (bmad/10 decisions, E-22): suppers, events (one-off AND
// recurring — closes ask.ts's own documented "recurring events are skipped" gap,
// mirroring the expand+merge board.ts/year.ts already do via `expandRange`),
// birthdays (mirrors the board's derived-birthdays pattern), the list, chores,
// fridge notes, AND — the v1 broadening Marc decided — Le cercle contacts +
// businesses (so « c'est quoi le numéro du vétérinaire ? » has an answer) and
// carnet « long jeu » next-dues (« quand est le prochain entretien ? »).

import type { Lang } from './ai'
import { HOUSEHOLD_TZ } from './ids'
import { parseRecur, expandRange } from './recur'
import { birthdayOccurrences, type BirthdayPerson, type BirthdayOccurrence } from './birthdays'
import { carnetLifeSoon, type CarnetLifeItem, type CarnetLifeSoon } from './carnetLife'
import { workOccurrencesInRange, parseScheduleBlockRow, type ScheduleBlockRow } from './carResolve'

// A short localized label per meal slot for the AI context.
export const SLOT: Record<Lang, Record<string, string>> = {
  fr: { breakfast: 'déjeuner', lunch: 'dîner', supper: 'souper', snack: 'collation', dessert: 'dessert' },
  en: { breakfast: 'breakfast', lunch: 'lunch', supper: 'supper', snack: 'snack', dessert: 'dessert' },
}

// Dates are formatted in the household timezone so the model can resolve
// "Friday", "tomorrow", etc. — mirrors the client's HOUSEHOLD_TZ (src/lib/localDay.ts).
export function fmtDay(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: HOUSEHOLD_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(unixSec * 1000))
}
// Wall-clock time in the household timezone. Shared by the dated event lines and the
// work-hour windows so the prompt never mixes two time formats.
function hhmm(unixSec: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', {
    timeZone: HOUSEHOLD_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(unixSec * 1000))
}

export function fmtDateTime(unixSec: number, allDay: number, lang: Lang): string {
  const day = fmtDay(unixSec, lang)
  if (allDay) return day
  return `${day} ${hhmm(unixSec, lang)}`
}

// ── Events: one-off + recurring, expanded and merged ────────────────────────
export interface AskEventRow {
  title: string
  start_at: number
  all_day: number
}
export interface AskRecurEventRow {
  title: string
  start_at: number // the series ANCHOR
  all_day: number
  recur_json: string | null
}

export const EVENT_CAP = 40

// Expand every recurring series (`recur_json` set) into its concrete occurrences
// inside [rangeStart, rangeEnd), merge with the already-in-window one-off rows,
// sort chronologically, and cap. A malformed/null rule contributes nothing (a
// corrupt series must never crash the ask — see parseRecur). Pure + bounded by
// the window, so cost stays flat regardless of how many series exist.
export function expandAskEvents(
  oneOff: AskEventRow[],
  recurring: AskRecurEventRow[],
  rangeStart: number,
  rangeEnd: number,
): AskEventRow[] {
  const out: AskEventRow[] = [...oneOff]
  for (const e of recurring) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, rangeStart, rangeEnd)) {
      out.push({ title: e.title, start_at: at, all_day: e.all_day })
    }
  }
  out.sort((a, b) => a.start_at - b.start_at)
  return out.slice(0, EVENT_CAP)
}

// ── Birthdays (derived — never a stored event) ───────────────────────────────
export const BIRTHDAY_CAP = 40

// Thin cap wrapper over the shared derivation (birthdayOccurrences already
// sorts) — a household could in theory list more people than the cap in one
// window (a broad ?a-year-ahead range on a large extended family), so this
// still bounds the prompt.
export function birthdaysForPrompt(people: BirthdayPerson[], rangeStart: number, rangeEnd: number): BirthdayOccurrence[] {
  return birthdayOccurrences(people, rangeStart, rangeEnd).slice(0, BIRTHDAY_CAP)
}

// ── Carnets « le long jeu » next-dues ─────────────────────────────────────────
export const CARNET_CAP = 12

export function carnetDuesForPrompt(items: CarnetLifeItem[], now: number): CarnetLifeSoon[] {
  return carnetLifeSoon(items, now).slice(0, CARNET_CAP)
}

// ── « L'auto »: the work rota, derived onto dates ────────────────────────────
// The assistant used to see events only, so "est-ce que Marc est libre jeudi ?" was
// answered from the calendar alone and said yes while he was at work 8 h–17 h. The
// windows are DERIVED from the recurring template (never rows), exactly as the board
// and the calendar derive them, and a date whose car was adjusted releases the car
// without cancelling the work — same rule everywhere.
export const WORK_CAP = 40

export function workForPrompt(
  blocks: ScheduleBlockRow[],
  overrides: readonly { day: number }[],
  members: { id: string; display_name: string }[],
  rangeStart: number,
  rangeEnd: number,
): AskWorkOcc[] {
  const nameOf = new Map(members.map((m) => [m.id, m.display_name]))
  return workOccurrencesInRange(blocks.map(parseScheduleBlockRow), rangeStart, rangeEnd, overrides)
    .map((o) => ({
      name: nameOf.get(o.memberId) ?? o.label ?? '',
      at: o.at,
      endAt: o.endAt,
      holdsCar: o.holdsCar,
    }))
    .filter((o) => o.name)
    .slice(0, WORK_CAP)
}

// ── Le cercle: contacts + businesses (v1 broadening) ─────────────────────────
export interface AskContactRow {
  first_name: string
  last_name: string
  nickname: string | null
  phone: string | null
  email: string | null
}
export interface AskBusinessRow {
  name: string
  category: string | null
  phone: string | null
}

// A contact's display name: nickname wins (« Mémé »), else first+last. Never
// blank — falls back to an em dash rather than an empty prompt line.
export function contactDisplayName(c: Pick<AskContactRow, 'first_name' | 'last_name' | 'nickname'>): string {
  return c.nickname?.trim() || [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || '—'
}

// ── The full bounded snapshot handed to the model ─────────────────────────────
export interface AskMealRow {
  title: string
  date: number
  slot: string
  is_leftover: number
}
export interface AskSnapshot {
  today: number
  meals: AskMealRow[]
  events: AskEventRow[] // already expanded + merged + capped (expandAskEvents)
  birthdays: BirthdayOccurrence[] // already capped (birthdaysForPrompt)
  list: { text: string }[]
  chores: { title: string }[]
  notes: { text: string }[]
  contacts: AskContactRow[]
  businesses: AskBusinessRow[]
  carnetDues: CarnetLifeSoon[] // already capped (carnetDuesForPrompt)
  // « Horaires » — the recurring work windows, DERIVED per date (never event rows).
  // Without these the assistant answered "est-ce que Marc est libre jeudi ?" from
  // events alone and cheerfully said yes while he was at work 8 h–17 h. Already
  // expanded + capped by the caller.
  work: AskWorkOcc[]
}

// One derived work window, ready to print: who, when, and whether it ties up the
// shared car (which is what makes "peut-on aller à l'épicerie ?" answerable).
export interface AskWorkOcc {
  name: string
  at: number
  endAt: number
  holdsCar: boolean
}

// The pure composition: a bounded, dated, sectioned snapshot → the plain-text
// context block `answerQuestion` reasons over. Every section is OMITTED (not
// printed as "none") when empty, so a quiet household doesn't pad the prompt.
export function buildAskPromptLines(s: AskSnapshot, lang: Lang): string[] {
  const slotMap = SLOT[lang]
  const lines: string[] = [(lang === 'fr' ? "Aujourd'hui : " : 'Today: ') + fmtDay(s.today, lang) + '.']

  if (s.meals.length) {
    lines.push('', lang === 'fr' ? 'Repas planifiés :' : 'Planned meals:')
    for (const m of s.meals) {
      const tag = m.is_leftover ? (lang === 'fr' ? ' [restant]' : ' [leftover]') : ''
      lines.push(`- ${fmtDay(m.date, lang)} (${slotMap[m.slot] ?? m.slot}) : ${m.title}${tag}`)
    }
  }
  if (s.events.length) {
    lines.push('', lang === 'fr' ? 'Événements :' : 'Events:')
    for (const e of s.events) lines.push(`- ${fmtDateTime(e.start_at, e.all_day, lang)} : ${e.title}`)
  }
  if (s.work.length) {
    lines.push('', lang === 'fr' ? 'Horaires (qui est absent) :' : 'Work hours (who is away):')
    for (const w of s.work) {
      const car = w.holdsCar ? (lang === 'fr' ? " [prend l'auto]" : ' [takes the car]') : ''
      lines.push(`- ${fmtDay(w.at, lang)} ${hhmm(w.at, lang)}–${hhmm(w.endAt, lang)} : ${w.name}${car}`)
    }
  }
  if (s.birthdays.length) {
    lines.push('', lang === 'fr' ? 'Anniversaires :' : 'Birthdays:')
    for (const b of s.birthdays) {
      const age = b.age != null ? (lang === 'fr' ? ` (${b.age} ans)` : ` (turning ${b.age})`) : ''
      lines.push(`- ${fmtDay(b.at, lang)} : ${b.name}${age}`)
    }
  }
  if (s.list.length) {
    lines.push('', (lang === 'fr' ? "Liste d'épicerie : " : 'Grocery list: ') + s.list.map((r) => r.text).join(', '))
  }
  if (s.chores.length) {
    lines.push('', (lang === 'fr' ? 'Corvées : ' : 'Chores: ') + s.chores.map((r) => r.title).join(', '))
  }
  if (s.contacts.length) {
    lines.push('', lang === 'fr' ? 'Le cercle (personnes) :' : 'The circle (people):')
    for (const c of s.contacts) {
      const name = contactDisplayName(c)
      const bits = [c.phone, c.email].filter(Boolean).join(' · ')
      lines.push(`- ${name}${bits ? ` : ${bits}` : ''}`)
    }
  }
  if (s.businesses.length) {
    lines.push('', lang === 'fr' ? 'Services & commerces :' : 'Services & businesses:')
    for (const b of s.businesses) {
      const bits = [b.category, b.phone].filter(Boolean).join(' · ')
      lines.push(`- ${b.name}${bits ? ` : ${bits}` : ''}`)
    }
  }
  if (s.carnetDues.length) {
    lines.push('', lang === 'fr' ? 'À prévoir (entretien) :' : 'Coming up (upkeep):')
    for (const c of s.carnetDues) {
      const overdue = c.monthsLeft <= 0 ? (lang === 'fr' ? ' (dépassé)' : ' (overdue)') : ''
      lines.push(`- ${c.name} : ${fmtDay(c.at, lang)}${overdue}`)
    }
  }
  if (s.notes.length) {
    lines.push('', (lang === 'fr' ? 'Notes : ' : 'Notes: ') + s.notes.map((r) => r.text).join(' · '))
  }
  return lines
}
