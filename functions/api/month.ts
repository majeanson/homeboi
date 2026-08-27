import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart } from '../_lib/ids'
import { parseRecur, expandRange, rotationOffset } from '../_lib/recur'
import { upkeepOccurrences } from '../_lib/upkeep'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { workOccurrencesInRange, parseScheduleBlockRow, type ScheduleBlock, type ScheduleBlockRow } from '../_lib/carResolve'
import { householdMealLayout, mealOrderSql } from '../_lib/mealSlots'

// Everything dated in the household, for a calendar-month window. /api/board is
// the 7-day glance; the month view zooms out, so it needs its own read across an
// arbitrary [from, to) day range. Same item families the board surfaces — events
// (one-off + recurring), meals, recurring chores, day-notes — expanded and
// bucketed onto a LOCAL day key the client groups by (matching lib/monthgrid +
// the meal week — local midnight, DST-aware, so an evening event lands on the day
// the household is living, not the next UTC day). Fridge notes are deliberately
// absent: they carry no date (always-active), so they have no calendar cell.
// ZERO AI: a pure D1 read, same as the board (NFR-PERF-1).
const DAY = 86400
const MAX_DAYS = 45 // a 6-week grid is 42 days; cap the expansion cost regardless.

const dayOf = (at: number) => localDayStart(new Date(at * 1000))

export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId
  const url = new URL(ctx.request.url)
  const from = Math.floor(Number(url.searchParams.get('from')))
  let to = Math.floor(Number(url.searchParams.get('to')))
  // Bad/missing window → empty calendar rather than a 400; the view just shows
  // empty cells, mirroring how the board tolerates a thin frame.
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= from) {
    return ok({ events: [], meals: [], chores: [], dayNotes: [], todos: [], homeProjects: [], trips: [], tripPlans: [], habits: [] })
  }
  to = Math.min(to, from + MAX_DAYS * DAY)

  // The household's meal slot order (Réglages ▸ Repas) — read before the batch so the
  // meals query can sort by it, exactly like /api/meals and the board.
  const MEAL_ORDER = mealOrderSql((await householdMealLayout(ctx.env, hh)).order)

  const [members, oneOff, recurring, mealsRes, dayNotesRes, choresRes, todosRes, birthdayPeople, scheduleRes, carDayRes, homeRes, tripsRes, tripPlansRes, sharedTripsRes, sharedPlansRes, habitsRes, habitDaysRes] = await Promise.all([
    ctx.env.DB.prepare('SELECT id, display_name FROM members WHERE household_id = ?')
      .bind(hh)
      .all<{ id: string; display_name: string }>(),
    // The « Avec » joins (name/colour like before, plus the ADDRESS — a business's
    // plain string, a contact's JSON — so a rendez-vous peek can offer « Itinéraire »
    // straight to Google Maps; same subselect pattern as contact_name).
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, bring_template_id, notes, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ?',
    )
      .bind(hh, from, to)
      .all<{ id: string; title: string; start_at: number; all_day: number; end_at: number | null; car_id: string | null; member_id: string | null; passengers: string | null; contact_id: string | null; contact_name: string | null; contact_address: string | null; business_id: string | null; business_name: string | null; business_colour: string | null; business_address: string | null; bring_template_id: string | null; notes: string | null }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, recur_json, bring_template_id, notes, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; all_day: number; end_at: number | null; car_id: string | null; member_id: string | null; passengers: string | null; contact_id: string | null; contact_name: string | null; contact_address: string | null; business_id: string | null; business_name: string | null; business_colour: string | null; business_address: string | null; recur_json: string; bring_template_id: string | null; notes: string | null }>(),
    // Meals & day-notes are stored at LOCAL midnight; widen the SQL window a day
    // each side so an entry near the window edge still lands, then re-bucket by
    // local day below and clip back to [from, to).
    ctx.env.DB.prepare(
      `SELECT id, slot, title, cook_member_id, date, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY date, ${MEAL_ORDER}`,
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; slot: string; title: string; cook_member_id: string | null; date: number; position: number; is_leftover: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, text, member_id, date FROM day_notes WHERE household_id = ? AND date >= ? AND date < ?',
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; text: string; member_id: string | null; date: number }>(),
    ctx.env.DB.prepare(
      'SELECT id, title, colour AS color, rotation_json, current_idx, last_done_at, recur_json, recur_start, created_at FROM tasks WHERE household_id = ?',
    )
      .bind(hh)
      .all<{
        id: string
        title: string
        color: string | null
        rotation_json: string
        current_idx: number
        last_done_at: number | null
        recur_json: string | null
        recur_start: number | null
        created_at: number
      }>(),
    // À compléter todos pinned to a DAY (migration 0046/0047) — open ones only, so
    // the calendar shows what's still to do. `day` is already local midnight, so a
    // direct range match works (no ±DAY re-bucket needed). Global (day NULL) todos
    // have no calendar cell, like fridge notes.
    ctx.env.DB.prepare(
      'SELECT id, title, member_id, day, section FROM todos WHERE household_id = ? AND day IS NOT NULL AND day >= ? AND day < ? AND done_at IS NULL ORDER BY day, position, created_at',
    )
      .bind(hh, from, to)
      .all<{ id: string; title: string; member_id: string | null; day: number; section: string | null }>(),
    // Automatic birthdays — derived from members + contacts, never stored as events.
    fetchBirthdayPeople(ctx.env.DB, hh),
    // « L'auto » work-schedule blocks (#28) — derived onto each matching day across
    // the window (never event rows). A calendar is where the full recurring rota
    // belongs, so unlike the board these span the whole [from, to).
    ctx.env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    // Per-date car adjustments across the window. The calendar derives work windows
    // from the TEMPLATE, so without these it keeps drawing the car on a date whose
    // car was reassigned or kept home — a third disagreeing answer next to /voiture
    // and the board.
    ctx.env.DB.prepare('SELECT day FROM car_day WHERE household_id = ? AND day >= ? AND day < ?')
      .bind(hh, from, to)
      .all<{ day: number }>(),
    // "Projets & Entretien" (home_projects, #home-projects) — DATED rows only;
    // recurring expand across the window, one-off land on their day. Like chores,
    // they ride the same calendar. Undated rows (at IS NULL) have no cell.
    ctx.env.DB.prepare(
      'SELECT id, kind, title, colour AS color, at, recur_json, recur_from, last_done_at FROM home_projects WHERE household_id = ? AND at IS NOT NULL',
    )
      .bind(hh)
      .all<{ id: string; kind: string; title: string; color: string | null; at: number; recur_json: string | null; recur_from: string | null; last_done_at: number | null }>(),
    // « Voyage » — trips overlapping the window. A trip is a multi-day BAND (the
    // client draws a bar across its days), not a per-day dot; the day page reads the
    // same rows to show its "Voyage — Jour N" header. Dated trips only (an undated
    // trip has no calendar position). Overlap: start < to AND end >= from.
    ctx.env.DB.prepare(
      'SELECT id, title, colour, start_at, end_at FROM trips WHERE household_id = ? AND deleted_at IS NULL AND start_at IS NOT NULL AND end_at IS NOT NULL AND start_at < ? AND end_at >= ?',
    )
      .bind(hh, to, from)
      .all<{ id: string; title: string; colour: string; start_at: number; end_at: number }>(),
    // « Voyage » itinerary — the DATED day-by-day notes the operator entered inside a
    // trip (the Itinéraire composer writes category 'activity' with a local-midnight
    // date). The trip BAND alone said "you're travelling"; these are the actual plans
    // for the day, so the calendar day cell + day page can surface them under the trip
    // card. Atemporal trip info (Infos/documents/contacts, date NULL) stays in the
    // trip scene only — it has no calendar position. Join trips so a soft-deleted
    // trip's orphan notes don't leak. ±DAY widen + re-bucket like meals/day_notes
    // (date is local midnight, DST-aware).
    ctx.env.DB.prepare(
      // category = 'activity' matches the only dated-note writer (the Itinéraire
      // composer). Other categories are atemporal (date NULL) and excluded above, but
      // pinning it keeps the calendar's title fallback (t.voyage.cat[category]) total.
      "SELECT tn.id, tn.trip_id, tn.category, tn.label, tn.text, tn.media_kind, tn.date, tr.colour AS colour FROM trip_notes tn JOIN trips tr ON tr.id = tn.trip_id AND tr.deleted_at IS NULL WHERE tn.household_id = ? AND tn.deleted_at IS NULL AND tn.category = 'activity' AND tn.date IS NOT NULL AND tn.date >= ? AND tn.date < ? ORDER BY tn.date, tn.position, tn.created_at",
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; date: number; colour: string }>(),
    // « Voyage partagé » (shared trips, migration 0101) — ADDITIVE, never modifies the
    // household `trips` query above. Promoting a private trip MOVES it into the
    // capability-scoped shared store, so it would otherwise DROP OFF this household's
    // calendar band. A shared trip lives in NEITHER household, so it's authorized by a
    // live membership, not a household_id filter: JOIN shared_trip_members on the actor's
    // household (revoked_at IS NULL = a live grant). Same date-range overlap + dated-only
    // rules as the household trip query, so the band renders identically; the `shared`
    // flag (added client-side below) only re-targets the tap to /voyage/partage/:id.
    ctx.env.DB.prepare(
      'SELECT st.id, st.title, st.colour, st.start_at, st.end_at FROM shared_trips st JOIN shared_trip_members m ON m.shared_trip_id = st.id AND m.household_id = ? AND m.revoked_at IS NULL WHERE st.deleted_at IS NULL AND st.start_at IS NOT NULL AND st.end_at IS NOT NULL AND st.start_at < ? AND st.end_at >= ?',
    )
      .bind(hh, to, from)
      .all<{ id: string; title: string; colour: string; start_at: number; end_at: number }>(),
    // Shared-trip DATED itinerary notes — the shared twin of the trip_notes read above.
    // shared_trip_notes carries no household_id (attribution is author_household_id, a soft
    // ref); visibility is authorized by the membership JOIN, same as the trip band. Category
    // 'activity' + non-NULL local-midnight date only (the Itinéraire composer's dated writer);
    // ±DAY widen + re-bucket like the household plans. `st.colour` rides along for tinting.
    ctx.env.DB.prepare(
      "SELECT stn.id, stn.shared_trip_id AS trip_id, stn.category, stn.label, stn.text, stn.media_kind, stn.date, st.colour AS colour FROM shared_trip_notes stn JOIN shared_trips st ON st.id = stn.shared_trip_id AND st.deleted_at IS NULL JOIN shared_trip_members m ON m.shared_trip_id = st.id AND m.household_id = ? AND m.revoked_at IS NULL WHERE stn.deleted_at IS NULL AND stn.category = 'activity' AND stn.date IS NOT NULL AND stn.date >= ? AND stn.date < ? ORDER BY stn.date, stn.position, stn.created_at",
    )
      .bind(hh, from - DAY, to + DAY)
      .all<{ id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; date: number; colour: string }>(),
    // « Mes habitudes » — live, unarchived only (a paused habit leaves the calendar
    // but keeps its history).
    ctx.env.DB.prepare(
      'SELECT id, member_id, title, icon, colour, kind, target, cadence, recur_json, day_times, anchor_at FROM habits WHERE household_id = ? AND deleted_at IS NULL AND archived_at IS NULL',
    )
      .bind(hh)
      .all<{ id: string; member_id: string | null; title: string; icon: string; colour: string | null; kind: string; target: number | null; cadence: string; recur_json: string | null; day_times: number | null; anchor_at: number }>(),
    ctx.env.DB.prepare(
      'SELECT habit_id, day, value, slips FROM habit_days WHERE day >= ? AND day < ? AND habit_id IN (SELECT id FROM habits WHERE household_id = ? AND deleted_at IS NULL)',
    )
      .bind(from, to, hh)
      .all<{ habit_id: string; day: number; value: number; slips: number }>(),
  ])

  const inRange = (day: number) => day >= from && day < to

  const events: {
    id: string
    title: string
    at: number
    all_day: number
    member_id: string | null
    end_at?: number | null // optional « Jusqu'à » — the rendez-vous' exclusive end (unix s)
    car_id?: string | null // « Prend l'auto »: set = this rendez-vous takes that household car
    passengers?: string | null // « Qui » — the household people (JSON id array); member_id is passengers[0]
    contact_id?: string | null
    contact_name?: string | null
    contact_address?: string | null // the contact's address JSON — « Itinéraire » on the rendez-vous peek
    business_id?: string | null
    business_name?: string | null
    business_colour?: string | null
    business_address?: string | null // the business's plain address — « Itinéraire » on the rendez-vous peek
    day: number
    birthday?: boolean
    age?: number | null
    work?: boolean // a derived « L'auto » work-schedule window (read-only → /voiture)
    end?: number // work windows carry an end instant (a span, not a point)
    color?: string | null // the block's tint (member colour falls back client-side)
    holds_car?: number // 1 = this window ties up the shared car
    bring_template_id?: string | null // « Activité »: its "what to bring" template (Avant de partir surfaces it)
    notes?: string | null // 0121: the rendez-vous' free-text note (« apporter la carte… »)
  }[] = []
  for (const e of oneOff.results) {
    const day = dayOf(e.start_at)
    if (inRange(day))
      events.push({
        id: e.id,
        title: e.title,
        at: e.start_at,
        all_day: e.all_day,
        end_at: e.end_at,
        car_id: e.car_id,
        member_id: e.member_id,
        passengers: e.passengers,
        contact_id: e.contact_id,
        contact_name: e.contact_name,
        contact_address: e.contact_address,
        business_id: e.business_id,
        business_name: e.business_name,
        business_colour: e.business_colour,
        business_address: e.business_address,
        bring_template_id: e.bring_template_id,
        notes: e.notes,
        day,
      })
  }
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, from, to)) {
      events.push({
        id: `${e.id}#${at}`,
        title: e.title,
        at,
        all_day: e.all_day,
        // A recurring rendez-vous keeps its LENGTH on every occurrence.
        end_at: e.end_at != null && e.end_at > e.start_at ? at + (e.end_at - e.start_at) : null,
        car_id: e.car_id,
        member_id: e.member_id,
        passengers: e.passengers,
        contact_id: e.contact_id,
        contact_name: e.contact_name,
        contact_address: e.contact_address,
        business_id: e.business_id,
        business_name: e.business_name,
        business_colour: e.business_colour,
        business_address: e.business_address,
        bring_template_id: e.bring_template_id,
        notes: e.notes,
        day: dayOf(at),
      })
    }
  }
  // Derived birthdays — all-day, read-only (the client renders a cake + routes the
  // tap to the person, not an event editor).
  for (const o of birthdayOccurrences(birthdayPeople, from, to)) {
    events.push({ id: o.id, title: o.name, at: o.at, all_day: 1, member_id: o.memberId, day: dayOf(o.at), birthday: true, age: o.age })
  }

  // Derived « L'auto » work windows — read-only (the client renders a clock + routes
  // the tap to /voiture, not an event editor). A span, so `end` rides along.
  const scheduleBlocks: ScheduleBlock[] = scheduleRes.results.map(parseScheduleBlockRow)
  for (const o of workOccurrencesInRange(scheduleBlocks, from, to, carDayRes.results)) {
    events.push({ id: o.id, title: o.label ?? '', at: o.at, end: o.endAt, all_day: 0, member_id: o.memberId, day: dayOf(o.at), work: true, color: o.color, holds_car: o.holdsCar ? 1 : 0 })
  }

  const meals: { id: string; slot: string; title: string; cook_member_id: string | null; day: number; is_leftover?: number }[] = []
  for (const m of mealsRes.results) {
    const day = dayOf(m.date)
    if (inRange(day)) meals.push({ id: m.id, slot: m.slot, title: m.title, cook_member_id: m.cook_member_id, day, is_leftover: m.is_leftover })
  }

  const dayNotes: { id: string; text: string; member_id: string | null; day: number }[] = []
  for (const n of dayNotesRes.results) {
    const day = dayOf(n.date)
    if (inRange(day)) dayNotes.push({ id: n.id, text: n.text, member_id: n.member_id, day })
  }

  // Dated todos — already bucketed on a local-midnight `day`, the same key the grid
  // groups by. (inRange is a belt-and-braces guard; the SQL already bounds it.)
  const todos: { id: string; title: string; member_id: string | null; day: number; section: string | null }[] = []
  for (const td of todosRes.results) {
    if (inRange(td.day)) todos.push({ id: td.id, title: td.title, member_id: td.member_id, day: td.day, section: td.section })
  }

  const nameOf = (id: string | null) => (id && members.results.find((m) => m.id === id)?.display_name) || null
  const parseRotation = (rotationJson: string): string[] => {
    try {
      const p = JSON.parse(rotationJson)
      if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
    } catch {
      /* malformed rotation → no turn */
    }
    return []
  }
  // Recurring chores expanded across the window. The rotation's stored current_idx
  // is the holder of the next PENDING occurrence and advances only on completion —
  // so we PROJECT it forward per occurrence (rotationOffset) instead of labelling
  // every future cell with today's holder. Non-recurring chores have no schedule,
  // so they never land on the calendar.
  const todayLocal = localDayStart(new Date())
  const chores: { id: string; title: string; color: string | null; who: string | null; day: number }[] = []
  for (const c of choresRes.results) {
    const r = parseRecur(c.recur_json)
    if (!r) continue
    const anchor = c.recur_start ?? c.created_at
    const rot = parseRotation(c.rotation_json)
    // If today's turn was already done, the pending holder is the NEXT occurrence,
    // so count from tomorrow; otherwise the next occurrence on/after today is it.
    const refDay = c.last_done_at != null && c.last_done_at >= todayLocal ? todayLocal + DAY : todayLocal
    const occs = expandRange(anchor, r, from, to)
    // Each occurrence advances the rotation by one, so resolve the offset of the
    // first occurrence in the window once, then just step it forward.
    let offset = occs.length ? rotationOffset(anchor, r, refDay, occs[0]) : 0
    for (const at of occs) {
      const who = rot.length ? nameOf(rot[(((c.current_idx + offset) % rot.length) + rot.length) % rot.length]) : null
      chores.push({ id: `${c.id}#${at}`, title: c.title, color: c.color, who, day: dayOf(at) })
      offset++
    }
  }

  // "Projets & Entretien" expanded across the window: recurring via the shared
  // expander (anchored on `at`), one-off bucketed on their day. `kind` rides along
  // so the client can tint/label projet vs entretien.
  const homeProjects: { id: string; kind: string; title: string; color: string | null; day: number }[] = []
  for (const h of homeRes.results) {
    // Shared expander (_lib/upkeep) so « à partir de la dernière fois » rows land on
    // their true dates here too. includeDone: a calendar cell is a record of the day,
    // so a completed one-off keeps its cell (past cells stay best-effort, like the
    // chore rotation's history).
    const recurring = parseRecur(h.recur_json) != null
    for (const at of upkeepOccurrences(h, from, to, { includeDone: true })) {
      homeProjects.push({ id: recurring ? `${h.id}#${at}` : h.id, kind: h.kind, title: h.title, color: h.color, day: dayOf(at) })
    }
  }

  // Trips ride through as-is (the client clamps the band to the visible window).
  // `shared?: true` re-targets the client's tap to /voyage/partage/:id (« Voyage
  // partagé ») — the band itself renders identically (colour + title), calm.
  const trips: { id: string; title: string; colour: string; start_at: number; end_at: number; shared?: true }[] =
    tripsRes.results.map((tr) => ({
      id: tr.id,
      title: tr.title,
      colour: tr.colour,
      start_at: tr.start_at,
      end_at: tr.end_at,
    }))
  // Additive: shared trips this household is a live member of, into the SAME array so a
  // promoted trip stays on the calendar band (plan « Voyage partagé »). Flagged `shared`.
  for (const tr of sharedTripsRes.results) {
    trips.push({ id: tr.id, title: tr.title, colour: tr.colour, start_at: tr.start_at, end_at: tr.end_at, shared: true })
  }

  // The trip's per-day itinerary entries, bucketed onto their local day (so they sit
  // under the trip card on that exact calendar day / day page). `colour` rides along
  // for tinting; the client groups by `trip_id` when a day has several trips.
  const tripPlans: { id: string; trip_id: string; category: string; label: string | null; text: string; media_kind: string | null; colour: string; day: number; shared?: true }[] = []
  for (const n of tripPlansRes.results) {
    const day = dayOf(n.date)
    if (inRange(day))
      tripPlans.push({ id: n.id, trip_id: n.trip_id, category: n.category, label: n.label, text: n.text, media_kind: n.media_kind, colour: n.colour, day })
  }
  // Additive: the shared trips' dated itinerary notes, into the SAME array (their
  // `trip_id` is the shared trip id, which the flagged `trips` row above carries — so
  // the client groups + deep-links them under the shared band). `shared` mirrors the
  // trip flag for symmetry (the client derives the link from the parent trip's flag).
  for (const n of sharedPlansRes.results) {
    const day = dayOf(n.date)
    if (inRange(day))
      tripPlans.push({ id: n.id, trip_id: n.trip_id, category: n.category, label: n.label, text: n.text, media_kind: n.media_kind, colour: n.colour, day, shared: true })
  }

  // « Mes habitudes » — DERIVED occurrences, never stored as event rows (the
  // birthdays pattern). Read-only on the calendar: the tap peeks the habit, marking
  // still happens on « Le point du jour ».
  //
  // A SCHEDULED habit (cadence 'recur', a null rule meaning every day) emits one
  // occurrence per due day, carrying whether that day was met. An INTRA-DAY habit
  // ('day'/'hours') carries no rule either, so it falls through the same daily
  // expansion — it asks every day, just several times within it. A WEEK-QUOTA habit
  // has no fixed days by definition, so it emits ONLY the days it was actually done —
  // honest history rather than fictional scheduling across the whole week.
  //
  // `member_id` rides along so the client can apply the same private-ish filter the
  // check-in scene does (household habits + the picked face's own).
  const habitDayBy = new Map(habitDaysRes.results.map((d) => [`${d.habit_id}:${d.day}`, d]))
  // Mirrors isDayDone + dayGoal in src/lib/habits.ts — an intra-day « do » is met
  // once the day's moments are all marked, not at the first tap.
  const habitDone = (h: { kind: string; target: number | null; day_times: number | null }, d: { value: number; slips: number } | undefined): boolean => {
    const value = d?.value ?? 0
    if (h.kind === 'do') return value >= Math.max(1, h.day_times ?? 1)
    if (h.kind === 'count') return value >= (h.target ?? 1)
    if (h.kind === 'limit') return value <= (h.target ?? 0)
    return value > 0 && (d?.slips ?? 0) === 0 // avoid: held, and without a slip
  }
  const habits: { id: string; habit_id: string; title: string; icon: string; colour: string | null; kind: string; member_id: string | null; day: number; done: boolean }[] = []
  for (const h of habitsRes.results) {
    // « Le défi du jour » is a standing habit but NOT a calendar rhythm — it's a
    // single day-long invitation, not a recurring occurrence — so it never emits a
    // month cell (else it would paint every day). It lives only on the board card.
    if (h.kind === 'defi') continue
    const cell = (day: number) => {
      const d = habitDayBy.get(`${h.id}:${day}`)
      // A day nobody marked reads as neutral, never as a miss — `done` is only ever
      // "the intention was met", and the client dims future/untouched cells.
      habits.push({ id: `${h.id}#${day}`, habit_id: h.id, title: h.title, icon: h.icon, colour: h.colour, kind: h.kind, member_id: h.member_id, day, done: habitDone(h, d) })
    }
    if (h.cadence === 'week') {
      for (const d of habitDaysRes.results) {
        if (d.habit_id === h.id && inRange(d.day) && habitDone(h, d)) cell(d.day)
      }
      continue
    }
    const rule = parseRecur(h.recur_json) ?? { freq: 'daily' as const }
    for (const at of expandRange(h.anchor_at, rule, from, to)) cell(dayOf(at))
  }

  return ok({ events, meals, chores, dayNotes, todos, homeProjects, trips, tripPlans, habits })
})
