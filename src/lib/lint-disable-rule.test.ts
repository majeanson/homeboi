import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// THE LINT-DISABLE RULE (2026-11-05, with oxlint — sibling of the other fail-closed
// grep tests; see buildGuardScan.ts for the family).
//
// `.oxlintrc.json` keeps the linter to the correctness category, so a red lint is a
// real defect — and the way a real defect stops being red without being fixed is a
// `// oxlint-disable-next-line` dropped on it in a hurry. That comment is the one place
// a lint rule can be switched off per line, and nothing else in CI sees it. So it has
// to carry its reason, the way every ALLOWED entry in write-rule / swallow-rule does:
// an exemption without a why is an exemption nobody can re-check.
//
// FAIL-CLOSED: every `oxlint-disable` directive (line, next-line, block, file-level)
// anywhere in the five linted trees must end with ` -- <reason>` and the reason must be
// more than a shrug (≥ 4 words). The directive syntax is oxlint's own:
//   // oxlint-disable-next-line <rule> -- <why>
//   /* oxlint-disable <rule> -- <why> */ … /* oxlint-enable <rule> */
// `oxlint-enable` needs no reason (it re-arms the rule).
//
// Own walker, on purpose: `buildGuardScan.sourceFiles` skips `*.test.ts` and `.mjs`,
// which is right for the write/chip/img rules (a test may spell a forbidden pattern as
// a fixture) and wrong here — a disable comment in a test or a CI script is exactly as
// silent as one in a component. Everything oxlint lints, this scans.

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TREES = ['src', 'functions', 'worker', 'e2e', 'scripts']

function lintedFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : lintedFiles(p)
    // This file spells the directive in its own header and regex; it is not a site.
    if (name === 'lint-disable-rule.test.ts') return []
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [p] : []
  })
}

const DIRECTIVE = /oxlint-disable(?:-next-line|-line)?\b([^\n*]*)/g

interface Site {
  file: string
  line: number
  text: string
}

function unexplained(): Site[] {
  const out: Site[] = []
  for (const tree of TREES) {
    for (const f of lintedFiles(join(rootDir, tree))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(DIRECTIVE)) {
        // Block comments may put the reason on following lines; read to the closing `*/`
        // (or the end of the line for a `//` directive).
        const tail = src.slice(m.index, src.indexOf('*/', m.index) > 0 && src.slice(m.index, m.index + 2) !== '//' ? src.indexOf('*/', m.index) : src.indexOf('\n', m.index))
        const reason = tail.split(' -- ')[1]?.trim() ?? ''
        if (reason.split(/\s+/).filter(Boolean).length >= 4) continue
        const line = src.slice(0, m.index).split('\n').length
        out.push({ file: relative(rootDir, f).split(sep).join('/'), line, text: m[0].trim() })
      }
    }
  }
  return out
}

describe('lint-disable rule', () => {
  it('every oxlint-disable directive carries " -- <reason>" (≥ 4 words)', () => {
    const bad = unexplained()
    expect(
      bad.map((s) => `${s.file}:${s.line}  ${s.text}`).join('\n'),
      'an oxlint-disable without a reason is an exemption nobody can re-check — append ` -- <why this line is right and the rule is wrong here>`',
    ).toBe('')
  })

  it('the scanner sees the one legitimate block directive (so a silent regex can never pass)', () => {
    // functions/_lib/recipeImport.ts disables no-control-regex around its own \x01
    // column sentinel, with a reason. If this canary ever vanishes, the directive moved
    // or the regex stopped matching — either way the test above proves nothing.
    const src = readFileSync(join(rootDir, 'functions/_lib/recipeImport.ts'), 'utf8')
    expect([...src.matchAll(DIRECTIVE)].length).toBeGreaterThanOrEqual(1)
  })
})
