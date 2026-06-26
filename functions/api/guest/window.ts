import { ok, forbidden, parseJsonArray } from '../../_lib/json'
import { authed } from '../../_lib/route'
import { localDayStart, addLocalDays } from '../../_lib/ids'
import { parseRecur, expandRange } from '../../_lib/recur'
import { householdShareInfo } from '../../_lib/shareModes'
import { decodeIntakeScope } from '../../_lib/intake'
import { fetchBirthdayPeople, birthdayOccurrences } from '../../_lib/birthdays'
import type { GuestKind } from '../../_lib/auth'
import type { Env } from '../../_lib/env'

// The ONE curated read endpoint a non-showcase share link is allowed to hit (the
// per-kind allowlist in worker/index.ts keeps these kinds off everything else).
// It returns a hand-picked subset — never the whole household — so the privacy
// boundary is real, not cosmetic:
//   • welcome  → just the visitor card: wifi, bin day, house rules.
//   • sitter   → that, plus today's plan, bedtime routines, "à savoir" (allergies/
//                notes on the kids), and emergency contacts.
//   • family   → the grandparents' window: grandkids' upcoming dates, birthdays and
//                the latest photos. No wifi/rules — cross-household warmth (#36).
// showcase uses the real /api/board (full read-only hub), not this.
//
// Everything except the migration-0072 share fields is READ from existing data, so
// there's no duplicate source of truth.

interface EvOut {
  id: string
  title: string
  start_at: number
  all_day: number
  who: string | null // member's first name, when the event is tied to a face
}

const CURATED: GuestKind[] = ['sitter', 'welcome', 'family']

export const onRequestGet = authed(async (ctx, actor) => {
  // The kind: a guest carries its own (bound in the token); an operator may preview
  // a curated view with ?kind= (handy for the issuance editor). showcase doesn't use
  // this endpoint — it reads the real hub — so it's rejected here.
  const url = new URL(ctx.request.url)
  const previewKind = url.searchParams.get('kind') as GuestKind | null
  const kind: GuestKind | null =
    actor.scope === 'guest'
      ? (actor.guestKind ?? 'showcase')
      : previewKind && (CURATED.includes(previewKind) || previewKind === 'intake' || previewKind === 'postbox')
        ? previewKind
        : null

  // ---- intake: the family-info form greeting --------------------------------
  // Deliberately minimal — only the addressed person's first name (for "Bonjour
  // Marie, complète ta fiche") plus the field scope the operator chose. NO stored
  // private fields are returned, so the form starts blank and the link can't be
  // used to read the household.
  if (kind === 'intake') {
    const targetKey = actor.scope === 'guest' ? (actor.guestTargetKey ?? null) : url.searchParams.get('target')
    // Operator preview has no token scope → show everything; a real guest carries it.
    const fields = actor.scope === 'guest' ? (actor.guestFields ?? null) : null
    return ok(await intakeGreeting(ctx.env, actor.householdId, targetKey, fields))
  }

  // ---- postbox: « La boîte aux lettres » greeting ---------------------------
  // Just the household name, so the sender's scene can say "Laisse un mot à la
  // Maisonnée de …". A write surface, not a read one — no stored data returned.
  if (kind === 'postbox') {
    const nameRow = await ctx.env.DB.prepare('SELECT name FROM households WHERE id = ?')
      .bind(actor.householdId)
      .first<{ name: string }>()
    return ok({ kind: 'postbox' as const, householdName: nameRow?.name ?? '' })
  }

  if (!kind || !CURATED.includes(kind)) {
    return forbidden('This view is for a babysitter, welcome, or family link.')
  }

  const hh = actor.householdId
  const nameRow = await ctx.env.DB.prepare('SELECT name FROM households WHERE id = ?')
    .bind(hh)
    .first<{ name: string }>()
  const householdName = nameRow?.name ?? ''

  // ---- family: the grandparents' window -------------------------------------
  if (kind === 'family') return ok(await familyWindow(ctx.env, hh, householdName))

  const share = await householdShareInfo(ctx.env, hh)
  const base = {
    kind,
    householdName,
    wifi: { ssid: share.wifiSsid, password: share.wifiPassword },
    houseRules: share.houseRules,
    binDay: share.binDay,
  }

  // welcome stops at the visitor card — no people, no agenda.
  if (kind === 'welcome') return ok(base)

  // ---- sitter: today's handoff ----------------------------------------------
  const today = localDayStart(new Date(Date.now()))
  const tomorrow = addLocalDays(today, 1)

  const [members, oneOff, recurring, meals, routines, contacts] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, display_name, is_child, notes FROM members WHERE household_id = ? ORDER BY position, created_at',
    )
      .bind(hh)
      .all<{ id: string; display_name: string; is_child: number; notes: string | null }>(),
    // Today's one-off events.
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, today, tomorrow)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null }>(),
    // Recurring series — expanded onto today below (same engine the board uses).
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, member_id, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json: string }>(),
    // Today's meals (all slots).
    ctx.env.DB.prepare(
      'SELECT id, slot, title FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY position, created_at, id',
    )
      .bind(hh, today, tomorrow)
      .all<{ id: string; slot: string; title: string }>(),
    // Bedtime routines — time_of_day = 'evening' (migration 0016). The cards ARE the steps.
    ctx.env.DB.prepare(
      "SELECT id, name, member_id, cards_json FROM routines WHERE household_id = ? AND time_of_day = 'evening' ORDER BY created_at",
    )
      .bind(hh)
      .all<{ id: string; name: string; member_id: string | null; cards_json: string }>(),
    // Emergency contacts — Le cercle contacts the operator tagged "urgence".
    ctx.env.DB.prepare(
      "SELECT first_name, last_name, phone, tags FROM contacts WHERE household_id = ? AND phone IS NOT NULL AND phone != ''",
    )
      .bind(hh)
      .all<{ first_name: string; last_name: string; phone: string | null; tags: string }>(),
  ])

  const memberName = (id: string | null): string | null =>
    (id && members.results.find((m) => m.id === id)?.display_name) || null

  const toEv = (r: { id: string; title: string; start_at: number; all_day: number; member_id: string | null }): EvOut => ({
    id: r.id,
    title: r.title,
    start_at: r.start_at,
    all_day: r.all_day,
    who: memberName(r.member_id),
  })

  const events: EvOut[] = [...oneOff.results.map(toEv)]
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, today, tomorrow)) {
      events.push({ id: `${e.id}#${at}`, title: e.title, start_at: at, all_day: e.all_day, who: memberName(e.member_id) })
    }
  }
  events.sort((a, b) => b.all_day - a.all_day || a.start_at - b.start_at)

  // Cards on a routine are { icon, label } — the steps a sitter reads off.
  const isCard = (v: unknown): v is { icon?: string; label?: string } => typeof v === 'object' && v !== null
  const bedtimeRoutines = routines.results.map((r) => ({
    id: r.id,
    name: r.name,
    who: memberName(r.member_id),
    cards: parseJsonArray<{ icon?: string; label?: string }>(r.cards_json, isCard).map((c) => ({
      icon: c.icon ?? '',
      label: c.label ?? '',
    })),
  }))

  // "À savoir" — kids' allergies / notes a parent jotted on a member.
  const toKnow = members.results
    .filter((m) => (m.notes ?? '').trim() !== '')
    .map((m) => ({ name: m.display_name, isChild: !!m.is_child, notes: m.notes }))

  const emergency = contacts.results
    .filter((c) => parseJsonArray<string>(c.tags).some((t) => t.toLowerCase() === 'urgence'))
    .map((c) => ({ name: `${c.first_name} ${c.last_name}`.trim(), phone: c.phone }))

  // « En cas de pépin » — the house map from the home carnets (#les-carnets): where's
  // the shutoff / breaker / spare key, read-only for the sitter. Photos ride the
  // public-by-key /api/img route (allowlisted). Flat list, tagged by home for a
  // multi-home household.
  const pinRows = await ctx.env.DB.prepare(
    // A pin may hang off a home carnet OR a room ('zone' child of a home) — both are
    // house-in-a-pinch info the sitter needs, so include both kinds.
    `SELECT p.kind, p.label, p.detail, p.media_key, c.name AS home
       FROM home_pins p JOIN carnets c ON c.id = p.carnet_id AND c.household_id = p.household_id
      WHERE p.household_id = ? AND c.kind IN ('home', 'zone') AND c.archived_at IS NULL
      ORDER BY c.position, p.position`,
  )
    .bind(hh)
    .all<{ kind: string; label: string; detail: string | null; media_key: string | null; home: string }>()
  const pins = pinRows.results.map((p) => ({ kind: p.kind, label: p.label, detail: p.detail, mediaKey: p.media_key, home: p.home }))

  return ok({ ...base, today: { events, meals: meals.results }, bedtimeRoutines, toKnow, emergency, pins })
})

// The intake form greeting (the 'intake' GuestKind). Returns ONLY the household
// name and — for a per-person link — the addressed person's first name, so the form
// can say "Bonjour Marie". No birthday/phone/notes/etc. are returned: the link is a
// write surface, not a read one, and pre-filling stored data would leak the cercle.
async function intakeGreeting(env: Env, hh: string, targetKey: string | null, fields: number | null) {
  const nameRow = await env.DB.prepare('SELECT name FROM households WHERE id = ?')
    .bind(hh)
    .first<{ name: string }>()
  let targetName: string | null = null
  if (targetKey) {
    const sep = targetKey.indexOf(':')
    const k = sep > 0 ? targetKey.slice(0, sep) : ''
    const id = sep > 0 ? targetKey.slice(sep + 1) : ''
    if (k === 'member' && id) {
      const r = await env.DB.prepare('SELECT display_name FROM members WHERE id = ? AND household_id = ?')
        .bind(id, hh)
        .first<{ display_name: string }>()
      targetName = r?.display_name?.split(' ')[0] ?? null
    } else if (k === 'contact' && id) {
      const r = await env.DB.prepare('SELECT first_name FROM contacts WHERE id = ? AND household_id = ?')
        .bind(id, hh)
        .first<{ first_name: string }>()
      targetName = r?.first_name ?? null
    }
  }
  return { kind: 'intake' as const, householdName: nameRow?.name ?? '', targetName, scope: decodeIntakeScope(fields) }
}

// The grandparents' window (#36): the grandkids' upcoming dates, the family's
// birthdays, and the latest photos. All derived from existing data (events,
// members/contacts birthdays, the photos table) — no wifi/rules, no list, no
// settings. Photos ride the public-by-key /api/img route (allowlisted).
async function familyWindow(env: Env, hh: string, householdName: string) {
  const today = localDayStart(new Date(Date.now()))
  const eventsEnd = addLocalDays(today, 21) // ~3 weeks of upcoming dates
  const bdayEnd = addLocalDays(today, 35) // a little further for birthdays

  const members = await env.DB.prepare(
    'SELECT id, display_name, is_child FROM members WHERE household_id = ? ORDER BY position, created_at',
  )
    .bind(hh)
    .all<{ id: string; display_name: string; is_child: number }>()

  // The grandkids' calendar: events tied to a CHILD member. If the household marks
  // no children, fall back to every member-tied event so the window isn't empty.
  const childIds = members.results.filter((m) => m.is_child).map((m) => m.id)
  const targetIds = childIds.length ? childIds : members.results.map((m) => m.id)
  const nameOf = (id: string | null) =>
    (id && members.results.find((m) => m.id === id)?.display_name) || null

  const events: EvOut[] = []
  if (targetIds.length) {
    const ph = targetIds.map(() => '?').join(',')
    const [oneOff, recurring] = await Promise.all([
      env.DB.prepare(
        `SELECT id, title, start_at, all_day, member_id FROM events WHERE household_id = ? AND recur_json IS NULL AND member_id IN (${ph}) AND start_at >= ? AND start_at < ? ORDER BY start_at`,
      )
        .bind(hh, ...targetIds, today, eventsEnd)
        .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null }>(),
      env.DB.prepare(
        `SELECT id, title, start_at, all_day, member_id, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL AND member_id IN (${ph})`,
      )
        .bind(hh, ...targetIds)
        .all<{ id: string; title: string; start_at: number; all_day: number; member_id: string | null; recur_json: string }>(),
    ])
    for (const e of oneOff.results)
      events.push({ id: e.id, title: e.title, start_at: e.start_at, all_day: e.all_day, who: nameOf(e.member_id) })
    for (const e of recurring.results) {
      const rule = parseRecur(e.recur_json)
      if (!rule) continue
      for (const at of expandRange(e.start_at, rule, today, eventsEnd))
        events.push({ id: `${e.id}#${at}`, title: e.title, start_at: at, all_day: e.all_day, who: nameOf(e.member_id) })
    }
    events.sort((a, b) => a.start_at - b.start_at)
  }

  // Birthdays — derived from members + contacts (never event rows), same engine the
  // board uses. The warm heart of the window.
  const people = await fetchBirthdayPeople(env.DB, hh)
  const birthdays = birthdayOccurrences(people, today, bdayEnd)
    .sort((a, b) => a.at - b.at)
    .map((b) => ({ name: b.name, at: b.at, age: b.age }))

  // Latest photos — keys only; the <img> loads them via the public-by-key route.
  const photos = await env.DB.prepare(
    'SELECT r2_key FROM photos WHERE household_id = ? ORDER BY created_at DESC LIMIT 12',
  )
    .bind(hh)
    .all<{ r2_key: string }>()

  return {
    kind: 'family' as const,
    householdName,
    upcoming: events.slice(0, 20),
    birthdays,
    photos: photos.results.map((p) => p.r2_key),
  }
}
