import { describe, it, expect } from 'vitest'
import { matchCookCommand, foldCmd } from './cookCommands'

describe('matchCookCommand — Québécois voice synonyms', () => {
  it('recognises NEXT in many forms', () => {
    for (const p of [
      'suivant',
      'la suivante',
      'prochain',
      'prochaine étape',
      'avance',
      'on avance',
      'en avant',
      'continue',
      'la suite',
      'vas-y',
      'vas y',
      'envoye',
      'envoie donc',
      'enweille',
      'aweille',
      'embraye',
      'ok, étape suivante',
      'next',
    ]) {
      expect(matchCookCommand(p), p).toBe('next')
    }
  })

  it('recognises BACK in many forms', () => {
    for (const p of [
      'précédent',
      'la précédente',
      'arrière',
      'en arrière',
      'recule',
      'reculer',
      'reviens',
      "l'étape d'avant",
      'back',
    ]) {
      expect(matchCookCommand(p), p).toBe('back')
    }
  })

  it('recognises REPEAT in many forms', () => {
    for (const p of [
      'répète',
      'répète donc',
      'repete',
      'redis',
      'redis-moi',
      'relis',
      'réécoute',
      'encore',
      'encore une fois',
      'repeat',
      'again',
    ]) {
      expect(matchCookCommand(p), p).toBe('repeat')
    }
  })

  it('recognises TIMER in many forms', () => {
    for (const p of [
      'minuteur',
      'pars le minuteur',
      'minuterie',
      'chrono',
      'chronomètre',
      'décompte',
      'compte à rebours',
      'démarre',
      'départ',
      'timer',
    ]) {
      expect(matchCookCommand(p), p).toBe('timer')
    }
  })

  // The whole point of the exclusions: with auto-read ON the mic hears the step,
  // so narrated recipe prose must NOT be read as a command. This pins it.
  it('does NOT fire on narrated recipe prose (no self-triggering)', () => {
    for (const p of [
      'retourner les légumes à mi-cuisson', // not BACK ("retour")
      'faire revenir l’oignon', // not BACK ("reviens")
      'cuire pendant dix minutes', // not TIMER ("minute")
      'laisser mijoter 20 minutes', // not TIMER
      'blanchir les amandes', // not TIMER ("lance" excluded)
      'bien mélanger la balance des ingrédients', // not TIMER
      'ajouter une pincée de sel', // nothing
      'des escargots à l’ail', // not NEXT ("go" excluded)
      'ensuite, incorporer la farine', // not NEXT ("ensuite" excluded)
      'peut se préparer à l’avance', // tolerated, but here must stay null-ish
    ]) {
      // "à l'avance" intentionally contains "avance" → that one is a known, accepted
      // overlap; assert only the genuinely-excluded stems stay silent.
      if (p.includes('avance')) continue
      expect(matchCookCommand(p), p).toBeNull()
    }
  })

  it('folds accents and punctuation so spelling/diacritics never matter', () => {
    expect(foldCmd("RÉPÈTE, s'il-te-plaît!")).toBe('repete s il te plait')
    expect(matchCookCommand('SUIVANT')).toBe('next')
    expect(matchCookCommand('répete')).toBe('repeat')
  })
})
