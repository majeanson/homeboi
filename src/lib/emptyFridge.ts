// « Vide-frigo » pure logic — the decision bits worth unit-testing, kept out of the
// React component. The flow: AI proposes ~10 dish names that use up what's about to
// spoil, the cook ticks a few, each pick becomes a full recipe to keep or cook.

// At most this many ideas become recipes at once — bounds step 2 to ≤3 AI calls
// (mirrors MAX_PICKS in functions/api/empty-fridge.ts). Keep the two in sync.
export const MAX_FRIDGE_PICKS = 3

// The « Vide-frigo » tile only earns a place when AI is reachable AND there's
// actually something to use up (use-soon or réserve). No perishables → nothing to
// rescue → no dead button (calm).
export function canEmptyFridge(aiEnabled: boolean, soonCount: number, reserveCount: number): boolean {
  return aiEnabled && soonCount + reserveCount > 0
}

// Toggle a dish name in the picked set, refusing a NEW pick once `max` is reached
// (un-ticking an already-picked one always works). Returns a fresh Set so React
// state updates cleanly.
export function togglePick(picked: ReadonlySet<string>, title: string, max = MAX_FRIDGE_PICKS): Set<string> {
  const next = new Set(picked)
  if (next.has(title)) next.delete(title)
  else if (next.size < max) next.add(title)
  return next
}
