import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { anon, household, okJson, type Session } from '../functions/test/d1'

// LE LIVRE DE RECETTES against a real D1 and a real R2: the card, its as-imported snapshot,
// the hearts, the tags that span every recipe, and the blobs a recipe owns (which must be
// freed with it, and only with it).

interface Recipe {
  id: string
  title: string
  ingredients: string[]
  steps: string[]
  servings: number | null
  servingsUnit: string | null
  prepMin: number | null
  notes: string | null
  image: string | null
  tags: string[]
  stepImages: string[]
  lang: string | null
  original?: unknown
}

const book = async (s: Session) => (await okJson<{ recipes: Recipe[] }>(s.fetch('/api/recipes'))).recipes
const one = async (s: Session, id: string) => (await book(s)).find((r) => r.id === id)
const add = (s: Session, body: Record<string, unknown>) =>
  okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Tourtière', ingredients: ['1 lb de porc'], steps: ['Cuire'], ...body } }))
const save = (s: Session, body: Record<string, unknown>) => s.fetch('/api/recipes', { method: 'PATCH', body })
const member = (s: Session, name: string) => okJson<{ id: string }>(s.fetch('/api/members', { method: 'POST', body: { name } }))
const png = (s: Session, path: string) =>
  okJson<{ key: string }>(s.fetch(path, { method: 'POST', raw: new Uint8Array([137, 80, 78, 71, 1, 2, 3]), headers: { 'content-type': 'image/png' } }))
const stored = async (key: string) => (await env.PHOTOS!.head(key)) !== null

describe('une recette', () => {
  it('is written, read back whole, edited, and gone', async () => {
    const s = await household('recipes-crud', undefined, { empty: true })
    const { id } = await add(s, {
      title: '  Tourtière  ',
      ingredients: ['## Pâte', ' 2 tasses de farine ', '', '## Garniture', '1 lb de porc'],
      steps: ['Abaisser', '   ', 'Cuire 45 min'],
      servings: 6.9,
      servingsUnit: ' pointes ',
      prepMin: 30,
      notes: ' du jour de l’An ',
      tags: ['Fêtes', 'fêtes', 'Porc'],
      lang: 'fr',
    })
    expect(await one(s, id), 'a section heading is a line like any other; blanks go').toMatchObject({
      title: 'Tourtière',
      ingredients: ['## Pâte', '2 tasses de farine', '## Garniture', '1 lb de porc'],
      steps: ['Abaisser', 'Cuire 45 min'],
      servings: 6,
      servingsUnit: 'pointes',
      prepMin: 30,
      notes: 'du jour de l’An',
      tags: ['Fêtes', 'Porc'],
      lang: 'fr',
    })

    expect((await save(s, { id, title: 'Tourtière du Lac', ingredients: ['1 lb de boeuf'], steps: ['Cuire'], prepMin: 0, lang: 'xx' })).status).toBe(200)
    expect(await one(s, id), 'a full save: out-of-range values read as unset').toMatchObject({ title: 'Tourtière du Lac', ingredients: ['1 lb de boeuf'], prepMin: null, lang: null, tags: [] })

    await okJson(s.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect(await book(s)).toEqual([])
  })

  it('refuses a card with no title; a stranger’s id is a 404 that changes nothing', async () => {
    const s = await household('recipes-a', undefined, { empty: true })
    const other = await household('recipes-b', undefined, { empty: true })
    expect((await s.fetch('/api/recipes', { method: 'POST', body: { title: '  ' } })).status).toBe(400)
    const { id } = await add(s, { title: 'À moi' })
    expect((await save(other, { id, title: 'Volée' })).status).toBe(404)
    expect((await one(s, id))?.title).toBe('À moi')
  })

  it('the as-imported snapshot stays out of the list, survives an edit, and is read on its own', async () => {
    const s = await household('recipes-orig', undefined, { empty: true })
    const original = { title: 'Importée', ingredients: ['1 tasse de sucre'], steps: ['Mélanger'], servings: 4, importedAt: 1700000000 }
    const { id } = await add(s, { title: 'Importée', original })
    const hand = await add(s, { title: 'À la main' })

    expect((await one(s, id))!.original, 'a full second copy of the text taxes every poll').toBeUndefined()
    const read = async (rid: string) => (await okJson<{ original: { title: string; ingredients: string[] } | null }>(s.fetch(`/api/recipe-original?id=${rid}`))).original
    expect(await read(id)).toMatchObject({ title: 'Importée', ingredients: ['1 tasse de sucre'] })
    expect(await read(hand.id), 'a hand-typed recipe simply has none').toBeNull()
    expect((await s.fetch('/api/recipe-original?id=nope')).status, 'a recipe we do not have is not an empty one').toBe(404)

    await okJson(save(s, { id, title: 'Ma version', ingredients: ['2 tasses de sucre'], steps: ['Battre'] }))
    expect((await read(id))!.ingredients, 'an edit that carries no snapshot never wipes it').toEqual(['1 tasse de sucre'])
    await okJson(save(s, { id, title: 'Réimportée', ingredients: ['x'], steps: ['y'], original: { title: 'Nouvelle', ingredients: ['3 oeufs'], steps: [] } }))
    expect((await read(id))!.title, 'a fresh import during the edit replaces it').toBe('Nouvelle')
  })
})

describe('les coeurs', () => {
  const loves = async (s: Session) => (await okJson<{ loves: { recipe_id: string; member_id: string }[] }>(s.fetch('/api/recipe-loves'))).loves
  const asFace = (id: string) => ({ 'X-Profile': id })

  it('belong to a face: one heart per person, removing mine leaves yours, and the recipe takes them along', async () => {
    const s = await household('recipes-loves', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const zoe = await member(s, 'Zoé')
    const { id } = await add(s, {})

    expect((await s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id } })).status, 'Maisonnée has no « you » to attribute').toBe(400)
    for (let i = 0; i < 2; i++) await okJson(s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id }, headers: asFace(lea.id) }))
    await okJson(s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id }, headers: asFace(zoe.id) }))
    expect((await loves(s)).map((l) => l.member_id).sort(), 'a second tap is not a second heart').toEqual([lea.id, zoe.id].sort())

    await okJson(s.fetch('/api/recipe-loves', { method: 'DELETE', body: { recipeId: id }, headers: asFace(lea.id) }))
    expect((await loves(s)).map((l) => l.member_id)).toEqual([zoe.id])

    await okJson(s.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect(await loves(s), 'no orphan keyed to a gone recipe').toEqual([])
  })
})

describe('une recette aimée', () => {
  it('can be deleted, and a refused delete would have cost it its photos', async () => {
    const s = await household('recipes-loved', undefined, { empty: true })
    const lea = await member(s, 'Léa')
    const dish = await png(s, '/api/recipe-image')
    const { id } = await add(s, { image: dish.key })
    await okJson(s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id }, headers: { 'X-Profile': lea.id } }))

    await okJson(s.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect(await book(s)).toEqual([])
    expect(await stored(dish.key)).toBe(false)
  })

  it('a heart from another household cannot pin it, and a stranger’s DELETE touches neither', async () => {
    const s = await household('recipes-pin-a', undefined, { empty: true })
    const other = await household('recipes-pin-b', undefined, { empty: true })
    const zoe = await member(other, 'Zoé')
    const dish = await png(s, '/api/recipe-image')
    const { id } = await add(s, { image: dish.key })
    await okJson(other.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: id }, headers: { 'X-Profile': zoe.id } }))

    await okJson(other.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect((await one(s, id))?.image, 'not theirs to delete').toBe(dish.key)
    expect(await stored(dish.key), 'nor its photo to free').toBe(true)

    await okJson(s.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect(await book(s)).toEqual([])
  })
})

describe('vers la liste', () => {
  it('sends buyable names, once each, and never a section heading', async () => {
    const s = await household('recipes-tolist', undefined, { empty: true })
    const r = await okJson<{ added: number }>(
      s.fetch('/api/recipe-to-list', { method: 'POST', body: { items: ['## Glaçage', '15 ml (1 c. à soupe) de beurre non salé', '30 ml de beurre non salé', '2 œufs', '   '] } }),
    )
    expect(r.added).toBe(2)
    const { results } = await env.DB.prepare('SELECT text, source FROM list_items WHERE household_id = ? ORDER BY text').bind(s.householdId).all<{ text: string; source: string }>()
    expect(results).toEqual([
      { text: 'Beurre non salé', source: 'recipe' },
      { text: 'Œufs', source: 'recipe' },
    ])
    expect((await s.fetch('/api/recipe-to-list', { method: 'POST', body: { items: ['## Seulement un titre'] } })).status).toBe(400)
  })
})

describe('les étiquettes', () => {
  type Tags = { presets: string[]; used: { tag: string; count: number }[]; colors: Record<string, string>; pills: Record<string, unknown>[]; tagSlots: Record<string, string[]> }
  const tags = (s: Session) => okJson<Tags>(s.fetch('/api/recipe-tags'))
  const patch = (s: Session, body: Record<string, unknown>) => okJson<Partial<Tags> & { changed?: number }>(s.fetch('/api/recipe-tags', { method: 'PATCH', body }))

  it('a rename crosses every recipe, merges into a tag already there, and carries colour and meal slots', async () => {
    const s = await household('recipes-rename', undefined, { empty: true })
    const a = await add(s, { title: 'A', tags: ['Souper', 'Vite'] })
    const b = await add(s, { title: 'B', tags: ['souper', 'Soir'] })
    const c = await add(s, { title: 'C', tags: ['Vite'] })
    await patch(s, { presets: ['Souper', 'Vite', 'vite', '  '] })
    await patch(s, { setColor: { tag: 'SOUPER', color: '#AA0000' } })
    await patch(s, { setTagSlots: { tag: 'Souper', slots: ['supper', 'pas-un-repas'] } })

    const before = await tags(s)
    expect(before.used, 'counted case-insensitively, the first spelling shown').toEqual(expect.arrayContaining([{ tag: 'Souper', count: 2 }, { tag: 'Vite', count: 2 }]))
    expect(before.presets).toEqual(['Souper', 'Vite'])
    expect(before.colors).toEqual({ souper: '#aa0000' })
    expect(before.tagSlots, 'an unknown slot is dropped, not trusted').toEqual({ souper: ['supper'] })

    await patch(s, { rename: { from: 'souper', to: 'Soir' } })
    expect((await one(s, a.id))!.tags).toEqual(['Soir', 'Vite'])
    expect((await one(s, b.id))!.tags, 'the merge leaves one « Soir », not two').toEqual(['Soir'])
    expect((await one(s, c.id))!.tags, 'an unrelated recipe is untouched').toEqual(['Vite'])
    const after = await tags(s)
    expect(after.presets).toEqual(['Soir', 'Vite'])
    expect(after.colors, 'the colour follows the tag').toEqual({ soir: '#aa0000' })
    expect(after.tagSlots, 'what the label MEANT follows too').toEqual({ soir: ['supper'] })
  })

  it('a removal strips it everywhere, with its colour and slots; a blank colour clears', async () => {
    const s = await household('recipes-remove', undefined, { empty: true })
    const a = await add(s, { title: 'A', tags: ['Vite', 'Soir'] })
    await patch(s, { presets: ['Vite'] })
    await patch(s, { setColor: { tag: 'Vite', color: '#00ff00' } })
    await patch(s, { setTagSlots: { tag: 'Vite', slots: ['lunch'] } })
    await patch(s, { setColor: { tag: 'Soir', color: '#0000ff' } })
    await patch(s, { setColor: { tag: 'Soir', color: null } })
    expect((await tags(s)).colors).toEqual({ vite: '#00ff00' })

    await patch(s, { remove: 'VITE' })
    expect((await one(s, a.id))!.tags).toEqual(['Soir'])
    expect(await tags(s)).toMatchObject({ presets: [], colors: {}, tagSlots: {} })
    expect((await s.fetch('/api/recipe-tags', { method: 'PATCH', body: {} })).status).toBe(400)
  })

  it('a pill config keeps a good custom pill, drops junk, and every built-in stays reachable', async () => {
    const s = await household('recipes-pills', undefined, { empty: true })
    const { pills } = await patch(s, {
      setPills: [
        { k: 'fast', off: true },
        { k: 'fast' },
        { k: 'pas-une-pastille' },
        { id: 'p1', label: 'Rapide', rules: [{ field: 'totalMin', op: 'lte', n: 30 }, { field: 'bidon' }], slots: ['supper', 'x'] },
        { id: 'p2', label: 'Sans règle', rules: [] },
      ],
    })
    expect(pills!.slice(0, 2)).toEqual([
      { k: 'fast', off: true },
      { id: 'p1', label: 'Rapide', rules: [{ field: 'totalMin', op: 'lte', n: 30 }], slots: ['supper'] },
    ])
    expect((await tags(s)).pills.map((p) => p.k).filter(Boolean)).toEqual(['fast', 'cookable', 'useSoon', 'neglected', 'favorites', 'recent'])
  })
})

describe('les images d’une recette', () => {
  it('a picture is uploaded, served, freed when replaced, and a remote URL is left alone', async () => {
    const s = await household('recipes-image', undefined, { empty: true })
    const first = await png(s, '/api/recipe-image')
    expect(first.key).toMatch(/^rc_/)
    const served = await anon(`/api/img/${first.key}`)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await served.arrayBuffer())[0]).toBe(137)

    const { id } = await add(s, { image: first.key })
    expect((await one(s, id))!.image).toBe(first.key)

    const next = await png(s, '/api/recipe-image')
    await okJson(save(s, { id, title: 'T', image: next.key }))
    expect(await stored(first.key), 'replaced: the old blob is freed').toBe(false)
    expect(await stored(next.key)).toBe(true)

    await okJson(save(s, { id, title: 'T', image: 'https://exemple.test/photo.jpg' }))
    expect((await one(s, id))!.image).toBe('https://exemple.test/photo.jpg')
    expect(await stored(next.key)).toBe(false)
    await okJson(save(s, { id, title: 'T', image: 'pas une clé !' }))
    expect((await one(s, id))!.image, 'junk never reaches the column').toBeNull()

    expect((await s.fetch('/api/recipe-image', { method: 'POST', raw: 'texte', headers: { 'content-type': 'text/plain' } })).status).toBe(400)
  })

  it('step photos stay in lockstep with the steps, and the recipe frees all of its blobs', async () => {
    const s = await household('recipes-steps', undefined, { empty: true })
    const photo = await png(s, '/api/recipe-step-image')
    const dish = await png(s, '/api/recipe-image')
    const stale = await png(s, '/api/recipe-step-image')
    expect(photo.key).toMatch(/^rsi_/)

    const { id } = await add(s, { image: dish.key, steps: ['Un', 'Deux', 'Trois'], stepImages: ['', photo.key, stale.key, 'de-trop'] })
    expect((await one(s, id))!.stepImages, 'cut to the step count').toEqual(['', photo.key, stale.key])

    await okJson(save(s, { id, title: 'T', steps: ['Un', 'Deux'] }))
    expect((await one(s, id))!.stepImages, 'a removed step takes its photo').toEqual(['', photo.key])
    expect(await stored(stale.key)).toBe(false)
    expect(await stored(photo.key)).toBe(true)

    await okJson(s.fetch('/api/recipes', { method: 'DELETE', body: { id } }))
    expect(await stored(photo.key)).toBe(false)
    expect(await stored(dish.key)).toBe(false)
  })

  it('a form cancelled before saving frees its orphan photo, never one a recipe adopted', async () => {
    const s = await household('recipes-orphan', undefined, { empty: true })
    const adopted = await png(s, '/api/recipe-step-image')
    const orphan = await png(s, '/api/recipe-step-image')
    await add(s, { steps: ['Un'], stepImages: [adopted.key] })

    const r = await okJson<{ freed: number }>(s.fetch('/api/recipe-step-image', { method: 'DELETE', body: { keys: [adopted.key, orphan.key, 'rc_pas-le-bon-prefixe'] } }))
    expect(r.freed).toBe(1)
    expect(await stored(orphan.key)).toBe(false)
    expect(await stored(adopted.key)).toBe(true)
  })
})
