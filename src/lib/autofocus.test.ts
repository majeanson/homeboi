import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { blankComments, sourceFiles } from './buildGuardScan'

// THE KEYBOARD OPENS ON A TAP, NEVER ON ITS OWN (2026-09-24).
//
// The rule was already written down — useModal.ts, SearchPage, KidExitGate and RecipeForm
// each said « the keyboard only ever opens on an explicit tap, never when a scene
// mounts » — and a dozen surfaces broke it anyway, because a comment in four files holds
// nothing in the other forty. Marc, on a phone: the keyboard popped up uninvited. Opening
// a PERSON to read their address put the keyboard over the address. So did a pet, a
// business, a carnet, the Ask sheet, holding ＋ for a note, a remark, a new note, a new
// trip. And React's `autoFocus` commits BEFORE useModal's effect, whose « never onto a
// text field » guard then saw focus already inside the dialog and kept it there.
//
// THE RULE, in one line: a field REVEALED IN PLACE by the tap that asked for it (the ＋ of
// a SectionAdd, a ✏️, a day's ＋, « écrire le mien ») focuses — you just said you want to
// type. A SCREEN, SHEET or DIALOG OPENING never does — you have not said anything yet,
// and on a phone the keyboard takes half of what just opened. One exception: a dialog
// whose ONLY content is that one field (a rename, the prompt) — the dialog is the tap.
//
// FAIL-CLOSED: every file with an `autoFocus` attribute is listed here with the reason it
// is on the right side of that line. A new one fails the build until someone writes the
// reason — and « the form opens ready to type » is precisely the reason that is NOT one
// (it was the comment on PetForm, BusinessForm and CarnetForm).

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// A JSX `autoFocus` / `autoFocus={…}` attribute. Not a prop type (`autoFocus?:`), a
// destructure (`autoFocus,` / `autoFocus = false`), an object key (`autoFocus: open`) or a
// member read (`add.autoFocus`) — those carry a choice, they do not make one.
const ATTR = /(?<![.\w])autoFocus(?:=\{[^}\n]*\})?(?!\s*[=:?,)])/g

const PRIMITIVE = 'a primitive forwarding its CALLER’s choice — the caller is what this list judges'
const INLINE = 'revealed in place by the tap that asked for it (＋ / ✏️ / a row tapped to edit)'

const ALLOWED: Record<string, string> = {
  'components/EditField.tsx': PRIMITIVE,
  'components/EntityCombobox.tsx': PRIMITIVE,
  'components/SearchField.tsx': `${PRIMITIVE} (the collapsed magnifier's own tap)`,
  'components/cercle/GroupForm.tsx': `${PRIMITIVE} (opt-in; NOT passed in the ＋ chooser's dialog)`,
  'components/cercle/NoteQuickAdd.tsx': `${PRIMITIVE} (NOT passed by the hold-＋ sheet)`,
  'components/voyage/TripNoteAdd.tsx': PRIMITIVE,
  'components/todos/TodoSection.tsx': `${INLINE}: the row edit, and the SectionAdd ＋ forwarded as addAutoFocus`,
  'components/board/CercleNotesCard.tsx': `${INLINE}: the card's SectionAdd ＋`,
  'components/cercle/ContactForm.tsx': `${INLINE}: « ＋ groupe » chip — the person form itself does NOT focus`,
  'pages/Maison.tsx': `${INLINE}: a group header's edit`,
  'components/cercle/NotesList.tsx': 'a rename dialog whose ONLY content is the field',
  'components/CheckRow.tsx': INLINE,
  'components/habits/DefiBlock.tsx': `${INLINE}: « écrire le mien »`,
  'components/kitchen/DayEditor.tsx': `${INLINE}: a slot, the supper hero, the day note`,
  'components/kitchen/MealPool.tsx': `${INLINE}: the SectionAdd ＋ and a row's rename`,
  'components/kitchen/MealRows.tsx': INLINE,
  'components/kitchen/PantryTab.tsx': `${INLINE}: two SectionAdd ＋`,
  'components/kitchen/ReserveSection.tsx': `${INLINE}: the SectionAdd ＋ and a row's edit`,
  'components/operator/devices.tsx': `${INLINE}: rename a device`,
  'components/operator/household.tsx': INLINE,
  'components/operator/recipePills.tsx': INLINE,
  'components/operator/recipesTags.tsx': INLINE,
  'components/operator/shopping.tsx': INLINE,
  'components/RecipeForm.tsx': `${INLINE}: a step tapped to edit (the form itself does not focus, see its note)`,
  'components/todos/TemplateEditor.tsx': INLINE,
  'components/voyage/PackingList.tsx': INLINE,
  'components/voyage/SharedPackingList.tsx': INLINE,
  'components/voyage/TripNoteCard.tsx': INLINE,
  'components/voyage/VoyageItinerary.tsx': `${INLINE}: a day's ＋`,
  'pages/DayPlanPage.tsx': `${INLINE}: the day note's ✏️, and the todo SectionAdd`,
  'pages/Kitchen.tsx': `${INLINE}: a day's ＋`,
  'pages/DevKit.tsx': 'the gallery specimen of SectionAdd — behaves as its callers do',
}

// The surfaces that used to break the rule, named so a reintroduction reads as what it is.
const NEVER = [
  'components/AskSheet.tsx',
  'components/AddSheet.tsx',
  'components/CaptureForm.tsx',
  'components/RemarkComposer.tsx',
  'components/cercle/ContactFields.tsx',
  'components/cercle/PetForm.tsx',
  'components/cercle/BusinessForm.tsx',
  'components/cercle/CarnetForm.tsx',
  'components/cercle/NoteEditor.tsx',
  'components/cercle/NoteEditorTiptap.tsx',
  'pages/IntakeForm.tsx',
  'pages/Postbox.tsx',
  'pages/VoyagePage.tsx',
]

function scan(): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const f of sourceFiles(srcDir)) {
    if (!f.endsWith('.tsx')) continue
    const src = blankComments(readFileSync(f, 'utf8'))
    const lines = [...src.matchAll(ATTR)].map((m) => src.slice(0, m.index).split('\n').length)
    if (lines.length) out.set(relative(srcDir, f).split(sep).join('/'), lines)
  }
  return out
}

describe('the keyboard opens on a tap, never on its own', () => {
  const found = scan()

  it('every autoFocus sits in a file that says why it is on the right side of the rule', () => {
    const stray = [...found].filter(([f]) => !ALLOWED[f]).map(([f, l]) => `${f}:${l.join(',')}`)
    expect(stray, 'a new autoFocus — a screen, sheet or dialog OPENING must not summon the keyboard; if this one follows an explicit tap, add it to ALLOWED with that reason').toEqual([])
  })

  it('the surfaces that used to break it stay fixed', () => {
    expect(NEVER.filter((f) => found.has(f))).toEqual([])
    expect(NEVER.filter((f) => ALLOWED[f])).toEqual([])
  })

  it('no ALLOWED entry outlives its autoFocus (a stale exception reads as permission)', () => {
    expect(Object.keys(ALLOWED).filter((f) => !found.has(f))).toEqual([])
  })

  it('the rich-text editor never focuses itself either (TipTap spells it `autofocus:`)', () => {
    const src = blankComments(readFileSync(join(srcDir, 'components/cercle/NoteEditorTiptap.tsx'), 'utf8'))
    const opts = [...src.matchAll(/\bautofocus:\s*([^,\n]+)/g)].map((m) => m[1].trim())
    expect(opts).toEqual(['false'])
  })

  it('the scanner still sees the attribute at all', () => {
    // A floor, so a broken regex cannot pass by finding nothing.
    expect(found.size).toBeGreaterThan(20)
  })
})
