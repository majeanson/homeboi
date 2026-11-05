import { readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sourceFiles, blankComments, openTags } from './buildGuardScan'

// A LABELLED CONTROL IS A Field (solidify 3.1, 2026-11-05). A label above (or beside) a
// control was spelled six ways — `.field`, `cf__field` + `cf__label`, `li-edit__field`,
// `operator__field`, a bare `voyage-form__label` + sibling, the inline `recur__row mono`
// — with six gaps, weights and colours. `components/Field.tsx` is the one shape; 102
// sites folded onto it by a transformer, and their classes are RETIRED: a `<label>` or
// `<div>` still wearing one fails here.
//
// The hints are a RATCHET: 52 distinct `*hint` class tokens the day this landed (most
// are not field hints — a banner's, a card's); a field's hint is `<Field hint>`, and the
// count may fall, never rise.
// Planted red with ContactFields' `<label className="cf__field">` restored.

const SRC = join(__dirname, '..')

const RETIRED = ['recur__row', 'cf__field', 'cf__label', 'li-edit__field', 'li-edit__label', 'operator__field', 'voyage-form__label']
const HINT_TOKENS_MAX = 52

const files = sourceFiles(SRC)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => ({ path: relative(SRC, f).split(sep).join('/'), raw: blankComments(readFileSync(f, 'utf8')) }))

function classTokens(tag: string): string[] {
  const m = /className=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/.exec(tag)
  if (!m) return []
  const value = m[1] ?? m[2] ?? m[3] ?? ''
  const lits = m[3] !== undefined ? [...value.matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]) : [value]
  return lits.flatMap((l) => l.trim().split(/\s+/)).filter(Boolean)
}

describe('field rule — a labelled control is a Field', () => {
  it('the detector sees a retired class on a label (canary)', () => {
    expect(openTags(`<label className="cf__field"><span className="cf__label">x</span></label>`, 'label').flatMap(classTokens)).toContain('cf__field')
    expect(openTags(`<label className="field"><span className="field__label">x</span></label>`, 'label').flatMap(classTokens)).toEqual(['field'])
  })

  it('no label / div wears a retired field class', () => {
    const offenders: string[] = []
    for (const f of files) {
      for (const el of ['label', 'div', 'span', 'h3']) {
        for (const tag of openTags(f.raw, el)) {
          const hit = classTokens(tag).filter((t) => RETIRED.includes(t))
          if (hit.length) offenders.push(`${f.path}: <${el} …${hit.join(' ')}…>`)
        }
      }
    }
    expect(offenders, 'render <Field label hint? error? inline? as="div"?>{control}</Field> (components/Field.tsx)').toEqual([])
  })

  it('distinct *hint class tokens only ever get fewer (ratchet)', () => {
    const tokens = new Set<string>()
    for (const f of files) for (const m of f.raw.matchAll(/className=(?:"([^"]*)"|'([^']*)')/g)) for (const t of (m[1] ?? m[2] ?? '').split(/\s+/)) if (/(^|__|-)hint$/.test(t)) tokens.add(t)
    expect(tokens.size, `distinct *hint tokens: ${tokens.size} (max ${HINT_TOKENS_MAX}) — a field's hint is <Field hint>; a new token is a copy of .field__hint wearing a page's name`).toBeLessThanOrEqual(HINT_TOKENS_MAX)
    expect(tokens.size, 'the ratchet is loose — lower HINT_TOKENS_MAX to the current count').toBeGreaterThan(HINT_TOKENS_MAX - 10)
  })
})
