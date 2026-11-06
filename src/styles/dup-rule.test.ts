import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss, { type Rule } from 'postcss'
import { describe, expect, it } from 'vitest'

// THE SAME RULE, WRITTEN AGAIN (solidify 5.2, 2026-11-05). Three identical fade keyframes
// lived under three names, and four sites borrowed one named after a flyer. Nothing broke,
// which is the problem: a copy never fails, it only drifts. Plants: paste a `.zz { display:
// flex; flex-wrap: wrap; align-items: center; gap: var(--cluster-gap, 0.5rem); min-width: 0 }`,
// and a `@keyframes zz { from { opacity: 0 } to { opacity: 1 } }`.
//
// A block that merely LOOKS like a Cluster (its own gap, no min-width) is ratcheted rather
// than swept: 54 of them wrap correctly today, and moving each to <Cluster> would touch 54
// components to change nothing a household can see. Same for ellipsis, three declarations
// that sit inside rules doing other work. New ones reach for the primitive; the counts fall.
const CLUSTER_LIKE_MAX = 54
const ELLIPSIS_MAX = 48

const here = dirname(fileURLToPath(import.meta.url))
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.css') ? [p] : []
  })
const files = walk(here).map((f) => ({
  rel: relative(here, f).split(sep).join('/'),
  root: postcss.parse(readFileSync(f, 'utf8'), { from: f }),
}))

const body = (r: Rule) =>
  r.nodes
    .flatMap((n) => (n.type === 'decl' ? [`${n.prop}:${n.value.replace(/\s+/g, ' ')}`] : []))
    .sort()
    .join(';')

describe('css duplicates', () => {
  it('no two @keyframes share a body', () => {
    const seen = new Map<string, string[]>()
    for (const { rel, root } of files) {
      root.walkAtRules(/keyframes$/, (a) => {
        const steps: string[] = []
        a.walkRules((r) => void steps.push(`${r.selector}{${body(r)}}`))
        const k = steps.join('')
        seen.set(k, [...(seen.get(k) ?? []), `${a.params} @ ${rel}`])
      })
    }
    expect([...seen.values()].filter((v) => v.length > 1)).toEqual([])
  })

  it('no rule block is a copy of .cluster', () => {
    let cluster = ''
    const blocks: { sel: string; b: string }[] = []
    for (const { rel, root } of files) {
      root.walkRules((r) => {
        const b = body(r)
        if (r.selector === '.cluster') cluster = b
        else blocks.push({ sel: `${r.selector} @ ${rel}`, b })
      })
    }
    expect(cluster, 'the scan lost .cluster').not.toBe('')
    expect(blocks.filter((x) => x.b === cluster).map((x) => x.sel)).toEqual([])
  })

  it(`cluster-like blocks only fall (${CLUSTER_LIKE_MAX})`, () => {
    let n = 0
    const only = new Set(['display', 'flex-wrap', 'gap', 'align-items'])
    for (const { root } of files) {
      root.walkRules((r) => {
        const props = r.nodes.flatMap((x) => (x.type === 'decl' ? [x.prop] : []))
        if (props.includes('display') && props.includes('flex-wrap') && props.every((p) => only.has(p))) n++
      })
    }
    expect(n, 'use <Cluster> for a new wrapping row').toBeLessThanOrEqual(CLUSTER_LIKE_MAX)
  })

  it(`hand-spelled ellipsis only falls (${ELLIPSIS_MAX})`, () => {
    let n = 0
    for (const { root } of files) root.walkDecls('text-overflow', (d) => void (d.value === 'ellipsis' && n++))
    expect(n, 'use .ellipsis on a new truncating line').toBeLessThanOrEqual(ELLIPSIS_MAX)
  })
})
