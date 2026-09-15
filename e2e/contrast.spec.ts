import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mockApi, seedState } from './mocks'

// WCAG AA CONTRAST, ACROSS THE APP, IN BOTH THEMES AND BOTH DEVICE ROLES — a ratchet
// at zero.
//
// This app is read on a wall tablet from across a kitchen, so contrast is closer to a
// product requirement here than to a compliance box. Nothing measured it until the axe
// pass landed in `npm run e2e:matrix` (2026-09-14), which found `color-contrast` on 78
// of 154 states.
//
// Cleaned out 2026-09-15. Twelve distinct colour pairs by day, ten by night — which
// came down to five root causes, every one of which already had a correct answer
// elsewhere in this codebase:
//
//   • `opacity` used to make a line read as SECONDARY. On tinted ink over a pale ground
//     that walks it TOWARD the ground, the one direction that costs legibility. The
//     board's hero labels, the fridge-note age stamp, the cercle group's kind badge.
//     They mix toward `--ink` now, which reads just as quiet and moves the other way.
//   • a `-deep` token used as TEXT. core.css states the rule in the palette itself:
//     "Text NEVER uses a -deep on a wash: that's what the -ink tier below is for
//     (4.5:1)." Broken in four places — the kitchen day headers, Découvrir's « en
//     savoir plus », the Maisonnée pill, « Notre monde »'s launcher.
//   • a hard-coded `#fff` on an arbitrary tint — the routine card's « Faire » button,
//     at 2.03:1, a primary action nobody could read. It takes `readableInk()` through a
//     CSS var now, and its ground is exactly the colour that ink was chosen for.
//   • `readableInk` handing back the WORSE of its two inks for eleven palette colours.
//   • `tintInk`'s ramp, hand-picked before anything measured it, leaving the brighter
//     tints near 4.0:1.
//
// The last two are pure functions, held by colors.test.ts. The rest are held here,
// because only a browser can composite a translucent wash over a daypart paper.
//
// WHY axe RATHER THAN OUR OWN ARITHMETIC: the first version of this computed its own
// ratios and got them wrong. It walked ancestors for a background with alpha > 0.5 —
// which steps straight over a `wash()` at 13% alpha — so it measured text against the
// PAGE instead of its card, and reported 11.78:1 where axe had 3.02:1. Its red and its
// green were both fiction. axe composites layered translucency, honours opacity, knows
// the large-text tier, and is the same engine the matrix sweep reports from, so the two
// can no longer disagree.
//
// A surface added here that cannot reach zero should be FIXED, not excluded — and if it
// truly must be, exclude the selector with its reason, never the route.
const SURFACES = [
  { name: 'board', route: '/board' },
  { name: 'kitchen', route: '/kitchen' },
  { name: 'recipes', route: '/kitchen?tab=recipes' },
  { name: 'liste', route: '/liste' },
  { name: 'notes', route: '/notes' },
  { name: 'virements', route: '/notes?section=virements' },
  { name: 'maison', route: '/maison' },
  { name: 'famille', route: '/maison?section=family' },
  { name: 'settings', route: '/settings' },
  // The day planner, a route of its own rather than a tab — and the one the matrix
  // sweep kept reporting while this file said zero.
  { name: 'day-plan', route: '/kitchen/day/2025-06-08' },
  // Réglages' themed tabs each carry their own sub-pill row; the top-level route only
  // ever paints ONE of them, and the active pill was failing on the others.
  { name: 'settings-kitchen', route: '/settings?tab=kitchen' },
  { name: 'settings-systeme', route: '/settings?tab=systeme' },
] as const

// THE EMPTY HOUSEHOLD IS A REAL STATE, AND IT WAS THE BLIND SPOT.
//
// Nine of the sweep's remaining hits were `.empty-state__guide` — a colour that only
// exists when there is nothing to show, which a seeded fixture never renders. A
// household's FIRST five minutes is exactly when it can least afford unreadable text.
const FIXTURES = [
  { name: 'seeded', fresh: false },
  { name: 'fresh', fresh: true },
] as const

// BOTH ROLES, because a kiosk is not a wide phone: it renders different components
// (MemberSwitcher in place of FaceSelect, the wall lens on several tabs), so it paints
// colours a mobile-only run never reaches. That is not theoretical — adding the kiosk
// pass is what caught « Notre monde »'s launcher at 3.2:1, on a control that only the
// wall lens renders. This file absorbed a board-only contrast spec rather than letting
// two guards claim one job.
for (const theme of ['day', 'night'] as const) {
  for (const surface of ['mobile', 'kiosk'] as const) {
    for (const fixture of FIXTURES) {
      test(`no WCAG AA contrast failures across the app @${surface}-${theme}-${fixture.name}`, async ({ page }) => {
        await page.setViewportSize(surface === 'kiosk' ? { width: 1280, height: 800 } : { width: 390, height: 844 })
        await mockApi(page, { fresh: fixture.fresh })
        await seedState(page, { theme, audience: 'parent', lang: 'fr', surface })

        const failures: string[] = []
        for (const s of SURFACES) {
          await page.goto(s.route)
          // These surfaces paint from a warm cache; give the real content a beat to
          // land, so this measures the page a household sees, not its skeleton.
          await page.waitForTimeout(700)
          // A false green is the failure mode here: an empty page reports no violations.
          expect(await page.locator('main, .hub__body, .scene').count(), `${s.name} rendered something`).toBeGreaterThan(0)

          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
          for (const v of res.violations.filter((x) => x.id === 'color-contrast')) {
            for (const n of v.nodes) {
              const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number }
              failures.push(`  ${s.name}: ${d.contrastRatio}:1  ${d.fgColor} on ${d.bgColor}  — ${n.target.join(' ')}`)
            }
          }
        }
        expect(failures, 'text below WCAG AA, with the colours axe measured:\n' + failures.join('\n')).toEqual([])
      })
    }
  }
}
