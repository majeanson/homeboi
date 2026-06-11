import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang, structureRecipe } from '../_lib/ai'
import {
  NO_TIMES,
  type RecipeTimes,
  htmlToText,
  parsePastedRecipe,
  parseRecipeJsonLd,
  parseRecipeMicrodata,
  refineSteps,
} from '../_lib/recipeImport'

// Import a recipe into a DRAFT the user reviews before saving. Two inputs:
//   { url }  — fetch the page, parse schema.org/Recipe JSON-LD, then microdata,
//              both no-AI. If neither finds a Recipe, fall back to HTML→text +
//              AI structuring.
//   { text } — paste from anywhere; the heading-aware parser handles a normally
//              formatted recipe with no AI, the AI only structures free-form
//              text (and the heuristic result still serves when AI is unbound).
// Returns { title, ingredients, steps, servings, times, image, source } — NOT
// saved; the client prefills the recipe form so the cook can fix anything
// before committing. Operator-only (it makes an outbound fetch and writes the
// recipe book).

interface DraftOut {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings: number | null
  times: RecipeTimes
  image: string | null
  source: string | null
  empty?: boolean
}

const draft = (d: Partial<DraftOut>): DraftOut => ({
  title: null,
  ingredients: [],
  steps: [],
  servings: null,
  times: NO_TIMES,
  image: null,
  source: null,
  ...d,
})

// Light SSRF guard: only public http(s), and block obvious internal targets. This
// is a private family tool, but there's no reason to let it hit localhost/metadata.
function publicHttpUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return null
  }
  return u
}

export const onRequestPost = authed(async (ctx, actor) => {
  void actor
  const lang = resolveLang(ctx.env, ctx.request)
  const body = await readJson<{ url?: string; text?: string }>(ctx.request)

  // ---- Paste path -----------------------------------------------------------
  const text = body?.text?.trim()
  if (text) {
    // Format first: a recipe pasted with its real headings (Ingrédients /
    // Préparation) parses deterministically — no AI, nothing invented.
    const heuristic = parsePastedRecipe(text)
    if (heuristic.confident) {
      return ok(
        draft({
          title: heuristic.title,
          ingredients: heuristic.ingredients,
          steps: heuristic.steps,
          servings: heuristic.servings,
          times: heuristic.times,
        }),
      )
    }
    // Free-form text → AI structuring; its steps still go through the shared
    // refinement (models love returning one packed paragraph).
    if (ctx.env.AI) {
      const r = await structureRecipe(ctx.env, text, lang)
      if (r.ingredients.length || r.steps.length) {
        return ok(
          draft({
            title: r.title ?? heuristic.title,
            ingredients: r.ingredients,
            steps: refineSteps(r.steps),
            servings: heuristic.servings,
            times: heuristic.times,
          }),
        )
      }
    }
    // AI unbound or empty-handed — the heuristic's best effort still beats a 503.
    if (heuristic.ingredients.length || heuristic.steps.length) {
      return ok(
        draft({
          title: heuristic.title,
          ingredients: heuristic.ingredients,
          steps: heuristic.steps,
          servings: heuristic.servings,
          times: heuristic.times,
        }),
      )
    }
    if (!ctx.env.AI) return serviceUnavailable('Structuration IA indisponible ici.')
    return ok(draft({ title: heuristic.title, empty: true }))
  }

  // ---- URL path -------------------------------------------------------------
  const urlRaw = body?.url?.trim()
  if (!urlRaw) return badRequest('Adresse ou texte requis.')
  const url = publicHttpUrl(urlRaw)
  if (!url) return badRequest('Adresse invalide.')

  let html: string
  try {
    const res = await fetch(url.toString(), {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Babillard/0.1 (+household planner)',
        'accept-language': lang === 'en' ? 'en-CA' : 'fr-CA',
      },
      redirect: 'follow',
    })
    if (!res.ok) return serviceUnavailable('Page indisponible.')
    html = (await res.text()).slice(0, 2_000_000) // cap a runaway page
  } catch {
    return serviceUnavailable('Page indisponible.')
  }

  // Structured data first — JSON-LD, then microdata. Reliable, no AI.
  const parsed = parseRecipeJsonLd(html) ?? parseRecipeMicrodata(html)
  if (parsed && (parsed.ingredients.length || parsed.steps.length)) {
    return ok(draft({ ...parsed, source: url.toString() }))
  }

  // No structured Recipe — try AI over the page text (best-effort).
  if (ctx.env.AI) {
    const r = await structureRecipe(ctx.env, htmlToText(html), lang)
    if (r.ingredients.length || r.steps.length) {
      return ok(
        draft({
          title: r.title ?? parsed?.title ?? null,
          ingredients: r.ingredients,
          steps: refineSteps(r.steps),
          image: parsed?.image ?? null,
          source: url.toString(),
        }),
      )
    }
  }

  // Couldn't extract anything usable — let the UI tell the user to paste instead.
  return ok(draft({ title: parsed?.title ?? null, image: parsed?.image ?? null, source: url.toString(), empty: true }))
})
