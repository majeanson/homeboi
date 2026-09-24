import { draft, draftFromText } from '../_lib/recipeDraft'
import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { TEXT_MODEL, resolveLang, structureRecipe } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import {
  htmlToText,
  linesWithForeignNumbers,
  parseRecipeJsonLd,
  parseRecipeMicrodata,
  recipeTextWindow,
  refineSteps,
  regroupIngredients,
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

// Some recipe sites sit behind a bot manager (Akamai, PerimeterX…) that refuses
// any datacenter client outright: recettes.qc.ca 403s a Worker no matter what
// user-agent it sends, so the page never even reaches the parsers below. When the
// direct fetch is refused, retry once through a public reader that renders the
// page and hands back its HTML. Deliberately a FALLBACK, not the default path —
// it sends the URL to a third party, so it only runs on a page we couldn't fetch
// ourselves, and if it's unavailable too the import just reports 'blocked' and the
// UI points the cook at paste (which never left the house).
const READER = 'https://r.jina.ai/'

async function fetchPage(url: URL, lang: 'fr' | 'en'): Promise<string | null> {
  const acceptLanguage = lang === 'en' ? 'en-CA' : 'fr-CA'
  const cap = (s: string) => s.slice(0, 2_000_000) // cap a runaway page
  try {
    const res = await fetch(url.toString(), {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Babillard/0.1 (+household planner)',
        'accept-language': acceptLanguage,
      },
      redirect: 'follow',
    })
    if (res.ok) return cap(await res.text())
  } catch {
    // fall through to the reader
  }
  try {
    const res = await fetch(READER + url.toString(), {
      headers: {
        // Ask for the page's own HTML rather than the reader's markdown, so the
        // JSON-LD / microdata parsers below still get their shot on sites that
        // publish structured data (the reader's markdown drops <script> tags).
        'x-return-format': 'html',
        'accept-language': acceptLanguage,
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    if (res.ok) return cap(await res.text())
  } catch {
    // reader down / timed out — treat as blocked
  }
  return null
}

export const onRequestPost = authed(async (ctx, actor) => {
  // AI off = binding unset OR the household switched it off (Réglages ▸ IA). When
  // off, every path below falls back to the no-AI parsers (JSON-LD / microdata /
  // paste heuristic) and only 503s if those find nothing — never reaching the model.
  const aiOn = await aiUsable(ctx.env, actor)
  const lang = resolveLang(ctx.env, ctx.request)
  const body = await readJson<{ url?: string; text?: string }>(ctx.request)

  // ---- Paste path -----------------------------------------------------------
  // The ONE text → draft path (_lib/recipeDraft): the heading parser, then the text
  // model for free-form text, then the shape heuristic — and the photo read's
  // transcript takes exactly this road too.
  const text = body?.text?.trim()
  if (text) {
    const d = await draftFromText(ctx.env, text, lang, aiOn)
    if (d.empty && !aiOn) return serviceUnavailable('Structuration IA indisponible ici.')
    return ok(d)
  }

  // ---- URL path -------------------------------------------------------------
  const urlRaw = body?.url?.trim()
  if (!urlRaw) return badRequest('Adresse ou texte requis.')
  const url = publicHttpUrl(urlRaw)
  if (!url) return badRequest('Adresse invalide.')

  const html = await fetchPage(url, lang)
  // Refused by the site AND by the reader — say so. This used to 503, which the
  // form rendered as "l'IA est désactivée": a blocked page has nothing to do with
  // the AI, and the wrong message sent the cook chasing a setting that was fine.
  if (html === null) {
    return ok(draft({ source: url.toString(), empty: true, reason: 'blocked' }))
  }

  // Structured data first — JSON-LD, then microdata. Reliable, no AI. The flat
  // ingredient list gets its page-visible groups back ("Biscuits" / "Glaçage")
  // when every line can be located in the rendered page.
  const parsed = parseRecipeJsonLd(html) ?? parseRecipeMicrodata(html)
  if (parsed && (parsed.ingredients.length || parsed.steps.length)) {
    return ok(
      draft({ ...parsed, ingredients: regroupIngredients(html, parsed.ingredients), source: url.toString() }),
    )
  }

  // No structured Recipe — try AI over the page text (best-effort). Some sites ship
  // a Recipe node that's a hollow shell (recettes.qc.ca declares recipeIngredient:[]
  // and recipeInstructions:"") and no microdata at all, so this path carries pages
  // the parsers above can't touch. Extract the WHOLE text, then window it onto the
  // recipe — a head slice would hand the model the nav bar and stop short of the food.
  if (aiOn) {
    const windowed = recipeTextWindow(htmlToText(html, 200_000))
    const r = await structureRecipe(ctx.env, windowed, lang)
    if (r.ingredients.length || r.steps.length) {
      const steps = refineSteps(r.steps)
      return ok(
        draft({
          title: r.title ?? parsed?.title ?? null,
          ingredients: r.ingredients,
          steps,
          image: parsed?.image ?? null,
          source: url.toString(),
          structuring: 'ai',
          model: TEXT_MODEL,
          suspect: linesWithForeignNumbers(windowed, [...r.ingredients, ...steps]),
        }),
      )
    }
  }

  // We read the page fine, there was just no recipe in it (an article or a listicle
  // — /recettes/article/… rather than /recettes/recette/… — lands here). Let the UI
  // tell the user to paste instead.
  return ok(
    draft({
      title: parsed?.title ?? null,
      image: parsed?.image ?? null,
      source: url.toString(),
      empty: true,
      reason: 'no-recipe',
    }),
  )
})
