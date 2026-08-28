import { expect, type Locator } from '@playwright/test'

// `(await locator.boundingBox())!` — 74 sites across this suite, and every one of
// them can throw « Cannot read properties of null (reading 'y') ».
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
