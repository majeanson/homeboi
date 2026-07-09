import { describe, it, expect } from 'vitest'
import { localDayStart } from './ids'
import {
  fmtDay,
  fmtDateTime,
  expandAskEvents,
  birthdaysForPrompt,
  carnetDuesForPrompt,
  contactDisplayName,
  buildAskPromptLines,
  EVENT_CAP,
  BIRTHDAY_CAP,
  CARNET_CAP,
  type AskSnapshot,
  type AskEventRow,
  type AskRecurEventRow,
} from './askContext'
import type { BirthdayPerson } from './birthdays'
import type { CarnetLifeItem } from './carnetLife'

// LOCAL-midnight (America/Toronto) of a calendar date — noon UTC is safely inside
// that civil date in any North-American zone (mirrors recur.test.ts/birthdays.test.ts).
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))

const emptySnapshot: AskSnapshot = {
  today: d(2026, 6, 8),
  meals: [],
  events: [],
  birthdays: [],
  list: [],
  chores: [],
  notes: [],
  contacts: [],
  businesses: [],
  carnetDues: [],
}

describe('fmtDay / fmtDateTime — FR/EN formatting', () => {
  const wed = d(2026, 6, 8) // Wed 2026-07-08, local midnight

  it('formats a day in French (weekday + day + month)', () => {
    expect(fmtDay(wed, 'fr')).toMatch(/mercredi/i)
    expect(fmtDay(wed, 'fr')).toMatch(/juillet/i)
  })
  it('formats a day in English', () => {
    expect(fmtDay(wed, 'en')).toMatch(/wednesday/i)
    expect(fmtDay(wed, 'en')).toMatch(/july/i)
  })
  it('an all-day datetime is just the day (no time)', () => {
    expect(fmtDateTime(wed, 1, 'fr')).toBe(fmtDay(wed, 'fr'))
  })
  it('a timed datetime appends the local time', () => {
    const at9 = wed + 9 * 3600 // ~9am local (well inside DST-safe range)
    const s = fmtDateTime(at9, 0, 'fr')
    expect(s.startsWith(fmtDay(wed, 'fr'))).toBe(true)
    expect(s).not.toBe(fmtDay(wed, 'fr')) // a time suffix was appended
  })
})

describe('expandAskEvents — recurring expansion + merge + cap', () => {
  const rangeStart = d(2026, 6, 1)
  const rangeEnd = d(2026, 6, 30)

  it('passes one-off events through untouched', () => {
    const oneOff: AskEventRow[] = [{ title: 'Dentiste', start_at: d(2026, 6, 10), all_day: 1 }]
    const out = expandAskEvents(oneOff, [], rangeStart, rangeEnd)
    expect(out).toEqual(oneOff)
  })

  it('expands a weekly recurring series into every occurrence inside the window', () => {
    // Anchored on a Wednesday, weekly — expandRange (recur.ts) resolves the actual days.
    const anchor = d(2026, 5, 3) // Wed 2026-06-03
    const recurring: AskRecurEventRow[] = [
      { title: 'Bac bleu', start_at: anchor, all_day: 1, recur_json: JSON.stringify({ freq: 'weekly', weekdays: [3] }) },
    ]
    const out = expandAskEvents([], recurring, rangeStart, rangeEnd)
    expect(out.length).toBeGreaterThan(1) // multiple Wednesdays in a month window
    for (const e of out) expect(e.title).toBe('Bac bleu')
    // sorted ascending
    for (let i = 1; i < out.length; i++) expect(out[i].start_at).toBeGreaterThan(out[i - 1].start_at)
  })

  it('a malformed/null recur rule contributes nothing (never crashes)', () => {
    const recurring: AskRecurEventRow[] = [{ title: 'Broken', start_at: d(2026, 6, 5), all_day: 1, recur_json: '{not json' }]
    expect(expandAskEvents([], recurring, rangeStart, rangeEnd)).toHaveLength(0)
  })

  it('merges one-off and recurring, sorted chronologically', () => {
    const oneOff: AskEventRow[] = [{ title: 'Rendez-vous', start_at: d(2026, 6, 20), all_day: 1 }]
    const recurring: AskRecurEventRow[] = [
      { title: 'Corvée', start_at: d(2026, 5, 1), all_day: 1, recur_json: JSON.stringify({ freq: 'daily', interval: 7 }) },
    ]
    const out = expandAskEvents(oneOff, recurring, rangeStart, rangeEnd)
    expect(out.some((e) => e.title === 'Rendez-vous')).toBe(true)
    expect(out.some((e) => e.title === 'Corvée')).toBe(true)
    for (let i = 1; i < out.length; i++) expect(out[i].start_at).toBeGreaterThanOrEqual(out[i - 1].start_at)
  })

  it('caps the merged, sorted total at EVENT_CAP', () => {
    const oneOff: AskEventRow[] = Array.from({ length: EVENT_CAP + 20 }, (_, i) => ({
      title: `Item ${i}`,
      start_at: rangeStart + i * 3600,
      all_day: 0,
    }))
    const out = expandAskEvents(oneOff, [], rangeStart, rangeEnd)
    expect(out).toHaveLength(EVENT_CAP)
  })
})

describe('birthdaysForPrompt — derivation + cap', () => {
  it('surfaces a birthday within the window, with age', () => {
    const people: BirthdayPerson[] = [{ key: 'member:lea', name: 'Léa', birthday: '2020-06-24', memberId: 'lea' }]
    const out = birthdaysForPrompt(people, d(2026, 5, 1), d(2026, 6, 1))
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Léa')
    expect(out[0].age).toBe(6)
  })

  it('caps at BIRTHDAY_CAP even with a large extended family in-window', () => {
    // Spread across the year so every person's birthday falls inside a full-year window.
    const people: BirthdayPerson[] = Array.from({ length: BIRTHDAY_CAP + 15 }, (_, i) => ({
      key: `member:${i}`,
      name: `Personne ${i}`,
      birthday: `1990-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      memberId: `${i}`,
    }))
    const out = birthdaysForPrompt(people, d(2026, 0, 1), d(2027, 0, 1))
    expect(out.length).toBeLessThanOrEqual(BIRTHDAY_CAP)
  })
})

describe('carnetDuesForPrompt — next-dues + cap', () => {
  const now = d(2026, 0, 1)

  it('surfaces an overdue/soon carnet, sorted soonest-first', () => {
    const items: CarnetLifeItem[] = [
      { carnetId: 'a', name: 'Vieux chauffe-eau', kind: 'appliance', color: null, installedAt: d(2000, 0, 1), lifespanMonths: 12 },
      { carnetId: 'b', name: 'Toiture neuve', kind: 'system', color: null, installedAt: d(2025, 0, 1), lifespanMonths: 1200 },
    ]
    const out = carnetDuesForPrompt(items, now)
    expect(out.map((s) => s.carnetId)).toEqual(['a']) // 'b' stays quiet (far off)
  })

  it('caps at CARNET_CAP', () => {
    const items: CarnetLifeItem[] = Array.from({ length: CARNET_CAP + 8 }, (_, i) => ({
      carnetId: `c${i}`,
      name: `Chose ${i}`,
      kind: 'thing',
      color: null,
      installedAt: d(2000, 0, 1),
      lifespanMonths: 12, // all overdue → all in window
    }))
    const out = carnetDuesForPrompt(items, now)
    expect(out).toHaveLength(CARNET_CAP)
  })
})

describe('contactDisplayName', () => {
  it('prefers the nickname when set', () => {
    expect(contactDisplayName({ first_name: 'Marie', last_name: 'Tremblay', nickname: 'Mémé' })).toBe('Mémé')
  })
  it('falls back to first + last name', () => {
    expect(contactDisplayName({ first_name: 'Jean', last_name: 'Tremblay', nickname: null })).toBe('Jean Tremblay')
  })
  it('falls back to an em dash when everything is blank', () => {
    expect(contactDisplayName({ first_name: '', last_name: '', nickname: null })).toBe('—')
  })
})

describe('buildAskPromptLines — sections, FR/EN, omission of empty sections', () => {
  it('always opens with the dated "today" line', () => {
    const lines = buildAskPromptLines(emptySnapshot, 'fr')
    expect(lines[0]).toMatch(/^Aujourd'hui/)
  })

  it('omits every section when the snapshot is empty (no padding)', () => {
    const lines = buildAskPromptLines(emptySnapshot, 'fr')
    expect(lines).toHaveLength(1) // just the "today" line
  })

  it('renders meals, events, birthdays, list, chores, notes — FR', () => {
    const snap: AskSnapshot = {
      ...emptySnapshot,
      meals: [{ title: 'Spaghetti', date: d(2026, 6, 9), slot: 'supper', is_leftover: 0 }],
      events: [{ title: 'Dentiste', start_at: d(2026, 6, 10), all_day: 1 }],
      birthdays: [{ id: 'birthday:member:lea:2026', personKey: 'member:lea', name: 'Léa', at: d(2026, 6, 24), age: 6, memberId: 'lea', giftIdeas: null }],
      list: [{ text: 'Lait' }],
      chores: [{ title: 'Poubelles' }],
      notes: [{ text: 'Ne pas oublier le lunch' }],
    }
    const text = buildAskPromptLines(snap, 'fr').join('\n')
    expect(text).toContain('Repas planifiés :')
    expect(text).toContain('Spaghetti')
    expect(text).toContain('souper')
    expect(text).toContain('Événements :')
    expect(text).toContain('Dentiste')
    expect(text).toContain('Anniversaires :')
    expect(text).toContain('Léa')
    expect(text).toContain('6 ans')
    expect(text).toContain('Lait')
    expect(text).toContain('Poubelles')
    expect(text).toContain('Ne pas oublier le lunch')
  })

  it('renders the same sections in English with English labels', () => {
    const snap: AskSnapshot = {
      ...emptySnapshot,
      meals: [{ title: 'Spaghetti', date: d(2026, 6, 9), slot: 'supper', is_leftover: 0 }],
      birthdays: [{ id: 'birthday:member:lea:2026', personKey: 'member:lea', name: 'Léa', at: d(2026, 6, 24), age: 6, memberId: 'lea', giftIdeas: null }],
    }
    const text = buildAskPromptLines(snap, 'en').join('\n')
    expect(text).toMatch(/^Today:/)
    expect(text).toContain('Planned meals:')
    expect(text).toContain('supper')
    expect(text).toContain('Birthdays:')
    expect(text).toContain('turning 6')
  })

  it('a leftover meal is tagged', () => {
    const snap: AskSnapshot = { ...emptySnapshot, meals: [{ title: 'Pâté chinois', date: d(2026, 6, 9), slot: 'supper', is_leftover: 1 }] }
    expect(buildAskPromptLines(snap, 'fr').join('\n')).toContain('[restant]')
    expect(buildAskPromptLines(snap, 'en').join('\n')).toContain('[leftover]')
  })

  it('renders cercle contacts with phone/email, preferring nickname', () => {
    const snap: AskSnapshot = {
      ...emptySnapshot,
      contacts: [{ first_name: 'Marie', last_name: 'Tremblay', nickname: 'Mémé', phone: '450-555-0100', email: null }],
    }
    const text = buildAskPromptLines(snap, 'fr').join('\n')
    expect(text).toContain('Le cercle (personnes) :')
    expect(text).toContain('Mémé')
    expect(text).toContain('450-555-0100')
  })

  it('renders businesses with category + phone (the « numéro du vétérinaire » case)', () => {
    const snap: AskSnapshot = {
      ...emptySnapshot,
      businesses: [{ name: 'Clinique Vétérinaire du Coin', category: 'Vétérinaire', phone: '450-555-0199' }],
    }
    const text = buildAskPromptLines(snap, 'fr').join('\n')
    expect(text).toContain('Services & commerces :')
    expect(text).toContain('Clinique Vétérinaire du Coin')
    expect(text).toContain('Vétérinaire')
    expect(text).toContain('450-555-0199')
  })

  it('renders carnet next-dues, flagging an overdue one (the « prochain entretien » case)', () => {
    const now = emptySnapshot.today
    const snap: AskSnapshot = {
      ...emptySnapshot,
      carnetDues: carnetDuesForPrompt(
        [{ carnetId: 'a', name: 'Chauffe-eau', kind: 'appliance', color: null, installedAt: d(2000, 0, 1), lifespanMonths: 12 }],
        now,
      ),
    }
    const text = buildAskPromptLines(snap, 'fr').join('\n')
    expect(text).toContain('À prévoir (entretien) :')
    expect(text).toContain('Chauffe-eau')
    expect(text).toContain('(dépassé)')
  })
})
