// Repairs for a recipe READ (photo or pasted text) whose structure came back wrong,
// even though the words were read right. Pure, so every rule is tested on the real
// card that broke it (recipeRepair.test.ts — Marc's « Brocoli sauté au miel et au
// sésame », 2026-09-24).
//
// Two failures, both seen on that one card:
//
// 1. FIELD NAMES LEAKED AS LINES. The vision model half-followed the JSON it was asked
//    for, and the reply came back with « Servings », « 4 », « PrepMin », « 5 »,
//    « CookMin », « 10 » as six INGREDIENTS. A line that is only a field name or only
//    a number is never an ingredient or a step; the number after a field name is that
//    field's value, kept when the real field is empty.
//
// 2. A PARAGRAPH RECIPE. Plenty of cards (magazine inserts, grocery-store cards) have no
//    ingredient list: the quantities live inside the method (« chauffer 15 ml (1 c. à
//    soupe) d'huile d'olive… »). The reader then either copies the METHOD into the
//    ingredients, or leaves them empty. Either way, the ingredients can be taken out of
//    the method WORD FOR WORD — each measured phrase, exactly as printed — which keeps
//    the faithful-first promise (nothing rephrased, nothing invented). A duration
//    (« 2 minutes »), a yield (« 4 portions ») or a keeping time (« 3 mois ») is not an
//    ingredient.

const FIELD = /^(title|titre|servings?|portions?|yield|rendement|prep\s*-?\s*min(utes)?|cook\s*-?\s*min(utes)?|prep(aration)?\s*time|cook(ing)?\s*time|temps\s+de\s+(pr[ée]paration|cuisson)|ingredients?|ingr[ée]dients?|steps?|[ée]tapes?|pr[ée]paration|instructions?|method)\s*:?\s*$/i
const NUMBER = /^\d+(?:[.,]\d+)?$/

export interface FieldSalvage {
  lines: string[]
  servings: number | null
  prep: number | null
  cook: number | null
}

// Drop field-name lines and bare numbers; read « Servings » + « 4 » as servings 4.
export function salvageFieldLines(lines: string[]): FieldSalvage {
  const out: FieldSalvage = { lines: [], servings: null, prep: null, cook: null }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim()
    const f = l.match(FIELD)
    if (f) {
      const next = lines[i + 1]?.trim() ?? ''
      if (NUMBER.test(next)) {
        const n = Math.round(parseFloat(next.replace(',', '.')))
        const key = f[1].toLowerCase()
        if (/^(servings?|portions?|yield|rendement)$/.test(key)) out.servings ??= n
        else if (/^prep|pr[ée]paration/.test(key)) out.prep ??= n
        else if (/^cook|cuisson/.test(key)) out.cook ??= n
        i++ // the value is consumed with its name
      }
      continue
    }
    if (NUMBER.test(l)) continue
    out.lines.push(lines[i])
  }
  return out
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Is this « ingredient list » actually the method? True when at least half its lines
// are also step lines (the copied-method failure). An empty list is not « the method »
// — that case is decided by the caller (it may simply be a recipe with no list).
export function ingredientsAreMethod(ingredients: string[], steps: string[]): boolean {
  const real = ingredients.filter((l) => !l.startsWith('## '))
  if (!real.length || !steps.length) return false
  const stepSet = new Set(steps.map(fold))
  const joined = fold(steps.join(' '))
  const dup = real.filter((l) => {
    const k = fold(l)
    return k.length > 0 && (stepSet.has(k) || (k.length > 30 && joined.includes(k)))
  }).length
  return dup * 2 >= real.length
}

// ── Measured phrases, lifted word for word out of a method ───────────────────
// A quantity: digits (« 7,5 », « 1/2 », « ½ ») or a spelled-out article/number.
const QTY = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔]|une?|deux|trois|quatre|cinq|six|a|an|one|two|three|four|five|six)`
// Units that make the next words an INGREDIENT (whole words only — `g` must not be
// the first letter of « grand »), and the ones that make them a time,
// a temperature or a yield — which are not.
const UNIT = String.raw`(?:ml|cl|dl|l|g|kg|mg|oz|lb|lbs|c\.\s*(?:à\s*)?(?:soupe|th[ée]|caf[ée])|c\.?\s*s\.|c\.?\s*t\.|cuill[èe]res?\s+à\s+(?:soupe|th[ée]|caf[ée])|tasses?|cups?|tbsp|tsp|tablespoons?|teaspoons?|gousses?|cloves?|pinc[ée]es?|pinch(?:es)?|tranches?|slices?|bo[iî]tes?|cans?|paquets?|packages?|sachets?|bottes?|bunch(?:es)?|feuilles?|brins?|morceaux?|filets?|poign[ée]es?|handfuls?)(?![\p{L}])`
const NOT_FOOD = /^(minutes?|min|mins|heures?|h|hours?|secondes?|sec|seconds?|jours?|days?|semaines?|weeks?|mois|months?|ans?|years?|portions?|personnes?|servings?|people|fois|times|degr[ée]s?|°|pouces?|inches?|cm|mm|fa[çc]ons?|ways?|[ée]tapes?|steps?|parts?|parties?|minute|fois)\b/i
// Where an ingredient phrase ends. Punctuation (outside parentheses) always does;
// these words do once the phrase has its noun — « à feu moyen », « dans un poêlon »,
// « et une pincée » — but « en » ends only a phrase with no « de » (« 1 brocoli en
// fleurons ») so « sauce soya réduite en sodium » survives.
const STOP = /^(?:à|a|au|aux|dans|pour|puis|jusqu|sur|avec|sans|pendant|until|in|into|over|with|for|then|to|on)$/i

function takePhrase(text: string, start: number): string | null {
  // quantity [unit] [(parenthetical)] [de|d'|of] noun-run
  const head = new RegExp(String.raw`^${QTY}\s*(?:${UNIT}\.?\s*)?(?:\([^)]*\)\s*)?`, 'iu')
  const rest = text.slice(start)
  const h = rest.match(head)
  if (!h) return null
  let i = h[0].length
  const hasUnit = new RegExp(String.raw`^${QTY}\s*${UNIT}`, 'iu').test(rest)
  // « de » / « d' » / « of » glue the noun on
  const glue = rest.slice(i).match(/^(de\s+|d['’]\s*|of\s+|du\s+|des\s+)/i)
  const hasDe = !!glue
  if (glue) i += glue[0].length
  const words: string[] = []
  const tail = rest.slice(i)
  // Walk words until a stop; punctuation ends it.
  const re = /([^\s.,;:!?()]+)([\s]*)([.,;:!?]?)/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(tail))) {
    const w = m[1]
    if (!w) break
    if (words.length && (STOP.test(w) || w.toLowerCase() === 'et' || w.toLowerCase() === 'and')) break
    if (words.length && !hasDe && w.toLowerCase() === 'en') break
    words.push(w)
    if (m[3]) break // the word carried the phrase's closing punctuation
    if (words.length >= 9) break
  }
  if (!words.length) return null
  if (NOT_FOOD.test(words[0])) return null
  if (!hasUnit && !hasDe && words.length > 3) words.length = 3
  const phrase = (rest.slice(0, i) + words.join(' ')).replace(/\s+/g, ' ').trim()
  return phrase
}

export function ingredientsFromMethod(steps: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const start = new RegExp(String.raw`(?<![\p{L}\d/,.])${QTY}(?=\s|\d|[½¼¾⅓⅔]|$)`, 'giu')
  for (const step of steps) {
    if (step.startsWith('## ')) continue
    // Parenthetical spans are part of a phrase that starts before them; a quantity
    // INSIDE one (« (1 c. à soupe) ») is never a phrase of its own.
    const inParen: [number, number][] = []
    for (const p of step.matchAll(/\([^)]*\)/g)) inParen.push([p.index!, p.index! + p[0].length])
    let consumedTo = 0
    for (const m of step.matchAll(start)) {
      const at = m.index!
      if (at < consumedTo) continue
      if (inParen.some(([a, b]) => at > a && at < b)) continue
      // A spelled article (« une », « a ») only counts before a unit: « une pincée de »
      // yes, « une grande poêle » / « a pan » no.
      if (/^[a-zà-ÿ]/i.test(m[0]) && !new RegExp(String.raw`^${QTY}\s+${UNIT}`, 'iu').test(step.slice(at))) continue
      const phrase = takePhrase(step, at)
      if (!phrase) continue
      consumedTo = at + phrase.length
      const k = fold(phrase)
      if (!seen.has(k)) {
        seen.add(k)
        out.push(phrase)
      }
    }
  }
  return out
}

// The whole repair, for a read that has ingredients, steps, servings and times.
export function repairRecipeRead<
  R extends { ingredients: string[]; steps: string[]; servings: number | null; times: { prep: number | null; cook: number | null; total: number | null } },
>(r: R): R {
  const ing = salvageFieldLines(r.ingredients)
  const st = salvageFieldLines(r.steps)
  const servings = r.servings ?? ing.servings ?? st.servings
  const times = { ...r.times, prep: r.times.prep ?? ing.prep ?? st.prep, cook: r.times.cook ?? ing.cook ?? st.cook }
  let ingredients = ing.lines
  const steps = st.lines
  if (steps.length && (ingredients.length === 0 || ingredientsAreMethod(ingredients, steps))) {
    const lifted = ingredientsFromMethod(steps)
    // Only replace when the method actually yields a list; an honest empty beats the
    // method copied twice.
    if (lifted.length) ingredients = lifted
    else if (ingredients.length) ingredients = []
  }
  return { ...r, ingredients, steps, servings, times }
}
