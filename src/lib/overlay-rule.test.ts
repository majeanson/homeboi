import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readScanned } from './buildGuardScan'

// THE OVERLAY RULE (2026-11-05). Three shells own dialog behaviour (Modal, Sheet, confirm);
// useModal gives them Escape, the scroll lock, the focus trap and the phone's back button.
// The BAN (a role="dialog" or a useModal( outside the shells, each exception with its reason)
// is the oxlint rule `babillard/dialog-shell` now (review #41, scripts/lint-rules.mjs). What
// stays here is the one check a node-at-a-time rule cannot make: WHO owns the back button.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('overlay rule', () => {
  it('the overlay shells own the back button (history: true), the routed scenes do not', () => {
    for (const file of ['src/components/Modal.tsx', 'src/components/Sheet.tsx', 'src/lib/confirm.tsx']) {
      expect(/useModal\([^)]*history:\s*true/.test(readScanned(join(rootDir, file))), `${file} must pass history: true`).toBe(true)
    }
    for (const file of ['src/components/CookMode.tsx', 'src/components/CashierMode.tsx', 'src/components/cercle/NoteEditor.tsx']) {
      expect(/history:\s*true/.test(readScanned(join(rootDir, file))), `${file} is a ROUTE — the router owns its history entry`).toBe(false)
    }
  })
})
