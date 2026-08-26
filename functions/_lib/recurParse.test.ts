import { describe, it, expect } from 'vitest'
import { parseRecurPhrase, seasonAnchorFor } from './recurParse'
import { localDayStart } from './ids'

// Local-midnight helper, same convention as recur.test.ts (America/Toronto).
const d = (y: number, m: number, day: number) => localDayStart(new Date(Date.UTC(y, m, day, 12)))
// "now" instants: noon UTC is safely inside the local calendar date.
const at = (y: number, m: number, day: number) => Date.UTC(y, m, day, 16)

describe('parseRecurPhrase — FR', () => {
  it('« chaque automne » → yearly + season anchor', () => {
    const p = parseRecurPhrase('nettoyer les gouttières chaque automne', at(2026, 0, 10))
    expect(p?.recur).toEqual({ freq: 'yearly', interval: 1 })
    expect(p?.seasonAnchor).toBe(d(2026, 8, 1)) // next Sep 1 (January is not autumn)
  })
  it('mid-season, the season anchor is TODAY (never back-dated)', () => {
    const p = parseRecurPhrase('ramasser les feuilles chaque automne', at(2026, 9, 12))
    expect(p?.seasonAnchor).toBe(d(2026, 9, 12))
  })
  it('accents fold: « chaque été »', () => {
    const p = parseRecurPhrase('ouvrir la piscine chaque été', at(2026, 0, 10))
    expect(p?.recur).toEqual({ freq: 'yearly', interval: 1 })
    expect(p?.seasonAnchor).toBe(d(2026, 5, 1))
  })
  it('« aux 3 mois » → monthly/3 (the Québécois form)', () => {
    expect(parseRecurPhrase('changer le filtre aux 3 mois')?.recur).toEqual({ freq: 'monthly', interval: 3 })
  })
  it('« tous les 2 ans » → yearly/2', () => {
    expect(parseRecurPhrase('ramoner la cheminée tous les 2 ans')?.recur).toEqual({ freq: 'yearly', interval: 2 })
  })
  it('« chaque année » / « chaque mois » / « chaque semaine » bare units', () => {
    expect(parseRecurPhrase('détartrer la bouilloire chaque année')?.recur).toEqual({ freq: 'yearly', interval: 1 })
    expect(parseRecurPhrase('vérifier chaque mois')?.recur).toEqual({ freq: 'monthly', interval: 1 })
    expect(parseRecurPhrase('arroser chaque semaine')?.recur).toEqual({ freq: 'weekly', interval: 1 })
  })
  it('« chaque saison » → quarterly anchored on the next season turn', () => {
    const p = parseRecurPhrase('tourner le matelas chaque saison', at(2026, 0, 10))
    expect(p?.recur).toEqual({ freq: 'monthly', interval: 3 })
    expect(p?.seasonAnchor).toBe(d(2026, 2, 1)) // next boundary from January = Mar 1
  })
})

describe('parseRecurPhrase — EN', () => {
  it('"every fall" → yearly + season anchor', () => {
    const p = parseRecurPhrase('clean the gutters every fall', at(2026, 0, 10))
    expect(p?.recur).toEqual({ freq: 'yearly', interval: 1 })
    expect(p?.seasonAnchor).toBe(d(2026, 8, 1))
  })
  it('"every 6 weeks" → weekly/6', () => {
    expect(parseRecurPhrase('descale every 6 weeks')?.recur).toEqual({ freq: 'weekly', interval: 6 })
  })
  it('"yearly" / "monthly" adverbs', () => {
    expect(parseRecurPhrase('service the furnace yearly')?.recur).toEqual({ freq: 'yearly', interval: 1 })
    expect(parseRecurPhrase('check monthly')?.recur).toEqual({ freq: 'monthly', interval: 1 })
  })
})

describe('parseRecurPhrase — no cadence', () => {
  it('a bare date is not a cadence (whenparse territory)', () => {
    expect(parseRecurPhrase('dentiste mardi 15h')).toBeNull()
    expect(parseRecurPhrase('nettoyer les gouttières le 20 juin')).toBeNull()
  })
  it('a season word WITHOUT chaque/every is not recurring', () => {
    expect(parseRecurPhrase("préparer le jardin à l'automne")).toBeNull()
  })
})

describe('seasonAnchorFor (the AI season-word echo)', () => {
  it('resolves FR + EN words, accent-folded', () => {
    expect(seasonAnchorFor('automne', at(2026, 0, 10))).toBe(d(2026, 8, 1))
    expect(seasonAnchorFor('fall', at(2026, 0, 10))).toBe(d(2026, 8, 1))
    expect(seasonAnchorFor('été', at(2026, 0, 10))).toBe(d(2026, 5, 1))
  })
  it('winter from November → this Dec 1; from January (in winter) → today', () => {
    expect(seasonAnchorFor('hiver', at(2026, 10, 5))).toBe(d(2026, 11, 1))
    expect(seasonAnchorFor('hiver', at(2026, 0, 10))).toBe(d(2026, 0, 10))
  })
  it('null on a non-season word', () => {
    expect(seasonAnchorFor('mardi')).toBeNull()
    expect(seasonAnchorFor(null)).toBeNull()
  })
})
