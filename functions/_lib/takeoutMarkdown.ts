import type { Takeout } from './takeout'

// « Emporter mes données », the readable half. The JSON takeout is the faithful copy (every
// table, restorable); THIS is the one a person opens — recipes, the list, the supper plan,
// the people, the notes — as plain Markdown that survives any app, prints, and pastes into
// whatever comes next. It is derived FROM the dump (never a second query), so it can never
// say something the JSON does not.
//
// Deliberately NOT a full mirror: it renders the things a household would grieve to lose
// and could actually read. Machinery, history and anything token-bearing stay in the JSON
// (or never leave — see TAKEOUT_EXCLUDE). Every column is read defensively: the dump is
// `SELECT *` over a schema that grows by migration, so a missing or renamed column drops a
// line from the file, never the export. No `Intl` here (intl-rule): dates are rendered from
// the stored day numbers with a plain table.

type Row = Record<string, unknown>
type Lang = 'fr' | 'en'

const L = {
  fr: {
    exported: 'Exporté le',
    intro: 'Copie lisible de ta maisonnée. La copie fidèle (à restaurer) est le fichier JSON.',
    recipes: 'Recettes',
    list: 'La liste',
    listEmpty: 'Rien à acheter pour l’instant.',
    supper: 'Le souper',
    people: 'Les gens',
    notes: 'Les notes',
    routines: 'Les routines',
    ingredients: 'Ingrédients',
    steps: 'Étapes',
    servings: 'portions',
    prep: 'prép.',
    cook: 'cuisson',
    total: 'total',
    source: 'Source',
    birthday: 'Anniversaire',
    household: 'Maisonnée',
    days: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
    untitled: 'Sans titre',
    household_default: 'Ma maisonnée',
  },
  en: {
    exported: 'Exported on',
    intro: 'A readable copy of your household. The faithful copy (the one you can restore) is the JSON file.',
    recipes: 'Recipes',
    list: 'The list',
    listEmpty: 'Nothing to buy right now.',
    supper: 'Supper',
    people: 'People',
    notes: 'Notes',
    routines: 'Routines',
    ingredients: 'Ingredients',
    steps: 'Steps',
    servings: 'servings',
    prep: 'prep',
    cook: 'cook',
    total: 'total',
    source: 'Source',
    birthday: 'Birthday',
    household: 'Household',
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    untitled: 'Untitled',
    household_default: 'My household',
  },
} as const

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const live = (rows: Row[] | undefined): Row[] => (rows ?? []).filter((r) => !r.deleted_at)

function jsonArray(v: unknown): unknown[] {
  if (typeof v !== 'string' || !v) return []
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? p : []
  } catch {
    return []
  }
}
const lines = (v: unknown): string[] => jsonArray(v).map(str).filter(Boolean)

// A stored day is a local midnight in the household's zone; +12 h lands on the same
// calendar day in every zone within ±12 h of UTC, so the UTC date IS the local date.
function dayOf(sec: number): { iso: string; dow: number } {
  const d = new Date((sec + 12 * 3600) * 1000)
  return { iso: d.toISOString().slice(0, 10), dow: d.getUTCDay() }
}

// Markdown is plain text we do not control: a recipe line starting with `#` or `-` must not
// become structure. Collapse newlines and escape a leading marker.
function inline(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').replace(/^([#>*+-]|\d+\.)\s/, '\\$1 ')
}

// Recipes keep section headings INSIDE the flat arrays as `## Title` lines (CLAUDE.md,
// « Recipe sections »): render them as bold sub-headings, never as list items.
function listBlock(items: string[], ordered: boolean): string[] {
  const out: string[] = []
  let n = 0
  for (const raw of items) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw)
    if (h) {
      if (out.length) out.push('')
      out.push(`**${inline(h[1])}**`, '')
      n = 0
      continue
    }
    n += 1
    out.push(ordered ? `${n}. ${inline(raw)}` : `- ${inline(raw)}`)
  }
  return out
}

function recipeSection(recipes: Row[], t: (typeof L)[Lang]): string[] {
  const out: string[] = [`## ${t.recipes} (${recipes.length})`, '']
  const sorted = [...recipes].sort((a, b) => str(a.title).localeCompare(str(b.title)))
  for (const r of sorted) {
    out.push(`### ${inline(str(r.title) || t.untitled)}`, '')
    const meta: string[] = []
    const servings = num(r.servings)
    if (servings) meta.push(`${servings} ${str(r.servings_unit) || t.servings}`)
    const prep = num(r.prep_min)
    const cook = num(r.cook_min)
    const total = num(r.total_min)
    if (prep) meta.push(`${t.prep} ${prep} min`)
    if (cook) meta.push(`${t.cook} ${cook} min`)
    if (total) meta.push(`${t.total} ${total} min`)
    const tags = lines(r.tags_json)
    if (tags.length) meta.push(tags.map((x) => `#${x.replace(/\s+/g, '-')}`).join(' '))
    if (meta.length) out.push(`_${meta.join(' · ')}_`, '')
    const ing = lines(r.ingredients_json)
    if (ing.length) out.push(`**${t.ingredients}**`, '', ...listBlock(ing, false), '')
    const steps = lines(r.steps_json)
    if (steps.length) out.push(`**${t.steps}**`, '', ...listBlock(steps, true), '')
    const notes = str(r.notes)
    if (notes) out.push(`> ${inline(notes)}`, '')
    const source = str(r.source)
    if (source) out.push(`${t.source} : ${inline(source)}`, '')
  }
  return out
}

export function takeoutMarkdown(data: Takeout, lang: Lang = 'fr'): string {
  const t = L[lang] ?? L.fr
  const tbl = (name: string) => data.tables[name] ?? []
  const out: string[] = []

  const name = str(data.household?.name) || t.household_default
  out.push(`# ${inline(name)}`, '', `${t.exported} ${new Date(data.exportedAt * 1000).toISOString().slice(0, 10)}. ${t.intro}`, '')

  const recipes = tbl('recipes')
  if (recipes.length) out.push(...recipeSection(recipes, t))

  // The list: only what is still to buy. A checked line is history, not a to-do.
  const toBuy = tbl('list_items').filter((r) => !r.checked_at && !r.deleted_at && str(r.text))
  out.push(`## ${t.list}`, '')
  if (toBuy.length) out.push(...toBuy.map((r) => `- [ ] ${inline(str(r.text))}`), '')
  else out.push(`_${t.listEmpty}_`, '')

  // The supper plan: from yesterday on — the past is not a plan.
  const today = data.exportedAt - 86400
  const meals = tbl('meals')
    .filter((r) => (num(r.date) ?? 0) >= today && str(r.title))
    .sort((a, b) => (num(a.date) ?? 0) - (num(b.date) ?? 0))
  if (meals.length) {
    out.push(`## ${t.supper}`, '')
    for (const m of meals) {
      const { iso, dow } = dayOf(num(m.date) ?? 0)
      out.push(`- **${t.days[dow]} ${iso}** — ${inline(str(m.title))}`)
    }
    out.push('')
  }

  const members = tbl('members')
  const contacts = tbl('contacts')
  if (members.length || contacts.length) {
    out.push(`## ${t.people}`, '')
    for (const m of [...members].sort((a, b) => (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0))) {
      if (str(m.display_name)) out.push(`- ${inline(str(m.display_name))} _(${t.household.toLowerCase()})_`)
    }
    for (const c of contacts) {
      const full = [str(c.first_name), str(c.last_name)].filter(Boolean).join(' ')
      if (!full) continue
      const bits: string[] = []
      const nick = str(c.nickname)
      if (nick) bits.push(`« ${inline(nick)} »`)
      const bday = str(c.birthday)
      if (bday) bits.push(`${t.birthday} ${bday.replace(/^0000-/, '')}`)
      if (str(c.email)) bits.push(str(c.email))
      if (str(c.phone)) bits.push(str(c.phone))
      out.push(`- ${inline(full)}${bits.length ? ` — ${bits.join(' · ')}` : ''}`)
    }
    out.push('')
  }

  const notes = live(tbl('family_notes')).filter((r) => str(r.text))
  if (notes.length) {
    out.push(`## ${t.notes}`, '')
    for (const n of notes.sort((a, b) => (num(a.created_at) ?? 0) - (num(b.created_at) ?? 0))) {
      const when = dayOf(num(n.created_at) ?? 0).iso
      out.push(`- _${when}_ — ${inline(str(n.text))}`)
    }
    out.push('')
  }

  const routines = tbl('routines').filter((r) => str(r.name))
  if (routines.length) {
    out.push(`## ${t.routines}`, '')
    for (const r of routines) {
      const cards = jsonArray(r.cards_json)
        .map((c) => (c && typeof c === 'object' ? str((c as Row).label) : ''))
        .filter(Boolean)
      out.push(`- **${inline(str(r.name))}**${cards.length ? ` — ${cards.map(inline).join(' → ')}` : ''}`)
    }
    out.push('')
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
