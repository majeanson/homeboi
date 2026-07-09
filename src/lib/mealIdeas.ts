// C-14 — pure logic for the « Proposé par » chip: which kept meal-ideas were
// suggested BY someone (`suggested_by` set) FOR a given day (`date` matches). Kept
// out of the React component so it's plainly unit-testable. A plain undated pool
// idea (`date` null/undefined) never matches — only a dated, attributed suggestion
// counts as "a child's pick for this day".
export interface DatedIdea {
  suggested_by?: string | null
  date?: number | null
}

export function ideasForDay<T extends DatedIdea>(ideas: T[], date: number): T[] {
  return ideas.filter((i) => i.suggested_by != null && i.date === date)
}
