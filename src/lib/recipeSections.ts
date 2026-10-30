// Recipe sections — a recipe with named parts ("Biscuits" / "Glaçage") keeps
// ONE flat string[] for ingredients and one for steps (the stored shape never
// changed); a part boundary is an inline heading line "## Glaçage". Old recipes
// simply have no heading lines and render exactly as before. Every consumer
// that iterates the lines (scaling, shopping, cook mode, step matching) treats
// a heading as structure, not content.
//
// Mirrored in functions/_lib/recipeSections.ts (same src/functions duplication
// convention as ingredient.ts) — keep the two in sync.

export const SECTION_PREFIX = '## '

const HEADING_RE = /^##\s+\S/

export const isSectionHeading = (line: string): boolean => HEADING_RE.test(line.trim())

// "## Glaçage" → "Glaçage". Safe on a non-heading (returns the line untouched).
export const sectionTitle = (line: string): string => {
  const s = line.trim()
  return HEADING_RE.test(s) ? s.replace(/^##\s+/, '').trim() : s
}

export const makeSectionHeading = (title: string): string => SECTION_PREFIX + title.trim()

// The content lines only — what "how many ingredients" or "push to the list"
// should count.
export const withoutHeadings = (lines: string[]): string[] => lines.filter((l) => !isSectionHeading(l))

// A heading directly followed by another heading (or by nothing) introduces an
// empty part — drop it. Run before saving / after parsing.
export function dropDanglingHeadings(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    if (isSectionHeading(l) && out.length && isSectionHeading(out[out.length - 1])) out.pop()
    out.push(l)
  }
  if (out.length && isSectionHeading(out[out.length - 1])) out.pop()
  return out
}

// Group the flat lines for display. `idx` is each item's position in the
// ORIGINAL array, so per-index UI state (the cook-mode gather checklist) stays
// stable whether or not headings exist. A recipe with no headings comes back as
// one untitled group; lines before the first heading form an untitled lead group.
export interface RecipeSection {
  title: string | null
  items: { text: string; idx: number }[]
}
export function groupSections(lines: string[]): RecipeSection[] {
  const groups: RecipeSection[] = []
  let cur: RecipeSection = { title: null, items: [] }
  lines.forEach((line, idx) => {
    if (isSectionHeading(line)) {
      if (cur.items.length || cur.title) groups.push(cur)
      cur = { title: sectionTitle(line), items: [] }
    } else {
      cur.items.push({ text: line, idx })
    }
  })
  if (cur.items.length || cur.title) groups.push(cur)
  return groups
}

// ── Versions ─────────────────────────────────────────────────────────────────
// A page's ALTERNATIVE — « pour une version bol », « Variante », « Version au barbecue »
// (Marc, 2026-10-30: « sometimes it adds the ingredients in the ingredient list, not as
// a full "this is another way if you want" thing ») — rides the same two flat lists, no
// new table: a VERSION is a step section titled T, matched by ingredient sections titled
// T or « T — part » (the import composes those from the page's part labels printed under
// the version's label). A section present in ONE list only is a part (« Pour la
// sauce », « Cuisson »), never a version. The sheet and cook mode show a version behind
// a switch: the base recipe plus the version's ingredients, and the version's steps
// INSTEAD of the base's — a « version bol » is a whole other way to the table.
export interface RecipeVersion {
  title: string
  // The version's own lines, its parts as plain « ## part » headings.
  ingredients: string[]
  steps: string[]
}
const VERSION_SEP = ' — '
const key = (t: string) => t.trim().toLowerCase()
// « T — part » → T ; « T » → T.
const versionOf = (title: string) => {
  const i = title.indexOf(VERSION_SEP)
  return i < 0 ? title : title.slice(0, i)
}
const partOf = (title: string): string | null => {
  const i = title.indexOf(VERSION_SEP)
  return i < 0 ? null : title.slice(i + VERSION_SEP.length)
}
const flatten = (groups: RecipeSection[]): string[] => groups.flatMap((g) => [...(g.title ? [makeSectionHeading(g.title)] : []), ...g.items.map((i) => i.text)])

export function recipeVersions(ingredients: string[], steps: string[]): RecipeVersion[] {
  const ingGroups = groupSections(ingredients)
  const stepGroups = groupSections(steps)
  const ingKeys = new Set(ingGroups.filter((g) => g.title).map((g) => key(versionOf(g.title!))))
  const out: RecipeVersion[] = []
  const seen = new Set<string>()
  for (const g of stepGroups) {
    if (!g.title) continue
    const title = versionOf(g.title)
    const k = key(title)
    if (seen.has(k) || !ingKeys.has(k)) continue
    seen.add(k)
    const lines = (groups: RecipeSection[]) =>
      groups
        .filter((x) => x.title && key(versionOf(x.title)) === k)
        .flatMap((x) => {
          const part = partOf(x.title!)
          return [...(part ? [makeSectionHeading(part)] : []), ...x.items.map((i) => i.text)]
        })
    out.push({ title, ingredients: lines(ingGroups), steps: lines(stepGroups) })
  }
  return out
}

// The lists a cook reads for a pick: `null` = the base recipe (every line outside the
// versions); a version = base ingredients + its own, and ITS steps only. Lists without
// a version come back untouched.
export function applyVersion(ingredients: string[], steps: string[], pick: string | null): { ingredients: string[]; steps: string[] } {
  const versions = recipeVersions(ingredients, steps)
  if (!versions.length) return { ingredients, steps }
  const keys = new Set(versions.map((v) => key(v.title)))
  const isVersion = (title: string | null) => !!title && keys.has(key(versionOf(title)))
  const baseIng = flatten(groupSections(ingredients).filter((g) => !isVersion(g.title)))
  const baseSteps = flatten(groupSections(steps).filter((g) => !isVersion(g.title)))
  const v = pick == null ? null : (versions.find((x) => key(x.title) === key(pick)) ?? null)
  if (!v) return { ingredients: baseIng, steps: baseSteps }
  return { ingredients: [...baseIng, ...v.ingredients], steps: v.steps }
}

// The same pick over DISPLAY groups, keeping every item's original `idx` (cook mode's
// gather checklist and the step photos are keyed by it): base groups stay, a picked
// version's groups show under their part name (its own heading is the switch), and
// with a version picked the base's step groups go.
export function versionGroups(groups: RecipeSection[], kind: 'ingredients' | 'steps', versions: RecipeVersion[], pick: string | null): RecipeSection[] {
  if (!versions.length) return groups
  const keys = new Set(versions.map((v) => key(v.title)))
  const pk = pick == null ? null : key(pick)
  return groups.flatMap((g) => {
    const vk = g.title ? key(versionOf(g.title)) : null
    if (vk == null || !keys.has(vk)) return kind === 'steps' && pk != null ? [] : [g]
    if (vk !== pk) return []
    return [{ ...g, title: partOf(g.title!) }]
  })
}

// The switch's word for a version: the page's label without its preamble (« pour une
// version bol » → « Bol », « Version au barbecue » → « Au barbecue », « Bowl version » →
// « Bowl »); a bare « Variante » keeps its name.
export const versionLabel = (title: string): string => {
  const s = title
    .trim()
    .replace(/^(?:pour\s+(?:une?|la|le)\s+)?(?:version|variante)\s*/i, '')
    .replace(/\s*(?:version|variante)\s*$/i, '')
    .replace(/^[:\-–—\s]+|[:\s]+$/g, '')
    .trim()
  const w = s || title.trim()
  return w.charAt(0).toUpperCase() + w.slice(1)
}
