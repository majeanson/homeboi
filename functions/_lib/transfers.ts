// « Les virements » — the domain logic for what a household sends to a shared
// account. THE one place the dates and the arithmetic live.
//
// Why it is all server-side: the SPA has no recurrence expander (only
// src/lib/recurLabel.ts, which labels a rule and converts a date field — it never
// expands a series). Every dated surface in this app already gets its occurrences
// computed here and renders them dumb — the board, /api/month, _lib/upkeep.
// Transfers follow that, so the composer's « dates couvertes » ticks, the calendar
// cells and the « À régler » heads-up are the SAME numbers by construction rather
// than by three copies agreeing. It also keeps the DST-correct day stepping inside
// _lib/recur, which is the only place allowed to be subtle about it.
//
// CALM (NFR-CALM-1): everything here DESCRIBES recorded rows. Nothing is written
// back, nothing is ranked, and the one between-people number (« ce qu'il reste à
// rattraper ») exists only because a household wrote that agreement down — it is
// read off their own receipts, and it is never pushed at anyone.

import { parseRecur, expandRange } from './recur'
import { localDayStart, addLocalDays } from './ids'

// ---- Wire + storage shapes --------------------------------------------------

// One line of a transfer. A 'plan' line is the CLAIM « this money covers that due
// date », which is what makes coverage and catch-up derivable at all; the other two
// kinds are free money riding on the same send (a top-up, a one-off).
export type TransferLine =
  | { kind: 'plan'; planId: string; dueAt: number; amountCents: number }
  | { kind: 'topup'; amountCents: number }
  | { kind: 'other'; label: string; amountCents: number }

// Who owes what per occurrence: member id → cents. Soft member refs (see 0126).
export type Shares = Record<string, number>

// The catch-up agreement, when a household has one.
export interface Catchup {
  behindMemberId: string // the one CATCHING UP (sends the larger share)
  gapCents: number // how much the other paid ahead, as agreed
  asOf: number // local-day secs: the date that gap was measured
  termEnd: number // local-day secs: when the arrangement is meant to end
}

export interface PlanRow {
  id: string
  household_id: string
  title: string
  amount_cents: number | null
  recur_json: string | null
  anchor_at: number
  shares_json: string
  catchup_json: string
  colour: string | null
  position: number
}

export interface TransferRow {
  id: string
  member_id: string | null
  sent_at: number
  lines_json: string
  memo: string
  reference: string | null
  note: string | null
  created_at: number
}

// ---- Tolerant parsers (a corrupt row must never crash a surface) ------------

const int = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.floor(n) : null
}

// Non-negative cents. Money here is always an amount SENT — never a credit, never
// a negative adjustment (that would be a balance, which this feature refuses).
const cents = (v: unknown): number | null => {
  const n = int(v)
  return n !== null && n >= 0 ? n : null
}

export function parseLines(json: string | null | undefined): TransferLine[] {
  if (!json) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const out: TransferLine[] = []
  for (const v of raw) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const amountCents = cents(o.amountCents)
    if (amountCents === null) continue
    if (o.kind === 'plan') {
      const planId = typeof o.planId === 'string' ? o.planId : ''
      const dueAt = int(o.dueAt)
      if (!planId || dueAt === null) continue
      out.push({ kind: 'plan', planId, dueAt, amountCents })
    } else if (o.kind === 'topup') {
      out.push({ kind: 'topup', amountCents })
    } else if (o.kind === 'other') {
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      out.push({ kind: 'other', label, amountCents })
    }
  }
  return out
}

export function parseShares(json: string | null | undefined): Shares {
  if (!json) return {}
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Shares = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const c = cents(v)
    if (k && c !== null) out[k] = c
  }
  return out
}

export function parseCatchup(json: string | null | undefined): Catchup | null {
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const behindMemberId = typeof o.behindMemberId === 'string' ? o.behindMemberId.trim() : ''
  const gapCents = cents(o.gapCents)
  const asOf = int(o.asOf)
  const termEnd = int(o.termEnd)
  if (!behindMemberId || !gapCents || asOf === null || termEnd === null) return null
  if (asOf <= 0 || termEnd <= asOf) return null
  return { behindMemberId, gapCents, asOf, termEnd }
}

// A transfer's total is the sum of its lines and is deliberately never stored —
// one number, one source, so an edited line can't leave a stale total behind.
export const linesTotal = (lines: readonly TransferLine[]): number =>
  lines.reduce((sum, l) => sum + l.amountCents, 0)

// ---- Occurrences ------------------------------------------------------------

// Every due date of a plan inside [from, to). A plan with no rule has exactly one:
// its anchor. Ascending, bounded by the window, like every other expansion here.
export function planOccurrences(plan: Pick<PlanRow, 'recur_json' | 'anchor_at'>, from: number, to: number): number[] {
  const rule = parseRecur(plan.recur_json)
  if (!rule) return plan.anchor_at >= from && plan.anchor_at < to ? [plan.anchor_at] : []
  return expandRange(plan.anchor_at, rule, from, to)
}

// Which due dates a set of transfers already claims to cover. A due date is
// « covered » by whoever sent for it, so the key carries the sender too: two people
// paying into the same date each cover their own side of it, independently.
//
// THE KEY IS THE LOCAL DAY, NOT THE STORED SECOND. A 'plan' line records the due
// date it was ticked from, and that number is only as stable as whatever wrote it:
// early rows were resolved through a UTC-midnight helper and landed at 19 h 00 on
// the due date rather than at its local midnight, and re-anchoring a plan moves its
// occurrences by hours either way. Keyed on the
// raw second, every one of those rows silently stops matching — the composer
// re-offers a date already sent for, the plan card shows it unpaid, and « À régler »
// nags about it, with no error anywhere to say why. Keyed on the day, « I sent for
// the 13th » stays true however the 13th happened to be spelled. Found in real data
// (2026-09-12): two lines at 19 h 00 against occurrences at 00 h 00, same Thursday,
// zero matches.
const dayOf = (sec: number): number => localDayStart(new Date(sec * 1000))

export const coverKey = (planId: string, dueAt: number, memberId: string | null): string =>
  `${planId}:${dayOf(dueAt)}:${memberId ?? ''}`

export function coveredSet(transfers: readonly TransferRow[]): Set<string> {
  const out = new Set<string>()
  for (const t of transfers) {
    for (const l of parseLines(t.lines_json)) {
      if (l.kind === 'plan') out.add(coverKey(l.planId, l.dueAt, t.member_id))
    }
  }
  return out
}

// What the composer and the calendar both render: each due date in the window,
// with whether this member has already sent for it.
export interface DueDate {
  at: number
  covered: boolean
}

export function dueDatesFor(
  plan: PlanRow,
  transfers: readonly TransferRow[],
  memberId: string | null,
  from: number,
  to: number,
): DueDate[] {
  const covered = coveredSet(transfers)
  return planOccurrences(plan, from, to).map((at) => ({ at, covered: covered.has(coverKey(plan.id, at, memberId)) }))
}

// ---- The catch-up projection ------------------------------------------------

// « Elle a payé 72 000 $ de plus, j'envoie 300 $ de plus par paiement. » Everything
// below is read off the agreement plus the recorded transfers — nothing is stored.
export interface CatchupProjection {
  behindMemberId: string
  aheadMemberId: string
  gapCents: number
  asOf: number
  termEnd: number
  extraPerPayment: number // the behind member's share minus the other's
  paymentsSoFar: number // due dates already sent for, since asOf
  caughtUpCents: number // what those sends actually closed
  remainingCents: number // the gap as it stands today
  paymentsLeft: number // due dates still to come before termEnd
  projectedRemainingCents: number // what would remain at termEnd at this rate
}

// Returns null unless the plan genuinely describes this arrangement: a catch-up
// agreement AND exactly two shares (the « extra » is the difference between them,
// which means nothing with one payer or three).
export function catchupProjection(
  plan: PlanRow,
  transfers: readonly TransferRow[],
  today: number,
): CatchupProjection | null {
  const catchup = parseCatchup(plan.catchup_json)
  if (!catchup) return null
  const shares = parseShares(plan.shares_json)
  const ids = Object.keys(shares)
  if (ids.length !== 2) return null
  const aheadMemberId = ids.find((id) => id !== catchup.behindMemberId)
  if (!aheadMemberId || !(catchup.behindMemberId in shares)) return null

  const behindShare = shares[catchup.behindMemberId]
  const aheadShare = shares[aheadMemberId]
  const extraPerPayment = Math.max(0, behindShare - aheadShare)

  // What the behind member has actually sent toward this plan since the gap was
  // measured. Each line closes the gap by however much it exceeded the other's
  // share — read off the line, never assumed, so a payment sent at a different
  // amount counts for exactly what it was.
  let paymentsSoFar = 0
  let caughtUpCents = 0
  for (const t of transfers) {
    if (t.member_id !== catchup.behindMemberId) continue
    for (const l of parseLines(t.lines_json)) {
      if (l.kind !== 'plan' || l.planId !== plan.id) continue
      // Same day-fold as coverKey, and for the same reason: a line stored at 19 h 00
      // on the term's last day reads as AFTER a termEnd held at that day's midnight,
      // so the final payment of an arrangement would quietly stop counting.
      const day = dayOf(l.dueAt)
      if (day < catchup.asOf || day > catchup.termEnd) continue
      paymentsSoFar += 1
      caughtUpCents += Math.max(0, l.amountCents - aheadShare)
    }
  }

  const remainingCents = Math.max(0, catchup.gapCents - caughtUpCents)
  // Due dates still ahead: from tomorrow through the end of the term day.
  const paymentsLeft = planOccurrences(plan, addLocalDays(today, 1), addLocalDays(catchup.termEnd, 1)).length
  const projectedRemainingCents = Math.max(0, remainingCents - paymentsLeft * extraPerPayment)

  return {
    behindMemberId: catchup.behindMemberId,
    aheadMemberId,
    gapCents: catchup.gapCents,
    asOf: catchup.asOf,
    termEnd: catchup.termEnd,
    extraPerPayment,
    paymentsSoFar,
    caughtUpCents,
    remainingCents,
    paymentsLeft,
    projectedRemainingCents,
  }
}

// ---- The window every surface shares ----------------------------------------

// How far back / forward the tab and the composer look. Past dates matter because
// the composer's whole job is « which of these have I not sent for yet »; the
// forward window is what the calendar and the heads-up can reach.
export const DUE_WINDOW_BACK_DAYS = 120
export const DUE_WINDOW_AHEAD_DAYS = 90

export const todayLocal = (now: number = Date.now()): number => localDayStart(new Date(now))

export function dueWindow(today: number): { from: number; to: number } {
  return { from: addLocalDays(today, -DUE_WINDOW_BACK_DAYS), to: addLocalDays(today, DUE_WINDOW_AHEAD_DAYS) }
}
