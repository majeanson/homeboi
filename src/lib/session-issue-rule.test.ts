import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sourceFiles, readScanned } from './buildGuardScan'

// THE SESSION-MINT RULE, made structural (STATE.md §4-L, L1; sibling of
// write-rule.test.ts — same fail-closed shape, same shared plumbing).
//
// A session cookie carries the operator row's session_version (migration 0134), and
// that field is what lets a password reset or « Se déconnecter partout ailleurs »
// end every other device's session. `issueSession()` takes the version as a plain
// argument — which means a handler that calls it directly can mint a cookie at
// version 1 forever, by habit, and that cookie is revocable by nobody. So handlers
// don't call it: they call `signInAs()`, which reads the live version off the row.
//
// FAIL-CLOSED: `issueSession(` may appear in exactly one non-test file, the one that
// defines it. Six handlers were converted on 2026-09-16 (login, signup, reset, demo,
// demo/claim, operator-join); the seventh would be the one this catches.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = join(srcDir, '..')
const SCANNED = ['functions', 'worker'].map((d) => join(rootDir, d))
const DEFINER = ['functions', '_lib', 'auth.ts'].join(sep)

describe('session-issue rule', () => {
  it('issueSession() is called only where it is defined — everything else goes through signInAs()', () => {
    const offenders: string[] = []
    for (const dir of SCANNED) {
      for (const file of sourceFiles(dir)) {
        const rel = relative(rootDir, file)
        if (rel === DEFINER) continue
        const src = readScanned(file)
        src.split('\n').forEach((line, i) => {
          if (/\bissueSession\s*\(/.test(line)) offenders.push(`${rel}:${i + 1}`)
        })
      }
    }
    expect(
      offenders,
      'mint the cookie with signInAs(env, email) — it reads the row’s session_version, which is what makes the session revocable',
    ).toEqual([])
  })

  it('the definer still exists (a renamed helper would silently exempt nothing)', () => {
    const src = readScanned(join(rootDir, DEFINER))
    expect(src).toMatch(/export async function issueSession\(/)
    expect(src).toMatch(/export async function signInAs\(/)
  })
})
