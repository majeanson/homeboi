import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// A DRAG IS NEVER THE ONLY DOOR (CLAUDE.md « Every UI change must be desktop-friendly »,
// ACTIONS.md Part 1 #7). `usePointerDnd` binds pointer events a mouse can drive, but a
// press-and-hold is invisible to a keyboard and to a screen reader, and on a wall
// tablet it is a gesture nobody is told about. Every surface that drags must name the
// control that does the same thing without dragging — and until 2026-11-05 two did not:
// the week grid's day→day meal drag and the family builder's band placement had no
// mirror at all, while ACTIONS.md's matrix called both ✅ (a verdict, not a fact).
//
// INVENTORY guard: every file that calls usePointerDnd( is a key below, with the
// mirror written out; a key whose file stopped dragging is stale. Planted red with a
// scratch src/lib/zz-plant.tsx calling the hook (named, then deleted).

const SRC = join(__dirname, '..')

const MIRRORS = new Map<string, string>([
  ['lib/dnd.tsx', 'the hook itself'],
  ['pages/Board.tsx', 'card placement — Réglages ▸ Le babillard ▸ Disposition (operator/boardLayout.tsx, <Reorder> ▲▼) is the accessible mirror'],
  ['components/CardDeckEditor.tsx', 'routine cards — each card’s own ▲▼ (onUp/onDown)'],
  ['components/cercle/FamilyBuilder.tsx', 'band placement — each face chip’s ⋯ « Placer » lists the bands + the tray (2026-11-05)'],
  ['components/cercle/NotesList.tsx', 'note order — <Reorder> ▲▼ on the row'],
  ['components/kitchen/DayEditor.tsx', 'slot→slot — the row ⋯ « Déplacer… » (day + slot picker, 2026-11-05)'],
  ['components/operator/aisles.tsx', 'aisle order — <Reorder> ▲▼'],
  ['components/operator/boardLayout.tsx', 'card order — <Reorder> ▲▼ (this IS the board’s mirror)'],
  ['components/operator/meals.tsx', 'meal-slot order — <Reorder> ▲▼'],
  ['components/operator/recipePills.tsx', 'pill order — <Reorder> ▲▼'],
  ['components/operator/recipesTags.tsx', 'tag order — <Reorder> ▲▼'],
  ['components/voyage/VoyageItinerary.tsx', 'itinerary order — <Reorder> ▲▼'],
  ['pages/Kitchen.tsx', 'day→day — the day scene’s row ⋯ « Déplacer… » (2026-11-05; the grid row taps into that scene)'],
  ['pages/Liste.tsx', 'item order — the ⠿ grip is focusable and answers ↑/↓ with the same splice (moveRow)'],
  ['pages/Maison.tsx', 'add a person to a group — the person form’s group field (ContactForm) writes the same membership'],
  ['pages/DevKit.tsx', 'the gallery’s own specimens'],
])

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

const drags = (raw: string) => /\busePointerDnd\s*\(/.test(raw)

describe('drag mirrors — a gesture is never the only door', () => {
  it('the scan found the app (canary)', () => {
    expect(files.filter((f) => drags(f.raw)).length).toBeGreaterThan(10)
  })

  it('every usePointerDnd host names its non-drag mirror', () => {
    const offenders = files.filter((f) => drags(f.raw) && !MIRRORS.has(f.path)).map((f) => f.path)
    expect(
      offenders,
      'add the file to MIRRORS with the control that does the same thing without dragging (a ⋯ item, a ▲▼ pair, a form field, a Réglages mirror) — and build it if there is none',
    ).toEqual([])
  })

  it('every MIRRORS entry still drags (a stale entry exempts the next arrival)', () => {
    const byPath = new Map(files.map((f) => [f.path, f.raw]))
    const stale = [...MIRRORS.keys()].filter((p) => !byPath.has(p) || !drags(byPath.get(p)!))
    expect(stale, 'these files no longer call usePointerDnd — drop them').toEqual([])
  })
})
