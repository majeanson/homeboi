// Recipe import — parse a recipe out of a fetched web page or pasted text.
// Almost every recipe site embeds schema.org/Recipe as JSON-LD
// (<script type="application/ld+json">); that structured block is far more
// reliable than scraping the rendered HTML, and needs no AI. We pull title /
// ingredients / steps / servings / times / image straight from it. Older sites
// use microdata (itemprop=…) instead — a second, regex-level fallback. Pasted
// text gets a heading-aware parser (Ingrédients / Préparation / …) so most
// pastes need no AI either.
//
// Step separation is format-aware: real recipes ship their structure (numbered
// lists, HowToSection groups, one-line-per-step) and we honour it — packed
// "1. … 2. …" blobs are split on their ascending markers, leading step numbers
// and bullets are stripped (the UI numbers steps itself), and an overlong blob
// is split at sentence boundaries instead of being truncated mid-word.
//
// All pure + defensive: any malformed block is skipped, never thrown. The
// Worker endpoint (api/recipe-import) does the fetch; this module does the
// parsing, so it's unit-testable with fixture HTML.

import { dropDanglingHeadings, isSectionHeading, makeSectionHeading } from './recipeSections'

export interface RecipeTimes {
  prep: number | null // minutes
  cook: number | null
  total: number | null
}

export const NO_TIMES: RecipeTimes = { prep: null, cook: null, total: null }

export interface ParsedRecipe {
  title: string | null
  ingredients: string[]
  steps: string[]
  image: string | null
  servings: number | null
  // The yield's unit when it isn't plain servings ("Donne 24 biscuits" →
  // "biscuits") — the UI then says "24 biscuits" instead of "24 portions".
  servingsUnit: string | null
  times: RecipeTimes
}

// Grab every JSON-LD <script> block's parsed JSON (objects or arrays). Tolerates
// attribute order/spacing and extra script attributes; skips unparseable blocks.
export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const raw = m[1].trim()
    if (!raw) continue
    try {
      out.push(JSON.parse(raw))
    } catch {
      // Some sites concatenate multiple objects or leave trailing commas; try a
      // lenient grab of the first balanced object.
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          out.push(JSON.parse(raw.slice(start, end + 1)))
        } catch {
          /* give up on this block */
        }
      }
    }
  }
  return out
}

// schema.org @type can be a string or an array of strings.
function typeIncludes(node: Record<string, unknown>, want: string): boolean {
  const t = node['@type']
  if (typeof t === 'string') return t.toLowerCase() === want.toLowerCase()
  if (Array.isArray(t)) return t.some((x) => typeof x === 'string' && x.toLowerCase() === want.toLowerCase())
  return false
}

// Walk a JSON-LD value (object / array / @graph) and return the first Recipe node.
export function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findRecipeNode(v)
      if (found) return found
    }
    return null
  }
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (typeIncludes(node, 'Recipe')) return node
    if (Array.isArray(node['@graph'])) return findRecipeNode(node['@graph'])
  }
  return null
}

// Decode the HTML entities that survive in JSON-LD / microdata text. Named map
// for the common French + fraction ones, then numeric (&#233; / &#xE9;) for the
// long tail older sites still emit.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  apos: "'",
  quot: '"',
  lt: '<',
  gt: '>',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  icirc: 'î',
  ocirc: 'ô',
  ucirc: 'û',
  ugrave: 'ù',
  ccedil: 'ç',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  hellip: '…',
  ndash: '–',
  mdash: '—',
}
const decodeEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = parseInt(hex, 16)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = +dec
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    })
    .replace(/&([a-z0-9]+);/gi, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole)
    .replace(/&#39;/g, "'")

// Many sites embed inline HTML inside JSON-LD instruction/ingredient text —
// Ricardo wraps words in <a href> links, others use <strong>/<em>/<br>. Strip
// tags first (keeping the inner words), then decode entities, then collapse
// whitespace, so a step reads "Chauffer une poêle…" not "Chauffer une <a
// href=…>poêle</a>…".
const clean = (s: string): string =>
  decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

function asStringList(value: unknown, max: number): string[] {
  if (!value) return []
  const arr = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const x of arr) {
    const s = typeof x === 'string' ? clean(x) : ''
    if (s) out.push(s.slice(0, 200))
    if (out.length >= max) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Step refinement — the format-aware core shared by every import path
// ---------------------------------------------------------------------------

// The hard per-step character cap. Steps are chunked at sentence boundaries
// first (sentenceChunks), so this only bites a run-on step with no sentence
// break — but it must be generous, or a long method line loses its tail. It's
// the SAME cap the storage layer uses (functions/api/recipes.ts) so a step that
// survives the import survives the save byte-for-byte.
export const MAX_STEP_LEN = 1000

// Strip a leading list marker the source format carried: a bullet/dash, an
// "Étape 3" / "Step 2" label, or a bare "1." / "2)" number. The UI numbers
// steps itself, so a kept prefix would read "1. 1. Faire bouillir…".
// A quantity like "1.5 L d'eau" survives (no whitespace after the dot), and
// "2 tasses…" survives (a bare number needs a separator to count as a marker).
export function stripStepPrefix(s: string): string {
  return s
    .trim()
    .replace(/^[•·▪◦‣*]+\s*/, '')
    .replace(/^[-–—]+\s+/, '')
    .replace(/^(?:[ée]tapes?|steps?)\s*\d{1,2}\s*(?:[:.)\-–—]\s*)?/i, '')
    .replace(/^\d{1,2}\s*[.):\-–—]\s+/, '')
    .replace(/^\d{1,2}\s*[.)]\s*(?=[A-ZÀ-ÖŒ])/, '')
    .trim()
}

// A usable instruction has letters and isn't just a stray label ("Étape 3").
const isStepText = (s: string): boolean =>
  s.length >= 3 && /[a-zà-öœ]/i.test(s) && !/^(?:[ée]tapes?|steps?)\s*\d*$/i.test(s)

// Split one string on an ascending run of markers (1, 2, 3, …) found by `re`
// (first capture group = the number). Only a run that starts at 1 and counts up
// is treated as a real numbered list — a lone "2)" or a temperature never
// splits. Returns [s] when no list is found.
function splitOnAscendingMarkers(s: string, re: RegExp): string[] {
  const marks: { index: number; end: number }[] = []
  let expected = 1
  let m: RegExpExecArray | null
  re.lastIndex = 0
  while ((m = re.exec(s))) {
    if (+m[1] === expected) {
      marks.push({ index: m.index, end: m.index + m[0].length })
      expected++
    }
  }
  if (marks.length < 2) return [s]
  const out: string[] = []
  const lead = s.slice(0, marks[0].index).trim()
  if (lead) out.push(lead)
  for (let i = 0; i < marks.length; i++) {
    const piece = s.slice(marks[i].end, marks[i + 1]?.index ?? s.length).trim()
    if (piece) out.push(piece)
  }
  return out
}

// Break a packed blob into its formatted pieces: "Étape 1 …" labels first, then
// "1. … 2. …" numbered markers, then mid-string bullets.
function splitPacked(s: string): string[] {
  const byLabel = splitOnAscendingMarkers(s, /(?:^|\s)(?:[ée]tapes?|steps?)\s*(\d{1,2})\s*[:.)\-–—]?\s*/gi)
  const byNumber = byLabel.flatMap((p) => splitOnAscendingMarkers(p, /(?:^|\s)(\d{1,2})\s*[.)]\s+(?=[A-ZÀ-ÖŒ«"\d])/g))
  return byNumber.flatMap((p) => p.split(/\s+[•▪]\s+/)).filter(Boolean)
}

// Split an overlong step at sentence boundaries and regroup into chunks of
// roughly `target` chars — so a wall-of-text method becomes readable steps
// instead of being truncated mid-word. Splits only after end punctuation
// followed by whitespace AND an uppercase/«/digit start, so decimals ("1.5 h")
// and abbreviations ("env. 5 min") never split.
export function sentenceChunks(s: string, target = 280): string[] {
  if (s.length <= target + 120) return [s]
  const sentences = s.split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖŒ«"(\d])/).filter(Boolean)
  if (sentences.length <= 1) return [s]
  const out: string[] = []
  let cur = ''
  for (const sen of sentences) {
    if (cur && cur.length + sen.length + 1 > target) {
      out.push(cur)
      cur = sen
    } else {
      cur = cur ? `${cur} ${sen}` : sen
    }
  }
  if (cur) out.push(cur)
  return out
}

// The shared refinement pipeline: clean → split packed lists → strip leading
// markers → drop junk → chunk overlong text → dedupe. Every import path (JSON-LD,
// microdata, paste, AI, photo OCR) funnels its raw steps through here.
export function refineSteps(raw: string[], max = 30): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const r of raw) {
    if (out.length >= max) break
    const cleaned = clean(r)
    // A "## Section" marker is structure, not an instruction — it passes
    // through whole: never split, never stripped, never deduped against steps.
    if (isSectionHeading(cleaned)) {
      out.push(cleaned.slice(0, MAX_STEP_LEN))
      continue
    }
    for (const piece of splitPacked(cleaned)) {
      const stripped = stripStepPrefix(piece)
      if (!isStepText(stripped)) continue
      for (const chunk of sentenceChunks(stripped)) {
        if (out.length >= max) break
        const final = chunk.slice(0, MAX_STEP_LEN)
        const key = final.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(final)
      }
    }
  }
  return out
}

// Repair steps stored under the OLD 200-char save cap (before the cap was raised
// to MAX_STEP_LEN). Such a step is a truncation — a verbatim PREFIX of its full
// text, chopped mid-word — while the full text survives untouched in the recipe's
// `original` snapshot. For each step that looks truncated (long, and not ending on
// a sentence boundary) and is a prefix of a strictly-longer original step, swap in
// the original. Pure, order-preserving, and idempotent: a healed step ends on a
// real boundary (or is no longer a prefix-of-longer), so a second pass is a no-op.
//
// Deliberately conservative — a step the cook shortened by hand won't be a prefix
// of the imported original (they diverge), so it's never clobbered. Originals are
// consumed left-to-right so two steps sharing a prefix each heal to their own.
export function healTruncatedSteps(steps: string[], originalSteps: string[] | undefined | null): string[] {
  if (!originalSteps?.length) return steps
  const norm = (s: string) => s.trim().toLowerCase()
  const used = new Set<number>()
  return steps.map((step) => {
    const s = step.trim()
    // A complete step ends on terminal punctuation; a truncation was cut mid-word.
    // Guard on length too so a genuinely short unfinished line is never touched —
    // real victims of the 200 cap are ~200 chars.
    if (s.length < 180 || /[.!?…»"”)]$/.test(s) || isSectionHeading(s)) return step
    const ns = norm(s)
    for (let j = 0; j < originalSteps.length; j++) {
      if (used.has(j)) continue
      const o = originalSteps[j].trim()
      if (o.length > s.length && norm(o).startsWith(ns)) {
        used.add(j)
        return o
      }
    }
    return step
  })
}

// recipeInstructions is the messy one: a plain string (newline-separated), an
// array of strings, an array of HowToStep {text}, or HowToSection nodes that
// nest itemListElement. Flatten any of these into ordered step strings, keeping
// section names ("Sauce", "Boulettes") as inline "## Section" heading lines
// when the recipe actually has several sections (one section covering
// everything adds nothing).
export function normalizeInstructions(value: unknown, max = 30): string[] {
  type Collected = { section: string | null; text: string }
  const collected: Collected[] = []
  let section: string | null = null
  const push = (s: string) => {
    const c = clean(s)
    if (!c || collected.length >= max * 2) return
    // A bare label line packed inside the instructions ("Glaçage :") is a
    // section marker, not a step — without this it leaks as a junk step.
    const sec = inlineSectionTitle(c)
    collected.push({ section, text: sec ? makeSectionHeading(sec) : c })
  }
  const walk = (v: unknown) => {
    if (collected.length >= max * 2) return
    if (typeof v === 'string') {
      // A single string may pack several steps separated by newlines.
      for (const part of v.split(/\r?\n+/)) push(part)
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (v && typeof v === 'object') {
      const node = v as Record<string, unknown>
      if (Array.isArray(node.itemListElement)) {
        const prev = section
        if (typeIncludes(node, 'HowToSection') && typeof node.name === 'string') section = clean(node.name) || prev
        walk(node.itemListElement)
        section = prev
        return
      }
      if (typeof node.text === 'string') {
        push(node.text)
        return
      }
      if (typeof node.name === 'string') push(node.name)
    }
  }
  walk(value)

  const sections = new Set(collected.map((c) => c.section).filter(Boolean))
  const useSections = sections.size >= 2
  const out: string[] = []
  let lastSection: string | null = null
  for (const c of collected) {
    if (out.length >= max) break
    for (const step of refineSteps([c.text], max)) {
      if (out.length >= max) break
      if (useSections && c.section && c.section !== lastSection) {
        out.push(makeSectionHeading(c.section).slice(0, MAX_STEP_LEN))
        lastSection = c.section
        if (out.length >= max) break
      }
      const final = step.slice(0, MAX_STEP_LEN)
      if (!out.includes(final)) out.push(final)
    }
  }
  return dropDanglingHeadings(out)
}

// ---------------------------------------------------------------------------
// Yield + times
// ---------------------------------------------------------------------------

const clampServings = (n: number): number | null => {
  const v = Math.floor(n)
  return v >= 1 && v <= 99 ? v : null
}

// recipeYield: a number, "4 portions", "4 à 6 personnes", "Serves 6", an array,
// or a QuantitativeValue {value}. Take the first plausible serving count; a
// weight-style yield ("350 g") has no number ≤ 99 and stays null.
export function parseYield(value: unknown): number | null {
  if (typeof value === 'number' && isFinite(value)) return clampServings(value)
  if (typeof value === 'string') {
    for (const m of value.matchAll(/\d+/g)) {
      const n = clampServings(+m[0])
      if (n) return n
    }
    return null
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = parseYield(v)
      if (r) return r
    }
    return null
  }
  if (value && typeof value === 'object') return parseYield((value as Record<string, unknown>).value)
  return null
}

// The yield's UNIT word when the recipe doesn't yield plain servings: "Donne
// 24 biscuits" → "biscuits", "12 muffins" → "muffins". Portion-style words
// return null so the UI keeps its default "portions" label. Forgiving: no
// readable unit just means null, never junk.
const PORTION_WORDS = /^(?:portions?|servings?|personnes?|convives?|parts?|people)$/i
export function parseYieldUnit(value: unknown): string | null {
  if (typeof value === 'string') {
    const m = value.match(/\d+\s*(?:[àa]\s*\d+\s*)?([a-zà-öœ' -]{3,24}?)\s*$/i)
    if (!m) return null
    const unit = m[1].trim().replace(/^(?:de|d['’])\s+/i, '').trim()
    return unit && !PORTION_WORDS.test(unit) ? unit.slice(0, 24) : null
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const r = parseYieldUnit(v)
      if (r) return r
    }
    return null
  }
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    // QuantitativeValue carries unitText; otherwise look inside .value.
    if (typeof node.unitText === 'string') {
      const u = node.unitText.trim().slice(0, 24)
      return u && !PORTION_WORDS.test(u) ? u : null
    }
    return parseYieldUnit(node.value)
  }
  return null
}

// ISO-8601 duration ("PT1H30M", "PT45M") → whole minutes. Null on junk or a
// zero/absurd value, so a site's empty "PT0M" never shows as a time.
export function isoToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = value
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i)
  if (!m) return null
  const total = +(m[1] ?? 0) * 1440 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0) + +(m[4] ?? 0) / 60
  const r = Math.round(total)
  return r > 0 && r <= 48 * 60 ? r : null
}

// ---------------------------------------------------------------------------
// Page parsers
// ---------------------------------------------------------------------------

// image can be a URL string, an array, or an ImageObject {url}. Take the first https one.
export function normalizeImage(value: unknown): string | null {
  const first = (v: unknown): string | null => {
    if (typeof v === 'string') return v.trim() || null
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = first(x)
        if (r) return r
      }
      return null
    }
    if (v && typeof v === 'object') {
      const u = (v as Record<string, unknown>).url
      return typeof u === 'string' ? u.trim() || null : null
    }
    return null
  }
  const u = first(value)
  if (!u) return null
  const https = u.replace(/^http:\/\//i, 'https://')
  return /^https:\/\//i.test(https) ? https.slice(0, 600) : null
}

// Parse a Recipe out of fetched page HTML via JSON-LD. Returns null when no
// Recipe block is present (caller then tries microdata, then the AI fallback).
export function parseRecipeJsonLd(html: string): ParsedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    const node = findRecipeNode(block)
    if (!node) continue
    const title = typeof node.name === 'string' ? clean(node.name).slice(0, 200) : null
    const ingredients = asStringList(node.recipeIngredient ?? node.ingredients, 40)
    const steps = normalizeInstructions(node.recipeInstructions, 30)
    // A node with a name but neither ingredients nor steps isn't a usable recipe.
    if (!title && ingredients.length === 0 && steps.length === 0) continue
    return {
      title,
      ingredients,
      steps,
      image: normalizeImage(node.image),
      servings: parseYield(node.recipeYield ?? node.yield),
      servingsUnit: parseYieldUnit(node.recipeYield ?? node.yield),
      times: {
        prep: isoToMinutes(node.prepTime),
        cook: isoToMinutes(node.cookTime),
        total: isoToMinutes(node.totalTime),
      },
    }
  }
  return null
}

// Microdata fallback for older sites with no JSON-LD: scan for itemprop
// elements at the regex level. Coarse but safe — anything it can't see just
// stays empty and the AI fallback takes over.
export function parseRecipeMicrodata(html: string): ParsedRecipe | null {
  const inner = (prop: string): string[] => {
    const out: string[] = []
    const re = new RegExp(
      `<([a-z][a-z0-9]*)\\b[^>]*\\bitemprop=["'](?:${prop})["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'gi',
    )
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < 80) out.push(m[2])
    // <meta itemprop="…" content="…"> variants (self-closing, no inner text).
    const metaRe = new RegExp(`<meta\\b[^>]*\\bitemprop=["'](?:${prop})["'][^>]*\\bcontent=["']([^"']*)["']`, 'gi')
    while ((m = metaRe.exec(html)) && out.length < 80) out.push(m[1])
    return out
  }

  const ingredients = inner('recipeIngredient|ingredients')
    .map((s) => clean(s).slice(0, 200))
    .filter(Boolean)
    .slice(0, 40)

  // Instructions may be one element per step OR a single container; turn block
  // closers into newlines before stripping tags so the inner list splits. An
  // <hN> INSIDE the container is a section heading ("Glaçage") — keep it as a
  // "## " marker instead of letting it leak as a junk step; a bare label line
  // ("Glaçage :") gets the same treatment.
  const stepLines = inner('recipeInstructions').flatMap((blockHtml) =>
    blockHtml
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t: string) => `\n## ${clean(t)}\n`)
      .replace(/<\/(?:li|p|div)>|<br\s*\/?>/gi, '\n')
      .split(/\n+/)
      .map((s) => clean(s))
      .filter(Boolean)
      .map((s) => {
        const sec = inlineSectionTitle(s)
        return sec ? makeSectionHeading(sec) : s
      }),
  )
  const steps = dropDanglingHeadings(refineSteps(stepLines, 30))

  if (ingredients.length < 2 && steps.length === 0) return null

  const meta = (re: RegExp): string | null => {
    const m = html.match(re)
    return m ? clean(m[1]) || null : null
  }
  const title =
    inner('name').map((s) => clean(s)).find(Boolean)?.slice(0, 200) ??
    meta(/<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["']([^"']*)["']/i)?.slice(0, 200) ??
    null
  const image = normalizeImage(meta(/<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']*)["']/i))
  const servings = parseYield(inner('recipeYield')[0] ?? null)
  const servingsUnit = parseYieldUnit(inner('recipeYield')[0] ?? null)

  return { title, ingredients, steps, image, servings, servingsUnit, times: NO_TIMES }
}

// ---------------------------------------------------------------------------
// Ingredient grouping recovered from the rendered page
// ---------------------------------------------------------------------------

// schema.org has no ingredient sections — JSON-LD hands us a FLAT list even
// when the page clearly shows "Biscuits" / "Glaçage" groups (Ricardo, WPRM
// blogs). Recover them from the page text: locate the region where the known
// ingredient lines appear, and any short label line BETWEEN them becomes a
// "## " marker. All-or-nothing: if any ingredient can't be located verbatim,
// return the flat list untouched — a wrong grouping is worse than none.

const normLoose = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// A line between two located ingredients that reads as a group label: short,
// no digits, not a sentence, not one of the big block headings (those mark the
// whole list, not a part — except an "Ingrédients du/pour…" repeat, whose
// qualifier IS the part name).
function groupLabel(line: string): string | null {
  const s = stripBullet(line).replace(/\s*:$/, '').trim()
  if (s.length < 2 || s.length > 40) return null
  if (/\d/.test(s) || !/[a-zà-öœ]/i.test(s)) return null
  if (/[.!?;,]$/.test(s)) return null
  if (s.split(/\s+/).length > 5) return null
  const ingH = s.match(ING_HEADING)
  if (ingH) return qualifierTitle(ingH[1])
  if (STEP_HEADING.test(s) || NOTE_HEADING.test(s) || TIME_LINE.test(s)) return null
  return s
}

export function regroupIngredients(html: string, ingredients: string[]): string[] {
  if (ingredients.length < 4 || ingredients.some((l) => isSectionHeading(l))) return ingredients
  const lines = htmlToText(html, 60000)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const keys = ingredients.map(normLoose)
  const used = new Set<number>()
  // First UNUSED ingredient rendered verbatim as this line (duplicates like a
  // "Sel" in two sections consume one slot each).
  const matchIdx = (line: string): number => {
    const k = normLoose(stripBullet(line))
    if (!k) return -1
    for (let i = 0; i < keys.length; i++) if (!used.has(i) && keys[i] === k) return i
    return -1
  }
  const rows = lines.map((line) => {
    const ing = matchIdx(line)
    if (ing >= 0) used.add(ing)
    return { ing: ing >= 0 ? ing : null, line }
  })
  if (used.size !== ingredients.length) return ingredients

  const hits = rows.map((r, i) => (r.ing != null ? i : -1)).filter((i) => i >= 0)
  // The first group's label sits just BEFORE its first ingredient — pull it in
  // so "Biscuits" isn't lost (mid-list labels are already inside the window).
  let start = hits[0]
  if (start > 0 && rows[start - 1].ing == null && groupLabel(rows[start - 1].line)) start--
  const out: string[] = []
  for (let i = start; i <= hits[hits.length - 1]; i++) {
    const r = rows[i]
    if (r.ing != null) {
      out.push(ingredients[r.ing])
    } else {
      const sec = groupLabel(r.line)
      if (sec) out.push(makeSectionHeading(sec))
    }
  }
  const grouped = dropDanglingHeadings(out)
  const heads = grouped.filter((l) => isSectionHeading(l))
  if (heads.length === 0) return ingredients
  // One heading covering the WHOLE list adds nothing; one mid-list makes two
  // real groups and stays.
  if (heads.length === 1 && isSectionHeading(grouped[0])) return ingredients
  return grouped.slice(0, 40)
}

// ---------------------------------------------------------------------------
// Pasted-text parser (no AI)
// ---------------------------------------------------------------------------

export interface PastedRecipe {
  title: string | null
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  times: RecipeTimes
  notes: string | null
  // True when the text carried real recipe structure (both section headings
  // found) — the caller can then skip the AI entirely.
  confident: boolean
}

// Section headings as recipes actually print them — FR (Québec) + EN. A heading
// is the keyword, at most a short qualifier ("Ingrédients pour la sauce"),
// optionally a colon — never a full sentence.
// "Étape(?!\s*\d)" / "Step(?!\s*\d)": a numbered "Étape 1 : Préchauffer…" line
// is a STEP, not the section heading — never swallow it.
// The optional capture is the heading's qualifier ("Ingrédients POUR LE
// GLAÇAGE :") — when a paste has several ingredient/step blocks, the qualifier
// becomes that block's "## " section marker.
const ING_HEADING = /^(?:les\s+)?ingr[ée]dients?\b\s*([^.!?]{0,30}?)\s*:?$/i
const STEP_HEADING =
  /^(?:pr[ée]paration|instructions?|m[ée]thode|method|directions?|[ée]tapes?(?!\s*\d)|steps?(?!\s*\d)|marche\s+[àa]\s+suivre|mode\s+d['’]emploi)\b\s*([^.!?]{0,30}?)\s*:?$/i
const NOTE_HEADING = /^(?:notes?|remarques?|conseils?|astuces?|tips?|variantes?)\b[^.!?]{0,10}:?$/i

// "Préparation : 20 min", "Cuisson 1 h 30", "Total time: 45 minutes" — the time
// block most printed recipes start with. Must be checked BEFORE the step
// heading ("Préparation" alone flips the mode; with a duration it's a time).
const TIME_LINE =
  /^(pr[ée]p(?:aration)?(?:\s*time)?|cuisson|cook(?:ing)?(?:\s*time)?|temps\s+total|total(?:\s*time)?)\s*:?\s+(.{1,30})$/i

// Free-text duration → minutes: "1 h 30", "20 min", "45 minutes", "1 heure".
export function textToMinutes(s: string): number | null {
  // "1 h 30" first — the trailing 30 carries no unit of its own.
  const hm = s.match(/(\d+)\s*(?:h(?:eures?|rs?)?|hours?)\s*(\d{1,2})\b/i)
  const h = hm ?? s.match(/(\d+)\s*(?:h(?:eures?|rs?)?|hours?)\b/i)
  const min = hm ? null : s.match(/(\d+)\s*(?:min(?:utes?)?|mn)\b/i)
  if (!h && !min) return null
  const total = (h ? +h[1] * 60 : 0) + (hm ? +hm[2] : min ? +min[1] : 0)
  return total > 0 && total <= 48 * 60 ? total : null
}

// Second branch ("Donne 24 biscuits") also captures the unit word so the card
// can say "24 biscuits" instead of "24 portions".
const SERVINGS_LINE =
  /(?:^|\b)(\d{1,2})\s*(?:[àa]\s*\d{1,2}\s*)?(?:portions?|servings?|personnes?|convives|parts)\b|(?:donne|serves?|rendement|yield)\s*:?\s*(\d{1,2})\b\s*([a-zà-öœ]{3,24})?/i

// An ingredient-looking line: bullet or quantity-leading, short. Used only by
// the no-headings fallback.
const ING_LIKE = /^[-•*–]?\s*(?:\d|[¼½¾⅓⅔⅛]|une?\b|deux\b|trois\b|quelques\b)/i

const stripBullet = (s: string): string => s.replace(/^[-•·▪◦‣*–—]+\s*/, '').trim()

// A heading's qualifier becomes a section title only when it's wordy, not a
// count ("pour 4 personnes") — digits mean it's meta, not a part name.
const qualifierTitle = (q: string | undefined): string | null => {
  const s = (q ?? '').replace(/^[:\-–—\s]+/, '').trim()
  return s && !/\d/.test(s) ? s : null
}

// Inside the ingredient or step block, a short label line introduces a named
// part of the recipe ("Glaçage :", "Garniture:", "Pour le glaçage", "For the
// filling") — keep it as an inline "## " section marker. Conservative: short,
// no digits (a quantity/temperature line is content), never a full sentence.
function inlineSectionTitle(line: string): string | null {
  const s = stripBullet(line)
  if (/\d/.test(s)) return null
  const colon = s.match(/^([^.!?:;,]{2,40})\s*:$/)
  if (colon) return colon[1].trim()
  // Article required after pour/for — "Pour le glaçage" / "For the filling"
  // are part names, but the ENGLISH verb "Pour in the milk" is an instruction.
  if (/^(?:pour\s+(?:le|la|les|l['’])|for\s+the\b)[^.!?:;,]{1,30}$/i.test(s) && s.split(/\s+/).length <= 5) return s
  return null
}

// Parse text the user pasted (from a site, a PDF, a message). Heading-aware
// first; when the paste has no headings, fall back to shape detection
// (quantity-leading lines = ingredients, prose after = steps). The result's
// `confident` says whether the structure was explicit.
export function parsePastedRecipe(text: string): PastedRecipe {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
  let mode: 'pre' | 'ing' | 'steps' | 'notes' = 'pre'
  let title: string | null = null
  let servings: number | null = null
  let servingsUnit: string | null = null
  const times: RecipeTimes = { prep: null, cook: null, total: null }
  const ings: string[] = []
  const stepLines: string[] = []
  const noteLines: string[] = []
  let sawIngHeading = false
  let sawStepHeading = false

  for (const line of lines) {
    if (!line) continue

    // Meta lines can appear anywhere; consume them when they stand alone.
    const tm = line.match(TIME_LINE)
    if (tm) {
      const mins = textToMinutes(tm[2])
      if (mins) {
        const kind = tm[1].toLowerCase()
        if (/^cuisson|^cook/.test(kind)) times.cook ??= mins
        else if (/total/.test(kind)) times.total ??= mins
        else times.prep ??= mins
        continue
      }
    }
    if (servings == null) {
      const sv = line.match(SERVINGS_LINE)
      if (sv) {
        servings = clampServings(+(sv[1] ?? sv[2]))
        // "Donne 24 biscuits" — keep the unit word ("biscuits") when it isn't
        // a plain portion word; the UI then labels servings with it.
        const unit = sv[3]?.trim()
        if (servings && unit && !PORTION_WORDS.test(unit)) servingsUnit = unit.slice(0, 24)
        // A short line around the meta block is the marker itself — consume it.
        // Inside the method, "Diviser en 4 portions…" is a real step: keep it.
        if (mode !== 'steps' && line.length <= 40) continue
      }
    }

    const ingH = line.match(ING_HEADING)
    if (ingH) {
      mode = 'ing'
      sawIngHeading = true
      // "Ingrédients pour le glaçage :" — the qualifier names this part.
      const sec = qualifierTitle(ingH[1])
      if (sec) ings.push(makeSectionHeading(sec))
      continue
    }
    const stepH = line.match(STEP_HEADING)
    if (stepH) {
      mode = 'steps'
      sawStepHeading = true
      const sec = qualifierTitle(stepH[1])
      if (sec) stepLines.push(makeSectionHeading(sec))
      continue
    }
    if (NOTE_HEADING.test(line)) {
      mode = 'notes'
      continue
    }

    if (mode === 'pre') {
      if (!title && line.length <= 120) title = line.slice(0, 200)
      // Further preamble (description, byline) is dropped — it isn't the recipe.
      continue
    }
    if (mode === 'ing') {
      const sec = inlineSectionTitle(line)
      if (sec) {
        ings.push(makeSectionHeading(sec))
        continue
      }
      const ing = stripBullet(line).slice(0, 200)
      if (ing) ings.push(ing)
      continue
    }
    if (mode === 'steps') {
      const sec = inlineSectionTitle(line)
      stepLines.push(sec ? makeSectionHeading(sec) : line)
      continue
    }
    noteLines.push(line)
  }

  // No headings at all — classify by line shape instead.
  if (!sawIngHeading && !sawStepHeading && ings.length === 0 && stepLines.length === 0) {
    let pastTitle = false
    for (const line of lines) {
      if (!line) continue
      if (!pastTitle) {
        pastTitle = true
        continue // the title was already captured above
      }
      if (TIME_LINE.test(line) || (line.length <= 40 && SERVINGS_LINE.test(line))) continue // meta, already read
      if (ING_LIKE.test(line) && line.length <= 80) ings.push(stripBullet(line).slice(0, 200))
      else stepLines.push(line)
    }
  }

  // Merge wrapped lines (a continuation starts lowercase while the previous
  // line ended mid-sentence) before the shared refinement pass. A "## " section
  // marker never merges in either direction — it isn't part of any sentence.
  const merged: string[] = []
  for (const l of stepLines) {
    const prev = merged[merged.length - 1]
    if (prev && !isSectionHeading(prev) && !isSectionHeading(l) && !/[.!?:]$/.test(prev) && /^[a-zà-öœ]/.test(l))
      merged[merged.length - 1] = `${prev} ${l}`
    else merged.push(l)
  }
  const steps = dropDanglingHeadings(refineSteps(merged, 30))
  const notes = noteLines.join(' ').trim().slice(0, 2000) || null

  const ingredients = dropDanglingHeadings(ings.slice(0, 40))
  const realIngs = ingredients.filter((l) => !isSectionHeading(l))
  return {
    title,
    ingredients,
    steps,
    servings,
    servingsUnit,
    times,
    notes,
    confident: sawIngHeading && sawStepHeading && realIngs.length >= 2 && steps.length >= 1,
  }
}

// Lines that are the model TALKING ABOUT the recipe instead of transcribing it.
// A vision/LLM model often appends "helpful" remarks, apologies, or observations
// that were never printed in the photo — "Remarque", "La recette n'indique pas
// combien de portions…", "I cannot read…". Those leaked into the user's draft as
// fake ingredients/steps. Anchored to the START of a line (a real step that
// merely CONTAINS "note" survives) and deliberately narrow — better to miss one
// stray remark than to eat a real instruction. A leading "## " is peeled first so
// a "## Remarque" heading the model emitted is caught too.
const AI_COMMENTARY: RegExp[] = [
  // A bare leaked label as its own line ("Remarque", "Note :", "N.B.").
  /^(?:remarques?|notes?|nota(?:\s*bene)?|n\.?\s*b\.?|avertissements?|disclaimer)\s*:?\s*$/i,
  // "La recette / le texte / l'image n'indique pas / ne précise pas / est illisible…"
  /^(?:la\s+recette|le\s+texte|l['’]image|la\s+photo|cette\s+(?:recette|image))\b.*\b(?:n['’]indique|ne\s+(?:précise|pr[ée]cise|mentionne|donne|dit|sp[ée]cifie|permet)|est\s+(?:partiellement\s+)?illisible)/i,
  /^(?:the\s+recipe|the\s+image|the\s+text|this\s+(?:recipe|image))\b.*\b(?:does\s+not|doesn['’]t|is\s+(?:partially\s+)?(?:unclear|illegible|cut|not\s+))/i,
  // Apologies / inability / hedging the model opens a meta-line with.
  /^(?:désolé|d[ée]sol[ée]|malheureusement|je\s+ne\s+peux|je\s+n['’]ai\s+pas\s+pu|il\s+(?:semble|para[îi]t|manque|n['’]y\s+a\s+pas)|on\s+ne\s+(?:voit|peut|distingue))/i,
  /^(?:i\s+(?:cannot|can['’]t|am\s+unable|couldn['’]t|don['’]t)|sorry|unfortunately|please\s+note|as\s+an\s+ai|it\s+(?:seems|appears)\b)/i,
]
export function stripAiCommentary(lines: string[]): string[] {
  return lines.filter((line) => {
    const s = line.replace(/^#{1,6}\s*/, '').trim()
    return s !== '' && !AI_COMMENTARY.some((re) => re.test(s))
  })
}

// A vision/LLM model asked to "read this recipe" very often answers in prose or
// markdown ("**Ingrédients**\n* 8 choux…\n**Préparation**\n1. …") instead of the
// JSON we requested — vision models follow structured-output instructions far
// less reliably than the text model. The OCR itself is usually perfect; only the
// wrapping is wrong. Flatten the markdown (bold, #-headings, ``` fences, leading
// bullets stay — the paste parser strips those itself) so the heading-aware
// parsePastedRecipe can read it, then reuse it. This turns a "returned no JSON"
// reply into a usable draft instead of a thrown-away read.
export function parseMarkdownRecipe(text: string): PastedRecipe {
  const flat = text
    .replace(/```[a-z]*/gi, '') // ``` / ```json fences → gone (their content stays)
    .replace(/`/g, '')
    .split(/\r?\n/)
    .map((line) => {
      // Markdown TABLE rows (cloud OCR renders a tabular ingredient list as
      // "| 225 g | de farine |"): drop the |---|---| separator row, then join the
      // cells back into one plain line so the heading-aware parser reads it.
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) return ''
        line = line
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
          .join(' ')
      }
      return line
        .replace(/^\s{0,3}#{1,6}\s+/, '') // "## Préparation" → "Préparation"
        .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold** → bold (a "* item" bullet is untouched)
        .replace(/__([^_]+)__/g, '$1') // __bold__ → bold
        .trim()
    })
    .join('\n')
  return parsePastedRecipe(flat)
}

// Does this paste carry markdown structure? True for the cloud OCR's output
// (headings, bold, tables) and for a paste from a markdown editor. Cheap and
// deliberately loose — a false positive just routes through the flattener, which
// is a no-op on plain text.
export function looksLikeMarkdown(text: string): boolean {
  return /^\s{0,3}#{1,6}\s/m.test(text) || /\*\*[^*\n]+\*\*/.test(text) || /^\s*\|.+\|\s*$/m.test(text)
}

// The ONE paste/transcript entry point: markdown-shaped text (the cloud OCR
// reader answers in markdown; so do many editors) flattens first so its
// "## Ingrédients" headings actually hit the heading-aware parser — before this,
// a faithful cloud read fell through "not confident" into the generative AI
// structuring, re-exposing it to exactly the rewrites the reader was bought to
// avoid. Plain text goes straight through.
export function parseRecipeText(text: string): PastedRecipe {
  return looksLikeMarkdown(text) ? parseMarkdownRecipe(text) : parsePastedRecipe(text)
}

// A recipe page is mostly NOT the recipe. Nav, cookie banner, ad rails and the
// "more recipes" carousel routinely run longer than the model's whole input
// budget, so slicing the head feeds it the menu bar and cuts off before the food:
// on recettes.qc.ca the word "Ingrédients" first lands at char 6441 — 441 past the
// 6000-char cap the AI fallback used to take. Window onto the recipe instead:
// anchor on the ingredients heading (or, failing that, the preparation one) and
// spend the budget from there, keeping a little of the lead-in because the title,
// yield and times usually sit just above that heading.
const HEADING_ANCHORS = [
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:ingr[ée]dients?)[ \t]*:?[ \t]*$/im,
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:pr[ée]paration|instructions?|directions?|m[ée]thode|method|[ée]tapes?|steps?)[ \t]*:?[ \t]*$/im,
]
// Loose fallback for pages that don't put the heading on its own line.
const LOOSE_ANCHORS = [/ingr[ée]dients?/i, /pr[ée]paration|instructions?|directions?/i]

export function recipeTextWindow(text: string, max = 6000): string {
  if (text.length <= max) return text
  const hit =
    HEADING_ANCHORS.map((re) => re.exec(text)?.index).find((i) => i !== undefined) ??
    LOOSE_ANCHORS.map((re) => re.exec(text)?.index).find((i) => i !== undefined)
  if (hit === undefined) return text.slice(0, max) // no anchor — head slice is all we've got
  const lead = Math.min(600, Math.floor(max * 0.1))
  const start = Math.max(0, hit - lead)
  return text.slice(start, start + max)
}

// Crude HTML→text for the AI fallback when there's no structured data: drop
// scripts/styles, keep block boundaries as newlines (so the model — and the
// paste parser — still sees the page's line structure), strip tags, collapse.
// `max` defaults to the model budget, but a caller that intends to window the
// result (see recipeTextWindow) passes a large max so the recipe isn't already
// truncated away before the window can find it.
// ---------------------------------------------------------------------------
// AI-structuring honesty check — did the model change any number?
// ---------------------------------------------------------------------------
// The AI structuring prompt says "organize WITHOUT inventing", but a generative
// pass over text can still flip a fraction or "helpfully" convert a unit
// ("225 g (1/2 lb)" → "(2 tasses)") — and no downstream check can catch a g→cup
// invention by arithmetic. This is the STRUCTURAL guard: every number in the
// model's output must already exist in the source transcript. Lines carrying a
// foreign number (or a foreign number+unit pairing) are returned so the verify
// panel flags them "à confirmer" and the read report lists them. Pure, no AI.

// Vulgar-fraction glyphs → ascii, so "¾" in the source vouches for "3/4" out.
const VULGAR_NUM: Record<string, string> = {
  '¼': '1/4', '½': '1/2', '¾': '3/4', '⅐': '1/7', '⅑': '1/9', '⅒': '1/10',
  '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
}
const foldNumbers = (s: string): string =>
  s.replace(/[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (g) => ` ${VULGAR_NUM[g]} `)

// Every numeric token in the text, decimal comma normalized to a dot so "1,5"
// and "1.5" vouch for each other. "1 1/2" yields "1" and "1/2".
const NUM_TOKEN = /\d+\/\d+|\d+[.,]\d+|\d+/g
function numberTokens(s: string): string[] {
  return [...foldNumbers(s).matchAll(NUM_TOKEN)].map((m) => m[0].replace(',', '.'))
}

// Kitchen units worth pairing with their amount — a converted "(2 tasses)" is
// caught by the PAIR even when a bare "2" exists elsewhere in the source (there
// is always a "2" somewhere). Only unambiguous single-word units; the multi-word
// spoons are covered well enough by the bare-number tier.
const UNIT_CANON: [RegExp, string][] = [
  [/^tasses?$/i, 'cup'], [/^cups?$/i, 'cup'],
  [/^ml$/i, 'ml'], [/^l$/i, 'l'], [/^litres?$/i, 'l'], [/^liters?$/i, 'l'],
  [/^g$/i, 'g'], [/^grammes?$/i, 'g'], [/^grams?$/i, 'g'], [/^kg$/i, 'kg'],
  [/^lbs?$/i, 'lb'], [/^livres?$/i, 'lb'], [/^pounds?$/i, 'lb'], [/^oz$/i, 'oz'],
]
const canonUnit = (word: string): string | null => {
  const w = word.replace(/[.,;:!?)]+$/, '')
  for (const [re, canon] of UNIT_CANON) if (re.test(w)) return canon
  return null
}
const PAIR_TOKEN = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+[.,]\d+|\d+)\s*(?:de\s+|d['’]\s*)?([a-zà-öœ.]+)/gi
function measurePairs(s: string): string[] {
  const out: string[] = []
  for (const m of foldNumbers(s).matchAll(PAIR_TOKEN)) {
    const unit = canonUnit(m[2])
    if (unit) out.push(`${m[1].replace(',', '.').replace(/\s+/g, ' ')}|${unit}`)
  }
  return out
}

// The subset of `lines` that carry a number (or amount+unit pairing) absent from
// `source` — the model put it there, the page didn't. Section headings skipped.
export function linesWithForeignNumbers(source: string, lines: string[]): string[] {
  const nums = new Set(numberTokens(source))
  const pairs = new Set(measurePairs(source))
  if (!nums.size) return []
  return lines.filter((l) => {
    if (isSectionHeading(l)) return false
    if (numberTokens(l).some((tok) => !nums.has(tok))) return true
    return measurePairs(l).some((p) => !pairs.has(p))
  })
}

export function htmlToText(html: string, max = 6000): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      // Source whitespace is insignificant in HTML — structure comes from tags.
      .replace(/\s+/g, ' ')
      .replace(/<\/(?:p|li|div|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}
