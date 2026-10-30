import { AiBudgetError, runModel } from './runModel'
// The one essential AI feature: classify a free-text capture into a structured
// intent, then the handler routes it. Workers AI, in-network (Loi 25), free
// Neuron tier. One inference per capture — never on a render loop.
//
// Graceful degrade: with env.AI unset (or local dev without `wrangler login`),
// classifyCapture returns { type: 'note', degraded: true } so the capture is
// never lost and the UI can offer a manual type-picker.

import type { Env } from './env'
import { stripAiCommentary } from './recipeImport'

// AI output language. Mirrors the UI locale (src/i18n.ts `Lang`). The router and
// meal suggester pick their prompt by this so the household sees AI text in the
// language it's actually using, not a hardcoded one.
export type Lang = 'fr' | 'en'

// Resolve the language for an AI call: the SPA's active locale (X-Lang header,
// read from localStorage `babillard-lang`) wins; else the deploy-wide
// DEFAULT_LANG; else FR (the Québec default this product is built around).
export function resolveLang(env: Env, request: Request): Lang {
  const header = request.headers.get('X-Lang')
  if (header === 'fr' || header === 'en') return header
  const def = env.DEFAULT_LANG
  if (def === 'fr' || def === 'en') return def
  return 'fr'
}

type IntentType = 'event' | 'task' | 'list-item' | 'pantry-low' | 'meal' | 'leftover' | 'upkeep' | 'note'

export interface Intent {
  type: IntentType
  // Loose payload — each route validates the fields it needs. Kept permissive
  // because even a strong model's JSON is good but not a contract.
  payload: {
    title?: string
    item?: string
    text?: string
    when?: string // natural-language date/time echo, e.g. "mardi 15h"
    slot?: string // meal slot
    person?: string // member name hint
    // upkeep only — a recurrence hint ("chaque automne", "aux 3 mois"). The route
    // re-validates through normalizeRecur / parseRecurPhrase; never trusted raw.
    recur?: { freq?: string; interval?: number }
    season?: string // season word echo ("automne") → the route derives the anchor
  }
  degraded?: boolean
}

// Text model for every capture/recipe/recap/suggestion call. NOTE: the original
// '@cf/meta/llama-3.1-8b-instruct' was RETIRED by Cloudflare on 2026-05-30, which
// silently broke every text AI feature (AI.run threw → graceful-degrade swallowed
// it). Moved to the current recommended instruct model. Keep this in sync with the
// Workers AI changelog when models are deprecated.
//
// GOTCHA (broke suggest-meal after the model swap): this fp8-fast model returns
// `response` ALREADY PARSED as an object/array when its output is valid JSON,
// whereas the old 8B model returned a raw string. So extractJson/extractStringArray
// must accept both shapes — they do. Don't reintroduce a `String(res.response)`
// assumption or every JSON-returning feature silently 503s again.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// Few-shot, JSON-only, one prompt per language. The FR register hints
// ("souper", "vidanges", "pus de") are deliberately Québécois so the router
// reads local phrasing the way the household actually talks; the EN prompt
// mirrors the same six types and payload shape.
const SYSTEM: Record<Lang, string> = {
  fr: `Tu classes une note de famille en JSON. Réponds UNIQUEMENT avec du JSON valide, rien d'autre.
Types possibles: "event" (rendez-vous, activité, sortie, fête, anniversaire — avec une date/heure), "task" (corvée, tâche, ménage, « à faire »), "list-item" (article à acheter, épicerie, commission — « ajoute à la liste »), "pantry-low" (un aliment qui manque, achève ou qu'on n'a PLUS — « pus de », « manque de », « à racheter »), "meal" (un repas à cuisiner — souper, déjeuner, dîner, collation, dessert), "leftover" (des RESTES d'un plat déjà cuisiné qu'il faut finir — « il reste », « des restes de », « un restant de »), "upkeep" (un ENTRETIEN de la maison/auto qui REVIENT — « chaque automne », « aux 3 mois », « chaque année » : gouttières, filtre, pneus), "note" (rappel, pense-bête, le reste).
Distinction importante: « pus de lait » = pantry-low (on n'en a plus, à acheter); « il reste du pâté chinois » = leftover (on en a encore, à manger); « souper tacos vendredi » = meal (à cuisiner).
Format: {"type": <type>, "payload": {"title"?: string, "item"?: string, "text"?: string, "when"?: string, "slot"?: string, "person"?: string, "recur"?: {"freq": "daily"|"weekly"|"monthly"|"yearly", "interval"?: number}, "season"?: string}}.
"recur"/"season" servent seulement à "upkeep" : « aux 3 mois » -> {"freq":"monthly","interval":3}; « chaque automne » -> {"freq":"yearly"} + "season":"automne".
Le champ "person" est le NOM de la personne CONCERNÉE (« pour Léa », « le rendez-vous de Marc », « c'est papa qui... »), pas qui parle. Mets-y le prénom seul. "when" accepte aussi « après-demain », « le 20 », « 20 juin », « lundi prochain ».
Exemples:
"dentiste mardi 15h" -> {"type":"event","payload":{"title":"dentiste","when":"mardi 15h"}}
"rendez-vous dentiste pour Léa mardi 15h" -> {"type":"event","payload":{"title":"dentiste","when":"mardi 15h","person":"Léa"}}
"soccer de Marc le 20 juin" -> {"type":"event","payload":{"title":"soccer","when":"20 juin","person":"Marc"}}
"Léa sort les vidanges" -> {"type":"task","payload":{"title":"sortir les vidanges","person":"Léa"}}
"ajoute du lait" -> {"type":"list-item","payload":{"item":"lait"}}
"pus de café" -> {"type":"pantry-low","payload":{"item":"café"}}
"souper spaghetti jeudi" -> {"type":"meal","payload":{"title":"spaghetti","slot":"supper","when":"jeudi"}}
"souper tacos vendredi, c'est papa qui cuisine" -> {"type":"meal","payload":{"title":"tacos","slot":"supper","when":"vendredi","person":"papa"}}
"gâteau au chocolat en dessert samedi" -> {"type":"meal","payload":{"title":"gâteau au chocolat","slot":"dessert","when":"samedi"}}
"il reste de la lasagne" -> {"type":"leftover","payload":{"title":"lasagne"}}
"des restes de poulet à finir" -> {"type":"leftover","payload":{"title":"poulet"}}
"nettoyer les gouttières chaque automne" -> {"type":"upkeep","payload":{"title":"nettoyer les gouttières","recur":{"freq":"yearly"},"season":"automne"}}
"changer le filtre de la fournaise aux 3 mois" -> {"type":"upkeep","payload":{"title":"changer le filtre de la fournaise","recur":{"freq":"monthly","interval":3}}}
"penser à appeler maman" -> {"type":"note","payload":{"text":"appeler maman"}}`,
  en: `You sort a family note into JSON. Reply ONLY with valid JSON, nothing else.
Possible types: "event" (appointment, activity, outing, party, birthday — with a date/time), "task" (a chore, task, cleanup, "to do"), "list-item" (something to buy, groceries, errand — "add to the list"), "pantry-low" (a food that's out, almost gone or you have NO more — "out of", "running low", "need more"), "meal" (a meal to cook — supper, breakfast, lunch, snack, dessert), "leftover" (LEFTOVERS from an already-cooked dish to finish — "there's leftover", "some X left", "rest of the"), "upkeep" (RECURRING home/car maintenance — "every fall", "every 3 months", "every year": gutters, filter, tires), "note" (reminder, memo, everything else).
Important distinction: "out of milk" = pantry-low (none left, to buy); "there's leftover shepherd's pie" = leftover (still have some, to eat); "tacos for supper friday" = meal (to cook).
Format: {"type": <type>, "payload": {"title"?: string, "item"?: string, "text"?: string, "when"?: string, "slot"?: string, "person"?: string, "recur"?: {"freq": "daily"|"weekly"|"monthly"|"yearly", "interval"?: number}, "season"?: string}}.
"recur"/"season" are for "upkeep" only: "every 3 months" -> {"freq":"monthly","interval":3}; "every fall" -> {"freq":"yearly"} + "season":"fall".
The "person" field is the NAME of the person the note is ABOUT ("for Léa", "Marc's appointment", "dad is..."), not who is speaking. Use the first name alone. "when" also accepts "day after tomorrow", "the 20th", "june 20", "next monday".
Examples:
"dentist tuesday 3pm" -> {"type":"event","payload":{"title":"dentist","when":"tuesday 3pm"}}
"dentist appointment for Léa tuesday 3pm" -> {"type":"event","payload":{"title":"dentist","when":"tuesday 3pm","person":"Léa"}}
"Marc's soccer on june 20" -> {"type":"event","payload":{"title":"soccer","when":"june 20","person":"Marc"}}
"Léa takes out the trash" -> {"type":"task","payload":{"title":"take out the trash","person":"Léa"}}
"add milk" -> {"type":"list-item","payload":{"item":"milk"}}
"out of coffee" -> {"type":"pantry-low","payload":{"item":"coffee"}}
"supper spaghetti thursday" -> {"type":"meal","payload":{"title":"spaghetti","slot":"supper","when":"thursday"}}
"tacos for supper friday, dad is cooking" -> {"type":"meal","payload":{"title":"tacos","slot":"supper","when":"friday","person":"dad"}}
"chocolate cake for dessert saturday" -> {"type":"meal","payload":{"title":"chocolate cake","slot":"dessert","when":"saturday"}}
"there's leftover lasagna" -> {"type":"leftover","payload":{"title":"lasagna"}}
"leftover chicken to finish" -> {"type":"leftover","payload":{"title":"chicken"}}
"clean the gutters every fall" -> {"type":"upkeep","payload":{"title":"clean the gutters","recur":{"freq":"yearly"},"season":"fall"}}
"change the furnace filter every 3 months" -> {"type":"upkeep","payload":{"title":"change the furnace filter","recur":{"freq":"monthly","interval":3}}}
"remember to call mom" -> {"type":"note","payload":{"text":"call mom"}}`,
}

const VALID: ReadonlySet<IntentType> = new Set([
  'event',
  'task',
  'list-item',
  'pantry-low',
  'meal',
  'leftover',
  'upkeep',
  'note',
])

// A per-request sink so a handler can learn that an AI call failed even though the
// helper degraded gracefully and returned a safe fallback. The handler passes a
// fresh object, reads `.error` after the call, and (when set) signals the client
// via the X-AI-Error header → the UI pops an "AI failed" notice the user can
// acknowledge into the persistent log. Optional: callers that don't care omit it.
export interface AiReport {
  error: string | null
}

// Surface an AI failure instead of letting the graceful-degrade catch swallow it
// in silence. A retired model, a Workers AI outage, or a malformed call now shows
// up in `wrangler tail` and the Worker's dashboard logs with the failing function
// named — so the next breakage is visible in minutes, not after two weeks of
// "the AI features seem broken." The caller STILL degrades; this only observes,
// and returns the human message so the caller can also stash it on an AiReport.
// (This exists because '@cf/meta/llama-3.1-8b-instruct' was retired 2026-05-30 and
// every feature failed quietly — see the MODEL note above.)
export function logAi(where: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[ai] ${where} failed:`, msg)
  return msg
}

// The model sometimes DOUBLE-escapes non-ASCII inside its JSON string — it emits
// `"La liste d'\\u00e9picerie"`, so a correct JSON.parse hands back the six literal
// characters `é` instead of `é`. The escapes then reach the screen verbatim
// ("la liste d'épicerie") and the read-aloud voice spells them out. Undo what
// survived the parse: \uXXXX (incl. surrogate pairs), the standard short escapes,
// and a trailing `\\` -> `\`. Order matters — resolve \uXXXX before collapsing
// backslashes, and treat `\\u00e9` (an escaped backslash then a literal "u00e9")
// as a real backslash, not a code point.
export function decodeStrayEscapes(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|\\|["'/]|[nrtbf])/g, (_, esc: string) => {
    if (esc === '\\') return '\\'
    if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16))
    switch (esc) {
      case 'n':
        return '\n'
      case 'r':
        return '\r'
      case 't':
        return '\t'
      case 'b':
      case 'f':
        return ''
      default:
        return esc // \" \' \/
    }
  })
}

function extractJson(raw: unknown): unknown {
  // Newer Workers AI models (e.g. llama-3.3-70b-fp8-fast) hand back `response`
  // ALREADY PARSED as an object/array when the model emitted valid JSON; the old
  // 8B model returned a raw string. Accept the parsed shape directly — otherwise
  // the string-only path below silently yields null and every AI feature 503s.
  if (raw !== null && typeof raw === 'object') return raw
  if (typeof raw !== 'string') return null
  // Models sometimes wrap JSON in prose or a ```json fence. Grab the first
  // balanced-looking object rather than trusting the whole string.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0) return null
  if (end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1))
    } catch {
      /* cut short or malformed — try the salvage below */
    }
  }
  // A reply cut by max_tokens has no closing brace: keep what it finished.
  const fixed = salvageTruncatedJson(raw)
  if (!fixed) return null
  try {
    return JSON.parse(fixed)
  } catch {
    return null
  }
}

// A JSON reply cut off mid-way (max_tokens ran out) → the longest valid prefix,
// closed. Scans from the first `{` tracking strings, escapes and the open brackets;
// cuts after the last COMPLETE value (a half-written string or number is dropped),
// strips a dangling `,` / `:` key, and closes every bracket still open. A long recipe
// used to lose the WHOLE read this way (« Rien trouvé »); now it loses only the step
// the model was writing when it stopped. Null when there's no object to salvage.
export function salvageTruncatedJson(raw: string): string | null {
  const start = raw.indexOf('{')
  if (start < 0) return null
  const stack: string[] = []
  let inStr = false
  let esc = false
  let strStart = 0
  // Where the text could be cut while staying valid, and the stack at that point.
  let safe = -1
  let safeStack: string[] = []
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') {
        inStr = false
        // A closed string is a complete value in an array, or after a `:` in an
        // object; anywhere else it is an object KEY, not a value on its own.
        const isValue = stack[stack.length - 1] === ']' || /:\s*$/.test(raw.slice(start, strStart))
        if (isValue) {
          safe = i + 1
          safeStack = [...stack]
        }
      }
      continue
    }
    if (ch === '"') {
      inStr = true
      strStart = i
    } else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']')
      // An empty container is valid as soon as it opens.
      safe = i + 1
      safeStack = [...stack]
    } else if (ch === '}' || ch === ']') {
      stack.pop()
      safe = i + 1
      safeStack = [...stack]
      if (!stack.length) return raw.slice(start, i + 1) // complete after all
    } else if (/[\d.eE+\-truefalsn]/.test(ch)) {
      // Inside a bare literal (number / true / false / null): complete only when the
      // next char ends it — a literal cut mid-way is dropped with the rest.
      const next = raw[i + 1]
      if (next !== undefined && /[\s,\]}]/.test(next)) {
        safe = i + 1
        safeStack = [...stack]
      }
    }
  }
  if (safe < 0) return null
  const body = raw.slice(start, safe).replace(/[\s,]+$/, '')
  return body + safeStack.reverse().join('')
}

export async function classifyCapture(
  env: Env,
  text: string,
  lang: Lang = 'fr',
  report?: AiReport,
): Promise<Intent> {
  const trimmed = text.trim()
  if (!env.AI) {
    // No binding — keep the words, let the UI ask what kind it was.
    return { type: 'note', payload: { text: trimmed }, degraded: true }
  }
  try {
    const res = (await runModel(env, MODEL, {
      messages: [
        { role: 'system', content: SYSTEM[lang] },
        { role: 'user', content: trimmed },
      ],
      max_tokens: 200,
    })) as { response?: unknown }

    const parsed = extractJson(res.response) as {
      type?: string
      payload?: Intent['payload']
    } | null

    if (!parsed || !parsed.type || !VALID.has(parsed.type as IntentType)) {
      // Router uncertain -> note. We never drop a capture (PRD: note-fallback).
      return { type: 'note', payload: { text: trimmed } }
    }
    return { type: parsed.type as IntentType, payload: parsed.payload ?? { text: trimmed } }
  } catch (err) {
    // Workers AI hiccup is non-essential to capturing the words; degrade.
    if (report) report.error = logAi('classifyCapture', err)
    return { type: 'note', payload: { text: trimmed }, degraded: true }
  }
}

// Recipe drafter (recipe book helper). Given a dish title, draft a simple family
// recipe: a short ingredient list + ordered prep steps, IN ONE call. The cook
// edits freely afterward — this just seeds a blank card so nobody faces an empty
// form. Returns { ingredients: [], steps: [] } on no-AI or any failure, so the
// caller just opens an empty editor (graceful degrade).
export interface RecipeDraft {
  ingredients: string[]
  steps: string[]
}
export async function draftRecipe(
  env: Env,
  title: string,
  lang: Lang = 'fr',
  report?: AiReport,
  // Optional "ingredients you already have, use them where they fit" context —
  // passed by the « vide-frigo » flow so a generated recipe actually leans on what's
  // about to spoil, not a generic version. recipe-draft passes nothing → the prompt
  // is byte-for-byte unchanged.
  have: string[] = [],
): Promise<RecipeDraft> {
  const dish = title.trim()
  if (!env.AI || !dish) return { ingredients: [], steps: [] }
  const haveList = have.map((h) => h.trim()).filter(Boolean)
  const haveLine =
    haveList.length === 0
      ? ''
      : lang === 'en'
        ? `\nLean on these ingredients on hand where they sensibly fit (the goal is to use them up): ${haveList.join(', ')}.`
        : `\nAppuie-toi sur ces ingrédients déjà là où c'est logique (le but est de les écouler) : ${haveList.join(', ')}.`
  const prompt =
    (lang === 'en'
      ? `Draft a simple family recipe for "${dish}".
Reply ONLY with JSON: {"ingredients": string[], "steps": string[]}.
Ingredients: short lines with rough quantities, at most 12. Steps: short imperative sentences, at most 8.
Example: {"ingredients":["400 g pasta","1 jar tomato sauce","500 g ground beef"],"steps":["Boil the pasta.","Brown the beef.","Add sauce and simmer."]}.`
      : `Rédige une recette familiale simple pour « ${dish} » (français québécois).
Réponds UNIQUEMENT avec du JSON : {"ingredients": string[], "steps": string[]}.
Ingrédients : lignes courtes avec quantités approximatives, 12 au maximum. Étapes : phrases impératives courtes, 8 au maximum.
Exemple : {"ingredients":["400 g de pâtes","1 pot de sauce tomate","500 g de bœuf haché"],"steps":["Faire bouillir les pâtes.","Faire revenir le bœuf.","Ajouter la sauce et laisser mijoter."]}.`) +
    haveLine
  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    })) as { response?: unknown }
    const parsed = extractJson(res.response) as { ingredients?: unknown; steps?: unknown } | null
    if (!parsed) return { ingredients: [], steps: [] }
    return { ingredients: cleanLines(parsed.ingredients, 12), steps: cleanLines(parsed.steps, 8) }
  } catch (err) {
    if (report) report.error = logAi('draftRecipe', err)
    return { ingredients: [], steps: [] }
  }
}

// THE MODEL CHOOSES LINES, IT NEVER WRITES THEM (B, 2026-10-27). Until today the text
// model was asked to « organise WITHOUT inventing » a pasted or OCR'd recipe and answered
// with the recipe REWRITTEN — and a generative pass rewrites: it reordered « Dans un
// grand poêlon, chauffer… », converted « 225 g (1/2 lb) » into « (2 tasses) », titled an
// English recipe in French. A number check flagged some of it after the fact.
//
// Now the text goes to the model NUMBERED, one line per number, and the model answers
// with line NUMBERS only: which line is the title, which are the ingredients, the steps,
// the notes, which label line heads a part. Every word of the draft is then copied from
// the source by index — the model has no way to change one. It is also ~50× cheaper:
// output tokens dominate the price, and a list of integers is short.
//
// JSON Mode (`response_format: json_schema`) keeps the reply to that shape; the model
// may refuse it (« JSON Mode couldn't be met »), and then ONE retry goes without it and
// the reply is parsed leniently. Every index is validated (an integer, in range, used
// once) before a line is taken.

export const SELECTION_MODEL = `${MODEL} · sélection`

export interface LineSelection {
  title: number | null
  servings: number | null
  prep: number | null
  cook: number | null
  ingredients: number[]
  steps: number[]
  notes: number[]
  // A label line (« Sauce », « Pour le glaçage : ») that heads the selected lines from
  // `before` on — `before` is the index of the part's first line.
  ingredientSections: { line: number; before: number }[]
  stepSections: { line: number; before: number }[]
}

const SECTIONS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { line: { type: 'integer' }, before: { type: 'integer' } },
    required: ['line', 'before'],
  },
}
const INDEXES_SCHEMA = { type: 'array', items: { type: 'integer' } }
const MAYBE_INDEX = { type: ['integer', 'null'] }
export const SELECTION_SCHEMA = {
  type: 'object',
  properties: {
    title: MAYBE_INDEX,
    servings: MAYBE_INDEX,
    prep: MAYBE_INDEX,
    cook: MAYBE_INDEX,
    ingredients: INDEXES_SCHEMA,
    steps: INDEXES_SCHEMA,
    notes: INDEXES_SCHEMA,
    ingredientSections: SECTIONS_SCHEMA,
    stepSections: SECTIONS_SCHEMA,
  },
  required: ['title', 'servings', 'prep', 'cook', 'ingredients', 'steps', 'notes', 'ingredientSections', 'stepSections'],
}

// The source as the model sees it: blank lines out, each line capped, at most 400 (the
// recipe window already stops at the page's footer). A RUN-ON text is segmented first:
// the model may only pick whole lines, so a paste with no line breaks (a recipe typed
// in one go, a message, a one-line OCR) gave it ONE line to choose from and came back
// « Rien trouvé » (prod, step 6, 2026-10-27). Segments are cut at sentence ends, before
// an amount that opens an ingredient (« … d'eau 30 ml de beurre »), and where a
// capitalised verb follows a lowercase word inside an amount-led segment (« de lait
// Faire bouillir… »; « farine Robin Hood » stays, its next word is capitalised too).
//
// ONLY a run-on text, though (2026-10-30). This used to cut every line over 100 chars,
// and a vision transcript's numbered step — three sentences on one line, as printed —
// came back as three « steps », one per sentence (and a method sentence was cut before
// its « 30 ml »): the sentence-splitting refineSteps had stopped doing three days
// earlier, re-grown one layer up. A text that already has its lines keeps them; the one
// cut still made inside it is a PACKED ingredient line (several amounts, no sentence).
// And a line that opens mid-sentence is rejoined to the line before it first: a step
// printed across two columns (« … Retirer » / « du feu et laisser reposer… ») reaches the
// model as two lines otherwise, and it keeps the capitalised half.
export function selectionLines(text: string): string[] {
  const lines = joinContinuations(
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
  )
  const runOn = lines.length <= 3
  // Whole lines, never cut: the draft is built from THESE by index. The prompt shows the
  // model a capped preview of each (PREVIEW_CHARS) — it only picks numbers.
  return lines.flatMap((l) => (runOn && l.length > 100 ? segmentRunOn(l) : isPackedIngredients(l) ? segmentRunOn(l) : [l])).slice(0, 400)
}
// How much of a line the selection model sees. The line itself is never cut (a step
// reflowed onto one line runs 300+ chars; the cap used to truncate it in the DRAFT,
// 2026-10-30) — a preview is enough to tell an ingredient from a step from a note.
const PREVIEW_CHARS = 240

// A line that is only a continuation of the previous one — starts lowercase, on a word
// that never opens an ingredient, a label or a step (« du feu… », « de sésame
// (facultatif) », « et laisser… »). « pour la sauce », « sel », « en dés » do open lines,
// so they are not in the set. A trailing period the reader put on the first half
// (« Retirer. ») goes: the sentence was not over.
const CONTINUATION_START =
  /^(?:d[eu]|des|d['’]|et|puis|à|au|aux|jusqu['’]|avant|après|afin|pendant|ensuite|and|then|of|until|into|the)(?![\p{L}])/iu
export function joinContinuations(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const prev = out[out.length - 1]
    if (prev && /^\p{Ll}/u.test(line) && CONTINUATION_START.test(line) && !/[:]$/.test(prev)) {
      out[out.length - 1] = `${prev.replace(/\.$/, '')} ${line}`
    } else {
      out.push(line)
    }
  }
  return out
}

// Several ingredients glued on one line (« 500 ml de cassonade 500 ml d'eau 30 ml de
// beurre ») — three or more amount-led pieces and not a sentence.
const AMOUNT_PIECES = 3
function isPackedIngredients(line: string): boolean {
  if (/[.!?]/.test(line)) return false
  return line.split(BEFORE_AMOUNT).filter((p) => AMOUNT_LED.test(p)).length >= AMOUNT_PIECES
}

const AMOUNT_UNIT =
  String.raw`(?:\d+(?:[.,/]\d+)?(?:\s\d\/\d)?|[¼½¾⅓⅔⅛]|une?|deux|trois|quelques)\s?(?:ml|l|g|kg|lb|oz|tasses?|t\.|c\.|cuill[èe]res?|pinc[ée]es?|gousses?|bo[îi]tes?|sachets?|tranches?|branches?|oeufs?|œufs?|oignons?|cups?|tbsp|tsp|pounds?|ounces?|cloves?|cans?|eggs?)(?![a-zà-ÿ])`
const BEFORE_AMOUNT = new RegExp(String.raw`\s+(?=${AMOUNT_UNIT})`, 'i')
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-ZÀ-ÖŒ«"(\d])/
const AMOUNT_LED = new RegExp(String.raw`^${AMOUNT_UNIT}`, 'i')
const VERB_AFTER_WORD = /(?<=[a-zà-ÿ])\s+(?=[A-ZÀ-ÖŒ][a-zà-ÿ]+\s+[a-zà-ÿ])/
export function segmentRunOn(line: string): string[] {
  const out: string[] = []
  for (const sentence of line.split(SENTENCE_END)) {
    for (const piece of sentence.split(BEFORE_AMOUNT)) {
      // Inside an ingredient-led piece, the method may start without any punctuation.
      const parts = AMOUNT_LED.test(piece) ? piece.split(VERB_AFTER_WORD) : [piece]
      for (const p of parts) {
        const s = p.trim()
        if (s.length >= 3) out.push(s)
      }
    }
  }
  return out.length ? out : [line]
}

const SELECTION_TOKENS = 1500
export async function selectRecipeLines(
  env: Env,
  lines: string[],
  lang: Lang = 'fr',
  // The cook's optional guidance (« c'est la 2e recette de la page ») — one short line,
  // quoted into the prompt as THEIR note.
  hint?: string,
  // Why the model did not answer, when it did not (the budget, an error, nothing usable)
  // — surfaced to the cook, who otherwise gets the shape read in silence.
  report?: { attempts?: AiAttempt[] },
): Promise<LineSelection | null> {
  if (!env.AI || !lines.length) return null
  const tried = (reason: AiAttemptReason) => {
    if (report) (report.attempts ??= []).push({ model: MODEL, reason })
  }
  const note = (hint ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const numbered = lines.map((l, i) => `${i}: ${l.slice(0, PREVIEW_CHARS)}`).join('\n')
  const prompt =
    lang === 'en'
      ? `Below is a recipe's text, one numbered line per line ("<number>: <text>"). Pick LINE NUMBERS only — never write any text.
Reply with JSON: {"title": n|null, "servings": n|null, "prep": n|null, "cook": n|null, "ingredients": [n…], "steps": [n…], "notes": [n…], "ingredientSections": [{"line": n, "before": n}…], "stepSections": [{"line": n, "before": n}…]}.
- title: the recipe's name. servings / prep / cook: the line that states the yield / the prep time / the cooking time, or null.
- ingredients: every ingredient line. steps: every line of the method, up to the LAST one. notes: tips, variations, storage notes.
- A short label line like "Sauce" or "For the glaze:" that heads a group of ingredients or steps is a SECTION: {"line": its number, "before": the number of the first line of its group}. It is not itself an ingredient or a step.
- A VARIANT on the page ("For a bowl version", "Garnishes:", "For the sauce:") keeps its ingredient lines in ingredients and its numbered lines in steps, each under its own section — never in notes. notes are tips only.
- Keep page order. A line may appear only once. Leave out menus, ads, comments, other recipes.
${note ? `Cook's note: "${note}"\n` : ''}Text:
${numbered}`
      : `Voici le texte d'une recette, une ligne numérotée par ligne (« <numéro>: <texte> »). Choisis des NUMÉROS DE LIGNE seulement — n'écris jamais de texte.
Réponds en JSON : {"title": n|null, "servings": n|null, "prep": n|null, "cook": n|null, "ingredients": [n…], "steps": [n…], "notes": [n…], "ingredientSections": [{"line": n, "before": n}…], "stepSections": [{"line": n, "before": n}…]}.
- title : le nom de la recette. servings / prep / cook : la ligne qui donne le rendement / le temps de préparation / le temps de cuisson, ou null.
- ingredients : chaque ligne d'ingrédient. steps : chaque ligne de la méthode, jusqu'à la DERNIÈRE. notes : conseils, variantes, conservation.
- Une courte ligne d'étiquette comme « Sauce » ou « Pour le glaçage : » qui coiffe un groupe d'ingrédients ou d'étapes est une SECTION : {"line": son numéro, "before": le numéro de la première ligne de son groupe}. Elle n'est pas elle-même un ingrédient ni une étape.
- Une VARIANTE sur la page (« Pour une version bol », « Garnitures : », « Pour la sauce : ») garde ses lignes d'ingrédients dans ingredients et ses lignes numérotées dans steps, chacune sous sa propre section — jamais dans notes. notes ne contient que des conseils.
- Garde l'ordre de la page. Une ligne n'apparaît qu'une fois. Laisse de côté les menus, publicités, commentaires, autres recettes.
${note ? `Indication du cuisinier : « ${note} »\n` : ''}Texte :
${numbered}`
  const messages = [{ role: 'user', content: prompt }]
  let raw: unknown
  try {
    const res = (await runModel(env, MODEL, {
      messages,
      response_format: { type: 'json_schema', json_schema: SELECTION_SCHEMA },
      // Indices only, but up to 80 ingredients + 60 steps + sections of 3-digit numbers:
      // 600 could cut the JSON, and a cut selection salvages as a SHORTER steps list.
      max_tokens: SELECTION_TOKENS,
      // A selection has one right answer. Sampled, the same page came back with its
      // garnish block one run and without it the next (photo corpus, live, 2026-10-30).
      temperature: 0,
    })) as { response?: unknown }
    raw = res.response
  } catch (err) {
    // The model could not keep to the schema — once more, free-form, parsed leniently.
    // Any other failure (a spent budget, an outage) is the model not answering.
    const msg = logAi('selectRecipeLines', err)
    if (!/json mode/i.test(msg)) {
      tried(attemptReason(err))
      return null
    }
    try {
      const res = (await runModel(env, MODEL, { messages, max_tokens: SELECTION_TOKENS, temperature: 0 })) as { response?: unknown }
      raw = res.response
    } catch (err2) {
      tried(attemptReason(err2))
      logAi('selectRecipeLines (retry)', err2)
      return null
    }
  }
  const parsed = extractJson(raw)
  const sel = parsed && typeof parsed === 'object' ? toSelection(parsed as Record<string, unknown>, lines.length) : null
  if (!sel) tried('empty')
  return sel
}

// The reply, validated: every index an integer in range, each line used at most ONCE (a
// title, a section label, an ingredient and a step can never be the same line), lists in
// page order.
export function toSelection(v: Record<string, unknown>, n: number): LineSelection {
  const used = new Set<number>()
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < n
  const one = (x: unknown): number | null => {
    if (!ok(x) || used.has(x)) return null
    used.add(x)
    return x
  }
  const title = one(v.title)
  const sections = (x: unknown) => {
    const out: { line: number; before: number }[] = []
    for (const raw of Array.isArray(x) ? x : []) {
      const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
      if (!ok(s.line) || !ok(s.before) || used.has(s.line)) continue
      used.add(s.line)
      out.push({ line: s.line, before: s.before })
    }
    return out
  }
  // Labels first: a line the model ALSO listed as an ingredient stays a label.
  const ingredientSections = sections(v.ingredientSections)
  const stepSections = sections(v.stepSections)
  const many = (x: unknown) => {
    const out: number[] = []
    for (const i of Array.isArray(x) ? x : []) {
      if (!ok(i) || used.has(i)) continue
      used.add(i)
      out.push(i)
    }
    return out.sort((a, b) => a - b)
  }
  const ingredients = many(v.ingredients)
  const steps = many(v.steps)
  const notes = many(v.notes)
  // Meta lines may repeat a line already taken (a « 4 portions » line is not an
  // ingredient, but the model may say so): they are only READ, never copied.
  const meta = (x: unknown) => (ok(x) ? x : null)
  return { title, servings: meta(v.servings), prep: meta(v.prep), cook: meta(v.cook), ingredients, steps, notes, ingredientSections, stepSections }
}

// Vision model for READING a recipe out of a photo (a cookbook page, a hand-
// written card, a screenshot). Separate from the text model — this one accepts
// image bytes. Same free Neuron tier, in-network (Loi 25).
//
// ROLE NOTE: as of the faithful-import work this is now the FALLBACK, not the
// primary read. The client first transcribes the photo with real on-device OCR
// (src/lib/ocr.ts, Tesseract) — which can garble but never flips a 3/4 into a 1/4
// or invents an ingredient — and structures that text through /api/recipe-import.
// This generative vision read only runs when OCR comes up near-empty (handwriting,
// skew, a weak tablet). It's the part that hallucinates, so keep it secondary.
//
// GOTCHA: this is a GATED Meta model. The account must accept the Llama Community
// License ONCE before any inference works, otherwise every call fails with
// `5016: ... you must submit the prompt 'agree'` and recipe-vision degrades to
// empty. Accept per-account by POSTing {"prompt":"agree"} once to
// /accounts/<id>/ai/run/@cf/meta/llama-3.2-11b-vision-instruct (done 2026-06-13).
//
// DEFERRED upgrade: @cf/mistralai/mistral-small-3.1-24b-instruct is multimodal,
// ungated, and stronger on the handwriting/skew cases that actually reach this
// fallback. Not swapped yet — its Workers AI IMAGE-input schema isn't documented
// (messages + base64 image_url vs the `image:[...bytes]` shape below), and the AI
// path can't be exercised locally (no `wrangler login` → AI unbound). Verify the
// input arg against a live account before switching; the read silently degrades to
// EMPTY if the shape is wrong, so an unverified swap would quietly kill the fallback.
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'
// Exported for the read report (the verify panel names the model that read the photo).
export const VISION_MODEL_ID = VISION_MODEL
// THE READER CHAIN (2026-10-27, each shape verified against the account's Workers AI
// REST endpoint with rendered recipe cards):
//   1. Mistral Small 3.1 — a full 1100×1400 recipe page transcribed EXACTLY in 10 s
//      (2 037 chars, 95 neurons ≈ 100 pages/day inside the free allowance).
//   2. Gemma 4 26B — exact, and with its thinking switched off THE RIGHT WAY it reads
//      the same full page in 9 s for 18 neurons (the cheapest reader). The switch that
//      works is the chat template's `chat_template_kwargs: { enable_thinking: false }`
//      (measured: content 2 030 chars, reasoning 0, finish=stop). `reasoning_effort:
//      'none'` only held on a small card — on a full page the model still spent 44 s and
//      the whole budget reasoning and returned nothing (that was Marc's « very long »
//      three-photo read, 2026-10-27). Second by Marc's choice; it would be first on cost.
//   3. Llama 3.2 11B vision — the original reader, its own byte-array input shape.
// 1 and 2 take the OpenAI content PARTS (`image_url: { url: data:… }`) and answer in
// `choices[0].message.content`. The read report names whichever model answered.
export const VISION_PRIMARY_ID = '@cf/mistralai/mistral-small-3.1-24b-instruct'
export const VISION_SECOND_ID = '@cf/google/gemma-4-26b-a4b-it'
// The content-parts call the two stronger readers share.
function partsInput(model: string, text: string, bytes: Uint8Array, max_tokens: number) {
  return {
    messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl(bytes) } }] }],
    max_tokens,
    // A transcription has one right answer. At the default temperature the reader
    // paraphrased (« égoutter les pavés » became « égoutter les pavés de saumon »,
    // « Couvrir » came out « Couver », 2026-10-30) — sampling, not reading.
    temperature: 0,
    ...(model === VISION_SECOND_ID ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  }
}

function dataUrl(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/jpeg;base64,${btoa(bin)}`
}

// TRANSCRIBE a photo — plain text, exactly what is printed, nothing organised. The
// structuring happens afterwards on the text, through the same path a paste takes
// (_lib/recipeDraft.draftFromText). Until 2026-09-24 this asked the vision model to
// read AND structure in one JSON reply; on a paragraph card it put the method in the
// ingredients and the footer in the steps, invented prep/cook times from the
// durations in the method, and when max_tokens cut the JSON the prose fallback read
// raw JSON lines, quotes and all. A transcript has none of those failure modes, and
// the text path cross-checks every number the structuring model emits against it.
//
// The prompt is a TRANSCRIPTION task and carries no example words: a small vision
// model echoes example words straight back (that exact bug, with fake sections), and
// an "organize" framing invites remarks. Returns '' on no-AI or any failure so the form
// just opens for manual entry; `report` carries the reason to the AI error journal.
// A full magazine page with its notes box is ~700 tokens of French; a dense two-page
// spread approaches 2000, which was the cap — and a cut transcript is a recipe missing
// its last steps, not « still a transcript ». Only what is used is charged.
const TRANSCRIPT_TOKENS = 4000
// The ONE transcription prompt — exported so a reader evaluated outside the Worker
// (scripts/recipe-photos.mjs read-claude) is measured on exactly what production sends.
export function transcriptionPrompt(lang: Lang): string {
  return lang === 'en'
    ? `Transcribe ALL the text in this image exactly as printed, as plain text.
- One item per line, in reading order: a heading, a list item or a numbered step is ONE line, even when it is printed wrapped over several lines. Keep the headings and the list markers as they appear.
- If the page is set in COLUMNS, transcribe each column separately, top to bottom, one column at a time. Never join text from two different columns onto one line. A step that continues at the top of the next column without a number is the SAME step: finish its line, never number it.
- Ignore text cut off by the edge of the photo (half words, the margin of another page) — never complete it.
- Copy every number, fraction and unit exactly. Do not translate, rephrase, summarize, correct spelling, or convert units.
- Output ONLY the transcription: no JSON, no markdown, no quotation marks around lines, no comments, nothing about what is missing or unreadable.`
    : `Transcris TOUT le texte de cette image exactement comme il est imprimé, en texte brut.
- Un élément par ligne, dans l'ordre de lecture : un titre, un ingrédient ou une étape numérotée tient sur UNE ligne, même s'il est imprimé sur plusieurs. Garde les titres et les puces tels qu'ils apparaissent.
- Si la page est en COLONNES, transcris chaque colonne séparément, de haut en bas, une colonne à la fois. Ne joins jamais le texte de deux colonnes différentes sur une même ligne. Une étape qui continue en haut de la colonne suivante sans numéro est la MÊME étape : termine sa ligne, ne la numérote jamais.
- Ignore le texte coupé par le bord de la photo (des demi-mots, la marge d'une autre page) — ne le complète jamais.
- Recopie chaque nombre, fraction et unité exactement. Ne traduis pas, ne reformule pas, ne résume pas, ne corrige pas l'orthographe, ne convertis pas les unités.
- Réponds UNIQUEMENT avec la transcription : pas de JSON, pas de markdown, pas de guillemets autour des lignes, aucun commentaire, rien sur ce qui manque ou serait illisible.`
}
// A model that was TRIED and did not answer — and why, in one word the cook can read.
// Every chain here falls through to the next model or the shape read; without this,
// « the day's AI budget is spent » and « a weaker reader answered » were invisible, and
// the cook trusted a worse read exactly as much as a good one (Marc, 2026-10-30).
export type AiAttemptReason = 'budget' | 'error' | 'empty' | 'blind'
export interface AiAttempt {
  model: string
  reason: AiAttemptReason
}
export const attemptReason = (err: unknown): AiAttemptReason => (err instanceof AiBudgetError ? 'budget' : 'error')

export async function transcribeImage(
  env: Env,
  bytes: Uint8Array,
  lang: Lang = 'fr',
  report?: AiReport & { visionModel?: string | null; attempts?: AiAttempt[] },
): Promise<string> {
  if (!env.AI || bytes.length === 0) return ''
  const prompt = transcriptionPrompt(lang)
  const tried = (model: string, reason: AiAttemptReason) => {
    if (report) (report.attempts ??= []).push({ model, reason })
  }
  const clean = (raw: unknown) =>
    stripAiCommentary((typeof raw === 'string' ? raw : '').replace(/```[a-z]*/gi, '').split(/\r?\n/))
      .join('\n')
      .trim()
  // The two stronger readers first (see the chain above); any error, an empty reply, or
  // a reply that says it sees no image → the next one, and last the Llama read below.
  //
  // WHY THE SHAPE MATTERS: the first shipped Mistral call used `messages` + a top-level
  // `image` — undocumented — and the model answered « Je ne peux pas voir d'images »;
  // on prod, with no image in sight, it TRANSCRIBED A STORY (« Les 1001 nuits… », 46
  // steps) for a biscuit card, without an error, so the fallback never ran. A model
  // that says it sees no image is treated as no read, not as text (BLIND_REPLY).
  for (const model of [VISION_PRIMARY_ID, VISION_SECOND_ID]) {
    try {
      const res = (await runModel(env, model, partsInput(model, prompt, bytes, TRANSCRIPT_TOKENS))) as VisionReply
      const text = clean(visionText(res))
      if (text && !BLIND_REPLY.test(text)) {
        if (report) report.visionModel = model
        return text
      }
      tried(model, text ? 'blind' : 'empty')
      logAi(`transcribeImage (${model})`, new Error(`no usable read: ${visionSnippet(visionText(res))}`))
    } catch (err) {
      tried(model, attemptReason(err))
      logAi(`transcribeImage (${model})`, err)
    }
  }
  if (report) report.visionModel = VISION_MODEL
  try {
    const res = (await runModel(env, VISION_MODEL, {
      // Workers AI vision wants the image as an array of 0-255 byte values.
      image: [...bytes],
      prompt,
      max_tokens: TRANSCRIPT_TOKENS,
      temperature: 0,
    })) as { response?: unknown }
    // Fences a model adds out of habit go; a leaked remark (« La recette n'indique
    // pas… ») is dropped line by line, the same net the structuring model gets.
    const text = clean(res.response)
    if (!text) {
      tried(VISION_MODEL, 'empty')
      if (report) report.error = logAi('transcribeImage', new Error(`vision read nothing legible: ${visionSnippet(res.response)}`))
    }
    return text
  } catch (err) {
    tried(VISION_MODEL, attemptReason(err))
    if (report) report.error = logAi('transcribeImage', err)
    return ''
  }
}

// A vision reply, in either shape Workers AI uses: the classic `response` string, or
// the OpenAI-compatible `choices[0].message.content` that the `messages` input gets.
type VisionReply = { response?: unknown; choices?: { message?: { content?: unknown } }[] }
export function visionText(res: VisionReply | null | undefined): string {
  if (!res) return ''
  if (typeof res.response === 'string') return res.response
  const c = res.choices?.[0]?.message?.content
  return typeof c === 'string' ? c : ''
}
// A text model answering a vision prompt WITHOUT the image says so, in its own words —
// that line is a refusal, never a transcript (seen live, 2026-10-27).
const BLIND_REPLY = /ne peux pas voir|cannot see (the|an|any) image|can't see (the|an|any) image|no image (was )?(provided|attached)|aucune image/i

// A short, log-safe peek at what the vision model actually returned, so an empty
// read carries a clue (prose? a refusal? blank?) instead of a bare "no JSON".
function visionSnippet(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
  const trimmed = text.trim()
  return trimmed ? trimmed.slice(0, 120) : '(empty)'
}

// A LIVE self-test of one model, for the operator's "Tester l'IA" button in
// Réglages. Unlike health.ts (which only reports that the AI binding EXISTS),
// these actually call Workers AI, so the failures that otherwise stay silent —
// a retired text model (see the MODEL note) or the gated vision license block
// (err 5016, see VISION_MODEL) — surface as a concrete pass/fail + message, the
// same breakages the AI error log records after the fact.
export interface AiCheck {
  ok: boolean
  ms: number // round-trip latency, so a slow-but-working model is visible too
  model: string
  detail: string // a snippet of the reply on success, the error message on failure
}

// Tiny 1×1 transparent PNG — enough to exercise the vision model's license gate
// and a real inference without shipping a fixture. (The content is irrelevant;
// the 5016 license error fires before the pixels matter.)
const PING_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function pingDetail(res: { response?: unknown }): string {
  const text = typeof res.response === 'string' ? res.response : JSON.stringify(res.response ?? '')
  return text.trim().slice(0, 60)
}

// Ping the TEXT model (capture router, meal suggestions, recap, recipe drafts).
export async function pingTextModel(env: Env): Promise<AiCheck> {
  const t0 = Date.now()
  if (!env.AI) return { ok: false, ms: 0, model: MODEL, detail: 'AI binding not configured' }
  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: 'Reply with the single word: OK.' }],
      max_tokens: 5,
    })) as { response?: unknown }
    const detail = pingDetail(res)
    if (!detail) return { ok: false, ms: Date.now() - t0, model: MODEL, detail: 'empty response' }
    return { ok: true, ms: Date.now() - t0, model: MODEL, detail }
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, model: MODEL, detail: logAi('pingTextModel', err) }
  }
}

// Ping the VISION model (reading a recipe from a photo). Catches the one-time
// gated-license failure (err 5016) that silently breaks photo import.
// Both vision models are pinged and named: the primary (shape unverified locally) and the
// Llama fallback — a red primary with a green fallback still reads photos.
export async function pingVisionModel(env: Env, model: string = VISION_MODEL): Promise<AiCheck> {
  const t0 = Date.now()
  if (!env.AI) return { ok: false, ms: 0, model, detail: 'AI binding not configured' }
  try {
    const bytes = Uint8Array.from(atob(PING_PNG), (c) => c.charCodeAt(0))
    // Same shapes as transcribeImage — the ping must exercise the call that reads.
    const input =
      model === VISION_PRIMARY_ID || model === VISION_SECOND_ID
        ? partsInput(model, 'Reply with the single word: OK.', bytes, 5)
        : { image: [...bytes], prompt: 'Reply with the single word: OK.', max_tokens: 5 }
    const res = (await runModel(env, model, input)) as VisionReply
    return { ok: true, ms: Date.now() - t0, model, detail: pingDetail({ response: visionText(res) }) || '(ran)' }
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, model, detail: logAi('pingVisionModel', err) }
  }
}

// Coerce an unknown model field into a clean, de-duped, capped string[] — used by
// draftRecipe for both the ingredient and step arrays. Never throws.
function cleanLines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of value) {
    const s = typeof x === 'string' ? x.trim() : ''
    const k = s.toLowerCase()
    if (s && !seen.has(k)) {
      seen.add(k)
      out.push(s)
    }
    if (out.length >= max) break
  }
  return out
}

// Pull the first JSON array out of a model reply and return its de-duped string
// entries (capped at 6). Mirrors extractJson's leniency: models wrap arrays in
// prose or a fence, so grab the outermost [ … ] rather than trusting the whole
// string. Anything non-array or unparseable yields [] — never throws.
function extractStringArray(raw: unknown, max = 6): string[] {
  // Same gotcha as extractJson: newer models return `response` already parsed as
  // an array; older ones returned a string wrapping the array. Handle both.
  let parsed: unknown
  if (Array.isArray(raw)) {
    parsed = raw
  } else if (typeof raw === 'string') {
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    if (start < 0 || end <= start) return []
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return []
    }
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of parsed) {
    const s = typeof x === 'string' ? x.trim() : ''
    const k = s.toLowerCase()
    if (s && !seen.has(k)) {
      seen.add(k)
      out.push(s)
    }
    if (out.length >= max) break
  }
  return out
}

// Flyer size-sniper. Many flyer item names don't state a size in a shape the
// regex parser catches ("Lait Lactantia", "un litre", size buried in prose), so
// the unit-price column comes up blank. This asks the model to pull a package
// size out of each name — IN ONE batched call — and returns a normalized size
// STRING per item ("500 g", "2 L") or null.
//
// Safety: the model only EXTRACTS wording; the caller re-runs the returned
// string through the trusted parseSize regex, so a hallucinated or malformed
// value simply fails to parse and yields no unit price. AI proposes, code
// disposes. Returns all-null on no-AI or any failure (graceful degrade).
export async function extractSizes(env: Env, names: string[], lang: Lang = 'fr'): Promise<(string | null)[]> {
  const out: (string | null)[] = names.map(() => null)
  if (!env.AI || names.length === 0) return out

  const list = names.map((n, i) => `${i}: ${n}`).join('\n')
  const prompt =
    lang === 'en'
      ? `Each line is "<index>: <grocery product name>". Extract the PACKAGE SIZE only when it is actually present in the text (a number + unit like g, kg, ml, l, oz, lb; "6 x 355 ml" packs are fine). Do NOT guess a typical size when none is written — use null then.
Reply ONLY with a JSON array of {"i":<index>,"size":"<number unit>"|null}. Example: [{"i":0,"size":"2 L"},{"i":1,"size":null}].
Items:
${list}`
      : `Chaque ligne est « <index>: <nom de produit d'épicerie> ». Extrais le FORMAT (taille) seulement s'il est réellement écrit dans le texte (un nombre + unité comme g, kg, ml, l, oz, lb; les emballages « 6 x 355 ml » sont corrects). Ne devine PAS un format habituel quand rien n'est écrit — mets null alors.
Réponds UNIQUEMENT avec un tableau JSON de {"i":<index>,"size":"<nombre unité>"|null}. Exemple : [{"i":0,"size":"2 L"},{"i":1,"size":null}].
Articles :
${list}`

  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: Math.min(900, 40 + names.length * 18),
    })) as { response?: unknown }
    // `response` is an already-parsed array on newer models, a string on older.
    const resp = res.response
    let arr: unknown
    if (Array.isArray(resp)) {
      arr = resp
    } else if (typeof resp === 'string') {
      const start = resp.indexOf('[')
      const end = resp.lastIndexOf(']')
      if (start < 0 || end <= start) return out
      arr = JSON.parse(resp.slice(start, end + 1)) as unknown
    } else {
      return out
    }
    if (!Array.isArray(arr)) return out
    for (const row of arr) {
      const i = (row as { i?: unknown }).i
      const size = (row as { size?: unknown }).size
      if (typeof i === 'number' && i >= 0 && i < out.length && typeof size === 'string' && size.trim()) {
        out[i] = size.trim()
      }
    }
  } catch (err) {
    logAi('extractSizes', err)
    return names.map(() => null)
  }
  return out
}

// Weekly suggestions: a BATCH of up to 10 varied suppers in ONE call, drawn from
// what's low / recently planned. The client shows them one per click and only
// asks again once the batch is exhausted — so 10 ideas cost a single inference
// (NFR-COST). Returns [] on no-AI/any failure so the UI hides the button.
export async function suggestMeals(
  env: Env,
  lowItems: string[],
  recent: string[],
  lang: Lang = 'fr',
  favorites: string[] = [],
  avoid: string[] = [],
  report?: AiReport,
  // "neglected" = the family's OWN dishes not served in a long while ("haven't had
  // in a while", PRD). Folded in as a GENTLE preference, never shame — privilégie
  // les recettes oubliées — but the don't-repeat list still wins so we never bring
  // back something cooked yesterday.
  neglected: string[] = [],
): Promise<string[]> {
  if (!env.AI) return []
  // "avoid" = the batch the user just cycled through, so a re-ask returns DIFFERENT
  // dishes instead of the same ten. Merged with recent suppers as the don't-repeat
  // list, and paired with a higher temperature so each batch genuinely varies.
  const dontRepeat = [...new Set([...recent, ...avoid])]
  const prompt =
    lang === 'en'
      ? `Suggest 10 simple, varied family suppers.
Foods running low (use some if helpful): ${lowItems.join(', ') || 'none'}.
Suppers to AVOID repeating: ${dontRepeat.join(', ') || 'none'}.
Family's own recipes (feel free to suggest some of these back): ${favorites.join(', ') || 'none'}.
Favourites not had in a while (gently favour bringing a few of these back): ${neglected.join(', ') || 'none'}.
Reply ONLY with a JSON array of 10 short dish names. Example: ["spaghetti","chili","tacos"].`
      : `Suggère 10 soupers familiaux simples et variés (français québécois).
Aliments qui achèvent (utilises-en si utile) : ${lowItems.join(', ') || 'aucun'}.
Soupers à ÉVITER de répéter : ${dontRepeat.join(', ') || 'aucun'}.
Recettes de la famille (suggères-en quelques-unes au besoin) : ${favorites.join(', ') || 'aucune'}.
Recettes oubliées depuis un bon moment (privilégie doucement quelques-unes de celles-ci) : ${neglected.join(', ') || 'aucune'}.
Réponds UNIQUEMENT avec un tableau JSON de 10 noms de plats courts. Exemple : ["spaghetti","chili","tacos"].`
  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.9,
    })) as { response?: unknown }
    return extractStringArray(res.response, 10)
  } catch (err) {
    if (report) report.error = logAi('suggestMeals', err)
    return []
  }
}

// « Vide-frigo », step 1 — dish NAMES that use up what's about to spoil. A cousin of
// suggestMeals, but anchored on the « à utiliser bientôt » + réserve items rather
// than low/favourites/neglected: the whole point is anti-waste, not variety. ONE
// call returns ~10 names (NFR-COST); the client shows them as a checklist, the cook
// ticks a few, and step 2 (draftRecipe with `have`) turns each pick into a full
// recipe. Returns [] on no-AI/any failure so the caller hides the flow.
export async function fridgeIdeas(
  env: Env,
  have: { soon: string[]; reserve: string[] },
  lang: Lang = 'fr',
  // The batch just shown, so a re-ask yields DIFFERENT dishes.
  avoid: string[] = [],
  report?: AiReport,
): Promise<string[]> {
  if (!env.AI) return []
  const soon = have.soon.join(', ') || (lang === 'en' ? 'none' : 'aucun')
  const reserve = have.reserve.join(', ') || (lang === 'en' ? 'none' : 'aucun')
  const dontRepeat = [...new Set(avoid)].join(', ') || (lang === 'en' ? 'none' : 'aucun')
  const prompt =
    lang === 'en'
      ? `Suggest 10 simple family dishes that USE UP these soon-to-spoil ingredients before they go to waste.
Use as many of them as sensibly fit in a dish; assume basic staples (oil, salt, flour, onion, garlic, eggs) are on hand — do NOT require a grocery run.
Ingredients to use up first: ${soon}.
Also on hand (freezer / back of the pantry): ${reserve}.
Dishes to AVOID repeating: ${dontRepeat}.
Reply ONLY with a JSON array of 10 short dish names. Example: ["veggie frittata","minestrone soup","leftovers gratin"].`
      : `Suggère 10 plats familiaux simples qui ÉCOULENT ces aliments qui vont bientôt se perdre.
Utilises-en autant que possible dans un plat ; suppose que les essentiels (huile, sel, farine, oignon, ail, œufs) sont là — n'exige PAS d'aller à l'épicerie.
Aliments à écouler en premier : ${soon}.
Aussi sous la main (congélateur / fond du garde-manger) : ${reserve}.
Plats à ÉVITER de répéter : ${dontRepeat}.
Réponds UNIQUEMENT avec un tableau JSON de 10 noms de plats courts. Exemple : ["frittata aux légumes","soupe minestrone","gratin de restes"].`
  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.9,
    })) as { response?: unknown }
    return extractStringArray(res.response, 10)
  } catch (err) {
    if (report) report.error = logAi('fridgeIdeas', err)
    return []
  }
}

// Weekly recap (PRD v1.1): a warm 2-sentence reflection on the week — NOT a
// stats dashboard (NFR-CALM: no counts, no scores, nothing to optimize against).
// On demand, one call. The caller gathers the week's titles; this just phrases
// them gently. Returns null on no-AI or any failure so the UI hides the recap.
export async function weeklyRecap(
  env: Env,
  week: { events: string[]; meals: string[]; chores: string[] },
  lang: Lang = 'fr',
  report?: AiReport,
): Promise<string | null> {
  if (!env.AI) return null
  const prompt =
    lang === 'en'
      ? `Write a warm, calm 2-sentence recap of a family's week. No numbers, no scores, no inflated praise — a gentle reflection a parent would smile at.
Events: ${week.events.join(', ') || 'none'}.
Suppers: ${week.meals.join(', ') || 'none'}.
Chores done: ${week.chores.join(', ') || 'none'}.
Reply with only the recap text.`
      : `Écris un bilan calme et chaleureux de la semaine d'une famille, en 2 phrases. Pas de chiffres, pas de pointage, pas de félicitations exagérées — un reflet doux qui fait sourire un parent.
Rendez-vous : ${week.events.join(', ') || 'aucun'}.
Soupers : ${week.meals.join(', ') || 'aucun'}.
Corvées faites : ${week.chores.join(', ') || 'aucune'}.
Réponds seulement avec le texte du bilan.`
  try {
    const res = (await runModel(env, MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 160,
    })) as { response?: unknown }
    // Plain-text reply, but guard the shape in case a model returns non-string.
    const out = (typeof res.response === 'string' ? res.response : '').trim()
    return out || null
  } catch (err) {
    if (report) report.error = logAi('weeklyRecap', err)
    return null
  }
}

// Natural-language Q&A over the household's OWN data (#12). The /api/ask handler
// gathers a compact, DATED snapshot (suppers, events, the list, chores, notes) into
// `context`; this answers the question from THAT text only — calm, concise, honest
// about gaps — and tags the answer with the DOMAIN it reasoned over so the UI can
// show the matching category icon (reusing lib/cats). Returns null on no-AI / any
// failure so the search surface can say it couldn't answer.
export type AnswerKind = 'meal' | 'event' | 'list' | 'chore' | 'recipe' | 'cercle' | 'note' | 'none'
const ANSWER_KINDS: ReadonlySet<AnswerKind> = new Set([
  'meal',
  'event',
  'list',
  'chore',
  'recipe',
  'cercle',
  'note',
  'none',
])

export async function answerQuestion(
  env: Env,
  question: string,
  context: string,
  lang: Lang = 'fr',
  report?: AiReport,
): Promise<{ answer: string; kind: AnswerKind } | null> {
  if (!env.AI) return null
  const system =
    lang === 'en'
      ? `You answer a family member's question using ONLY the household data below. Be warm and concise — one or two sentences. If the answer isn't in the data, say plainly that you don't see it (never invent). The data is dated; use the weekdays/dates to resolve "Friday", "tomorrow", etc.
When the answer names several things, DON'T run them together in a sentence: write one short sentence, then put each thing on its own line starting with "- " (at most 10 lines, then "…"). Use "\\n" for the line breaks.
Reply with ONLY valid JSON: {"answer": <your reply, in English>, "kind": <which kind of thing the question is about>}.
"kind" is one of: "meal" (suppers / what's for supper), "event" (appointments, activities, birthdays), "list" (the grocery/shopping list), "chore" (chores, tasks), "recipe" (a saved recipe), "cercle" (a person / family, a contact's phone or email, a service or business — vet, plumber, etc. — or an upkeep/maintenance next-due date from a carnet), "note" (a fridge note), or "none" (anything else / you don't know).

DATA:
${context}`
      : `Tu réponds à la question d'un membre de la famille en utilisant UNIQUEMENT les données ci-dessous. Sois chaleureux et concis — une ou deux phrases. Si la réponse n'est pas dans les données, dis simplement que tu ne la vois pas (n'invente jamais). Les données sont datées ; sers-toi des jours/dates pour comprendre « vendredi », « demain », etc.
Quand la réponse nomme plusieurs choses, NE les enfile PAS dans une phrase : écris une courte phrase, puis mets chaque chose sur sa propre ligne commençant par « - » (10 lignes au maximum, puis « … »). Utilise « \\n » pour les sauts de ligne.
Réponds UNIQUEMENT avec du JSON valide : {"answer": <ta réponse, en français québécois>, "kind": <le genre de chose dont parle la question>}.
"kind" est un de : "meal" (soupers / qu'est-ce qu'on mange), "event" (rendez-vous, activités, anniversaires), "list" (la liste d'épicerie), "chore" (corvées, tâches), "recipe" (une recette enregistrée), "cercle" (une personne / la famille, le téléphone ou courriel d'un contact, un service ou commerce — vétérinaire, plombier, etc. — ou une prochaine date d'entretien d'un carnet), "note" (un pense-bête sur le frigo), ou "none" (autre chose / tu ne sais pas).

DONNÉES :
${context}`
  try {
    const res = (await runModel(env, MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: question.trim() },
      ],
      // Roomier than a plain sentence needs: an enumerated answer spends tokens on
      // line breaks, and a truncated JSON string parses to nothing at all.
      max_tokens: 400,
    })) as { response?: unknown }
    const parsed = extractJson(res.response) as { answer?: unknown; kind?: unknown } | null
    const answer = typeof parsed?.answer === 'string' ? decodeStrayEscapes(parsed.answer).trim() : ''
    if (!answer) return null
    const kind = ANSWER_KINDS.has(parsed?.kind as AnswerKind) ? (parsed!.kind as AnswerKind) : 'none'
    return { answer, kind }
  } catch (err) {
    if (report) report.error = logAi('answerQuestion', err)
    return null
  }
}
