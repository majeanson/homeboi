import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// THREE RULES that keep « I swipe it and it comes back » from growing back (2026-10-06).
//
// That bug was a write whose failure nobody heard about: the server answered a vacuous
// « ok », and ~100 call sites wrote `.catch(() => {})` on their writes, so a REAL server
// refusal reverted the optimistic row on the next refetch with not a word said. The fix
// is structural, and this file holds it:
//
//  1. No anonymous swallow — the oxlint rule `babillard/no-anonymous-catch` now (review
//     #41, scripts/lint-rules.mjs): on the AST it found five swallows this file's regex had
//     missed, three of them real silent write failures. An exemption is an inline disable
//     whose reason says why the call is not a server write.
//  2. A deferred-removal commit must PROPAGATE. useDeferredRemoval reads a rejected commit
//     as « the delete did not happen → show the row again » and a resolved one as « it
//     landed → keep it hidden »; a `.catch` inside `.remove(...)` made every failed delete
//     look like a success.
//  3. An optimistic row carries the id its create SENDS (lib/rowId, review #39), and only an
//     endpoint whose POST keeps a client id (functions/_lib/ids `rowIdFrom`) may be given
//     one: elsewhere the server would mint its own, and every tick or delete made on the
//     painted row would name a row that does not exist.

const SRC = join(__dirname, '..')

function sources(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name))
        out.push({ rel: relative(join(SRC, '..'), p).split('\\').join('/'), text: readFileSync(p, 'utf8') })
    }
  }
  walk(SRC)
  return out
}

const codeOnly = (text: string) =>
  text
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')

describe('a deferred-removal commit propagates its rejection', () => {
  it('no `.catch` inside any `<x>Removal.remove(...)` call', () => {
    const bad: string[] = []
    for (const { rel, text } of sources()) {
      if (!text.includes('useDeferredRemoval') && !text.includes('useChoreRemovals')) continue
      const re = /\b\w*[Rr]emoval\w*\.remove\(/g
      let m: RegExpExecArray | null
      while ((m = re.exec(text))) {
        let i = m.index + m[0].length
        let depth = 1
        while (i < text.length && depth > 0) {
          if (text[i] === '(') depth++
          else if (text[i] === ')') depth--
          i++
        }
        const call = codeOnly(text.slice(m.index, i))
        if (/\.catch\(/.test(call)) bad.push(`${rel}:${text.slice(0, m.index).split('\n').length}`)
      }
    }
    expect(
      bad,
      'useDeferredRemoval reads a REJECTED commit as « the delete did not happen » (show the row again) and a resolved one ' +
        'as « it landed ». A .catch inside the commit made every failed delete look like a success.',
    ).toEqual([])
  })
})

describe('a client-minted row id goes only to an endpoint that keeps it', () => {
  // Each entry is a create door that paints its row under newRowId(), and the endpoint it posts to.
  const DOORS: Record<string, string> = {
    'src/components/AddSheet.tsx': 'list',
    'src/pages/Liste.tsx': 'list',
    'src/pages/QuickAddPage.tsx': 'list',
    'src/components/todos/TodoSection.tsx': 'todos',
    'src/components/tasks/useTaskActions.ts': 'tasks',
  }
  it('newRowId() is called only from the known doors', () => {
    const callers = sources()
      .filter(({ rel, text }) => rel !== 'src/lib/rowId.ts' && !rel.endsWith('.test.ts') && /\bnewRowId\(\)/.test(codeOnly(text)))
      .map((s) => s.rel)
      .sort()
    expect(callers, 'A new optimistic create site joins DOORS once its endpoint keeps a client id (rowIdFrom).').toEqual(Object.keys(DOORS).sort())
  })
  it('every door’s endpoint keeps the id it is sent', () => {
    for (const endpoint of new Set(Object.values(DOORS))) {
      const handler = readFileSync(join(SRC, '..', 'functions', 'api', `${endpoint}.ts`), 'utf8')
      expect(/\browIdFrom\(/.test(handler), `functions/api/${endpoint}.ts must create with rowIdFrom(body.id)`).toBe(true)
    }
  })
})
