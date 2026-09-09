import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GLOSSARY, rivalForms } from './glossary'
import { GUIDE } from './guideContent'
import { sourceFiles } from './buildGuardScan'

// ONE WORD PER IDEA — held by a ratchet, not by good intentions.
//
// `src/lib/glossary.ts` says which word wins. This says the losing words are leaving,
// and can never come back. Written 2026-09-09 (UNIFY.md day 1) after a census found the
// app's own declared rule was false: the delete family ran SIX verbs, and one key was
// spelled two ways — `liste.clearChecked` = « Vider les cochés », `todos.clearChecked` =
// « Effacer cochées ». Same key name, same act, two words.
//
// Two design choices worth keeping:
//
// 1. IT SCANS `e2e/` TOO. E2E here is decoupled — it runs AFTER the deploy — so a
//    renamed label that breaks a text-matching spec ships first and goes red later. The
//    breadcrumb guard in settingsNav.test.ts solved this the same way. Three specs pin
//    « Effacer … » today; they are in the ratchet, so day 2 must fix them in the same
//    commit as the rename.
//
// 2. THE RATCHET COUNTS, IT DOES NOT CLASSIFY. A word is a rule violation on a BUTTON
//    (« Effacer le repas ») and perfectly correct in prose that describes a consequence
//    (« le média joint sera effacé »). No grep can tell those apart reliably, and a guard
//    that pretends to is the nested-interactive failure mode — confidently wrong. So the
//    number may only go DOWN, each `floor` records where it should stop, and the semantic
//    triage stays human work.

const SRC = join(__dirname, '..')
const E2E = join(__dirname, '..', '..', 'e2e')

// Every user-visible VALUE, both quote styles. Missing template literals is not a
// detail: every pluralising string in this app is a backtick (`${n} note effacée`), so
// a scanner that reads only 'quotes' misses exactly the strings that report a delete.
const values = (src: string): string[] => [
  ...[...src.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]),
  ...[...src.matchAll(/`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1]),
]

const frValues = values(readFileSync(join(SRC, 'i18n.ts'), 'utf8'))
const enValues = values(readFileSync(join(SRC, 'i18n.en.ts'), 'utf8'))

// e2e specs assert user-visible text; a rival asserted there is a rename waiting to break.
const e2eText = sourceFiles(E2E)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

const occurrences = (haystack: string[], form: string) => {
  const re = new RegExp(form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  return haystack.filter((v) => re.test(v)).length
}

// ── The ratchets, pinned 2026-09-09. Lower them; never raise them. ───────────
// A rival's target is 0 — it is a word that lost. `effacer` is the exception: it keeps
// a legitimate job (the drawing eraser, and consequence prose), so its number falls to
// a floor rather than to zero. Day 2 of UNIFY.md spends these down.
const RIVAL_CEILING: Record<string, number> = {
  'fr:Enlever': 0,
  'fr:Tâche': 2,
  'fr:Événement': 4,
  'fr:Le cercle': 9,
  'en:The circle': 13,
}

// Day 2 spent this from 20 to its floor: the 8 that remain are consequence prose, the
// DrawPad's ink eraser, and the ✕ that clears typed text — every one of them a MARK.
const EFFACER_CEILING = 8
const EFFACER_FLOOR_NOTE = '~8 are consequence prose (« sera effacé ») and are correct'

// Rival forms asserted by e2e specs — every one is a rename that would break a spec
// after the deploy, because E2E is decoupled here.
const E2E_RIVAL_CEILING = 0

describe('glossary — shape', () => {
  it('the scanners found the app (canary)', () => {
    expect(frValues.length, 'FR i18n values').toBeGreaterThan(2000)
    expect(enValues.length, 'EN i18n values').toBeGreaterThan(2000)
    expect(e2eText.length, 'e2e specs').toBeGreaterThan(100_000)
    // …and the value scanner really does see template literals, which the first draft
    // of the census did not.
    expect(values("a = `${n} note effacée`")).toContain('${n} note effacée')
  })

  it('every term is complete, and its definition is short enough to read', () => {
    const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
    const sentences = (s: string) => s.split(/[.!?…](?=\s|$)/).filter((x) => words(x) > 0).length
    const bad: string[] = []
    for (const t of GLOSSARY) {
      if (!/^[a-z][a-z0-9-]*$/.test(t.id)) bad.push(`${t.id}: id must be kebab-case`)
      for (const lang of ['fr', 'en'] as const) {
        if (!t[lang]?.trim()) bad.push(`${t.id}.${lang}: empty winner form`)
        const d = t.def[lang]
        if (!d?.trim()) bad.push(`${t.id}.def.${lang}: empty`)
        else if (sentences(d) > 2) bad.push(`${t.id}.def.${lang}: ${sentences(d)} sentences (max 2)`)
        else if (words(d) > 34) bad.push(`${t.id}.def.${lang}: ${words(d)} words (max 34)`)
      }
    }
    expect(bad, 'a definition is what a person reads in one breath after tapping a word').toEqual([])
  })

  it('ids are unique and no two terms claim the same word', () => {
    const dupeIds = GLOSSARY.map((t) => t.id).filter((id, i, a) => a.indexOf(id) !== i)
    expect(dupeIds, 'duplicate term ids').toEqual([])
    for (const lang of ['fr', 'en'] as const) {
      const seen = new Map<string, string>()
      const clashes: string[] = []
      for (const t of GLOSSARY) {
        const key = t[lang].toLowerCase()
        const prev = seen.get(key)
        if (prev) clashes.push(`${lang} « ${t[lang]} » claimed by both ${prev} and ${t.id}`)
        seen.set(key, t.id)
      }
      expect(clashes, 'one word may name only one idea — that is the whole rule').toEqual([])
    }
  })

  it('no winner word is another term’s rival', () => {
    const winners = new Map(GLOSSARY.flatMap((t) => [
      [`fr:${t.fr.toLowerCase()}`, t.id],
      [`en:${t.en.toLowerCase()}`, t.id],
    ]))
    const contradictions = rivalForms()
      .map((r) => ({ ...r, owner: winners.get(`${r.lang}:${r.form.toLowerCase()}`) }))
      .filter((r) => r.owner)
      .map((r) => `${r.term} calls « ${r.form} » a rival, but it is ${r.owner}'s winning word`)
    expect(contradictions).toEqual([])
  })

  it('a term that hands off to the guide names a live card', () => {
    const cards = new Set(GUIDE.map((e) => e.id))
    const dead = GLOSSARY.filter((t) => t.card && !cards.has(t.card)).map((t) => `${t.id} → ${t.card}`)
    expect(dead).toEqual([])
  })

  it('a rival or a frozen code id is always explained', () => {
    const unexplained = GLOSSARY.filter((t) => (t.rivals || t.codeIds) && !t.why).map((t) => t.id)
    // A losing word or a label that disagrees with its code id is exactly the kind of
    // thing the next session will "fix" by accident. The why is the fix-preventer.
    expect(unexplained, 'add `why:` — say which word lost, or why the id diverges').toEqual([])
  })
})

describe('glossary — the ratchets (they only go down)', () => {
  for (const { term, lang, form } of rivalForms()) {
    const key = `${lang}:${form}`
    it(`« ${form} » (${term}) is leaving the ${lang.toUpperCase()} copy`, () => {
      const ceiling = RIVAL_CEILING[key]
      expect(ceiling, `no ceiling pinned for ${key} — add one to RIVAL_CEILING`).toBeTypeOf('number')
      const n = occurrences(lang === 'fr' ? frValues : enValues, form)
      expect(
        n,
        `« ${form} » now appears ${n}× (ceiling ${ceiling}). Target is 0 — lower the ceiling in the same commit that removes one`,
      ).toBeLessThanOrEqual(ceiling)
    })
  }

  it(`« effacer » falls toward its floor (${EFFACER_FLOOR_NOTE})`, () => {
    const n = frValues.filter((v) => /effac/i.test(v)).length
    expect(n, 'a button says « vider » or « supprimer »; only the eraser and consequence prose say « effacer »').toBeLessThanOrEqual(
      EFFACER_CEILING,
    )
  })

  it('no NEW e2e spec pins a word that is on its way out', () => {
    // Decoupled E2E is why this matters: the spec would go red after the deploy.
    const n = (e2eText.match(/'Effacer[^']*'/g) ?? []).length
    expect(
      n,
      `${n} e2e assertions pin an « Effacer … » label (ceiling ${E2E_RIVAL_CEILING}). Rename the label and the spec in ONE commit`,
    ).toBeLessThanOrEqual(E2E_RIVAL_CEILING)
  })
})
