import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readScanned, sourceFiles } from './buildGuardScan'

// THE QUERY-KEY RULE (solidify plan, wave 6.6 — CLAUDE.md « a key spelled twice drifts
// into two caches »).
//
// A query key is a NAME, declared once: a cross-page one in lib/queryKeys.ts, a page-local
// one as a file-level `const X_KEY = ['…']` beside its reader (kitchen keys live in
// components/kitchen/types.ts). A key literal written straight into `queryKey:` or into a
// QueryClient call is the second spelling waiting to happen — and on 2026-11-16 three of
// the eight such sites already WERE second spellings:
//   · LegalPage read ['health'] by hand beside HEALTH_KEY;
//   · DealsBrowser read ['flyers', day] beside FLYERS_KEY — the key realtime invalidates
//     when the postal code changes (functions/_lib/realtime.ts), held together by luck;
//   · HouseDiary re-spelled ChoreLedger's private ['chores-ledger'] in another file.
// A derived key builds on the name: `[...FLYERS_KEY, day]`. keyShape.test.ts is the
// sibling: it groups keys by VALUE and fails one key fed by two endpoints; this one stops
// the value being typed where the name belongs.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')

// Methods that take a key (or filters with one) as their FIRST argument.
const CLIENT_METHODS = [
  'setQueryData',
  'getQueryData',
  'getQueryState',
  'setQueriesData',
  'getQueriesData',
  'removeQueries',
  'cancelQueries',
  'invalidateQueries',
  'refetchQueries',
  'resetQueries',
  'ensureQueryData',
  'prefetchQuery',
  'fetchQuery',
]

// A key LITERAL: an array whose first element is a string (', ", `).
export function inlineKeys(src: string): { line: number; text: string }[] {
  const re = new RegExp(
    String.raw`(?:\bqueryKey\s*:\s*|\b(?:${CLIENT_METHODS.join('|')})\s*(?:<[^>()]*>)?\(\s*)\[\s*['"\x60]`,
    'g',
  )
  const out: { line: number; text: string }[] = []
  for (const m of src.matchAll(re)) {
    const at = m.index ?? 0
    out.push({ line: src.slice(0, at).split('\n').length, text: src.slice(at, at + 60).split('\n')[0]! })
  }
  return out
}

// Where a key VALUE is declared — the only files allowed to spell one.
const HOMES = new Set(['src/lib/queryKeys.ts', 'src/components/kitchen/types.ts'])

describe('the query-key rule (a key is a declared name, never a literal at the call site)', () => {
  it('the detector sees a literal key in every position and none of the named shapes', () => {
    const fixture = [
      `useQuery({ queryKey: ['health'], queryFn })`, // ← line 1
      `qc.invalidateQueries({ queryKey: ["board"] })`, // ← line 2
      `qc.setQueryData(['list'], rows)`, // ← line 3
      `qc.getQueryData<Row[]>([\`month\`, from])`, // ← line 4
      `useQuery({ queryKey: HEALTH_KEY })`,
      `useQuery({ queryKey: [...FLYERS_KEY, day] })`,
      `qc.setQueryData(LIST_KEY, rows)`,
      `useQuery({ queryKey: dealsKey(q, day) })`,
      `const X_KEY = ['x']`,
    ].join('\n')
    expect(inlineKeys(fixture).map((h) => h.line)).toEqual([1, 2, 3, 4])
  })

  it('no key literal at a call site — declare the name, then use it', () => {
    const offenders: string[] = []
    for (const f of sourceFiles(srcDir)) {
      const file = relative(rootDir, f).split(sep).join('/')
      if (HOMES.has(file)) continue
      for (const hit of inlineKeys(readScanned(f))) offenders.push(`${file}:${hit.line} ${hit.text}`)
    }
    expect(
      offenders,
      'Declare the key: cross-page → export it from lib/queryKeys.ts; read in this file only → a ' +
        'file-level `const X_KEY = [\'…\']`. Then use the name, or derive from it: `[...X_KEY, id]`. ' +
        'Grep the value first — it may already have a name.',
    ).toEqual([])
  })
})
