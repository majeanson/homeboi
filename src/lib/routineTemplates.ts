// Pre-made starter routines + chores a parent can pick and adapt, so building a
// toddler routine is "pick Matin, tweak two cards" instead of typing from a
// blank field. A routine card is just an emoji + a word (read aloud on tap);
// chores are an emoji + a name. Localised FR/EN, resolved at call time.
import type { Lang } from '../i18n'

export interface DeckCard {
  icon: string // an emoji — the picture a pre-reader reads
  label: string // the word, narrated on tap
}

interface RawTemplate {
  id: string
  name: Record<Lang, string>
  cards: { icon: string; label: Record<Lang, string> }[]
}

const c = (icon: string, fr: string, en: string) => ({ icon, label: { fr, en } })

const ROUTINES: RawTemplate[] = [
  {
    id: 'matin',
    name: { fr: 'Le matin', en: 'Morning' },
    cards: [
      c('🌅', 'réveil', 'wake up'),
      c('🚽', 'toilette', 'potty'),
      c('🪥', 'brosse les dents', 'brush teeth'),
      c('👕', 'habille-toi', 'get dressed'),
      c('🥞', 'déjeuner', 'breakfast'),
    ],
  },
  {
    id: 'dodo',
    name: { fr: 'Le dodo', en: 'Bedtime' },
    cards: [
      c('🛁', 'bain', 'bath'),
      c('🪥', 'brosse les dents', 'brush teeth'),
      c('👚', 'pyjama', 'pyjamas'),
      c('📖', 'histoire', 'story'),
      c('🌙', 'dodo', 'sleep'),
    ],
  },
  {
    id: 'bain',
    name: { fr: 'Le bain', en: 'Bath time' },
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
  cards: DeckCard[]
}

export function routineTemplates(lang: Lang): RoutineTemplate[] {
  return ROUTINES.map((t) => ({
    id: t.id,
    name: t.name[lang],
    cards: t.cards.map((card) => ({ icon: card.icon, label: card.label[lang] })),
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

// A friendly, toddler-relevant emoji palette for the card switcher.
export const DECK_EMOJIS = [
  '🌅', '☀️', '🌙', '⭐', '🚽', '🪥', '🛁', '🚿', '🧼', '🧴',
  '👕', '👚', '🧦', '👟', '🧥', '🥞', '🍎', '🍽️', '🥛', '🍌',
  '📖', '📚', '🧸', '🎨', '⚽', '🧺', '🗑️', '🛏️', '🌱', '🐟',
  '🧹', '🧽', '💧', '❤️', '😴', '🙂',
]
