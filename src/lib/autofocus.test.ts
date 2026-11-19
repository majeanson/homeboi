import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { blankComments } from './buildGuardScan'

// THE KEYBOARD OPENS ON A TAP, NEVER ON ITS OWN (2026-09-24). A field revealed in place by the
// tap that asked for it (a SectionAdd ＋, a ✏️, a day's ＋) focuses; a SCREEN, SHEET or DIALOG
// opening never does — on a phone the keyboard takes half of what just opened (opening a person
// to read their address put the keyboard over the address).
//
// The JSX `autoFocus` attribute is policed by oxlint now (`jsx-a11y/no-autofocus`, review #41):
// each file that may use it carries a file-level disable whose reason says which side of the
// line it is on. What stays here is the one spelling the rule cannot see: TipTap's OPTION.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the keyboard opens on a tap, never on its own', () => {
  it('the rich-text editor never focuses itself either (TipTap spells it `autofocus:`)', () => {
    const src = blankComments(readFileSync(join(srcDir, 'components/cercle/NoteEditorTiptap.tsx'), 'utf8'))
    const opts = [...src.matchAll(/\bautofocus:\s*([^,\n]+)/g)].map((m) => m[1]!.trim())
    expect(opts).toEqual(['false'])
  })
})
