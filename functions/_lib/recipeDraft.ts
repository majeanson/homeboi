import type { Env } from './env'
import { TEXT_MODEL, structureRecipe, type Lang } from './ai'
import { detectLang } from './langDetect'
import { NO_TIMES, type RecipeTimes, linesWithForeignNumbers, parseRecipeText, refineSteps } from './recipeImport'
import { jsonFragmentsToText, repairRecipeRead } from './recipeRepair'

// THE ONE text → draft path (2026-09-24). It lived inline in api/recipe-import's paste
// branch, and api/recipe-vision had its own: the vision model was asked to read AND
// structure a photo in one generative pass, and on a paragraph card it put the method
// in the ingredients, the footer in the steps, invented prep/cook times from the
// durations in the method, and — cut off by max_tokens — left the prose fallback
// reading raw JSON lines, quotes and all. The same card pasted as TEXT came out
// perfect through this path. So the vision model only TRANSCRIBES now, and its
// transcript comes here like a paste does: deterministic headings parser first, the
// text model to organise free-form text, the shape heuristic when AI is off or
// empty-handed, and repairRecipeRead over whatever comes out.

export interface DraftOut {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  times: RecipeTimes
  image: string | null
  source: string | null
  // Auto-detected reading language ('fr' | 'en' | null = couldn't tell → the form
  // leaves its language on "Auto"). Set here so every import path fills it.
  lang: 'fr' | 'en' | null
  // HOW this draft was structured, for the photo-read report (RecipeReadReview's
  // « Rapport » tab): 'headings' = the deterministic no-AI parser (real section
  // headings found), 'ai' = the generative structuring model (named in `model`),
  // 'heuristic' = the shape-based best effort (no AI available or AI empty-handed).
  structuring?: 'headings' | 'ai' | 'heuristic'
  model?: string | null
  // Lines whose numbers do NOT appear in the source text — the structuring model
  // changed or invented them (linesWithForeignNumbers). Only ever set with
  // structuring 'ai'; the verify panel flags these lines "à confirmer".
  suspect?: string[]
  empty?: boolean
  // Why we came back empty-handed, so the UI can say something true instead of one
  // catch-all "rien trouvé":
  //   'blocked'    — the page refused us (bot manager); pasting the text still works.
  //   'no-recipe'  — we read the page fine, there was just no recipe on it.
  reason?: 'blocked' | 'no-recipe'
}

export const draft = (d: Partial<DraftOut>): DraftOut => {
  // repairRecipeRead (recipeRepair.ts): leaked JSON and field lines out, the footer
  // out, and a paragraph recipe gets its ingredients lifted word for word from the
  // method. An honest read passes through untouched.
  const merged: DraftOut = repairRecipeRead({
    title: null,
    ingredients: [],
    steps: [],
    servings: null,
    servingsUnit: null,
    times: NO_TIMES,
    image: null,
    source: null,
    lang: null,
    ...d,
  })
  // Detect the recipe's language from its own words (title + the lines), unless a
  // caller already supplied one. Runs on every path — incl. the no-AI JSON-LD /
  // paste ones — so the read-aloud voice matches the recipe wherever it came from.
  merged.lang = merged.lang ?? detectLang([merged.title, ...merged.ingredients, ...merged.steps].join('\n'))
  return merged
}

// Free text (a paste, an OCR transcript, the vision model's transcription) → a draft.
// `aiOn` = the binding is wired AND the household has not switched AI off; when false
// the text model is never called. The result is `empty` only when nothing at all
// could be made of the text.
export async function draftFromText(env: Env, raw: string, lang: Lang, aiOn: boolean): Promise<DraftOut> {
  // A reply that is JSON, or the broken remains of one, reads as text first.
  const text = jsonFragmentsToText(raw.trim())
  // Format first: a recipe with its real headings (Ingrédients / Préparation) parses
  // deterministically — no AI, nothing invented. Markdown-shaped text (the cloud OCR
  // reader answers in markdown) flattens first so its headings hit the same parser.
  const heuristic = parseRecipeText(text)
  if (heuristic.confident) {
    return draft({
      title: heuristic.title,
      ingredients: heuristic.ingredients,
      steps: heuristic.steps,
      servings: heuristic.servings,
      servingsUnit: heuristic.servingsUnit,
      times: heuristic.times,
      structuring: 'headings',
    })
  }
  // Free-form text → AI structuring; its steps still go through the shared refinement
  // (models love returning one packed paragraph). Every number the model emits is
  // cross-checked against the source text — a line carrying a number the text never
  // printed is returned in `suspect` for the verify panel to flag. Servings and times
  // come from the TEXT (explicit lines only), never from the model: the vision read
  // used to turn « cuire 5 minutes » into a prep time.
  if (aiOn) {
    const r = await structureRecipe(env, text, lang)
    if (r.ingredients.length || r.steps.length) {
      const steps = refineSteps(r.steps)
      return draft({
        title: r.title ?? heuristic.title,
        ingredients: r.ingredients,
        steps,
        servings: heuristic.servings,
        servingsUnit: heuristic.servingsUnit,
        times: heuristic.times,
        structuring: 'ai',
        model: TEXT_MODEL,
        suspect: linesWithForeignNumbers(text, [...r.ingredients, ...steps]),
      })
    }
  }
  // AI unbound or empty-handed — the heuristic's best effort still beats nothing.
  if (heuristic.ingredients.length || heuristic.steps.length) {
    return draft({
      title: heuristic.title,
      ingredients: heuristic.ingredients,
      steps: heuristic.steps,
      servings: heuristic.servings,
      servingsUnit: heuristic.servingsUnit,
      times: heuristic.times,
      structuring: 'heuristic',
    })
  }
  return draft({ title: heuristic.title, empty: true })
}
