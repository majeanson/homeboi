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
  // Notes the structured data itself carries (a notes block inside the microdata
  // method); schema.org JSON-LD has none — the page text supplies them then.
  notes?: string | null
  // A photo per step (HowToStep.image), aligned to `steps`; absent when none has one.
  stepImageUrls?: (string | null)[]
  // Several Recipe nodes on the page: each one's title, in page order.
  candidates?: { i: number; title: string | null }[]
}

// One JSON-LD block's raw text → its parsed JSON, or undefined. Lenient: some sites
// concatenate objects or leave trailing commas, so a failed parse retries on the first
// balanced-looking object. Shared by the HTML path and the captured-page path (the
// bookmarklet sends each block's raw text, already pulled out of the page).
export function parseJsonLdText(raw: string): unknown {
  const s = raw.trim()
  if (!s) return undefined
  try {
    return JSON.parse(s)
  } catch {
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1))
      } catch {
        /* give up on this block */
      }
    }
    return undefined
  }
}

// Grab every JSON-LD <script> block's parsed JSON (objects or arrays). Tolerates
// attribute order/spacing and extra script attributes; skips unparseable blocks.
export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = []
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const v = parseJsonLdText(m[1])
    if (v !== undefined) out.push(v)
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

// Every Recipe node in a JSON-LD value, in document order.
export function findRecipeNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(findRecipeNodes)
  if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (typeIncludes(node, 'Recipe')) return [node]
    if (Array.isArray(node['@graph'])) return findRecipeNodes(node['@graph'])
  }
  return []
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

// Decode the HTML entities that survive in JSON-LD / microdata text: named, then
// numeric (&#233; / &#xE9;) for the long tail older sites still emit.
// The HTML 4 Latin-1 set in code-point order (U+00A0…U+00FF), so every accented capital
// decodes as itself — the old table was lowercase-only and matched case-insensitively, so
// « &Eacute;tapes » came out « étapes » — plus the typographic ones recipe sites use.
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute ' +
  'micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig ' +
  'Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash ' +
  'Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc ' +
  'euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
  'yacute thorn yuml'
const NAMED_ENTITIES: Record<string, string> = {
  ...Object.fromEntries(LATIN1.split(' ').map((n, i) => [n, String.fromCharCode(0xa0 + i)])),
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  OElig: 'Œ',
  oelig: 'œ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  sbquo: '‚',
  bdquo: '„',
  hellip: '…',
  prime: '′',
  Prime: '″',
  ndash: '–',
  mdash: '—',
  bull: '•',
  euro: '€',
  trade: '™',
  frac13: '⅓',
  frac23: '⅔',
  frac18: '⅛',
  thinsp: ' ',
  ensp: ' ',
  emsp: ' ',
  zwj: '',
  zwnj: '',
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
    // Case matters (« &Eacute; » is É); an all-caps spelling of a lowercase-only name
    // (« &NBSP; ») still resolves.
    .replace(/&([a-z0-9]+);/gi, (whole, name: string) => NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()] ?? whole)

// Many sites embed inline HTML inside JSON-LD instruction/ingredient text —
// Ricardo wraps words in <a href> links, others use <strong>/<em>/<br>. Strip
// tags first (keeping the inner words), then decode entities, then collapse
// whitespace, so a step reads "Chauffer une poêle…" not "Chauffer une <a
// href=…>poêle</a>…".
// Invisible characters a site leaves in its text: the soft hyphen (« la [soft hyphen]cassonade »,
// Ricardo's JSON-LD) and the zero-width ones. A cook never typed them, and a line that
// carries one no longer matches the same words on the page.
const INVISIBLE = new RegExp('[' + String.fromCharCode(0xad, 0x200b) + '-' + String.fromCharCode(0x200d, 0x2060, 0xfeff) + ']', 'g')
const clean = (s: string): string =>
  decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()

// WP Recipe Maker composes a JSON-LD ingredient as « amount unit name (notes) », and its
// notes field often carries its own punctuation: the page prints « 1 large onion (or 2
// small onions), sliced » and « 2 tbsp vegetable oil, divided », the JSON-LD says « 1
// large onion ((or 2 small onions), sliced) » and « 2 tbsp vegetable oil (, divided) ».
// A trailing group that opens on « ( » or « , » is that wrapper: unwrap it, as printed.
export function tidyIngredientLine(s: string): string {
  if (!s.endsWith(')')) return s
  let depth = 0
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++
    else if (s[i] === '(' && --depth === 0) {
      const inner = s.slice(i + 1, -1).trim()
      const head = s.slice(0, i).trimEnd()
      if (inner.startsWith(',')) return `${head}${inner}`
      if (inner.startsWith('(')) return `${head} ${inner}`
      return s
    }
  }
  return s
}

function asStringList(value: unknown, max: number): string[] {
  if (!value) return []
  const arr = Array.isArray(value) ? value : [value]
  const out: string[] = []
  for (const x of arr) {
    const s = typeof x === 'string' ? clean(x) : ''
    if (s) out.push(s.slice(0, MAX_INGREDIENT_LEN))
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

// How many STEPS (section headings not counted) an import keeps. It was 30, and a
// long method lost its tail silently (Marc, 2026-10-27: « les étapes arrêtent avant
// la fin »). The save keeps MAX_STEP_ROWS — these steps plus room for their headings
// — so a step that survives the import survives the save.
export const MAX_STEPS = 60
export const MAX_STEP_ROWS = MAX_STEPS + 20
// The ingredient-line cap every import path shares (it was a bare 40 in five places).
// 80, not 40: the count includes « ## » part headings, and a four-part recipe (Marc's
// « Saumon à l'asiatique »: marinade, bowl, garnishes, sauce — 2026-10-30) is thirty
// lines before its headings. A line past the cap vanished without a word.
export const MAX_INGREDIENTS = 80
// Per-line caps, shared with the save (functions/api/recipes.ts) so a line that survives
// the import survives the save byte for byte. They were a bare 200 / 2000 in nine
// places; an ingredient with its own note (« …, ou 1 grosse, pelées et coupées en petits
// cubes (facultatif, voir la note) ») and a cookbook's Notes box both ran past them, and
// a cut is silent. The row is TEXT either way — these only bound a hostile client.
export const MAX_INGREDIENT_LEN = 400
export const MAX_NOTES_LEN = 4000

// One sentence boundary: end punctuation, then whitespace and an uppercase / « /
// digit start — so « env. 5 min » and « 1.5 L » never split.
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÀ-ÖŒ«"(\d])/

export interface RefineOpts {
  /** Cap on STEPS (headings are structure and never count). Default MAX_STEPS. */
  max?: number
  /**
   * How a long piece is handled.
   *  'keep'      — the source delimited its steps (a HowToStep, a printed line): a
   *                piece stays ONE step; only a piece over MAX_STEP_LEN is chunked
   *                at sentences (never truncated).
   *  'sentences' — one sentence per step: a single paragraph IS the whole method.
   *  'auto'      — 'sentences' only when the input is ONE long paragraph (> 400
   *                chars, no packed list inside); 'keep' otherwise. Default.
   */
  blob?: 'auto' | 'keep' | 'sentences'
}

// A step over MAX_STEP_LEN is CHUNKED, never truncated: at sentence boundaries
// first (~800 chars a chunk), then — for a run-on with no sentence break at all —
// at the last space before the cap. Every word reaches the form.
function fitStep(s: string): string[] {
  if (s.length <= MAX_STEP_LEN) return [s]
  return sentenceChunks(s, 800).flatMap((c) => {
    const out: string[] = []
    let rest = c
    while (rest.length > MAX_STEP_LEN) {
      const cut = rest.lastIndexOf(' ', MAX_STEP_LEN)
      const at = cut > MAX_STEP_LEN / 2 ? cut : MAX_STEP_LEN
      out.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) out.push(rest)
    return out
  })
}

// The shared refinement pipeline: clean → split packed lists → strip leading
// markers → drop junk → (split a lone paragraph | chunk an overlong step).
// Every import path (JSON-LD, microdata, paste, AI, photo OCR) funnels its raw steps
// through here. It used to chunk EVERY step over 400 chars into ~280-char pieces —
// one per sentence — so a site's 450-char paragraph came out as three steps (Marc,
// 2026-10-27: « ça rajoute des étapes pour chaque phrase »). The source's own step
// boundaries win now. It also used to DEDUPE: a step printed twice was kept once —
// but a multi-part recipe prints « Mélanger tous les ingrédients. » under each part,
// and the second part lost its step in silence (2026-10-30). The audit's 'dup-step'
// flag exists for exactly this and could never fire; now it does, and the cook decides.
export function refineSteps(raw: string[], opts: RefineOpts = {}): string[] {
  const max = opts.max ?? MAX_STEPS
  const cleanedAll = raw.map(clean)
  let mode = opts.blob ?? 'auto'
  if (mode === 'auto') {
    const body = cleanedAll.filter((c) => c && !isSectionHeading(c))
    const lone = body.length === 1 ? splitPacked(body[0]) : []
    mode = lone.length === 1 && lone[0].length > 400 ? 'sentences' : 'keep'
  }
  const out: string[] = []
  let count = 0
  for (const cleaned of cleanedAll) {
    if (count >= max) break
    // A "## Section" marker is structure, not an instruction — it passes
    // through whole: never split, never stripped, never deduped against steps.
    if (isSectionHeading(cleaned)) {
      out.push(cleaned.slice(0, MAX_STEP_LEN))
      continue
    }
    for (const piece of splitPacked(cleaned)) {
      const stripped = stripStepPrefix(piece)
      if (!isStepText(stripped)) continue
      const parts =
        mode === 'sentences'
          ? stripped.split(SENTENCE_SPLIT).filter(Boolean).flatMap(fitStep)
          : fitStep(stripped)
      for (const chunk of parts) {
        if (count >= max) break
        out.push(chunk.slice(0, MAX_STEP_LEN))
        count++
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
export function normalizeInstructions(value: unknown, max = MAX_STEPS): string[] {
  return normalizeInstructionsWithImages(value, max).steps
}

// …and each step's own photo (a HowToStep `image`: a URL, an ImageObject, or a list),
// aligned to the steps — null for a heading, for the second half of a step that was
// split, and for a step without one (C3, 2026-10-27).
export function normalizeInstructionsWithImages(value: unknown, max = MAX_STEPS): { steps: string[]; images: (string | null)[] } {
  type Collected = { section: string | null; text: string; image: string | null }
  const collected: Collected[] = []
  let section: string | null = null
  let image: string | null = null
  const push = (s: string) => {
    const c = clean(s)
    if (!c || collected.length >= max * 4) return
    // A bare label line packed inside the instructions ("Glaçage :") is a
    // section marker, not a step — without this it leaks as a junk step.
    const sec = isSectionHeading(c) ? null : inlineSectionTitle(c)
    collected.push({ section, text: sec ? makeSectionHeading(sec) : c, image: sec ? null : image })
    image = null
  }
  const walk = (v: unknown) => {
    if (collected.length >= max * 4) return
    if (typeof v === 'string') {
      // A single string may pack several steps — separated by newlines, or by HTML
      // blocks (« <p>…</p><p>…</p> », « <br> »): one step per block. Stripping the
      // tags first (the old way) left ONE blob that was then cut per sentence.
      for (const part of htmlBlocksToLines(v)) push(part)
      return
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
      return
    }
    if (v && typeof v === 'object') {
      const node = v as Record<string, unknown>
      // itemListElement may be an array OR a single object (one step in a section) —
      // `Array.isArray` alone let the section's name become a step and lost the child.
      if (node.itemListElement != null && typeof node.itemListElement === 'object') {
        const prev = section
        if (typeIncludes(node, 'HowToSection') && typeof node.name === 'string') section = clean(node.name) || prev
        walk(node.itemListElement)
        section = prev
        return
      }
      if (typeof node.text === 'string') {
        image = normalizeImage(node.image)
        push(node.text)
        image = null
        return
      }
      if (typeof node.name === 'string') push(node.name)
    }
  }
  walk(value)

  const sections = new Set(collected.map((c) => c.section).filter(Boolean))
  const useSections = sections.size >= 2
  // ONE paragraph for the whole method is the only case read one sentence per step;
  // anything the site delimited (several HowToSteps, several blocks) stays as shipped.
  const oneBlob = collected.filter((c) => !isSectionHeading(c.text)).length === 1
  const out: string[] = []
  const imgs: (string | null)[] = []
  let count = 0 // steps only — headings are structure and never count toward `max`
  let lastSection: string | null = null
  for (const c of collected) {
    if (count >= max) break
    let first = true
    for (const step of refineSteps([c.text], { max: max - count, blob: oneBlob ? 'auto' : 'keep' })) {
      if (count >= max) break
      if (useSections && c.section && c.section !== lastSection) {
        out.push(makeSectionHeading(c.section).slice(0, MAX_STEP_LEN))
        imgs.push(null)
        lastSection = c.section
      }
      const final = step.slice(0, MAX_STEP_LEN)
      if (out.includes(final)) continue
      out.push(final)
      imgs.push(first && !isSectionHeading(final) ? c.image : null)
      first = false
      if (!isSectionHeading(final)) count++
    }
  }
  // dropDanglingHeadings, keeping the photos aligned.
  const steps: string[] = []
  const images: (string | null)[] = []
  out.forEach((l, i) => {
    if (isSectionHeading(l) && steps.length && isSectionHeading(steps[steps.length - 1])) {
      steps.pop()
      images.pop()
    }
    steps.push(l)
    images.push(imgs[i])
  })
  if (steps.length && isSectionHeading(steps[steps.length - 1])) {
    steps.pop()
    images.pop()
  }
  return { steps, images }
}

// One block of HTML (a JSON-LD instructions string, a microdata container) → its
// printed lines: block closers and <br> become line breaks BEFORE the tags are
// stripped, an <hN> inside becomes a "## " section marker, and a bare label line
// (« Glaçage : ») becomes one too. Plain text just splits on its newlines.
export function htmlBlocksToLines(blockHtml: string): string[] {
  return blockHtml
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, t: string) => `\n## ${clean(t)}\n`)
    .replace(/<\/(?:li|p|div)>|<br\s*\/?>/gi, '\n')
    // Sibling <span>s that each hold a sentence are lines the page's CSS stacks (Metro).
    .replace(/([.!?])\s*<\/span>\s*<span\b[^>]*>/gi, '$1\n')
    .split(/\r?\n+/)
    .map((s) => clean(s))
    .filter(Boolean)
    .map((s) => {
      if (isSectionHeading(s)) return s
      const sec = inlineSectionTitle(s)
      return sec ? makeSectionHeading(sec) : s
    })
}

// The page's own name and picture, for a draft read from its TEXT (no structured
// data to name it): og:title, else <title> without its « | Site » / « - Site » tail;
// og:image. Attribute order varies by site — both orders are read.
// A tab title's « | Site » / « – Site » tail, off — shared by pageMeta and the captured
// page (document.title is a tab title too; left on, the audit flagged it as junk).
export const stripTitleTail = (t: string): string | null => t.replace(/\s+[|–—-]\s+[^|–—-]{1,60}$/, '').trim() || null

export function pageMeta(html: string): { title: string | null; image: string | null } {
  const og = (prop: string): string | null => {
    const a = html.match(new RegExp(`<meta\\b[^>]*\\bproperty=["']og:${prop}["'][^>]*\\bcontent=["']([^"']*)["']`, 'i'))
    const b = a ?? html.match(new RegExp(`<meta\\b[^>]*\\bcontent=["']([^"']*)["'][^>]*\\bproperty=["']og:${prop}["']`, 'i'))
    return b ? clean(b[1]) || null : null
  }
  // The page's ONE <h1> is its name as printed (« Carrés au sucre »); og:title and
  // <title> are written for a share card or a tab (« Recette de carrés au sucre |
  // Recettes du Québec ») — they lose their « | Site » tail and serve only without an h1.
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1])).filter((t) => t.length >= 2 && t.length <= 120)
  let title = h1s.length === 1 ? h1s[0] : null
  if (!title) {
    const o = og('title')
    title = o ? stripTitleTail(o) : null
  }
  if (!title) {
    const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
    title = t ? stripTitleTail(clean(t[1])) : null
  }
  return { title: title ? title.slice(0, 200) : null, image: normalizeImage(og('image')) }
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
  return parseRecipeJsonLdBlocks(extractJsonLdBlocks(html))
}

// The same read over blocks already parsed — the HTML path extracts them from the
// page; a captured page (the bookmarklet) sends their raw text.
// SEVERAL RECIPES ON ONE PAGE (C4, 2026-10-27) — BBC Good Food's lasagne page carries
// three Recipe nodes. The first is read, as always; the others are offered by title
// (`candidates`), and `pick` reads another one.
export function parseRecipeJsonLdBlocks(blocks: unknown[], pick = 0): ParsedRecipe | null {
  // The same recipe twice (a page that repeats its node) is one candidate.
  const seen = new Set<string>()
  const usable = blocks.flatMap(findRecipeNodes).flatMap((node) => {
    const p = parseRecipeNode(node)
    const key = p ? `${p.title}|${p.ingredients.join('|')}|${p.steps.length}` : ''
    if (!p || seen.has(key)) return []
    seen.add(key)
    return [p]
  })
  if (!usable.length) return null
  const chosen = usable[Math.min(Math.max(0, Math.floor(pick) || 0), usable.length - 1)]
  return usable.length > 1 ? { ...chosen, candidates: usable.map((u, i) => ({ i, title: u.title })) } : chosen
}

function parseRecipeNode(node: Record<string, unknown>): ParsedRecipe | null {
  const title = typeof node.name === 'string' ? clean(node.name).slice(0, 200) : null
  const ingredients = asStringList(node.recipeIngredient ?? node.ingredients, MAX_INGREDIENTS).map(tidyIngredientLine)
  const { steps, images } = normalizeInstructionsWithImages(node.recipeInstructions)
  // A node with a name but neither ingredients nor steps isn't a usable recipe.
  if (!title && ingredients.length === 0 && steps.length === 0) return null
  const image = normalizeImage(node.image)
  // A « step photo » that is the recipe's own hero picture (IGA repeats it on step 1)
  // is not a step photo.
  const stepImageUrls = images.map((u) => (u && u !== image ? u : null))
  return {
    title,
    ingredients,
    steps,
    image,
    servings: parseYield(node.recipeYield ?? node.yield),
    servingsUnit: parseYieldUnit(node.recipeYield ?? node.yield),
    times: {
      prep: isoToMinutes(node.prepTime),
      cook: isoToMinutes(node.cookTime),
      total: isoToMinutes(node.totalTime),
    },
    ...(stepImageUrls.some(Boolean) ? { stepImageUrls } : {}),
  }
}

// Microdata fallback for older sites with no JSON-LD: scan for itemprop
// elements at the regex level. Coarse but safe — anything it can't see just
// stays empty and the AI fallback takes over.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

export function parseRecipeMicrodata(html: string): ParsedRecipe | null {
  // Every element carrying itemprop=<prop>, with its WHOLE content: the closing tag is
  // found by depth, not by the first « </div> » (a container of nested <div> steps —
  // 5 ingrédients 15 minutes — used to read as its first step only). A value carried in
  // an attribute (<meta content>, <span content>, <time datetime>) is collected apart:
  // the author's <meta itemprop=name> must not become the recipe's title.
  const collect = (prop: string): { text: string[]; attr: string[] } => {
    const text: string[] = []
    const attr: string[] = []
    const out = text
    const wants = new RegExp(`itemprop=["'](?:${prop})["']`, 'i')
    const open = /<([a-z][a-z0-9]*)\b([^>]*)>/gi
    let m: RegExpExecArray | null
    while ((m = open.exec(html)) && out.length < 80) {
      if (!wants.test(m[2])) continue
      const tag = m[1].toLowerCase()
      const c = m[2].match(/\b(?:content|datetime)=["']([^"']*)["']/i)
      if (c) {
        attr.push(c[1])
        continue
      }
      if (m[2].endsWith('/') || VOID_TAGS.has(tag)) continue
      const start = m.index + m[0].length
      const any = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi
      any.lastIndex = start
      let depth = 1
      let t: RegExpExecArray | null
      while ((t = any.exec(html))) {
        if (t[2].toLowerCase() !== tag || t[0].endsWith('/>')) continue
        depth += t[1] ? -1 : 1
        if (depth === 0) {
          out.push(html.slice(start, t.index))
          break
        }
      }
    }
    return { text, attr }
  }
  const inner = (prop: string): string[] => collect(prop).text
  const attrOrText = (prop: string): string | null => {
    const c = collect(prop)
    return [...c.attr, ...c.text].map((s) => clean(s)).find(Boolean) ?? null
  }

  // One element per ingredient — or ONE container holding the whole list (5 ingrédients
  // 15 minutes: <div itemprop=ingredients><ul><li>…</li></ul><p>Pour la marinade :</p>…):
  // split it into its printed lines, a label line becoming a « ## » part, buttons out.
  const ingredients = dropDanglingHeadings(
    inner('recipeIngredient|ingredients')
      .flatMap((s) => (/<(?:li|p|div|br|ul)\b/i.test(s) ? htmlBlocksToLines(s) : [clean(s)]))
      .filter((s) => s && !UI_CHROME.test(s))
      .map((s) => s.slice(0, MAX_INGREDIENT_LEN)),
  ).slice(0, MAX_INGREDIENTS)

  // Instructions may be one element per step OR a single container; turn block
  // closers into newlines before stripping tags so the inner list splits. An
  // <hN> INSIDE the container is a section heading ("Glaçage") — keep it as a
  // "## " marker instead of letting it leak as a junk step; a bare label line
  // ("Glaçage :") gets the same treatment. (htmlBlocksToLines — shared with a
  // JSON-LD instructions string that carries the same HTML.) A heading that is the
  // method's own title (« Préparation », « Étapes ») heads the whole list: not a part.
  const allLines = inner('recipeInstructions')
    .flatMap(htmlBlocksToLines)
    .filter((l) => !(isSectionHeading(l) && STEP_HEADING.test(l.replace(/^##\s*/, ''))))
  // A notes block inside the method's container (« Idée pour accompagner : », « Notes »)
  // ends the method: what follows is the recipe's notes, not more steps.
  const noteAt = allLines.findIndex((l) => NOTE_HEADING.test(l.replace(/^##\s*/, '')))
  const stepLines = noteAt >= 0 ? allLines.slice(0, noteAt) : allLines
  const notes = noteAt >= 0 ? allLines.slice(noteAt + 1).map((l) => l.replace(/^##\s*/, '')).join('\n').slice(0, MAX_NOTES_LEN) || null : null
  const steps = dropDanglingHeadings(refineSteps(stepLines))

  if (ingredients.length < 2 && steps.length === 0) return null

  const page = pageMeta(html)
  // The Recipe's own name: the first itemprop=name with PRINTED text (an author's or a
  // publisher's name rides in a <meta content>), else the page's own title.
  const title = inner('name').map((s) => clean(s)).find(Boolean)?.slice(0, 200) ?? page.title
  const image = page.image
  const yieldRaw = attrOrText('recipeYield')
  const time = (prop: string) => isoToMinutes(attrOrText(prop))
  return {
    title,
    ingredients,
    steps,
    image,
    servings: parseYield(yieldRaw),
    servingsUnit: parseYieldUnit(yieldRaw),
    times: { prep: time('prepTime'), cook: time('cookTime'), total: time('totalTime') },
    notes,
  }
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

export const normLoose = (s: string): string =>
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
  if (s.split(/\s+/).length > 6) return null
  const ingH = s.match(ING_HEADING)
  if (ingH) return qualifierTitle(ingH[1])
  if (STEP_HEADING.test(s) || NOTE_HEADING.test(s) || TIME_LINE.test(s)) return null
  return s
}

export function regroupIngredients(html: string, ingredients: string[]): string[] {
  return regroupIngredientsInText(htmlToText(html, 60000), ingredients)
}

// The same recovery over the page's TEXT (a captured page sends its innerText).
export function regroupIngredientsInText(text: string, ingredients: string[]): string[] {
  if (ingredients.length < 4 || ingredients.some((l) => isSectionHeading(l))) return ingredients
  const lines = text
    .slice(0, 60000)
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
  return grouped.slice(0, MAX_INGREDIENTS)
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
// A notes heading may carry a short qualifier — « Note de l'équipe Ricardo », « Recipe
// Notes: », « Conseils du chef » — but never a colon mid-line: « Note : bien mélanger » is
// a line of the recipe, not a heading.
const NOTE_HEADING =
  /^(?:(?:recipe|chef['’]?s?|cook['’]?s?)\s+)?(?:notes?|remarques?|conseils?|astuces?|tips?|variantes?|bon\s+[àa]\s+savoir|id[ée]es?\s+pour\s+accompagner|pour\s+accompagner|suggestions?\s+d['’]accompagnement|serving\s+suggestions?|suggestions?\s+gourmandes?|trucs?\s+(?:de\s+pro|du\s+chef)|make[- ]ahead(?:\s+and\s+storage)?)\b[^.!?:]{0,30}[:!]?$/i

// "Préparation : 20 min", "Cuisson 1 h 30", "Total time: 45 minutes" — the time
// block most printed recipes start with. Must be checked BEFORE the step
// heading ("Préparation" alone flips the mode; with a duration it's a time).
// The value must START with a number (or « environ / about »): « Bake 60 min » is a
// time; « Bake for 1 hour. » is a STEP, and adding « bake » to the labels swallowed it
// once (the EN fixture caught it). No comma either — a clause is a step.
const TIME_LINE =
  /^(pr[ée]p(?:aration)?(?:\s*time)?|cuisson|cook(?:ing)?(?:\s*time)?|bak(?:e|ing)(?:\s*time)?|au\s+four|temps\s+total|total(?:\s*time)?)\s*:?\s+((?:environ|about|~)?\s*\d[^,]{0,28})$/i

// A card's META STRIP is several facts on one printed line; the separators vary with the
// typesetting (« · », « • », « | », a spaced dash, a breadcrumb « › »).
const STRIP_SEP = /\s*[•·|]\s*|\s+[–—-]\s+|\s+[›»]\s+/
const isMetaFrag = (f: string): boolean => TIME_LINE.test(f) || SERVINGS_LINE.test(f)
// A transcriber may drop the separators altogether (« Préparation : 10 min Cuisson :
// 15 min Portions : 4 »): then split right before each meta label — and keep that
// split only when it yields two meta facts (« Cuire 10 min pour dorer » stays whole).
const LABEL_SPLIT =
  /\s+(?=(?:pr[ée]p(?:aration)?|cuisson|cook(?:ing)?|bak(?:e|ing)|temps\s+total|total|portions?|servings?|donne|serves?|rendement|yield|pour)\b)/i
const splitStrip = (l: string): string[] => {
  const f = l.split(STRIP_SEP).map((s) => s.trim()).filter(Boolean)
  if (f.length > 1) return f
  const g = l.split(LABEL_SPLIT).map((s) => s.trim()).filter(Boolean)
  return g.length > 1 && g.filter(isMetaFrag).length >= 2 ? g : f
}
// A website's NAV BAR or breadcrumb transcribed as one line (« RECETTES.QC • Menu •
// Recherche • Connexion », « Accueil › Plats › Pâtes »): three or more short wordy
// fragments. Never a title, never a step.
const isNavStrip = (frags: string[]): boolean => frags.length >= 3 && frags.every((f) => f.length <= 20 && !/\d/.test(f))
// A star rating (« ★★★★☆ 128 avis ») — stars with, at most, a count and a word.
const isRating = (l: string): boolean => /[★☆✩✭✮⭐]/.test(l) && /^[★☆✩✭✮⭐\s\d.,/()]+(?:avis|reviews?|notes?|votes?|[ée]valuations?)?\s*$/i.test(l)
const INLINE_NOTE = /^(?:notes?|remarques?|conseils?|astuces?|tips?|bon\s+[àa]\s+savoir)\s*[:!]\s+(\S.{8,})$/i
// Where a website's chrome resumes AFTER the recipe body — everything from here on is
// other recipes, ads and buttons. Only honoured once the body has started; before it,
// the same line is merely skipped (a share bar above a recipe must not eat the recipe).
// « Catégories » / « Mots-clés » / « Tags »: the taxonomy block that follows the method
// on recettes.qc.ca and most blogs — pasted whole, its four lines became steps 7–10
// (Marc, 2026-10-27). Whole-word (a letter lookahead, since JS \b dies after an é).
export const NOISE_END =
  /^(?:recettes?\s+(?:populaires?|similaires?|sugg[ée]r[ée]es?|du\s+moment)|popular\s+recipes?|related\s+recipes?|more\s+recipes?|vous\s+aimerez|you\s+(?:may|might)\s+also\s+like|[àa]\s+lire\s+aussi|voir\s+aussi|see\s+also|(?:commentaires?|comments?)(?:\s*\(\d+\)|\s*:)?\s*$|[\d,.\s]+(?:commentaires?|comments?)\s*$|(?:laisser|leave)\s+(?:un|a)\s+(?:commentaire|comment)|abonnez|newsletter|s['’]abonner|subscribe|tous\s+droits|all\s+rights|©|(?:cat[ée]gories?|mots?[- ]cl[ée]s?|[ée]tiquettes?|tags?|keywords?)\s*:?\s*$|keywords?\s*:|note\s+personnelle|personal\s+note|cr[ée]er\s+une\s+note|nutrition\s+(?:information|facts)\b|nutrition\s*:?\s*$|valeurs?\s+nutritives?|informations?\s+nutritionnelles?|recette\s+publi[ée]e|[àa]\s+voir\s+(?:[ée]galement|aussi)|d['’]autres\s+recettes|imprimer\s+cette\s+recette|avis\s+de\s+non[- ]responsabilit[ée]|disclaimer|je\s+m['’]inscris|adresse\s+(?:mail|courriel)|qu['’]est[- ]ce\s+qu['’]on\s+mange|.*\b(?:get|download)\s+the\s+app\b)/i
// A side block that is not the recipe and not its notes — trivia, a FAQ, the gear, a
// video: its lines are skipped until the next real heading (a « Variante » after a «
// Saviez-vous ? » is still read). Never the end: notes often follow.
const ASIDE_HEADING =
  /^(?:(?:le\s+)?saviez[- ]vous|info(?:rmation)?s?\s+additionnelles?|faq\b|foire\s+aux\s+questions|questions?\s+fr[ée]quentes|ustensiles?|mat[ée]riel(?:\s+requis)?|special\s+equipment|equipment|vid[ée]o)\b[^.!]{0,70}$/i
// The page HEAD a whole-page paste carries above the recipe's name: a publication
// date, a byline, a share button, a photo credit. None of these is the title.
const PRE_JUNK =
  /^(?:\d{1,2}(?:er)?\s+[a-zéû]{3,10}\.?\s+\d{4}|[a-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}.*|(?:par|by)\s+\S+(?:\s+\S+){0,3}|partage[rz]?|share|photographe\s*:.*|photo\s*:.*|cr[ée]dits?\s+photo.*|photo\s+credits?.*)$/i
// An ad slot's label is NOT the end of the recipe: sites drop « Publicité » between
// two steps, and treating it as the footer cut the method in half (2026-10-27). It is
// skipped wherever it appears.
// (No `\b` after « publicité »: JS \b is ASCII-only, so it never fires after an é.)
const NOISE_SKIP = /^(?:publicit[ée]s?|advertisements?|sponsored)(?![a-zà-öœ])/i
// The page's BUTTONS, as innerText/htmlToText reads them: « Ajouter à ma liste
// d'épicerie », « Sélectionner tous les ingrédients », « Passer en mode cuisine », a unit
// toggle (« Metric », « US », « Cups »), WPRM's checkbox glyph. Whole lines only — never
// recipe, skipped wherever they sit (under « Ingrédients » they became ingredients).
const UI_CHROME =
  /^(?:ajouter\s+[àa]\s+(?:ma|mon|mes)\s.{0,40}|s[ée]lectionner\s+tous\s.{0,40}|passer\s+en\s+mode\s+cuisine|mode\s+cuisine|cook\s+mode|prevent\s+screen\s+from\s+sleeping|skip\s+ad|imprimer(?:\s+(?:la|ma)\s+(?:recette|s[ée]lection))?|print(?:\s+recipe)?|jump\s+to\s+recipe|save\s+recipe|metric|us|cups|imp[ée]rial|m[ée]trique|unit[ée]\s+de\s+mesure|magasiner\s+tous\s+les\s+ingr[ée]dients|\d+(?:\/\d+)?\s*x|oops!.*|▢|☐|(?:(?:pinterest|facebook|email|courriel|twitter|instagram|tiktok|youtube|whatsapp|partager|share)[\s|·•]*){2,})$/i
// A bare part label inside the ingredient or method block (« Sauce », « Garniture »,
// « Poisson »): one to three capitalised words, no digits, no punctuation.
const isBareLabel = (l: string): boolean => /^[A-ZÀ-ÖŒ][^\d.!?:;,()]{0,30}$/.test(l) && l.split(/\s+/).length <= 3
// …and the part names common enough to trust without a blank line above them.
const PART_WORD =
  /^(?:sauces?|garnitures?|p[âa]tes?|cro[ûu]tes?|gla[çc]age|farce|marinade|vinaigrette|topping|filling|crust|dough|frosting|glaze|dressing|assemblage|montage|finition|service|d[ée]coration|base|streusel|coulis|cr[èe]me)\b/i

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
  /(?:^|\b)(\d{1,2})\s*(?:[àa]\s*\d{1,2}\s*)?(?:portions?|servings?|personnes?|convives|parts)\b|(?:donne|serves?|rendement|yield)\s*:?\s*(\d{1,2})\b\s*([a-zà-öœ]{3,24})?|^(?:portions?|servings?|personnes?|pour)\s*:\s*(\d{1,2})\b/i
// The number, whichever branch matched: « 4 portions », « Donne 4 », « Portions : 4 ».
const servingsOf = (sv: RegExpMatchArray): number => +(sv[1] ?? sv[2] ?? sv[4])

// A line that is ONLY an amount (+ its unit) — « 250 ml », « 1 c. à soupe », « 2 » —
// and a line of words with no number: the two cells of one ingredient (F, 2026-10-27).
const AMOUNT_ONLY =
  /^(?:[\d¼½¾⅓⅔⅛.,/ ]+|une?|deux|trois)\s*(?:ml|cl|l|g|kg|lb|lbs|oz|tasses?|cups?|tbsp|tsp|c\.\s*à\s*(?:soupe|thé|café|s|c)\.?|cuill[èe]res?\s+[àa]\s+(?:soupe|thé|café|table)|pinc[ée]es?)?\s*$/i
const WORDS_ONLY = /^[a-zà-öœ'’(][^\d]*$/i
// An ingredient-looking line: bullet or quantity-leading, short. Used only by
// the no-headings fallback.
const ING_LIKE = /^[-•*–▢☐□]?\s*(?:\d|[¼½¾⅓⅔⅛]|une?\b|deux\b|trois\b|quelques\b)/i

const stripBullet = (s: string): string => s.replace(/^[-•·▪◦‣*–—▢☐□]+\s*/, '').trim()

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

// Does `line` continue a title that wrapped onto a second printed line? Short, no
// digits, and opening on a conjunction or preposition (« et au sésame », « aux
// pommes », « with lemon »); a title already closed by punctuation never continues.
const titleContinues = (title: string, line: string): boolean =>
  !/[.!?:]$/.test(title) &&
  line.length <= 60 &&
  !/\d/.test(line) &&
  /^(?:et|ou|au|aux|à|a|de|du|des|d['’]|en|pour|sans|avec|sur|and|or|with|in|for|of|to|on)\b/i.test(line)

// Parse text the user pasted (from a site, a PDF, a message). Heading-aware
// first; when the paste has no headings, fall back to shape detection
// (quantity-leading lines = ingredients, prose after = steps). The result's
// `confident` says whether the structure was explicit.
export function parsePastedRecipe(text: string): PastedRecipe {
  // NFC first: a decomposed « É » (E + combining acute) never matches `[ée]`, and an
  // « INGRÉDIENTS » heading that misses ING_HEADING falls through to the bare-label
  // rule and comes out as a « ## » section (seen on a live capture, 2026-10-27).
  const lines = text.normalize('NFC').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim())
  let mode: 'pre' | 'ing' | 'steps' | 'notes' | 'aside' = 'pre'
  let title: string | null = null
  // How many printed lines the title took (1, or 2 when wrapped) — the no-headings
  // fallback below skips exactly those, so a wrapped title's second half never lands
  // in the steps as a bogus « et au sésame » instruction.
  let titleLines = 0
  // True only for the line RIGHT AFTER the title — a wrapped title continues there and
  // nowhere else (a later « et couper en bâtonnets… » is the method, not the title).
  let afterTitle = false
  // True only for the line right after an « Ingrédients » heading: a bare label there
  // (« Poisson ») heads the first named part, blank line or not.
  let afterIngHeading = false
  // Lines known NOT to be recipe (a nav bar, a star rating, a « Titre » label): the
  // no-headings fallback below, which re-walks every line, must skip them too.
  const junk = new Set<number>()
  let servings: number | null = null
  let servingsUnit: string | null = null
  const times: RecipeTimes = { prep: null, cook: null, total: null }
  const ings: string[] = []
  const stepLines: string[] = []
  const noteLines: string[] = []
  let sawIngHeading = false
  let sawStepHeading = false

  const nextNonEmpty = (from: number): string => lines.slice(from + 1).find((l) => l !== '') ?? ''
  // A bare amount whose words sit on the NEXT line (a site's two cells, « 250 ml » /
  // « de farine »): the index of that words line, or -1. Never a heading.
  const wordsAfter = (from: number): number => {
    if (!AMOUNT_ONLY.test(lines[from])) return -1
    let j = from + 1
    while (j < lines.length && lines[j] === '') j++
    const w = lines[j] ?? ''
    if (!WORDS_ONLY.test(w) || ING_HEADING.test(w) || STEP_HEADING.test(w) || NOTE_HEADING.test(w) || inlineSectionTitle(w)) return -1
    return j
  }
  let skipTo = -1
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (!line || li <= skipTo) continue
    const justAfterTitle = afterTitle
    afterTitle = false
    const justAfterIng = afterIngHeading
    afterIngHeading = false
    const prevBlank = li > 0 && lines[li - 1] === ''

    // Meta lines can appear anywhere; consume them when they stand alone. True when
    // the line was one and has been read.
    const consumeMeta = (l: string): boolean => {
      const tm = l.match(TIME_LINE)
      if (tm) {
        const mins = textToMinutes(tm[2])
        if (mins) {
          const kind = tm[1].toLowerCase()
          if (/^cuisson|^cook|^bak|^au\s+four/.test(kind)) times.cook ??= mins
          else if (/total/.test(kind)) times.total ??= mins
          else times.prep ??= mins
          return true
        }
      }
      if (servings == null) {
        const sv = l.match(SERVINGS_LINE)
        if (sv) {
          servings = clampServings(servingsOf(sv))
          // "Donne 24 biscuits" — keep the unit word ("biscuits") when it isn't
          // a plain portion word; the UI then labels servings with it.
          const unit = sv[3]?.trim()
          if (servings && unit && !PORTION_WORDS.test(unit)) servingsUnit = unit.slice(0, 24)
          // A short line around the meta block is the marker itself — consume it.
          // Inside the method, "Diviser en 4 portions…" is a real step: keep it.
          if (mode !== 'steps' && l.length <= 40) return true
        }
      }
      return false
    }
    // A card's META STRIP — « Préparation : 10 min • Cuisson : 20 min • Donne 12
    // crêpes » — is several facts on ONE printed line, and a photo transcript keeps it
    // that way. Read each fragment as its own meta line, but only when EVERY fragment
    // is one: a step that merely contains a « • » is not a meta strip. Unsplit, the
    // strip lost both times and, first on the page, became the title (2026-09-24).
    const frags = splitStrip(line)
    if (frags.length > 1) {
      // Two or more meta facts make it a strip; the rest of the line (a star rating,
      // a « | » separator's leftovers) is dropped with it, not allowed to block it.
      const meta = frags.filter(isMetaFrag)
      if (meta.length >= 2) {
        for (const f of meta) consumeMeta(f)
        continue
      }
      if (isNavStrip(frags)) {
        junk.add(li)
        continue
      }
    }
    if (isRating(line)) {
      junk.add(li)
      continue
    }
    if (consumeMeta(line)) continue
    if (NOISE_SKIP.test(line) || UI_CHROME.test(line)) {
      junk.add(li) // an ad slot, wherever it sits — never the recipe, never its end
      continue
    }
    if (NOISE_END.test(line)) {
      if (mode !== 'pre') break // the recipe is over; what follows is the site
      junk.add(li)
      continue
    }

    const ingH = line.match(ING_HEADING)
    if (ingH) {
      mode = 'ing'
      sawIngHeading = true
      afterIngHeading = true
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
    if (mode !== 'pre' && ASIDE_HEADING.test(line)) {
      mode = 'aside'
      continue
    }
    if (mode === 'aside') continue
    // A note label that opens its own line (« Bon à savoir ! Pour un spaghetti… »), under
    // the ingredients: the rest of the line is the note, and what follows it too.
    const inlineNote = mode !== 'steps' ? line.match(INLINE_NOTE) : null
    if (inlineNote) {
      mode = 'notes'
      noteLines.push(inlineNote[1])
      continue
    }

    if (mode === 'pre') {
      // A « Titre » / « Title » label a transcriber writes above the name is skipped;
      // a « Titre : Crêpes » line IS the name (corpus, 2026-09-24: « Titre » became
      // the title of three recipes).
      if (/^(?:titre|title|nom|name)\s*:?\s*$/i.test(line) || PRE_JUNK.test(line)) {
        junk.add(li)
        continue
      }
      const labelled = line.match(/^(?:titre|title|nom|name)\s*:\s*(.{1,120})$/i)
      const cand = labelled ? labelled[1].trim() : line
      if (!title && cand.length <= 120) {
        title = cand.slice(0, 200)
        titleLines = 1
        afterTitle = true
      } else if (title && justAfterTitle && titleContinues(title, line)) {
        // A title WRAPPED over two printed lines (« Brocoli sauté au miel » / « et au
        // sésame ») — a card's headline routinely is. The second line is joined when
        // it reads as a continuation: short, no digits, opening on a conjunction or
        // preposition. A description (« Une recette de grand-maman ») does not.
        title = `${title} ${line}`.slice(0, 200)
        titleLines = 2
      }
      // Further preamble (description, byline) is dropped — it isn't the recipe.
      continue
    }
    // A bare part label (« Poisson », « Sauce », « Garniture ») heads a named part when
    // the layout says so — a blank line above it, or a part name common enough to
    // trust — and an ingredient-looking line follows. Conservative on purpose: « Sel »
    // between two quantity lines is an ingredient, not a part.
    const bareLabel = stripBullet(line)
    const partLabel =
      isBareLabel(bareLabel) && (prevBlank || PART_WORD.test(bareLabel) || (justAfterIng && bareLabel.split(/\s+/).length <= 2)) ? bareLabel : null
    if (mode === 'ing') {
      const sec = inlineSectionTitle(line) ?? (partLabel && ING_LIKE.test(nextNonEmpty(li)) ? partLabel : null)
      if (sec) {
        ings.push(makeSectionHeading(sec))
        continue
      }
      const words = wordsAfter(li)
      if (words >= 0) {
        ings.push(`${stripBullet(line)} ${lines[words]}`.slice(0, MAX_INGREDIENT_LEN))
        skipTo = words
        continue
      }
      // A paragraph under « Ingredients » (a site's note on scaling the yield) is not
      // an ingredient: several sentences in one long line.
      if (line.length > 100 && (line.match(/[.!?]\s+[A-ZÀ-ÖŒ]/g) ?? []).length >= 2) continue
      const ing = stripBullet(line).slice(0, MAX_INGREDIENT_LEN)
      if (ing) ings.push(ing)
      continue
    }
    if (mode === 'steps') {
      const sec = inlineSectionTitle(line) ?? (partLabel && nextNonEmpty(li).length > 20 ? partLabel : null)
      stepLines.push(sec ? makeSectionHeading(sec) : line)
      continue
    }
    // A note's own numbering (« 1 » on a line of its own, a list marker) is not a note.
    if (!/^\d{1,2}[.)]?$/.test(line)) noteLines.push(line)
  }

  // No headings at all — classify by line shape instead.
  const paragraphCard = !sawIngHeading && !sawStepHeading && ings.length === 0 && stepLines.length === 0
  if (paragraphCard) {
    let skipped = 0
    let pairTo = -1
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      if (!line || li <= pairTo) continue
      if (junk.has(li)) continue // a nav bar, a rating, a « Titre » label — never recipe
      if (skipped < Math.max(1, titleLines)) {
        skipped++
        continue // the title (one line, or two when wrapped) was already captured above
      }
      if (TIME_LINE.test(line) || (line.length <= 40 && SERVINGS_LINE.test(line))) continue // meta, already read
      // …and the one-line meta strip (see the pass above), already read fragment by
      // fragment; a nav bar and a star rating are not recipe either.
      const metaFrags = splitStrip(line)
      if (metaFrags.length > 1 && (metaFrags.filter(isMetaFrag).length >= 2 || isNavStrip(metaFrags))) continue
      if (isRating(line)) continue
      // The site's chrome after the body: the recipe is over.
      if (NOISE_END.test(line) && stepLines.length) break
      // A WRAPPED line of prose is a continuation, not an ingredient — even when the
      // wrap happens to fall right before a quantity (« Verser » / « 15 ml (1 c. à
      // soupe) de miel et 7,5 ml (1/2 c. à » / « soupe) de sauce soya… »). The tell is
      // the line BEFORE it: long, and left open (no sentence-ending punctuation). A real
      // ingredient list is made of short lines, so it never looks like that.
      const prev = stepLines[stepLines.length - 1]
      const continuation = !!prev && prev.length > 40 && !/[.!?:]$/.test(prev)
      const words = continuation ? -1 : wordsAfter(li)
      if (words >= 0) {
        ings.push(`${stripBullet(line)} ${lines[words]}`.slice(0, MAX_INGREDIENT_LEN))
        pairTo = words
        continue
      }
      if (!continuation && ING_LIKE.test(line) && line.length <= 80) ings.push(stripBullet(line).slice(0, MAX_INGREDIENT_LEN))
      else stepLines.push(line)
    }
  }

  // Merge wrapped lines (a continuation starts lowercase — or on a digit, when the
  // previous line is long prose left mid-sentence: « Verser » / « 15 ml (1 c. à soupe)
  // de miel… ») before the shared refinement pass. A numbered marker (« 2. Ajouter »)
  // is never a continuation, and a "## " section marker never merges in either
  // direction — it isn't part of any sentence.
  const merged: string[] = []
  for (const l of stepLines) {
    const prev = merged[merged.length - 1]
    const open = !!prev && !isSectionHeading(prev) && !isSectionHeading(l) && !/[.!?:]$/.test(prev)
    const continues = /^[a-zà-öœ]/.test(l) || (prev !== undefined && prev.length > 40 && /^\d/.test(l) && !/^\d{1,2}\s*[.)]\s/.test(l))
    if (open && continues) merged[merged.length - 1] = `${prev} ${l}`
    else merged.push(l)
  }
  // A PARAGRAPH recipe (no headings, no markers) reads one sentence per step — the
  // same words, only the boundaries, which is what a cook wants and what the
  // structuring model used to be called for. Deterministic, so nothing is rephrased
  // (the model reordered « Dans un grand poêlon, chauffer… » into « Chauffer… dans un
  // grand poêlon »). Same boundary rule as sentenceChunks: end punctuation, then an
  // uppercase / « / digit start, so « env. 5 min » and « 1.5 L » never split. A
  // formatted recipe keeps its own step lines — a long printed line is ONE step
  // ('auto': only a method that is a single long paragraph reads per sentence).
  const blobs = paragraphCard
    ? merged.flatMap((l) => (isSectionHeading(l) ? [l] : l.split(SENTENCE_SPLIT).filter(Boolean)))
    : merged
  const steps = dropDanglingHeadings(refineSteps(blobs, { blob: 'auto' }))
  // One note per printed line: a numbered « 1. … 2. … » list or two paragraphs stay apart.
  // A line printed twice (a page that shows its notes in two layouts) is kept once.
  const notes = [...new Set(noteLines)].join('\n').trim().slice(0, MAX_NOTES_LEN) || null

  const ingredients = dropDanglingHeadings(ings.slice(0, MAX_INGREDIENTS))
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
  // A bare leaked label as its own line ("Remarque", "N.B."). NOT « Note(s) » / « Nota »:
  // that is the printed heading of a cookbook's notes box (Marc's « Saumon à
  // l'asiatique », 2026-10-30), and the parsers find the notes BY that heading — a
  // leaked model label left bare is a dangling heading, which the drafts drop anyway.
  /^(?:remarques?|n\.?\s*b\.?|avertissements?|disclaimer)\s*:?\s*$/i,
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

// Did the headings parser read a PAGE's ingredient list, or its table cells? Sites
// lay an ingredient out as cells (« <div>250 ml</div><div>de farine</div> »), which
// htmlToText turns into a bare « 250 ml » line and an orphan « de farine » one. A
// real list is mostly lines that carry a word AND are not a bare amount; under 80 %
// the read is not trusted (the model organises the page instead, when it may).
export function pageIngredientsPlausible(lines: string[]): boolean {
  const real = lines.filter((l) => !isSectionHeading(l))
  if (real.length < 2) return false
  const bareAmount = /^[\d\s.,/¼½¾⅓⅔⅛]+\s*(?:ml|cl|l|g|kg|mg|oz|lb|lbs|c\.\s*à\s*(?:soupe|thé|café)|tasses?|cups?|tbsp|tsp)?\.?$/i
  const good = real.filter((l) => /[a-zà-öœ]{2,}/i.test(l) && !bareAmount.test(l.trim()))
  return good.length * 10 >= real.length * 8
}

// The budget is 16 000 chars now (it was 6000, and a long recipe's last steps fell
// past it — « les étapes arrêtent avant la fin »). Its END is anchored too: the first
// line after the method heading where the site's chrome resumes (« Vous aimerez
// aussi », « Commentaires » — NOISE_END, the paste parser's own list) closes the
// window, so the budget is not spent on other recipes.
const END_ANCHOR = new RegExp(NOISE_END.source, 'im')

// The ingredients heading that IS the recipe's: a site menu has an « Ingrédients » entry
// too (Ricardo's, above the recipe), so the heading followed by quantity lines wins; the
// first one only when none is.
function ingredientsAnchor(text: string): number | undefined {
  let first: number | undefined
  for (const m of text.matchAll(new RegExp(HEADING_ANCHORS[0].source, 'gim'))) {
    first ??= m.index
    const after = text
      .slice(m.index + m[0].length, m.index + m[0].length + 1200)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !UI_CHROME.test(l))
      .slice(0, 6)
    if (after.filter((l) => ING_LIKE.test(l)).length >= 2) return m.index
  }
  return first
}

export function recipeTextWindow(text: string, max = 16_000): string {
  const hit =
    ingredientsAnchor(text) ??
    HEADING_ANCHORS.slice(1).map((re) => re.exec(text)?.index).find((i) => i !== undefined) ??
    LOOSE_ANCHORS.map((re) => re.exec(text)?.index).find((i) => i !== undefined)
  const lead = Math.min(600, Math.floor(max * 0.1))
  // No anchor — the head slice is all we've got. With one, the window starts there even
  // on a SHORT page: a page's head is its menu, and recettes.qc.ca's menu has an
  // « Ingrédient principal » that read as the ingredients heading (2026-10-27).
  const start = hit === undefined ? 0 : Math.max(0, hit - lead)
  let end = Math.min(text.length, start + max)
  // Only AFTER the method heading: before it, the same words are navigation.
  const steps = HEADING_ANCHORS[1].exec(text.slice(start))
  if (steps) {
    const from = start + steps.index + steps[0].length
    const tail = END_ANCHOR.exec(text.slice(from, end))
    if (tail) end = from + tail.index
  }
  return text.slice(start, end).trimEnd()
}

// Crude HTML→text for the AI fallback when there's no structured data: drop
// scripts/styles, keep block boundaries as newlines (so the model — and the
// paste parser — still sees the page's line structure), strip tags, collapse.
// `max` defaults to the model budget, but a caller that intends to window the
// result (see recipeTextWindow) passes a large max so the recipe isn't already
// truncated away before the window can find it.
export function htmlToText(html: string, max = 6000): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      // Source whitespace is insignificant in HTML — structure comes from tags.
      .replace(/\s+/g, ' ')
      .replace(/<\/(?:p|li|div|h[1-6]|tr|section|article)>|<br\s*\/?>/gi, '\n')
      // A block OPENS a line as well as closing one: « <a>Sélectionner tous</a> <div>
      // <button>Ajouter à ma liste</button> » is two lines, not one (5 ingrédients). An
      // opener only BREAKS a line (\x01, resolved below) — it never adds a blank one,
      // which the paste parser reads as a paragraph break.
      .replace(/<(?:p|li|div|h[1-6]|tr|section|article|ul|ol|table|header|footer|nav|figure|figcaption|button|dd|dt)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, '\x01')
      // A table cell is a column of the SAME row: « 250 ml | de farine » stays one line.
      .replace(/<\/t[dh]>/gi, ' ')
      // A tag's attributes may hold « > » inside quotes (an <input value="<span>…">):
      // strip whole tags, quotes and all, or the attribute's tail leaks into the text.
      .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' '),
  )
    .replace(INVISIBLE, '')
    .replace(/(^|\n)[\x01 ]+/g, '$1')
    .replace(/[\x01 ]+(?=\n|$)/g, '')
    .replace(/ *\x01[\x01 ]*/g, '\n')
    .split('\n')
    // An inline tag left a space before the punctuation that closed it (« <a>velveting</a>. »
    // → « velveting . »). French sets a space before « : ! ? ; », never before « . , ) ».
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/ +(?=[.,)](?:\s|$))/g, '').replace(/\( +/g, '(').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}
