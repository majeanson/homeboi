import { currentTz } from './tz'
import { addDaysIn, dayOfWeekIn, dayStartIn, timeOnDayIn } from '../../shared/localDay'
// Opaque id + token generation. crypto.getRandomValues is available in the
// Workers runtime.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// 12-char opaque id (~71 bits). Used for row ids and the device-facing share
// surface, like the portal's session ids.
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

// A create's id when the CLIENT minted it (review #39): the list, todos and tasks paint their
// optimistic row under the id the server will keep (src/lib/rowId.ts `newRowId`), so a tick or
// a delete made before the create answers already names the real row. Only a UUID is taken;
// anything else (an older bundle, a forged string) gets a server id, as before.
const CLIENT_ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function rowIdFrom(v: unknown): string {
  return typeof v === 'string' && CLIENT_ROW_ID.test(v) ? v : newId()
}

// Short, TV-typeable code for a /tv/<code> living-room link. Lowercase + digits,
// minus look-alikes (0/o/1/l/i), so it's unambiguous on a TV on-screen keyboard.
// 4 chars over a 31-symbol alphabet ≈ 923k combinations — deliberately tiny for
// dead-easy typing on a TV remote; acceptable because the link is read-only board
// access and revocable anytime (Réglages ▸ Tablettes). Uniqueness is enforced by a
// DB index (caller retries on the rare collision).
const SHORT_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export function newShortCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += SHORT_ALPHABET[b % SHORT_ALPHABET.length]
  return out
}

// 6-digit pairing code. Human-typed once, short-lived — collision space is
// fine because pending codes expire in minutes and are scoped by lookup.
export function newPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (const b of bytes) out += String(b % 10)
  return out
}

// SHA-256 hex. We store the hash of a device token, never the token.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// The real moment of a tick, not the moment it reached the server. A check held in the
// offline outbox past midnight has to keep its own day, or a task done at 23:50 reads as
// done tomorrow: a one-off would stay ticked a day too long, and a « from the last time »
// cycle would re-anchor late. The client sends the gesture's time; this bounds it, so a
// wrong clock can neither stamp the future nor reach further back than a phone can
// plausibly have been offline.
const TICK_MAX_AGE = 30 * 86400
export function tickedAt(sent: unknown, now: number): number {
  const n = Number(sent)
  return Number.isFinite(n) && n > 0 && n <= now && n >= now - TICK_MAX_AGE ? Math.floor(n) : now
}

export const nowSec = () => Math.floor(Date.now() / 1000)

// Unix-seconds midnight (local-ish, UTC-based) for a given Date. Meal/event
// day bucketing. Good enough for a single-household prototype.
export function dayStart(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

// The household's wall-clock timezone. The meal week rolls over at LOCAL midnight, not
// the 20:00 (8 PM Eastern) you get when the day is bucketed in UTC; Intl handles DST.
//
// It used to be the literal 'America/Toronto' — right for the household this was built
// for, wrong for every other one the moment the app goes public (migration 0135). It is
// now the PER-REQUEST household zone (functions/_lib/tz.ts): `authed()` establishes it
// once from the actor, and these helpers read it as their default, so all ~190 call
// sites that never passed a tz became correct without an edit. Outside a request (the
// cron, a unit test) it answers America/Toronto, which is what those callers meant.
//
// Still a function-shaped default, evaluated per call — NOT a module constant captured
// once, which would freeze the first request's zone for the isolate's whole life.
export const HOUSEHOLD_TZ = currentTz()

// The math itself is shared/localDay.ts (review #40), the client's too; these wrappers only
// supply the default zone — the request's, evaluated per call.
export const localDayStart = (d: Date, tz = currentTz()): number => dayStartIn(d, tz)

// Local midnight of the day `n` days after the local-midnight `daySec`, DST-safe.
export const addLocalDays = (daySec: number, n: number, tz = currentTz()): number => addDaysIn(daySec, n, tz)

// The WALL time `secsOfDay` past local midnight on the day `daySec` (DST-aware; _lib/recur).
export const localTimeOnDay = (daySec: number, secsOfDay: number, tz = currentTz()): number => timeOnDayIn(daySec, secsOfDay, tz)

// Day-of-week (0 = Sunday) in the zone. Callers: recurrence matching, the work-schedule week,
// habits, the calendar grids.
export const localDayOfWeek = (d: Date, tz = currentTz()): number => dayOfWeekIn(d, tz)
