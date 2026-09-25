// Repairs for a recipe READ (photo or pasted text) whose structure came back wrong,
// even though the words were read right. Pure, so every rule is tested on the real
// card that broke it (recipeRepair.test.ts — Marc's « Brocoli sauté au miel et au
// sésame », 2026-09-24, read six ways).
//
// What that one card produced, across the vision model's replies:
//
// 0. LEAKED JSON. Asked for JSON and cut off by max_tokens, the reply had no closing
//    brace, so the prose fallback read the raw JSON lines as text: the title became
//    `{"title": "Brocoli…",` and every line kept its quotes and trailing comma.
//    A line can be un-quoted without harm, and a `"key": [` line is a heading.
// 1. FIELD NAMES LEAKED AS LINES. « Servings », « 4 », « PrepMin », « 5 », « CookMin »,
//    « 10 » as six INGREDIENTS. A line that is only a field name or only a number is
//    never an ingredient or a step; the number after a field name is that field's
//    value, kept when the real field is empty.
// 2. THE FOOTER AS STEPS. « Donne 4 portions. » and « Cette recette se conserve 4 jours
//    au réfrigérateur ou 3 mois au congélateur. » are META: the yield goes to servings,
//    the keeping note is not an instruction.
// 3. THE METHOD AS INGREDIENTS. A paragraph card (magazine insert, grocery-store card)
//    has no ingredient list: the quantities live inside the method. The reader then
//    either copies the METHOD into the ingredients (steps empty, or the footer), or
//    leaves them empty. Either way the ingredients can be taken out of the method
//    WORD FOR WORD — each measured phrase, exactly as printed — which keeps the
//    faithful-first promise (nothing rephrased, nothing invented). A duration
//    (« 2 minutes »), a yield (« 4 portions ») or a keeping time (« 3 mois ») is not
//    an ingredient.

// ── 0. Leaked JSON ───────────────────────────────────────────────────────────────

// One array item or scalar the model emitted as JSON: `"Cuire 2 minutes.",` → the
// text. Conservative: only a quote at the very start AND/OR very end goes (a line that
// merely CONTAINS quotes — 1 tasse de « sucre » — is untouched).
export function unquoteLine(line: string): string {
  let s = line.trim()
  if (s.length >= 2 && s.startsWith('"') && /"(,)?$/.test(s)) s = s.slice(1).replace(/",?$/, '')
  else if (/",$/.test(s)) s = s.replace(/",$/, '')
  else if (/^"[^"]*$/.test(s)) s = s.slice(1)
  else if (/^[^"]*"$/.test(s)) s = s.slice(0, -1)
  return s.replace(/\\"/g, '"').trim()
}

// A title that is a whole JSON line: `{"title": "Brocoli sauté", ` → « Brocoli sauté ».
export function unquoteTitle(title: string | null): string | null {
  if (!title) return title
  const m = title.trim().match(/^\{?\s*"(?:title|titre)"\s*:\s*"(.*?)"\s*,?\s*\}?$/i)
  return unquoteLine(m ? m[1] : title) || null
}

// A transcript's PREAMBLE: the lines a model puts before the text it was asked to copy
// (« Transcription du texte de l'image », « Texte », « Here is the transcription: »).
// Seen live the day the transcriber shipped: the label became the recipe's title and
// the real title slid into the steps. Only the FIRST few lines are judged, and only a
// line that is nothing but such a label goes — « Texte de grand-maman » stays.
const PREAMBLE_LINE =
  /^(?:(?:voici|here\s+is|here'?s|below\s+is)\b.*|.*\btranscri(?:ption|t|bed)\b.*|(?:texte|text|contenu|content|image|recette|recipe|ocr)(?:\s+(?:de|of)\s+(?:l['’])?image)?\s*:?)$/i
export function stripTranscriptPreamble(text: string): string {
  const lines = text.split(/\r?\n/)
  let i = 0
  let judged = 0
  while (i < lines.length && judged < 4) {
    const l = lines[i].trim()
    if (!l) {
      i++
      continue
    }
    judged++
    if (l.length <= 80 && PREAMBLE_LINE.test(l)) {
      i++
      continue
    }
    break
  }
  return lines.slice(i).join('\n')
}

const looksLikeJsonLines = (text: string) => /^\s*[{[]?\s*"[A-Za-z_]+"\s*:/m.test(text) || /^\s*"[^"\n]+",\s*$/m.test(text)

// A transcript that is really JSON (or its broken remains) → plain text the paste
// parser reads: a `"key": [` line becomes the heading that key stands for, a scalar
// becomes its meta line, brackets and braces vanish, and every item is un-quoted.
// A transcript with no JSON in it is returned untouched.
export function jsonFragmentsToText(text: string): string {
  if (!looksLikeJsonLines(text)) return text
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || /^[{}[\],]+$/.test(l)) continue
    const kv = l.match(/^\{?\s*"([A-Za-z_]+)"\s*:\s*(.*)$/)
    if (kv) {
      const key = kv[1].toLowerCase()
      const val = kv[2].trim().replace(/,$/, '').trim()
      if (val === '[' || val === '[]' || val === '{') {
        if (/^ingr[ée]dients?$/.test(key)) out.push('Ingrédients')
        else if (/^(steps?|instructions?|method|directions?|[ée]tapes?|pr[ée]paration)$/.test(key)) out.push('Préparation')
        continue
      }
      const v = unquoteLine(val.replace(/[\]}]+$/, ''))
      if (!v || v === 'null') continue
      if (/^(title|titre|name|nom)$/.test(key)) out.push(v)
      else if (/^(servings?|portions?|yield|rendement)$/.test(key) && /^\d+$/.test(v)) out.push(`${v} portions`)
      else if (/^prep/.test(key) && /^\d+$/.test(v)) out.push(`Préparation : ${v} min`)
      else if (/^cook|cuisson/.test(key) && /^\d+$/.test(v)) out.push(`Cuisson : ${v} min`)
      else if (/^total/.test(key) && /^\d+$/.test(v)) out.push(`Total : ${v} min`)
      continue
    }
    out.push(unquoteLine(l.replace(/^[\[{]+|[\]}]+,?$/g, '')))
  }
  return out.join('\n')
}

// ── 1. Field names as lines ──────────────────────────────────────────────────────

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

// ── 2. The footer: yield and keeping notes ───────────────────────────────────────

const PORTION = String.raw`(?:portions?|personnes?|servings?|parts?|people|convives|pers\.?)`
// A line that is ONLY a yield: « Donne 4 portions. », « Pour 4 personnes », « 4 portions »,
// « Serves 4 », « Rendement : 6 portions ». Anchored at both ends, so « Diviser en 4
// portions et servir » (a real step) never matches.
const YIELD_LINE = new RegExp(
  String.raw`^(?:(?:donne|rendement|yield|serves?|makes|pour)\s*:?\s*)?(\d{1,2})(?:\s*[àa-]\s*\d{1,2})?\s*${PORTION}?\s*\.?$|^(?:donne|rendement|yield|serves?|makes|pour)\s*:?\s*(\d{1,2})(?:\s*[àa-]\s*\d{1,2})?\s*${PORTION}?\s*\.?$`,
  'i',
)
// A keeping note: how long it keeps, and where. Starts the way those sentences start.
const KEEPING_LINE =
  /^(?:(?:cette|ces|la|le|les)\s+\w+\s+)?(?:se\s+(?:conserve|garde)|peut\s+se\s+conserver|conserver|se\s+cong[èe]le|keeps?\b|will\s+keep|store\b|can\s+be\s+(?:stored|kept|frozen)|refrigerate\b|freeze\b)/i

function oneMetaSentence(s: string): { meta: boolean; servings: number | null } {
  const y = s.match(YIELD_LINE)
  if (y && /\d/.test(s) && new RegExp(PORTION, 'i').test(s)) return { meta: true, servings: parseInt(y[1] ?? y[2], 10) || null }
  if (y && /^(?:donne|rendement|yield|serves?|makes)\b/i.test(s)) return { meta: true, servings: parseInt(y[1] ?? y[2], 10) || null }
  if (KEEPING_LINE.test(s)) {
    if (/\b(?:jours?|days?|semaines?|weeks?|mois|months?|heures?|hours?|r[ée]frig[ée]rateur|cong[ée]lateur|frigo|fridge|freezer|refrigerator)\b/i.test(s))
      return { meta: true, servings: null }
    // « Se congèle très bien. » / « Freezes well. » — the verb alone says it, when short.
    if (s.length <= 60 && /^(?:se\s+(?:conserve|garde|cong[èe]le)|peut\s+se\s+conserver|keeps?\b|will\s+keep|freezes?\s+well)/i.test(s))
      return { meta: true, servings: null }
  }
  return { meta: false, servings: null }
}

export function metaLine(line: string): { meta: boolean; servings: number | null } {
  const s = line.trim()
  if (!s || s.startsWith('## ')) return { meta: false, servings: null }
  // « Donne 6 portions. Se congèle très bien. » — a footer of several sentences is meta
  // when EVERY sentence is; one real instruction among them keeps the line.
  const sentences = s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖŒ«"(\d])/).map((t) => t.trim()).filter(Boolean)
  if (sentences.length > 1) {
    const parts = sentences.map(oneMetaSentence)
    if (parts.every((p) => p.meta)) return { meta: true, servings: parts.find((p) => p.servings != null)?.servings ?? null }
    return { meta: false, servings: null }
  }
  return oneMetaSentence(s)
}

// ── 3. Method vs list ────────────────────────────────────────────────────────────

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

// An instruction, as opposed to an ingredient line: a sentence (ends on a period, five
// words or more) or a long line. Judged on the SET, never one line at a time — « Cuire
// 2 minutes. » is three words, and travels with its neighbours.
export function looksLikeMethodLine(line: string): boolean {
  const s = line.trim()
  const words = s.split(/\s+/).length
  return (/[.!?]$/.test(s) && words >= 5) || s.length > 90
}

// ── Measured phrases, lifted word for word out of a method ───────────────────────
// A quantity: digits (« 7,5 », « 1/2 », « ½ ») or a spelled-out article/number.
const QTY = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔]|une?|deux|trois|quatre|cinq|six|a|an|one|two|three|four|five|six)`
// Units that make the next words an INGREDIENT (whole words only — `g` must not be
// the first letter of « grand »), as opposed to a time, a temperature or a yield.
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

// ── The whole repair ─────────────────────────────────────────────────────────────

export function repairRecipeRead<
  R extends {
    title: string | null
    ingredients: string[]
    steps: string[]
    servings: number | null
    times: { prep: number | null; cook: number | null; total: number | null }
  },
>(r: R): R {
  const title = unquoteTitle(r.title)
  // 0 + 1: un-quote every line, then drop field names and bare numbers.
  const ing = salvageFieldLines(r.ingredients.map(unquoteLine).filter(Boolean))
  const st = salvageFieldLines(r.steps.map(unquoteLine).filter(Boolean))
  let servings = r.servings ?? ing.servings ?? st.servings
  const times = { ...r.times, prep: r.times.prep ?? ing.prep ?? st.prep, cook: r.times.cook ?? ing.cook ?? st.cook }
  // 2: the footer out of both lists; its yield is the servings when none was read.
  const keep = (lines: string[]) =>
    lines.filter((l) => {
      const m = metaLine(l)
      if (m.meta && m.servings != null) servings ??= m.servings
      return !m.meta
    })
  let ingredients = keep(ing.lines)
  let steps = keep(st.lines)
  // 3a: no steps left, and the « ingredients » read like a method → they ARE the method.
  const realIng = ingredients.filter((l) => !l.startsWith('## '))
  if (!steps.length && realIng.length && realIng.filter(looksLikeMethodLine).length * 10 >= realIng.length * 6) {
    steps = ingredients
    ingredients = []
  }
  // 3b: a method with no list (or the list is the method) → lift the ingredients out
  // of it, word for word.
  if (steps.length && (ingredients.length === 0 || ingredientsAreMethod(ingredients, steps))) {
    const lifted = ingredientsFromMethod(steps)
    // Only replace when the method actually yields a list; an honest empty beats the
    // method copied twice.
    if (lifted.length) ingredients = lifted
    else if (ingredients.length) ingredients = []
  }
  return { ...r, title, ingredients, steps, servings, times }
}
