import { draft, draftByModel, draftFromText } from '../_lib/recipeDraft'
import { badRequest, ok, readJson, serviceUnavailable } from '../_lib/json'
import { authed } from '../_lib/route'
import { resolveLang } from '../_lib/ai'
import { aiUsable } from '../_lib/aiPref'
import { type CapturedPage, type PageSource, readPage, sourceFromCapture, sourceFromHtml } from '../_lib/recipeImportPage'

// Import a recipe into a DRAFT the user reviews before saving. Three inputs (plus an
// optional `hint`: the cook's one-line note for the model, used only when it runs):
//   { url }  — fetch the page, parse schema.org/Recipe JSON-LD, then microdata,
//              both no-AI. If neither finds a Recipe, fall back to HTML→text +
//              AI structuring.
//   { page } — a page the cook's own browser captured (the « Envoyer à Babillard »
//              bookmarklet): its JSON-LD blocks + its text, read by the SAME parsers
//              (_lib/recipeImportPage). For the sites that refuse every server.
//   { text } — paste from anywhere; the heading-aware parser handles a normally
//              formatted recipe with no AI, the AI only structures free-form
//              text (and the heuristic result still serves when AI is unbound).
// Every draft says HOW it was read (`structuring`: jsonld / microdata / headings / ai /
// heuristic) and, for a page, how it was REACHED (`fetched`: direct / reader /
// bookmarklet) — the form names it, and an 'ai' read opens the verify panel with the
// page text (`transcript`) beside the lines.
// Returns { title, ingredients, steps, servings, times, image, source, notes } — NOT
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
// UI points the cook at another door.
// (Measured 2026-10-27: Akamai refuses the reader too, and People Inc. — Allrecipes,
// SeriousEats — answers it 451. The cook's own browser is the door that always works:
// the bookmarklet, `{ page }` above.)
const READER = 'https://r.jina.ai/'

type Fetched = 'direct' | 'reader'

async function fetchPage(url: URL, lang: 'fr' | 'en'): Promise<{ html: string; via: Fetched } | null> {
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
      // A site that never answers used to hold the request until the client gave up
      // (45 s) — it now falls to the reader like a refusal does.
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { html: cap(await res.text()), via: 'direct' }
  } catch {
    // refused, unreachable or too slow — fall through to the reader
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
    if (res.ok) return { html: cap(await res.text()), via: 'reader' }
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
  const body = await readJson<{ url?: string; text?: string; hint?: string; page?: CapturedPage }>(ctx.request)
  const hint = typeof body?.hint === 'string' ? body.hint.slice(0, 400) : undefined

  // ---- Paste path -----------------------------------------------------------
  // The ONE text → draft path (_lib/recipeDraft): the heading parser, then the text
  // model for free-form text, then the shape heuristic — and the photo read's
  // transcript takes exactly this road too.
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (text) {
    const d = await draftFromText(ctx.env, text, lang, aiOn, hint)
    if (d.empty && !aiOn) return serviceUnavailable('Structuration IA indisponible ici.')
    return ok(d)
  }

  // ---- Page paths -------------------------------------------------------------
  let src: PageSource
  let fetched: Fetched | 'bookmarklet'
  const captured = body?.page
  if (captured && typeof captured === 'object') {
    // A page the cook's browser captured. Its url is only a LABEL here (we never fetch
    // it), but it is still held to a public http(s) address — it becomes the recipe's link.
    const url = typeof captured.url === 'string' ? publicHttpUrl(captured.url.trim()) : null
    if (!url) return badRequest('Adresse invalide.')
    src = sourceFromCapture({ ...captured, url: url.toString() })
    fetched = 'bookmarklet'
  } else {
    const urlRaw = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!urlRaw) return badRequest('Adresse ou texte requis.')
    const url = publicHttpUrl(urlRaw)
    if (!url) return badRequest('Adresse invalide.')
    const page = await fetchPage(url, lang)
    // Refused by the site AND by the reader — say so. This used to 503, which the
    // form rendered as "l'IA est désactivée": a blocked page has nothing to do with
    // the AI, and the wrong message sent the cook chasing a setting that was fine.
    if (page === null) return ok(draft({ source: url.toString(), empty: true, reason: 'blocked' }))
    src = sourceFromHtml(page.html, url.toString())
    fetched = page.via
  }

  // The no-model read (site data, then the page's printed headings) — the same seam
  // the corpus test scores (_lib/recipeImportPage).
  const r = readPage(src)
  if (r.draft) return ok({ ...r.draft, fetched })

  // Only the model can organise this page's text, guided by the cook's hint.
  if (aiOn) {
    const read = await draftByModel(ctx.env, r.window, lang, { ...r.known, title: null }, hint)
    if (read) return ok({ ...read, title: r.title ?? read.title, image: r.image, source: src.url, fetched })
  }

  // We read the page fine, there was just no recipe in it (an article or a listicle
  // — /recettes/article/… rather than /recettes/recette/… — lands here). Let the UI
  // tell the user to paste instead.
  return ok({ ...draft({ title: r.title, image: r.image, source: src.url, empty: true, reason: 'no-recipe' }), fetched })
})
