import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GLOSSARY, rivalForms } from './glossary'
import { GUIDE } from './guideContent'
import { sourceFiles } from './buildGuardScan'
import { FR } from '../i18n'
import { EN } from '../i18n.en'

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

const E2E = join(__dirname, '..', '..', 'e2e')

// THE VALUES COME FROM THE DICTIONARY, NOT FROM THE SOURCE TEXT.
//
// Three drafts to get here, and the two dead ends are worth keeping written down
// because both looked right and produced confident numbers:
//
// 1. Regex over `'…'` only. Every pluralising string in this app is a TEMPLATE literal
//    (`${n} note effacée`) — exactly the strings that report a delete. Missed all of them.
// 2. Regex over both quote styles, comments blanked. Better, still wrong: a French
//    apostrophe (« d'essai », and in comments « pour l'instant ») ends a `'…'` match
//    early, so the next match pairs across code and swallows source fragments as if they
//    were UI copy. The tell was a planted string that could not move the count.
//
// Walking the imported dictionary removes the whole class: FR and EN are plain objects,
// so their values ARE the strings, no parsing involved. `confirmCopy.test.ts` already
// walks them this way, including calling interpolating strings with a stand-in.
//
// (The dead end paid for itself anyway: chasing it found that `blankComments` destroyed
// 98% of a French file, which had silently blinded the breadcrumb guard. Fixed in
// buildGuardScan.ts the same day.)
function dictValues(dict: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'function') {
      // An interpolating string: render it with stand-ins, the way a screen would.
      try {
        const r = (v as (...a: unknown[]) => unknown)('Machin', 2, 'Truc')
        if (typeof r === 'string') out.push(r)
      } catch {
        /* takes a shape we can't fake — skipped; the canary below notices a collapse */
      }
    } else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk)
  }
  walk(dict)
  return out
}

const frValues = dictValues(FR)
const enValues = dictValues(EN)

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
// A rival's target is 0 — it is a word that LOST. Two words that look like rivals are
// not: « effacer » keeps the eraser (day 2), and « le cercle » keeps the PEOPLE (day 3,
// see its own ratchet below). `effacer` is the exception: it keeps
// a legitimate job (the drawing eraser, and consequence prose), so its number falls to
// a floor rather than to zero. Day 2 of UNIFY.md spends these down.
const RIVAL_CEILING: Record<string, number> = {
  'fr:Enlever': 0,
  'fr:Tâche': 2,
  'fr:Événement': 0,
}

// Day 2 spent this down to its floor, and day 3 learned the floor was 14 rather than 8 —
// the earlier numbers came from a scanner that was reading comments as copy. Every one of
// the 14 is legitimate: consequence prose (« sera effacé »), the DrawPad ink eraser, the ✕
// that clears typed text, and the school-year dates. All MARKS, never objects.
const EFFACER_CEILING = 14
const EFFACER_FLOOR_NOTE = 'all 14 are legitimate: prose, the DrawPad ink, the field ✕, typed dates'

describe('glossary — shape', () => {
  it('the scanners found the app (canary)', () => {
    expect(frValues.length, 'FR i18n values').toBeGreaterThan(2000)
    expect(enValues.length, 'EN i18n values').toBeGreaterThan(2000)
    expect(e2eText.length, 'e2e specs').toBeGreaterThan(100_000)
    // …and an interpolating string really is RENDERED, not skipped. Those are the
    // strings that report a delete (`${n} note retirée`), so missing them would blind
    // the ratchets to exactly the words they hunt — which is what the first two drafts
    // of this scanner did.
    expect(
      frValues.some((v) => v.includes('Machin')),
      'no interpolating string was rendered — the walk is skipping functions',
    ).toBe(true)
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

  // « Le cercle » is NOT on its way out — day 3 established that it names the PEOPLE,
  // not the tab (the tab is Maison). What must not happen is the word SPREADING back
  // into strings that navigate: « Fiche complète dans Le cercle » pointed at a place
  // that no longer exists under that name. A count cannot tell a naming use from a
  // navigating one, so this holds the line rather than pretending to judge: the word
  // may stay exactly where it is, and may not grow.
  it('« cercle » names the people and does not spread back into navigation', () => {
    const fr = frValues.filter((v) => /le cercle/i.test(v)).length
    const en = enValues.filter((v) => /the circle/i.test(v)).length
    expect(fr, 'FR « le cercle » may not grow past its 6 naming uses').toBeLessThanOrEqual(6)
    expect(en, 'EN "the circle" may not grow past its 16 naming uses').toBeLessThanOrEqual(16)
  })

  it('no e2e spec pins a word that is on its way out', () => {
    // Decoupled E2E is why this matters: such a spec goes red AFTER the deploy.
    //
    // This rule was hard-coded to « Effacer » for a day, and a spec pinning
    // « Événements » sailed straight past it into a red run. It reads the glossary now,
    // so every rival is covered the moment it is declared — a guard that knows one word
    // is a guard for one word.
    const pinned: string[] = []
    for (const { form, term } of rivalForms()) {
      // Only assertions, not prose: a rival inside a spec's own comment is a note.
      const re = new RegExp(`['\`"][^'\`"]*\\b${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^'\`"]*['\`"]`, 'gi')
      for (const m of e2eText.match(re) ?? []) pinned.push(`${term}: ${m.slice(0, 60)}`)
    }
    expect(
      pinned,
      'rename the label and the spec that asserts it in ONE commit — E2E runs after the deploy here',
    ).toEqual([])
  })
})

// ── A spec may only assert a label the app can actually render ───────────────
//
// The week's most repeated mistake, four times over: a label moved, and a spec kept
// asserting the old words. E2E here is DECOUPLED (it runs after the deploy), so each
// one shipped first and went red later — « Effacer le journal », « Événements », « En
// enlever un », « Tout effacer ».
//
// The rival rule above only knows words the glossary declared as losers, so it could
// not see the last two: « effacer » is a legitimate term, and « Tout effacer » simply
// became « Tout retirer ». This is the general form of that rule — every accented
// (French) `name: '…'` literal in a spec must appear in FR or EN. Nothing else can
// stay green while the copy moves under it.
//
// The exemptions are the two honest kinds: FIXTURE data the specs invent, and labels
// COMPOSED at runtime from a fixture name plus a dictionary word.
const E2E_LABEL_ALLOWED: Record<string, string> = {
  'Pain tranché blé entier': 'cashier fixture item',
  'Couches Pampers méga': 'cashier fixture item',
  'Clinique Vétérinaire du Coin': 'search fixture business',
  'Clinique Vétérinaire Animalia': 'share-business fixture',
  'Clinique vétérinaire Papineau': 'state-matrix fixture',
  'La maisonnée démo': 'the demo household’s own name',
  'board ▸ à compléter': 'composer-fit’s own surface id, not a UI label',
  'cuisine ▸ la réserve': 'composer-fit’s own surface id, not a UI label',
  'À la caisse: Oui': 'a composed assertion (label + state)',
  'Ajouter la sélection (2)': 'composed: the label carries a live count',
  'Ouvrir la vérification': 'composed from the recipe-review fixture',
  'Contacts d’urgence — Compléter': 'fixture form name + « Compléter »',
  'Allergies / à savoir — Compléter': 'fixture form name + « Compléter »',
  'Routines du soir — Compléter': 'fixture form name + « Compléter »',
  'En cas de pépin — Compléter': 'fixture form name + « Compléter »',
  'Wi-Fi — Compléter': 'fixture form name + « Compléter »',
}

describe('e2e asserts labels the app can render', () => {
  const FRENCH = /[àâçéèêëîïôûùüÿœ]/i
  const literals = new Map<string, Set<string>>()
  // The same scan without the accent filter — the delete-family rule below needs the
  // unaccented labels too, and they are exactly the ones the accented rule cannot see.
  const allLiterals = new Map<string, Set<string>>()
  for (const f of sourceFiles(E2E).filter((p) => p.endsWith('.spec.ts'))) {
    const raw = readFileSync(f, 'utf8')
    const path = f.split(/[\/]/).pop()!
    for (const m of raw.matchAll(/name:\s*'([^']{3,60})'/g)) {
      if (!allLiterals.has(m[1])) allLiterals.set(m[1], new Set())
      allLiterals.get(m[1])!.add(path)
      if (!FRENCH.test(m[1])) continue
      if (!literals.has(m[1])) literals.set(m[1], new Set())
      literals.get(m[1])!.add(path)
    }
  }
  const dict = [...frValues, ...enValues]

  it('the probe found the specs (canary)', () => {
    expect(literals.size, 'no accented name: literals found — the scan broke').toBeGreaterThan(40)
  })

  it('every asserted label still exists in the copy', () => {
    const orphans = [...literals.entries()]
      .filter(([lit]) => !(lit in E2E_LABEL_ALLOWED))
      .filter(([lit]) => !dict.some((v) => v === lit || v.includes(lit)))
      .map(([lit, files]) => `« ${lit} » (${[...files].join(', ')})`)
    expect(
      orphans,
      'this spec asserts words the app no longer says. Rename the spec in the SAME commit as the label — ' +
        'or, if it is fixture data, add it to E2E_LABEL_ALLOWED with the reason',
    ).toEqual([])
  })

  // The rule above cannot see an UNACCENTED French label — « Effacer le journal »,
  // « Tout retirer », « Vider les cochés » carry no accent — and a strict "every literal
  // must exist" rule is not viable either: 133 of 352 name literals are fixture data
  // (« Lait 2% 4L », « Papa »), test ids, or labels composed at runtime, and an
  // allow-list that long is one nobody maintains. Measured before deciding.
  //
  // So this narrows to the words this week actually moves: a spec asserting a
  // DELETE-FAMILY label must assert one the app really says. That is the class that
  // broke four times, and it needs no exemptions at all.
  it('a spec that asserts a delete-family label asserts a real one', () => {
    const verbs = GLOSSARY.filter((t) => t.scope === 'verb').flatMap((t) => [t.fr, t.en])
    const opens = new RegExp(`^(tout\\s+)?(${verbs.join('|')})\\b`, 'i')
    const stale: string[] = []
    for (const [lit, files] of allLiterals) {
      if (!opens.test(lit)) continue
      // A composed accessible name — « Supprimer le groupe — Les cousins » — is the
      // dictionary label plus a row's own name. Judge it on the part the copy owns.
      const owned = lit.split(' — ')[0]
      if (!dict.some((v) => v === lit || v.includes(lit) || v === owned || v.includes(owned))) {
        stale.push(`« ${lit} » (${[...files].join(', ')})`)
      }
    }
    expect(stale, 'the app no longer says this — rename the spec in the same commit as the label').toEqual([])
  })

  it('every E2E_LABEL_ALLOWED entry is still asserted somewhere', () => {
    const stale = Object.keys(E2E_LABEL_ALLOWED).filter((lit) => !literals.has(lit))
    expect(stale, 'an exemption nothing asserts any more is noise — drop it').toEqual([])
  })
})
