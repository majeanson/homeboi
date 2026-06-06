import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang, structureRecipe } from '../_lib/ai'
import { parseRecipeJsonLd, htmlToText } from '../_lib/recipeImport'

// Import a recipe into a DRAFT the user reviews before saving. Two inputs:
//   { url }  — fetch the page, parse schema.org/Recipe JSON-LD (no AI). If the
//              page has no Recipe block, fall back to HTML→text + AI structuring.
//   { text } — paste from anywhere; AI structures it (503 if AI unbound).
// Returns { title, ingredients, steps, image, source } — NOT saved; the client
// prefills the recipe form so the cook can fix anything before committing.
// Operator-only (it makes an outbound fetch and writes the recipe book).

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
  const lang = resolveLang(ctx.env, ctx.request)
  const body = await readJson<{ url?: string; text?: string }>(ctx.request)

  // ---- Paste path -----------------------------------------------------------
  const text = body?.text?.trim()
  if (text) {
    if (!ctx.env.AI) return serviceUnavailable('Structuration IA indisponible ici.')
    const r = await structureRecipe(ctx.env, text, lang)
    return ok({ title: r.title, ingredients: r.ingredients, steps: r.steps, image: null, source: null })
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

  // Structured data first — reliable, no AI.
  const parsed = parseRecipeJsonLd(html)
  if (parsed && (parsed.ingredients.length || parsed.steps.length)) {
    return ok({
      title: parsed.title,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      image: parsed.image,
      source: url.toString(),
    })
  }

  // No Recipe JSON-LD — try AI over the page text (best-effort).
  if (ctx.env.AI) {
    const r = await structureRecipe(ctx.env, htmlToText(html), lang)
    if (r.ingredients.length || r.steps.length) {
      return ok({
        title: r.title ?? parsed?.title ?? null,
        ingredients: r.ingredients,
        steps: r.steps,
        image: parsed?.image ?? null,
        source: url.toString(),
      })
    }
  }

  // Couldn't extract anything usable — let the UI tell the user to paste instead.
  void actor
  return ok({ title: parsed?.title ?? null, ingredients: [], steps: [], image: parsed?.image ?? null, source: url.toString(), empty: true })
})
