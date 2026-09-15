import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capped, LIST_CAP, CAP_SQL } from './listCap'

// THE READS THAT GROW FOR EVER NOW HAVE A CEILING — and the rest are on a ratchet.
//
// A survey on 2026-09-15 found 128 multi-row reads under `functions/api/` with no
// `LIMIT`. That is NOT 128 bugs: most are bounded by the household itself — six members,
// four groups, a week of meals — and a cap there would be noise. A handful are genuinely
// different: they accumulate with TIME and nothing ever deletes a row, and several of
// those ride `...live`, so the whole pile is re-fetched every ~10 s, persisted to
// IndexedDB before first paint, and replayed offline.
//
// So: cap the ones that grow (family notes, mots, drawings, recorded transfers) and hold
// the number of uncapped reads to a ratchet. Counting rather than classifying is the
// same contract as glossary.test.ts and aria-label-rule.test.ts — deciding whether a
// given table is bounded "in practice" is a judgement a scanner would get wrong, and a
// confidently-wrong guard is worse than none (the nested-interactive lesson).

describe('capped()', () => {
  it('passes a short read through untouched and says there is no more', () => {
    const rows = [1, 2, 3]
    expect(capped(rows)).toEqual({ rows: [1, 2, 3], more: false })
  })

  it('an EXACTLY full page is not "more" — which is why the query asks for cap + 1', () => {
    // The off-by-one that makes the flag honest: a query with `LIMIT LIST_CAP` cannot
    // tell a household with exactly LIST_CAP rows from one with ten thousand.
    const exact = Array.from({ length: LIST_CAP }, (_, i) => i)
    expect(capped(exact)).toEqual({ rows: exact, more: false })
  })

  it('drops the extra probe row and flags it, never sending cap + 1', () => {
    const over = Array.from({ length: LIST_CAP + 1 }, (_, i) => i)
    const out = capped(over)
    expect(out.more).toBe(true)
    expect(out.rows).toHaveLength(LIST_CAP)
    // The probe row is dropped, not sent.
    expect(out.rows).not.toContain(LIST_CAP)
  })

  it('a missing result set reads as empty rather than throwing', () => {
    expect(capped(undefined)).toEqual({ rows: [], more: false })
    expect(capped(null)).toEqual({ rows: [], more: false })
  })

  it('the SQL asks for one past the cap', () => {
    expect(CAP_SQL).toBe(`LIMIT ${LIST_CAP + 1}`)
  })
})

// ---- the ratchet ------------------------------------------------------------------

const API = join(__dirname, '..', 'api')

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return tsFiles(p)
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [p] : []
  })
}

/** Every multi-row read (`.all<…>()`) whose nearest preceding SELECT has no LIMIT. */
function uncapped(): string[] {
  const out: string[] = []
  for (const file of tsFiles(API)) {
    const src = readFileSync(file, 'utf8')
    const re = /\.all<[^>]*>\(\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      // Look back for the query this read belongs to. A window rather than a parse:
      // these handlers are `prepare(<literal>)…bind()…all()` in that order, and a
      // window big enough for the longest of them is plenty.
      const before = src.slice(Math.max(0, m.index - 1400), m.index)
      const at = before.lastIndexOf('SELECT')
      if (at < 0) continue
      const query = before.slice(at).replace(/\s+/g, ' ')
      // `CAP_SQL` interpolates to a LIMIT — the scan reads SOURCE text, so it has to
      // know the constant as well as the literal keyword. (It did not at first, and
      // reported the four reads I had just capped as still uncapped.)
      if (/LIMIT|CAP_SQL/i.test(query)) continue
      const table = /FROM\s+([A-Za-z_]+)/.exec(query)?.[1] ?? '?'
      out.push(`${file.slice(API.length + 1).split('\\').join('/')} — ${table}`)
    }
  }
  return out
}

describe('multi-row reads with no LIMIT', () => {
  // Where it stood once the time-growing reads were capped (2026-09-15). LOWER this as
  // more get bounded; never raise it. A new uncapped read on a table that accumulates is
  // the thing this is here to stop.
  const FLOOR = 124

  it('never grows', () => {
    const found = uncapped()
    expect(
      found.length,
      `multi-row reads with no LIMIT (allowed: ${FLOOR}).\n` +
        'If the table accumulates with TIME, cap it with CAP_SQL + capped() and order it\n' +
        'newest-first so the cap sheds the oldest rows. If it is bounded by the household\n' +
        '(members, groups, a week of meals), leave it and lower nothing.\n' +
        found.join('\n'),
    ).toBeLessThanOrEqual(FLOOR)
  })

  it('the scan still sees real code — a silent zero would pass for ever', () => {
    expect(uncapped().length).toBeGreaterThan(50)
  })

  it('the four time-growing reads are capped and stay capped', () => {
    const found = uncapped().join('\n')
    for (const [file, why] of [
      ['family-notes.ts — family_notes', 'a durable note is never removed'],
      ['mots.ts — mots', 'a kept mot is never removed'],
      ['drawings.ts — drawings', 'the gallery is never pruned'],
      ['transfers.ts — transfers', 'a receipt for money that moved is never deleted'],
    ]) {
      expect(found, `${file} must stay capped — ${why}`).not.toContain(file)
    }
  })
})
