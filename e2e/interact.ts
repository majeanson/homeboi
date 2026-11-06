import type { Page, Request } from '@playwright/test'
import { mockApi, seedState, type Audience, type Lang } from './mocks'

// What e2e/interactions-*.spec.ts and e2e/config-panels-*.spec.ts share. Those were two
// files of 1 700 and 700 lines until 2026-11-06 (one flake in one of them cost a whole
// file's re-run); they are split by surface, and this is the part that was not theirs.
//
// Interaction coverage: navigation, tabs, toggles, forms, and clicks across
// every surface. Complements screenshots.spec.ts (which only shoots static
// frames). Same frontend-only harness: Vite dev server + stubbed /api/** (see
// mocks.ts). Every write returns a generic { ok:true }, so for forms we assert
// the CORRECT request fired (method + path) rather than a refetched outcome;
// for the optimistic flows (list check, pantry clear) and pure-frontend ones
// (toggles, modals, the servings scaler) we assert the visible result.

export const APP = (path: string, audience: Audience = 'parent', lang: Lang = 'fr') =>
  async (page: Page) => {
    // Emulate prefers-reduced-motion so the app's decorative loops (the toddler
    // picture-card float, entrance fades) are off. Otherwise an INFINITE CSS
    // animation never lets an element go "stable", and Playwright's click waits
    // for stability — a tap on the floating card would time out. (Done here, not
    // via test.use({ reducedMotion }), which doesn't reach the page in this setup.)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience, lang, calm: true })
    await page.goto(path)
  }

// Wait for a surface's anchor element so we don't act on a half-mounted page.
export async function settle(page: Page, ready: string) {
  await page.locator(ready).first().waitFor({ state: 'visible', timeout: 15_000 })
}

// A predicate matching one of our API calls by method + exact pathname (query
// strings ignored, so `deals?q=…` still matches 'deals').
export const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

// Run `action` and assert the expected API call fires as a result of it. The
// waiter is armed BEFORE the action so a fast request can't slip through. The
// timeout sits ABOVE the 15 s undo-toast hold (toast.tsx DEFAULT_UNDO_MS): a
// deferred write (e.g. checking a low item → POST /list) only commits when that
// window closes, so a 15 s waiter raced it and flaked.
export async function expectApi(page: Page, method: string, path: string, action: () => Promise<void>) {
  await Promise.all([page.waitForRequest(isApi(method, path), { timeout: 20_000 }), action()])
}

// Behavioural coverage for the Réglages config panels that were screenshot-only, so
// a broken PATCH would have shipped green (§211). Each test asserts the write fires
// AND carries the right field, so a mis-wired save (or a regressed useWrite
// migration) is caught. The meal-slot panel in particular was moved from raw api()
// to useWrite — this locks that in.
//
// Why these files keep growing (2026-09-03): a settings panel is the one surface where
// « renders correctly » and « works » come apart completely. Every control here
// commits optimistically, so the row reads saved whether or not the write ever left —
// which is why a screenshot sweep passes over a panel that persists nothing. Measured
// that day: 24 subs in SETTINGS_SUBS, 17 panels that write, and only a handful (these
// plus interactions-settings) asserted a request at all. Adding a panel to Réglages
// means adding its write to the config-panels-<tab> spec.
//
// Re-measured 2026-09-08, after the 28 → 14 merge: 17 writing sections, and with the
// second sweep every one of them asserts its write (the a-regler snooze in
// a-regler-snooze.spec, the recipe-tag slots in recipe-tag-slots.spec). **The last two
// closed 2026-09-09** — the member DELETE and the photo UPLOAD. They had been parked as
// "needing a richer harness"; they needed one `setInputFiles` and one route counter. The
// note parking them was also wrong about the mechanism (it called the upload multipart;
// it is a raw blob), which is why the standing rule is to grep the claim rather than
// inherit it.
//
// Every assertion in those specs has been run against a planted bug — the wrong field
// name, a dropped id, a missing colour — and seen to fail. A green settings test that has
// never been shown red is decoration (CLAUDE.md, the guard rule).
export async function panelsReady(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
}
