// The one essential AI feature: classify a free-text capture into a structured
// intent, then the handler routes it. Workers AI, in-network (Loi 25), free
// Neuron tier. One inference per capture — never on a render loop.
//
// Graceful degrade: with env.AI unset (or local dev without `wrangler login`),
// classifyCapture returns { type: 'note', degraded: true } so the capture is
// never lost and the UI can offer a manual type-picker.

import type { Env } from './env'

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

export type IntentType = 'event' | 'task' | 'list-item' | 'pantry-low' | 'meal' | 'note'

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
Types possibles: "event" (rendez-vous, activité avec une date/heure), "task" (tâche/corvée à faire), "list-item" (article à acheter ou à ajouter à la liste), "pantry-low" (un aliment qui manque ou achève), "meal" (un souper/repas planifié), "note" (le reste).
Format: {"type": <type>, "payload": {"title"?: string, "item"?: string, "text"?: string, "when"?: string, "slot"?: string, "person"?: string}}.
Exemples:
"dentiste mardi 15h" -> {"type":"event","payload":{"title":"dentiste","when":"mardi 15h"}}
"Léa sort les vidanges" -> {"type":"task","payload":{"title":"sortir les vidanges","person":"Léa"}}
"ajoute du lait" -> {"type":"list-item","payload":{"item":"lait"}}
"pus de café" -> {"type":"pantry-low","payload":{"item":"café"}}
"souper spaghetti jeudi" -> {"type":"meal","payload":{"title":"spaghetti","slot":"supper","when":"jeudi"}}
"penser à appeler maman" -> {"type":"note","payload":{"text":"appeler maman"}}`,
  en: `You sort a family note into JSON. Reply ONLY with valid JSON, nothing else.
Possible types: "event" (appointment, activity with a date/time), "task" (a chore/task to do), "list-item" (something to buy or add to the list), "pantry-low" (a food that's out or running low), "meal" (a planned supper/meal), "note" (everything else).
Format: {"type": <type>, "payload": {"title"?: string, "item"?: string, "text"?: string, "when"?: string, "slot"?: string, "person"?: string}}.
Examples:
"dentist tuesday 3pm" -> {"type":"event","payload":{"title":"dentist","when":"tuesday 3pm"}}
"Léa takes out the trash" -> {"type":"task","payload":{"title":"take out the trash","person":"Léa"}}
"add milk" -> {"type":"list-item","payload":{"item":"milk"}}
"out of coffee" -> {"type":"pantry-low","payload":{"item":"coffee"}}
"supper spaghetti thursday" -> {"type":"meal","payload":{"title":"spaghetti","slot":"supper","when":"thursday"}}
"remember to call mom" -> {"type":"note","payload":{"text":"call mom"}}`,
}

const VALID: ReadonlySet<IntentType> = new Set([
  'event',
  'task',
  'list-item',
  'pantry-low',
  'meal',
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
): Promise<RecipeDraft> {
  const dish = title.trim()
  if (!env.AI || !dish) return { ingredients: [], steps: [] }
  const prompt =
    lang === 'en'
      ? `Draft a simple family recipe for "${dish}".
Reply ONLY with JSON: {"ingredients": string[], "steps": string[]}.
Ingredients: short lines with rough quantities, at most 12. Steps: short imperative sentences, at most 8.
Example: {"ingredients":["400 g pasta","1 jar tomato sauce","500 g ground beef"],"steps":["Boil the pasta.","Brown the beef.","Add sauce and simmer."]}.`
      : `Rédige une recette familiale simple pour « ${dish} » (français québécois).
Réponds UNIQUEMENT avec du JSON : {"ingredients": string[], "steps": string[]}.
Ingrédients : lignes courtes avec quantités approximatives, 12 au maximum. Étapes : phrases impératives courtes, 8 au maximum.
Exemple : {"ingredients":["400 g de pâtes","1 pot de sauce tomate","500 g de bœuf haché"],"steps":["Faire bouillir les pâtes.","Faire revenir le bœuf.","Ajouter la sauce et laisser mijoter."]}.`
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
// GOTCHA: this is a GATED Meta model. The account must accept the Llama Community
// License ONCE before any inference works, otherwise every call fails with
// `5016: ... you must submit the prompt 'agree'` and recipe-vision degrades to
// empty. Accept per-account by POSTing {"prompt":"agree"} once to
// /accounts/<id>/ai/run/@cf/meta/llama-3.2-11b-vision-instruct (done 2026-06-13).
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'

// Read a recipe from a PHOTO: OCR the image, then structure what's actually
// written into a clean card — title + ingredient lines + steps — WITHOUT
// inventing anything not visible. Mirrors structureRecipe's contract
// (RecipeStructured) so the caller treats a photo and pasted text identically.
// `bytes` is the raw image (already resized client-side). Returns nulls/empties
// on no-AI or any failure so the form just opens for manual entry (degrade).
export async function recipeFromImage(
  env: Env,
  bytes: Uint8Array,
  lang: Lang = 'fr',
  report?: AiReport,
): Promise<RecipeStructured> {
  if (!env.AI || bytes.length === 0) return { title: null, ingredients: [], steps: [] }
  const prompt =
    lang === 'en'
      ? `This image is a recipe (a cookbook page, a handwritten card, or a screenshot). Read ALL the text in it and organize it WITHOUT inventing anything that isn't written.
Reply ONLY with JSON: {"title": string, "ingredients": string[], "steps": string[]}.
Keep ingredient lines as written (with quantities). Split the method into short steps. At most 30 ingredients, 20 steps. Leave a field empty if it isn't legible.
If the recipe has named parts (e.g. "Glaze", "Crust"), insert a heading line formatted exactly "## Name" in both arrays before that part's lines.`
      : `Cette image est une recette (page de livre, fiche manuscrite ou capture d'écran). Lis TOUT le texte qu'elle contient et organise-le SANS rien inventer qui n'est pas écrit.
Réponds UNIQUEMENT avec du JSON : {"title": string, "ingredients": string[], "steps": string[]}.
Garde les lignes d'ingrédients telles quelles (avec quantités). Découpe la préparation en étapes courtes. 30 ingrédients et 20 étapes au maximum. Laisse un champ vide s'il est illisible.
Si la recette a des parties nommées (ex. « Glaçage », « Croûte »), insère une ligne d'en-tête au format exact « ## Nom » dans les deux tableaux avant les lignes de cette partie.`
  try {
    const res = (await env.AI.run(VISION_MODEL, {
      // Workers AI vision wants the image as an array of 0-255 byte values.
      image: [...bytes],
      prompt,
      max_tokens: 1200,
    })) as { response?: unknown }
    const parsed = extractJson(res.response) as
      | { title?: unknown; ingredients?: unknown; steps?: unknown }
      | null
    if (!parsed) return { title: null, ingredients: [], steps: [] }
    const title = typeof parsed.title === 'string' ? parsed.title.trim() || null : null
    return { title, ingredients: cleanLines(parsed.ingredients, 30), steps: cleanLines(parsed.steps, 20) }
  } catch (err) {
    if (report) report.error = logAi('recipeFromImage', err)
    return { title: null, ingredients: [], steps: [] }
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
Reply ONLY with a JSON array of 10 short dish names. Example: ["spaghetti","chili","tacos"].`
      : `Suggère 10 soupers familiaux simples et variés (français québécois).
Aliments qui achèvent (utilises-en si utile) : ${lowItems.join(', ') || 'aucun'}.
Soupers à ÉVITER de répéter : ${dontRepeat.join(', ') || 'aucun'}.
Recettes de la famille (suggères-en quelques-unes au besoin) : ${favorites.join(', ') || 'aucune'}.
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
