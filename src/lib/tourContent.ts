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

type TourStep = {
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

  // #32 — a SHORT per-section tour, launched from that section's intro card
  // ("Faire le tour"). Each: a centred "what this is" (the Guide one-liner), one
  // spotlight on the section's main control, then the ＋ for "add here". The tour
  // id MATCHES the section's Guide-card id, so SectionIntro starts it by its `card`.
  {
    id: 'board',
    startRoute: '/board',
    steps: [
      { icon: 'sun-bold', card: 'board', title: { fr: 'Le babillard', en: 'The board' }, body: guideWhat('board') },
      {
        target: 'board-views',
        icon: 'calendar-dots-bold',
        title: { fr: 'Change la vue', en: 'Change the view' },
        body: {
          fr: 'Grille (la semaine), « Maintenant » (la prochaine affaire), par personne, ou le mois — le même babillard, vu autrement.',
          en: 'Grid (the week), “Now” (the next thing), by person, or the month — the same board, seen differently.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Ajoute ici', en: 'Add here' },
        body: {
          fr: 'Le ＋ ajoute au babillard : un rendez-vous, une corvée, une routine, un à-compléter — ou « Avant de partir ».',
          en: 'The ＋ adds to the board: an event, a chore, a routine, a to-do — or “Before you go”.',
        },
      },
    ],
  },
  {
    id: 'kitchen',
    startRoute: '/kitchen',
    steps: [
      { icon: 'carrot-bold', card: 'kitchen', title: { fr: 'La cuisine', en: 'The kitchen' }, body: guideWhat('kitchen') },
      {
        target: 'kitchen-tabs',
        icon: 'fork-knife-bold',
        title: { fr: 'Repas, garde-manger, recettes', en: 'Meals, pantry, recipes' },
        body: {
          fr: 'Les sous-onglets : planifie les repas de la semaine, signale ce qui achève, et garde tes recettes.',
          en: 'The sub-tabs: plan the week’s meals, flag what’s running low, and keep your recipes.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Ajoute ici', en: 'Add here' },
        body: {
          fr: 'Le ＋ : cuisiner, planifier un repas, ajouter une recette — ou « Le livre illustré » à feuilleter avec les petits.',
          en: 'The ＋: cook, plan a meal, add a recipe — or “The picture book” to flip through with the little ones.',
        },
      },
    ],
  },
  {
    id: 'routines',
    startRoute: '/routines',
    steps: [
      { icon: 'smiley-bold', card: 'routines', title: { fr: 'Routines', en: 'Routines' }, body: guideWhat('routines') },
      {
        target: 'routines-grid',
        icon: 'smiley-bold',
        title: { fr: 'Les routines des enfants', en: 'The kids’ routines' },
        body: {
          fr: 'Chaque routine en cartes-images, lue à voix haute. Touche-en une pour la voir ou la modifier.',
          en: 'Each routine in picture cards, read aloud. Tap one to see or edit it.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Monte une routine', en: 'Build a routine' },
        body: {
          fr: 'Le ＋ ouvre le gestionnaire : crée une nouvelle routine ou modifie une existante.',
          en: 'The ＋ opens the manager: create a new routine or edit an existing one.',
        },
      },
    ],
  },
  {
    id: 'cercle',
    startRoute: '/cercle',
    steps: [
      { icon: 'users-three-bold', card: 'cercle', title: { fr: 'Le cercle', en: 'The circle' }, body: guideWhat('cercle') },
      {
        target: 'cercle-views',
        icon: 'users-three-bold',
        title: { fr: 'Trois façons de voir', en: 'Three ways to see' },
        body: {
          fr: 'La liste des gens, leurs liens, ou l’arbre des familles — bascule entre les trois ici.',
          en: 'The people list, their links, or the family tree — switch between the three here.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Ajoute du monde', en: 'Add people' },
        body: {
          fr: 'Le ＋ : une personne, une famille entière, relier deux personnes, ou un groupe.',
          en: 'The ＋: a person, a whole family, connect two people, or a group.',
        },
      },
    ],
  },
  {
    id: 'liste',
    startRoute: '/liste',
    steps: [
      { icon: 'sparkle-bold', card: 'liste', title: { fr: 'La liste', en: 'The list' }, body: guideWhat('liste') },
      {
        target: 'liste-add',
        icon: 'pencil-simple-bold',
        title: { fr: 'Ajoute un article', en: 'Add an item' },
        body: {
          fr: 'Écris-le ou dis-le. Coche en magasin; « Vider les cochés » l’enlève de la liste.',
          en: 'Type it or say it. Tick it off in the store; “Clear checked” removes it from the list.',
        },
      },
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Plus d’options', en: 'More options' },
        body: {
          fr: 'Le ＋ : ajout rapide des habitués, les circulaires, ou partager la liste.',
          en: 'The ＋: quick-add your regulars, the flyers, or share the list.',
        },
      },
    ],
  },
]
