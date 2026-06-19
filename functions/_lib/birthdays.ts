// Automatic birthday occurrences for the calendar/agenda — DERIVED from each
// person's stored birthday, never materialized as event rows. Members and contacts
// both carry a `birthday` ('YYYY-MM-DD', or '0000-MM-DD' when the year is unknown);
// the board + month handlers synthesize all-day occurrences in their window so a
// birthday shows up like any other dated item without anyone creating or
// maintaining an event. Edit a person's birthday → the calendar updates next poll.
//
// All-day → each occurrence sits at LOCAL midnight of the birthday's calendar date
// (the same day key meals/notes use). A Feb-29 birthday only lands in leap years
// (no silent rollover to Mar 1) — the same calm choice yearly recurrence makes.

import { localDayStart } from './ids'

export interface BirthdayPerson {
  key: string // 'member:<id>' | 'contact:<id>' — stable, kind-tagged
  name: string
  birthday: string // 'YYYY-MM-DD' or '0000-MM-DD'
  memberId: string | null // a member id for face/colour attribution (null = standalone contact)
}

export interface BirthdayOccurrence {
  id: string // `birthday:<key>:<year>` — stable, never collides with an event id
  personKey: string
  name: string
  at: number // unix seconds, LOCAL midnight of the birthday day
  age: number | null // the age they turn, when the birth year is known
  memberId: string | null
}

function parseBirthday(s: string): { year: number; month: number; day: number; yearKnown: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day, yearKnown: year !== 0 }
}

// Every person's birthday occurrence(s) falling in [rangeStart, rangeEnd) (unix
// seconds; rangeStart a local-midnight day boundary). Pure + deterministic.
export function birthdayOccurrences(people: BirthdayPerson[], rangeStart: number, rangeEnd: number): BirthdayOccurrence[] {
  const out: BirthdayOccurrence[] = []
  // The window spans at most ~45 days, so 1–2 calendar years (a Dec→Jan edge).
  const y0 = new Date(rangeStart * 1000).getUTCFullYear()
  const y1 = new Date(Math.max(rangeStart, rangeEnd - 1) * 1000).getUTCFullYear()
  for (const p of people) {
    const b = parseBirthday(p.birthday)
    if (!b) continue
    for (let y = y0; y <= y1; y++) {
      // Noon-UTC of the calendar date is safely inside that civil date in any
      // North-American zone; localDayStart pins it to the household's local midnight.
      const at = localDayStart(new Date(Date.UTC(y, b.month - 1, b.day, 12)))
      const d = new Date(at * 1000)
      // Reject a rollover (Feb 29 in a non-leap year became Mar 1) — only real dates.
      if (d.getUTCMonth() !== b.month - 1 || d.getUTCDate() !== b.day) continue
      if (at >= rangeStart && at < rangeEnd) {
        out.push({
          id: `birthday:${p.key}:${y}`,
          personKey: p.key,
          name: p.name,
          at,
          age: b.yearKnown ? y - b.year : null,
          memberId: p.memberId,
        })
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

// One row from fetchBirthdayPeople's UNION (members + standalone contacts).
interface PersonRow {
  id: string
  name: string | null
  birthday: string | null
  is_member: number
}

// The people who can have a birthday in the calendar: every member (its birthday
// may live on a hard-linked contact, so COALESCE it) + every standalone contact
// (member_id IS NULL — a linked contact is already covered by its member, so it's
// excluded to avoid a double birthday). Returns only those with a birthday set.
export async function fetchBirthdayPeople(db: D1Database, householdId: string): Promise<BirthdayPerson[]> {
  const res = await db
    .prepare(
      `SELECT m.id AS id, m.display_name AS name, COALESCE(m.birthday, MAX(c.birthday)) AS birthday, 1 AS is_member
         FROM members m
         LEFT JOIN contacts c ON c.member_id = m.id AND c.household_id = m.household_id
        WHERE m.household_id = ?
        GROUP BY m.id
       UNION ALL
       SELECT id, COALESCE(NULLIF(TRIM(nickname), ''), TRIM(first_name || ' ' || last_name)) AS name, birthday, 0 AS is_member
         FROM contacts
        WHERE household_id = ? AND member_id IS NULL`,
    )
    .bind(householdId, householdId)
    .all<PersonRow>()
  return res.results
    .filter((r): r is PersonRow & { birthday: string } => !!r.birthday)
    .map((r) => ({
      key: `${r.is_member ? 'member' : 'contact'}:${r.id}`,
      name: r.name?.trim() || '—',
      birthday: r.birthday,
      memberId: r.is_member ? r.id : null,
    }))
}
