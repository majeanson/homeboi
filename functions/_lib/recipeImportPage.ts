import { draft, readText, type DraftOut } from './recipeDraft'
import { isSectionHeading } from './recipeSections'
import { adaptPage, applyGroups } from './siteAdapters'
import {
  extractJsonLdBlocks,
  htmlToText,
  normLoose,
  normalizeImage,
  pageIngredientsPlausible,
  pageMeta,
  parseJsonLdText,
  parseRecipeJsonLdBlocks,
  parseRecipeMicrodata,
  recipeTextWindow,
  regroupIngredientsInText,
} from './recipeImport'

// THE PAGE → DRAFT SEAM (2026-10-27). Everything the URL import does to a page once it
// HAS the page — no network, no model — so the corpus test (recipeCorpus.test.ts), the
// capture tool (scripts/recipe-corpus.mjs) and the weekly live contract run the exact
// production path, not a copy of it. api/recipe-import fetches (or receives a page the
// cook's own browser captured) and calls this; only when this finds no recipe a
// machine can read does the model get the text window.
//
// Two ways in, one read:
//   · sourceFromHtml   — a page the Worker fetched (its raw HTML);
//   · sourceFromCapture — a page the cook's browser captured (the bookmarklet sends the
//     JSON-LD blocks' raw text and the page's innerText, never the HTML).

export interface CapturedPage {
  url: string
  title?: string | null
  image?: string | null
  jsonld?: string[]
  text?: string
  // What the bookmark found of a site's own group data (lib/recipeBookmarklet).
  extras?: { ricardo?: unknown; wprm?: unknown } | null
}

export interface PageSource {
  url: string
  // The raw HTML, when we have it (microdata needs it); a captured page has none.
  html: string | null
  blocks: unknown[]
  // The page's text, line-structured (htmlToText of the HTML, or the captured innerText).
  text: string
  meta: { title: string | null; image: string | null }
  extras?: { ricardo?: unknown } | null
}

export function sourceFromHtml(html: string, url: string): PageSource {
  return { url, html, blocks: extractJsonLdBlocks(html), text: htmlToText(html, 200_000), meta: pageMeta(html) }
}

const CAP_TEXT = 200_000
export function sourceFromCapture(p: CapturedPage): PageSource {
  const blocks = (Array.isArray(p.jsonld) ? p.jsonld : [])
    .filter((b): b is string => typeof b === 'string')
    .slice(0, 30)
    .map((b) => parseJsonLdText(b.slice(0, 500_000)))
    .filter((v) => v !== undefined)
  const text = (typeof p.text === 'string' ? p.text : '').replace(/\r\n?/g, '\n').slice(0, CAP_TEXT)
  const title = typeof p.title === 'string' ? p.title.replace(/\s+/g, ' ').trim().slice(0, 200) || null : null
  const extras = p.extras && typeof p.extras === 'object' && typeof p.extras.ricardo === 'string' ? { ricardo: p.extras.ricardo.slice(0, 200_000) } : null
  return { url: p.url, html: null, blocks, text, meta: { title, image: normalizeImage(p.image) }, extras }
}

export interface PageRead {
  // A read good enough to ship with no model (site data, or the page's own headings);
  // null when only the model could organise this page.
  draft: DraftOut | null
  // The recipe's text window — what the model gets, and what the verify panel shows.
  window: string
  // The heuristic's own read of the window: the title/servings/times a model read keeps.
  known: DraftOut
  // The page's name and picture (structured data first, then og:/<title>).
  title: string | null
  image: string | null
}

// `pick`: which Recipe of a page that carries several (C4) — 0, the first, by default.
export function readPage(src: PageSource, pick = 0): PageRead {
  // Structured data first — JSON-LD, then microdata. Reliable, no AI, and the site's
  // own step boundaries are kept as shipped. The flat ingredient list gets its
  // page-visible groups back ("Biscuits" / "Glaçage") when every line can be located
  // in the rendered page. A hollow JSON-LD shell (recettes.qc.ca declares
  // recipeIngredient:[] and recipeInstructions:"") no longer hides the microdata.
  const ld = parseRecipeJsonLdBlocks(src.blocks, pick)
  const ldUsable = !!ld && (ld.ingredients.length > 0 || ld.steps.length > 0)
  const parsed = ldUsable ? ld : ((src.html ? parseRecipeMicrodata(src.html) : null) ?? ld)
  // Extract all of the text, then window it onto the recipe (a head slice would hand
  // over the nav bar and stop short of the food).
  const window = recipeTextWindow(src.text)
  const title = recipeTitle(parsed?.title ?? null, src.meta.title)
  const image = parsed?.image ?? src.meta.image
  const text = readText(window)
  // The page's own printed read (its headings), for what the structured data leaves out.
  const printed = text.read ?? text.fallback
  const printedOk = printed.structuring === 'headings' && pageIngredientsPlausible(printed.ingredients)
  if (parsed && (parsed.ingredients.length || parsed.steps.length)) {
    // The site's own parts (Ricardo's cooking-mode data, WPRM's groups) first, then the
    // page's printed ones (C2).
    const site = adaptPage(src.html, src.extras)
    const glued = unglueStepHeadings(parsed.steps, src.text)
    const steps = applyGroups(glued, site?.stepGroups, site?.exact ?? false) ?? (printedOk ? regroupSteps(glued, printed.steps) : glued)
    // The site's step photos follow their step through any part heading added above.
    const photoOf = new Map(parsed.steps.map((s, i) => [s, parsed.stepImageUrls?.[i] ?? null]))
    const stepImageUrls = parsed.stepImageUrls ? steps.map((s) => (isSectionHeading(s) ? null : (photoOf.get(s) ?? null))) : undefined
    return {
      draft: draft({
        ...parsed,
        stepImageUrls,
        image,
        ingredients:
          printedOk && pageListFillsIngredients(parsed.ingredients, printed.ingredients)
            ? printed.ingredients
            : (applyGroups(parsed.ingredients, site?.ingredientGroups, site?.exact ?? false) ??
              regroupIngredientsInText(src.text, parsed.ingredients)),
        steps,
        title,
        // schema.org carries no notes: the page's own « Notes » block, word for word
        // (only its notes — the page text's ingredients and steps are not trusted over
        // the site's structured data).
        notes: parsed.notes ?? text.known.notes ?? null,
        source: src.url,
        structuring: parsed === ld ? 'jsonld' : 'microdata',
      }),
      window,
      known: text.known,
      title,
      image,
    }
  }
  // No structured Recipe — the page's printed headings (no AI). When they are missing,
  // or the « ingredients » they found are table cells, only the model can organise the
  // text. A page's text through the shape heuristic is not offered: on a web page that
  // reads the menu bar as a recipe.
  return {
    draft: printedOk ? { ...printed, title: title ?? printed.title, image, source: src.url } : null,
    window,
    known: text.known,
    title,
    image,
  }
}

const real = (lines: string[]) => lines.filter((l) => !isSectionHeading(l))

// The recipe's name. The structured data's, unless it is the page's printed name with
// an SEO tail glued on — « Boeuf bourguignon : la vraie recette : la meilleure recette »
// (Marmiton), « Côtelettes de porc, sauce aux pommes | IGA »: then the printed one.
export function recipeTitle(structured: string | null, printed: string | null): string | null {
  if (!structured) return printed
  if (printed && printed !== structured && normLoose(structured).startsWith(normLoose(printed)) && normLoose(printed).length >= 4)
    return printed
  return structured
}

// A part's name GLUED to its first step in the site's JSON-LD — IGA ships « Côtelettes de
// porcDéposer les côtelettes… » (the page prints « Côtelettes de porc » above the step).
// Split only when that exact name is a line of its own on the page.
export function unglueStepHeadings(steps: string[], pageText: string): string[] {
  const lines = new Set(pageText.split('\n').map((l) => l.trim()).filter(Boolean))
  return steps.flatMap((s) => {
    const m = /^([^.!?:;]{3,60}?[a-zà-öœ)])([A-ZÀ-ÖŒ][a-zà-öœ])/.exec(s)
    return m && lines.has(m[1]) ? [`## ${m[1]}`, s.slice(m[1].length)] : [s]
  })
}

// The structured data's ingredient list is missing or bare, and the page prints the real
// one. Missing: a microdata recipe that marks up only its steps (Trois fois par jour).
// Bare: names without amounts — Zeste's JSON-LD says « boeuf », « parmesan »; the page
// says « 900 g (2 lb) de mélange de boeuf, veau et porc haché ». The printed list wins
// only when it is the same list: every structured name found, in order, in its own line.
export function pageListFillsIngredients(structured: string[], printed: string[]): boolean {
  const s = real(structured)
  const p = real(printed)
  if (!p.length) return false
  if (!s.length) return true
  const hasNum = (l: string) => /[\d¼½¾⅓⅔⅛]/.test(l)
  const words = (l: string) => normLoose(l).split(' ').filter(Boolean)
  // Machine amounts: Allrecipes' JSON-LD says « 0.66666698455811 cup milk » where the
  // page prints « ⅔ cup milk ». The printed list wins when it is the same list, line
  // for line, most of each line's words shared (the JSON-LD also says « roasted garlic »
  // where the page says « garlic »).
  if (s.some((l) => /\d\.\d{4,}/.test(l))) {
    if (p.length !== s.length) return false
    return s.every((l, i) => {
      const lw = words(p[i])
      const sw = words(l).filter((w) => w.length >= 3 && !/^\d/.test(w))
      return sw.filter((w) => lw.some((x) => x.startsWith(w))).length * 10 >= sw.length * 6
    })
  }
  if (s.filter(hasNum).length * 10 >= s.length * 4) return false
  if (p.filter(hasNum).length * 10 < p.length * 6) return false
  // A name is « in » a line when each of its words opens a word of the line: « oignon
  // espagnol » is in « 2 gros oignons espagnols » (Zeste names the singular).
  const holds = (line: string, name: string) => {
    const lw = words(line)
    return words(name)
      .filter((w) => w.length >= 3)
      .every((w) => lw.some((x) => x.startsWith(w)))
  }
  let j = 0
  for (const name of s) {
    while (j < p.length && !holds(p[j], name)) j++
    if (j >= p.length) return false
    j++
  }
  return true
}

// The site's steps, with the parts the PAGE prints between them (« Au service », «
// Glaçage ») — when the printed method is the very same steps, in the same order. Any
// difference and the structured steps stand as they are: a wrong part is worse than none.
export function regroupSteps(structured: string[], printed: string[]): string[] {
  if (structured.some((l) => isSectionHeading(l)) || !printed.some((l) => isSectionHeading(l))) return structured
  const p = real(printed)
  if (p.length !== structured.length || p.some((l, i) => normLoose(l) !== normLoose(structured[i]))) return structured
  let i = 0
  return printed.map((l) => (isSectionHeading(l) ? l : structured[i++]))
}

// The no-model read of a fetched page: the draft, or an honest « no recipe here ».
export function importFromHtml(html: string, url: string, pick = 0): DraftOut {
  const r = readPage(sourceFromHtml(html, url), pick)
  return r.draft ?? draft({ title: r.title, image: r.image, source: url, empty: true, reason: 'no-recipe' })
}
