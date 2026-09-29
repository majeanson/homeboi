import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// EVERY SCHEDULED WORKFLOW REPORTS ITS RED. The State matrix failed three Mondays running
// (2026-09-14 → 09-28) with nobody told — a cron has no pusher for GitHub to mail. The
// fix is `.github/workflows/scheduled-red.yml`, which opens an issue on a scheduled red;
// it only hears the workflows it NAMES, so a new `schedule:` added later would be silent
// again. This holds the list to the truth.

const WORKFLOWS = join(import.meta.dirname, '..', '.github', 'workflows')
const files = readdirSync(WORKFLOWS).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
const read = (f) => readFileSync(join(WORKFLOWS, f), 'utf8')
const nameOf = (text) => text.match(/^name:\s*(.+?)\s*$/m)?.[1].replace(/^['"]|['"]$/g, '')

describe('scheduled workflows report a red', () => {
  const listener = read('scheduled-red.yml')
  const listened = [...(listener.match(/workflows:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
  const scheduled = files.filter((f) => /^\s*schedule:/m.test(read(f))).map((f) => nameOf(read(f)))

  it('finds scheduled workflows at all', () => {
    // Against a vacuous pass: a parser that stopped matching would report « nothing to check ».
    expect(scheduled.length).toBeGreaterThan(0)
    expect(listened.length).toBeGreaterThan(0)
  })

  it('names every scheduled workflow in scheduled-red.yml', () => {
    expect(scheduled.filter((n) => !listened.includes(n)), 'add it to scheduled-red.yml `workflows:` — or its red is silent').toEqual([])
  })

  it('names nothing that does not exist (a renamed workflow stops being heard)', () => {
    const names = files.map((f) => nameOf(read(f)))
    expect(listened.filter((n) => !names.includes(n))).toEqual([])
  })
})
