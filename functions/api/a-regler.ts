import { ok } from '../_lib/json'
import { authed } from '../_lib/route'
import { localDayStart, addLocalDays, nowSec } from '../_lib/ids'
import { parseRecur, expandRange } from '../_lib/recur'
import { fetchBirthdayPeople, birthdayOccurrences } from '../_lib/birthdays'
import { ingredientName } from '../_lib/ingredient'
import { isSectionHeading } from '../_lib/recipeSections'
import { householdMealLayout } from '../_lib/mealSlots'

// « À régler » — a calm, cross-domain heads-up: a SHORT, finite list of frictions
// worth a parent's attention, each with a one-tap fix. The mental-load surface — it
// connects facts the tabs hold separately (a ride with no driver, an empty supper, a
// birthday with no gift idea) and surfaces only what needs sorting.
//
// Parent-audience only, but the underlying reads are ordinary household reads — a
// kiosk parent lens is allowed to see the scan (the fixes it links to are all
// navigations, not writes: /kitchen/day, /liste, /cercle, /settings — none gated).
// A guest short-circuits to an empty scan below: the friction list is a parent's
// mental-load surface, not something to hand a babysitter.
// READ-ONLY + DERIVED — reads existing tables, adds NO table/column, and returns NO
// count/rank/score (NFR-CALM): an empty list just means « tout est sous contrôle ».
// We return STRUCTURED signals (kind + the entity data + a fix href); the frontend
// (lib/aRegler) composes + localizes the sentence, so all copy stays in i18n.

type Kind = 'ride' | 'meal-empty' | 'meal-low' | 'birthday'
interface Friction {
  kind: Kind
  key: string // stable id (React key / dedupe)
  label: string // the entity noun (event title · meal name · person) — the FE wraps copy around it
  sub?: string // a secondary detail (the low ingredient)
  at?: number // when it's relevant (sort)
  href: string // the one-tap fix
}

const CAP = 6
const dayOf = (at: number) => localDayStart(new Date(at * 1000))
const norm = (s: string) => s.trim().toLowerCase()

// Today's empty hero meal is only worth flagging while there's still time to act on
// it. Past the hero meal's serve time (Réglages ▸ Repas) plus this grace, an "à
// planifier" nudge is just noise (you're cooking, or you've eaten) — the default 17:30
// souper keeps the 18:00 cutoff this used to hardcode. Tomorrow's has no such gate:
// planning ahead is useful all day.
const HERO_CUTOFF_GRACE_MIN = 30

export const onRequestGet = authed(async (ctx, actor) => {
  // A sitter never gets the friction scan — it's a parent's mental-load surface, not
  // a to-do handed to a guest. Short-circuit BEFORE any query (cheap + explicit).
  if (actor.scope === 'guest') return ok({ signals: [] })

  const hh = actor.householdId
  const now = nowSec()
  const today = localDayStart(new Date(now * 1000))
  const tomorrow = addLocalDays(today, 1)
  const weekEnd = addLocalDays(today, 7)
  const in2w = addLocalDays(today, 14)

  // Which slot is the day's hero (Réglages ▸ Repas)? "An empty supper" is really "an
  // empty hero meal" — a household whose headline is the dîner wants THAT flagged.
  const mealLayout = await householdMealLayout(ctx.env, hh)
  const heroSlot = mealLayout.hero

  const [oneOffRides, recurRides, supperDays, supperMeals, lowRows, birthdayPeople] = await Promise.all([
    // Driverless rides (a car-taking trip with nobody driving — no member, no carpool
    // contact) in the next week. One-offs by date…
    ctx.env.DB.prepare(
      'SELECT id, title, start_at FROM events WHERE household_id = ? AND recur_json IS NULL AND car_id IS NOT NULL AND member_id IS NULL AND contact_id IS NULL AND start_at >= ? AND start_at < ? ORDER BY start_at',
    )
      .bind(hh, now, weekEnd)
      .all<{ id: string; title: string; start_at: number }>(),
    // …and recurring activities (a driverless soccer-every-Tuesday) — expanded below
    // to their NEXT occurrence in the window, one row each.
    ctx.env.DB.prepare(
      'SELECT id, title, start_at, recur_json FROM events WHERE household_id = ? AND recur_json IS NOT NULL AND car_id IS NOT NULL AND member_id IS NULL AND contact_id IS NULL',
    )
      .bind(hh)
      .all<{ id: string; title: string; start_at: number; recur_json: string }>(),
    // Which of today / tomorrow already have a hero meal planned? (one row per filled day)
    ctx.env.DB.prepare(
      'SELECT date, COUNT(*) AS n FROM meals WHERE household_id = ? AND slot = ? AND date IN (?, ?) GROUP BY date',
    )
      .bind(hh, heroSlot, today, tomorrow)
      .all<{ date: number; n: number }>(),
    // Today's + tomorrow's planned hero meals that link a recipe (to cross-check ingredients).
    ctx.env.DB.prepare(
      'SELECT id, title, recipe_id, date FROM meals WHERE household_id = ? AND slot = ? AND date IN (?, ?) AND recipe_id IS NOT NULL',
    )
      .bind(hh, heroSlot, today, tomorrow)
      .all<{ id: string; title: string; recipe_id: string; date: number }>(),
    // The running-low items (garde-manger).
    ctx.env.DB.prepare('SELECT item FROM pantry_low WHERE household_id = ?')
      .bind(hh)
      .all<{ item: string }>(),
    fetchBirthdayPeople(ctx.env.DB, hh),
  ])

  const signals: Friction[] = []

  // — Driverless rides —
  for (const r of oneOffRides.results) {
    signals.push({ kind: 'ride', key: r.id, label: r.title, at: r.start_at, href: `/kitchen/day/${dayOf(r.start_at)}` })
  }
  for (const e of recurRides.results) {
    const rule = parseRecur(e.recur_json)
    if (!rule) continue
    const occ = expandRange(e.start_at, rule, now, weekEnd)[0]
    if (occ) signals.push({ kind: 'ride', key: e.id, label: e.title, at: occ, href: `/kitchen/day/${dayOf(occ)}` })
  }

  // — Empty hero meal today / tomorrow —
  const filledDays = new Set(supperDays.results.filter((r) => (r.n ?? 0) > 0).map((r) => r.date))
  const localMin = Math.floor((now - today) / 60) // minutes since local midnight
  // Today: only while there's still time to act on it (before the hero slot + grace).
  if (!filledDays.has(today) && localMin < mealLayout.hours[heroSlot] + HERO_CUTOFF_GRACE_MIN) {
    // `label` carries the HERO slot so the frontend names the right meal ("Dîner
    // demain à planifier") instead of always saying « Souper ».
    signals.push({ kind: 'meal-empty', key: `${heroSlot}:${today}`, label: heroSlot, sub: 'today', at: today, href: `/kitchen/day/${today}` })
  }
  // Tomorrow: always worth a heads-up.
  if (!filledDays.has(tomorrow)) {
    signals.push({ kind: 'meal-empty', key: `${heroSlot}:${tomorrow}`, label: heroSlot, sub: 'tomorrow', at: tomorrow, href: `/kitchen/day/${tomorrow}` })
  }

  // — A planned meal whose recipe needs a running-low ingredient —
  const lowItems = lowRows.results.map((r) => norm(r.item)).filter(Boolean)
  if (lowItems.length && supperMeals.results.length) {
    const recipeIds = [...new Set(supperMeals.results.map((m) => m.recipe_id))]
    const placeholders = recipeIds.map(() => '?').join(',')
    const recipes = await ctx.env.DB.prepare(
      `SELECT id, ingredients_json FROM recipes WHERE household_id = ? AND id IN (${placeholders})`,
    )
      .bind(hh, ...recipeIds)
      .all<{ id: string; ingredients_json: string }>()
    const ingByRecipe = new Map<string, string[]>()
    for (const rc of recipes.results) {
      let lines: string[] = []
      try {
        const arr = JSON.parse(rc.ingredients_json)
        if (Array.isArray(arr)) lines = arr.filter((x): x is string => typeof x === 'string')
      } catch {
        /* malformed → no ingredients */
      }
      ingByRecipe.set(
        rc.id,
        lines.filter((l) => !isSectionHeading(l)).map((l) => norm(ingredientName(l))).filter(Boolean),
      )
    }
    for (const m of supperMeals.results) {
      const names = ingByRecipe.get(m.recipe_id) ?? []
      // The first low ingredient this meal needs (loose contains match both ways).
      const hit = lowItems.find((low) => names.some((n) => n === low || n.includes(low) || low.includes(n)))
      if (hit) signals.push({ kind: 'meal-low', key: `low:${m.id}`, label: m.title, sub: hit, at: m.date, href: '/liste' })
    }
  }

  // — A birthday soon with no gift idea noted —
  for (const o of birthdayOccurrences(birthdayPeople, today, in2w)) {
    if (!o.giftIdeas || !o.giftIdeas.trim()) {
      signals.push({ kind: 'birthday', key: o.id, label: o.name, at: o.at, href: '/maison?section=family' })
    }
  }

  // Soonest first, then cap — calm: a short list, never a backlog.
  signals.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
  return ok({ signals: signals.slice(0, CAP) })
})
