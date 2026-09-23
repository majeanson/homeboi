import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// THE METER HAS TO BE UNAVOIDABLE, or it is decoration.
//
// Two resources here cost money per use — Workers AI calls and R2 upload bytes — and the
// whole point of Wave 5 is that a household cannot spend without being counted. That
// holds only while there is exactly ONE way to reach each: `runModel()` (_lib/runModel)
// and `uploadR2Media()` (_lib/r2). A thirteenth `env.AI.run(` added next month would be
// invisible to the budget and perfectly reviewable — nothing about it looks wrong.
//
// This is the `write-rule.test.ts` shape applied to spend instead of writes, for the same
// reason: the rule was true when it was written, and prose does not stay true.

const ROOT = join(import.meta.dirname, '..', '..')
const FUNCTIONS = join(ROOT, 'functions')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : []
  })
}

/** Lines of a file with `//` comments and block comments blanked, so prose naming the
 *  anti-pattern (this file's own neighbours do) is never counted as a call site. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n')
}

describe('every metered resource has exactly one door', () => {
  it('no raw env.AI.run() outside the runModel seam', () => {
    const offenders: string[] = []
    for (const f of sources(FUNCTIONS)) {
      if (f.endsWith(join('_lib', 'runModel.ts'))) continue
      const src = code(f)
      // `env.AI.run(`, `ctx.env.AI!.run(`, and any other spelling that reaches the
      // binding's own run method.
      for (const m of src.matchAll(/\bAI!?\s*(?:as[^)]*?)?\)?\s*\.run\s*\(/g)) {
        offenders.push(`${f.slice(ROOT.length + 1).replace(/\\/g, '/')} :: ${src.slice(Math.max(0, m.index - 30), m.index + 20).trim()}`)
      }
    }
    expect(
      offenders,
      'call runModel(env, model, input) instead — it is what charges the household’s daily AI budget (_lib/usage.ts). A raw binding call spends money nothing counted.',
    ).toEqual([])
  })

  it('no raw bucket.put() outside the r2 helpers', () => {
    // `putR2Blob` is the low-level writer and lives beside the metered `uploadR2Media`;
    // both are in _lib/r2.ts, which is the file this rule protects rather than polices.
    //
    // ALLOWED, with the reason — the shape `write-rule.test.ts` uses, because an
    // exemption nobody has to justify is how a rule dies quietly:
    //   · `nightly.ts` writes the household's own BACKUP. It is the app spending on the
    //     household's behalf, on a schedule the household cannot trigger, and charging it
    //     to a daily visitor budget would mean a big household's backup could refuse
    //     itself — the opposite of what a backup is for. Bounded instead by BACKUP_KEEP.
    const ALLOWED = new Set(['functions/_lib/nightly.ts'])
    const offenders: string[] = []
    for (const f of sources(FUNCTIONS)) {
      if (f.endsWith(join('_lib', 'r2.ts'))) continue
      if (ALLOWED.has(f.slice(ROOT.length + 1).replace(/\\/g, '/'))) continue
      const src = code(f)
      for (const m of src.matchAll(/\b(?:PHOTOS|bucket)!?\.put\s*\(/g)) {
        offenders.push(`${f.slice(ROOT.length + 1).replace(/\\/g, '/')} :: ${src.slice(Math.max(0, m.index - 30), m.index + 20).trim()}`)
      }
    }
    expect(
      offenders,
      'go through uploadR2Media()/putR2Blob() in _lib/r2.ts — uploadR2Media is what charges the daily byte budget.',
    ).toEqual([])
  })

  it('the scanner still finds the seams themselves (it is not silently matching nothing)', () => {
    // The vacuous-pass guard this repo keeps re-learning: a rule that scans an empty set
    // is green forever. Both seams must be visible to the same walk that polices them.
    const all = sources(FUNCTIONS)
    expect(all.some((f) => f.endsWith(join('_lib', 'runModel.ts')))).toBe(true)
    expect(all.some((f) => f.endsWith(join('_lib', 'r2.ts')))).toBe(true)
    expect(all.length).toBeGreaterThan(50)
  })
})
