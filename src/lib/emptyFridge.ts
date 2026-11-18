// « Vide-frigo » pure logic — the decision bits worth unit-testing, kept out of the
// React component. The flow: AI proposes ~10 dish names that use up what's about to
// spoil, the cook ticks a few, each pick becomes a full recipe to keep or cook.

// At most this many ideas become recipes at once (shared/, the handler's cap too).
import { MAX_FRIDGE_PICKS } from '../../shared/emptyFridge'
export { MAX_FRIDGE_PICKS }

// Toggle a dish name in the picked set, refusing a NEW pick once `max` is reached
// (un-ticking an already-picked one always works). Returns a fresh Set so React
// state updates cleanly.
export function togglePick(picked: ReadonlySet<string>, title: string, max = MAX_FRIDGE_PICKS): Set<string> {
  const next = new Set(picked)
  if (next.has(title)) next.delete(title)
  else if (next.size < max) next.add(title)
  return next
}
