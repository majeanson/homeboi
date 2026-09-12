import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { useWrite } from './write'
import { localDayStart } from './localDay'
import { A_REGLER_KEY, MONTH_KEY, TRANSFERS_KEY } from './queryKeys'

// « Les virements » — the client half. Read model, writes, and the two pure
// derivations the composer needs.
//
// The DATES come from the server (/api/transfers expands them through the one
// DST-correct recurrence expander; see functions/_lib/transfers.ts). Nothing here
// does date arithmetic — deliberately, so there is no second implementation to
// drift. What IS derived here is the cheap, date-free part: which due dates a face
// has already sent for, the running total, and the bank message.

// ---- Wire shapes (mirror /api/transfers) ------------------------------------

// The recurrence as the SERVER stores and sends it (the `Recur` shape in
// functions/_lib/recur): interval and weekdays are optional there. Deliberately NOT
// the form's RecurValue (components/RecurPicker), which requires both — the plan
// form converts between the two, so a missing weekday list never reaches the picker
// as undefined.
export interface TransferRecur {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number
  weekdays?: number[]
}

export type TransferLine =
  | { kind: 'plan'; planId: string; dueAt: number; amountCents: number }
  | { kind: 'topup'; amountCents: number }
  | { kind: 'other'; label: string; amountCents: number }

export interface Catchup {
  behindMemberId: string
  gapCents: number
  asOf: number
  termEnd: number
}

export interface CatchupProjection {
  behindMemberId: string
  aheadMemberId: string
  gapCents: number
  asOf: number
  termEnd: number
  extraPerPayment: number
  paymentsSoFar: number
  caughtUpCents: number
  remainingCents: number
  paymentsLeft: number
  projectedRemainingCents: number
}

export interface TransferPlan {
  id: string
  title: string
  amountCents: number | null
  recur: TransferRecur | null
  anchorAt: number
  shares: Record<string, number>
  catchup: Catchup | null
  colour: string | null
  position: number
  /** Due dates in the server's window, ascending local midnights. */
  due: number[]
  projection: CatchupProjection | null
}

export interface Transfer {
  id: string
  memberId: string | null
  sentAt: number
  lines: TransferLine[]
  totalCents: number
  memo: string
  reference: string | null
  note: string | null
}

export interface TransfersPayload {
  today: number
  plans: TransferPlan[]
  transfers: Transfer[]
}

// ---- Read -------------------------------------------------------------------

export function useTransfers() {
  return useQuery({
    queryKey: TRANSFERS_KEY,
    queryFn: () => api<TransfersPayload>('transfers'),
    ...live,
  })
}

// ---- Pure derivations (no date math) ----------------------------------------

export const transferTotal = (lines: readonly TransferLine[]): number =>
  lines.reduce((sum, l) => sum + l.amountCents, 0)

// Which of a plan's due dates this face has already sent for. A due date belongs to
// the person who owes it, so Marc paying his side never marks Camille's as done —
// the same rule the server uses to build its cover keys.
export function coveredDueDates(
  transfers: readonly Transfer[],
  planId: string,
  memberId: string | null,
  exceptTransferId?: string,
): Set<number> {
  const out = new Set<number>()
  for (const t of transfers) {
    // While EDITING a transfer, its own lines must not read as « already covered »
    // — otherwise re-opening one shows every date it carries as taken by someone
    // else and the ticks look wrong.
    if (exceptTransferId && t.id === exceptTransferId) continue
    if ((t.memberId ?? null) !== (memberId ?? null)) continue
    // Folded to the local day, matching the server's coverKey exactly. The stored
    // second is not stable — early rows carry a UTC-midnight anchor (19 h 00 on the
    // due date, here) and re-anchoring a plan shifts its occurrences — so a
    // raw comparison against `plan.due` silently finds nothing and every date reads
    // as unsent. See the long note on coverKey in functions/_lib/transfers.ts.
    for (const l of t.lines) if (l.kind === 'plan' && l.planId === planId) out.add(localDayStart(new Date(l.dueAt * 1000)))
  }
  return out
}

// THE TRACKING FLOOR: the oldest due date this household has ever recorded for an
// agreement — the day they started keeping this particular book.
//
// An agreement's first date can be years before anyone opened the app. Marc's is
// anchored in February; he started recording in August. Without a floor the
// composer proposed every unpaid fortnight in its 120-day window — seven dates,
// already ticked, six of which were payments made long before the app existed and
// none of which he meant to send today. Nothing was wrong with the arithmetic; the
// screen was simply answering a question nobody asked.
//
// Per AGREEMENT, not per person: the floor means « we started keeping track here »,
// which is a fact about the household, not about who happened to send first. And it
// only ever hides things from the OFFERED row — « Une autre date » still reaches
// every date there has ever been, which is what makes back-filling possible at all.
export function trackingStart(transfers: readonly Transfer[], planId: string): number | null {
  let first: number | null = null
  for (const t of transfers) {
    for (const l of t.lines) {
      if (l.kind !== 'plan' || l.planId !== planId) continue
      const day = localDayStart(new Date(l.dueAt * 1000))
      if (first == null || day < first) first = day
    }
  }
  return first
}

// How many dates ahead the composer offers. Enough to pay early without scrolling a
// year; the rest is « Une autre date ».
export const UPCOMING_OFFERED = 3

// Every due date the composer puts on screen for one agreement: what is still owed
// since the household started tracking, plus the next few ahead, plus anything the
// reader added by hand (which must survive even though it sits outside both).
export function offeredDueDates(
  plan: TransferPlan,
  transfers: readonly Transfer[],
  today: number,
  alsoInclude: readonly number[] = [],
): number[] {
  const floor = trackingStart(transfers, plan.id)
  const past = plan.due.filter((at) => at <= today && (floor == null || at >= floor))
  const ahead = plan.due.filter((at) => at > today).slice(0, UPCOMING_OFFERED)
  return [...new Set([...past, ...ahead, ...alsoInclude])].sort((a, b) => a - b)
}

// The due dates a face still owes: everything on or before today, back to the day
// this household started tracking, that nothing has covered. This is what the
// composer pre-ticks — the question « which ones have I not sent for yet » is the
// reason the screen exists, and before the floor existed it answered with six
// fortnights from before anyone was keeping the book.
export function uncoveredDueDates(
  plan: TransferPlan,
  transfers: readonly Transfer[],
  memberId: string | null,
  today: number,
  exceptTransferId?: string,
): number[] {
  const covered = coveredDueDates(transfers, plan.id, memberId, exceptTransferId)
  const floor = trackingStart(transfers, plan.id)
  return plan.due.filter((at) => at <= today && (floor == null || at >= floor) && !covered.has(at))
}

// ---- The bank message -------------------------------------------------------

// Month names for the memo, as a plain table. NOT Intl: this string goes into a
// bank field, not onto the screen, so it must be stable regardless of the reader's
// locale — and constructing a formatter per transfer is what intl-rule.test.ts
// exists to prevent. Accent-free by construction (« aout », « decembre »), because
// the memo is folded to ASCII anyway.
const MEMO_MONTHS_FR = ['janv', 'fev', 'mars', 'avril', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec']
const MEMO_MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// Fold to plain ASCII: banks routinely strip or mangle accents in a transfer memo,
// and « Hypothèque » coming back as « Hypoth?que » on a statement is worse than
// writing « Hypotheque » deliberately.
export function foldAscii(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Every flavour of space becomes a plain one BEFORE the ASCII strip. FR-CA
      // formatting is full of non-breaking spaces (\u00ab 3 112,82 $ \u00bb carries two), and
      // deleting them as "not ASCII" would glue the words either side together.
      .replace(/\s/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// An amount for the memo: whole dollars when it is round (« 2000 »), cents only when
// they matter (« 2000.50 »). A bank memo is read by a human in a hurry.
function memoAmount(cents: number): string {
  const dollars = cents / 100
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2)
}

// The day numbers of a set of due dates, grouped by month in order — « 13 27 aout »,
// or « 27 aout 10 sept » when a send spans a month boundary. Reads the local day/
// month off the timestamp the server already resolved to a local midnight.
function memoDates(dueAts: readonly number[], lang: 'fr' | 'en'): string {
  const months = lang === 'en' ? MEMO_MONTHS_EN : MEMO_MONTHS_FR
  const groups: { month: number; days: number[] }[] = []
  for (const at of [...dueAts].sort((a, b) => a - b)) {
    const d = new Date(at * 1000)
    // A local midnight in this household's zone is the same calendar day in UTC
    // (western hemisphere), which is what the server's own day keys assume.
    const month = d.getUTCMonth()
    const day = d.getUTCDate()
    const last = groups[groups.length - 1]
    if (last && last.month === month) last.days.push(day)
    else groups.push({ month, days: [day] })
  }
  return groups.map((g) => `${g.days.join(' ')} ${months[g.month]}`).join(' ')
}

export const MEMO_CAP = 100
export const TOPUP_WORD = { fr: 'renflou', en: 'topup' } as const

// Build the message that goes in the Interac memo, e.g.
//   « Hypotheque 13 27 aout renflou 2000 »
// which is exactly the shape this household was already typing by hand. Plan lines
// group under their plan's name; the top-up and any other line follow with their
// amount. Capped, because a bank memo field is short and silently truncating in the
// bank's own form is how a reference loses its meaning.
export function buildMemo(
  lines: readonly TransferLine[],
  plans: readonly TransferPlan[],
  lang: 'fr' | 'en' = 'fr',
): string {
  const parts: string[] = []

  // Plan lines, in the plans' own order, so the message reads the same every time.
  for (const plan of plans) {
    const dueAts = lines.filter((l) => l.kind === 'plan' && l.planId === plan.id).map((l) => (l as { dueAt: number }).dueAt)
    if (!dueAts.length) continue
    parts.push(`${foldAscii(plan.title)} ${memoDates(dueAts, lang)}`)
  }

  const topup = lines.filter((l) => l.kind === 'topup').reduce((s, l) => s + l.amountCents, 0)
  if (topup > 0) parts.push(`${TOPUP_WORD[lang]} ${memoAmount(topup)}`)

  for (const l of lines) {
    if (l.kind !== 'other') continue
    const label = foldAscii(l.label)
    parts.push(label ? `${label} ${memoAmount(l.amountCents)}` : memoAmount(l.amountCents))
  }

  return foldAscii(parts.join(' ')).slice(0, MEMO_CAP).trim()
}

// ---- The year, in one block -------------------------------------------------

// « Combien on a envoyé cette année, et qui. » The question that gets asked at a
// mortgage renewal, at tax time, and in the January conversation about whether the
// arrangement is actually working — and until now the only way to answer it was to
// scroll the history and add it up by hand, which is the exact chore this whole
// section exists to delete.
//
// A STRUCTURE, not a string: the sentences are assembled where the translations
// live (components/virements/YearSummary.tsx). That keeps this half pure and
// testable, and keeps Intl out of it (intl-rule.test.ts).
export interface YearMemberTotal {
  memberId: string | null
  /** Due dates covered. Only meaningful on a plan line; 0 elsewhere. */
  payments: number
  cents: number
}

export interface YearPlanTotal {
  planId: string
  title: string
  byMember: YearMemberTotal[]
  cents: number
}

export interface YearSummary {
  year: number
  transfers: number
  firstSentAt: number | null
  lastSentAt: number | null
  plans: YearPlanTotal[]
  topups: YearMemberTotal[]
  others: { label: string; cents: number }[]
  byMember: YearMemberTotal[]
  totalCents: number
}

// The calendar year a local midnight belongs to. Read in UTC for the same reason
// memoDates does: a local midnight in this household's zone is the same calendar
// date in UTC, which is the assumption the server's own day keys already make.
export const yearOfDay = (sec: number): number => new Date(sec * 1000).getUTCFullYear()

/** Every year that holds at least one transfer, newest first. */
export function transferYears(transfers: readonly Transfer[]): number[] {
  return [...new Set(transfers.map((t) => yearOfDay(t.sentAt)))].sort((a, b) => b - a)
}

// ORDERING IS BY IDENTITY, NOT BY AMOUNT. Sorting people by what they sent would
// turn a receipt into a leaderboard, which is the one thing this section refuses
// (NFR-CALM-1, the chore-ledger rule). A stable id sort says nothing about anyone.
const byIdentity = (a: { memberId: string | null }, b: { memberId: string | null }) => {
  // A plain code-point compare, not localeCompare: these are opaque ids, never read
  // by anyone, and a collator built per comparison is what intl-rule.test.ts exists
  // to keep out of hot paths. Unattributed sends sort last.
  const x = a.memberId ?? '\uffff'
  const y = b.memberId ?? '\uffff'
  return x < y ? -1 : x > y ? 1 : 0
}

function bump(into: YearMemberTotal[], memberId: string | null, cents: number, payments = 0): void {
  const row = into.find((x) => x.memberId === memberId)
  if (row) {
    row.cents += cents
    row.payments += payments
  } else into.push({ memberId, payments, cents })
}

/** Everything sent in one calendar year, grouped by agreement and by person. */
export function summariseYear(
  transfers: readonly Transfer[],
  plans: readonly TransferPlan[],
  year: number,
): YearSummary {
  const mine = transfers.filter((t) => yearOfDay(t.sentAt) === year).sort((a, b) => a.sentAt - b.sentAt)

  const planRows = new Map<string, YearPlanTotal>()
  const topups: YearMemberTotal[] = []
  const others = new Map<string, { label: string; cents: number }>()
  const byMember: YearMemberTotal[] = []
  let totalCents = 0

  for (const t of mine) {
    const who = t.memberId ?? null
    for (const l of t.lines) {
      totalCents += l.amountCents
      bump(byMember, who, l.amountCents)
      if (l.kind === 'plan') {
        // A line whose agreement was deleted still SPENT money, so it keeps its own
        // row under a blank title rather than vanishing out of the total.
        const plan = plans.find((p) => p.id === l.planId)
        const row = planRows.get(l.planId) ?? { planId: l.planId, title: plan?.title ?? '', byMember: [], cents: 0 }
        bump(row.byMember, who, l.amountCents, 1)
        row.cents += l.amountCents
        planRows.set(l.planId, row)
      } else if (l.kind === 'topup') {
        bump(topups, who, l.amountCents)
      } else {
        // Free lines fold by their own label, case-insensitively, so « Électricité »
        // typed twice reads as one line of the year rather than two.
        const key = l.label.trim().toLocaleLowerCase()
        const row = others.get(key) ?? { label: l.label.trim(), cents: 0 }
        row.cents += l.amountCents
        others.set(key, row)
      }
    }
  }

  // Agreements in THEIR order (the plan list's), so the block reads the same way the
  // cards above it do; a deleted agreement's leftovers fall to the end.
  const ordered = [
    ...plans.map((p) => planRows.get(p.id)).filter((x): x is YearPlanTotal => !!x),
    ...[...planRows.values()].filter((r) => !plans.some((p) => p.id === r.planId)),
  ]
  for (const r of ordered) r.byMember.sort(byIdentity)
  topups.sort(byIdentity)
  byMember.sort(byIdentity)

  return {
    year,
    transfers: mine.length,
    firstSentAt: mine[0]?.sentAt ?? null,
    lastSentAt: mine[mine.length - 1]?.sentAt ?? null,
    plans: ordered,
    topups,
    others: [...others.values()],
    byMember,
    totalCents,
  }
}

// ---- The gap, drawn ----------------------------------------------------------

// Three points and a floor at zero: what the gap WAS when it was counted, what it is
// today, and where this rhythm lands it by the end of the agreement. Marc asked for
// « a little graph that goes to 0 » and that is exactly the shape — a quantity that
// is meant to disappear, drawn disappearing.
//
// It stays a receipt rather than a score: the sentences above it already carry every
// number, there is no percentage, no colour coding, no axis but the zero line, and
// the forecast half is drawn as a forecast. If the arrangement does NOT close the
// gap, the line simply does not reach the floor — no rounding the bad news away.
export interface CatchupPoint {
  /** Local-day secs. */
  at: number
  cents: number
}

export interface CatchupSeries {
  /** Measured: from the day the gap was counted, to today. */
  past: CatchupPoint[]
  /** Forecast: from today to the end of the agreement, at the current rhythm. */
  ahead: CatchupPoint[]
  /** The largest amount the drawing has to fit — always the gap as first counted. */
  maxCents: number
  /** When the gap reaches zero at this rhythm, or null if it does not inside the term. */
  zeroAt: number | null
}

export function catchupSeries(p: CatchupProjection, today: number): CatchupSeries | null {
  if (p.gapCents <= 0 || p.termEnd <= p.asOf) return null
  // Today can sit outside the agreement in both directions — one written ahead of
  // time, or one whose term has already run out. Clamping keeps the drawing inside
  // its own box without pretending the date is something it is not.
  const now = Math.min(Math.max(today, p.asOf), p.termEnd)

  let zeroAt: number | null = null
  if (p.remainingCents <= 0) zeroAt = now
  else if (p.extraPerPayment > 0 && p.paymentsLeft > 0) {
    const needed = Math.ceil(p.remainingCents / p.extraPerPayment)
    // Only ever inside the term: past its end this rhythm is no longer agreed to, so
    // a date beyond it would be a promise the arrangement does not make.
    if (needed <= p.paymentsLeft) zeroAt = Math.round(now + ((p.termEnd - now) * needed) / p.paymentsLeft)
  }

  return {
    past: [
      { at: p.asOf, cents: p.gapCents },
      { at: now, cents: p.remainingCents },
    ],
    ahead: zeroAt
      ? [
          { at: now, cents: p.remainingCents },
          { at: zeroAt, cents: 0 },
          { at: p.termEnd, cents: 0 },
        ]
      : [
          { at: now, cents: p.remainingCents },
          { at: p.termEnd, cents: p.projectedRemainingCents },
        ],
    maxCents: p.gapCents,
    zeroAt,
  }
}

// ---- Writes (every one through useWrite → the offline outbox) ---------------

// A transfer touches three caches: its own read model, the calendar (due dates are
// derived onto /api/month) and the « À régler » scan (an uncovered due date is a
// friction signal). Same trio the server broadcasts — see _lib/realtime PATH_KEYS.
const TRANSFER_KEYS = [TRANSFERS_KEY, MONTH_KEY, A_REGLER_KEY]

export interface TransferDraft {
  memberId: string | null
  sentAt: number
  lines: TransferLine[]
  memo: string
  reference: string | null
  note: string | null
}

export function useSaveTransfer() {
  const write = useWrite()
  return useCallback(
    (draft: TransferDraft, id?: string) =>
      write<{ id?: string }>('transfers', {
        method: id ? 'PATCH' : 'POST',
        body: id ? { id, ...draft } : draft,
        affectedKeys: TRANSFER_KEYS,
      }),
    [write],
  )
}

export function useDeleteTransfer() {
  const write = useWrite()
  return useCallback(
    (id: string) => write('transfers', { method: 'DELETE', body: { id }, affectedKeys: TRANSFER_KEYS }),
    [write],
  )
}

export interface PlanDraft {
  title: string
  amountCents: number | null
  recur: TransferRecur | null
  anchorAt: number
  shares: Record<string, number>
  catchup: Catchup | null
  colour: string | null
}

export function useSavePlan() {
  const write = useWrite()
  return useCallback(
    (draft: PlanDraft, id?: string) =>
      write<{ id?: string }>('transfer-plans', {
        method: id ? 'PATCH' : 'POST',
        body: id ? { id, ...draft } : draft,
        affectedKeys: TRANSFER_KEYS,
      }),
    [write],
  )
}

export function useDeletePlan() {
  const write = useWrite()
  return useCallback(
    (id: string) => write('transfer-plans', { method: 'DELETE', body: { id }, affectedKeys: TRANSFER_KEYS }),
    [write],
  )
}
