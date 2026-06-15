// Hands-free Cook-mode voice commands. A spoken phrase (on-device STT) is mapped
// to a stepper action so you can steer with messy hands: next / back / repeat /
// timer. Pure + framework-free so it's unit-testable; CookMode wires the result
// to setIdx / speak / addTimer.
//
// We fold accents AND punctuation off both the phrase and the keywords, then do a
// forgiving SUBSTRING match — so "répète"/"repete", "vas-y"/"vas y", and
// "ok l'étape suivante" all land. The lists are intentionally Québécois-generous
// (FR-CA first, a few EN fallbacks).
//
// The catch: with auto-read ON, the mic can hear the narrated step, so any stem
// that hides inside a common recipe word would self-trigger. Those are
// DELIBERATELY excluded — never reintroduce them (the test pins this):
//   • back:  no "retour" (→ "retourner les légumes"), no bare "avant" (→ "d'avant")
//   • timer: no bare "minut"/"minute" (→ "10 minutes"), no "compte"/"lance"
//            ("balance"/"blanchir" contain "lanc"); use "minuteur"/"minuterie"
//   • next:  no "go" (→ "escargot"), no "ensuite"/"après"/"passe" (step prose)
//   • repeat: "redis" in full, never the stem "redi" (→ "ingREDIents")

export type CookCommand = 'next' | 'back' | 'repeat' | 'timer'

export function foldCmd(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents → match accented or not
    .replace(/[^a-z0-9]+/g, ' ') // hyphens/apostrophes/punctuation → spaces
    .trim()
}

// All keywords are pre-folded (no accents, single spaces) to match foldCmd output.
const CMD_NEXT = [
  'suivant', 'suivante', 'prochain', 'prochaine', 'avance', 'en avant', 'continue',
  'la suite', 'vas y', 'envoye', 'envoie', 'enweille', 'enweye', 'aweille', 'embraye',
  'next', 'forward',
]
const CMD_BACK = [
  'precedent', 'precedente', 'arriere', 'en arriere', 'recul', 'reviens', 'd avant',
  'back', 'previous',
]
const CMD_REPEAT = [
  'repet', 'redis', 'redites', 'reli', 'reecout', 'encore', 'repeat', 'again',
]
const CMD_TIMER = [
  'minuteu', 'minuteri', 'chrono', 'decompte', 'compte a rebours', 'demarr',
  'depart', 'timer',
]

// First match wins, in priority order — so a phrase that mixes words resolves
// deterministically. Returns null when nothing matches (an ordinary utterance).
export function matchCookCommand(raw: string): CookCommand | null {
  const s = foldCmd(raw)
  const has = (words: string[]) => words.some((w) => s.includes(w))
  if (has(CMD_NEXT)) return 'next'
  if (has(CMD_BACK)) return 'back'
  if (has(CMD_REPEAT)) return 'repeat'
  if (has(CMD_TIMER)) return 'timer'
  return null
}
