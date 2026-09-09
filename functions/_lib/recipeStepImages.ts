import { parseJsonArray } from './json'
import { isValidR2Key } from './validate'

// THE server-side home of the recipe step-image lockstep rule (feature #17 B,
// migration 0041).
//
// Per-step photos are a PARALLEL array to steps: `stepImages[i]` is the R2 key for
// step i, or '' when that step has no photo. It stays the SAME LENGTH as steps (a
// « ## » heading row simply holds an empty slot) so the cook view can index it
// positionally — pad/trim to `count`, and validate each entry is an R2-key-shaped
// token, '' otherwise. Defensive on read: a bad or short row reads as all-''.
// Remote URLs are never accepted; a step photo is always an upload (and
// `isValidR2Key` rejects the ':' and '/' a URL would need anyway).
//
// It lives here because the rule had grown THREE spellings — this one in
// `api/recipes.ts`, an inline `steps.map(...)` in `shareSnapshots.ts`, and the
// client's `alignSide` — and a positional array whose invariant is written three
// times is one edit away from two of them disagreeing. `src/lib/parallelArray.ts`
// is the client twin (enforced by `parallel-array-rule.test.ts`); this is the
// server one. A new server reader/writer of `steps_images_json` uses these.
//
// PARITY Wave D parks the deeper convergence (folding the array into per-step
// objects) deliberately: `steps_json` is a `string[]` BY DESIGN — inline section
// headings, 45 readers — so reshaping it would be the churn-only wave PARITY.md
// forbids. Containing the rule in one place is the alternative that pays.

export function normalizeStepImages(v: unknown, count: number): string[] {
  const src = parseJsonArray<unknown>(typeof v === 'string' ? v : JSON.stringify(v ?? []))
  const out: string[] = []
  for (let i = 0; i < count; i++) out.push(isValidR2Key(src[i]) ? (src[i] as string) : '')
  return out
}

// The R2 keys actually present in a step-image array — for cleanup on delete. The
// bound is a ceiling on steps per recipe, not a step count: this reads a stored row
// whose own step array may already be gone.
export const stepImageKeys = (v: unknown, max = 40): string[] =>
  normalizeStepImages(v, max).filter((k) => k.length > 0)
