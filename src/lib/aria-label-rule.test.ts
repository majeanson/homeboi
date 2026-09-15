import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments } from './buildGuardScan'

// AN `aria-label` ON A PLAIN `<span>` OR `<div>` IS IGNORED — AND CAN LEAVE THE
// ELEMENT SILENT.
//
// ARIA prohibits `aria-label` on an element whose role is `generic`, which is what a
// role-less span/div has. Browsers and screen readers honour that prohibition: the
// label is dropped. When the element ALSO has nothing else to announce — an icon-only
// badge whose `<Icon>` is decorative, or a date whose visible parts are all
// `aria-hidden` — the result is an element that reads as NOTHING AT ALL.
//
// Found 2026-09-15 by the axe pass in `npm run e2e:matrix` (`aria-prohibited-attr`,
// serious, 11 states): every day header in the kitchen week was announcing as silence,
// because `<span aria-label={formatDay(…)}>` wrapped two `aria-hidden` children.
//
// TWO FIXES, and picking between them is the human half:
//   • the element is a GRAPHIC (an icon-only badge) → give it `role="img"`, which
//     legitimises the label. `AvatarStack` is the precedent.
//   • the element WRAPS TEXT → either let the text speak for itself and drop the
//     redundant label, or add a `.sr-only` child carrying the spoken form.
//
// THIS RATCHET COUNTS, IT DOES NOT CLASSIFY — the same contract as
// `glossary.test.ts`, and for the same reason. Plenty of the remaining hits are
// harmless redundancy (`<div className="scene" aria-label={title}>` beside a
// `SceneHead` that already renders that title as a heading): technically the same
// prohibited attribute, but nothing goes silent, so "fix them all now" would be churn
// with a real regression risk. A guard that tried to tell the two apart would have to
// decide whether a subtree announces anything — exactly the judgement
// `nested-interactive.test.ts` got confidently wrong. So: the number may only go DOWN.
// The semantic triage stays human work.

const SRC = join(__dirname, '..')

// Opening tags only, and matched by TAG BOUNDARY rather than by line or indentation —
// prettier breaks a multi-attribute JSX tag right after the tag name, and a walk that
// assumed one tag per line is how `nested-interactive.test.ts` reported green over the
// defect it was written for.
const TAG = /<(span|div)(\s[^>]*?)?\/?>/gs

function hits(): string[] {
  const out: string[] = []
  for (const file of sourceFiles(SRC)) {
    if (!file.endsWith('.tsx')) continue
    const src = blankComments(readFileSync(file, 'utf8'))
    let m: RegExpExecArray | null
    TAG.lastIndex = 0
    while ((m = TAG.exec(src))) {
      const attrs = m[2] ?? ''
      if (!/\baria-label\b/.test(attrs)) continue
      // A role of any kind takes it out of `generic`, so the label is legal there.
      if (/\brole\s*=/.test(attrs)) continue
      out.push(`${file.slice(SRC.length + 1).split('\\').join('/')}:${src.slice(0, m.index).split('\n').length} <${m[1]}>`)
    }
  }
  return out
}

describe('aria-label on a role-less span/div', () => {
  // Where it stood after the silent ones were fixed (2026-09-15). LOWER THIS when you
  // fix more; never raise it. If this fails going UP, you added a label to a generic
  // element — give it a role, or let its text speak.
  const FLOOR = 49

  it('never grows', () => {
    const found = hits()
    expect(
      found.length,
      `aria-label on a role-less <span>/<div> (allowed: ${FLOOR}).\n` +
        'A generic role makes the label invisible to a screen reader; if nothing else in\n' +
        'the element announces, it reads as nothing. Give it role="img" when it is a\n' +
        'graphic, or let its visible text speak and drop the label.\n' +
        found.join('\n'),
    ).toBeLessThanOrEqual(FLOOR)
  })

  it('the scan still sees real code — a silent zero would pass forever', () => {
    // The failure this repo has actually had: `blankComments` destroying a French file
    // so a guard read almost nothing and passed for that reason. If the count ever hits
    // zero, prove it is real rather than a broken scan.
    expect(hits().length).toBeGreaterThan(0)
  })

  // NO `<span>` AT ALL — a hard rule, not a ratchet, because the span cases were the
  // ones that actually went silent and all ten are now fixed.
  //
  // The shape tells them apart, which is why this line can be absolute where the count
  // above cannot. A role-less span carrying a label is almost always an icon-only badge
  // or a wrapper around `aria-hidden` text — it has no other name, so losing the label
  // loses everything. A role-less DIV carrying one is almost always a landmark-ish
  // wrapper (`<div className="scene" aria-label={title}>`) whose children announce
  // perfectly well; the label is redundant, not load-bearing. Those stay in the count.
  //
  // Fixed 2026-09-15: six icon badges took `role="img"` (the `AvatarStack` precedent),
  // the kitchen day header moved its date to a `.sr-only` child, and the two day-page
  // weather spans simply dropped a label that restated their own visible text.
  it('no role-less <span> carries one — those are the ones that go silent', () => {
    const spans = hits().filter((h) => h.endsWith('<span>'))
    expect(
      spans,
      'A role-less <span> with aria-label announces as NOTHING when its children are\n' +
        'decorative. Give it role="img" if it is a graphic, move the words into a\n' +
        '.sr-only child, or drop the label and let the visible text speak.\n' +
        spans.join('\n'),
    ).toEqual([])
  })
})
