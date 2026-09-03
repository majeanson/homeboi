import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE PARALLEL-ARRAY RULE, made structural. PARITY's Wave D names exactly one real
// anti-pattern left in this schema: a SIDE array indexed by another array's
// position — `recipes.steps_images_json` beside `steps_json`, and the routine deck's
// `cards_narration_json` / card photos beside `cards_json`. Insert or reorder a row
// and every side array has to be re-indexed in lockstep, or a parent's voice clip
// plays on the wrong routine card and a photo lands on the wrong recipe step.
//
// It is already CONTAINED, and that is worth stating plainly (2026-09-03): the sync
// ops live once in lib/parallelArray.ts — pure, unit-tested in parallelArray.test.ts,
// and used by both editors (RecipeForm's steps, CardDeckEditor's deck). Wave D's own
// entry called this unconverged, but lib/parallelArray predates that note by ten
// weeks. The schema stays positional on purpose: PARITY forbids a churn-only
// migration wave, and converging the column shape would buy nothing the helper does
// not already give.
//
// What was NOT enforced is that a writer USES the helper. Containment by convention
// is how every other prose rule in this repo drifted, and three sites had already
// re-implemented alignSide by hand as rows.map(() => '') — correct that day, and
// exactly the spelling that goes wrong the day someone edits it into a filter.
//
// FAIL-CLOSED. Every call to a side-array setter must derive its value through a
// lib/parallelArray op, or be the bare literal [] (a whole-form reset, always
// paired with emptying the source array). Anything else is a violation unless it is
// listed in ALLOWED with a reason saying why the helper is actively wrong there.
//
// Sibling of write-rule.test.ts and nested-interactive.test.ts, and it carries their
// lesson too: this guard was run against a planted bypass and seen to FAIL before it
// was trusted. Comment lines are blanked before scanning, so a justification written
// beside an exception cannot satisfy its own guard.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// The state setters that hold a positional side array. A new side array MUST be
// added here — that is the one manual step, and it is the same shape as
// write-rule's endpoint list.
const SIDE_SETTERS = ['setStepImages', 'setCardsNarration', 'setCardsPhoto']

// The sync vocabulary. A setter call is well-formed when its value flows through
// one of these (they all live in lib/parallelArray and are covered by its tests).
const OPS = ['alignSide', 'sideInsert', 'sideRemove', 'sideMove', 'sideSwap', 'sideSplice', 'sideSet']

// Sites that legitimately bypass the helper, each with the reason it is right.
// Adding an entry is a DECISION: say why keeping the side array in lockstep would
// be WRONG here, never "we didn't get to it".
const ALLOWED: Record<string, string> = {
  // Whole-form reset after a successful save: setCards([]) empties the source in
  // the same block, so there is no source left to stay aligned with. This entry
  // exists so the pairing is checked rather than silently accepted.
  'components/forms/RoutineForm.tsx → setCardsNarration([])':
    'whole-form reset; setCards([]) empties the source in the same block',
  'components/forms/RoutineForm.tsx → setCardsPhoto([])':
    'whole-form reset; setCards([]) empties the source in the same block',
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    if (/\.test\.tsx?$/.test(name)) return []
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

// Blank comment-only lines rather than dropping them, so a reported line number
// still matches the real file.
const blankComments = (s: string): string =>
  s
    .split('\n')
    .map((l) => (l.trim().startsWith('//') ? '' : l))
    .join('\n')

// Read the argument text of a call starting at the '(' that follows `at`, by
// matching parens. String literals are skipped so a ')' inside one can't end it.
function callArgs(src: string, at: number): string {
  let i = src.indexOf('(', at)
  if (i < 0) return ''
  const start = i
  let depth = 0
  let quote = ''
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return src.slice(start + 1, i)
    }
  }
  return src.slice(start + 1)
}

interface Site {
  file: string
  line: number
  setter: string
  args: string
}

function sideSetterCalls(): Site[] {
  const out: Site[] = []
  for (const file of sources(srcDir)) {
    const raw = blankComments(readFileSync(file, 'utf8'))
    const rel = relative(srcDir, file).split(sep).join('/')
    for (const setter of SIDE_SETTERS) {
      // The CALL form only — setX( — so `const [x, setX] = useState(...)` and a
      // setter passed as a prop value (onNarrationChange={setCardsNarration}) are
      // not calls and are correctly ignored.
      const re = new RegExp(`\\b${setter}\\s*\\(`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(raw))) {
        // Skip the destructuring site that DEFINES the setter.
        const before = raw.slice(Math.max(0, m.index - 80), m.index)
        if (/\[\s*[A-Za-z0-9_]+\s*,\s*$/.test(before)) continue
        out.push({
          file: rel,
          line: raw.slice(0, m.index).split('\n').length,
          setter,
          args: callArgs(raw, m.index + setter.length),
        })
      }
    }
  }
  return out
}

describe('parallel-array rule', () => {
  it('every side-array setter derives its value through lib/parallelArray', () => {
    const violations = sideSetterCalls()
      .filter((s) => {
        if (OPS.some((op) => new RegExp(`\\b${op}\\s*\\(`).test(s.args))) return false
        if (s.args.trim() === '[]') return false
        return !(`${s.file} → ${s.setter}(${s.args.trim()})` in ALLOWED)
      })
      .map((s) => `${s.file}:${s.line} → ${s.setter}(${s.args.trim().slice(0, 60)})`)
    expect(
      violations,
      "A positional side array must stay in lockstep with the array it annotates. Derive it through " +
        'lib/parallelArray (alignSide/sideInsert/sideRemove/sideMove/sideSwap/sideSplice/sideSet) rather than ' +
        "rebuilding it by hand — a hand-rolled rows.map(() => '') is alignSide(undefined, rows.length), and it " +
        'is the spelling that silently drifts the day it gains a filter. If the helper is genuinely wrong at a ' +
        'site, add it to ALLOWED with the reason.',
    ).toEqual([])
  })

  it('knows about every side array in the codebase', () => {
    // The rule can only guard the setters it is told about, so a new positional
    // side array must join SIDE_SETTERS. This catches the common way that is
    // forgotten: a state whose name pairs it with a source array.
    const known = new Set(SIDE_SETTERS)
    const suspects = new Set<string>()
    for (const file of sources(srcDir)) {
      // DevKit's gallery demo state is passed straight through as CardDeckEditor's
      // onNarrationChange/onPhotoChange props — the editor itself does the syncing
      // (sideMove/sideSet…) before calling back, so DevKit never rebuilds the array
      // by hand. Not a writer, so not in scope for this rule.
      if (relative(srcDir, file).split(sep).join('/') === 'pages/DevKit.tsx') continue
      const raw = blankComments(readFileSync(file, 'utf8'))
      // Side arrays hold MEDIA keys, so their setter name carries a media word
      // (Image/Photo/Narration/Clip) — unlike setSteps/setCards, the SOURCE
      // arrays they annotate, which this pattern must not flag.
      for (const m of raw.matchAll(
        /\[\s*[A-Za-z0-9_]+\s*,\s*(set[A-Za-z0-9_]*(?:Image|Photo|Narration|Clip)[A-Za-z0-9_]*)\s*\]\s*=\s*useState<string\[\]>/g,
      )) {
        if (!known.has(m[1])) suspects.add(m[1])
      }
    }
    expect(
      [...suspects],
      'A new string[] state named like a side array is not covered by SIDE_SETTERS — add it (or rename it if it is not positional).',
    ).toEqual([])
  })
})
