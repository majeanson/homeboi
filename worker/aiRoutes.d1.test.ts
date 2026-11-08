import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:workers'
import { household, okJson, type Session } from '../functions/test/d1'
import { useFakes } from '../functions/test/fakes'
import { addLocalDays, dayStart, nowSec } from '../functions/_lib/ids'
import { AI_CALLS_PER_DAY, charge, usageToday } from '../functions/_lib/usage'
import { VISION_MODEL_ID, VISION_PRIMARY_ID, VISION_SECOND_ID } from '../functions/_lib/ai'
import { runWithRequest } from '../functions/_lib/tz'

// THE ROUTES THAT NEED A MODEL, on a real D1 (d1Coverage.test.ts held them at 17 with the
// outbound ones). The model is scripted; everything around it is not. Each test holds
// what a handler can get wrong without Workers AI being involved at all: what it read
// from the real tables into the prompt, what it did with the reply, what it wrote, and
// what it was charged, on `usage_daily`, through the real `runModel`.

const fakes = useFakes()
const { ai } = fakes

const TEXT = /llama-3\.3/
const today = () => dayStart(new Date(Date.now()))
const reply = (response: unknown) => ({ response })
const spent = async (s: Session) => (await usageToday(env, s.householdId)).ai
const aiError = (r: Response) => decodeURIComponent(r.headers.get('X-AI-Error') ?? '')
const rows = async (table: string, s: Session) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE household_id = ?`).bind(s.householdId).first<{ n: number }>())!.n
const off = (s: Session) => okJson(s.fetch('/api/household', { method: 'PATCH', body: { aiEnabled: false } }))
const asFace = (memberId: string) => ({ 'X-Profile': memberId })

// Bytes that are not an image. No handler here decodes them: they travel to the reader.
const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const photo = (s: Session, path = '/api/recipe-vision') =>
  s.fetch(path, { method: 'POST', raw: PHOTO, headers: { 'content-type': 'image/jpeg' } })

describe('la vérification de l’IA', () => {
  it('runs every model the app uses, once, and charges each one', async () => {
    const s = await household('ai-test', undefined, { empty: true })
    ai.on(/./, (c: { model: string }) => (c.model === VISION_PRIMARY_ID ? { choices: [{ message: { content: 'OK' } }] } : reply('OK')))
    const { checks } = await okJson<{ checks: { ok: boolean; model: string; detail: string; ms: number }[] }>(s.fetch('/api/ai-test', { method: 'POST' }))
    expect(checks.map((c) => c.model)).toEqual([expect.stringMatching(TEXT), VISION_PRIMARY_ID, VISION_SECOND_ID, VISION_MODEL_ID])
    expect(checks.every((c) => c.ok && c.detail === 'OK')).toBe(true)
    expect(ai.calls.map((c) => c.model).sort()).toEqual(checks.map((c) => c.model).sort())
    expect(await spent(s), 'four models, four charges').toBe(4)
  })

  it('names the one model that fails instead of failing the check', async () => {
    const s = await household('ai-test-red', undefined, { empty: true })
    ai.on(/./, reply('OK'))
    ai.on(VISION_SECOND_ID, new Error('5016: agree'))
    const { checks } = await okJson<{ checks: { ok: boolean; model: string; detail: string }[] }>(s.fetch('/api/ai-test', { method: 'POST' }))
    expect(checks.filter((c) => !c.ok)).toEqual([expect.objectContaining({ model: VISION_SECOND_ID, detail: expect.stringContaining('5016') })])
  })

  it('never burns an inference for a household that switched AI off', async () => {
    const s = await household('ai-test-off', undefined, { empty: true })
    await off(s)
    expect((await s.fetch('/api/ai-test', { method: 'POST' })).status).toBe(503)
    expect(ai.calls).toEqual([])
    expect(await spent(s)).toBe(0)
  })
})

describe('demander à la maison', () => {
  it('answers from THIS household’s rows, and only from them', async () => {
    const s = await household('ask', undefined, { empty: true })
    const other = await household('ask-other', undefined, { empty: true })
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: today(), title: 'Pâté chinois', slot: 'supper' } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Dentiste de Zoé', startAt: nowSec() + 86_400 } }))
    await okJson(s.fetch('/api/list', { method: 'POST', body: { text: 'Rutabaga' } }))
    await okJson(s.fetch('/api/notes', { method: 'POST', body: { text: 'Appeler mamie' } }))
    await okJson(other.fetch('/api/meals', { method: 'POST', body: { date: today(), title: 'Soupe du voisin', slot: 'supper' } }))
    ai.on(TEXT, reply(JSON.stringify({ answer: 'Du pâté chinois.', kind: 'meal' })))

    const before = await rows('meals', s)
    const res = await okJson(s.fetch('/api/ask', { method: 'POST', body: { question: '  Qu’est-ce qu’on mange?  ' } }))
    expect(res).toEqual({ answer: 'Du pâté chinois.', kind: 'meal', degraded: false })

    const sent = ai.sent()
    for (const row of ['Pâté chinois', 'Dentiste de Zoé', 'Rutabaga', 'Appeler mamie']) expect(sent).toContain(row)
    expect(sent, 'the question goes as it was asked, trimmed').toContain('Qu’est-ce qu’on mange?"')
    expect(sent, 'another household never reaches the prompt').not.toContain('Soupe du voisin')
    expect(await rows('meals', s), 'asking never writes').toBe(before)
    expect(await spent(s)).toBe(1)
  })

  it('reads both shapes a model replies in, and an unknown kind reads as none', async () => {
    const s = await household('ask-shape', undefined, { empty: true })
    ai.on(TEXT, reply({ answer: 'Parsed\\nline', kind: 'surprise' }))
    expect(await okJson(s.fetch('/api/ask', { method: 'POST', body: { question: 'Quoi?' } }))).toEqual({ answer: 'Parsed\nline', kind: 'none', degraded: false })
  })

  it('a model failure answers null with the reason, not a 500', async () => {
    const s = await household('ask-fail', undefined, { empty: true })
    ai.on(TEXT, new Error('3040: capacity'))
    const r = await s.fetch('/api/ask', { method: 'POST', body: { question: 'Quoi?' } })
    expect(r.status).toBe(200)
    expect(aiError(r)).toContain('3040')
    expect(await r.json()).toEqual({ answer: null, kind: 'none', degraded: false })
  })

  it('refuses an empty question before reading anything, and says degraded when AI is off', async () => {
    const s = await household('ask-off', undefined, { empty: true })
    expect((await s.fetch('/api/ask', { method: 'POST', body: { question: '  ' } })).status).toBe(400)
    await off(s)
    expect(await okJson(s.fetch('/api/ask', { method: 'POST', body: { question: 'Quoi?' } }))).toEqual({ answer: null, kind: 'none', degraded: true })
    expect(ai.calls).toEqual([])
  })
})

describe('le budget passe par runModel', () => {
  it('a spent budget stops the call before the model, and the route degrades', async () => {
    const s = await household('budget', undefined, { empty: true })
    await runWithRequest({ householdId: s.householdId }, () => charge(env, 'ai', AI_CALLS_PER_DAY.household))
    ai.on(TEXT, reply('jamais lu'))

    const r = await s.fetch('/api/recap')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ recap: null })
    expect(aiError(r)).toContain('budget')
    expect(ai.calls, 'the point is not to report the overspend, it is not to make it').toEqual([])
    expect(await spent(s), 'a refused call still counts: the bound cannot be raced').toBe(AI_CALLS_PER_DAY.household + 1)
  })

  it('one household’s spend is charged to it, not to its neighbour', async () => {
    const s = await household('budget-a', undefined, { empty: true })
    const other = await household('budget-b', undefined, { empty: true })
    ai.on(TEXT, reply('Une belle semaine.'))
    await okJson(s.fetch('/api/recap'))
    await okJson(s.fetch('/api/recap'))
    expect(await spent(s)).toBe(2)
    expect(await spent(other)).toBe(0)
  })
})

describe('le bilan de la semaine', () => {
  it('reflects on the week that HAPPENED: what is still ahead stays out', async () => {
    const s = await household('recap', undefined, { empty: true })
    const other = await household('recap-other', undefined, { empty: true })
    const day = (n: number) => addLocalDays(today(), n)
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: day(-2), title: 'Lasagne mangée', slot: 'supper' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: today(), title: 'Souper de ce soir', slot: 'supper' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: day(3), title: 'Tacos planifiés', slot: 'supper' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: day(-10), title: 'Vieux chili', slot: 'supper' } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Fête passée', startAt: day(-1) + 3600 } }))
    await okJson(s.fetch('/api/events', { method: 'POST', body: { title: 'Rendez-vous à venir', startAt: day(2) + 3600 } }))
    const { id } = await okJson<{ id: string }>(s.fetch('/api/chores', { method: 'POST', body: { title: 'Vaisselle faite' } }))
    await env.DB.prepare('UPDATE home_projects SET last_done_at = ? WHERE id = ?').bind(day(-1), id).run()
    await okJson(other.fetch('/api/meals', { method: 'POST', body: { date: today(), title: 'Souper du voisin', slot: 'supper' } }))
    ai.on(TEXT, reply('  Une semaine douce, entre lasagne et vaisselle.  '))

    expect(await okJson(s.fetch('/api/recap'))).toEqual({ recap: 'Une semaine douce, entre lasagne et vaisselle.' })

    const sent = ai.sent()
    for (const happened of ['Lasagne mangée', 'Souper de ce soir', 'Fête passée', 'Vaisselle faite']) expect(sent).toContain(happened)
    for (const notThisWeek of ['Tacos planifiés', 'Rendez-vous à venir', 'Vieux chili', 'Souper du voisin']) expect(sent).not.toContain(notThisWeek)
    expect(await spent(s)).toBe(1)
  })

  it('a reply with no text is no recap', async () => {
    const s = await household('recap-empty', undefined, { empty: true })
    ai.on(TEXT, reply({ not: 'text' }))
    expect(await okJson(s.fetch('/api/recap'))).toEqual({ recap: null })
  })
})

describe('le brouillon de recette', () => {
  it('fills a card from a title and saves nothing', async () => {
    const s = await household('draft', undefined, { empty: true })
    ai.on(TEXT, reply(JSON.stringify({ ingredients: ['400 g de pâtes', ' 400 g de PÂTES ', '', 'Sel'], steps: ['Faire bouillir.', 'Servir.'] })))
    const res = await okJson(s.fetch('/api/recipe-draft', { method: 'POST', body: { title: '  Spaghetti  ' } }))
    expect(res, 'blanks and repeats are gone').toEqual({ ingredients: ['400 g de pâtes', 'Sel'], steps: ['Faire bouillir.', 'Servir.'] })
    expect(ai.sent()).toContain('Spaghetti')
    expect(await rows('recipes', s), 'the recipes POST does the saving').toBe(0)
    expect(await spent(s)).toBe(1)
  })

  it('a failed model opens an empty editor with the reason, and a blank title is refused', async () => {
    const s = await household('draft-fail', undefined, { empty: true })
    expect((await s.fetch('/api/recipe-draft', { method: 'POST', body: { title: ' ' } })).status).toBe(400)
    ai.on(TEXT, new Error('capacity'))
    const r = await s.fetch('/api/recipe-draft', { method: 'POST', body: { title: 'Chili' } })
    expect(aiError(r)).toContain('capacity')
    expect(await r.json()).toEqual({ ingredients: [], steps: [] })
  })

  it('503s for a household that switched AI off', async () => {
    const s = await household('draft-off', undefined, { empty: true })
    await off(s)
    expect((await s.fetch('/api/recipe-draft', { method: 'POST', body: { title: 'Chili' } })).status).toBe(503)
    expect(ai.calls).toEqual([])
  })
})

describe('le vide-frigo', () => {
  const stock = async (s: Session) => {
    await okJson(s.fetch('/api/use-soon', { method: 'POST', body: { item: 'Courgettes molles' } }))
    await okJson(s.fetch('/api/reserve', { method: 'POST', body: { item: 'Bouillon congelé', location: 'freezer' } }))
  }

  it('step 1: names built on what is about to spoil, avoiding the last batch', async () => {
    const s = await household('fridge', undefined, { empty: true })
    const other = await household('fridge-other', undefined, { empty: true })
    await stock(s)
    await okJson(other.fetch('/api/use-soon', { method: 'POST', body: { item: 'Navet du voisin' } }))
    ai.on(TEXT, reply('Voici : ["Frittata", "Soupe", "frittata"]'))
    const res = await okJson(s.fetch('/api/empty-fridge', { method: 'POST', body: { avoid: ['Gratin déjà vu', 3] } }))
    expect(res).toEqual({ ideas: ['Frittata', 'Soupe'] })
    const sent = ai.sent()
    for (const word of ['Courgettes molles', 'Bouillon congelé', 'Gratin déjà vu']) expect(sent).toContain(word)
    expect(sent).not.toContain('Navet du voisin')
    expect(await spent(s)).toBe(1)
  })

  it('step 2: at most three picks become recipes, each leaning on what is on hand', async () => {
    const s = await household('fridge-recipes', undefined, { empty: true })
    await stock(s)
    ai.on(TEXT, reply(JSON.stringify({ ingredients: ['Courgettes'], steps: ['Cuire.'] })))
    const { recipes } = await okJson<{ recipes: { title: string; ingredients: string[]; steps: string[] }[] }>(
      s.fetch('/api/empty-fridge', { method: 'POST', body: { step: 'recipes', titles: [' Un ', 'Deux', 'Trois', 'Quatre', 7] } }),
    )
    expect(recipes).toEqual(['Un', 'Deux', 'Trois'].map((title) => ({ title, ingredients: ['Courgettes'], steps: ['Cuire.'] })))
    expect(ai.calls).toHaveLength(3)
    expect(ai.sent()).toContain('Courgettes molles')
    expect(await spent(s)).toBe(3)
    expect(await rows('recipes', s)).toBe(0)
    expect((await s.fetch('/api/empty-fridge', { method: 'POST', body: { step: 'recipes', titles: [] } })).status).toBe(400)
  })

  it('nothing to use up, or no idea: a calm 503, and the model is not asked for nothing', async () => {
    const s = await household('fridge-none', undefined, { empty: true })
    expect((await s.fetch('/api/empty-fridge', { method: 'POST' })).status).toBe(503)
    expect(ai.calls).toEqual([])
    await stock(s)
    ai.on(TEXT, new Error('capacity'))
    const r = await s.fetch('/api/empty-fridge', { method: 'POST' })
    expect(r.status).toBe(503)
    expect(aiError(r)).toContain('capacity')
  })
})

describe('qu’est-ce qu’on mange', () => {
  it('folds the pantry, the recent suppers, the loved and the forgotten recipes into one call', async () => {
    const s = await household('suggest')
    const other = await household('suggest-other', undefined, { empty: true })
    const { members } = await okJson<{ members: { id: string }[] }>(s.fetch('/api/members'))
    const loved = await okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Tourtière aimée' } }))
    await okJson(s.fetch('/api/recipe-loves', { method: 'POST', body: { recipeId: loved.id }, headers: asFace(members[0]!.id) }))
    await okJson(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Ragoût oublié' } }))
    await okJson(s.fetch('/api/pantry', { method: 'POST', body: { item: 'Beurre qui achève' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: today(), title: 'Soupe d’hier', slot: 'supper' } }))
    await okJson(other.fetch('/api/pantry', { method: 'POST', body: { item: 'Beurre du voisin' } }))
    ai.on(TEXT, reply(['Chili', 'Tacos', ' ', 'chili']))

    const before = await rows('meals', s)
    expect(await okJson(s.fetch('/api/suggest-meal', { method: 'POST', body: { avoid: ['Gratin vu'] } }))).toEqual({ suggestions: ['Chili', 'Tacos'] })
    expect(ai.calls).toHaveLength(1)
    const sent = ai.sent()
    for (const word of ['Beurre qui achève', 'Soupe d’hier', 'Tourtière aimée', 'Ragoût oublié', 'Gratin vu']) expect(sent).toContain(word)
    expect(sent).not.toContain('Beurre du voisin')
    expect(await rows('meals', s), 'an idea is not a plan').toBe(before)
    expect(await spent(s)).toBe(1)
  })

  it('a served recipe is no longer forgotten, and tomorrow’s supper is not a recent one', async () => {
    const s = await household('suggest-neglect', undefined, { empty: true })
    const recipe = await okJson<{ id: string }>(s.fetch('/api/recipes', { method: 'POST', body: { title: 'Bien servie' } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: addLocalDays(today(), -1), title: 'Bien servie', slot: 'supper', recipeId: recipe.id } }))
    await okJson(s.fetch('/api/meals', { method: 'POST', body: { date: addLocalDays(today(), 2), title: 'Planifié plus tard', slot: 'supper' } }))
    ai.on(TEXT, reply(['Chili']))
    await okJson(s.fetch('/api/suggest-meal', { method: 'POST' }))
    const prompt = ai.sent()
    expect(prompt).not.toContain('Planifié plus tard')
    expect(prompt.match(/oubliées depuis un bon moment[^\n]*?: ([^\\]*)/)?.[1], 'neglected').toContain('aucune')
  })

  it('no suggestion is a 503 carrying the reason', async () => {
    const s = await household('suggest-fail', undefined, { empty: true })
    ai.on(TEXT, new Error('capacity'))
    const r = await s.fetch('/api/suggest-meal', { method: 'POST' })
    expect(r.status).toBe(503)
    expect(aiError(r)).toContain('capacity')
  })
})

describe('la lecture d’une photo de recette', () => {
  const CARD = 'Tarte au sucre\n\nIngrédients\n- 1 tasse de sucre\n- 1 tasse de crème\n\nPréparation\n1. Mélanger le tout.\n2. Cuire 30 minutes.'

  it('the first reader answers: its transcript takes the paste road, with no second model call', async () => {
    const s = await household('vision', undefined, { empty: true })
    ai.on(VISION_PRIMARY_ID, { choices: [{ message: { content: CARD } }] })
    const d = await okJson<Record<string, unknown>>(photo(s))
    expect(d).toMatchObject({
      title: 'Tarte au sucre',
      ingredients: ['1 tasse de sucre', '1 tasse de crème'],
      steps: ['Mélanger le tout.', 'Cuire 30 minutes.'],
      structuring: 'headings',
      reader: 'vision',
      readerModel: VISION_PRIMARY_ID,
      readerAttempts: [],
      lang: 'fr',
    })
    expect(d.transcript).toContain('Tarte au sucre')
    expect(ai.calls).toHaveLength(1)
    expect(ai.sent(), 'the bytes reach the reader').toContain(btoa(String.fromCharCode(...PHOTO)))
    expect(ai.sent(), 'it is asked to transcribe, not to organise').toMatch(/Transcri/)
    expect(await rows('recipes', s), 'nothing is stored here').toBe(0)
    expect(await spent(s)).toBe(1)
  })

  it('a blind or failing reader hands over, and the cook is told which', async () => {
    const s = await household('vision-chain', undefined, { empty: true })
    ai.on(VISION_PRIMARY_ID, { choices: [{ message: { content: 'No image was provided here.' } }] })
    ai.on(VISION_SECOND_ID, new Error('3040: capacity'))
    ai.on(VISION_MODEL_ID, reply(CARD))
    const d = await okJson<Record<string, unknown>>(photo(s))
    expect(d).toMatchObject({
      title: 'Tarte au sucre',
      readerModel: VISION_MODEL_ID,
      readerAttempts: [
        { model: VISION_PRIMARY_ID, reason: 'blind' },
        { model: VISION_SECOND_ID, reason: 'error' },
      ],
    })
    expect(await spent(s), 'three readers tried, three charges').toBe(3)
  })

  it('?only=transcript reads one page of several, and structures nothing', async () => {
    const s = await household('vision-page', undefined, { empty: true })
    ai.on(VISION_PRIMARY_ID, { choices: [{ message: { content: CARD } }] })
    const d = await okJson<Record<string, unknown>>(photo(s, '/api/recipe-vision?only=transcript'))
    // Blank lines go with the commentary filter; the page stitcher keeps the rest.
    expect(d).toEqual({ reader: 'vision', readerModel: VISION_PRIMARY_ID, readerAttempts: [], transcript: CARD.replace(/\n\n/g, '\n') })
    expect(ai.calls, 'structuring waits for the last page').toHaveLength(1)
  })

  it('free-form text goes to the selection model: the words stay the page’s', async () => {
    const s = await household('vision-free', undefined, { empty: true })
    const lines = ['Galettes de mamie', '2 tasses de farine', '1 tasse de sucre', 'mêler le tout ensemble', 'cuire au four bien chaud']
    ai.on(VISION_PRIMARY_ID, { choices: [{ message: { content: lines.join('\n') } }] })
    ai.on(TEXT, reply(JSON.stringify({ title: 0, ingredients: [1, 2], steps: [3, 4], notes: [] })))
    const d = await okJson<Record<string, unknown>>(photo(s))
    expect(d).toMatchObject({
      title: 'Galettes de mamie',
      ingredients: ['2 tasses de farine', '1 tasse de sucre'],
      steps: ['mêler le tout ensemble', 'cuire au four bien chaud'],
      structuring: 'ai',
    })
    expect(await spent(s)).toBe(2)
  })

  it('every reader empty: an empty draft with the reason, and bad uploads never reach a model', async () => {
    const s = await household('vision-empty', undefined, { empty: true })
    expect((await s.fetch('/api/recipe-vision', { method: 'POST', raw: 'x', headers: { 'content-type': 'text/plain' } })).status).toBe(400)
    expect((await s.fetch('/api/recipe-vision', { method: 'POST', raw: new Uint8Array(), headers: { 'content-type': 'image/jpeg' } })).status).toBe(400)
    expect(ai.calls).toEqual([])
    ai.on(/./, reply(''))
    const r = await photo(s)
    expect(aiError(r)).toContain('vision read nothing legible')
    expect(await r.json()).toMatchObject({ empty: true, title: null, ingredients: [], steps: [], reader: 'vision' })
  })
})

describe('la lecture infonuagique (Mistral)', () => {
  const MISTRAL = 'api.mistral.ai/v1/ocr'
  const { net } = fakes

  it('forwards the photo with the key and answers the joined pages', async () => {
    const s = await household('ocr', undefined, { empty: true })
    fakes.bind('MISTRAL_API_KEY', 'mistral-test-key')
    net.json(MISTRAL, { pages: [{ markdown: '# Tarte' }, { markdown: 42 }, { markdown: 'Page deux' }] })
    expect(await okJson(photo(s, '/api/recipe-ocr'))).toEqual({ text: '# Tarte\n\nPage deux', model: 'mistral-ocr-latest' })
    const [call] = net.to(MISTRAL)
    expect(call!.headers.get('authorization')).toBe('Bearer mistral-test-key')
    expect(JSON.parse(call!.body!)).toEqual({
      model: 'mistral-ocr-latest',
      document: { type: 'image_url', image_url: `data:image/jpeg;base64,${btoa(String.fromCharCode(...PHOTO))}` },
    })
    expect(await rows('recipes', s)).toBe(0)
  })

  it('a refused read says why instead of an empty 200', async () => {
    const s = await household('ocr-red', undefined, { empty: true })
    fakes.bind('MISTRAL_API_KEY', 'mistral-test-key')
    net.on(MISTRAL, () => new Response('quota   exceeded', { status: 429 }))
    const r = await photo(s, '/api/recipe-ocr')
    expect(r.status).toBe(200)
    expect(aiError(r)).toContain('HTTP 429 quota exceeded')
    expect(await r.json()).toEqual({ text: '', model: 'mistral-ocr-latest' })
  })

  it('leaves the device only when both the key and the household say so', async () => {
    const s = await household('ocr-gate', undefined, { empty: true })
    expect((await photo(s, '/api/recipe-ocr')).status, 'no key').toBe(503)
    fakes.bind('MISTRAL_API_KEY', 'mistral-test-key')
    expect((await s.fetch('/api/recipe-ocr', { method: 'POST', raw: 'x', headers: { 'content-type': 'text/plain' } })).status).toBe(400)
    await off(s)
    expect((await photo(s, '/api/recipe-ocr')).status, 'switched off').toBe(503)
    expect(net.to(MISTRAL)).toEqual([])
  })
})

describe('la transcription', () => {
  const WHISPER = 'whisper-large-v3-turbo'
  const clip = (s: Session) => s.fetch('/api/transcribe', { method: 'POST', raw: new Uint8Array([1, 2, 3, 4]), headers: { 'content-type': 'audio/webm;codecs=opus' } })

  it('splits one clip into items on the pauses, and drops what Whisper imagined', async () => {
    const s = await household('whisper', undefined, { empty: true })
    ai.on(WHISPER, {
      text: 'pommes tomates beurre d’arachide merci',
      segments: [
        {
          text: 'pommes tomates beurre d’arachide',
          words: [
            { word: 'pommes', start: 0, end: 0.4 },
            { word: 'tomates', start: 1.4, end: 1.8 },
            { word: 'beurre', start: 2.8, end: 3.1 },
            { word: 'd’arachide', start: 3.2, end: 3.7 },
          ],
        },
        // Silence filled in: the confidence gate drops it whole.
        { text: 'merci', no_speech_prob: 0.9, words: [{ word: 'merci', start: 4, end: 4.2 }] },
      ],
    })
    expect(await okJson(clip(s))).toEqual({ text: 'pommes tomates beurre d’arachide', items: ['pommes', 'tomates', 'beurre d’arachide'] })
    const [call] = ai.calls
    expect(call!.input).toMatchObject({ audio: btoa('\x01\x02\x03\x04'), task: 'transcribe', language: 'fr', vad_filter: true, condition_on_previous_text: false })
    expect((call!.input as { initial_prompt: string }).initial_prompt, 'a bare word list, nothing to echo').not.toContain(':')
    expect(await spent(s)).toBe(1)
  })

  it('speaks the household’s language to the model, and falls back to the text with no timings', async () => {
    const s = await household('whisper-en', undefined, { empty: true })
    ai.on(WHISPER, { text: ' milk and eggs ' })
    const r = await s.fetch('/api/transcribe', { method: 'POST', raw: new Uint8Array([1]), headers: { 'content-type': 'audio/mp4', 'X-Lang': 'en' } })
    expect(await r.json()).toEqual({ text: 'milk and eggs', items: [] })
    expect(ai.calls[0]!.input).toMatchObject({ language: 'en' })
  })

  it('a failed model keeps the 200 and the journal entry; a bad upload never reaches it', async () => {
    const s = await household('whisper-fail', undefined, { empty: true })
    expect((await s.fetch('/api/transcribe', { method: 'POST', raw: 'x', headers: { 'content-type': 'application/json' } })).status).toBe(400)
    expect((await s.fetch('/api/transcribe', { method: 'POST', raw: new Uint8Array(), headers: { 'content-type': 'audio/webm' } })).status).toBe(400)
    expect(ai.calls).toEqual([])
    ai.on(WHISPER, new Error('whisper down'))
    const r = await clip(s)
    expect(r.status).toBe(200)
    expect(aiError(r)).toBe('whisper down')
    expect(await r.json()).toEqual({ text: '', items: [] })
  })

  it('503s when the household switched AI off, so the client keeps the type-picker', async () => {
    const s = await household('whisper-off', undefined, { empty: true })
    await off(s)
    expect((await clip(s)).status).toBe(503)
    expect(ai.calls).toEqual([])
  })
})
