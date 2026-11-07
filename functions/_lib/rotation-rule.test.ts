import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// ONE ROTATION (plan de la tâche unifiée: rotation is a checkbox on any recurring task, not a
// chore-only type). It was hand-spelled in board.ts, chores.ts and month.ts, each with its own
// answer to malformed JSON and to a shortened list. `_lib/rotation.ts` is the only place left
// that does the arithmetic, so home_projects could join by calling it. A second spelling is how
// two tables would come to disagree about whose turn it is.
//
// Plant: `rotation[idx % rotation.length]` in functions/api/chores.ts.

const FUNCTIONS = join(__dirname, '..')
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : []
  })

describe('one rotation code path', () => {
  const files = walk(FUNCTIONS)

  it('walks the handlers (canary)', () => {
    expect(files.some((f) => f.endsWith('chores.ts'))).toBe(true)
    expect(files.some((f) => f.endsWith('home-projects.ts'))).toBe(true)
  })

  it('nothing outside _lib/rotation.ts does the turn arithmetic or parses the column', () => {
    const strays = files
      .filter((f) => !f.endsWith('rotation.ts'))
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        return /%\s*(rot|rotation)\.length/.test(src) || /JSON\.parse\([^)]*rotation/.test(src)
      })
      .map((f) => f.slice(FUNCTIONS.length + 1))
    expect(strays).toEqual([])
  })
})
