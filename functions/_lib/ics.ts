// ICS (RFC 5545) → a bounded list of concrete occurrences.
//
// PURE. No fetch, no DB, no Date.now() — it takes text and a window and returns rows,
// so every rule below is unit-testable and the nasty parts (DST, all-day, EXDATE,
// cancelled occurrences) are testable without a network.
//
// DELIBERATELY PARTIAL, and it says so. RFC 5545 recurrence is enormous; a school
// calendar uses a small corner of it. This implements that corner and REPORTS what it
// could not expand (`partial`) instead of silently dropping it — because the failure
// mode that matters is not "an event is missing", it is "the calendar looks complete
// and is not". Anything unsupported still contributes its first occurrence, so the
// thing exists on the day it starts and nothing is invented after it.

export interface IcsOccurrence {
  uid: string
  title: string
  location: string | null
  /** unix secs. For an all-day event this is the local midnight of its date. */
  startAt: number
  /** exclusive end, unix secs; null when the VEVENT gave neither DTEND nor DURATION. */
  endAt: number | null
  allDay: boolean
}

export interface IcsResult {
  occurrences: IcsOccurrence[]
  /** VEVENTs whose recurrence rule we did not fully implement (see the header). */
  partial: number
  /** …and WHICH ones, by title. A count is true and unactionable — « 2 » does not
   *  tell a household which dates to go and check themselves. Capped: this is a
   *  hint on a settings card, not a report. */
  partialTitles: string[]
}

// A guard, not a preference: this runs inside a Worker on a shared cron, and an
// unbounded feed would be someone else's memory bill. A year of a busy school
// calendar is a few hundred rows; 2000 is generous and still finite.
export const MAX_OCCURRENCES = 2000
// How many times one RRULE may fire inside the window. A `FREQ=HOURLY` feed (legal,
// and not what anyone is subscribing to here) would otherwise produce thousands.
const MAX_PER_RULE = 400

const DAY = 86400

/** Unfold RFC 5545 continuation lines: a leading space/tab continues the previous. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/** `DTSTART;TZID=America/Toronto:20260915T090000` → name, params, value. */
function splitLine(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(':')
  if (colon < 0) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = left.split(';')
  const name = (parts[0] ?? '').toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

/** Unescape the text escapes ICS uses inside SUMMARY/LOCATION. */
function unescapeText(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim()
}

/**
 * The UTC offset, in seconds, that `zone` was at the given instant.
 *
 * NO TZDATA TABLE. `Intl.DateTimeFormat` already carries the whole IANA database in
 * every JS runtime, including a Worker — it just does not expose offsets directly.
 * So: format the instant AS that zone, read the wall clock back, and the difference
 * between that and the same instant's UTC wall clock IS the offset. It handles DST by
 * construction, because it asks about one specific instant rather than about a zone.
 *
 * Returns null for a TZID the runtime does not know (a Windows-style « Eastern
 * Standard Time », an X- extension, a typo), which the caller treats as "no zone
 * information" rather than guessing.
 */
// One formatter per ZONE, built once. Not a micro-optimisation: this is called for
// every DTSTART, every DTEND and every EXDATE in the feed — a school calendar is
// hundreds of those — and `new Intl.DateTimeFormat` costs ~100µs each inside a Worker
// whose whole budget is measured in milliseconds. That is exactly how /api/year once
// burned 1.8s, which is why `intl-rule.test.ts` refuses an uncached construction and
// why this file carries an ALLOWED entry naming this cache.
// Unbounded only in theory: the key space is the set of TZIDs one household's feeds
// mention, which is one or two.
const zoneFmtCache = new Map<string, Intl.DateTimeFormat | null>()

function zoneFmt(zone: string): Intl.DateTimeFormat | null {
  const hit = zoneFmtCache.get(zone)
  if (hit !== undefined) return hit
  let made: Intl.DateTimeFormat | null = null
  try {
    made = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    // An unknown timeZone makes the constructor throw — that is the detection, and
    // caching the null means a malformed feed does not re-throw once per line.
    made = null
  }
  zoneFmtCache.set(zone, made)
  return made
}

function zoneOffsetSec(zone: string, atMs: number): number | null {
  try {
    const dtf = zoneFmt(zone)
    if (!dtf) return null
    const p: Record<string, string> = {}
    for (const { type, value } of dtf.formatToParts(new Date(atMs))) p[type] = value
    // `hour` can come back as "24" at midnight in some engines' hourCycle handling.
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour) % 24,
      Number(p.minute),
      Number(p.second),
    )
    return Math.round((asUtc - atMs) / 1000)
  } catch {
    // Belt and braces: `zoneFmt` already caught the unknown-zone throw, but a
    // formatToParts on an out-of-range date can still fail, and a malformed feed must
    // never take the whole nightly refresh down.
    return null
  }
}

/**
 * A date-time value → unix seconds, plus whether it was a whole-day value.
 *
 * Three forms appear in the wild:
 *   · `20260915T130000Z` — UTC. Exact.
 *   · `20260915`          — a DATE. All-day, anchored at the SERVER's local midnight,
 *                           the same convention every other all-day row here uses
 *                           (localDayStart). A whole day has no zone: the school's
 *                           « journée pédagogique » is that DATE wherever you read it.
 *   · `20260915T130000` with a TZID — a wall clock in a named zone. Resolved through
 *                           `zoneOffsetSec` above, so a feed published in another
 *                           timezone lands at the right INSTANT rather than at the
 *                           right number of hours.
 *
 * With no TZID and no Z, the wall clock is read as the server's own — which is what
 * RFC 5545 calls "floating", and what the generators that omit the zone almost always
 * mean (a local calendar, published locally).
 *
 * Two passes for a TZID, deliberately: the offset depends on the instant, and the
 * instant is what we are computing. Guess with the zone's offset at the naive instant,
 * then re-ask at the corrected one. That second pass is what makes the hour around a
 * DST change land correctly instead of an hour out.
 */
function parseDateValue(value: string, params: Record<string, string>): { at: number; allDay: boolean } | null {
  const v = value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v)
    if (!m) return null
    // Local midnight — the same anchor meals/day-notes/all-day events already use.
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
    return { at: Math.floor(d.getTime() / 1000), allDay: true }
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v)
  if (!dt) return null
  const [, y, mo, da, h, mi, s, z] = dt
  const naiveUtc = Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s))
  if (z) return { at: Math.floor(naiveUtc / 1000), allDay: false }

  const tzid = params.TZID
  if (tzid) {
    // Two passes — see the header. The first offset is looked up at the naive
    // instant, which is off by at most the offset itself; the second is looked up at
    // the corrected instant, which is right even inside a DST transition hour.
    const guess = zoneOffsetSec(tzid, naiveUtc)
    if (guess !== null) {
      const firstPass = naiveUtc - guess * 1000
      const refined = zoneOffsetSec(tzid, firstPass) ?? guess
      return { at: Math.floor((naiveUtc - refined * 1000) / 1000), allDay: false }
    }
    // Unknown TZID: fall through to floating, which is the same answer we gave
    // before zones were understood at all — never worse, and never a guess dressed
    // up as a lookup.
  }
  const d = new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s))
  return { at: Math.floor(d.getTime() / 1000), allDay: false }
}

/** `PT1H30M` / `P1D` → seconds. Returns null for anything with a month/year part,
 *  which cannot be expressed in seconds without knowing WHICH month. */
function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const [w, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0))
  const total = w * 7 * DAY + d * DAY + h * 3600 + mi * 60 + s
  return sign * total
}

const WEEKDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

interface Rrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  byDay: number[] // weekly only, 0=Sun
  count: number | null
  until: number | null // unix secs
  /** true when the rule used a part we do not implement — the caller counts these. */
  unsupported: boolean
}

function parseRrule(v: string): Rrule | null {
  const parts: Record<string, string> = {}
  for (const kv of v.split(';')) {
    const eq = kv.indexOf('=')
    if (eq > 0) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1)
  }
  const freq = (parts.FREQ ?? '').toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  // The parts we deliberately do not implement. Naming them (rather than a catch-all)
  // keeps the list reviewable and makes adding one a one-line change.
  const unsupported =
    ['BYMONTHDAY', 'BYSETPOS', 'BYMONTH', 'BYYEARDAY', 'BYWEEKNO', 'BYHOUR', 'BYMINUTE'].some((k) => k in parts) ||
    // BYDAY on anything but WEEKLY is positional by nature — « FREQ=MONTHLY;BYDAY=2TU »
    // is "the second Tuesday", which `step` cannot produce. It is listed separately
    // because BYDAY IS supported for WEEKLY, so a flat membership test would have
    // thrown away the one form that works.
    (freq !== 'WEEKLY' && 'BYDAY' in parts)
  const byDay =
    freq === 'WEEKLY' && parts.BYDAY
      ? parts.BYDAY.split(',')
          // A prefixed BYDAY (`2MO` = the second Monday) is positional — that is the
          // BYSETPOS family, not a plain weekday, so it counts as unsupported rather
          // than being read as "every Monday".
          .map((d) => WEEKDAY[d.trim().toUpperCase()])
          .filter((n): n is number => typeof n === 'number')
      : []
  const prefixedByDay = freq === 'WEEKLY' && !!parts.BYDAY && /\d/.test(parts.BYDAY)
  const until = parts.UNTIL ? (parseDateValue(parts.UNTIL, {})?.at ?? null) : null
  const count = parts.COUNT ? Number(parts.COUNT) : null
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? 1) || 1),
    byDay,
    count: Number.isFinite(count) ? count : null,
    until,
    unsupported: unsupported || prefixedByDay,
  }
}

/** Step a start date by one recurrence interval, in LOCAL time so a monthly/yearly
 *  step lands on the same calendar day and a DST boundary does not shift the clock. */
function step(at: number, r: Rrule, n: number): number {
  const d = new Date(at * 1000)
  if (r.freq === 'DAILY') d.setDate(d.getDate() + r.interval * n)
  else if (r.freq === 'WEEKLY') d.setDate(d.getDate() + 7 * r.interval * n)
  else if (r.freq === 'MONTHLY') d.setMonth(d.getMonth() + r.interval * n)
  else d.setFullYear(d.getFullYear() + r.interval * n)
  return Math.floor(d.getTime() / 1000)
}

/**
 * Expand one VEVENT into the occurrences that fall in [from, to).
 *
 * WEEKLY + BYDAY is expanded per week rather than per start: « every Tuesday and
 * Thursday » is one rule with two days, and stepping the start alone would only ever
 * produce the day DTSTART happens to fall on.
 */
function expand(startAt: number, r: Rrule | null, from: number, to: number): number[] {
  if (!r) return startAt >= from && startAt < to ? [startAt] : []
  const out: number[] = []
  let fired = 0
  const weekly = r.freq === 'WEEKLY' && r.byDay.length > 0
  const base = new Date(startAt * 1000)
  for (let n = 0; n < MAX_PER_RULE && out.length < MAX_PER_RULE; n++) {
    const anchor = step(startAt, r, n)
    if (anchor >= to && !weekly) break
    const candidates: number[] = []
    if (weekly) {
      // The Sunday of this rule-week, then each requested weekday from it.
      const wk = new Date(anchor * 1000)
      wk.setDate(wk.getDate() - wk.getDay())
      for (const wd of r.byDay) {
        const d = new Date(wk.getTime())
        d.setDate(d.getDate() + wd)
        d.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0)
        const at = Math.floor(d.getTime() / 1000)
        if (at >= startAt) candidates.push(at)
      }
      candidates.sort((a, b) => a - b)
    } else {
      candidates.push(anchor)
    }
    let past = true
    for (const at of candidates) {
      if (r.until != null && at > r.until) continue
      fired++
      if (r.count != null && fired > r.count) return out
      if (at < to) past = false
      if (at >= from && at < to) out.push(at)
    }
    // A weekly rule only stops once the whole week is past the window.
    if (weekly && past && anchor >= to) break
  }
  return out
}

/**
 * Parse an ICS document and return every occurrence inside [from, to).
 *
 * `from`/`to` are unix seconds. Occurrences are capped at MAX_OCCURRENCES; past that
 * the rest are dropped and the caller sees a short list rather than an OOM.
 */
export function parseIcs(text: string, from: number, to: number): IcsResult {
  const lines = unfold(text)
  const occurrences: IcsOccurrence[] = []
  let partial = 0
  const partialTitles: string[] = []

  // Which (uid, recurrence-id) pairs the feed has OVERRIDDEN or cancelled. A VEVENT
  // carrying RECURRENCE-ID replaces exactly one occurrence of its series; one with
  // STATUS:CANCELLED removes it. Collected in a first pass so the series expansion
  // below can skip them whatever order they appear in — which is the whole reason
  // this is expanded here rather than mapped onto our own Recur shape.
  const overridden = new Set<string>()
  let inEvent = false
  let recurrenceId: number | null = null
  let uid = ''
  for (const line of lines) {
    const p = splitLine(line)
    if (!p) continue
    if (p.name === 'BEGIN' && p.value.trim().toUpperCase() === 'VEVENT') {
      inEvent = true
      recurrenceId = null
      uid = ''
      continue
    }
    if (p.name === 'END' && p.value.trim().toUpperCase() === 'VEVENT') {
      if (inEvent && uid && recurrenceId != null) overridden.add(`${uid}@${recurrenceId}`)
      inEvent = false
      continue
    }
    if (!inEvent) continue
    if (p.name === 'UID') uid = p.value.trim()
    else if (p.name === 'RECURRENCE-ID') recurrenceId = parseDateValue(p.value, p.params)?.at ?? null
  }

  // Second pass: the events themselves.
  let cur: Record<string, { params: Record<string, string>; value: string }> | null = null
  const exdates: number[] = []
  for (const line of lines) {
    const p = splitLine(line)
    if (!p) continue
    if (p.name === 'BEGIN' && p.value.trim().toUpperCase() === 'VEVENT') {
      cur = {}
      exdates.length = 0
      continue
    }
    if (p.name === 'END' && p.value.trim().toUpperCase() === 'VEVENT') {
      if (cur) flush(cur, [...exdates])
      cur = null
      continue
    }
    if (!cur) continue
    if (p.name === 'EXDATE') {
      for (const one of p.value.split(',')) {
        const at = parseDateValue(one, p.params)?.at
        if (at != null) exdates.push(at)
      }
      continue
    }
    cur[p.name] = { params: p.params, value: p.value }
  }

  function flush(ev: Record<string, { params: Record<string, string>; value: string }>, ex: number[]) {
    if (occurrences.length >= MAX_OCCURRENCES) return
    // A cancelled event contributes nothing — this is the case that makes expanding
    // HERE rather than re-deriving later the only correct option.
    if ((ev.STATUS?.value ?? '').trim().toUpperCase() === 'CANCELLED') return
    const dt = ev.DTSTART && parseDateValue(ev.DTSTART.value, ev.DTSTART.params)
    if (!dt) return
    const title = unescapeText(ev.SUMMARY?.value ?? '').slice(0, 200)
    if (!title) return
    const location = ev.LOCATION ? unescapeText(ev.LOCATION.value).slice(0, 200) || null : null
    const id = (ev.UID?.value ?? '').trim() || `${title}@${dt.at}`

    // Length: DTEND wins, else DURATION, else a point (an all-day with neither is one
    // whole day, which is what a bare DATE means).
    let length: number | null = null
    if (ev.DTEND) {
      const end = parseDateValue(ev.DTEND.value, ev.DTEND.params)
      if (end) length = end.at - dt.at
    } else if (ev.DURATION) {
      length = parseDuration(ev.DURATION.value)
    } else if (dt.allDay) {
      length = DAY
    }

    const rule = ev.RRULE ? parseRrule(ev.RRULE.value) : null
    if (ev.RRULE && (!rule || rule.unsupported)) {
      partial++
      if (partialTitles.length < 8 && !partialTitles.includes(title)) partialTitles.push(title)
    }

    // An override VEVENT (RECURRENCE-ID) is a single replacement occurrence; it must
    // not be re-expanded by its own series' rule.
    const isOverride = !!ev['RECURRENCE-ID']
    const starts = isOverride
      ? dt.at >= from && dt.at < to
        ? [dt.at]
        : []
      : expand(dt.at, rule && !rule.unsupported ? rule : null, from, to)

    for (const at of starts) {
      if (occurrences.length >= MAX_OCCURRENCES) return
      if (ex.includes(at)) continue
      if (!isOverride && overridden.has(`${id}@${at}`)) continue
      occurrences.push({
        uid: id,
        title,
        location,
        startAt: at,
        endAt: length != null ? at + length : null,
        allDay: dt.allDay,
      })
    }
  }

  occurrences.sort((a, b) => a.startAt - b.startAt)
  return { occurrences, partial, partialTitles }
}
