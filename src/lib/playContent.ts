// « Jouer » — pure content + builders for the toddler play space. Framework-free so
// the activities and the tests share ONE source of truth. CALM by design: nothing
// here scores, persists, or fails — these are toys, not games (NFR-CALM). Content
// pictos are emoji (the board's convention for content, vs Phosphor for controls).
import type { Lang } from '../i18n'
import { DEFAULT_SLOT_HOURS, isMealSlot, type MealSlot } from './mealSlots'

// ---- Cherche et trouve (find-it) -------------------------------------------

// One findable thing on the board: a name to seek + how it looks (an emoji picto, a
// real photo for a face, or a colour swatch for « Les couleurs »).
export interface SeekItem {
  id: string
  label: string // the resolved name ("Chien", "Rouge", "Mamie")
  emoji?: string
  photo?: string | null
  color?: string | null
  lang?: Lang // read this item in its own language (a person's name stays neutral)
}
export interface SeekDeck {
  id: string
  label: string // the deck's name ("Les animaux")
  emoji: string
  items: SeekItem[]
}

interface RawItem {
  id: string
  fr: string
  en: string
  emoji?: string
  color?: string
}

// The fixed, universal decks (everyday animals, colours, foods, weather) — things a
// toddler delights in naming, independent of household data.
const ANIMALS: RawItem[] = [
  { id: 'dog', fr: 'Chien', en: 'Dog', emoji: '🐶' },
  { id: 'cat', fr: 'Chat', en: 'Cat', emoji: '🐱' },
  { id: 'cow', fr: 'Vache', en: 'Cow', emoji: '🐮' },
  { id: 'sheep', fr: 'Mouton', en: 'Sheep', emoji: '🐑' },
  { id: 'horse', fr: 'Cheval', en: 'Horse', emoji: '🐴' },
  { id: 'pig', fr: 'Cochon', en: 'Pig', emoji: '🐷' },
  { id: 'hen', fr: 'Poule', en: 'Hen', emoji: '🐔' },
  { id: 'duck', fr: 'Canard', en: 'Duck', emoji: '🦆' },
  { id: 'rabbit', fr: 'Lapin', en: 'Rabbit', emoji: '🐰' },
  { id: 'mouse', fr: 'Souris', en: 'Mouse', emoji: '🐭' },
  { id: 'frog', fr: 'Grenouille', en: 'Frog', emoji: '🐸' },
  { id: 'fish', fr: 'Poisson', en: 'Fish', emoji: '🐟' },
  { id: 'bird', fr: 'Oiseau', en: 'Bird', emoji: '🐦' },
  { id: 'bee', fr: 'Abeille', en: 'Bee', emoji: '🐝' },
  { id: 'bear', fr: 'Ours', en: 'Bear', emoji: '🐻' },
  { id: 'lion', fr: 'Lion', en: 'Lion', emoji: '🦁' },
  { id: 'elephant', fr: 'Éléphant', en: 'Elephant', emoji: '🐘' },
  { id: 'monkey', fr: 'Singe', en: 'Monkey', emoji: '🐵' },
]
const COLORS: RawItem[] = [
  { id: 'red', fr: 'Rouge', en: 'Red', color: '#e23b3b' },
  { id: 'blue', fr: 'Bleu', en: 'Blue', color: '#3b6fe2' },
  { id: 'yellow', fr: 'Jaune', en: 'Yellow', color: '#f1c40f' },
  { id: 'green', fr: 'Vert', en: 'Green', color: '#3bb24a' },
  { id: 'orange', fr: 'Orange', en: 'Orange', color: '#e8821e' },
  { id: 'purple', fr: 'Mauve', en: 'Purple', color: '#8e44ad' },
  { id: 'pink', fr: 'Rose', en: 'Pink', color: '#e878b0' },
  { id: 'brown', fr: 'Brun', en: 'Brown', color: '#8a5a2b' },
  { id: 'black', fr: 'Noir', en: 'Black', color: '#2a2a2a' },
  { id: 'white', fr: 'Blanc', en: 'White', color: '#f4f4f4' },
]
const FOODS: RawItem[] = [
  { id: 'apple', fr: 'Pomme', en: 'Apple', emoji: '🍎' },
  { id: 'banana', fr: 'Banane', en: 'Banana', emoji: '🍌' },
  { id: 'strawberry', fr: 'Fraise', en: 'Strawberry', emoji: '🍓' },
  { id: 'grapes', fr: 'Raisin', en: 'Grapes', emoji: '🍇' },
  { id: 'orange', fr: 'Orange', en: 'Orange', emoji: '🍊' },
  { id: 'carrot', fr: 'Carotte', en: 'Carrot', emoji: '🥕' },
  { id: 'broccoli', fr: 'Brocoli', en: 'Broccoli', emoji: '🥦' },
  { id: 'tomato', fr: 'Tomate', en: 'Tomato', emoji: '🍅' },
  { id: 'corn', fr: 'Maïs', en: 'Corn', emoji: '🌽' },
  { id: 'bread', fr: 'Pain', en: 'Bread', emoji: '🍞' },
  { id: 'cheese', fr: 'Fromage', en: 'Cheese', emoji: '🧀' },
  { id: 'egg', fr: 'Œuf', en: 'Egg', emoji: '🥚' },
  { id: 'milk', fr: 'Lait', en: 'Milk', emoji: '🥛' },
  { id: 'potato', fr: 'Patate', en: 'Potato', emoji: '🥔' },
]
const WEATHER: RawItem[] = [
  { id: 'sun', fr: 'Soleil', en: 'Sun', emoji: '☀️' },
  { id: 'cloud', fr: 'Nuage', en: 'Cloud', emoji: '☁️' },
  { id: 'rain', fr: 'Pluie', en: 'Rain', emoji: '🌧️' },
  { id: 'snow', fr: 'Neige', en: 'Snow', emoji: '❄️' },
  { id: 'storm', fr: 'Orage', en: 'Storm', emoji: '⛈️' },
  { id: 'wind', fr: 'Vent', en: 'Wind', emoji: '🌬️' },
  { id: 'rainbow', fr: 'Arc-en-ciel', en: 'Rainbow', emoji: '🌈' },
]

const resolve = (raw: RawItem[], lang: Lang): SeekItem[] =>
  raw.map((r) => ({ id: r.id, label: lang === 'fr' ? r.fr : r.en, emoji: r.emoji, color: r.color }))

// A person to seek — built by the caller from the unified cercle people (faces stay
// in the neutral UI voice, so no per-item lang).
export interface SeekPerson {
  key: string
  firstName: string
  photo?: string | null
  color?: string | null
}

// The deck names, passed in so this stays i18n-free + unit-testable.
export interface DeckNames {
  faces: string
  animals: string
  colors: string
  foods: string
  weather: string
  mix: string
}

// A deck only makes a playable board when it has at least this many things.
export const MIN_DECK = 3
// How many items to mix into the « Mélange » deck (a cheerful variety, capped).
const MIX_CAP = 18

// Assemble every playable deck: « Les visages » from the household faces (when there
// are enough), the four fixed decks, and a « Mélange » that blends them. Decks below
// MIN_DECK are dropped (a board needs choices). Pure + deterministic.
export function buildSeekDecks(people: SeekPerson[], lang: Lang, names: DeckNames): SeekDeck[] {
  const decks: SeekDeck[] = []
  const faces: SeekItem[] = people.map((p) => ({ id: p.key, label: p.firstName, photo: p.photo ?? null, color: p.color ?? null }))
  if (faces.length >= MIN_DECK) decks.push({ id: 'faces', label: names.faces, emoji: '🙂', items: faces })
  decks.push({ id: 'animals', label: names.animals, emoji: '🐶', items: resolve(ANIMALS, lang) })
  decks.push({ id: 'colors', label: names.colors, emoji: '🎨', items: resolve(COLORS, lang) })
  decks.push({ id: 'foods', label: names.foods, emoji: '🍎', items: resolve(FOODS, lang) })
  decks.push({ id: 'weather', label: names.weather, emoji: '☀️', items: resolve(WEATHER, lang) })

  // « Mélange » — a few from each other deck (faces first so home things lead).
  const mix: SeekItem[] = []
  const ordered = [decks.find((d) => d.id === 'faces'), ...decks.filter((d) => d.id !== 'faces')].filter(Boolean) as SeekDeck[]
  let i = 0
  while (mix.length < MIX_CAP) {
    let added = false
    for (const d of ordered) {
      if (d.items[i]) {
        mix.push(d.items[i])
        added = true
        if (mix.length >= MIX_CAP) break
      }
    }
    if (!added) break
    i++
  }
  decks.push({ id: 'mix', label: names.mix, emoji: '✨', items: mix })

  return decks.filter((d) => d.items.length >= MIN_DECK)
}

// One round of « Cherche et trouve »: a small board of items + the one to find. The
// target is fresh (never the same as `prevId` when the deck allows), and the board
// always contains the target. Pure given `rand` (injected for tests). NEVER throws —
// a too-small deck just yields the whole deck.
export function pickSeekRound(
  deck: SeekDeck,
  size: number,
  prevId: string | null,
  rand: () => number = Math.random,
): { board: SeekItem[]; target: SeekItem } {
  const items = deck.items
  const n = Math.min(size, items.length)
  // Shuffle a copy (Fisher–Yates) so the board is a random subset, order varied.
  const pool = items.slice()
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1))
    ;[pool[k], pool[j]] = [pool[j], pool[k]]
  }
  const board = pool.slice(0, n)
  // Prefer a target that isn't last round's (so the prompt actually changes).
  const fresh = board.filter((it) => it.id !== prevId)
  const choices = fresh.length ? fresh : board
  const target = choices[Math.floor(rand() * choices.length)]
  return { board, target }
}

// ---- Notre journée (the our-day timeline) ----------------------------------

// One part of the day, with what's planned in it. The component turns these into the
// big tiles + the spoken summary. Empty parts still show (the SEQUENCE is the lesson).
export type DayPartKey = 'matin' | 'midi' | 'soir' | 'dodo'
export interface DayPartData {
  key: DayPartKey
  mealTitles: string[]
  eventTitles: string[]
}

// Which part of the day an hour belongs to — ONE rule, shared by meals and events, so
// a meal never lands in a different tile than an event happening at the same hour.
const partAtHour = (h: number): DayPartKey => (h < 11 ? 'matin' : h < 16 ? 'midi' : h < 21 ? 'soir' : 'dodo')

// Bucket today's meals and events into the four parts of a day, in order. Both bucket
// by local hour: an event by its start, a meal by its SLOT's start hour (Réglages ▸
// Repas) — so a household that eats its souper at 20 h hears it in the evening tile,
// not the afternoon one. all-day events (incl. derived birthdays) lead the morning.
// `hours` defaults to the built-in slot start times. Pure.
export function bucketDay(
  meals: { slot: string; title: string }[],
  events: { title: string; start_at: number; all_day: number }[],
  hours: Record<MealSlot, number> = DEFAULT_SLOT_HOURS,
): DayPartData[] {
  const part: Record<DayPartKey, DayPartData> = {
    matin: { key: 'matin', mealTitles: [], eventTitles: [] },
    midi: { key: 'midi', mealTitles: [], eventTitles: [] },
    soir: { key: 'soir', mealTitles: [], eventTitles: [] },
    dodo: { key: 'dodo', mealTitles: [], eventTitles: [] },
  }
  for (const m of meals) {
    // An unknown slot has no hour — park it at midi, as the old rule did.
    const k: DayPartKey = isMealSlot(m.slot) ? partAtHour(Math.floor(hours[m.slot] / 60)) : 'midi'
    part[k].mealTitles.push(m.title)
  }
  for (const e of events) {
    const k: DayPartKey = e.all_day ? 'matin' : partAtHour(new Date(e.start_at * 1000).getHours())
    part[k].eventTitles.push(e.title)
  }
  return [part.matin, part.midi, part.soir, part.dodo]
}
