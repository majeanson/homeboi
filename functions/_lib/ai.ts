// The one essential AI feature: classify a free-text capture into a structured
// intent, then the handler routes it. Workers AI, in-network (Loi 25), free
// Neuron tier. One inference per capture — never on a render loop.
//
// Graceful degrade: with env.AI unset (or local dev without `wrangler login`),
// classifyCapture returns { type: 'note', degraded: true } so the capture is
// never lost and the UI can offer a manual type-picker.

import type { Env } from './env'
import { parseMarkdownRecipe, parseYield, stripAiCommentary, NO_TIMES, type RecipeTimes } from './recipeImport'
import { dropDanglingHeadings } from './recipeSections'

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
function logAi(where: string, err: unknown): string {
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
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
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
    const res = (await env.AI.run(MODEL, {
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

// Meal -> grocery staples (PRD B3). Given a planned supper title, name the main
// staples it needs so the client can drop the missing ones onto the shared
// list — the meal plan filling the list itself, with NO pantry inventory (brief
// tenet 3). On-demand, one call, in-network. Returns [] on no-AI or any failure
// so the caller just skips the staple step; the meal still saves.
export async function mealStaples(env: Env, title: string, lang: Lang = 'fr'): Promise<string[]> {
  const dish = title.trim()
  if (!env.AI || !dish) return []
  const prompt =
    lang === 'en'
      ? `List the main grocery staples needed to cook "${dish}" for a family supper.
Reply ONLY with a JSON array of short item names, no quantities, at most 6.
Example: ["pasta","tomato sauce","ground beef"].`
      : `Donne les ingrédients d'épicerie principaux pour cuisiner « ${dish} » comme souper familial.
Réponds UNIQUEMENT avec un tableau JSON de noms d'aliments courts, sans quantités, 6 au maximum.
Exemple : ["pâtes","sauce tomate","viande hachée"].`
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 120,
    })) as { response?: unknown }
    return extractStringArray(res.response)
  } catch (err) {
    logAi('mealStaples', err)
    return []
  }
}

// Recipe drafter (recipe book helper). Given a dish title, draft a simple family
// recipe: a short ingredient list + ordered prep steps, IN ONE call. The cook
// edits freely afterward — this just seeds a blank card so nobody faces an empty
// form. Returns { ingredients: [], steps: [] } on no-AI or any failure, so the
// caller just opens an empty editor (graceful degrade, like mealStaples).
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
    const res = (await env.AI.run(MODEL, {
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

// Structure PASTED recipe text (copied from a site/photo/book) into a clean
// card. Unlike draftRecipe this does NOT invent — it organizes the text it's
// given: a title, the ingredient lines, the steps. Used by /api/recipe-import
// for the "paste" path (the "from URL" path parses JSON-LD with no AI). Returns
// nulls/empties on no-AI or failure so the caller falls back to raw text.
export interface RecipeStructured {
  title: string | null
  ingredients: string[]
  steps: string[]
}
export async function structureRecipe(env: Env, text: string, lang: Lang = 'fr'): Promise<RecipeStructured> {
  const raw = text.trim().slice(0, 6000)
  if (!env.AI || !raw) return { title: null, ingredients: [], steps: [] }
  const prompt =
    lang === 'en'
      ? `Below is pasted recipe text. Organize it WITHOUT inventing anything new.
Reply ONLY with JSON: {"title": string, "ingredients": string[], "steps": string[]}.
Keep ingredient lines as written (with quantities). Split instructions into short steps. At most 30 ingredients, 20 steps.
If the recipe has named parts (e.g. "Glaze", "Crust"), insert a heading line formatted exactly "## Name" in both arrays before that part's lines.
Text:
${raw}`
      : `Voici du texte de recette collé. Organise-le SANS rien inventer.
Réponds UNIQUEMENT avec du JSON : {"title": string, "ingredients": string[], "steps": string[]}.
Garde les lignes d'ingrédients telles quelles (avec quantités). Découpe les instructions en étapes courtes. 30 ingrédients et 20 étapes au maximum.
Si la recette a des parties nommées (ex. « Glaçage », « Croûte »), insère une ligne d'en-tête au format exact « ## Nom » dans les deux tableaux avant les lignes de cette partie.
Texte :
${raw}`
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 900,
    })) as { response?: unknown }
    const parsed = extractJson(res.response) as
      | { title?: unknown; ingredients?: unknown; steps?: unknown }
      | null
    if (!parsed) return { title: null, ingredients: [], steps: [] }
    const title = typeof parsed.title === 'string' ? parsed.title.trim() || null : null
    return { title, ingredients: cleanLines(parsed.ingredients, 30), steps: cleanLines(parsed.steps, 20) }
  } catch (err) {
    logAi('structureRecipe', err)
    return { title: null, ingredients: [], steps: [] }
  }
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

// A photo read carries more than the paste path's RecipeStructured: the printed
// servings and prep/cook times are usually right there on the card, and the form
// already has fields for them (RecipeForm.applyDraft). So read + return them too.
export interface RecipePhoto {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  times: RecipeTimes
}
const EMPTY_PHOTO: RecipePhoto = { title: null, ingredients: [], steps: [], servings: null, servingsUnit: null, times: NO_TIMES }

// A model field that should be whole minutes — accept a number or a numeric
// string ("25"), clamp to a sane 1..2880 range, else null.
function minutesField(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseInt(v, 10) : NaN
  return Number.isFinite(n) && n > 0 && n <= 48 * 60 ? Math.round(n) : null
}

// Read a recipe from a PHOTO: transcribe what's ACTUALLY printed — title,
// servings, prep/cook times, ingredient lines, steps — without inventing or
// commenting. `bytes` is the raw image (already resized client-side). Returns
// empties on no-AI or any failure so the form just opens for manual entry.
//
// The prompt is deliberately a TRANSCRIPTION task, not an "organize" one, and
// carries NO concrete example part-names: a small vision model echoes example
// words ("Glaçage", "Croûte") straight back as fake sections (that exact bug),
// and an "organize" framing invites it to add remarks. Faithful copy + no
// examples + an explicit no-commentary rule + a post-filter is the fix.
export async function recipeFromImage(
  env: Env,
  bytes: Uint8Array,
  lang: Lang = 'fr',
  report?: AiReport,
): Promise<RecipePhoto> {
  if (!env.AI || bytes.length === 0) return EMPTY_PHOTO
  const prompt =
    lang === 'en'
      ? `You transcribe a recipe from an image (a cookbook page, a handwritten card, a screenshot). Copy EXACTLY what is written. Invent nothing. Add no commentary.
Reply with ONLY this JSON, no text around it:
{"title": string, "servings": number|null, "prepMin": number|null, "cookMin": number|null, "ingredients": string[], "steps": string[]}
- title: the recipe's name, as written.
- servings: the number of servings if stated ("4 servings" → 4), else null.
- prepMin / cookMin: prep / cook time in MINUTES if stated, else null.
- ingredients: each line as written, with its quantity.
- steps: the method, as short ordered steps.
- Keep the EXACT words from the image: do not rephrase, summarize, translate, or fix spelling. The only edits allowed are splitting the method into separate steps and copying a part name as a "## " line. Think of it as an intelligent copy-paste, not a rewrite.
- If the recipe is split into named parts, copy each part's EXACT printed name on its own line, prefixed with "## ", in the relevant array. Never use a part name that does not appear in the image.
- Add NO remark, note, or explanation. Do not point out what is missing or unreadable. If something isn't written, set the field to null or omit that line — never explain why.
- If the page is set in COLUMNS, read each column separately, top to bottom, one column at a time. Never join text from two different columns onto one line.
- At most 40 ingredients, 30 steps.`
      : `Tu transcris une recette à partir d'une image (page de livre, fiche manuscrite ou capture d'écran). Recopie EXACTEMENT ce qui est écrit. N'invente rien. N'ajoute aucun commentaire.
Réponds avec UNIQUEMENT ce JSON, sans aucun texte autour :
{"title": string, "servings": number|null, "prepMin": number|null, "cookMin": number|null, "ingredients": string[], "steps": string[]}
- title : le nom de la recette, tel qu'écrit.
- servings : le nombre de portions s'il est indiqué (« 4 portions » → 4), sinon null.
- prepMin / cookMin : le temps de préparation / cuisson EN MINUTES s'il est indiqué, sinon null.
- ingredients : chaque ligne telle quelle, avec sa quantité.
- steps : la préparation, en étapes courtes et dans l'ordre.
- Garde les mots EXACTS de l'image : ne reformule pas, ne résume pas, ne traduis pas, ne corrige pas l'orthographe. Les seules modifications permises sont de découper la préparation en étapes et de recopier un nom de partie en ligne « ## ». C'est un copier-coller intelligent, pas une réécriture.
- Si la recette est séparée en parties, recopie le nom EXACT de chaque partie (tel qu'écrit dans l'image) sur sa propre ligne, préfixé de « ## », dans le bon tableau. N'utilise jamais un nom de partie qui n'apparaît pas dans l'image.
- N'ajoute AUCUNE remarque, note ni explication. Ne signale pas ce qui manque ou serait illisible. Si une information n'est pas écrite, mets le champ à null ou n'écris pas cette ligne — ne l'explique pas.
- Si la page est en COLONNES, lis chaque colonne séparément, de haut en bas, une colonne à la fois. Ne joins jamais le texte de deux colonnes différentes sur une même ligne.
- Maximum 40 ingrédients, 30 étapes.`
  try {
    const res = (await env.AI.run(VISION_MODEL, {
      // Workers AI vision wants the image as an array of 0-255 byte values.
      image: [...bytes],
      prompt,
      max_tokens: 1500,
    })) as { response?: unknown }
    const parsed = extractJson(res.response) as
      | { title?: unknown; servings?: unknown; prepMin?: unknown; cookMin?: unknown; ingredients?: unknown; steps?: unknown }
      | null
    // The model very often OCRs the recipe correctly but answers in PROSE/MARKDOWN
    // ("**Ingrédients**\n* 8 choux…") instead of the JSON we asked for — vision
    // models follow structured-output instructions far less reliably than the text
    // model. Don't throw that perfect read away on a "no JSON": fall back to the
    // SAME heading-aware parser the paste-import path uses (it knows Ingrédients/
    // Préparation, bullets, numbered steps, "## " sections, times, servings).
    const result: RecipePhoto = parsed
      ? {
          title: typeof parsed.title === 'string' ? parsed.title.trim() || null : null,
          ingredients: cleanLines(parsed.ingredients, 40),
          steps: cleanLines(parsed.steps, 30),
          servings: parseYield(parsed.servings),
          servingsUnit: null,
          times: { prep: minutesField(parsed.prepMin), cook: minutesField(parsed.cookMin), total: null },
        }
      : visionProseToRecipe(res.response)
    // Net for a model that disobeys "no commentary": drop "Remarque" / "La recette
    // n'indique pas…" lines it leaked as steps/ingredients, then any "## Section"
    // left dangling once its only line was removed.
    result.ingredients = dropDanglingHeadings(stripAiCommentary(result.ingredients))
    result.steps = dropDanglingHeadings(stripAiCommentary(result.steps))
    // Only a read that's empty BOTH ways is a real failure — log THAT, since the
    // vision ping in Réglages only proves the model RUNS, not that it reads.
    if (!result.title && !result.ingredients.length && !result.steps.length && report) {
      report.error = logAi('recipeFromImage', new Error(`vision read nothing legible: ${visionSnippet(res.response)}`))
    }
    return result
  } catch (err) {
    if (report) report.error = logAi('recipeFromImage', err)
    return EMPTY_PHOTO
  }
}

// The vision model answered in prose/markdown rather than JSON. Reuse the
// paste-import parser (markdown-flattened) so a non-JSON reply still becomes a
// reviewable draft — and it recovers servings/times/sections too. Empty in →
// empty out.
function visionProseToRecipe(raw: unknown): RecipePhoto {
  const text = typeof raw === 'string' ? raw : ''
  if (!text.trim()) return EMPTY_PHOTO
  const p = parseMarkdownRecipe(text)
  return {
    title: p.title,
    ingredients: p.ingredients,
    steps: p.steps,
    servings: p.servings,
    servingsUnit: p.servingsUnit,
    times: p.times,
  }
}

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
    const res = (await env.AI.run(MODEL, {
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
export async function pingVisionModel(env: Env): Promise<AiCheck> {
  const t0 = Date.now()
  if (!env.AI) return { ok: false, ms: 0, model: VISION_MODEL, detail: 'AI binding not configured' }
  try {
    const bytes = Uint8Array.from(atob(PING_PNG), (c) => c.charCodeAt(0))
    const res = (await env.AI.run(VISION_MODEL, {
      image: [...bytes],
      prompt: 'Reply with the single word: OK.',
      max_tokens: 5,
    })) as { response?: unknown }
    return { ok: true, ms: Date.now() - t0, model: VISION_MODEL, detail: pingDetail(res) || '(ran)' }
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, model: VISION_MODEL, detail: logAi('pingVisionModel', err) }
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
    const res = (await env.AI.run(MODEL, {
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
    const res = (await env.AI.run(MODEL, {
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
    const res = (await env.AI.run(MODEL, {
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
    const res = (await env.AI.run(MODEL, {
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
    const res = (await env.AI.run(MODEL, {
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
