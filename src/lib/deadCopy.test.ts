import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FR } from '../i18n'
import { FR_OPERATOR } from '../i18n.operator'

// NO DEAD COPY.
//
// Every word in the French dictionary is parsed before first paint, against a bundle cap
// that only comes down (scripts/check-bundle.mjs) — and on 2026-09-30 a scan found 151 keys
// that nothing read: 5 % of the copy, shipped to every tablet for nothing. Some were whole
// retired features (the old home page, the suggestion drawer), some were the tail of a
// refactor the day before (the « fiche famille » merge left `intake.mergeAll` behind), and
// every one of them was a place a future session would « fix the wording » of a string no
// screen shows. They went in the same commit as this guard.
//
// THE RULE: a leaf key of the FR dictionaries (the main one and Réglages') is USED when its
// name appears in src/ outside the dictionaries — as a property (`.key`) or as a quoted
// string (`'key'`, which is how `t.weather[bucket]`, `t.boardCard[id]` and friends are
// reached: the bucket names and card ids are literals somewhere). That errs on the side of
// « used »: a common name like `title` always matches, so this can MISS a dead key but never
// flag a live one. A key reached some other way goes in ALLOWED, with the reason.
//
// EN mirrors FR (`typeof FR`, enforced by tsc), so a key removed here is removed there too,
// or the build fails — which is how the 151 went out without drift.

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..')

// Keys used in a way the scan cannot see — each with the reason.
const ALLOWED: Record<string, string> = {}

function sources(dir: string): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...sources(p))
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !/^i18n/.test(e.name)) out.push(p)
  }
  return out
}

function leaves(o: unknown, path: string[] = []): string[][] {
  if (o && typeof o === 'object' && !Array.isArray(o)) return Object.entries(o).flatMap(([k, v]) => leaves(v, [...path, k]))
  return [path]
}

describe('no dead copy', () => {
  const corpus = sources(srcDir)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
  const all = [...leaves(FR), ...leaves(FR_OPERATOR, ['operator'])]

  it('finds the dictionaries and the code at all', () => {
    // Against a vacuous pass: a walk that stopped descending reports « nothing dead ».
    expect(all.length).toBeGreaterThan(2500)
    expect(corpus.length).toBeGreaterThan(500_000)
  })

  it('every FR key is read somewhere in src/', () => {
    const dead = all
      .map((p) => p.join('.'))
      .filter((full) => {
        if (full in ALLOWED) return false
        const k = full.split('.').pop()!
        return !new RegExp('[.]' + k + '(?![A-Za-z0-9_])|[\'"`]' + k + '[\'"`]').test(corpus)
      })
    expect(dead, 'nothing reads these keys — delete them (FR and EN), or say in ALLOWED how they ARE read').toEqual([])
  })

  it('every ALLOWED entry still names a real key', () => {
    const known = new Set(all.map((p) => p.join('.')))
    expect(Object.keys(ALLOWED).filter((k) => !known.has(k))).toEqual([])
  })
})
