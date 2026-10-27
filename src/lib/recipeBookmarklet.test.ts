import { describe, expect, it, vi } from 'vitest'
import { RECIPE_BOOKMARKLET_BODY, encodeRecipePage, parseRecipeHash, recipeBookmarklet, type CapturedRecipePage } from './recipeBookmarklet'

// The bookmark RUNS on someone else's page, so the only honest test is to run the exact
// string — RECIPE_BOOKMARKLET_BODY, what recipeBookmarklet() puts in the bookmark — on a
// fake page and read what it sends home.

interface FakeEl {
  type?: string
  textContent?: string
  innerText?: string
  attrs?: Record<string, string>
}
const el = (e: FakeEl) => ({ ...e, getAttribute: (k: string) => e.attrs?.[k] ?? null })

function fakePage(opts: { origin?: string; text?: string; scripts?: FakeEl[]; metas?: FakeEl[]; props?: FakeEl[]; wprm?: string[] } = {}) {
  const loc = { origin: opts.origin ?? 'https://www.recettes.qc.ca', href: 'https://www.recettes.qc.ca/recettes/recette/chili-con-carne-167900' }
  // The WHOLE page's text is what goes home — a `main` / `article` the site adds by
  // script is not the recipe (the live recettes.qc.ca page came home empty that way).
  const main = el({ innerText: 'NOT THIS — a sidebar article' })
  const doc = {
    title: 'Chili con carne | Recettes du Québec',
    body: el({ innerText: opts.text ?? 'Chili con carne\nIngrédients\n1 kg viande hachée' }),
    getElementsByTagName: (t: string) => (t === 'script' ? opts.scripts ?? [] : t === 'meta' ? opts.metas ?? [] : []).map(el),
    querySelector: (q: string) => (q.startsWith('main') ? main : null),
    querySelectorAll: (q: string) =>
      q === '[data-react-app-props]'
        ? (opts.props ?? []).map(el)
        : q === '.wprm-recipe-ingredient-group-name'
          ? (opts.wprm ?? []).map((t) => el({ textContent: ` ${t} ` }))
          : [],
  }
  const alert = vi.fn()
  const run = new Function('document', 'location', 'alert', `return ${RECIPE_BOOKMARKLET_BODY}`)(doc, loc, alert) as (b: string) => void
  return { loc, alert, run }
}

const sent = (href: string): CapturedRecipePage => {
  const prefix = 'https://babillard.marcportal.com/kitchen/recipe/new'
  expect(href.startsWith(prefix + '#import=')).toBe(true)
  const page = parseRecipeHash(href.slice(prefix.length))
  expect(page).not.toBeNull()
  return page!
}

describe('the « Envoyer à Babillard » bookmark, run on a fake page', () => {
  it('sends every ld+json block raw, og:image, the title and the page text — home, in the address', () => {
    const ld1 = '{"@context":"https://schema.org","@type":"WebSite","name":"Recettes du Québec"}'
    const ld2 = '{"@type":"Recipe","name":"Chili con carne","recipeIngredient":["1 kg viande hachée"]}'
    const p = fakePage({
      scripts: [{ type: 'text/javascript', textContent: 'var x=1' }, { type: 'application/ld+json', textContent: ld1 }, { type: 'application/ld+json', textContent: ld2 }],
      metas: [{ attrs: { property: 'og:image', content: 'https://img.test/chili.jpg' } }],
    })
    p.run('https://babillard.marcportal.com')
    const page = sent(p.loc.href)
    expect(page.jsonld).toEqual([ld1, ld2])
    expect(page.image).toBe('https://img.test/chili.jpg')
    expect(page.title).toBe('Chili con carne | Recettes du Québec')
    expect(page.url).toBe('https://www.recettes.qc.ca/recettes/recette/chili-con-carne-167900')
    expect(page.text).toBe('Chili con carne\nIngrédients\n1 kg viande hachée')
    expect(page.extras).toBeUndefined()
  })

  it('carries Ricardo’s cooking-mode props and WPRM group names', () => {
    const props = '{"ingredientGroups":[{"description":"Glaçage"}]}'
    const p = fakePage({
      props: [{ attrs: { 'data-react-app': 'header', 'data-react-app-props': '{}' } }, { attrs: { 'data-react-app': 'recipeCookingMode', 'data-react-app-props': props } }],
      wprm: ['Beef', 'To cook'],
    })
    p.run('https://babillard.marcportal.com')
    expect(sent(p.loc.href).extras).toEqual({ ricardo: props, wprm: { ingredients: ['Beef', 'To cook'], steps: [] } })
  })

  it('caps the text at 120 KB, and drops it first when the whole would pass ~200 KB', () => {
    const big = fakePage({ text: 'x'.repeat(130_000) })
    big.run('https://babillard.marcportal.com')
    expect(sent(big.loc.href).text).toHaveLength(120_000)
    const huge = fakePage({ text: 'x'.repeat(50_000), scripts: [{ type: 'application/ld+json', textContent: '{"@type":"Recipe","name":"' + 'y'.repeat(149_000) + '"}' }] })
    huge.run('https://babillard.marcportal.com')
    const page = sent(huge.loc.href)
    expect(page.text).toBe('')
    expect(page.jsonld).toHaveLength(1)
  })

  it('refuses to run on Babillard itself — says so, goes nowhere', () => {
    const p = fakePage({ origin: 'https://babillard.marcportal.com' })
    const before = p.loc.href
    p.run('https://babillard.marcportal.com')
    expect(p.alert).toHaveBeenCalledOnce()
    expect(p.loc.href).toBe(before)
  })
})

describe('the bookmark itself', () => {
  it('is the body called with the household’s origin — under the ~3 KB iOS Safari edge', () => {
    const b = recipeBookmarklet('https://babillard.marcportal.com')
    expect(b.startsWith('javascript:')).toBe(true)
    expect(decodeURIComponent(b.slice('javascript:'.length))).toBe(`${RECIPE_BOOKMARKLET_BODY}("https://babillard.marcportal.com")`)
    expect(b.length, 'Flipp’s bookmark stopped running on iPhone past ~3 KB').toBeLessThan(3000)
  })
  it('refuses an origin that is not plain', () => {
    expect(() => recipeBookmarklet('https://x.test/"+alert(1)+"')).toThrow()
  })
  it('stays ES5 with no backslash or single quote (it is the string that runs)', () => {
    expect(RECIPE_BOOKMARKLET_BODY).not.toMatch(/=>|\bconst\b|\blet\b|`|'/)
    expect(RECIPE_BOOKMARKLET_BODY.includes(String.fromCharCode(92))).toBe(false)
  })
})

describe('parseRecipeHash', () => {
  const page: CapturedRecipePage = { v: 1, url: 'https://x.test/r', title: 'T', image: '', jsonld: ['{}'], text: 'é' }
  it('round-trips the readable twin', () => expect(parseRecipeHash('#import=' + encodeRecipePage(page))).toEqual(page))
  it('refuses junk, a foreign shape, a non-http url', () => {
    expect(parseRecipeHash('#import=***')).toBeNull()
    expect(parseRecipeHash('#flipp=' + encodeRecipePage(page))).toBeNull()
    expect(parseRecipeHash('#import=' + encodeRecipePage({ ...page, url: 'javascript:alert(1)' }))).toBeNull()
  })
})
