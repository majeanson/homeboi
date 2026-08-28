import { addLocalDays } from './ids'

// « Plus tard » on an « À régler » signal (migration 0122) — the two pure decisions,
// out of the handler so they can be tested without a D1.
//
// Why the feature exists: the friction scan is DERIVED (functions/api/a-regler reads
// existing tables and owns no rows), so an unresolvable friction re-nagged on every
// single scan — a ride whose driver genuinely isn't settled yet, a birthday you've
// decided not to buy for. The one surface built to REDUCE mental load was spending
// it. Nothing is deleted: the row expires by itself and the signal simply returns.

// Default quiet: until tomorrow. Long enough to stop the re-nagging today, short
// enough that a real friction can't be muted and forgotten.
export const SNOOZE_DAYS_DEFAULT = 1
// A ceiling, not a preference. Nothing in the UI offers more than a day today; this
// exists so a crafted body can't mute a household for years — the calm tenet cuts
// both ways, and a signal that never returns is a signal that lied.
export const SNOOZE_DAYS_MAX = 30

/** A client-supplied snooze length → a whole number of days within bounds. */
export function cleanSnoozeDays(input: unknown): number {
  const raw = typeof input === 'number' && Number.isFinite(input) ? Math.round(input) : NaN
  if (!Number.isFinite(raw)) return SNOOZE_DAYS_DEFAULT
  return Math.min(SNOOZE_DAYS_MAX, Math.max(1, raw))
}

/** The local-midnight day a snooze taken `today` wakes back up on. */
export function snoozeUntil(today: number, days: unknown): number {
  return addLocalDays(today, cleanSnoozeDays(days))
}

/**
 * Drop the signals a household has quieted.
 *
 * Applied AFTER the scan and BEFORE the cap, so a snoozed friction never consumes
 * one of the slots a live one could use — otherwise quieting a signal could hide a
 * different, real one behind the cap.
 */
export function withoutSnoozed<T extends { key: string }>(signals: T[], quiet: ReadonlySet<string>): T[] {
  return quiet.size ? signals.filter((s) => !quiet.has(s.key)) : signals
}
