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

// Day-of-week (0 = Sunday) in `tz` — the week-block anchor must use the local
// day, not getUTCDay (which flips at 8 PM Eastern).
export function localDayOfWeek(d: Date, tz = HOUSEHOLD_TZ): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(d)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
}
