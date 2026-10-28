import { describe, it, expect, vi } from 'vitest'
import { answerQuestion, classifyCapture, decodeStrayEscapes, suggestMeals, resolveLang, extractSizes, salvageTruncatedJson, segmentRunOn, selectionLines, selectRecipeLines, toSelection, transcribeImage, VISION_MODEL_ID, VISION_PRIMARY_ID, VISION_SECOND_ID } from './ai'
import type { Env } from './env'

// A fake Workers AI binding that returns a canned `response`, so we can test the
// parsing/normalization without a real model. `response` is typed `unknown` on
// purpose: newer models (llama-3.3-70b-fp8-fast) hand back an already-PARSED
// object/array when the output is valid JSON, while older ones returned a string.
const mockAiEnv = (response: unknown): Env =>
  ({ DB: {} as D1Database, AI: { run: async () => ({ response }) } as unknown as Ai }) as Env

// With no AI binding the router must NEVER throw and NEVER lose the words —
// it degrades to a note so the UI can offer a manual type-picker. This is the
// graceful-degrade contract the brief promises.
const noAiEnv = { DB: {} as D1Database } as Env

const req = (lang?: string) =>
  new Request('https://x/api/capture', { headers: lang ? { 'X-Lang': lang } : {} })

describe('resolveLang', () => {
  it('prefers a valid X-Lang header over DEFAULT_LANG', () => {
    expect(resolveLang({ DEFAULT_LANG: 'fr' } as Env, req('en'))).toBe('en')
  })
  it('falls back to DEFAULT_LANG when the header is absent', () => {
    expect(resolveLang({ DEFAULT_LANG: 'en' } as Env, req())).toBe('en')
  })
  it('ignores a malformed header and falls back', () => {
    expect(resolveLang({ DEFAULT_LANG: 'en' } as Env, req('es'))).toBe('en')
  })
  it('defaults to fr when nothing is set', () => {
    expect(resolveLang({} as Env, req())).toBe('fr')
  })
})

describe('classifyCapture (degraded)', () => {
  it('returns a note carrying the raw text when AI is unset', async () => {
    const r = await classifyCapture(noAiEnv, '  souper spaghetti jeudi  ')
    expect(r.type).toBe('note')
    expect(r.degraded).toBe(true)
    expect(r.payload.text).toBe('souper spaghetti jeudi')
  })
})

describe('suggestMeals (degraded)', () => {
  it('returns [] when AI is unset so the UI hides the button', async () => {
    const r = await suggestMeals(noAiEnv, ['café'], ['pâtes'])
    expect(r).toEqual([])
  })
})

// REGRESSION: the model swap to llama-3.3-70b-fp8-fast made `response` arrive as
// an already-parsed JS value instead of a string. Before the fix this dropped to
// [] and the endpoint 503'd. Both shapes must now produce the same dishes.
describe('suggestMeals (response shape)', () => {
  it('parses a string-wrapped JSON array (old model shape)', async () => {
    const env = mockAiEnv('Voici: ["spaghetti","chili","tacos"]')
    const r = await suggestMeals(env, [], [])
    expect(r).toEqual(['spaghetti', 'chili', 'tacos'])
  })
  it('accepts an already-parsed array (new fp8-fast model shape)', async () => {
    const env = mockAiEnv(['spaghetti', 'chili', 'tacos'])
    const r = await suggestMeals(env, [], [])
    expect(r).toEqual(['spaghetti', 'chili', 'tacos'])
  })
})

describe('extractSizes', () => {
  it('returns all-null when AI is unset (graceful degrade)', async () => {
    const r = await extractSizes(noAiEnv, ['Lait Lactantia', 'Pain'])
    expect(r).toEqual([null, null])
  })

  it('returns [] for no names without calling AI', async () => {
    const r = await extractSizes({ DB: {} as D1Database, AI: {} as Ai } as Env, [])
    expect(r).toEqual([])
  })

  it('maps model sizes back by index and keeps nulls', async () => {
    const env = mockAiEnv('[{"i":0,"size":"2 L"},{"i":1,"size":null},{"i":2,"size":"500 g"}]')
    const r = await extractSizes(env, ['lait', 'pain', 'poulet'])
    expect(r).toEqual(['2 L', null, '500 g'])
  })

  it('tolerates prose around the JSON and out-of-range indices', async () => {
    const env = mockAiEnv('Sure! [{"i":0,"size":"1 kg"},{"i":9,"size":"oops"}] done')
    const r = await extractSizes(env, ['boeuf'])
    expect(r).toEqual(['1 kg'])
  })

  it('returns all-null on unparseable model output', async () => {
    const env = mockAiEnv('no json here')
    const r = await extractSizes(env, ['x', 'y'])
    expect(r).toEqual([null, null])
  })

  it('accepts an already-parsed array (new fp8-fast model shape)', async () => {
    const env = mockAiEnv([
      { i: 0, size: '2 L' },
      { i: 1, size: null },
      { i: 2, size: '500 g' },
    ])
    const r = await extractSizes(env, ['lait', 'pain', 'poulet'])
    expect(r).toEqual(['2 L', null, '500 g'])
  })
})

// classifyCapture's JSON parse must also accept the new parsed-object shape, or
// every capture silently falls back to a generic note.
describe('classifyCapture (response shape)', () => {
  it('routes from a string-wrapped JSON object (old model shape)', async () => {
    const env = mockAiEnv('{"type":"list-item","payload":{"item":"lait"}}')
    const r = await classifyCapture(env, 'ajoute du lait')
    expect(r.type).toBe('list-item')
    expect(r.payload.item).toBe('lait')
  })
  it('routes from an already-parsed object (new fp8-fast model shape)', async () => {
    const env = mockAiEnv({ type: 'pantry-low', payload: { item: 'café' } })
    const r = await classifyCapture(env, 'pus de café')
    expect(r.type).toBe('pantry-low')
    expect(r.payload.item).toBe('café')
  })
  // The 7th intent: leftovers from an already-cooked dish (distinct from pantry-low
  // "out of" and meal "to cook"). Must survive the VALID gate and carry its title.
  it('routes a leftover intent and keeps the dish title', async () => {
    const env = mockAiEnv({ type: 'leftover', payload: { title: 'lasagne' } })
    const r = await classifyCapture(env, 'il reste de la lasagne')
    expect(r.type).toBe('leftover')
    expect(r.payload.title).toBe('lasagne')
  })
})
// E-22 — the model DOUBLE-escapes non-ASCII inside its own JSON string, so a
// correct JSON.parse hands back the literal characters `é` — which then reach
// the screen verbatim and the read-aloud voice spells out. Decode what survived.
describe('decodeStrayEscapes', () => {
  it('resolves a unicode escape that survived JSON.parse', () => {
    expect(decodeStrayEscapes(String.raw`La liste d'épicerie`)).toBe("La liste d'épicerie")
  })
  it('resolves the short escapes and leaves the rest of the text intact', () => {
    expect(decodeStrayEscapes(String.raw`a\nb\tc`)).toBe('a\nb\tc')
    expect(decodeStrayEscapes(String.raw`dit \"allo\"`)).toBe('dit "allo"')
  })
  it('joins a surrogate pair back into one code point', () => {
    expect(decodeStrayEscapes(String.raw`🙂`)).toBe('🙂')
  })
  it('treats an escaped backslash as a backslash, not the start of a code point', () => {
    expect(decodeStrayEscapes(String.raw`C:\\u00e9`)).toBe(String.raw`C:\u00e9`)
  })
  it('leaves a clean answer untouched', () => {
    expect(decodeStrayEscapes('Le souper de vendredi, c’est du pâté chinois.')).toBe(
      'Le souper de vendredi, c’est du pâté chinois.',
    )
  })
})

describe('answerQuestion', () => {
  it('decodes stray escapes out of the answer the UI renders and speaks', async () => {
    const env = mockAiEnv({ answer: String.raw`La liste d'épicerie contient du café.`, kind: 'list' })
    const r = await answerQuestion(env, 'où est la liste ?', 'DATA')
    expect(r?.answer).toBe("La liste d'épicerie contient du café.")
    expect(r?.kind).toBe('list')
  })
  it('keeps the newlines an enumerated answer uses (so the UI can list them)', async () => {
    const env = mockAiEnv({ answer: 'Il y a 2 articles :\n- Lime\n- Citron', kind: 'list' })
    const r = await answerQuestion(env, 'quoi sur la liste ?', 'DATA')
    expect(r?.answer).toBe('Il y a 2 articles :\n- Lime\n- Citron')
  })
  it('falls back to kind "none" on an unknown kind, and returns null without AI', async () => {
    const env = mockAiEnv({ answer: 'Je ne le vois pas.', kind: 'weather' })
    expect((await answerQuestion(env, 'q', 'DATA'))?.kind).toBe('none')
    expect(await answerQuestion(noAiEnv, 'q', 'DATA')).toBeNull()
  })
})

describe('salvageTruncatedJson — a cut reply keeps what it finished', () => {
  it('keeps every COMPLETE value and closes the rest', () => {
    const CUT = '{"title":"X","ingredients":["a","b"],"steps":["Do A.","Do B.","Do C'
    const fixed = salvageTruncatedJson(CUT)
    expect(fixed).not.toBeNull()
    expect(JSON.parse(fixed!)).toEqual({ title: 'X', ingredients: ['a', 'b'], steps: ['Do A.', 'Do B.'] })
    expect(salvageTruncatedJson('no json here')).toBeNull()
    // Escapes and brackets inside strings never confuse the scan.
    expect(JSON.parse(salvageTruncatedJson('{"a":"x \\"]}\\" y","b":[1,2')!)).toEqual({ a: 'x "]}" y', b: [1] }) // the cut « 2 » might have been « 25 » — dropped
  })
})

// B (2026-10-27): the model picks LINE NUMBERS, never text.
describe('selectRecipeLines — the model chooses lines, it never writes them', () => {
  const LINES = ['Pouding chômeur', 'Ingrédients', '500 ml de cassonade', 'Sauce', '500 ml d’eau', 'Préchauffer le four.', 'Cuire 40 minutes.']
  const REPLY = { title: 0, servings: null, prep: null, cook: null, ingredients: [2, 4], steps: [5, 6], notes: [], ingredientSections: [{ line: 3, before: 4 }], stepSections: [] }

  it('sends the numbered lines with a JSON schema, the hint quoted, room for indices only', async () => {
    const run = vi.fn(async (_m: string, _i: unknown) => ({ response: REPLY }))
    const env = { DB: {} as D1Database, AI: { run } as unknown as Ai } as Env
    const sel = await selectRecipeLines(env, LINES, 'fr', '  la 2e recette\nde la page ')
    const input = run.mock.calls[0][1] as { messages: { content: string }[]; response_format: { type: string; json_schema: { required: string[] } }; max_tokens: number }
    expect(input.response_format.type).toBe('json_schema')
    expect(input.response_format.json_schema.required).toContain('ingredientSections')
    expect(input.max_tokens).toBe(600)
    const prompt = input.messages[0].content
    expect(prompt).toContain('2: 500 ml de cassonade')
    expect(prompt).toContain('NUMÉROS DE LIGNE')
    expect(prompt).toContain('Indication du cuisinier : « la 2e recette de la page »')
    expect(sel).toEqual(REPLY)
  })

  it('« JSON Mode couldn’t be met » → ONE retry without the schema, parsed leniently', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("JSON Mode couldn't be met"))
      .mockResolvedValueOnce({ response: 'Voici : ' + JSON.stringify(REPLY) })
    const env = { DB: {} as D1Database, AI: { run } as unknown as Ai } as Env
    expect(await selectRecipeLines(env, LINES, 'fr')).toEqual(REPLY)
    expect(run).toHaveBeenCalledTimes(2)
    expect((run.mock.calls[1][1] as { response_format?: unknown }).response_format).toBeUndefined()
  })

  it('any other failure is the model not answering — no retry, null', async () => {
    const run = vi.fn().mockRejectedValue(new Error('5016: agree'))
    const env = { DB: {} as D1Database, AI: { run } as unknown as Ai } as Env
    expect(await selectRecipeLines(env, LINES, 'fr')).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('no AI, no lines → null without a call', async () => {
    expect(await selectRecipeLines(noAiEnv, LINES)).toBeNull()
  })

  it('every index validated: out of range, not an integer, used twice — dropped; lists in page order', () => {
    const sel = toSelection(
      { title: 0, ingredients: [4, 2, 2, 99, -1, 1.5, '3'], steps: [6, 5, 0], notes: [4], ingredientSections: [{ line: 3, before: 4 }, { line: 3, before: 2 }], stepSections: [{ line: 42, before: 5 }] },
      7,
    )
    expect(sel.title).toBe(0)
    expect(sel.ingredients).toEqual([2, 4])
    expect(sel.steps).toEqual([5, 6]) // 0 is the title
    expect(sel.notes).toEqual([]) // 4 is an ingredient
    expect(sel.ingredientSections).toEqual([{ line: 3, before: 4 }])
    expect(sel.stepSections).toEqual([])
    expect(sel.servings).toBeNull()
  })
})

// D2 (2026-10-27): the stronger vision model first, the Llama read as the fallback —
// and the report names the one that answered.
describe('transcribeImage — primary vision model, Llama fallback', () => {
  const bytes = new Uint8Array([1, 2, 3])
  it('the primary answers → its text, its name', async () => {
    const run = vi.fn(async (_m: string, _i: unknown) => ({ response: 'Crêpes\n250 ml de farine' }))
    const report = { error: null as string | null, visionModel: null as string | null }
    const t = await transcribeImage({ DB: {}, AI: { run } } as unknown as Env, bytes, 'fr', report)
    expect(t).toBe('Crêpes\n250 ml de farine')
    expect(report.visionModel).toBe(VISION_PRIMARY_ID)
    expect(run.mock.calls[0][0]).toBe(VISION_PRIMARY_ID)
    // The VERIFIED image shape (Workers AI REST, 2026-10-27): OpenAI content parts with
    // `image_url: { url: data:… }` — a top-level `image` made the model answer « Je ne
    // peux pas voir d'images » and, on prod, transcribe a story for a biscuit card.
    const input = run.mock.calls[0][1] as unknown as { messages: { content: { type: string; image_url?: { url: string } }[] }[]; image?: unknown; reasoning_effort?: string }
    expect(input.image).toBeUndefined()
    expect(input.messages[0].content.map((c) => c.type)).toEqual(['text', 'image_url'])
    expect(input.messages[0].content[1].image_url?.url).toMatch(/^data:image\/jpeg;base64,/)
    // Mistral Small first (fast on a full page); no reasoning flag for it.
    expect(input.reasoning_effort).toBeUndefined()
  })
  it('the primary fails → the second reader (Gemma 4, reasoning off) answers, named', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn().mockResolvedValueOnce({ choices: [{ message: { content: '' } }] }).mockResolvedValueOnce({ choices: [{ message: { content: 'Crêpes' } }] })
    const report = { error: null as string | null, visionModel: null as string | null }
    expect(await transcribeImage({ DB: {}, AI: { run } } as unknown as Env, bytes, 'fr', report)).toBe('Crêpes')
    expect(report.visionModel).toBe(VISION_SECOND_ID)
    expect(run.mock.calls[1][0]).toBe(VISION_SECOND_ID)
    // Gemma 4 thinks by default and then returns NOTHING within the budget — off.
    expect((run.mock.calls[1][1] as { reasoning_effort?: string }).reasoning_effort).toBe('none')
  })
  it('the primary answers in the OpenAI shape (choices[0].message.content) → read as text', async () => {
    const run = vi.fn(async () => ({ choices: [{ message: { content: 'Biscuits\n2 œufs' } }] }))
    const report = { error: null as string | null, visionModel: null as string | null }
    expect(await transcribeImage({ DB: {}, AI: { run } } as unknown as Env, bytes, 'fr', report)).toBe('Biscuits\n2 œufs')
    expect(report.visionModel).toBe(VISION_PRIMARY_ID)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('a primary that says it sees no image is NOT a transcript → the Llama read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi
      .fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: "Je ne peux pas voir d'images, mais je peux vous aider à transcrire du texte." } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: 'I cannot see any image in this conversation.' } }] })
      .mockResolvedValueOnce({ response: 'Crêpes' })
    const report = { error: null as string | null, visionModel: null as string | null }
    expect(await transcribeImage({ DB: {}, AI: { run } } as unknown as Env, bytes, 'fr', report)).toBe('Crêpes')
    expect(report.visionModel).toBe(VISION_MODEL_ID)
  })
  it('both stronger readers throw (or answer nothing) → the Llama read, named', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const first of [() => Promise.reject(new Error('5006: bad input')), () => Promise.resolve({ response: '' })]) {
      const run = vi.fn().mockImplementationOnce(first).mockImplementationOnce(first).mockResolvedValueOnce({ response: 'Crêpes' })
      const report = { error: null as string | null, visionModel: null as string | null }
      expect(await transcribeImage({ DB: {}, AI: { run } } as unknown as Env, bytes, 'fr', report)).toBe('Crêpes')
      expect(report.visionModel).toBe(VISION_MODEL_ID)
      expect(run.mock.calls[2][0]).toBe(VISION_MODEL_ID)
    }
  })
})

// Step 6 of the prod checks (2026-10-27): a recipe pasted WITHOUT line breaks gave the
// selection model one line to pick from → « Rien trouvé ». Run-on lines are segmented
// first, deterministically — the model still only picks, never writes.
describe('selectionLines — a run-on paste is cut into pickable lines', () => {
  const paste =
    "Pouding chômeur de maman 500 ml de cassonade 500 ml d'eau 30 ml de beurre 250 ml de farine 5 ml de poudre à pâte 125 ml de lait Faire bouillir la cassonade, l'eau et le beurre 5 minutes. Mélanger la farine, la poudre à pâte et le lait. Verser la pâte dans un plat beurré, couvrir du sirop. Cuire 35 minutes à 180 °C."
  it('cuts before each amount, at sentence ends, and where the method starts after the last ingredient', () => {
    expect(selectionLines(paste)).toEqual([
      'Pouding chômeur de maman',
      '500 ml de cassonade',
      "500 ml d'eau",
      '30 ml de beurre',
      '250 ml de farine',
      '5 ml de poudre à pâte',
      '125 ml de lait',
      "Faire bouillir la cassonade, l'eau et le beurre 5 minutes.",
      'Mélanger la farine, la poudre à pâte et le lait.',
      'Verser la pâte dans un plat beurré, couvrir du sirop.',
      'Cuire 35 minutes à 180 °C.',
    ])
  })
  it('leaves formatted lines alone, keeps a brand with two capitals whole, never cuts « 5 minutes »', () => {
    expect(selectionLines('Ingrédients\n250 ml de farine\nPréparation\nCuire.')).toEqual(['Ingrédients', '250 ml de farine', 'Préparation', 'Cuire.'])
    expect(segmentRunOn('250 ml de farine Robin Hood 2 oeufs Battre les oeufs 5 minutes avec la farine, puis laisser reposer 30 minutes avant de verser.')).toEqual([
      '250 ml de farine Robin Hood',
      '2 oeufs',
      'Battre les oeufs 5 minutes avec la farine, puis laisser reposer 30 minutes avant de verser.',
    ])
  })
})
