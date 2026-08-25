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
import { ADD_HELP } from './addHelp'
import { GUIDE, guideWhat, type Bi } from './guideContent'

// guideWhat (the one-line `what` of a Guide card, reused verbatim as a coachmark
// body so a step and its full reference share ONE source for that sentence) now
// lives in lib/guideContent — P2-9/C-15 promoted it so lib/addHelp and
// lib/cercleHelp's `helpFromGuide` share the exact same lookup + failure class.

// A named point's `detail` from a Guide card, reused verbatim as a tour-step body
// — so a step and its full reference share ONE prose (no drift). Located by a
// FR-label substring (not a brittle index), and it throws at module load if the
// point is missing, so a guide rename can't silently ship a blank step.
function guidePoint(id: string, frLabel: string): Bi {
  const card = GUIDE.find((e) => e.id === id)
  if (!card) throw new Error(`tourContent: no Guide card "${id}"`)
  const point = card.points.find((p) => p.label.fr.includes(frLabel))
  if (!point) throw new Error(`tourContent: no "${frLabel}" point in Guide card "${id}"`)
  return point.detail
}

// The "what the ＋ adds here" enumeration from a section's Guide card ("Le bouton
// ＋ ici" point) — the tour's in-sheet tiles step reuses it verbatim, so the tour
// lists every add-action a section offers and stays in lockstep with the Guide.
const guidePlusActions = (id: string): Bi => guidePoint(id, '＋')

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
  // This step happens INSIDE the ＋ quick-add sheet: while it's active, HubLayout
  // holds the current section's chooser open (and lets it go on the next non-sheet
  // step / tour end). Pair with an in-sheet target (`add-note`, `add-tiles`,
  // `add-week`, `add-routines` — anchors in components/AddSheet.tsx).
  sheet?: boolean
}

export type Tour = {
  id: string
  // Navigate here before step 0 so the step anchors exist (e.g. the board).
  startRoute?: string
  steps: TourStep[]
}

// The two quick-add steps every section tour closes on: spotlight the ＋ FAB,
// then step INSIDE the sheet (sheet: true) and enumerate its tiles — the body is
// the section Guide card's « ＋ » point, verbatim (one source, no drift). The
// enumeration sits on the in-sheet step (where the tiles are on screen), not on
// the FAB, so the words and the things they name are visible together.
function addSheetSteps(id: string, extra: TourStep[] = []): TourStep[] {
  return [
    {
      target: 'add-fab',
      icon: 'plus-bold',
      title: { fr: 'Le bouton ＋', en: 'The ＋ button' },
      body: {
        fr: 'Tout s’ajoute par ce bouton — il offre ce qui a du sens pour la section où tu es. « Suivant » l’ouvre pour te montrer.',
        en: 'Everything is added through this button — it offers what makes sense for the section you’re in. “Next” opens it to show you.',
      },
    },
    ...extra,
    {
      target: 'add-tiles',
      sheet: true,
      icon: 'plus-bold',
      card: id,
      title: { fr: 'Ce que tu peux ajouter ici', en: 'What you can add here' },
      body: guidePlusActions(id),
    },
  ]
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
        title: { fr: 'Les six sections', en: 'The six sections' },
        body: {
          fr: 'Tes six onglets : [[icon:sun-bold]] Le babillard (le coup d’œil), [[icon:carrot-bold]] La cuisine (soupers et recettes), [[icon:sparkle-bold]] La liste (l’épicerie), [[icon:file-text-bold]] Les notes (pour toi ou la Maisonnée), [[icon:house-bold]] Maison (routines, famille, amis, commerces, carnets) et [[icon:gear-six-bold]] Réglages.',
          en: 'Your six tabs: [[icon:sun-bold]] the Board (the glance), [[icon:carrot-bold]] the Kitchen (suppers and recipes), [[icon:sparkle-bold]] the List (groceries), [[icon:file-text-bold]] Notes (for you or the Household), [[icon:house-bold]] Home (routines, family, friends, businesses, carnets) and [[icon:gear-six-bold]] Settings.',
        },
      },
      {
        target: 'board-faces',
        icon: 'users-three-bold',
        card: 'board',
        title: { fr: 'Qui regarde ?', en: 'Who’s looking?' },
        body: {
          fr: 'Touche un visage pour voir l’écran de cette personne — Maisonnée, c’est tout le monde. Ce que tu ajoutes est signé du visage choisi.',
          en: 'Tap a face to see that person’s screen — Household is everyone. What you add is signed by the picked face.',
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
        icon: 'sparkle-bold',
        title: { fr: 'Un « ? » quand tu bloques', en: 'A “?” when you’re stuck' },
        body: {
          fr: 'En haut de chaque section, la pastille colorée porte un petit « ? ». Touche-le, puis touche ce qui t’intrigue : l’app t’explique juste là, à sa place. Il s’efface une fois que tu connais l’app.',
          en: 'At the top of every section, the coloured disc carries a small “?”. Tap it, then tap whatever puzzles you: the app explains it right there, in place. It fades once you know the app.',
        },
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

  // #32 — a per-section tour, launched from that section's intro card ("Faire le
  // tour") or replayed from the section's Guide card. Shape: a centred "what this
  // is" (the Guide one-liner), spotlights on the section's main controls, a couple
  // of features worth knowing (bodies single-sourced from the Guide card's points
  // via guidePoint), then the ＋ — first the FAB, then INSIDE the open sheet
  // (addSheetSteps). The tour id MATCHES the section's Guide-card id, so
  // SectionIntro starts it by its `card`.
  {
    id: 'board',
    startRoute: '/board',
    steps: [
      { icon: 'sun-bold', card: 'board', title: { fr: 'Le babillard', en: 'The board' }, body: guideWhat('board') },
      {
        target: 'board-views',
        icon: 'calendar-dots-bold',
        card: 'board',
        title: { fr: 'Change la vue', en: 'Change the view' },
        body: guidePoint('board', 'Changer la vue'),
      },
      {
        target: 'board-cards',
        icon: 'stack-bold',
        card: 'board-widgets',
        title: { fr: 'Place tes cartes toi-même', en: 'Place your cards yourself' },
        body: guidePoint('board', 'Personnaliser le babillard'),
      },
      {
        target: 'search',
        icon: 'magnifying-glass-bold',
        card: 'board',
        title: { fr: 'Tout chercher', en: 'Search everything' },
        body: guidePoint('board', 'Tout chercher'),
      },
      {
        // « Le défi du jour » sits on the Habitudes card; its step reuses the guide
        // point's own words. Anchor is DefiBlock's data-tour="defi" (TourOverlay
        // centres the step if the card is compact / the anchor is absent).
        target: 'defi',
        icon: 'sparkle-bold',
        card: 'habits',
        title: { fr: 'Le défi du jour', en: 'Today’s challenge' },
        body: guidePoint('habits', 'Le défi du jour'),
      },
      ...addSheetSteps('board', [
        {
          target: 'add-note',
          sheet: true,
          icon: 'pencil-simple-bold',
          card: 'capture',
          title: { fr: 'La note rapide', en: 'The quick note' },
          // The ADD_HELP bubble for this very field, verbatim — the "?" and the
          // tour explain the control with the same words.
          body: ADD_HELP.note.body,
        },
      ]),
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
        icon: 'calendar-blank-bold',
        card: 'kitchen',
        title: { fr: 'Planifier la semaine', en: 'Plan the week' },
        body: guidePoint('kitchen', 'Planifier la semaine'),
      },
      {
        icon: 'shopping-bag-bold',
        card: 'kitchen',
        title: { fr: 'Ce qui s’achève', en: 'Running low' },
        body: guidePoint('kitchen', 'Ce qui s’achève'),
      },
      ...addSheetSteps('kitchen', [
        {
          target: 'add-week',
          sheet: true,
          icon: 'lightning-bold',
          card: 'kitchen',
          title: { fr: 'Les actions de la semaine', en: 'The week’s actions' },
          body: {
            fr: '« Magasiner » compare le plan de la semaine au garde-manger et ajoute ce qui manque à la liste. « Idées » ouvre le tiroir d’idées de repas — ⭐ favoris, 🧊 à écouler, 🤖 l’IA.',
            en: '“Shop” compares the week’s plan to the pantry and adds what’s missing to the list. “Ideas” opens the meal-ideas drawer — ⭐ favorites, 🧊 use-it-up, 🤖 AI.',
          },
        },
      ]),
    ],
  },
  // Maison's own tour (the merged tab, its Guide card names `tour: 'maison'`):
  // intro, the five-sub-tab pill row, the default Routines section, then the
  // merged ＋ chooser.
  {
    id: 'maison',
    startRoute: '/maison',
    steps: [
      { icon: 'house-bold', card: 'maison', title: { fr: 'Maison', en: 'Home' }, body: guideWhat('maison') },
      {
        target: 'maison-sections',
        icon: 'stack-bold',
        card: 'maison',
        title: { fr: 'Cinq sous-onglets', en: 'Five sub-tabs' },
        body: guidePoint('maison', 'Cinq sous-onglets'),
      },
      {
        target: 'routines-grid',
        icon: 'smiley-bold',
        title: { fr: 'Les routines des enfants', en: 'The kids’ routines' },
        body: {
          fr: 'Chaque routine en cartes-images, lue à voix haute. Touche-en une pour la voir ou la modifier.',
          en: 'Each routine in picture cards, read aloud. Tap one to see or edit it.',
        },
      },
      ...addSheetSteps('maison'),
    ],
  },
  {
    id: 'routines',
    // Routines lives under Maison now (the nav restructure merged the old
    // Routines + Le cercle hub tabs); this tour still opens FROM the routines
    // Guide card's "Faire le tour", so it lands on the tab where the anchors are.
    startRoute: '/maison',
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
        icon: 'microphone-bold',
        card: 'routines',
        title: { fr: 'Ta voix, tes photos', en: 'Your voice, your photos' },
        body: guidePoint('routines', 'Ta voix, tes photos'),
      },
      {
        icon: 'timer-bold',
        card: 'routines',
        title: { fr: 'Une minuterie sur une étape', en: 'A timer on a step' },
        body: guidePoint('routines', 'Une minuterie sur une étape'),
      },
      // Maison's ＋ now offers a whole chooser (routines + the cercle add-set),
      // not routines alone — so this closes on the generic add-sheet pair like
      // every other section tour, with bodies pointing out the « Routines »
      // tile specifically (it leads the chooser, the tab's default section).
      {
        target: 'add-fab',
        icon: 'plus-bold',
        title: { fr: 'Le bouton ＋', en: 'The ＋ button' },
        body: {
          fr: 'Le ＋ de Maison ouvre un choix de tuiles — « Routines » est la première. « Suivant » l’ouvre pour te montrer.',
          en: 'Maison’s ＋ opens a choice of tiles — “Routines” leads them. “Next” opens it to show you.',
        },
      },
      {
        target: 'add-tiles',
        sheet: true,
        icon: 'plus-bold',
        card: 'routines',
        title: { fr: 'Créer ou modifier', en: 'Create or edit' },
        body: {
          fr: 'Touche « Routines » : « Nouvelle routine » en bâtit une, ou touche une routine existante pour la modifier. Les étapes et les images se montent là.',
          en: 'Tap “Routines”: “New routine” builds one, or tap an existing routine to edit it. The steps and pictures are put together there.',
        },
      },
    ],
  },
  // The old « Le cercle » hub tab lives under Maison now (?section=family); this
  // tour still opens from the cercle Guide card's "Faire le tour" and keeps that
  // card's id/anchors — only the starting route moved.
  {
    id: 'cercle',
    startRoute: '/maison?section=family',
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
        icon: 'link-bold',
        card: 'cercle',
        title: { fr: 'Des liens entre les gens', en: 'Links between people' },
        body: guidePoint('cercle', 'Des liens entre les gens'),
      },
      {
        target: 'cercle-world',
        icon: 'sparkle-bold',
        card: 'cercle',
        title: { fr: 'Notre monde', en: 'Our world' },
        body: guidePoint('cercle', 'Notre monde'),
      },
      ...addSheetSteps('cercle'),
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
        icon: 'storefront-bold',
        card: 'liste',
        title: { fr: 'Trier par allée', en: 'Sort by aisle' },
        body: guidePoint('liste', 'Trier par allée'),
      },
      {
        icon: 'tag-bold',
        card: 'deals',
        title: { fr: 'Choisir les meilleurs prix', en: 'Pick the best prices' },
        body: guidePoint('liste', 'Choisir les meilleurs prix'),
      },
      ...addSheetSteps('liste'),
    ],
  },
]
