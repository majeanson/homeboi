import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { landingFor } from './searchLanding'

const search = readFileSync(join(__dirname, '../pages/SearchPage.tsx'), 'utf8')

describe('search landing — one table', () => {
  it('an entity with its own scene opens that scene', () => {
    expect(landingFor({ kind: 'recipe', id: 'r' })).toBe('/kitchen/recipe/r')
    expect(landingFor({ kind: 'trip', id: 't' })).toBe('/voyage/t')
    expect(landingFor({ kind: 'person', id: 'p' })).toBe('/cercle/person/p')
  })
  it('an entity in a container lands on the row with ?item=', () => {
    expect(landingFor({ kind: 'drawing', id: 'd' })).toBe('/drawings?item=d')
    expect(landingFor({ kind: 'habit', id: 'h' })).toBe('/board/habitudes?item=h')
    expect(landingFor({ kind: 'mot', id: 'm' })).toBe('/board?item=m')
    expect(landingFor({ kind: 'todo', id: 't' })).toBe('/board?item=t')
    expect(landingFor({ kind: 'idea', id: 'i' })).toBe('/kitchen/idees?tab=kid&item=i')
  })
  it('a chore lands on its Réglages section', () => {
    expect(landingFor({ kind: 'chore' })).toContain('focus=chores')
  })
  it('a project without a carnet falls back to its Réglages section', () => {
    expect(landingFor({ kind: 'project', carnetId: 'c' })).toBe('/cercle/carnet/c')
    expect(landingFor({ kind: 'project', carnetId: null })).toContain('focus=chores')
  })
  it('every search row takes its destination from the table', () => {
    // Plant: a hand-spelled <Link to="/drawings"> in SearchPage fails here. The guide hits
    // carry a `to` built by guideHref, so that one literal is the only exception.
    const rows = [...search.matchAll(/<Link\b[^>]*?\bto=\{?([^\s>]+)[\s\S]*?className="search__row"/g)].map((m) => m[1])
    expect(rows.length).toBeGreaterThan(15)
    expect(rows.filter((to) => !to.startsWith('landingFor(') && to !== 'g.to}')).toEqual([])
  })
})
