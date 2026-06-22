// Pre-made starter routines + chores a parent can pick and adapt, so building a
// toddler routine is "pick Matin, tweak two cards" instead of typing from a
// blank field. A routine card is just an emoji + a word (read aloud on tap);
// chores are an emoji + a name. Localised FR/EN, resolved at call time.
import type { Lang } from '../i18n'

export interface DeckCard {
  icon: string // an emoji — the picture a pre-reader reads
  label: string // the word, narrated on tap
  // Optional per-step countdown in seconds — the player offers a tap-to-start
  // timer on this step (e.g. 120 = a 2-minute teeth brush). Absent/0 = no timer.
  seconds?: number
}

interface RawTemplate {
  id: string
  name: Record<Lang, string>
  // The implied time-of-day cue ('morning'|'afternoon'|'evening'; undefined =
  // anytime) — picking the template pre-fills the form's moment picker.
  tod?: 'morning' | 'afternoon' | 'evening'
  cards: { icon: string; label: Record<Lang, string>; seconds?: number }[]
}

// `seconds` (optional, last arg) seeds the step's tap-to-start timer — e.g. the
// dentist's two minutes for brushing teeth — so the example works out of the box.
const c = (icon: string, fr: string, en: string, seconds?: number) => ({ icon, label: { fr, en }, seconds })

const ROUTINES: RawTemplate[] = [
  {
    id: 'matin',
    name: { fr: 'Le matin', en: 'Morning' },
    tod: 'morning',
    cards: [
      c('🌅', 'réveil', 'wake up'),
      c('🚽', 'toilette', 'potty'),
      c('🪥', 'brosse les dents', 'brush teeth', 120),
      c('👕', 'habille-toi', 'get dressed'),
      c('🥞', 'déjeuner', 'breakfast'),
    ],
  },
  {
    id: 'dodo',
    name: { fr: 'Le dodo', en: 'Bedtime' },
    tod: 'evening',
    cards: [
      c('🛁', 'bain', 'bath'),
      c('🪥', 'brosse les dents', 'brush teeth', 120),
      c('👚', 'pyjama', 'pyjamas'),
      c('📖', 'histoire', 'story'),
      c('🌙', 'dodo', 'sleep'),
    ],
  },
  {
    id: 'bain',
    name: { fr: 'Le bain', en: 'Bath time' },
    tod: 'evening',
    cards: [
      c('🧼', 'savon', 'soap'),
      c('🚿', 'rince', 'rinse'),
      c('🧴', 'sèche-toi', 'dry off'),
      c('👚', 'pyjama', 'pyjamas'),
    ],
  },
  {
    id: 'rangement',
    name: { fr: 'On range', en: 'Tidy up' },
    cards: [
      c('🧸', 'range les jouets', 'tidy toys'),
      c('📚', 'range les livres', 'books away'),
      c('🧺', 'le linge', 'laundry'),
    ],
  },
]

export interface RoutineTemplate {
  id: string
  name: string
  tod: 'morning' | 'afternoon' | 'evening' | null
  cards: DeckCard[]
}

export function routineTemplates(lang: Lang): RoutineTemplate[] {
  return ROUTINES.map((t) => ({
    id: t.id,
    name: t.name[lang],
    tod: t.tod ?? null,
    cards: t.cards.map((card) => ({ icon: card.icon, label: card.label[lang], seconds: card.seconds })),
  }))
}

// Common chores — an emoji + a name. Selecting one fills the chore form; the
// parent adapts the name and picks who's in the rotation.
const CHORES: { icon: string; label: Record<Lang, string> }[] = [
  c('🗑️', 'sortir les vidanges', 'take out the trash'),
  c('🍽️', 'vider le lave-vaisselle', 'empty the dishwasher'),
  c('🧺', 'plier le linge', 'fold the laundry'),
  c('🧸', 'ranger les jouets', 'tidy the toys'),
  c('🛏️', 'faire les lits', 'make the beds'),
  c('🌱', 'arroser les plantes', 'water the plants'),
  c('🧹', 'balayer', 'sweep'),
  c('🐟', 'nourrir le poisson', 'feed the fish'),
]

export function choreTemplates(lang: Lang): DeckCard[] {
  return CHORES.map((ch) => ({ icon: ch.icon, label: ch.label[lang] }))
}

// Starter presets for "Projets & Entretien" (home_projects), one set per kind —
// the same emoji+label preset-chip idiom as choreTemplates, so the form is "pick
// a common one, tweak" instead of a blank field. 'plan' = aspirational home
// projects (a new kitchen); 'upkeep' = recurring maintenance (furnace filter).
const HOME_PROJECTS: Record<'plan' | 'upkeep', { icon: string; label: Record<Lang, string> }[]> = {
  plan: [
    { icon: '🏠', label: { fr: 'Nouvelle cuisine', en: 'New kitchen' } },
    { icon: '🛋️', label: { fr: 'Sous-sol', en: 'Basement' } },
    { icon: '🪵', label: { fr: 'Terrasse', en: 'Deck' } },
    { icon: '🎨', label: { fr: 'Peinture', en: 'Repaint' } },
    { icon: '🌳', label: { fr: 'Aménagement paysager', en: 'Landscaping' } },
  ],
  upkeep: [
    { icon: '🔧', label: { fr: 'Filtre de fournaise', en: 'Furnace filter' } },
    { icon: '🍂', label: { fr: 'Gouttières', en: 'Gutters' } },
    { icon: '🌳', label: { fr: 'Vérifier les arbres', en: 'Check the trees' } },
    { icon: '🧯', label: { fr: 'Détecteurs de fumée', en: 'Smoke detectors' } },
    { icon: '❄️', label: { fr: 'Pneus d’hiver', en: 'Winter tires' } },
    { icon: '🔥', label: { fr: 'Ramonage', en: 'Chimney sweep' } },
  ],
}
export function homeProjectTemplates(kind: 'plan' | 'upkeep', lang: Lang): DeckCard[] {
  return HOME_PROJECTS[kind].map((p) => ({ icon: p.icon, label: p.label[lang] }))
}

// A friendly, toddler-relevant emoji palette for the card switcher.
export const DECK_EMOJIS = [
  '🌅', '☀️', '🌙', '⭐', '🚽', '🪥', '🛁', '🚿', '🧼', '🧴',
  '👕', '👚', '🧦', '👟', '🧥', '🥞', '🍎', '🍽️', '🥛', '🍌',
  '📖', '📚', '🧸', '🎨', '⚽', '🧺', '🗑️', '🛏️', '🌱', '🐟',
  '🧹', '🧽', '💧', '❤️', '😴', '🙂',
]
