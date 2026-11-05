import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE OVERLAY RULE (2026-11-05, wave 0.5 of plans/2026-11-05-SOLIDIFY.md) — sibling of
// chip-rule / img-rule / lens-rule: fail-closed over the shared scanner.
//
// Three shells own the dialog behaviour — Modal (centred), Sheet (bottom), confirm (the
// yes/no) — and `useModal` is what gives any of them Escape, the scroll lock, the focus
// trap and, since this wave, the phone's back button. A `role="dialog"` spelled anywhere
// else is a promise of that behaviour the element may not keep (AmbientScreen had the
// role and none of the behaviour; the AI-error toast called itself an alertdialog and
// trapped nothing), and a `useModal(` call outside the shells is a fourth shell growing.
// Both are allowed ONLY with a reason — and the reasons below are real: the routed
// full-screen scenes (cook, cashier, the note editor…) are dialogs to a screen reader
// and useModal callers by design, while the router owns their history entry.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')
const rel = (f: string) => relative(rootDir, f).split(sep).join('/')

const SHELLS = new Set(['src/components/Modal.tsx', 'src/components/Sheet.tsx', 'src/lib/confirm.tsx', 'src/lib/useModal.ts'])

// file → why it is a dialog of its own (a routed scene, a lightbox, a teaching layer…).
const DIALOG_ALLOWED = new Map<string, string>([
  ['src/components/AmbientScreen.tsx', 'the screensaver: announced as a dialog so a reader knows the board is covered; any key or tap wakes it — no trap, no lock, and NO back-button entry (a wake must never pop history)'],
  ['src/components/CashierMode.tsx', 'a routed full-screen scene (the till); useModal for Esc/trap, the router owns its history entry'],
  ['src/components/CookMode.tsx', 'a routed full-screen scene (cook); same'],
  ['src/components/cercle/NoteEditor.tsx', 'a routed full-screen scene (the note editor); same'],
  ['src/components/DrawPad.tsx', 'a full-screen editor with its OWN history sentinel that BLOCKS a back swipe mid-stroke (it must not close on back — a stroke in progress would be lost)'],
  ['src/components/FlippPager.tsx', 'the flipp.com pager, an overlay inside the till — useModal with history:true'],
  ['src/components/FlyerViewer.tsx', 'the flyer lightbox, an overlay inside the deals browser — useModal with history:true'],
  ['src/components/RecipeForm.tsx', 'a routed full-screen scene (recipe edit); same as cook'],
  ['src/components/RecipeScene.tsx', 'a routed full-screen scene (the recipe); same'],
  ['src/components/tour/TourOverlay.tsx', 'the guided tour: a teaching layer over the page; useModal for Esc/trap, no back entry (a tour step is not a place)'],
  ['src/components/ZoomableImg.tsx', 'the image zoom lightbox — useModal with history:true'],
])

// file → why it calls useModal without being a shell (the same list, minus the one
// that has the role without the hook; plus ActionMenu, a menu panel not a dialog).
const USE_MODAL_ALLOWED = new Map<string, string>([
  ...[...DIALOG_ALLOWED].filter(([f]) => f !== 'src/components/AmbientScreen.tsx'),
  ['src/components/ActionMenu.tsx', 'the ⋯ menu panel (role=menu): Esc + outside-tap + back button through useModal, no dialog role'],
])

const ROLE = /role=["'](?:alert)?dialog["']/g
const HOOK = /\buseModal\s*\(/g

function scan(re: RegExp, allowed: Map<string, string>): string[] {
  const out: string[] = []
  for (const f of sourceFiles(srcDir)) {
    const file = rel(f)
    if (SHELLS.has(file) || allowed.has(file)) continue
    const src = readScanned(f)
    for (const m of src.matchAll(re)) out.push(`${file}:${src.slice(0, m.index).split('\n').length}  ${m[0]}`)
  }
  return out
}

describe('overlay rule', () => {
  it('role="dialog" lives in Modal / Sheet / confirm, or in a file that says why it is its own', () => {
    expect(scan(ROLE, DIALOG_ALLOWED).join('\n'), 'use <Modal> or <Sheet>, or add the file to DIALOG_ALLOWED with the reason it cannot').toBe('')
  })

  it('useModal( is called by the shells, or by a file that says why it is its own', () => {
    expect(scan(HOOK, USE_MODAL_ALLOWED).join('\n'), 'use <Modal> or <Sheet>, or add the file to USE_MODAL_ALLOWED with the reason').toBe('')
  })

  it('every allowed file still does what it is allowed for (a stale exemption is a silent hole)', () => {
    for (const [file] of DIALOG_ALLOWED) {
      const src = readScanned(join(rootDir, file))
      expect(ROLE.test(src), `${file} no longer spells role="dialog" — drop it from DIALOG_ALLOWED`).toBe(true)
      ROLE.lastIndex = 0
    }
    for (const [file] of USE_MODAL_ALLOWED) {
      const src = readScanned(join(rootDir, file))
      expect(HOOK.test(src), `${file} no longer calls useModal — drop it from USE_MODAL_ALLOWED`).toBe(true)
      HOOK.lastIndex = 0
    }
  })

  it('the overlay shells own the back button (history: true), the routed scenes do not', () => {
    for (const file of ['src/components/Modal.tsx', 'src/components/Sheet.tsx', 'src/lib/confirm.tsx']) {
      expect(/useModal\([^)]*history:\s*true/.test(readScanned(join(rootDir, file))), `${file} must pass history: true`).toBe(true)
    }
    for (const file of ['src/components/CookMode.tsx', 'src/components/CashierMode.tsx', 'src/components/cercle/NoteEditor.tsx']) {
      expect(/history:\s*true/.test(readScanned(join(rootDir, file))), `${file} is a ROUTE — the router owns its history entry`).toBe(false)
    }
  })
})
