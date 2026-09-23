import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { keysForPath } from './realtime'

// THE TWO HALVES OF ONE INVALIDATION MUST AGREE.
//
// Every write has to refresh two audiences, through two different mechanisms:
//   · the device that wrote — `useWrite(path, { affectedKeys })`, client-side;
//   · every OTHER device in the household — `keysForPath(path)`, broadcast from
//     `authed()` through the RealtimeHub after a successful write.
//
// `realtime.test.ts` pins what the map SAYS. This pins that it says the same thing the
// client does, which is the half no hand-written expectation catches: the map and the
// call sites are edited in different files, months apart, usually by someone adding a
// key to one of them.
//
// WHAT IT FOUND ON ITS FIRST RUN (2026-09-23), after a cross-check of all 86 write
// endpoints: `photos` sat in SILENT_PATHS with the blob endpoints — it takes an image
// body, so it looked like one — while its POST also INSERTS a `photos` row that the
// board's PhotoFrame card polls. A photo added on a phone never reached the wall tablet
// until its next poll. Three quieter ones with it: an upkeep row is drawn inside its
// carnet (`home-projects` → carnets), the postal code IS the flyer query
// (`household` → flyers), and a member's name and colour are drawn on every routine card
// (`members` → routines).
//
// DIRECTION MATTERS, and only one direction is a defect. A client that invalidates MORE
// than the server broadcasts costs one extra refetch on the device that already has the
// answer. A client that invalidates a key the server does not is a stale screen on
// somebody else's tablet, which is the bug this file is for.

const ROOT = join(import.meta.dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((name) => {
    const p = `${dir}/${name}`
    return statSync(join(ROOT, p)).isDirectory()
      ? sourceFiles(p)
      : /\.tsx?$/.test(name) && !/\.test\./.test(name)
        ? [p]
        : []
  })
}

/**
 * `BOARD_KEY` → `'board'`, from EVERY file that defines one — not just
 * `src/lib/queryKeys.ts`.
 *
 * That distinction is the whole correctness of this guard, and the first version got it
 * wrong: the cross-page keys live in queryKeys.ts, but the kitchen's nine
 * (`MEALS_KEY`, `PANTRY_KEY`, `LEFTOVERS_KEY`…) live in `components/kitchen/types.ts`
 * and the recipe keys in `lib/recipes.ts`, beside the code that reads them — which is
 * the repo's own convention ("page-local keys sit beside their code"). Reading one file
 * silently dropped those identifiers from every client key set, so an endpoint whose
 * call sites use ONLY page-local keys looked like it invalidated nothing and passed
 * vacuously. A guard that walks the wrong shape reports the wrong thing with total
 * confidence.
 */
function keyNames(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of sourceFiles('src')) {
    // Exported OR not — POSTBOX_KEY and GUEST_LINKS_KEY are plain module consts beside
    // the only section that reads them, which is the same "keys live with their code"
    // convention one step further in. Plus inline queryKey literals, for the queries
    // that never named a constant at all. Anything the server broadcasts that matches
    // none of these is genuinely heard by nobody.
    for (const m of read(f).matchAll(/const ([A-Z][A-Z0-9_]*KEY)\s*=\s*\[\s*'([^']+)'/g)) out[m[1]] = m[2]
    for (const m of read(f).matchAll(/queryKey:\s*\[\s*'([^']+)'/g)) out['inline:' + m[1]] = m[1]
  }
  return out
}

/** endpoint → the union of every key the SPA invalidates after writing to it. */
function clientKeys(): Map<string, Set<string>> {
  const names = keyNames()
  const out = new Map<string, Set<string>>()
  for (const f of sourceFiles('src')) {
    const src = read(f)
    for (const m of src.matchAll(/\b(?:write|writeWith|api)\s*(?:<[^>]*>)?\s*\(\s*['"`]([a-z0-9/_-]+)['"`]/gi)) {
      // Cut the window at the NEXT call so a GET is never credited with the keys of the
      // write below it (the false-positive class write-owners.test.ts hit in 2026-09).
      const win = src.slice(m.index, m.index + 700)
      const next = win.slice(10).search(/\b(?:write|writeWith|api)\s*(?:<[^>]*>)?\s*\(/)
      const scope = next >= 0 ? win.slice(0, next + 10) : win
      if (!/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(scope)) continue
      const declared = scope.match(/affectedKeys:\s*\[([^\]]*)\]/)
      if (!declared) continue
      const set = out.get(m[1]) ?? new Set<string>()
      for (const id of declared[1].matchAll(/([A-Z][A-Z0-9_]+_KEY)/g)) {
        const name = names[id[1]]
        if (name) set.add(name)
      }
      out.set(m[1], set)
    }
  }
  return out
}

// Endpoints where the client deliberately invalidates something the household's OTHER
// devices have no reason to hear about — each with the why, the shape every allow-list
// in this repo uses.
const ALLOWED: Record<string, string> = {
  'pair/devices':
    'device + guest-link admin is the OPERATOR’s own list. Another tablet does not render it, and a paired device learning that a sibling was revoked is noise at best (SILENT_PATHS).',
  pets:
    'the client refreshes the board out of caution; a pet does not appear in the board payload — birthdays are derived from members + contacts only (_lib/birthdays.ts UNION). Over-invalidating costs one refetch on the device that already has the answer.',
}

describe('the client and the server invalidate the same things', () => {
  const client = clientKeys()
  // Every endpoint either side knows about: the client's write sites, plus the map's own
  // explicit entries (so a mapped path with no client writer is still checked).
  const PATHS_TO_CHECK = [
    ...new Set([
      ...client.keys(),
      ...[...read('functions/_lib/realtime.ts').matchAll(/^\s*'?([A-Za-z0-9/_-]+)'?:\s*\[\[/gm)].map((m) => m[1]),
    ]),
  ]

  it('found the write sites at all (an empty scan would pass vacuously)', () => {
    // The lesson this file exists downstream of: a guard that parses nothing is green
    // forever. The first version of this scan matched only QUOTED map keys while the map
    // uses bare identifiers, and it confidently reported ten healthy endpoints as broken.
    expect(client.size).toBeGreaterThan(40)
    expect(Object.keys(keyNames()).length).toBeGreaterThan(20)
    expect(keysForPath('events')).toEqual(expect.arrayContaining([['board'], ['month']]))
  })

  it('every key the SPA invalidates is also broadcast to the other devices', () => {
    const offenders: string[] = []
    for (const [path, keys] of client) {
      if (path in ALLOWED) continue
      const broadcast = new Set(keysForPath(path).map((k) => k[0]))
      const missing = [...keys].filter((k) => !broadcast.has(k))
      if (missing.length) offenders.push(`${path} → the other devices never hear about: ${missing.join(', ')}`)
    }
    expect(
      offenders,
      'add the key to PATH_KEYS in _lib/realtime.ts (the server mirror of affectedKeys) — or, if the other devices genuinely do not care, to ALLOWED here WITH the reason',
    ).toEqual([])
  })

  it('every key the server broadcasts is one some query actually listens on', () => {
    // THE OTHER DIRECTION, and the one that found `recipe-tags`. The map is a literal
    // copy of the client's key strings on the far side of the wire — the Worker cannot
    // import them — so a rename on one side leaves the other shouting a word nobody
    // knows. It broadcast ['recipe-tags'] while every query reads ['recipeTags']: the
    // push was well-formed, delivered, and landed on nothing, which is the most
    // expensive kind of wrong because everything looks healthy.
    const known = new Set(Object.values(keyNames()))
    // Keys the SERVER legitimately knows about that no exported *_KEY constant spells:
    // literals used inline by a query (a scoped sub-key), each named here rather than
    // loosened away.
    const INLINE = new Set<string>([])
    const unheard: string[] = []
    for (const path of PATHS_TO_CHECK) {
      for (const [key] of keysForPath(path)) {
        if (!known.has(key) && !INLINE.has(key)) unheard.push(`${path} → broadcasts '${key}', which no query reads`)
      }
    }
    expect(
      [...new Set(unheard)],
      'the server is pushing a key nothing listens on — match the client spelling (src/lib/queryKeys.ts or the page-local file), or add a genuine inline key to INLINE here',
    ).toEqual([])
  })

  it('every ALLOWED entry is still a real divergence (a stale exemption hides the next one)', () => {
    const stale = Object.keys(ALLOWED).filter((path) => {
      const keys = client.get(path)
      if (!keys) return true
      const broadcast = new Set(keysForPath(path).map((k) => k[0]))
      return [...keys].every((k) => broadcast.has(k))
    })
    expect(stale, 'these no longer diverge — drop them from ALLOWED').toEqual([])
  })
})
