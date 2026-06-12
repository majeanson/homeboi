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
