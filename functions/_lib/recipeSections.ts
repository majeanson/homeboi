// Recipe sections — a recipe with named parts ("Biscuits" / "Glaçage") keeps
// ONE flat string[] for ingredients and one for steps; a part boundary is an
// inline heading line "## Glaçage". Old recipes simply have no heading lines.
//
// Mirror of src/lib/recipeSections.ts (same src/functions duplication
// convention as ingredient.ts) — keep the two in sync. The Worker side only
// needs the marker primitives, not the display grouping.

const SECTION_PREFIX = '## '

const HEADING_RE = /^##\s+\S/

export const isSectionHeading = (line: string): boolean => HEADING_RE.test(line.trim())

export const makeSectionHeading = (title: string): string => SECTION_PREFIX + title.trim()

// A heading directly followed by another heading (or by nothing) introduces an
// empty part — drop it. Run after parsing.
export function dropDanglingHeadings(lines: string[]): string[] {
  const out: string[] = []
  for (const l of lines) {
    if (isSectionHeading(l) && out.length && isSectionHeading(out[out.length - 1])) out.pop()
    out.push(l)
  }
  if (out.length && isSectionHeading(out[out.length - 1])) out.pop()
  return out
}
