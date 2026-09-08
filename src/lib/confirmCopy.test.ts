import { describe, expect, it } from 'vitest'
import { FR } from '../i18n'
import { EN } from '../i18n.en'

// A DESTRUCTIVE DIALOG MUST SAY WHAT IS LOST.
//
// This app already knew that — « Supprimer ce groupe ? Les personnes restent dans le
// cercle. », « Révoquer ce lien durable ? Il cessera de fonctionner tout de suite,
// pour de bon. » — but four dialogs had drifted back to a bare question by 2026-09-08:
// the shared fallback « Supprimer ? » (reached from a grocery row AND a tracked
// staple), « Supprimer cette recette ? » and « Supprimer ce mot gardé ? ». A bare
// question is exactly where a first-time user stops: it asks for a decision while
// hiding its consequence.
//
// The rule, in the shape a test can hold: a `…Confirm` string is a QUESTION PLUS a
// consequence — so it carries a second sentence (or a clause after the « ? »), and
// runs at least six words. Interpolating confirms (`(name) => …`) are checked on the
// template they'd produce.

const words = (s: string) => s.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
// A consequence follows the question: text after the first « ? », or a second sentence.
const saysConsequence = (s: string) => {
  const q = s.indexOf('?')
  if (q >= 0 && words(s.slice(q + 1)) >= 3) return true
  return s.split(/[.!]\s/).filter((x) => words(x) >= 3).length >= 2
}

// Keys ending in `Confirm` that are NOT dialogs — each says why.
const NOT_A_DIALOG: Record<string, string> = {
  'recipes.reviewConfirm': 'a chip on a re-read recipe (« à vérifier »), not a question',
  'sharedVoyage.joinConfirm': 'the JOIN button’s label — an opt-IN, nothing is destroyed',
  'audience.exitConfirm': 'the « Sortir » BUTTON inside the kid-exit gate, not a question',
}

interface Found { key: string; v: string }
function confirms(dict: unknown): Found[] {
  const out: Found[] = []
  const walk = (o: unknown, path: string) => {
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) walk(v, path ? `${path}.${k}` : k)
      return
    }
    if (!/Confirm$/.test(path)) return
    // A plain string, or an interpolating one rendered with a stand-in name.
    if (typeof o === 'string') out.push({ key: path, v: o })
    else if (typeof o === 'function' && (o as (...a: never[]) => unknown).length <= 2) {
      try {
        const v = (o as (...a: unknown[]) => unknown)('Machin', 2)
        if (typeof v === 'string') out.push({ key: path, v })
      } catch {
        /* takes a shape we can't fake — skipped, and the count test below notices */
      }
    }
  }
  walk(dict, '')
  return out.filter((x) => !(x.key in NOT_A_DIALOG))
}

describe('a destructive dialog says what is lost', () => {
  for (const [lang, dict] of [['fr', FR], ['en', EN]] as const) {
    const found = confirms(dict)

    it(`${lang}: the scanner found the dialogs (canary)`, () => {
      // ~25 of them; if this collapses the walk broke and the rules below are empty.
      expect(found.length, 'the `…Confirm` walk found almost nothing — it broke').toBeGreaterThan(15)
    })

    it(`${lang}: every confirm states a consequence, not just a question`, () => {
      const bare = found.filter((x) => !saysConsequence(x.v)).map((x) => `${x.key}: « ${x.v} »`)
      expect(
        bare,
        'add what will be lost after the question — « Supprimer ce groupe ? Les personnes restent dans le cercle. » is the model. A confirm that is only a question is where a first-time user stops',
      ).toEqual([])
    })

    it(`${lang}: no confirm is shorter than six words`, () => {
      const short = found.filter((x) => words(x.v) < 6).map((x) => `${x.key}: ${words(x.v)} words`)
      expect(short).toEqual([])
    })
  }
})
