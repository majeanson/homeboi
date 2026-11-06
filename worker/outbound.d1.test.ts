import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'
import { arrivedAt, useFakes } from '../functions/test/fakes'
import { usageToday } from '../functions/_lib/usage'
import { localDayStart, nowSec } from '../functions/_lib/ids'

// THE ROUTES THAT LEAVE THE WORKER, on a real D1 (d1Coverage.test.ts). `isolation.d1.test`
// walks them with a shrug — a 5xx there is the internet — so until now none had a positive
// path. The upstream is scripted from the payloads each handler's own comments document;
// what is real is everything a handler adds: which household's postal code, store list and
// Flipp language go out, what comes back in what shape, and what lands in R2 and on the meter.

const fakes = useFakes()
const { ai, net } = fakes

const FLIPP = 'backflipp.wishabi.com'
const settle = (s: Session, body: Record<string, unknown>) => okJson(s.fetch('/api/household', { method: 'PATCH', body }))
const located = async (label: string, body: Record<string, unknown> = {}) => {
  const s = await household(label, undefined, { empty: true })
  await settle(s, { postal: 'h2x 1y4', ...body })
  return s
}

describe('les aubaines', () => {
  const item = (o: Record<string, unknown>) => ({ current_price: 5, merchant_name: 'IGA', ...o })

  it('asks Flipp with the household’s postal code and language, and shapes each deal', async () => {
    const s = await located('deals', { flippLang: 'en' })
    net.json(`${FLIPP}/flipp/items/search`, {
      items: [
        {
          name: 'Lait 2 L',
          current_price: 5,
          original_price: 6.5,
          merchant_name: 'IGA',
          merchant_id: 9,
          merchant_logo: 'http://f.wishabi.net/logo.png',
          premium: true,
          clean_image_url: 'http://f.wishabi.net/clean.jpg',
          clipping_image_url: 'http://f.wishabi.net/clip.jpg',
          flyer_item_id: 11,
          flyer_id: 22,
          left: 1,
          right: 2,
          top: 3,
          bottom: 4,
          valid_from: '2026-11-05',
          valid_to: '2026-11-11',
        },
        { name: 'Sans prix', current_price: null, merchant_name: 'IGA' },
      ],
    })
    const res = await okJson(s.fetch('/api/deals?q=2%20L%20de%20lait'))
    expect(res).toEqual({
      query: '2 L de lait',
      postal: 'H2X1Y4',
      count: 1,
      deals: [
        {
          id: 11,
          flyerId: 22,
          name: 'Lait 2 L',
          price: 5,
          wasPrice: 6.5,
          unitPrice: 2.5,
          unitLabel: '/L',
          unitKind: 'volume',
          unitApprox: false,
          merchant: 'IGA',
          logo: 'https://f.wishabi.net/logo.png',
          premium: true,
          image: 'https://f.wishabi.net/clean.jpg',
          cutout: 'https://f.wishabi.net/clip.jpg',
          validFrom: '2026-11-05',
          validTo: '2026-11-11',
          merchantId: 9,
          box: { left: 1, right: 2, top: 3, bottom: 4 },
        },
      ],
    })
    const url = new URL(net.calls[0]!.url)
    expect(url.searchParams.get('locale'), 'the Flipp app’s language, ahead of the UI’s').toBe('en-ca')
    expect(url.searchParams.get('postal_code')).toBe('H2X1Y4')
    expect(url.searchParams.get('q'), 'the bare item word').toBe('Lait')
  })

  it('folds the synonyms into one list, keeps the kept stores, and ranks best value first', async () => {
    const s = await located('deals-merge', { includedStores: ['IGA', 'Maxi'] })
    net.on('q=Oeufs', () => Response.json({ items: [item({ flyer_item_id: 1, name: 'Lait 4 L', current_price: 8 }), item({ flyer_item_id: 2, name: 'Lait 1 L', current_price: 2, merchant_name: 'Métro' })] }))
    net.on('q=Egg', () => Response.json({ items: [item({ flyer_item_id: 1, name: 'Lait 4 L', current_price: 8 }), item({ flyer_item_id: 3, name: 'Lait 2 L', current_price: 3, merchant_name: 'Maxi' })] }))
    net.on('q=Bris', () => new Response('nope', { status: 500 }))
    const { deals, count } = await okJson<{ count: number; deals: { id: number; merchant: string; unitPrice: number }[] }>(s.fetch('/api/deals?q=Oeufs&terms=Egg,Bris'))
    expect(net.calls).toHaveLength(3)
    expect(count).toBe(2)
    expect(deals.map((d) => [d.id, d.merchant, d.unitPrice]), 'once each, Métro out, cheapest per litre on top').toEqual([
      [3, 'Maxi', 1.5],
      [1, 'IGA', 2],
    ])
  })

  it('the size sniper only proposes wording: the parser still does the math, and it is charged', async () => {
    const s = await located('deals-sniper')
    net.json(FLIPP, { items: [item({ name: 'Fromage en bloc', current_price: 5, flyer_item_id: 1 }), item({ name: 'Mystère', current_price: 4, flyer_item_id: 2 })] })
    ai.on(/llama-3\.3/, { response: [{ i: 0, size: '500 g' }, { i: 1, size: 'beaucoup' }] })
    const { deals } = await okJson<{ deals: { id: number; unitPrice: number | null; unitLabel: string | null; unitApprox: boolean }[] }>(s.fetch('/api/deals?q=fromage'))
    expect(deals.find((d) => d.id === 1)).toMatchObject({ unitPrice: 10, unitLabel: '/kg', unitApprox: true })
    expect(deals.find((d) => d.id === 2), 'a hallucinated size parses to nothing').toMatchObject({ unitPrice: null, unitApprox: false })
    expect((await usageToday(env, s.householdId)).ai).toBe(1)
  })

  it('with AI switched off the deals still come, unsized', async () => {
    const s = await located('deals-off', { aiEnabled: false })
    net.json(FLIPP, { items: [item({ name: 'Fromage', flyer_item_id: 1 })] })
    expect(await okJson(s.fetch('/api/deals?q=fromage'))).toMatchObject({ count: 1, deals: [{ unitPrice: null }] })
    expect(ai.calls).toEqual([])
  })

  it('refuses what it cannot ask, and a Flipp outage is a 503 the list hides behind', async () => {
    const s = await household('deals-bad', undefined, { empty: true })
    expect((await s.fetch('/api/deals')).status).toBe(400)
    expect((await s.fetch('/api/deals?q=lait')).status, 'no postal code anywhere').toBe(400)
    expect((await s.fetch('/api/deals?q=lait&postal=nope')).status).toBe(400)
    expect(net.calls).toEqual([])
    net.on(FLIPP, () => new Response('blocked', { status: 403 }))
    expect((await s.fetch('/api/deals?q=lait&postal=H2X1Y4')).status).toBe(503)
  })
})

describe('une circulaire', () => {
  const PAGE = `${FLIPP}/flipp/flyers/7961971`

  it('rebuilds the pages and items, in reading order, with the run dates most items carry', async () => {
    const s = await located('flyer')
    const run = { valid_from: '2026-11-05', valid_to: '2026-11-11' }
    net.json(PAGE, {
      pages: [
        { id: 2, page: 2, left: 0, top: 10, right: 100, bottom: 20 },
        { id: 1, page: 1, right: 100 },
      ],
      items: [
        { id: 1, name: 'Beurre 454 g', price: 4.54, cutout_image_url: 'http://f.wishabi.net/a.jpg', left: 1, top: 2, right: 3, bottom: 4, ...run },
        { id: 2, name: 'Pain', price: null, cutout_image_url: 'https://f.wishabi.net/b.jpg', ...run },
        { id: 3, name: 'Promo 2 jours', price: 1, valid_from: '2026-11-07', valid_to: '2026-11-08' },
      ],
    })
    const res = await okJson<Record<string, unknown>>(s.fetch('/api/flyer?id=7961971'))
    expect(res).toMatchObject({ flyerId: 7961971, postal: 'H2X1Y4', validFrom: '2026-11-05', validTo: '2026-11-11' })
    expect(res.pages).toEqual([
      { id: 1, page: 1, left: 0, top: 0, right: 100, bottom: 0 },
      { id: 2, page: 2, left: 0, top: 10, right: 100, bottom: 20 },
    ])
    expect(res.items, 'an item with no image cannot be composited').toEqual([
      { id: 1, name: 'Beurre 454 g', price: 4.54, unitPrice: 10, unitLabel: '/kg', unitKind: 'mass', validFrom: '2026-11-05', validTo: '2026-11-11', image: 'https://f.wishabi.net/a.jpg', left: 1, top: 2, right: 3, bottom: 4 },
      { id: 2, name: 'Pain', price: null, unitPrice: null, unitLabel: null, unitKind: null, validFrom: '2026-11-05', validTo: '2026-11-11', image: 'https://f.wishabi.net/b.jpg', left: 0, top: 0, right: 0, bottom: 0 },
    ])
    expect(new URL(net.calls[0]!.url).searchParams.get('postal_code')).toBe('H2X1Y4')
  })

  it('refuses a bad id before leaving, and degrades to a 503', async () => {
    const s = await located('flyer-bad')
    expect((await s.fetch('/api/flyer?id=../etc')).status).toBe(400)
    expect(net.calls).toEqual([])
    net.on(PAGE, () => new Response('gone', { status: 500 }))
    expect((await s.fetch('/api/flyer?id=7961971')).status).toBe(503)
  })
})

describe('la liste des circulaires', () => {
  const FEED = `${FLIPP}/flipp/flyers?`
  const flyer = (id: number, merchant: string, valid_from: string, categories = ['Groceries']) => ({ id, merchant, valid_from, valid_to: '2026-12-01', categories, merchant_logo: 'http://f.wishabi.net/l.png' })
  const payload = {
    flyers: [
      flyer(4, 'Maxi', '2026-11-12'),
      flyer(1, 'IGA', '2026-11-05'),
      flyer(2, 'Jean Coutu', '2026-11-05', ['PHARMACY']),
      flyer(3, 'Rona', '2026-11-05', ['Home & Garden']),
      flyer(1, 'IGA', '2026-11-05'),
      flyer(5, 'IGA', '2026-11-05'),
      { id: 'x', merchant: 'Sans id', categories: ['Groceries'] },
    ],
  }

  it('keeps food flyers, once each, this week first', async () => {
    const s = await located('flyers')
    net.json(FEED, payload)
    const { postal, count, flyers } = await okJson<{ postal: string; count: number; flyers: { flyerId: number; logo: string; premium: boolean }[] }>(s.fetch('/api/flyers'))
    expect(postal).toBe('H2X1Y4')
    expect(count).toBe(4)
    expect(flyers.map((f) => f.flyerId)).toEqual([1, 5, 2, 4])
    expect(flyers[0]).toEqual({ flyerId: 1, merchant: 'IGA', logo: 'https://f.wishabi.net/l.png', validFrom: '2026-11-05', validTo: '2026-12-01', premium: false })
  })

  it('the feed drops what the household left out; the settings view shows each store, tagged', async () => {
    const s = await located('flyers-kept', { includedStores: ['IGA'] })
    net.json(FEED, payload)
    const feed = await okJson<{ flyers: { merchant: string }[] }>(s.fetch('/api/flyers'))
    expect([...new Set(feed.flyers.map((f) => f.merchant))]).toEqual(['IGA'])
    const manage = await okJson<{ flyers: { merchant: string; included: boolean }[] }>(s.fetch('/api/flyers?manage=1'))
    expect(manage.flyers.map((f) => [f.merchant, f.included])).toEqual([
      ['IGA', true],
      ['Jean Coutu', false],
      ['Maxi', false],
    ])
  })

  it('needs a postal code, and degrades to a 503', async () => {
    const s = await household('flyers-bad', undefined, { empty: true })
    expect((await s.fetch('/api/flyers')).status).toBe(400)
    net.on(FEED, () => new Response('', { status: 502 }))
    expect((await s.fetch('/api/flyers?postal=H2X1Y4')).status).toBe(503)
  })
})

describe('le mandataire des images de circulaire', () => {
  const src = (u: string) => `/api/flyer-img?u=${encodeURIComponent(u)}`
  const JPEG = () => new Response(new Uint8Array([9, 8, 7]), { headers: { 'content-type': 'image/jpeg' } })

  it('serves an allowlisted image to a bare <img>, over https, cached hard', async () => {
    net.on('f.wishabi.net/first.jpg', JPEG)
    const r = await anon(src('http://f.wishabi.net/first.jpg'))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/jpeg')
    expect(r.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([9, 8, 7])
    expect(net.calls.map((c) => c.url), 'upgraded before it leaves').toEqual(['https://f.wishabi.net/first.jpg'])
  })

  it('heals a 5xx with one retry, and treats a 4xx as final', async () => {
    let n = 0
    net.on('f.wishabi.net/flaky.jpg', () => (++n === 1 ? new Response('', { status: 502 }) : JPEG()))
    expect((await anon(src('https://f.wishabi.net/flaky.jpg'))).status).toBe(200)
    expect(n).toBe(2)
    net.on('images.wishabi.net/gone.jpg', () => new Response('', { status: 429 }))
    expect((await anon(src('https://images.wishabi.net/gone.jpg'))).status).toBe(404)
    expect(net.to('gone.jpg')).toHaveLength(1)
  })

  it('is no open proxy: another host, or an answer that is not an image, goes nowhere', async () => {
    expect((await anon('/api/flyer-img')).status).toBe(400)
    expect((await anon(src('pas une url'))).status).toBe(400)
    expect((await anon(src('https://evil.example/x.jpg'))).status).toBe(404)
    expect((await anon(src('ftp://f.wishabi.net/x.jpg'))).status).toBe(404)
    expect(net.calls, 'refused before any fetch').toEqual([])
    net.on('f.wishabi.net/page', () => new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    expect((await anon(src('https://f.wishabi.net/page'))).status).toBe(404)
    net.on('f.wishabi.net/down', () => {
      throw new Error('network')
    })
    expect((await anon(src('https://f.wishabi.net/down'))).status).toBe(503)
    expect(net.to('down'), 'a thrown fetch is retried too').toHaveLength(2)
  })
})

describe('la fiche d’un commerce depuis Google Maps', () => {
  const LINK = 'https://maps.app.goo.gl/abc'
  const PHOTO_URL = 'https://lh3.googleusercontent.com/p/place.jpg'
  const OG = `<meta property="og:title" content="Clinique Dentaire · 4.8★(120) · Dentiste"><meta property="og:description" content="123 rue Laurier, Montréal"><meta property="og:image" content="${PHOTO_URL}">`
  const post = (s: Session, url: string) => s.fetch('/api/place-import', { method: 'POST', body: { url } })

  it('reads the rich preview and keeps the photo in R2', async () => {
    const s = await household('place', undefined, { empty: true })
    const dest = 'https://www.google.com/maps/place/Clinique/@45.5,-73.6,17z'
    net.on(LINK, () => arrivedAt(dest, new Response(OG, { headers: { 'content-type': 'text/html' } })))
    net.on(PHOTO_URL, () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }))

    const res = await okJson<{ photoKey: string } & Record<string, unknown>>(post(s, LINK))
    expect(res).toMatchObject({ name: 'Clinique Dentaire', address: '123 rue Laurier, Montréal', category: 'Dentiste', lat: 45.5, lng: -73.6, mapUrl: dest, empty: false })
    expect(res.photoKey).toMatch(/^bz/)
    const blob = await env.PHOTOS!.get(res.photoKey)
    expect(blob!.httpMetadata?.contentType).toBe('image/png')
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([1, 2, 3])
    expect(net.to(LINK)[0]!.headers.get('user-agent'), 'Google only previews for a crawler').toContain('facebookexternalhit')
    expect((await anon(`/api/img/${res.photoKey}`)).status, 'the key serves').toBe(200)
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM businesses WHERE household_id = ?').bind(s.householdId).first('n'), 'a draft, not a card').toBe(0)
  })

  it('a datacenter block still yields the name and address from where Google was sending us', async () => {
    const s = await household('place-sorry', undefined, { empty: true })
    const target = 'https://www.google.com/maps?q=Boulangerie+Rose,+12+rue+Fleury,+Montréal'
    const sorry = `https://www.google.com/sorry/index?continue=${encodeURIComponent(target)}&q=EgSinn`
    net.on(LINK, () => arrivedAt(sorry, new Response('captcha', { status: 429 })))
    expect(await okJson(post(s, LINK))).toMatchObject({ name: 'Boulangerie Rose', address: '12 rue Fleury, Montréal', category: null, photoKey: null, mapUrl: new URL(target).toString(), empty: false })
  })

  it('a block with nowhere to go is empty, and a block’s own token never becomes a name', async () => {
    const s = await household('place-blocked', undefined, { empty: true })
    net.on(LINK, () => arrivedAt('https://www.google.com/sorry/index?q=EgSinn', new Response('captcha', { status: 429 })))
    expect(await okJson(post(s, LINK))).toEqual({ name: null, address: null, category: null, photoKey: null, lat: null, lng: null, mapUrl: LINK, empty: true })
  })

  it('fetches Google and nothing else, and says so when Google cannot be reached', async () => {
    const s = await household('place-bad', undefined, { empty: true })
    expect((await post(s, 'https://evil.example/maps')).status).toBe(400)
    expect(net.calls).toEqual([])
    net.on(LINK, () => {
      throw new Error('dns')
    })
    expect((await post(s, LINK)).status).toBe(503)
  })

  it('a photo off Google’s CDNs is not fetched', async () => {
    const s = await household('place-photo', undefined, { empty: true })
    const html = OG.replace(PHOTO_URL, 'https://evil.example/x.jpg')
    net.on(LINK, () => arrivedAt('https://www.google.com/maps/place/C', new Response(html)))
    expect(await okJson(post(s, LINK))).toMatchObject({ name: 'Clinique Dentaire', photoKey: null })
    expect(net.to('evil.example')).toEqual([])
  })
})

describe('l’import d’une recette', () => {
  const PAGE = 'https://recettes.example/tarte'
  const STEP_PHOTO = 'https://recettes.example/etape1.jpg'
  const post = (s: Session, body: Record<string, unknown>) => s.fetch('/api/recipe-import', { method: 'POST', body })
  const recipe = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Tarte au sucre',
    recipeYield: '8 portions',
    prepTime: 'PT15M',
    recipeIngredient: ['1 tasse de sucre', '1 tasse de crème'],
    recipeInstructions: [
      { '@type': 'HowToStep', text: 'Mélanger le tout.', image: STEP_PHOTO },
      { '@type': 'HowToStep', text: 'Cuire 30 minutes.' },
    ],
  }
  const page = (body = '') => `<html><head><title>Recettes du Québec</title><script type="application/ld+json">${JSON.stringify(recipe)}</script></head><body>${body}</body></html>`
  const html = (text: string, init?: ResponseInit) => () => new Response(text, { headers: { 'content-type': 'text/html' }, ...init })
  const ACCESS_DENIED = '<html><head><title>Access Denied</title></head><body>non</body></html>'
  const count = (s: Session) => env.DB.prepare('SELECT COUNT(*) AS n FROM recipes WHERE household_id = ?').bind(s.householdId).first('n')
  const noStepPhoto = () => net.on(STEP_PHOTO, () => new Response('', { status: 404 }))

  it('reads the site’s own data with no model, keeps its step photo, and saves no recipe', async () => {
    const s = await household('import', undefined, { empty: true })
    net.on(PAGE, html(page()))
    net.on(STEP_PHOTO, () => new Response(new Uint8Array(1234), { headers: { 'content-type': 'image/jpeg' } }))

    const d = await okJson<{ stepImages: string[] } & Record<string, unknown>>(post(s, { url: PAGE }))
    expect(d).toMatchObject({
      title: 'Tarte au sucre',
      ingredients: ['1 tasse de sucre', '1 tasse de crème'],
      steps: ['Mélanger le tout.', 'Cuire 30 minutes.'],
      servings: 8,
      times: { prep: 15 },
      source: PAGE,
      structuring: 'jsonld',
      fetched: 'direct',
      lang: 'fr',
    })
    expect(d.stepImages).toEqual([expect.stringMatching(/^rsi/), ''])
    expect(d, 'the URLs never reach the client').not.toHaveProperty('stepImageUrls')
    expect((await env.PHOTOS!.get(d.stepImages[0]!))!.size).toBe(1234)
    expect((await usageToday(env, s.householdId)).bytes, 'the photo is charged to the day’s bytes').toBe(1234)
    expect(ai.calls).toEqual([])
    expect(await count(s), 'the cook reviews before saving').toBe(0)
  })

  it('follows a redirect only while it stays public', async () => {
    const s = await household('import-hop', undefined, { empty: true })
    net.on(PAGE, () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }))
    net.json('r.jina.ai', {}, { status: 503 })
    expect(await okJson(post(s, { url: PAGE }))).toMatchObject({ empty: true, reason: 'blocked', source: PAGE })
    expect(net.to('127.0.0.1').filter((c) => !c.url.includes('r.jina.ai')), 'the internal hop is never taken').toEqual([])
  })

  it('a refused page goes to a real browser, on the household’s render meter', async () => {
    const s = await household('import-browser', undefined, { empty: true })
    net.on(PAGE, html(ACCESS_DENIED, { status: 403 }))
    noStepPhoto()
    const asked: string[] = []
    fakes.bind('BROWSER', {
      quickAction: async (_action: string, o: { url: string }) => {
        asked.push(o.url)
        return { success: true, result: page() }
      },
    })
    expect(await okJson(post(s, { url: PAGE }))).toMatchObject({ title: 'Tarte au sucre', fetched: 'browser' })
    expect(asked).toEqual([PAGE])
    const day = localDayStart(new Date(nowSec() * 1000))
    expect(await env.DB.prepare('SELECT browser_renders AS n FROM usage_daily WHERE household_id = ? AND day = ?').bind(s.householdId, day).first('n')).toBe(1)
  })

  it('then to the public reader, and a refusal rendered as 200 counts as a refusal', async () => {
    const s = await household('import-reader', undefined, { empty: true })
    net.on(PAGE, html(ACCESS_DENIED))
    net.on('r.jina.ai', html(page()))
    noStepPhoto()
    expect(await okJson(post(s, { url: PAGE }))).toMatchObject({ title: 'Tarte au sucre', fetched: 'reader' })
    expect(net.to('r.jina.ai')[0]!.url).toBe(`https://r.jina.ai/${PAGE}`)
    expect(net.to('r.jina.ai')[0]!.headers.get('x-return-format'), 'its markdown would drop the JSON-LD').toBe('html')
  })

  it('every door shut says blocked, not « l’IA est désactivée »', async () => {
    const s = await household('import-blocked', undefined, { empty: true })
    net.on(PAGE, () => new Response('', { status: 403 }))
    net.on('r.jina.ai', () => {
      throw new Error('down')
    })
    const r = await post(s, { url: PAGE })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ empty: true, reason: 'blocked', source: PAGE, title: null })
  })

  it('a page with no recipe data goes to the model, which picks lines and writes none', async () => {
    const s = await household('import-model', undefined, { empty: true })
    const lines = ['Galettes de mamie', '2 tasses de farine', '1 tasse de sucre', 'mêler le tout ensemble', 'cuire au four bien chaud']
    net.on(PAGE, html(`<html><head><title>Galettes</title></head><body>${lines.map((l) => `<p>${l}</p>`).join('')}</body></html>`))
    // Line 0 is the page's <title>: the model numbers the whole page, not the body.
    ai.on(/llama-3\.3/, { response: JSON.stringify({ title: 1, ingredients: [2, 3], steps: [4, 5], notes: [] }) })
    const d = await okJson<Record<string, unknown>>(post(s, { url: PAGE, hint: 'la recette de mamie' }))
    expect(d).toMatchObject({ ingredients: ['2 tasses de farine', '1 tasse de sucre'], steps: ['mêler le tout ensemble', 'cuire au four bien chaud'], structuring: 'ai', source: PAGE, fetched: 'direct' })
    expect(ai.sent(), 'the cook’s note reaches the prompt').toContain('la recette de mamie')
    expect((await usageToday(env, s.householdId)).ai).toBe(1)
  })

  it('an article reads as no recipe, and with AI off the page is never sent anywhere', async () => {
    const s = await household('import-article', undefined, { empty: true })
    await settle(s, { aiEnabled: false })
    net.on(PAGE, html('<html><head><title>Dix idées de souper</title></head><body><p>Un article sur les soupers.</p></body></html>'))
    expect(await okJson(post(s, { url: PAGE }))).toMatchObject({ empty: true, reason: 'no-recipe', fetched: 'direct' })
    expect(ai.calls).toEqual([])
  })

  it('the bookmarklet’s page is read without a fetch, and says what arrived when it reads as nothing', async () => {
    const s = await household('import-page', undefined, { empty: true })
    const d = await okJson<Record<string, unknown>>(post(s, { page: { url: PAGE, title: 'Recettes du Québec', jsonld: [JSON.stringify({ ...recipe, recipeInstructions: ['Mélanger.', 'Cuire.'] })], text: '' } }))
    expect(d).toMatchObject({ title: 'Tarte au sucre', steps: ['Mélanger.', 'Cuire.'], structuring: 'jsonld', fetched: 'bookmarklet' })
    await settle(s, { aiEnabled: false })
    const none = await okJson<Record<string, unknown>>(post(s, { page: { url: PAGE, title: 'Rien', jsonld: [], text: 'Bonjour' } }))
    expect(none).toMatchObject({ empty: true, reason: 'no-recipe', fetched: 'bookmarklet', received: { blocks: 0, chars: 7 } })
    expect(net.calls).toEqual([])
  })

  it('a pasted recipe with headings needs nothing outside the Worker', async () => {
    const s = await household('import-paste', undefined, { empty: true })
    const text = 'Tarte\n\nIngrédients\n- 1 tasse de sucre\n- 1 tasse de crème\n\nPréparation\n1. Mélanger.\n2. Cuire.'
    expect(await okJson(post(s, { text }))).toMatchObject({ title: 'Tarte', steps: ['Mélanger.', 'Cuire.'], structuring: 'headings' })
    expect(ai.calls).toEqual([])
    expect(net.calls).toEqual([])
  })

  it('refuses an address before fetching it', async () => {
    const s = await household('import-bad', undefined, { empty: true })
    for (const body of [{}, { url: 'ftp://x.example/a' }, { url: 'http://127.0.0.1/a' }, { url: 'http://[::1]/a' }, { url: 'http://printer.local/a' }, { page: { url: 'http://10.0.0.1/' } }]) {
      expect((await post(s, body)).status, JSON.stringify(body)).toBe(400)
    }
    expect(net.calls).toEqual([])
  })
})

describe('la météo', () => {
  const GEO = 'api.zippopotam.us/CA/H2X'
  const WX = 'api.open-meteo.com/v1/forecast'
  const hourly = Array.from({ length: 24 }, (_, h) => `2026-11-06T${String(h).padStart(2, '0')}:00`)
  const forecast = {
    current: { time: '2026-11-06T10:15', temperature_2m: 3.6, weather_code: 0, is_day: 1 },
    hourly: { time: hourly, temperature_2m: hourly.map((_, h) => h + 0.4), weather_code: hourly.map(() => 61) },
    daily: { weather_code: [0, 71], temperature_2m_max: [5, -1.6], temperature_2m_min: [0, -7.4] },
  }

  it('asks by the household’s FSA, and shapes now, tomorrow and the next hours', async () => {
    const s = await located('weather')
    net.json(GEO, { places: [{ latitude: '45.5', longitude: '-73.6' }] })
    net.json(WX, forecast)
    expect(await okJson(s.fetch('/api/weather'))).toEqual({
      weather: { tempC: 4, bucket: 'clear', isDay: true },
      tomorrow: { bucket: 'snow', highC: -2, lowC: -7 },
      hours: [
        { hour: 13, tempC: 13, bucket: 'rain' },
        { hour: 16, tempC: 16, bucket: 'rain' },
        { hour: 19, tempC: 19, bucket: 'rain' },
      ],
    })
    const url = new URL(net.to(WX)[0]!.url)
    expect([url.searchParams.get('latitude'), url.searchParams.get('longitude')]).toEqual(['45.5', '-73.6'])
    expect(net.to(GEO)[0]!.url, 'the FSA, never the full postal code').toBe('https://api.zippopotam.us/CA/H2X')
  })

  it('a partial payload keeps what it has', async () => {
    const s = await located('weather-partial')
    net.json(GEO, { places: [{ latitude: '45.5', longitude: '-73.6' }] })
    net.json(WX, { current: forecast.current })
    expect(await okJson(s.fetch('/api/weather'))).toEqual({ weather: { tempC: 4, bucket: 'clear', isDay: true }, tomorrow: null, hours: null })
  })

  it('no postal code, or any upstream miss, hides the chip and never errors', async () => {
    const none = { weather: null, tomorrow: null, hours: null }
    const s = await household('weather-none', undefined, { empty: true })
    expect(await okJson(s.fetch('/api/weather'))).toEqual(none)
    expect(net.calls, 'nothing to ask').toEqual([])

    const t = await located('weather-miss')
    net.on(GEO, () => new Response('', { status: 404 }))
    expect(await okJson(t.fetch('/api/weather'))).toEqual(none)
    net.json(GEO, { places: [] })
    expect(await okJson(t.fetch('/api/weather'))).toEqual(none)
    net.json(GEO, { places: [{ latitude: '45.5', longitude: '-73.6' }] })
    net.on(WX, () => {
      throw new Error('down')
    })
    expect(await okJson(t.fetch('/api/weather'))).toEqual(none)
  })
})

describe('la merveille du jour', () => {
  const BING = 'www.bing.com/HPImageArchive.aspx'
  const WIKI = 'wikipedia.org/api/rest_v1/feed/featured'
  const APOD = 'api.nasa.gov/planetary/apod'
  const EPIC = 'api.nasa.gov/EPIC/api/natural'
  const MARS = 'api.nasa.gov/mars-photos'
  const down = () => new Response('', { status: 503 })
  const wonder = async (s: Session, q = '', headers?: Record<string, string>) => (await okJson<{ wonder: Record<string, unknown> | null }>(s.fetch(`/api/wonder${q}`, { headers }))).wonder

  it('bing by default, in the app language, with the place and the credit split', async () => {
    const s = await household('wonder', undefined, { empty: true })
    net.json(BING, { images: [{ url: '/th?id=OHR.Fuji.jpg', title: 'Le mont sacré', copyright: 'Mont Fuji, Japon (© Quelqu’un/Getty)' }] })
    expect(await wonder(s)).toEqual({
      source: 'bing',
      title: 'Le mont sacré',
      explanation: 'Mont Fuji, Japon',
      lang: 'fr',
      imgUrl: 'https://www.bing.com/th?id=OHR.Fuji.jpg',
      copyright: '© Quelqu’un/Getty',
    })
    await wonder(s, '', { 'X-Lang': 'en' })
    expect(new URL(net.to(BING)[1]!.url).searchParams.get('mkt')).toBe('en-CA')
  })

  it('wikipedia: the caption is the headline, read in the language it is really in', async () => {
    const s = await household('wonder-wiki', undefined, { empty: true })
    net.json(WIKI, { image: { description: { text: '<b>Gazelles</b> at dusk', lang: 'en' }, image: { source: 'http://upload.wikimedia.org/g.jpg' }, artist: { text: '<a>Ansel</a>' } } })
    expect(await wonder(s, '?source=wiki')).toEqual({ source: 'wiki', title: 'Gazelles at dusk', explanation: '', lang: 'en', imgUrl: 'https://upload.wikimedia.org/g.jpg', copyright: 'Ansel' })
    expect(net.to(WIKI)[0]!.url).toMatch(/^https:\/\/fr\.wikipedia\.org\/.*\/\d{4}\/\d{2}\/\d{2}$/)
  })

  it('apod: English always, and a video day shows its still', async () => {
    const s = await household('wonder-apod', undefined, { empty: true })
    net.json(APOD, { title: 'M31', explanation: 'A galaxy.', media_type: 'video', thumbnail_url: 'http://apod.nasa.gov/t.jpg', copyright: ' NASA ' })
    expect(await wonder(s, '?source=apod', { 'X-Lang': 'fr' })).toEqual({ source: 'apod', title: 'M31', explanation: 'A galaxy.', lang: 'en', imgUrl: 'https://apod.nasa.gov/t.jpg', copyright: 'NASA' })
  })

  it('epic builds the archive path; mars captions its camera and sol', async () => {
    const s = await household('wonder-nasa', undefined, { empty: true })
    fakes.bind('NASA_APOD_KEY', 'nasa-key')
    net.json(EPIC, [{ image: 'epic_1b_2026', date: '2026-11-05 12:34:56' }])
    const earth = await wonder(s, '?source=epic')
    expect(earth).toMatchObject({ source: 'epic', title: 'Notre planète, en direct', imgUrl: 'https://api.nasa.gov/EPIC/archive/natural/2026/11/05/png/epic_1b_2026.png?api_key=nasa-key' })
    net.json(MARS, { latest_photos: [{ img_src: 'http://mars.nasa.gov/p.jpg', earth_date: '2026-11-01', sol: 4500, camera: { full_name: 'Mast Camera' } }] })
    const mars = await wonder(s, '?source=mars', { 'X-Lang': 'en' })
    expect(mars).toMatchObject({ source: 'mars', title: 'Curiosity on Mars', lang: 'en', imgUrl: 'https://mars.nasa.gov/p.jpg' })
    expect(mars!.explanation).toContain('sol 4500 (2026-11-01)')
    expect(mars!.explanation).toContain('Camera: Mast Camera.')
  })

  it('a dead feed falls through to the next, and only then to nothing', async () => {
    const s = await household('wonder-down', undefined, { empty: true })
    net.on(MARS, down)
    net.json(BING, { images: [{}] })
    net.json(WIKI, { image: { description: { text: 'Secours' }, thumbnail: { source: 'https://w/t.jpg' } } })
    expect(await wonder(s, '?source=mars')).toMatchObject({ source: 'wiki', title: 'Secours', imgUrl: 'https://w/t.jpg' })

    net.on(WIKI, down)
    net.on(BING, () => {
      throw new Error('hang')
    })
    net.on(APOD, down)
    expect(await wonder(s, '?source=mars')).toBeNull()
    expect(net.to(EPIC), 'a slow NASA feed is never a fallback').toEqual([])
  })
})
