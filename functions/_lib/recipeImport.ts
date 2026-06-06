// Recipe import — parse a recipe out of a fetched web page. Almost every recipe
// site embeds schema.org/Recipe as JSON-LD (<script type="application/ld+json">);
// that structured block is far more reliable than scraping the rendered HTML, and
// needs no AI. We pull title / ingredients / steps / image straight from it.
//
// All pure + defensive: any malformed block is skipped, never thrown. The Worker
// endpoint (api/recipe-import) does the fetch; this module does the parsing, so
// it's unit-testable with fixture HTML.

export interface ParsedRecipe {
  title: string | null
  ingredients: string[]
  steps: string[]
  image: string | null
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

// Decode the handful of HTML entities that survive in JSON-LD text. Shared by
// clean() (per-field) and htmlToText() (whole-page fallback).
const decodeEntities = (s: string): string =>
  s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')

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

// recipeInstructions is the messy one: a plain string (newline-separated), an
// array of strings, an array of HowToStep {text}, or HowToSection nodes that nest
// itemListElement. Flatten any of these into ordered step strings.
export function normalizeInstructions(value: unknown, max = 30): string[] {
  const out: string[] = []
  const push = (s: string) => {
    const c = clean(s)
    if (c) out.push(c.slice(0, 400))
  }
  const walk = (v: unknown) => {
    if (out.length >= max) return
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
        walk(node.itemListElement)
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
  return out.slice(0, max)
}

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

// Parse a Recipe out of fetched page HTML. Returns null when no Recipe JSON-LD
// is present (caller can then try the AI/paste fallback).
export function parseRecipeJsonLd(html: string): ParsedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    const node = findRecipeNode(block)
    if (!node) continue
    const title = typeof node.name === 'string' ? clean(node.name).slice(0, 200) : null
    const ingredients = asStringList(node.recipeIngredient ?? node.ingredients, 40)
    const steps = normalizeInstructions(node.recipeInstructions, 30)
    // A node with a name but neither ingredients nor steps isn't a usable recipe.
    if (!title && ingredients.length === 0 && steps.length === 0) continue
    return { title, ingredients, steps, image: normalizeImage(node.image) }
  }
  return null
}

// Crude HTML→text for the AI fallback when there's no JSON-LD: drop scripts/styles,
// strip tags, collapse whitespace. Good enough to feed structureRecipe.
export function htmlToText(html: string, max = 6000): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}
