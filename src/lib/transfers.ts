import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import { live } from './query'
import { useWrite } from './write'
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
    for (const l of t.lines) if (l.kind === 'plan' && l.planId === planId) out.add(l.dueAt)
  }
  return out
}

// The due dates a face still owes: everything on or before today that nothing has
// covered. This is what the composer pre-ticks — the question « which ones have I
// not sent for yet » is the reason the screen exists.
export function uncoveredDueDates(
  plan: TransferPlan,
  transfers: readonly Transfer[],
  memberId: string | null,
  today: number,
  exceptTransferId?: string,
): number[] {
  const covered = coveredDueDates(transfers, plan.id, memberId, exceptTransferId)
  return plan.due.filter((at) => at <= today && !covered.has(at))
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
