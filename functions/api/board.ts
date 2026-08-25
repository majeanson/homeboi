import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays } from '../_lib/ids'
import { parseRecur, expandRange, occurrenceOn } from '../_lib/recur'
import { isSoon as isSoonAt } from '../_lib/reminder'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { workOccurrencesInRange, parseScheduleBlockRow, type ScheduleBlock, type ScheduleBlockRow } from '../_lib/carResolve'
import { householdMealLayout } from '../_lib/mealSlots'

interface Ev {
  id: string
  title: string
  start_at: number
  all_day: number
  member_id: string | null
  end_at?: number | null // optional « Jusqu'à » — the window's exclusive end (unix s); absent = a point
  car_id?: string | null // « Prend l'auto »: set = this rendez-vous takes that household car
  passengers?: string | null // « Qui » — the household people this concerns (JSON id array); member_id is passengers[0]
  contact_id?: string | null // #21: a « Le cercle » contact instead of a member
  contact_name?: string | null // the contact's first name, for the board label
  contact_address?: string | null // the contact's address JSON — « Itinéraire » on the rendez-vous peek
  business_id?: string | null // a « Le cercle » Business (vet, plumber…) — a rendez-vous
  business_name?: string | null // the business name, for the board label
  business_colour?: string | null // the business's own colour — tints the rendez-vous
  business_address?: string | null // the business's plain address — « Itinéraire » on the rendez-vous peek
  bring_template_id?: string | null // #17/0077: the activity's bring-list (soft ref → todo_templates); feeds « À apporter » on the departure card
  soon: boolean // within its calm "Bientôt" lead window right now (see isSoon)
  birthday?: boolean // a derived birthday occurrence (cake icon, read-only → person)
  age?: number | null // the age turned, when the birth year is known
  gift_ideas?: string | null // #20: gift notes carried on a birthday occurrence
}
const sortEvents = (xs: Ev[]) => xs.sort((p, q) => q.all_day - p.all_day || p.start_at - q.start_at)
// One-off event rows as they come from SQL (lead_seconds joins the client-facing Ev
// only as the derived `soon` flag).
type EvRow = {
  id: string
  title: string
  start_at: number
  all_day: number
  end_at: number | null
  car_id: string | null
  member_id: string | null
  passengers: string | null
  contact_id: string | null
  contact_name: string | null
  contact_address: string | null
  business_id: string | null
  business_name: string | null
  business_colour: string | null
  business_address: string | null
  bring_template_id: string | null
  lead_seconds: number | null
}

// The whole board in one read — the kiosk polls this. Deliberately one
// round-trip so a wall tablet on flaky wifi gets a complete frame or none.
// ZERO AI here (NFR-PERF-1): this is a pure D1 read on the render path.
export const onRequestGet = authed(async (ctx, actor) => {
  const hh = actor.householdId

  // Everything dated buckets at LOCAL midnight (America/Toronto, DST-aware) — the
  // boundary meals.ts / day-notes.ts store at, the household's wall clock, and (now)
  // _lib/recur's day math. On UTC the day rolls at 20:00 Eastern, so an evening
  // event/chore — or a recurring "Thursday" anchored to a Thursday evening — landed
  // one day early (see _lib/recur header). Step by LOCAL calendar days, not a fixed
  // 86 400 s: a local day is 23 h/25 h across a DST change, so plain arithmetic
  // would drift the window an hour and mis-bucket near the boundary (twice a year).
  const today = localDayStart(new Date(Date.now()))
  const tomorrow = addLocalDays(today, 1)
  const dayAfter = addLocalDays(today, 2)
  const weekEnd = addLocalDays(today, 7)

  // Calm "Bientôt" reminder (migration 0038): an item is `soon` when NOW sits inside
  // its lead window [start − lead_seconds, start). Never hides anything — the board
  // shows the item where it always would; the client just adds a "Bientôt" chip.
  // null lead → never soon. Past start (now ≥ start) → no longer soon (it's here).
  const now = Math.floor(Date.now() / 1000)
  const isSoon = (at: number, lead: number | null | undefined): boolean => isSoonAt(now, at, lead)

  // Meals/day-notes share the same local-day boundaries (aliased for the queries
  // below that read those tables by their stored local-midnight `date`).
  const mealToday = today
  const mealTomorrow = tomorrow
  const mealDayAfter = dayAfter

  // The household's meal layout (Réglages ▸ Repas): which slot is the day's HERO —
  // « Ce soir », the souper by default — and the display order the day's other meals
  // are listed in. Read before the batch so both can feed the queries below.
  const mealLayout = await householdMealLayout(ctx.env, hh)
  const heroSlot = mealLayout.hero

  const [members, todayEvents, tomorrowEvents, tonightMeal, tomorrowMeal, todayMealsRes, dayNoteRes, tomorrowMealsRes, tomorrowNoteRes, openList, chores, notes, leftoversRes, scheduleRes, carDayRes] = await Promise.all([
    ctx.env.DB.prepare(
      'SELECT id, display_name, avatar_kind, avatar_ref, colour, is_child FROM members WHERE household_id = ? ORDER BY position, created_at',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, bring_template_id, lead_seconds, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, today, tomorrow)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, bring_template_id, lead_seconds, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY all_day DESC, start_at',
    )
      .bind(hh, tomorrow, dayAfter)
      .all(),
    // First hero meal of today/tomorrow (the headline). ORDER BY position so
    // "first" is deterministic now that a slot can hold several meals.
    ctx.env.DB.prepare(
      'SELECT id, title, cook_member_id, is_leftover FROM meals WHERE household_id = ? AND slot = ? AND date >= ? AND date < ? ORDER BY position, created_at, id LIMIT 1',
    )
      .bind(hh, heroSlot, mealToday, mealTomorrow)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, cook_member_id, is_leftover FROM meals WHERE household_id = ? AND slot = ? AND date >= ? AND date < ? ORDER BY position, created_at, id LIMIT 1',
    )
      .bind(hh, heroSlot, mealTomorrow, mealDayAfter)
      .all(),
    // EVERY meal planned for today (all slots, N per slot) — the board shows the
    // full day's table, not just tonight's supper hero. Ordered by time then
    // position; sorted again client-side by slot (stable, so position holds).
    ctx.env.DB.prepare(
      'SELECT id, slot, title, cook_member_id, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY position, created_at, id',
    )
      .bind(hh, mealToday, mealTomorrow)
      .all(),
    // Today's day note — the per-day memo from La cuisine (functions/api/day-notes).
    ctx.env.DB.prepare(
      'SELECT id, text, member_id FROM day_notes WHERE household_id = ? AND date >= ? AND date < ? LIMIT 1',
    )
      .bind(hh, mealToday, mealTomorrow)
      .all(),
    // Tomorrow's full meal table + its day note — surfaced in the Demain section
    // so prep that has to happen the night before (thaw the chicken, soak the
    // beans, "sortir le poulet") is visible TODAY, while there's still time.
    ctx.env.DB.prepare(
      'SELECT id, slot, title, cook_member_id, position, is_leftover FROM meals WHERE household_id = ? AND date >= ? AND date < ? ORDER BY position, created_at, id',
    )
      .bind(hh, mealTomorrow, mealDayAfter)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, text, member_id FROM day_notes WHERE household_id = ? AND date >= ? AND date < ? LIMIT 1',
    )
      .bind(hh, mealTomorrow, mealDayAfter)
      .all(),
    // The whole active list — unchecked AND checked. A check is a mark, not a
    // move: checked rows stay in place (struck through) until "Clear checked"
    // removes them, so checked_at rides along to drive that struck state.
    ctx.env.DB.prepare(
      // Hand order first (position 0..n from drag-and-drop), then created_at + id:
      // a stable total order. Quick-add can stamp several rows in the same second,
      // so created_at alone leaves ties SQLite may return in a different order each
      // read — making the list visibly reshuffle on every refetch (e.g. right after
      // a check). The id tiebreaker pins them. Rows never dragged (position NULL)
      // sort after placed ones, so a new item still lands last until it's moved.
      'SELECT id, text, source, added_by, deal_json, search_terms, checked_at, non_urgent FROM list_items WHERE household_id = ? ORDER BY position IS NULL, position, created_at, id',
    )
      .bind(hh)
      .all(),
    ctx.env.DB.prepare(
      'SELECT id, title, rotation_json, current_idx, last_done_at, colour AS color, recur_json, recur_start, lead_seconds, announce_evening, created_at FROM tasks WHERE household_id = ? ORDER BY created_at',
    )
      .bind(hh)
      .all(),
    // Fridge notes (uncleared), newest first — shown on the Aujourd'hui board.
    ctx.env.DB.prepare(
      'SELECT id, text, member_id, created_at, media_kind, media_key FROM notes WHERE household_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 12',
    )
      .bind(hh)
      .all(),
    // "Restants à finir" — undated leftovers to eat before cooking the rest. A
    // calm nudge, newest first; planning or finishing one happens from the card.
    ctx.env.DB.prepare(
      'SELECT id, title FROM meal_leftovers WHERE household_id = ? ORDER BY created_at DESC',
    )
      .bind(hh)
      .all(),
    // « L'auto » work-schedule blocks (#28) — the recurring "who's out / car taken"
    // windows. Derived onto the day below (never event rows), like birthdays. Tiny
    // table (a few rows/household), so it rides the board poll cheaply.
    ctx.env.DB.prepare(
      'SELECT id, member_id, label, start_min, end_min, holds_car, colour AS color, recur_json, anchor_day FROM schedule_blocks WHERE household_id = ?',
    )
      .bind(hh)
      .all<ScheduleBlockRow>(),
    // Today's per-date car adjustments. A day the car was reassigned (or kept home)
    // must not still draw the template's car glyph here while /voiture shows it free
    // — the board, the calendar and L'auto have to agree about one date.
    ctx.env.DB.prepare('SELECT day FROM car_day WHERE household_id = ? AND day >= ? AND day < ?')
      .bind(hh, today, tomorrow)
      .all<{ day: number }>(),
  ])

  // "Up next" beyond tomorrow (rest of the week) — tomorrow has its own card, so
  // start the day after to avoid showing it twice.
  const upcoming = await ctx.env.DB.prepare(
    'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, bring_template_id, lead_seconds, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 8',
  )
    .bind(hh, dayAfter, weekEnd)
    .all()

  // Recurring series live as one row each; expand them across the board window
  // (today → week end) into concrete occurrences, then bucket into the same
  // day ranges as the one-off events above. See _lib/recur.
  const recurring = await ctx.env.DB.prepare(
    'SELECT id, title, start_at, all_day, end_at, car_id, member_id, passengers, contact_id, business_id, bring_template_id, recur_json, lead_seconds, (SELECT first_name FROM contacts WHERE contacts.id = events.contact_id) AS contact_name, (SELECT address FROM contacts WHERE contacts.id = events.contact_id) AS contact_address, (SELECT name FROM businesses WHERE businesses.id = events.business_id) AS business_name, (SELECT colour FROM businesses WHERE businesses.id = events.business_id) AS business_colour, (SELECT address FROM businesses WHERE businesses.id = events.business_id) AS business_address FROM events WHERE household_id = ? AND recur_json IS NOT NULL',
  )
    .bind(hh)
    .all<{
      id: string
      title: string
      start_at: number
      all_day: number
      end_at: number | null
      car_id: string | null
      member_id: string | null
      passengers: string | null
      contact_id: string | null
      contact_name: string | null
      contact_address: string | null
      business_id: string | null
      business_name: string | null
      business_colour: string | null
      business_address: string | null
      bring_template_id: string | null
      recur_json: string
      lead_seconds: number | null
    }>()

  const occurrences: Ev[] = []
  for (const e of recurring.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    for (const at of expandRange(e.start_at, rule, today, weekEnd)) {
      // The lead applies to THIS concrete occurrence time, not the anchor.
      occurrences.push({
        id: `${e.id}#${at}`,
        title: e.title,
        start_at: at,
        all_day: e.all_day,
        // A recurring rendez-vous keeps its LENGTH, so shift the end with the occurrence.
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
        soon: isSoon(at, e.lead_seconds),
      })
    }
  }
  const recurIn = (from: number, to: number) => occurrences.filter((e) => e.start_at >= from && e.start_at < to)

  // Automatic birthdays — derived from members + contacts (never event rows), as
  // all-day items across the board window. Read-only on the client (cake → person).
  const birthdayPeople = await fetchBirthdayPeople(ctx.env.DB, hh)
  const bdayOccs: Ev[] = birthdayOccurrences(birthdayPeople, today, weekEnd).map((o) => ({
    id: o.id,
    title: o.name,
    start_at: o.at,
    all_day: 1,
    member_id: o.memberId,
    soon: false,
    birthday: true,
    age: o.age,
    gift_ideas: o.giftIdeas, // #20: surfaced near the date in the birthday peek
  }))
  const bdayIn = (from: number, to: number) => bdayOccs.filter((e) => e.start_at >= from && e.start_at < to)
  // One-off rows carry lead_seconds from SQL; derive each row's `soon` here.
  const oneOff = (rows: unknown) =>
    (rows as EvRow[]).map((r) => ({
      id: r.id,
      title: r.title,
      start_at: r.start_at,
      all_day: r.all_day,
      end_at: r.end_at,
      car_id: r.car_id,
      member_id: r.member_id,
      passengers: r.passengers,
      contact_id: r.contact_id,
      contact_name: r.contact_name,
      contact_address: r.contact_address,
      business_id: r.business_id,
      business_name: r.business_name,
      business_colour: r.business_colour,
      business_address: r.business_address,
      bring_template_id: r.bring_template_id,
      soon: isSoon(r.start_at, r.lead_seconds),
    }))

  const todayMerged = sortEvents([...oneOff(todayEvents.results), ...recurIn(today, tomorrow), ...bdayIn(today, tomorrow)])
  const tomorrowMerged = sortEvents([...oneOff(tomorrowEvents.results), ...recurIn(tomorrow, dayAfter), ...bdayIn(tomorrow, dayAfter)])
  const upcomingMerged = sortEvents([...oneOff(upcoming.results), ...recurIn(dayAfter, weekEnd), ...bdayIn(dayAfter, weekEnd)]).slice(0, 8)

  // Recent helpers per chore (shared-task attribution). Today's contributions
  // only, so "aidé par" reflects who pitched in on the current run, not history.
  // JOIN (not IN-subquery) so the planner walks the household's few tasks via
  // tasks_household_idx, then task_participants_task_idx(task_id, contributed_at)
  // per task — this read rides the 10 s kiosk poll, it must stay index-only.
  const helps = await ctx.env.DB.prepare(
    `SELECT tp.task_id, tp.role, m.display_name AS name
       FROM task_participants tp
       JOIN tasks t ON t.id = tp.task_id AND t.household_id = ?
       LEFT JOIN members m ON m.id = tp.member_id
      WHERE tp.contributed_at >= ?
      ORDER BY tp.contributed_at DESC`,
  )
    .bind(hh, today)
    .all<{ task_id: string; role: string; name: string | null }>()

  // Distinct helpers per chore: collapse repeat taps so "aidé par" shows each
  // person once (named people by name; anonymous taps as a single role emoji),
  // not one entry per tap. No counts — that would read as a score (NFR-CALM-1).
  const helpersByTask = new Map<string, { name: string | null; role: string }[]>()
  const seenByTask = new Map<string, Set<string>>()
  for (const h of helps.results) {
    const list = helpersByTask.get(h.task_id) ?? []
    const seen = seenByTask.get(h.task_id) ?? new Set<string>()
    const key = h.name ?? `role:${h.role}`
    if (!seen.has(key) && list.length < 5) {
      seen.add(key)
      list.push({ name: h.name, role: h.role })
    }
    helpersByTask.set(h.task_id, list)
    seenByTask.set(h.task_id, seen)
  }
  const choresOut = (chores.results as { id: string }[]).map((c) => ({
    ...c,
    helpers: helpersByTask.get(c.id) ?? [],
  }))

  // Recurring chores expanded onto the day: those that occur TODAY (and aren't
  // already done today) surface on Aujourd'hui; otherwise the next occurrence in
  // the week surfaces on À venir. Whose-turn rides along (rotation + current_idx).
  // Non-recurring chores have no schedule, so they surface as one-off to-dos
  // (the `todos` slice below) until they're checked off.
  interface ChoreInst {
    id: string
    title: string
    color: string | null
    at: number
    soon: boolean // within its calm "Bientôt" lead window right now
    who: string | null
    who_id: string | null
    // Every member in the rotation (not just whose turn). The board's personal
    // focus shows a shared chore to ANYONE on the team, even when it's not their
    // turn — they can still do it; `who`/`who_id` say whose turn it currently is.
    team: string[]
    carnet_id?: string | null // « Les carnets » link (mig 0082) — set only on home-project rows
    // D-21: this recurring chore's "evening before" board announce is on. Read by
    // src/lib/boardModel.ts against choresUpcoming's `at` to synthesize the
    // announce line the night before — see migration 0109.
    announce_evening?: boolean
  }
  const memberName = (id: string | null) =>
    (id && (members.results as { id: string; display_name: string }[]).find((m) => m.id === id)?.display_name) || null
  type ChoreSrc = {
    id: string
    title: string
    color: string | null
    rotation_json: string
    current_idx: number
    last_done_at: number | null
    recur_json: string | null
    recur_start: number | null
    lead_seconds: number | null
    announce_evening: number | null
    created_at: number
  }
  // The rotation as member ids — the whole team sharing the chore. Empty when
  // there's no rotation (an unassigned "Maisonnée" task shown to everyone).
  const teamIds = (c: ChoreSrc): string[] => {
    try {
      const p = JSON.parse(c.rotation_json)
      if (Array.isArray(p)) return p.filter((x): x is string => typeof x === 'string')
    } catch {
      /* malformed rotation → no team */
    }
    return []
  }
  // Whose turn it is, as a member id (rotation + current_idx). Null when there's
  // no rotation — an unassigned "Maisonnée" task. The board's personal-focus
  // filter keeps these visible to everyone alongside the picked member's own.
  const whoseTurnId = (c: ChoreSrc): string | null => {
    const rot = teamIds(c)
    return rot.length ? rot[c.current_idx % rot.length] : null
  }
  const whoseTurn = (c: ChoreSrc): string | null => memberName(whoseTurnId(c))
  const choresToday: ChoreInst[] = []
  const choresUpcoming: ChoreInst[] = []
  // One-off to-dos: non-recurring, not-yet-done tasks (a captured "corvée" or a
  // standing chore with no schedule). These never had a home on Aujourd'hui;
  // now they surface as a checkable "À faire" list until completed (last_done_at).
  const todos: ChoreInst[] = []
  for (const c of chores.results as ChoreSrc[]) {
    const r = parseRecur(c.recur_json)
    const inst = (at: number): ChoreInst => ({
      id: c.id,
      title: c.title,
      color: c.color,
      at,
      soon: isSoon(at, c.lead_seconds),
      who: whoseTurn(c),
      who_id: whoseTurnId(c),
      team: teamIds(c),
      announce_evening: c.announce_evening === 1,
    })
    if (!r) {
      // No schedule → a to-do. Show it until it's marked done.
      if (c.last_done_at == null) todos.push(inst(today))
      continue
    }
    // The chosen start date is the recurrence anchor; chores created before 0032
    // (or with no explicit start) fall back to created_at, the old behaviour.
    const anchor = c.recur_start ?? c.created_at
    if (occurrenceOn(today, anchor, r) !== null) {
      const doneToday = c.last_done_at != null && c.last_done_at >= today
      if (!doneToday) choresToday.push(inst(today))
    } else {
      const next = expandRange(anchor, r, tomorrow, weekEnd)[0]
      if (next != null) choresUpcoming.push(inst(next))
    }
  }
  choresUpcoming.sort((a, b) => a.at - b.at)

  // "Projets & Entretien" (home_projects, #home-projects) dated rows surface like
  // recurring chores: an occurrence TODAY (and not already done) shows on
  // Aujourd'hui; otherwise the next occurrence this week shows on À venir. Undated
  // rows (at IS NULL) stay quiet — they live only in Réglages. Checkable off the
  // board (sets last_done_at), so "done this cycle" mirrors a chore. No rotation
  // (who/team empty); the row's own colour + title emoji distinguish it.
  const homeRows = await ctx.env.DB.prepare(
    'SELECT id, title, colour AS color, at, recur_json, lead_seconds, last_done_at, carnet_id FROM home_projects WHERE household_id = ? AND at IS NOT NULL',
  )
    .bind(hh)
    .all<{
      id: string
      title: string
      color: string | null
      at: number
      recur_json: string | null
      lead_seconds: number | null
      last_done_at: number | null
      carnet_id: string | null
    }>()
  const homeToday: ChoreInst[] = []
  const homeUpcoming: ChoreInst[] = []
  for (const h of homeRows.results) {
    const hinst = (at: number): ChoreInst => ({
      id: h.id,
      title: h.title,
      color: h.color,
      at,
      soon: isSoon(at, h.lead_seconds),
      who: null,
      who_id: null,
      team: [],
      carnet_id: h.carnet_id,
    })
    const r = parseRecur(h.recur_json)
    if (!r) {
      // One-off dated row: a single occurrence at `at`. Show until it's marked done.
      if (h.last_done_at != null) continue
      if (h.at >= today && h.at < tomorrow) homeToday.push(hinst(today))
      else if (h.at >= tomorrow && h.at < weekEnd) homeUpcoming.push(hinst(h.at))
      continue
    }
    // The picked date `at` is the recurrence anchor (same role as a chore's recur_start).
    if (occurrenceOn(today, h.at, r) !== null) {
      const doneToday = h.last_done_at != null && h.last_done_at >= today
      if (!doneToday) homeToday.push(hinst(today))
    } else {
      const next = expandRange(h.at, r, tomorrow, weekEnd)[0]
      if (next != null) homeUpcoming.push(hinst(next))
    }
  }
  homeUpcoming.sort((a, b) => a.at - b.at)

  // Today's meals, in the household's slot order (Réglages ▸ Repas; déjeuner →
  // dîner → collation → souper → dessert out of the box) so the board reads
  // top-to-bottom like a menu. The hero meal stays the headline above; the client
  // lists the rest here so nothing planned for the day is hidden. Stable sort, so
  // the SQL position order holds within a slot that has several meals.
  const slotRank = new Map(mealLayout.order.map((s, i) => [s as string, i]))
  type DayMeal = { id: string; slot: string; title: string; cook_member_id: string | null; position?: number; is_leftover?: number }
  const bySlot = (rows: unknown) =>
    (rows as DayMeal[]).sort((a, b) => (slotRank.get(a.slot) ?? 9) - (slotRank.get(b.slot) ?? 9))
  const todayMeals = bySlot(todayMealsRes.results)
  const tomorrowMeals = bySlot(tomorrowMealsRes.results)
  // All of today's hero meals — the board's "Ce soir" lists every one, not just the first.
  const tonightMeals = todayMeals.filter((m) => m.slot === heroSlot)

  // « L'auto » work windows landing TODAY (#28) — the recurring schedule surfaced on
  // the board agenda, derived (never event rows) like birthdays. Only today's: the
  // weekly rota would flood À venir, so the calendar (month/day page) is where the
  // full forward schedule lives; here it's just "who's out today". Read-only.
  const scheduleBlocks: ScheduleBlock[] = scheduleRes.results.map(parseScheduleBlockRow)
  const work = workOccurrencesInRange(scheduleBlocks, today, tomorrow, carDayRes.results).map((o) => ({
    id: o.id,
    label: o.label,
    at: o.at,
    endAt: o.endAt,
    member_id: o.memberId,
    color: o.color,
    holds_car: o.holdsCar ? 1 : 0,
  }))

  return ok({
    syncedAt: Math.floor(Date.now() / 1000),
    scope: actor.scope,
    members: members.results,
    today: todayMerged,
    work,
    tomorrow: tomorrowMerged,
    upcoming: upcomingMerged,
    tonight: tonightMeal.results[0] ?? null,
    tonightMeals,
    tomorrowMeal: tomorrowMeal.results[0] ?? null,
    todayMeals,
    // WHICH slot the three fields above were filtered by. The client must split the
    // hero out of `todayMeals` with the SAME slot the server used, not with its own
    // (possibly newer) household setting — otherwise, in the window between a hero
    // change and the next board poll, the old hero's meal renders twice and the new
    // hero's meal disappears. Ship the answer with the data.
    heroSlot,
    dayNote: dayNoteRes.results[0] ?? null,
    tomorrowMeals,
    tomorrowNote: tomorrowNoteRes.results[0] ?? null,
    list: openList.results,
    chores: choresOut,
    choresToday,
    choresUpcoming,
    homeToday,
    homeUpcoming,
    todos,
    notes: notes.results,
    leftovers: leftoversRes.results,
  })
})
