// Opaque id + token generation. crypto.getRandomValues is available in the
// Workers runtime.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

// 12-char opaque id (~71 bits). Used for row ids and the device-facing share
// surface, like the portal's session ids.
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
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
  for (let i = 0; i < len; i++) out += SHORT_ALPHABET[bytes[i] % SHORT_ALPHABET.length]
  return out
}

// 6-digit pairing code. Human-typed once, short-lived — collision space is
// fine because pending codes expire in minutes and are scoped by lookup.
export function newPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (let i = 0; i < 6; i++) out += String(bytes[i] % 10)
  return out
}

// SHA-256 hex. We store the hash of a device token, never the token.
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const nowSec = () => Math.floor(Date.now() / 1000)

// Unix-seconds midnight (local-ish, UTC-based) for a given Date. Meal/event
// day bucketing. Good enough for a single-household prototype.
export function dayStart(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000)
}

// The household's wall-clock timezone. The meal week rolls over at LOCAL
// midnight, not the 20:00 (8 PM Eastern) you get when the day is bucketed in
// UTC. Single Québec household, so a fixed zone is fine; Intl handles DST.
export const HOUSEHOLD_TZ = 'America/Toronto'

// Wall-clock Y/M/D h:m:s for an instant in `tz` (via Intl, DST-aware).
function wallParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])) as Record<string, string>
  // Intl emits hour "24" at midnight in some runtimes — normalize to 0.
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second }
}

// Unix-seconds of LOCAL midnight (in `tz`) for the day containing `d`. The
// double-offset pass keeps it correct across a DST boundary. Use this for the
// meal-week window so "today" advances at midnight, not 8 PM.
export function localDayStart(d: Date, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(d, tz)
  const offset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - d.getTime()
  const wallMidnight = Date.UTC(w.y, w.mo - 1, w.d)
  const approx = new Date(wallMidnight - offset)
  const w2 = wallParts(approx, tz)
  const offset2 = Date.UTC(w2.y, w2.mo - 1, w2.d, w2.h, w2.mi, w2.s) - approx.getTime()
  return Math.floor((wallMidnight - offset2) / 1000)
}

// Local midnight (unix s) of the calendar day `n` days after the local-midnight
// `daySec`. Steps the day field (Date.UTC rolls month/year over) then snaps
// noon-of-that-day back to its local midnight — so a 23 h/25 h DST day doesn't
// drift the window an hour off (a plain `+ 86400` would). Mirrors the client
// addLocalDays in src/lib/localDay.ts so server windows match client grid keys.
export function addLocalDays(daySec: number, n: number, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(new Date(daySec * 1000), tz)
  const noon = new Date(Date.UTC(w.y, w.mo - 1, w.d + n, 12))
  return localDayStart(noon, tz)
}

// Unix-seconds of the WALL time `secsOfDay` seconds past local midnight on the
// local day that starts at `daySec` (itself a localDayStart). DST-aware via the
// same double-offset snap as localDayStart: on a spring-forward day a 09:00 wall
// time is a real 09:00 even though midnight+9h of elapsed seconds would land at
// 10:00 (the day "lost" an hour at 02:00). Used by _lib/recur so a recurring
// occurrence keeps the anchor's WALL time-of-day across a DST change, not drift an
// hour twice a year. (The non-existent 02:00–03:00 spring-forward gap is inherently
// ambiguous; nobody schedules it, so the snap landing on either side is fine.)
export function localTimeOnDay(daySec: number, secsOfDay: number, tz = HOUSEHOLD_TZ): number {
  const w = wallParts(new Date(daySec * 1000), tz)
  const wallTarget = Date.UTC(w.y, w.mo - 1, w.d) + secsOfDay * 1000 // desired wall clock as pseudo-UTC ms
  const dayOffset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - daySec * 1000
  const approx = new Date(wallTarget - dayOffset)
  const w2 = wallParts(approx, tz)
  const offset2 = Date.UTC(w2.y, w2.mo - 1, w2.d, w2.h, w2.mi, w2.s) - approx.getTime()
  return Math.floor((wallTarget - offset2) / 1000)
}

// Day-of-week (0 = Sunday) in `tz` — the week-block anchor must use the local
// day, not getUTCDay (which flips at 8 PM Eastern).
export function localDayOfWeek(d: Date, tz = HOUSEHOLD_TZ): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}
