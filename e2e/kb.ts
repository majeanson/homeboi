import { expect, type Page, type Locator } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Shared fake-keyboard rig (extracted from keyboard.spec.ts so the state-matrix
// suite can open keyboard states too). Playwright can't summon a real OSK, so we
// install a CONTROLLABLE visualViewport stub before the app boots and shrink it
// mid-test the way iOS does when the keyboard slides in; src/lib/viewportVars.ts
// reads the stub into --vvh/--vvt/--kb + `.kb-open` exactly as on-device.

export const DEVICES = [
  { name: 'phone', w: 390, h: 844, kb: 336 },
  { name: 'ipad', w: 820, h: 1180, kb: 405 },
]

export function boot(device: { w: number; h: number }) {
  return async (page: Page, path: string, opts: { signedIn?: boolean } = {}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: device.w, height: device.h })
    await installVvStub(page)
    await mockApi(page, opts)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, surface: 'mobile' })
    // The three note-editor keyboard cases reach the editor through « Nouvelle note »,
    // which is ADVANCED-mode chrome (« Les notes » defaults to its lean reading face,
    // lib/notesMode). Harmless everywhere else — it is one localStorage flag on a page
    // that has no notes UI.
    await page.addInitScript(() => localStorage.setItem('babillard-notes-advanced', '1'))
    await page.goto(path)
    await page.locator('.hub, .page').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
  }
}

// The stub alone (for callers that manage their own mockApi/seedState/goto).
export async function installVvStub(page: Page) {
  await page.addInitScript(() => {
    const stub = new EventTarget() as EventTarget & { height: number; offsetTop: number }
    stub.height = window.innerHeight
    stub.offsetTop = 0
    Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true })
    ;(window as unknown as { __vvStub: typeof stub }).__vvStub = stub
  })
}

// Slide the fake keyboard in (visual viewport loses `kb` px) AND paint a band so
// the screenshot shows exactly what a keyboard would obscure. `pan` simulates the
// iOS standalone "viewport push": focusing a caret near the bottom makes iOS pan
// the visual viewport (offsetTop > 0) by up to most of the keyboard's height.
export async function openKeyboard(page: Page, kb: number, pan = 0) {
  await page.evaluate(({ kbH, pan }) => {
    const stub = (window as unknown as { __vvStub: { height: number; offsetTop: number; dispatchEvent: (e: Event) => boolean } }).__vvStub
    stub.height = window.innerHeight - kbH
    stub.offsetTop = pan
    stub.dispatchEvent(new Event('resize'))
    let el = document.getElementById('fake-kb')
    if (!el) {
      el = document.createElement('div')
      el.id = 'fake-kb'
      document.body.appendChild(el)
    }
    el.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${kbH}px;z-index:99999;pointer-events:none;background:rgba(38,38,64,0.4);border-top:2px solid #6c7bff;`
  }, { kbH: kb, pan })
  await page.waitForTimeout(450)
}

// Element fully inside the visible (above-keyboard) area.
export async function expectAbove(locator: Locator, visibleHeight: number, label: string) {
  await expect(locator, `${label} visible`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} has a box`).not.toBeNull()
  expect(box!.y, `${label} top on-screen`).toBeGreaterThanOrEqual(-1)
  expect(box!.y + box!.height, `${label} above the keyboard`).toBeLessThanOrEqual(visibleHeight + 1)
}
