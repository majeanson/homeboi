// Recipe sections — a recipe with named parts ("Biscuits" / "Glaçage") keeps
// ONE flat string[] for ingredients and one for steps; a part boundary is an
// inline heading line "## Glaçage". Old recipes simply have no heading lines.
//
// The MARKER primitives, one copy for the Worker and the SPA (shared/, review #40); the
// display grouping (sections, versions) stays client-side in src/lib/recipeSections.ts.

export const SECTION_PREFIX = '## '

const HEADING_RE = /^##\s+\S/

export const isSectionHeading = (line: string): boolean => HEADING_RE.test(line.trim())

export const makeSectionHeading = (title: string): string => SECTION_PREFIX + title.trim()

// A heading directly followed by another heading (or by nothing) introduces an
// empty part — drop it. Run after parsing.
export function dropDanglingHeadings(lines: string[]): string[] {
  const out: string[] = []
  const endsOnHeading = () => isSectionHeading(out.at(-1) ?? '')
  for (const l of lines) {
    if (isSectionHeading(l) && endsOnHeading()) out.pop()
    out.push(l)
  }
  if (endsOnHeading()) out.pop()
  return out
}
