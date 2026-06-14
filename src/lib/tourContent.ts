// The guided tours, all data-driven. A tour is an ordered list of steps; each
// step either spotlights a real element (by a `data-tour="<target>"` attribute on
// it) or, with no target, shows a centred card (welcome / closing / a concept
// that has no single on-screen anchor). Copy is bilingual {fr,en}, FR-CA first —
// kept here (not in i18n.ts) for the same reason the Guide is: it's long-form
// prose that grows, and bloating the typed parity dict with paragraphs hurts it.
// Parity is still enforced structurally: every Bi needs both fr and en or tsc
// fails. Bodies may use `[[icon:name]]` tokens (rendered via lib/richText).
//
// To add a tour: push a Tour here and give its target elements a `data-tour`
// attribute. To make a one-off coachmark, a single-step Tour is enough — the
// engine (lib/tour.tsx) and overlay (components/tour/TourOverlay.tsx) are generic.
import type { IconName } from '../components/Icon'
import { GUIDE, type Bi } from './guideContent'

// The one-line `what` of a Guide card, reused verbatim as a coachmark body so a
// step and its full reference share ONE source for that sentence (no parallel
// prose to drift). Throws on a bad id — caught at module load, so a typo can't
// ship a blank step.
function guideWhat(id: string): Bi {
  const card = GUIDE.find((e) => e.id === id)
  if (!card) throw new Error(`tourContent: no Guide card "${id}"`)
  return card.what
}

export type TourStep = {
  // A `data-tour` key to spotlight; omit for a centred card.
  target?: string
  icon?: IconName
  title: Bi
  body: Bi
  // The Guide card this step maps to (a GuideEntry id). When set, the coachmark
  // shows a "En savoir plus →" that opens that card (Réglages ▸ Guide) and ends
  // the tour there — so the tour (orient: show me where) hands off to the guide
  // (deep reference: tell me everything), via the same ?card= path as HelpDot.
  // Pair it with `body: guideWhat(<id>)` to single-source the one-liner too.
  card?: string
}

export type Tour = {
  id: string
  // Navigate here before step 0 so the step anchors exist (e.g. the board).
  startRoute?: string
  steps: TourStep[]
}

export const TOURS: Tour[] = [
  {
    id: 'essentials',
    startRoute: '/board',
    steps: [
      {
        icon: 'sun-bold',
        title: { fr: 'Bienvenue sur Babillard', en: 'Welcome to Babillard' },
        body: {
          fr: 'Babillard, c’est toute la maisonnée d’un coup d’œil : l’agenda, le souper, les listes, les corvées et les routines des enfants. Pas de points, pas de notifications. Voici un petit tour en 30 secondes — tu peux le passer en tout temps.',
          en: 'Babillard is your whole household at a glance: the agenda, supper, lists, chores and the kids’ routines. No points, no notifications. Here’s a 30-second tour — you can skip it anytime.',
        },
      },
      {
        target: 'hubnav',
        icon: 'sparkle-bold',
        card: 'first-time',
        title: { fr: 'Les cinq sections', en: 'The five sections' },
        body: {
          fr: 'Tes cinq onglets : [[icon:sun-bold]] Le babillard (le coup d’œil), [[icon:carrot-bold]] La cuisine (soupers et recettes), [[icon:smiley-bold]] Routines (les enfants), [[icon:sparkle-bold]] La liste (l’épicerie) et [[icon:gear-six-bold]] Réglages.',
          en: 'Your five tabs: [[icon:sun-bold]] the Board (the glance), [[icon:carrot-bold]] the Kitchen (suppers and recipes), [[icon:smiley-bold]] Routines (the kids), [[icon:sparkle-bold]] the List (groceries) and [[icon:gear-six-bold]] Settings.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        card: 'capture',
        title: { fr: 'Ajouter quoi que ce soit', en: 'Add anything' },
        body: {
          fr: 'Le bouton ＋ ajoute ce qui a du sens pour la section où tu es : un rendez-vous, un item de liste, une recette ou un souper.',
          en: 'The ＋ button adds whatever fits the section you’re in: an appointment, a list item, a recipe or a supper.',
        },
      },
      {
        icon: 'pencil-simple-bold',
        card: 'capture',
        title: { fr: 'Écris ou parle', en: 'Type or speak' },
        // Reuses the Capture card's one-liner — one source for this sentence; the
        // deep detail (voice on-device, the offline picker) lives in that card,
        // a tap away via "En savoir plus".
        body: guideWhat('capture'),
      },
      {
        icon: 'gear-six-bold',
        title: { fr: 'C’est tout !', en: 'That’s it!' },
        body: {
          fr: 'Tu es prêt. Pour revoir ce tour plus tard, va dans [[icon:gear-six-bold]] Réglages ▸ Guide ▸ Première fois. Le reste du guide explique chaque concept en détail.',
          en: 'You’re set. To see this tour again later, go to [[icon:gear-six-bold]] Settings ▸ Guide ▸ First time. The rest of the guide explains every concept in detail.',
        },
      },
    ],
  },
]
