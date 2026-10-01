import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { ROUTES } from './routes'

// THE GAP OWNS THE SPACING — a ratchet at zero (2026-10-01).
//
// A shared component carries an outer margin for the day it stands alone in the page
// flow (SubTabs' row and MemberSwitcher 1.25rem below, a Disclosure 0.5rem above, a <p>
// the browser's 1em). Inside a flex container that margin never collapses into the
// container's `gap`, it ADDS to it:
//   • in a gapped COLUMN the space is counted twice — Maison put 36px under its section
//     pills where the page breathes 16px; « Pour qui ? » floated 28px from its field;
//   • in a CENTRED ROW it is part of the box being centred, so the neighbours sit off
//     the line — the Réglages « ? » sat 10px below Comprendre · Régler.
// The fix is the « gap owns the spacing » block in core.css. This walks every route at
// a phone and a desktop width and fails on a new one.
//
// The allow-list is rhythm on purpose, each with its reason — not a parking lot.

const ALLOWED: { parent: string; child: string; why: string }[] = [
  { parent: 'qa__list', child: 'qa__grouphead', why: 'a group heading sits closer to its items than to the group above' },
  { parent: 'recipe-modal__body', child: 'recipe-sec-h', why: 'a section heading sits closer to its section than to the one above' },
  { parent: 'voyage-form', child: 'voyage-form__label', why: 'a label hugs its own field, apart from the field above' },
  { parent: 'voyage-form', child: 'btn--primary', why: 'the submit stands apart from the fields it submits' },
  { parent: 'operator__inline-form', child: 'form-footer', why: 'the submit row stands apart from the fields it submits' },
]

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

for (const size of SIZES) {
  for (const route of ROUTES) {
    const at = `${route} @${size.name}`
    test(`the gap owns the spacing on ${at}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await mockApi(page)
      await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
      await page.goto(route)
      await expect(page.locator('.loading, .skeleton'), `${at} finished loading`).toHaveCount(0, { timeout: 15_000 })
      await page.waitForTimeout(300)
      const hits = await page.evaluate((allowed) => {
        const sig = (el: Element) =>
          el.tagName.toLowerCase() + [...el.classList].filter((c) => !c.startsWith('is-')).map((c) => '.' + c).join('')
        const inFlow = (el: Element) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.position !== 'absolute' && cs.position !== 'fixed'
        }
        const ok = (p: Element, c: Element) => allowed.some((a) => p.classList.contains(a.parent) && c.classList.contains(a.child))
        const out: string[] = []
        for (const p of document.querySelectorAll('body *')) {
          const ps = getComputedStyle(p)
          if (!ps.display.includes('flex')) continue
          const kids = [...p.children].filter(inFlow)
          if (kids.length < 2) continue
          const row = ps.flexDirection.startsWith('row')
          const gap = parseFloat(ps.rowGap) || 0
          kids.forEach((c, i) => {
            if (ok(p, c)) return
            const cs = getComputedStyle(c)
            const mt = parseFloat(cs.marginTop) || 0
            const mb = parseFloat(cs.marginBottom) || 0
            if (row && ps.alignItems === 'center' && Math.abs(mt - mb) >= 4) {
              // Only a sibling sharing the LINE can be pushed off it.
              const r = c.getBoundingClientRect()
              const shares = kids.some((k) => {
                if (k === c) return false
                const kr = k.getBoundingClientRect()
                return kr.top < r.bottom && kr.bottom > r.top
              })
              if (shares) out.push(`row: ${sig(p)} > ${sig(c)} (margin ${mt}/${mb}px shifts the centre line)`)
            }
            if (!row && gap >= 4 && i > 0 && i < kids.length - 1 && (mt >= 4 || mb >= 4))
              out.push(`column: ${sig(p)} > ${sig(c)} (margin ${mt}/${mb}px on top of a ${gap}px gap)`)
          })
        }
        return [...new Set(out)]
      }, ALLOWED)
      expect(hits, `a margin adds to its container's spacing on ${at}`).toEqual([])
    })
  }
}
