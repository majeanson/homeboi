import { expect, type Locator } from '@playwright/test'

// `(await locator.boundingBox())!` — **0 sites left in this suite** (2026-09-09). It
// throws « Cannot read properties of null (reading 'y') » when the node is detached
// between the two selector resolves.
//
// It said « 74 sites » for weeks after the real number fell to 40, which is how the
// standing "convert one whenever you touch it" rule read as hopeless rather than nearly
// done. The 42 remaining calls were converted in one pass; `docCounts.test.ts` now
// asserts the count from the suite itself, so this sentence cannot drift again — and it
// is a RATCHET: the number may fall to 0 and never rise.
//
// The last holdout was `hold()` in board-edit.spec.ts, held back deliberately while a CI
// run judged a flake in the test it feeds — changing the helper mid-verdict would have
// made that verdict unreadable. The verdict came in (one failure at 6.6s, i.e. the press
// hit nothing and the 5s assertion timed out; then a pass at 1.7s), and it is exactly the
// shape of a stale measurement. Converted with the evidence, not on the hunch.
//
// The trap is NOT "the element isn't visible yet": Playwright's visibility already
// means a non-empty box, and lean-forms.spec.ts:112 threw on a locator whose
// `toBeVisible()` had just passed on the line above. It is that the two calls resolve
// the selector TWICE. Between them React can re-render the list — data lands, a query
// settles — and the second resolve hits a node that has just been detached, which
// answers null. Rare on a fast machine, reproducible under the full parallel suite:
// exactly the "a guard that only holds when the machine is fast is not a guard" shape
// that has now cost two CI reds in two days (cbed72c, then this).
//
// So retry the MEASUREMENT rather than asserting harder before it. `expect.poll`
// re-resolves the locator each attempt, so a detached node simply loses the race and
// the next attempt measures the node that replaced it.
//
// Use this instead of `(await x.boundingBox())!` in any new assertion, and when you
// touch an old one.
export async function boxOf(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  let box: { x: number; y: number; width: number; height: number } | null = null
  await expect
    .poll(async () => {
      box = await locator.boundingBox()
      return box !== null
    }, { message: 'the element never reported a bounding box' })
    .toBe(true)
  return box!
}
