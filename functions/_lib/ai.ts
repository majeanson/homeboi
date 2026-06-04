// The one essential AI feature: classify a free-text capture into a structured
// intent, then the handler routes it. Workers AI, in-network (Loi 25), free
// Neuron tier. One inference per capture — never on a render loop.
//
// Graceful degrade: with env.AI unset (or local dev without `wrangler login`),
// classifyCapture returns { type: 'note', degraded: true } so the capture is
// never lost and the UI can offer a manual type-picker.

import type { Env } from './env'

export type IntentType = 'event' | 'task' | 'list-item' | 'pantry-low' | 'meal' | 'note'

export interface Intent {
  type: IntentType
  // Loose payload — each route validates the fields it needs. Kept permissive
  // because an 8B model's JSON is good but not a contract.
  payload: {
    title?: string
    item?: string
    text?: string
    when?: string // natural-language date/time echo, e.g. "mardi 15h"
    slot?: string // meal slot
    person?: string // member name hint
  }
  degraded?: boolean
}

const MODEL = '@cf/meta/llama-3.1-8b-instruct'

// Few-shot, FR-CA + EN, JSON-only. The register hints ("souper", "vidanges",
// "pus de") are deliberately Québécois so the router reads local phrasing the
// way the household actually talks.
const SYSTEM = `Tu classes une note de famille en JSON. Réponds UNIQUEMENT avec du JSON valide, rien d'autre.
Types possibles: "event" (rendez-vous, activité avec une date/heure), "task" (tâche/corvée à faire), "list-item" (article à acheter ou à ajouter à la liste), "pantry-low" (un aliment qui manque ou achève), "meal" (un souper/repas planifié), "note" (le reste).
Format: {"type": <type>, "payload": {"title"?: string, "item"?: string, "text"?: string, "when"?: string, "slot"?: string, "person"?: string}}.
Exemples:
"dentiste mardi 15h" -> {"type":"event","payload":{"title":"dentiste","when":"mardi 15h"}}
"Léa sort les vidanges" -> {"type":"task","payload":{"title":"sortir les vidanges","person":"Léa"}}
"ajoute du lait" -> {"type":"list-item","payload":{"item":"lait"}}
"pus de café" -> {"type":"pantry-low","payload":{"item":"café"}}
"souper spaghetti jeudi" -> {"type":"meal","payload":{"title":"spaghetti","slot":"supper","when":"jeudi"}}
"penser à appeler maman" -> {"type":"note","payload":{"text":"appeler maman"}}`

const VALID: ReadonlySet<IntentType> = new Set([
  'event',
  'task',
  'list-item',
  'pantry-low',
  'meal',
  'note',
])

function extractJson(raw: string): unknown {
  // Models sometimes wrap JSON in prose or a ```json fence. Grab the first
  // balanced-looking object rather than trusting the whole string.
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function classifyCapture(env: Env, text: string): Promise<Intent> {
  const trimmed = text.trim()
  if (!env.AI) {
    // No binding — keep the words, let the UI ask what kind it was.
    return { type: 'note', payload: { text: trimmed }, degraded: true }
  }
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: trimmed },
      ],
      max_tokens: 200,
    })) as { response?: string }

    const parsed = extractJson(res.response ?? '') as {
      type?: string
      payload?: Intent['payload']
    } | null

    if (!parsed || !parsed.type || !VALID.has(parsed.type as IntentType)) {
      // Router uncertain -> note. We never drop a capture (PRD: note-fallback).
      return { type: 'note', payload: { text: trimmed } }
    }
    return { type: parsed.type as IntentType, payload: parsed.payload ?? { text: trimmed } }
  } catch {
    // Workers AI hiccup is non-essential to capturing the words; degrade.
    return { type: 'note', payload: { text: trimmed }, degraded: true }
  }
}

// Weekly suggestion: pick a supper from what's low / recently planned. One call,
// on demand. Returns null on any failure so the UI just hides the suggestion.
export async function suggestMeal(env: Env, lowItems: string[], recent: string[]): Promise<string | null> {
  if (!env.AI) return null
  const prompt = `Suggère UN souper familial simple en une courte phrase (français québécois).
Aliments qui achèvent: ${lowItems.join(', ') || 'aucun'}.
Soupers récents (à éviter de répéter): ${recent.join(', ') || 'aucun'}.
Réponds seulement par le nom du plat, rien d'autre.`
  try {
    const res = (await env.AI.run(MODEL, {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 40,
    })) as { response?: string }
    const out = (res.response ?? '').trim().split('\n')[0].replace(/^["']|["'.]+$/g, '')
    return out || null
  } catch {
    return null
  }
}
