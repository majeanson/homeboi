import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// EIGHT LINES BETWEEN A COMMIT MESSAGE AND A SHELL ON A RUNNER THAT HOLDS
// CLOUDFLARE_API_TOKEN.
//
// `${{ ... }}` in a workflow is TEXTUAL SUBSTITUTION performed before bash ever sees the
// line. So `run: node x.mjs "${{ github.event.head_commit.message }}"` with a commit
// message containing a backtick, `$(…)` or a quote is not a quoting bug — it is arbitrary
// shell, authored by whoever wrote the commit, running with every secret that step has.
//
// Passing the same value through `env:` is inert: the runner sets an environment
// variable, bash never parses its contents, and the script reads it with process.env.
//
// This guard exists because « Les remarques » (0136) added a step that reads commit
// messages, and because the rule is invisible in review — the dangerous version and the
// safe version look almost identical.

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows')

/** Every line of a workflow that belongs to a `run:` block, with its file and number. */
function runBlockLines(file) {
  const lines = readFileSync(join(WORKFLOWS, file), 'utf8').split('\n')
  const out = []
  let indent = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (indent !== null) {
      const width = line.length - line.trimStart().length
      // A blank line inside a block scalar keeps it open; anything at or left of the
      // opening indent ends it.
      if (line.trim() === '') continue
      if (width > indent) {
        out.push({ file, n: i + 1, line })
        continue
      }
      indent = null
    }
    const m = line.match(/^(\s*)-?\s*run:\s*(\|[-+]?|>[-+]?)?\s*(.*)$/)
    if (m) {
      if (m[3]) out.push({ file, n: i + 1, line: m[3] })
      if (m[2]) indent = m[1].length
    }
  }
  return out
}

const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))

describe('untrusted input in the workflows', () => {
  it('finds the workflows at all', () => {
    // Without this, every assertion below passes vacuously over an empty list — the
    // failure mode this whole repo keeps re-learning.
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain('ci.yml')
  })

  it('never interpolates a github.event value into a `run:` block', () => {
    // Red against moving `${{ github.event.head_commit.message }}` from `env:` into the
    // `run:` line — which is the natural, wrong way to write this step.
    const offenders = []
    for (const f of files) {
      for (const { n, line } of runBlockLines(f)) {
        if (/\$\{\{\s*github\.event/.test(line)) offenders.push(`${f}:${n} → ${line.trim()}`)
      }
    }
    expect(offenders, 'a github.event value reaches a shell; pass it through `env:` instead').toEqual([])
  })

  it('never interpolates any non-trivial expression into a `run:` block', () => {
    // Broader than the rule above, and deliberately so: `github.head_ref`, an issue title
    // and a branch name are all attacker-controllable too. `secrets.*` is allowed — it is
    // masked, it is ours, and forbidding it would just push people back to `run:`.
    const offenders = []
    for (const f of files) {
      for (const { n, line } of runBlockLines(f)) {
        for (const m of line.matchAll(/\$\{\{([^}]*)\}\}/g)) {
          const expr = m[1].trim()
          if (/^(secrets|env|matrix|runner|job|steps)\./.test(expr)) continue
          if (/^github\.(sha|ref|ref_name|repository|run_id|run_number|workspace|token|event_name|actor)$/.test(expr)) continue
          offenders.push(`${f}:${n} → \${{ ${expr} }}`)
        }
      }
    }
    expect(offenders, 'interpolating this into a shell is attacker-controllable; use `env:`').toEqual([])
  })
})
