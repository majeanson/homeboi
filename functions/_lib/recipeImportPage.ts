import { draft, readText, type DraftOut } from './recipeDraft'
import { isSectionHeading } from './recipeSections'
import { adaptPage, applyGroups } from './siteAdapters'
import {
  NOISE_END,
  NOTE_HEADING,
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
  refineSteps,
  regroupIngredientsInText,
  stripTitleTail,
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
//
// A READ NEVER STOPS AT HALF A RECIPE (2026-11-05). Structured data can mark up only one
// half: instantpot.com's microdata tags the seven ingredients and not one step, which
// counted as a recipe, so the eight steps printed on the same page were read and thrown
// away. Each half now takes the page's printed one when its own is missing, and a read
// still missing a half is `halfRead`: api/recipe-import asks the model for the whole,
// and the audit (no-steps / no-ingredients) tells the cook if nothing could.

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
  // The bookmark's DOM walk keeps the source's indentation and blank runs; tidy it the
  // way htmlToText tidies a fetched page (trimmed lines, at most one blank line), and
  // NFC: a site's decomposed « É » must read as the heading « Ingrédients », not as a
  // bare label that becomes a « ## » section (the « ## INGRÉDIENTS » of 2026-10-27).
  const text = (typeof p.text === 'string' ? p.text : '')
    .slice(0, CAP_TEXT)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // document.title is a TAB title (« Chili con carne | Recettes du Québec ») — same tail
  // rule as a fetched page's <title>.
  const title = typeof p.title === 'string' ? stripTitleTail(p.title.replace(/\s+/g, ' ').trim())?.slice(0, 200) ?? null : null
  const extras = p.extras && typeof p.extras === 'object' && typeof p.extras.ricardo === 'string' ? { ricardo: p.extras.ricardo.slice(0, 200_000) } : null
  return { url: p.url, html: null, blocks, text, meta: { title, image: normalizeImage(p.image) }, extras }
}

export interface PageRead {
  // A read good enough to ship with no model (site data, or the page's own headings);
  // null when only the model could organise this page.
  draft: DraftOut | null
  // `draft` is not the last word: a model, when there is one, gets a look first. A half
  // read, or a method only `stepHeadedMethod` found — see that function for why.
  askModel: boolean
  // The recipe's text window — what the model gets, and what the verify panel shows.
  window: string
  // What a model read keeps: the title/servings/times of the heuristic's read of the
  // window, under the site's own figures when it published them.
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
    const steps =
      printedOk && !real(glued).length
        ? printed.steps
        : (applyGroups(glued, site?.stepGroups, site?.exact ?? false) ?? (printedOk ? regroupSteps(glued, printed.steps) : glued))
    // The site's step photos follow their step through any part heading added above.
    const photoOf = new Map(parsed.steps.map((s, i) => [s, parsed.stepImageUrls?.[i] ?? null]))
    const stepImageUrls = parsed.stepImageUrls ? steps.map((s) => (isSectionHeading(s) ? null : (photoOf.get(s) ?? null))) : undefined
    const read = draft({
        ...parsed,
        ...(stepImageUrls && { stepImageUrls }),
        image,
        ingredients:
          printedOk && pageListFillsIngredients(parsed.ingredients, printed.ingredients)
            ? printed.ingredients
            : (applyGroups(parsed.ingredients, site?.ingredientGroups, site?.exact ?? false) ??
              regroupIngredientsInText(src.text, parsed.ingredients)),
        steps,
        title,
        // schema.org carries no notes: a site's own field when it sends one, else the
        // page's « Notes » block, word for word (only its notes — when both halves are
        // there, the page text's lines are not trusted over the site's structured data).
        notes: parsed.notes ?? text.known.notes ?? null,
        source: src.url,
        structuring: parsed === ld ? 'jsonld' : 'microdata',
      })
    const headed = real(read.steps).length ? null : stepHeadedMethod(src.text, read.ingredients)
    return {
      draft: headed ? { ...read, steps: headed } : read,
      askModel: halfRead(read), // read before the rescue: a found method does not skip the model
      window,
      // The text heuristic guesses these; a site that publishes them knows. A model read
      // of instantpot-style half data used to answer 2 servings where the site says 4.
      known: {
        ...text.known,
        servings: parsed.servings ?? text.known.servings,
        servingsUnit: parsed.servings != null ? parsed.servingsUnit : text.known.servingsUnit,
        times: {
          prep: parsed.times.prep ?? text.known.times.prep,
          cook: parsed.times.cook ?? text.known.times.cook,
          total: parsed.times.total ?? text.known.times.total,
        },
      },
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
    askModel: printedOk && halfRead(printed),
    window,
    known: text.known,
    title,
    image,
  }
}

const real = (lines: string[]) => lines.filter((l) => !isSectionHeading(l))

// Ingredients with no method, or a method with no ingredients: not yet a recipe.
export const halfRead = (d: { ingredients: string[]; steps: string[] }): boolean => !real(d.ingredients).length || !real(d.steps).length

// THE BLOG METHOD: no « Instructions » heading, no step in the structured data, only
// « Step 1: Combine Milk and Chia Seeds » over a few lines (mollyshomeguide, 2026-11-05).
//
// It must only ever ADD (Marc: « if it only improves and never degrades »), and that is
// a matter of WHERE it is allowed to count, not of how good it is:
//   · it never runs while the site's data or the printed headings have a method;
//   · it does not beat the model. On the very page it was written for, the model read
//     « cocoa powder » from the printed list where the site's data says « cocoa butter ».
//     So it ships alone only where the alternative is NO STEPS (AI off, budget spent, the
//     model empty-handed), and beside a model read only through `fullerSteps`;
//   · anything ambiguous is null, and the road is what it was before this existed:
//     numbers that are not exactly 1..n (a table of contents restarts them), a title that
//     is really a sentence, a line that is not one (a caption, an ad), a blank line inside
//     a step (paragraphs: the last step's end would be a guess), a method that does not
//     cook this recipe's ingredients, or a last step that may run on past its blank line.
const STEP_LINE = /^(?:step|[ée]tape)\s*(\d{1,2})(?:\s*[:.–—-]\s*\S.{0,78})?$/i
const SENTENCE = /\S\s+\S.*[.!?…»)]$/
export function stepHeadedMethod(pageText: string, ingredients: string[]): string[] | null {
  const lines = pageText.split('\n').map((l) => l.trim())
  const heads = lines.flatMap((l, i) => {
    const m = STEP_LINE.exec(l)
    return m ? [{ i, n: Number(m[1]), line: l }] : []
  })
  if (heads.length < 2 || heads.some((h, k) => h.n !== k + 1 || /[.!?]$/.test(h.line))) return null
  const out: string[] = []
  for (const [k, head] of heads.entries()) {
    const last = k === heads.length - 1
    let body = lines.slice(head.i + 1, heads[k + 1]?.i)
    while (body.length && !body[0]) body = body.slice(1)
    if (last) {
      const end = body.indexOf('')
      if (end >= 0) {
        const next = body.slice(end).find(Boolean)
        if (next && SENTENCE.test(next) && !NOISE_END.test(next) && !NOTE_HEADING.test(next)) return null
        body = body.slice(0, end)
      }
    }
    while (body.length && !body[body.length - 1]) body = body.slice(0, -1)
    if (!body.length || !body.every((l) => SENTENCE.test(l))) return null
    out.push(`## ${head.line}`, ...body)
  }
  // The method cooks THIS recipe: a « How to pick your chia seeds » list is numbered too.
  const said = normLoose(out.join(' '))
  const list = real(ingredients)
  const used = list.filter((l) =>
    normLoose(l)
      .split(' ')
      .some((w) => w.length >= 4 && !/^\d/.test(w) && said.includes(w)),
  ).length
  if (used < 2 || used * 2 < list.length) return null
  return refineSteps(out, { blob: 'keep' })
}

// A model may leave a line out; it may not lose one to a read that holds them all. The
// page's own lines replace the model's only when EVERY line the model kept is among them
// — so the swap can add, never remove (the model dropped the last two lines of Step 5,
// 2026-11-05, and nothing said so). Any difference and the model's read stands.
export function fullerSteps(modelSteps: string[], pageSteps: string[] | undefined): string[] {
  const kept = real(modelSteps)
  if (!pageSteps?.length || !kept.length) return modelSteps
  const have = new Set(real(pageSteps).map(normLoose))
  return kept.every((l) => have.has(normLoose(l))) ? pageSteps : modelSteps
}

// A note that is, word for word, a step says nothing new. Lines a model left unfiled go
// to the notes, so the very lines `fullerSteps` put back in the method sat there twice.
export function notesWithoutSteps(notes: string | null | undefined, steps: string[]): string | null {
  const said = new Set(real(steps).map(normLoose))
  return (notes ?? '').split('\n').filter((l) => !said.has(normLoose(l))).join('\n') || null
}

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
    const head = /^([^.!?:;]{3,60}?[a-zà-öœ)])([A-ZÀ-ÖŒ][a-zà-öœ])/.exec(s)?.[1]
    return head && lines.has(head) ? [`## ${head}`, s.slice(head.length)] : [s]
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
      const lw = words(p[i] ?? '')
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
    while (j < p.length && !holds(p[j] ?? '', name)) j++
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
  if (p.length !== structured.length || p.some((l, i) => normLoose(l) !== normLoose(structured[i] ?? ''))) return structured
  let i = 0
  return printed.map((l) => (isSectionHeading(l) ? l : (structured[i++] ?? l)))
}

// The no-model read of a fetched page: the draft, or an honest « no recipe here ».
export function importFromHtml(html: string, url: string, pick = 0): DraftOut {
  const r = readPage(sourceFromHtml(html, url), pick)
  return r.draft ?? draft({ title: r.title, image: r.image, source: url, empty: true, reason: 'no-recipe' })
}
