import { test as base, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, type AppState } from './mocks'

// THE SPEC FIXTURE — `app.boot()` is how a browser test starts.
//
// On 2026-11-05, 45 specs each declared their own `async function boot(page)`, and
// they were the same four lines with the same four-key seed
// (`{theme:'day', audience:'parent', lang:'fr', surface:'mobile'}`) — plus one
// difference each, which is exactly how a shared behaviour drifts: one spec forgot
// `reducedMotion` and shot animations mid-frame, one re-seeded « tours seen » by hand
// after seedState had already done it, one waited on `.hub` and one did not. This
// fixture is the one boot; a spec says only what differs.
//
//   import { test, expect } from './fixtures'
//   test('…', async ({ page, app }) => {
//     await app.boot({ route: '/kitchen', state: { audience: 'toddler' } })
//     …
//   })
//
// Defaults are the common case, each one opt-OUT rather than opt-in:
//   • reduced motion ON (a screenshot or a measure never lands mid-transition);
//   • the seed above, merged under `state` (so `state: { lang: 'en' }` keeps the rest);
//   • NO fixed clock unless `clock` is given — a spec that cares about the date says so
//     (`clock: 'BASE'` is the shared past anchor; a number is seconds since the epoch);
//   • `wait` is a selector to await after navigation (`'.hub'` for a hub tab); none by
//     default, since a public page has no hub.
// Everything the old boots did in addition (a viewport, an addInitScript) is a plain
// call before or after `boot` — the fixture does not grow a flag per spec.

type MockOpts = NonNullable<Parameters<typeof mockApi>[1]>

export interface BootOpts {
  /** Where to land. Omit to only prepare the page (mock + seed) and navigate yourself. */
  route?: string
  /** Merged over the default seed. */
  state?: AppState
  /** Passed to mockApi — signedIn / fresh / sandbox / delay / error / overrides. */
  api?: MockOpts
  /** Fix the browser clock: 'BASE' = the shared anchor; a number = seconds since epoch. */
  clock?: 'BASE' | number
  /** Viewport, when the spec is about a width. */
  viewport?: { width: number; height: number }
  /** A selector to wait for after `route` (e.g. '.hub'). */
  wait?: string
  /** Opt OUT of reduced motion (a spec that measures a transition). */
  motion?: boolean
}

export interface App {
  page: Page
  boot(opts?: BootOpts): Promise<void>
}

export const DEFAULT_STATE: AppState = { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' }

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    await use({
      page,
      async boot(opts = {}) {
        if (!opts.motion) await page.emulateMedia({ reducedMotion: 'reduce' })
        if (opts.viewport) await page.setViewportSize(opts.viewport)
        if (opts.clock !== undefined) await page.clock.setFixedTime(new Date((opts.clock === 'BASE' ? BASE : opts.clock) * 1000))
        await mockApi(page, opts.api ?? {})
        await seedState(page, { ...DEFAULT_STATE, ...opts.state })
        if (opts.route) {
          await page.goto(opts.route)
          if (opts.wait) await page.locator(opts.wait).first().waitFor({ state: 'visible', timeout: 15_000 })
        }
      },
    })
  },
})

export { expect }
