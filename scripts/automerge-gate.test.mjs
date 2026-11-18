import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Review #36 (2026-11-18): a Dependabot minor/patch bump auto-merged on CI alone and
// deployed, while E2E only ran on main AFTER the deploy — a bump to React Router or Vite
// reached the household tablets with zero browser tests. Pins the gate in place.
const wf = (name) => readFileSync(join(import.meta.dirname, '..', '.github', 'workflows', name), 'utf8')

describe('Dependabot auto-merge waits for the browser suite', () => {
  const merge = wf('dependabot-automerge.yml')
  const e2e = wf('e2e.yml')

  it('listens for E2E, not for CI', () => {
    expect(merge).toMatch(/workflows:\s*\['E2E \(Playwright\)'\]/)
    expect(merge).not.toMatch(/workflows:\s*\['CI & Deploy'\]/)
  })

  it('refuses an E2E run whose jobs did not all run and pass (all-skipped reads « success »)', () => {
    expect(merge).toMatch(/gh run view "\$RUN_ID" --json jobs/)
    expect(merge).toMatch(/all\(\. == "success"\)/)
  })

  it('E2E runs on a Dependabot branch, with a read-only token', () => {
    expect(e2e).toMatch(/branches:\s*\[main, 'dependabot\/\*\*'\]/)
    expect(e2e).toMatch(/^permissions:\n\s+contents: read$/m)
  })
})
