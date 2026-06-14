import { describe, it, expect } from 'vitest'
import { PIP_ICONS } from './pipIcons'

// The icon registry is the single source of truth (IconName is derived from its
// keys, so missing names are already a compile error). These guard the *art*:
// that every entry is real SVG and nothing was pasted in twice by accident.
describe('pip icon registry', () => {
  const entries = Object.entries(PIP_ICONS)

  it('has a healthy number of icons', () => {
    expect(entries.length).toBeGreaterThan(40)
  })

  it('every entry is non-empty SVG path/group markup', () => {
    for (const [name, svg] of entries) {
      expect(svg, name).toMatch(/^<(path|g)[\s>]/)
      expect(svg, name).toMatch(/d="M/) // a real path command, not a stub
      expect(svg, name).toContain('</')
    }
  })

  it('every name is kebab-case and weight-suffixed', () => {
    for (const name of Object.keys(PIP_ICONS)) {
      expect(name, name).toMatch(/^[a-z0-9-]+-(bold|fill)$/)
    }
  })

  it('has no duplicate art (a duplicate value is almost always a paste error)', () => {
    const byArt = new Map<string, string>()
    const dups: string[] = []
    for (const [name, svg] of entries) {
      const prev = byArt.get(svg)
      if (prev) dups.push(`${name} === ${prev}`)
      else byArt.set(svg, name)
    }
    expect(dups, dups.join(', ')).toEqual([])
  })
})
