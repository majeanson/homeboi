import { htmlToText, normLoose } from './recipeImport'
import { isSectionHeading, makeSectionHeading } from './recipeSections'

// SITE ADAPTERS (C2, 2026-10-27) — the parts (« Pâte » / « Garniture ») a site KNOWS but
// its schema.org JSON-LD flattens away. schema.org has no ingredient groups, so a Ricardo
// or WP Recipe Maker recipe arrives as one long list; `regroupIngredientsInText` recovers
// the groups from the page's text when every line can be located there, which is most of
// the time. These read the site's OWN group data instead, so the groups come back even
// when the text cannot be matched (a captured page's innerText, a line the page renders
// differently from its JSON-LD):
//   · Ricardo — `<div data-react-app="recipeCookingMode" data-react-app-props="…">`: a
//     JSON of `ingredientGroups[].{description, ingredients[].description}` and
//     `preparationGroups[].{description, preparations[].description}`. The bookmark
//     sends the same JSON as `extras.ricardo`.
//   · WPRM (any host) — `wprm-recipe-ingredient-group` blocks, each with its
//     `wprm-recipe-group-name` and its `wprm-recipe-ingredient` rows.
// A group source applies ALL-OR-NOTHING (`applyGroups`): the structured list must be the
// same lines, in the same order (Ricardo: every line equal; WPRM: the same count per
// group, its rows render amounts differently). Any doubt → the flat list stands.

export interface SiteGroup {
  name: string
  lines: string[]
}
export interface Adapted {
  ingredientGroups?: SiteGroup[]
  stepGroups?: SiteGroup[]
  // true → the group lines are the structured lines themselves (checked one by one);
  // false → only the per-group COUNT is trusted.
  exact: boolean
}

const decodeAttr = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

// Ricardo's cooking-mode props → its groups.
export function ricardoGroups(propsJson: string): Adapted | null {
  let j: unknown
  try {
    j = JSON.parse(propsJson)
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const groups = (list: unknown, items: string): SiteGroup[] =>
    (Array.isArray(list) ? list : [])
      .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
      .map((g) => ({
        name: typeof g.description === 'string' ? g.description.trim() : '',
        lines: (Array.isArray(g[items]) ? (g[items] as unknown[]) : [])
          .map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>).description : null))
          .filter((d): d is string => typeof d === 'string' && !!d.trim())
          .map((d) => d.trim()),
      }))
      .filter((g) => g.lines.length > 0)
  const ingredientGroups = groups(o.ingredientGroups, 'ingredients')
  const stepGroups = groups(o.preparationGroups, 'preparations')
  if (!ingredientGroups.length && !stepGroups.length) return null
  return { ingredientGroups, stepGroups, exact: true }
}

function ricardoFromHtml(html: string): Adapted | null {
  for (const m of html.matchAll(/<[a-z]+\b[^>]*\bdata-react-app=["']recipeCookingMode["'][^>]*>/gi)) {
    const props = m[0].match(/\bdata-react-app-props=(["'])([\s\S]*?)\1/i)
    if (props) return ricardoGroups(decodeAttr(props[2]))
  }
  return null
}

function wprmFromHtml(html: string): Adapted | null {
  const starts = [...html.matchAll(/<[a-z]+\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient-group\b[^"']*["'][^>]*>/gi)].map((m) => m.index)
  if (starts.length < 2) return null
  const groups: SiteGroup[] = []
  for (let i = 0; i < starts.length; i++) {
    const seg = html.slice(starts[i], starts[i + 1] ?? starts[i] + 60_000)
    const name = seg.match(/class=["'][^"']*\bwprm-recipe-group-name\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:h\d|div|span|p)>/i)
    const lines = [...seg.matchAll(/<li\b[^>]*class=["'][^"']*\bwprm-recipe-ingredient\b(?!-)[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
      htmlToText(m[1], 400).replace(/\s+/g, ' ').trim(),
    )
    groups.push({ name: name ? htmlToText(name[1], 200).replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim() : '', lines })
  }
  return groups.some((g) => g.lines.length) ? { ingredientGroups: groups, exact: false } : null
}

/** The site's own groups, from the page's HTML or a captured page's extras. */
export function adaptPage(html: string | null, extras?: { ricardo?: unknown } | null): Adapted | null {
  if (typeof extras?.ricardo === 'string') {
    const r = ricardoGroups(extras.ricardo)
    if (r) return r
  }
  if (!html) return null
  return ricardoFromHtml(html) ?? wprmFromHtml(html)
}

/** The flat structured list, cut by the site's groups — or null when they are not the
 *  very same lines (then the flat list, or the text regroup, stands). A single group
 *  covering everything adds nothing and is not applied. */
export function applyGroups(flat: string[], groups: SiteGroup[] | undefined, exact: boolean): string[] | null {
  if (!groups || groups.length < 2 || flat.some((l) => isSectionHeading(l))) return null
  if (!groups.some((g) => g.name)) return null
  const total = groups.reduce((n, g) => n + g.lines.length, 0)
  if (total !== flat.length) return null
  const out: string[] = []
  let i = 0
  for (const g of groups) {
    if (g.name) out.push(makeSectionHeading(g.name))
    for (const line of g.lines) {
      if (exact && normLoose(line) !== normLoose(flat[i])) return null
      out.push(flat[i++])
    }
  }
  return out
}
