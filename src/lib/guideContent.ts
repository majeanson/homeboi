// The in-app documentation, all in one place (Réglages ▸ Guide). Plain-language,
// concise, FR-CA first — written for a parent setting up the wall tablet, not a
// developer. Kept OUT of i18n.ts on purpose: this is long-form prose that grows
// concept by concept (we /loop over it), and bloating the typed parity dict with
// paragraphs would make it unreadable. Parity is enforced structurally here
// instead: every Bi has both `fr` and `en`, or tsc fails.
//
// To document a new concept: add a GuideEntry to GUIDE. Keep `what` to one line
// (the vulgarized "what is this"), and each point to a short label + one-sentence
// detail (the "how it works / what you can do"). No screenshots, no jargon left
// unexplained — if a term is house-specific (kiosk, capture, ghost), say what it
// means in the detail.
//
// CROSS-REFERENCE related features so the manual reads as a graph, not islands:
// in any prose string, write [[card:<id>|label]] (e.g. [[card:cashier|mode
// caissier]]) to turn a feature mention into a tappable link that opens that
// card. `id` must be a GuideEntry id below; `label` is the visible text (write it
// in each language). Icons use [[icon:name]]. Both are rendered by lib/richText
// (shared with the guided tour) and stripped for search. Prefer links in a
// point's `detail`/`why`; avoid them in `what` (it renders inside the card's
// clickable summary). New themed bucket → CONCEPT_THEMES / FEATURE_MAP_TILES.

import type { IconName } from '../components/Icon'

export type Bi = { fr: string; en: string }

// ── Section colours ─────────────────────────────────────────────────────────
// The six hub tabs each own ONE colour — the nav discs (HubLayout `TABS`), the
// CATS families and every tab's HubHead already agree on it. The Guide mirrors
// that SAME mapping so its feature-map tiles and themed concept blocks wear the
// colour of the section they belong to (« Cuisine & épicerie » is La cuisine's
// terracotta, « Se déplacer » is Le cercle's turquoise, …) rather than a flat
// marigold. Both values are theme-aware CSS vars so they follow day↔night; `ink`
// tints a glyph / accent, `wash` a pale fill. Keep in sync with HubLayout `TABS`.
// `ink` resolves to the `--*-ink` TEXT tier (bmad/08 A-10): SECTION_TINT.ink also
// lands on real text (the active Réglages tab label, guide accents), so it must
// clear 4.5:1 on its wash in every theme — the brighter `--*-deep` tier stays for
// glyph-only literals (3:1 bar).
export type SectionKey = 'board' | 'kitchen' | 'routines' | 'cercle' | 'liste' | 'settings'
export type Tint = { ink: string; wash: string }
export const SECTION_TINT: Record<SectionKey, Tint> = {
  board: { ink: 'var(--marigold-ink)', wash: 'var(--marigold-wash)' }, // Le babillard
  kitchen: { ink: 'var(--terracotta-ink)', wash: 'var(--terracotta-wash)' }, // La cuisine
  routines: { ink: 'var(--berry-ink)', wash: 'var(--berry-wash)' }, // Routines
  cercle: { ink: 'var(--teal-ink)', wash: 'var(--teal-wash)' }, // Le cercle
  liste: { ink: 'var(--sky-ink)', wash: 'var(--sky-wash)' }, // La liste
  settings: { ink: 'var(--sage-ink)', wash: 'var(--sage-wash)' }, // Réglages
}

type GuidePoint = {
  label: Bi
  // `detail` = WHAT it does / how to use it. `why` = WHY it exists / why you'd
  // reach for it — kept as its own field (not crammed into detail) so the guide
  // can show it as a distinct line, and so a point that earns a reason says it
  // out loud. Optional on purpose: a purely navigational point (e.g. "set this
  // up in Settings") has no reason worth spelling out — don't write filler.
  detail: Bi
  why?: Bi
}

export type GuideEntry = {
  id: string
  // A name from the app's shared Phosphor-bold icon set (see components/Icon),
  // so the Guide reuses the very same glyphs the live UI uses — no emoji.
  icon: IconName
  group: 'start' | 'sections' | 'concepts' | 'settings'
  title: Bi
  what: Bi
  points: GuidePoint[]
  // For the "settings" group: the Réglages tab id this card documents, so the
  // Guide can offer a direct "go there" link (/settings?tab=<tab>). Must match a
  // SECTION id in pages/Operator.tsx.
  tab?: string
  // A full route path this card opens ("→ Ouvrir dans l'app") — generalizes `tab`
  // to any hub tab or scene (e.g. '/board', '/voyage/new', '/drawings'), so a
  // concept/section card can send you straight to the live feature, not just a
  // Réglages tab. When both are set, `route` wins. The feature-discovery map's
  // tiles reuse this same target via CONCEPT_THEMES.route.
  route?: string
  // An optional guided tour (lib/tourContent TOURS id) this card can replay. Given
  // → the card hosts a "replay" button that (re)starts that tour, so a tour is
  // permanently re-doable from the Guide, not just on first run. 'essentials' on the
  // "Première fois" card; each section card names its own section tour.
  tour?: string
  // When true, the card also hosts a "show the welcome checklist again" button
  // (re-shows the Board first-run WelcomeCard). Only on the "Première fois" card.
  resetOnboarding?: boolean
}

// (The old GUIDE_GROUPS table-of-contents is gone: the manual no longer renders
// as one grouped page. Each themed Réglages tab shows its own slice via
// ComprendrePanel — keyed off `group` + CONCEPT_THEMES/cardHomeTab below — and
// Découvrir carries the global search + the start card.)

// ── The feature map: ONE themed taxonomy of "everything Babillard does" ──────
// The concepts group is large (~24 cards); shown flat it reads as a wall. These
// themes cluster it into a handful of named buckets. This is the SINGLE source of
// truth for the themed map — reused by the in-app Guide (sub-clustering + jump
// grid), the Board first-run WelcomeCard, and the DevKit gallery (FeatureMap).
// Keep it here (next to GUIDE) so the map and the cards never drift apart.
// `route` = where the theme's tile opens in the LIVE app (the feature-map is a
// launcher now, not just a Guide-scroller). `ids` must list every `group:'concepts'`
// card in the theme — an id in no theme is invisible to the jump-grid (a bug we
// closed for home-projects/cast-tv). New concept card ⇒ add its id to a theme here.
// `section` = which of the six hub tabs this theme belongs to; the Guide colours
// the theme's block + its feature-map tile with that section's SECTION_TINT.
// One bucket per hub section — the theme's `key` IS the SectionKey, so the
// taxonomy, SECTION_TINT, the feature-map tiles and the Réglages themed tabs
// (pages/Operator) all share one id space. Canonical order = importance order
// (mirrors the hub nav): board → kitchen → liste → cercle → routines → settings.
export type ConceptTheme = { key: SectionKey; icon: IconName; label: Bi; ids: string[]; route: string; section: SectionKey }
export const CONCEPT_THEMES: ConceptTheme[] = [
  {
    key: 'board',
    icon: 'sun-bold',
    label: { fr: 'Le babillard', en: 'The board' },
    route: '/board',
    section: 'board',
    ids: [
      'capture',
      'type-or-choose',
      'search',
      'ask',
      'mots',
      'habits',
      'activities',
      'home-projects',
      'reminders',
      'moment',
      'drawings',
      'undo',
      'a-regler',
      'share-target',
    ],
  },
  {
    key: 'kitchen',
    icon: 'carrot-bold',
    label: { fr: 'La cuisine', en: 'The kitchen' },
    route: '/kitchen',
    section: 'kitchen',
    ids: ['recipes', 'cookmode', 'leftovers', 'reserve', 'favorites'],
  },
  {
    key: 'liste',
    icon: 'sparkle-bold',
    label: { fr: 'La liste', en: 'The list' },
    route: '/liste',
    // deals / flyers / cashier / ghost ride the list-and-store world — sky.
    section: 'liste',
    ids: ['deals', 'flyers', 'cashier', 'ghost'],
  },
  {
    key: 'cercle',
    icon: 'users-three-bold',
    label: { fr: 'Le cercle', en: 'The circle' },
    route: '/cercle',
    // voyage / auto / carnets all live in Le cercle's world — wear its turquoise.
    section: 'cercle',
    ids: ['voyage', 'auto', 'carnets'],
  },
  {
    key: 'routines',
    icon: 'smiley-bold',
    label: { fr: 'Routines', en: 'Routines' },
    route: '/routines',
    section: 'routines',
    ids: ['todos'],
  },
  {
    key: 'settings',
    icon: 'gear-six-bold',
    label: { fr: 'Système', en: 'System' },
    route: '/settings',
    section: 'settings',
    ids: [
      'surface',
      'audience',
      'pairing',
      'screensaver',
      'apod',
      'share',
      'share-access',
      'cast-tv',
      'offline',
      'account',
      'ai',
      'calm',
    ],
  },
]

// The jump-grid tiles: one per hub section, in the canonical order — derived 1:1
// from CONCEPT_THEMES so the map and the buckets can never drift. `route` = where
// the tile opens in the LIVE app (Board WelcomeCard + landing navigate); the
// Découvrir tab instead opens the themed Réglages tab (?tab=<key>&lens=comprendre).
// `section` drives the tile's SECTION_TINT (icon + hover), so each tile reads in
// its section's colour.
export type FeatureMapTile = { key: string; icon: IconName; label: Bi; route: string; section: SectionKey }
export const FEATURE_MAP_TILES: FeatureMapTile[] = CONCEPT_THEMES.map((th) => ({
  key: th.key,
  icon: th.icon,
  label: th.label,
  route: th.route,
  section: th.section,
}))

// Resolve a feature-map tile key → its live route (for callers that navigate
// instead of scrolling the Guide). Falls back to the board for an unknown key.
export function featureMapRoute(key: string): string {
  return FEATURE_MAP_TILES.find((t) => t.key === key)?.route ?? '/board'
}

// ── Legacy theme keys ────────────────────────────────────────────────────────
// The taxonomy used to be 5 descriptive buckets ('everyday', 'kitchen-shop', …)
// plus two synthetic jump-grid tiles ('sections', 'settings'). Old ?theme= links
// (bookmarks — no in-code producers remain) resolve through this map to the
// section-keyed bucket that absorbed them.
export const THEME_ALIAS: Record<string, string> = {
  everyday: 'board',
  'kitchen-shop': 'kitchen',
  devices: 'settings',
  'getting-around': 'cercle',
  'ai-calm': 'settings',
  sections: 'decouvrir',
}

// Which of the 8 consolidated `set-*` cards ("the Réglages reference") lives on
// which THEMED Réglages tab — i.e. where a ?card=set-… deep-link should land now
// that the settings manual renders inside each theme's Comprendre lens instead of
// one collapsed group. Keys are post-SETTINGS_CARD_ALIAS ids (guide.tsx resolves
// retired card ids first).
const SET_CARD_HOME: Record<string, string> = {
  'set-household': 'cercle',
  'set-devices': 'settings',
  'set-agenda': 'board',
  'set-chores': 'routines',
  'set-recipes': 'kitchen',
  'set-shopping': 'liste',
  'set-display': 'settings',
  'set-ai': 'settings',
}

// The Réglages tab a (already alias-resolved) guide card calls home: a section
// card homes on its own themed tab, a concept on its bucket's tab, a set-* card
// per SET_CARD_HOME, and the start/overview card on Découvrir. Operator uses this
// to turn any ?card= deep-link into "open that theme, Comprendre lens".
export function cardHomeTab(id: string): string {
  const e = GUIDE.find((g) => g.id === id)
  if (!e || e.group === 'start') return 'decouvrir'
  if (e.group === 'sections') return e.id
  if (e.group === 'concepts') return CONCEPT_THEMES.find((th) => th.ids.includes(id))?.key ?? 'decouvrir'
  return SET_CARD_HOME[e.id] ?? 'settings'
}

export const GUIDE: GuideEntry[] = [
  // ── Pour commencer (the overview + replay) ────────────────────────────────
  {
    id: 'first-time',
    icon: 'sparkle-bold',
    group: 'start',
    tour: 'essentials',
    resetOnboarding: true,
    title: { fr: 'Première fois', en: 'First time' },
    what: {
      fr: 'Tout Babillard en bref — ce que c’est, les six sections, comment ajouter, et la promesse « calme ».',
      en: 'All of Babillard in brief — what it is, the six sections, how to add, and the “calm” promise.',
    },
    points: [
      {
        label: { fr: 'C’est quoi, Babillard', en: 'What Babillard is' },
        detail: {
          fr: 'Un centre de commande familial pour une tablette laissée au mur : l’agenda du jour, le souper de ce soir, les listes, les corvées et les routines des enfants.',
          en: 'A household command-centre for a tablet left on the wall: today’s agenda, tonight’s supper, the lists, the chores and the kids’ routines.',
        },
        why: {
          fr: 'Calme par choix : pas de points ni de notifications, rien à entretenir pour le plaisir.',
          en: 'Calm by choice: no points or notifications, nothing to maintain for its own sake.',
        },
      },
      {
        label: { fr: 'Ajouter : écris ou parle', en: 'Adding: type or speak' },
        detail: {
          fr: 'Le bouton [[icon:plus-bold]] ajoute ce qui convient à la section. Écris en mots normaux (« souper spaghetti vendredi ») ou dicte au [[icon:speaker-high-bold]] micro. Tu peux glisser une date et un prénom : « dentiste pour Léa mardi 15h » ou « soccer de Marc le 20 juin » crée le rendez-vous au bon jour, au nom de la bonne personne.',
          en: 'The [[icon:plus-bold]] button adds whatever fits the section. Type in plain words (“spaghetti supper Friday”) or dictate with the [[icon:speaker-high-bold]] mic. You can slip in a date and a name: “dentist for Léa tuesday 3pm” or “Marc’s soccer on june 20” files the event on the right day, under the right person.',
        },
        why: {
          fr: 'L’app range la note à la bonne place toute seule — la bonne date, la bonne personne — d’un seul geste.',
          en: 'The app files the note in the right place by itself — the right date, the right person — in one gesture.',
        },
      },
      {
        label: { fr: 'Calme par choix', en: 'Calm by choice' },
        detail: {
          fr: 'Pas de séquences à entretenir, pas de pastilles rouges, pas de fil sans fin. Les listes se vident et restent vides.',
          en: 'No streaks to keep up, no red badges, no endless feed. Lists empty and stay empty.',
        },
        why: {
          fr: 'Pour que l’app serve la famille sans chercher à la garder accrochée.',
          en: 'So the app serves the family without trying to keep it hooked.',
        },
      },
      {
        label: { fr: 'Des exemples pour explorer', en: 'Sample data to explore' },
        detail: {
          fr: 'Un tout nouveau compte arrive avec une famille de démo (des membres, un plan de repas, des listes, des corvées, des routines) pour que le babillard soit vivant tout de suite. Un bandeau en haut du babillard te laisse la garder ou la vider ; « Vider les exemples » n’efface jamais ce que tu ajoutes toi-même. Tu peux aussi la recharger ou la vider ici même (ci-dessus).',
          en: 'A brand-new account comes with a demo family (members, a meal plan, lists, chores, routines) so the board is alive from the start. A banner at the top of the board lets you keep it or clear it; “Clear the examples” never removes anything you add yourself. You can also reload or clear it right here (above).',
        },
        why: {
          fr: 'Voir l’app remplie vaut mille explications — et elle se vide d’un geste quand tu es prêt·e à mettre tes vraies affaires.',
          en: 'Seeing the app full beats a thousand explanations — and it clears in one tap when you’re ready for your real stuff.',
        },
      },
      {
        label: { fr: 'Besoin d’aide : touche l’icône', en: 'Need help: tap the icon' },
        detail: {
          fr: 'En haut à droite de chaque section, la pastille colorée (le soleil, la carotte, etc.) porte un petit « ? » : touche-la pour ouvrir l’aide de cette section, ici dans le Guide.',
          en: 'Top-right of every section, the coloured disc (the sun, the carrot, etc.) carries a small “?”: tap it to open that section’s help, right here in the Guide.',
        },
        why: {
          fr: 'Une seule cible calme au lieu d’un bouton d’aide en plus — et elle disparaît quand tu connais l’app (Réglages ▸ Système ▸ Affichage).',
          en: 'One calm target instead of an extra help button — and it disappears once you know the app (Settings ▸ System ▸ Display).',
        },
      },
      {
        label: { fr: 'Rejouer la visite', en: 'Replay the tour' },
        detail: {
          fr: 'Le petit tour interactif démarre tout seul la première fois. Pour le revoir, touche le bouton ci-dessous : il t’amène au babillard et te guide.',
          en: 'The little interactive tour starts on its own the first time. To see it again, tap the button below: it takes you to the board and walks you through.',
        },
      },
    ],
  },
  // ── Sections (the six hub tabs) ───────────────────────────────────────────
  {
    id: 'board',
    icon: 'sun-bold',
    group: 'sections',
    tour: 'board',
    title: { fr: 'Le babillard', en: 'The board' },
    what: {
      fr: 'L’écran « coup d’œil » de la maisonnée : l’heure, l’agenda du jour, le souper de ce soir, les corvées et ce qu’il y a à faire, réunis sur un même mur — pour que tout le monde voie la journée d’un regard, sans demander ni rien toucher.',
      en: 'The household glance screen: the time, today’s agenda, tonight’s supper, the chores and what’s to do, gathered on one wall — so everyone sees the day at a glance, without asking or touching a thing.',
    },
    points: [
      // ⚠ Help registries deep-link into this card BY POINT INDEX (e.g.
      // ADD_HELP 'avant-de-partir' → point 5) — append new points at the END,
      // never insert at the front (helpRegistry.test.ts checks range, not
      // meaning, so a shift would silently mis-point every bubble).
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Au babillard, le ＋ (en bas) ajoute : une note rapide (écrite ou parlée), un rendez-vous, une corvée, un à-faire, une routine, un mot à laisser, un voyage, planifier le repas d’aujourd’hui ou de demain, et « Avant de partir ».',
          en: 'On the board, ＋ (bottom) adds: a quick note (typed or spoken), an appointment, a chore, a to-do, a routine, a note to leave, a trip, plan today’s or tomorrow’s meal, and “Before you go”.',
        },
      },
      {
        label: { fr: 'Pensé pour la tablette', en: 'Built for the tablet' },
        detail: {
          fr: 'Gros caractères lisibles de l’autre bout de la cuisine, et ça se rafraîchit tout seul.',
          en: 'Big type readable across the kitchen, and it refreshes itself.',
        },
        why: {
          fr: 'C’est fait pour être lu au passage, jamais manipulé.',
          en: 'It’s made to be read in passing, never operated.',
        },
      },
      {
        label: { fr: 'Ce soir', en: 'Tonight' },
        detail: {
          fr: 'Le souper prévu pour aujourd’hui, et qui cuisine. Vide tant que rien n’est planifié dans [[card:kitchen|La cuisine]].',
          en: 'Today’s planned supper, and who’s cooking. Empty until something is planned in [[card:kitchen|the Kitchen]].',
        },
        why: {
          fr: 'La réponse à « qu’est-ce qu’on mange ? » sans que personne ait à demander.',
          en: 'The answer to “what’s for supper?” without anyone having to ask.',
        },
      },
      {
        label: { fr: 'Le fil du jour', en: 'The day’s timeline' },
        detail: {
          fr: 'Les rendez-vous, trajets et heures de travail d’aujourd’hui placés dans l’ordre de l’heure, avec un repère « Maintenant » entre ce qui est passé (estompé) et ce qui s’en vient, et des plages « Libre » dans les grands trous. Les corvées et ce qui n’a pas d’heure se rangent sous « À tout moment ». Plus deux choses sont éloignées, plus l’espace entre elles est grand — la forme de la journée se lit d’un coup d’œil. Touche une ligne pour sa fiche. Tu peux le cacher ou le réordonner dans [[card:set-display|Réglages ▸ Le babillard ▸ Disposition]]; en mode tout-petit, c’est la séquence « Notre journée » (matin → dodo).',
          en: 'Today’s appointments, rides and work hours placed in time order, with a “Now” marker between what’s past (dimmed) and what’s coming, and “Free” stretches in the big gaps. Chores and anything without a time sit under “Anytime”. The farther apart two things are, the more space between them — so the shape of the day reads at a glance. Tap a row for its card. Hide or reorder it in [[card:set-display|Settings ▸ The board ▸ Layout]]; in toddler mode it’s the “Our day” sequence (morning → bedtime).',
        },
        why: {
          fr: 'Voir *quand* la journée se remplit, pas seulement *quoi* — sans lire chaque heure.',
          en: 'See *when* the day fills up, not just *what* — without reading every time.',
        },
      },
      {
        label: { fr: 'Toucher pour les détails', en: 'Tap for details' },
        detail: {
          fr: 'Touche une affaire pour l’ouvrir directement : le souper de ce soir ouvre sa recette, une routine se met à jouer, une recette s’ouvre en grand. Rien à traverser. Quand il n’y a pas de page derrière — un rendez-vous, une corvée, un mot — la fiche s’ouvre à la place : une image, la date, le texte utile, de qui il s’agit, et un ou deux gestes rapides (Modifier, Marquer fait). Sur une corvée, le crochet à droite reste pour cocher; touche le reste de la ligne pour la fiche.',
          en: 'Tap a thing to open the thing: tonight’s supper opens its recipe, a routine starts playing, a recipe opens full-screen. Nothing to click through. When there’s no page behind it — an event, a chore, a note — the card opens instead: a picture, the date, the relevant text, who it’s for, and a quick action or two (Edit, Mark done). On a chore the check on the right still ticks it off; tap the rest of the row for the card.',
        },
        why: {
          fr: 'Une touche mène à la chose elle-même, jamais à un menu à propos d’elle.',
          en: 'One tap lands on the thing itself, never on a menu about it.',
        },
      },
      {
        label: { fr: 'Tout chercher', en: 'Search everything' },
        detail: {
          fr: 'La loupe 🔍 en haut de chaque onglet ouvre une recherche unique : tape un mot et tu vois d’un coup tout ce qui correspond — tes recettes, les gens et les animaux de ton cercle, tes services (vétérinaire, plombier…), tes événements, tes routines, tes listes « À compléter », les articles de ta liste, ton garde-manger et ta réserve, l’auto, tes notes du babillard — et même ce guide d’aide, pour trouver comment faire quelque chose. Touche un résultat pour y aller directement (un résultat d’aide ouvre la bonne fiche du guide). Les accents sont ignorés (« cafe » trouve « café »).',
          en: 'The magnifier 🔍 at the top of every tab opens one search: type a word and see, at once, everything that matches — your recipes, the people and pets in your circle, your services (vet, plumber…), your events, your routines, your to-do lists, items on your list, your pantry and reserve, the car, your board notes — and even this help guide, to find how to do something. Tap a result to jump straight there (a help result opens the right guide card). Accents are ignored (“cafe” finds “café”).',
        },
        why: {
          fr: 'Retrouver une chose sans te rappeler dans quel onglet elle vit.',
          en: 'Find something without remembering which tab it lives in.',
        },
      },
      {
        label: { fr: 'Demander à l’IA', en: 'Ask the AI' },
        detail: {
          fr: 'Dans la recherche, écris une vraie question — « qu’est-ce qu’on mange vendredi ? », « qu’est-ce que j’ai ajouté cette semaine ? » — puis touche [[icon:sparkle-bold]] « Demander à l’IA ». La réponse arrive avec une pastille de couleur qui montre de quoi elle parle (repas, événement, liste…). Si ce n’est pas ce que tu cherchais, des raccourcis « Pas ce que tu cherchais ? » te mènent à la bonne section ou au guide.',
          en: 'In search, type a real question — “what’s for supper Friday?”, “what did I add this week?” — then tap [[icon:sparkle-bold]] “Ask the AI”. The answer comes with a coloured chip showing what it’s about (meal, event, list…). If it isn’t what you wanted, “Not what you wanted?” shortcuts take you to the right section or the guide.',
        },
        why: {
          fr: 'Une réponse en langage normal sur tes propres données — l’IA ne lit que ce qui est à toi.',
          en: 'A plain-language answer over your own data — the AI only reads what’s yours.',
        },
      },
      {
        label: { fr: 'Avant de partir', en: 'Before you go' },
        detail: {
          fr: 'Touche le ＋ ▸ « Avant de partir » : un seul écran de départ qui réunit une de tes listes (« Avant de partir », « Chez grand-papa »…), les rendez-vous du jour et la météo avec le bon conseil (« Mets un manteau »). Coche les choses en attrapant tes clés et ton sac — les coches sont temporaires, elles repartent à zéro la prochaine fois (rien n’est ajouté à « À compléter »). Monte tes listes dans Réglages ▸ [[card:todos|À compléter]].',
          en: 'Tap ＋ ▸ “Before you go”: one leaving screen that gathers one of your lists (“Before you go”, “At grandpa’s”…), today’s events and the weather with the right tip (“Wear a coat”). Tick things off as you grab your keys and bag — the ticks are temporary and reset next time (nothing is added to your To-do lists). Build your lists in Settings ▸ [[card:todos|To complete]].',
        },
        why: {
          fr: 'Sortir sans rien oublier — la liste, l’horaire et la météo en un coup d’œil, à côté de la porte.',
          en: 'Leave without forgetting anything — the list, the schedule and the weather at a glance, by the door.',
        },
      },
      {
        label: { fr: 'Changer la vue', en: 'Change the view' },
        detail: {
          fr: 'Trois zooms sur la même maison : la Grille (toute la journée d’un coup d’œil), le Mois (la vue d’ensemble; touche une journée pour la planifier) et L’année (l’horizon : douze petits mois qui ne montrent que les repères de l’année — fêtes, anniversaires, voyages, entretien, le long jeu; touche un mois pour l’ouvrir dans Mois). Le visage choisi à côté du sélecteur filtre la Grille et le Mois — Maisonnée montre tout le monde, un visage ne montre que ses affaires à lui. Le bouton « Moments » ouvre un moment choisi (ce soir, demain, une date, la semaine) avec sa liste à cocher.',
          en: 'Three zooms on the same home: the Grid (the whole day at a glance), the Month (the big picture; tap a day to plan it) and The year (the horizon: twelve small months showing only the year’s fixed points — holidays, birthdays, trips, upkeep, the long game; tap a month to open it in Month). The face you pick beside the selector filters the Grid and the Month — Household shows everyone, a face shows just their things. The “Moments” button opens a chosen moment (tonight, tomorrow, a date, the week) with its check-off list.',
        },
        why: {
          fr: 'Trois altitudes claires — le jour, le mois, l’année — plutôt que cinq vues qui se ressemblent; le visage et « Moments » couvrent le reste sans encombrer.',
          en: 'Three clear altitudes — the day, the month, the year — instead of five views that blur together; the face picker and “Moments” cover the rest without clutter.',
        },
      },
      {
        label: { fr: 'Voir un moment', en: 'See a moment' },
        detail: {
          fr: 'Dans la vue Mois, touche une journée puis « Voir ce moment » : « Moments » s’ouvre sur cette date — tout ce qui s’en vient ce jour-là, avec sa liste « À compléter » à cocher. Le bouton « Moments » du babillard ouvre les mêmes fenêtres : ce soir, demain, une date, la semaine.',
          en: 'In the Month view, tap a day then “See this moment”: “Moments” opens on that date — everything coming up that day, with its “To complete” list to check off. The board’s “Moments” button opens the same windows: tonight, tomorrow, a date, the week.',
        },
        why: {
          fr: 'Pour zoomer sur un moment précis et préparer la passation (gardienne, fin de semaine) d’un seul coup d’œil.',
          en: 'To zoom into one moment and prep a handoff (sitter, the weekend) at a glance.',
        },
      },
      {
        label: { fr: 'Personnaliser le babillard', en: 'Customize the board' },
        detail: {
          fr: 'Garde le doigt sur une carte du babillard : elles se mettent à frémir, comme les applis d’un téléphone. Glisse la poignée ⠿ pour la déplacer — même du bandeau du haut vers les cartes du bas —, touche le chiffre pour changer sa largeur (1, 2, 3 colonnes ou pleine largeur), ou ✕ pour la retirer. « Terminé » quand c’est beau. Tout se retrouve aussi dans Réglages ▸ Le babillard ▸ « Disposition du babillard », avec le clavier. C’est propre à CET appareil — la tablette murale et ton téléphone gardent chacun leur disposition.',
          en: 'Press and hold a card on the board: they start to wobble, like apps on a phone. Drag the ⠿ handle to move it — even from the top band down into the cards below — tap the number to change its width (1, 2, 3 columns or full width), or ✕ to remove it. “Done” when it looks right. Everything is also in Settings ▸ The board ▸ “Board layout”, reachable by keyboard. It’s specific to THIS device — the wall tablet and your phone each keep their own layout.',
        },
        why: {
          fr: 'Pour que le babillard montre ce qui compte pour TOI sur CET écran — la tablette murale glanceable, ton téléphone plus court.',
          en: 'So the board shows what matters to YOU on THIS screen — the wall tablet glanceable, your phone shorter.',
        },
      },
      {
        label: { fr: 'Toucher un visage', en: 'Tap a face' },
        detail: {
          fr: 'Touche ta photo pour mettre ta journée en avant; touche-la encore pour revenir à « toute la maisonnée ». Sur la tablette, ça revient tout seul après quelques minutes (avec un petit avertissement).',
          en: 'Tap your photo to put your day front and centre; tap it again to go back to “everyone”. On the tablet it drifts back on its own after a few idle minutes (with a small heads-up).',
        },
        why: {
          fr: 'Pour qu’un coup d’œil te montre TA journée — et pour que le mur partagé ne reste jamais « bloqué » sur une seule personne.',
          en: 'So a glance shows YOUR day — and so the shared wall never stays “stuck” on one person.',
        },
      },
      {
        label: { fr: 'Salutation selon l’heure', en: 'Greeting by time of day' },
        detail: {
          fr: 'Le mot d’accueil suit l’horloge : bon matin, bon après-midi, bonne soirée.',
          en: 'The greeting follows the clock: good morning, good afternoon, good evening.',
        },
        why: {
          fr: 'Un petit geste chaleureux pour que le mur se sente vivant plutôt que froid.',
          en: 'A small warm touch so the wall feels alive rather than cold.',
        },
      },
      {
        label: { fr: 'Cadre de photos de famille', en: 'Family photo frame' },
        detail: {
          fr: 'Tes photos défilent doucement dans un coin du babillard, une à la fois, avec un fondu lent toutes les 30 s. Téléverse-les dans Réglages ▸ Photos; sans photo, le cadre ne s’affiche pas.',
          en: 'Your photos drift quietly in a corner of the board, one at a time, with a slow cross-fade every 30 s. Upload them in Settings ▸ Photos; with no photos, the frame simply doesn’t appear.',
        },
        why: {
          fr: 'Pour que le mur tienne aussi du cadre numérique — vivant et familier — sans rien à faire ni à toucher, et sans agitation.',
          en: 'So the wall doubles as a calm digital frame — alive and familiar — with nothing to do or tap, and no fuss.',
        },
      },
      {
        label: { fr: 'À préparer pour demain', en: 'Prep for tomorrow' },
        detail: {
          fr: 'La note prévue pour demain remonte dès aujourd’hui, avec un aperçu météo (haut/bas).',
          en: 'Tomorrow’s note surfaces today, with a coarse weather outlook (high/low).',
        },
        why: {
          fr: 'Pour t’y prendre à temps — sortir l’habit de neige, préparer le lunch froid.',
          en: 'So you can act in time — dig out the snowsuit, prep the cold lunch.',
        },
      },
      {
        label: { fr: 'Conseil météo', en: 'Weather tip' },
        detail: {
          fr: 'Sous la température, une ligne d’habillement (manteau, parapluie, bois de l’eau) et quelques heures à venir en pastilles (icône + température) pour deviner l’après-midi. De nuit, le [[icon:sun-bold]] devient [[icon:moon-stars-bold]]. En vue enfant, touche la météo pour l’entendre.',
          en: 'Under the temperature, a dressing tip (coat, umbrella, drink water) and a few hours ahead as chips (icon + temperature) to read the afternoon. At night [[icon:sun-bold]] becomes [[icon:moon-stars-bold]]. In kid view, tap the weather to hear it.',
        },
        why: {
          fr: 'Pour habiller les enfants comme il faut avant de sortir, sans ouvrir une autre app.',
          en: 'So you dress the kids right before heading out, without opening another app.',
        },
      },
      {
        label: { fr: '« À faire » et « À finir »', en: '“À faire” and “À finir”' },
        detail: {
          fr: 'Une carte « À faire » réunit tes p’tites tâches ponctuelles (souvent dictées) et tes listes à cocher réutilisables (« À compléter ») — deux groupes étiquetés dans la même carte (voir [[card:todos|À faire & à compléter]]). À côté, « À finir » te rappelle les restes à manger en premier. Coche d’un geste; un mauvais coup se défait avec « Annuler ».',
          en: 'An “À faire” card gathers your small one-off tasks (often dictated) and your reusable check-off lists (“À compléter”) — two labelled groups in one card (see [[card:todos|To do & to complete]]). Beside it, “À finir” reminds you of leftovers to eat first. Tick with a tap; a mis-tap undoes with “Undo”.',
        },
        why: {
          fr: 'Tout ce qu’il reste à faire au même endroit, sans pointage.',
          en: 'Everything left to do in one place, no scoring.',
        },
      },
      {
        label: { fr: 'Une ambiance qui suit le moment', en: 'An ambience that follows the moment' },
        detail: {
          fr: 'Quand l’« Ambiance vivante » est activée (Réglages ▸ Système ▸ Affichage), le babillard suit doucement le moment : la teinte du fond glisse selon l’heure et la saison (un peu de neige l’hiver), et la carte qui compte à cette heure-ci se met en valeur en douceur — la journée le matin, le souper en fin d’après-midi, demain le soir. Les jours sans rien de prévu, une carte « Tout est calme » le dit gentiment. Rien à toucher, rien qui clignote; tout est désactivable.',
          en: 'When “Living ambience” is on (Settings ▸ System ▸ Display), the board gently follows the moment: the background tint drifts with the hour and the season (a little snow in winter), and the card that matters right now lifts softly — the day in the morning, supper in the late afternoon, tomorrow in the evening. On an empty day, a calm “All calm” card says so. Nothing to tap, nothing flashing; all of it can be turned off.',
        },
        why: {
          fr: 'Pour que le mur se sente vivant et te guide sans jamais te presser.',
          en: 'So the wall feels alive and quietly guides you without ever rushing you.',
        },
      },
      {
        label: { fr: 'Jouer : des jeux tout en douceur', en: 'Play: gentle little games' },
        detail: {
          fr: 'En vue enfant, une grande porte « 🎲 Jouer » ouvre un coin de jeux calmes, faits à partir de VOTRE maison et lus à voix haute. « Cherche et trouve » : « Trouve le chien ! » — touche la bonne image et tu entends « Bravo ! », touche-en une autre et elle dit juste son nom (jamais d’erreur). Choisis ce que tu cherches : les visages de la famille, les animaux, les couleurs, les aliments ou la météo. « Notre journée » déroule la journée du matin au dodo et raconte ce qui s’y passe (repas, sorties). « Les fêtes » montre à qui c’est bientôt l’anniversaire — « dans 3 dodos ! ». Aucun pointage, rien à gagner ou à perdre, rien d’enregistré : que du jeu, aussi longtemps que l’enfant en a envie.',
          en: 'In kid view, a big « 🎲 Play » door opens a corner of calm games, built from YOUR home and read aloud. « Find it »: “Find the dog!” — tap the right picture and you hear “Yay!”, tap another and it just says its name (never wrong). Pick what to look for: the family’s faces, animals, colours, food, or the weather. « Our day » walks the day from morning to bedtime and tells what happens (meals, outings). « Birthdays » shows whose birthday is soon — “in 3 sleeps!”. No score, nothing to win or lose, nothing saved — just play, for as long as the child likes.',
        },
        why: {
          fr: 'Apprendre les noms, les couleurs et l’ordre de la journée en jouant — calme, sans récompense ni dépendance (les principes du calme tiennent même au jeu).',
          en: 'Learning names, colours and the shape of the day through play — calm, with no rewards or hooks (the calm tenets hold even at play).',
        },
      },
      {
        label: { fr: 'Les fêtes s’annoncent d’elles-mêmes', en: 'Holidays announce themselves' },
        detail: {
          fr: 'Les fêtes du Québec et du Canada (Saint-Jean, Action de grâce, Noël, Pâques…) apparaissent d’elles-mêmes dans Aujourd’hui, Demain et À venir — une ligne calme avec son petit dessin, rien à créer, rien à gérer. Ça se désactive dans Réglages ▸ Système ▸ Affichage.',
          en: 'Québec and Canada holidays (Saint-Jean, Thanksgiving, Christmas, Easter…) appear on their own in Today, Tomorrow and Upcoming — one calm line with its little picture, nothing to create, nothing to manage. Turn it off in Settings ▸ System ▸ Display.',
        },
        why: {
          fr: 'Le calendrier de la maison connaît déjà son année — personne n’a à taper « Noël ».',
          en: 'The house calendar already knows its year — nobody has to type “Christmas”.',
        },
      },
      {
        label: { fr: 'Le décompte', en: 'The countdown' },
        detail: {
          fr: 'Le babillard propose de compter les dodos jusqu’à la prochaine belle affaire — une fête qui s’en vient, un anniversaire. Touche « Oui ! » et une tuile calme fait le décompte; le jour venu, elle célèbre, puis la maison propose le prochain. Toujours UN seul décompte; « Passer » refuse sans insister. La carte se cache dans « Disposition du babillard » comme les autres.',
          en: 'The board offers to count the sleeps until the next good thing — a coming holiday, a birthday. Tap “Yes!” and a calm tile counts down; on the day it celebrates, then the house offers the next one. Always ONE countdown; “Skip” declines without nagging. The card hides in “Board layout” like any other.',
        },
        why: {
          fr: 'Compter les dodos ensemble, sans que personne n’ait à y penser — la maison propose, la famille choisit.',
          en: 'Counting the sleeps together with nobody having to set it up — the house offers, the family chooses.',
        },
      },
      {
        label: { fr: 'Depuis ce matin', en: 'Since this morning' },
        detail: {
          fr: 'Touche la salutation en haut du babillard : un petit coup d’œil sur ce que la maisonnée a ajouté aujourd’hui, par visage — « Papa a ajouté du lait », « Léa a proposé une pizza ». Ferme-le et c’est reparti : rien n’est gardé, rien ne s’affiche tant que tu ne touches pas.',
          en: 'Tap the greeting at the top of the board: a quick look at what the household has added today, by face — “Dad added milk”, “Léa suggested pizza”. Close it and it’s gone: nothing is kept, nothing shows unless you tap.',
        },
        why: {
          fr: 'Répondre à « qu’est-ce qui a changé depuis ce matin ? » sans badge ni compteur qui traîne — juste un coup d’œil, à la demande.',
          en: 'Answers “what changed since this morning?” with no lingering badge or count — just a glance, on request.',
        },
      },
      {
        // D-17 (bmad/10) « La rentrée » — appended at the END (guide points are
        // APPEND-ONLY, indexed; operatorHelp 'schoolYear' points at index 21).
        label: { fr: 'La rentrée', en: 'Back to school' },
        detail: {
          fr: 'Réglages ▸ Le babillard ▸ Rendez-vous : donne une fois la rentrée, le dernier jour et les relâches. « Demain » sur le babillard sait alors dire 🎒 « École demain » ou 🏖️ « Congé demain » — mais seulement à la rentrée, au dernier jour, aux abords d’une relâche ou d’un férié en pleine année scolaire, jamais un jour ordinaire ni tout l’été. L’année scolaire s’ajoute aussi aux repères de [[card:board|L’année]].',
          en: 'Settings ▸ The board ▸ Events: give the first day, the last day, and any breaks once. « Tomorrow » on the board can then say 🎒 “School tomorrow” or 🏖️ “Day off tomorrow” — but only at the start, the last day, around a break, or an in-term holiday, never on an ordinary day or all summer. The school year also joins the fixed points in [[card:board|The year]].',
        },
        why: {
          fr: 'Une seule saisie par année — pas un calendrier à refaire, pas un rappel qui parle tous les jours pour rien.',
          en: 'One entry per year — no calendar to rebuild, no reminder chattering every single day for nothing.',
        },
      },
      {
        // D-21 (bmad/10) « Sortir le bac » — appended at the END (guide points are
        // APPEND-ONLY, indexed).
        label: { fr: 'L’annonce du soir', en: 'The evening announce' },
        detail: {
          fr: 'Dans l’éditeur d’une corvée récurrente (Réglages ▸ Corvées, ou le ＋), coche « Annoncer la veille au soir ». Le babillard affiche alors une ligne calme « Ce soir » le soir d’avant — « c’est le soir du bac bleu » — sans rien créer d’autre. Opt-out par appareil dans [[card:set-display|Réglages ▸ Le babillard ▸ Affichage]].',
          en: 'In a recurring chore’s editor (Settings ▸ Chores, or the ＋), check “Announce the evening before”. The board then shows a calm “Tonight” line the evening before — “it’s bin night” — nothing else created. Per-device opt-out in [[card:set-display|Settings ▸ The board ▸ Display]].',
        },
        why: {
          fr: 'Le bac est déjà su de la maison (l’horaire de la corvée) — juste une ligne de plus au bon moment, jamais une notification.',
          en: 'The house already knows the schedule (the chore) — just one more line at the right moment, never a notification.',
        },
      },
      {
        // The empty-card tri-state — appended at the END (guide points are APPEND-ONLY,
        // indexed: operatorHelp/boardHelp/addHelp deep-link to them by number).
        label: { fr: 'Une carte vide : la garder ou non', en: 'An empty card: keep it or not' },
        detail: {
          fr: 'Chaque carte choisit ce qu’elle fait quand elle n’a rien à dire. « Si non vide » (le réglage habituel) : elle s’efface d’elle-même et laisse la place aux autres. « Toujours » : elle garde sa place, avec une ligne tranquille — pratique pour une carte que tu veux retrouver au même endroit sur le mur. « Jamais » : elle ne vient pas du tout, et l’appareil ne va même pas chercher ses données.',
          en: 'Each card decides what it does when it has nothing to say. “If not empty” (the usual setting): it quietly steps aside and lets the others take the room. “Always”: it holds its place with a calm line — handy for a card you want to find in the same spot on the wall every time. “Never”: it doesn’t come at all, and the device doesn’t even fetch its data.',
        },
        why: {
          fr: 'Un mur qui se vide tout seul reste calme; mais une carte qui bouge chaque jour se cherche du regard. À toi de choisir, carte par carte.',
          en: 'A wall that empties itself stays calm; but a card that moves every day is a card you have to hunt for. Your call, card by card.',
        },
      },
      {
        // The compact lens — appended at the END (guide points are APPEND-ONLY, indexed).
        label: { fr: 'Une petite carte, en version courte', en: 'A small card, in short form' },
        detail: {
          fr: 'Rétrécis une carte assez pour qu’elle tienne à demi-largeur sur un téléphone, et elle prend une vraie petite forme — son icône, son titre, tout au plus une ligne discrète — plutôt que de coincer tout son contenu dans un espace trop étroit. Touche-la : elle grandit sur place à sa pleine largeur, avec les autres cartes qui se replacent autour. Touche la petite flèche ⌃ en haut, ou l’en-tête, pour la reprendre à sa taille de poche. Une seule carte peut être grande à la fois.',
          en: 'Shrink a card down to half-width on a phone and it takes on a genuinely small form — its icon, its title, at most one quiet line — instead of squeezing all its content into too little room. Tap it: it grows in place to its full width, with the other cards settling around it. Tap the small ⌃ arrow up top, or the header, to shrink it back to pocket size. Only one card stays big at a time.',
        },
        why: {
          fr: 'Une carte à demi-largeur qui essaie encore de tout montrer devient illisible — mieux vaut une forme courte, avec le reste à une touche.',
          en: 'A half-width card still trying to show everything turns unreadable — a short form is calmer, with the rest one tap away.',
        },
      },
    ],
  },
  {
    id: 'kitchen',
    icon: 'carrot-bold',
    group: 'sections',
    tour: 'kitchen',
    title: { fr: 'La cuisine', en: 'The kitchen' },
    what: {
      fr: 'Le garde-manger : tu planifies les repas de la semaine et tu signales ce qui achève, et la cuisine remplit ta liste d’épicerie pour toi. Elle garde aussi tes recettes et propose des idées quand tu sèches.',
      en: 'The pantry: you plan the week’s meals and flag what’s running low, and the kitchen fills your grocery list for you. It also keeps your recipes and suggests ideas when you’re stuck.',
    },
    points: [
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Dans La cuisine, le ＋ ajoute : cuisiner une recette, ajouter une recette, le livre illustré, planifier un repas, des restants, un aliment qui achève, ou un article de la réserve.',
          en: 'In the Kitchen, ＋ adds: cook a recipe, add a recipe, the illustrated book, plan a meal, leftovers, a running-low item, or a réserve item.',
        },
      },
      {
        label: { fr: 'Planifier la semaine', en: 'Plan the week' },
        detail: {
          fr: 'Mets un repas dans une case et il apparaît sur le babillard la bonne journée. Pas obligé de tout remplir.',
          en: 'Drop a meal in a slot and it shows on the board on the right day. No need to fill every box.',
        },
        why: {
          fr: 'Décidé une fois, fini le « qu’est-ce qu’on mange ? » chaque soir.',
          en: 'Decided once, no more nightly “what’s for supper?”.',
        },
      },
      {
        label: { fr: 'Ce qui s’achève', en: 'Running low' },
        detail: {
          fr: 'Dès qu’un aliment achève, mets-lui le drapeau « il en manque » : il saute direct sur la liste d’épicerie. C’est un simple drapeau, pas un inventaire à tenir à jour.',
          en: 'The moment a food is almost gone, flag it “running low”: it jumps straight onto the grocery list. It’s just a flag, not an inventory to keep current.',
        },
        why: {
          fr: 'Pour ne pas l’oublier à la prochaine commande — et parce qu’« un drapeau, pas un inventaire » garde la cuisine calme, sans corvée de comptage.',
          en: 'So you don’t forget it next shop — and because “a flag, not an inventory” keeps the kitchen calm, with no counting chore.',
        },
      },
      {
        label: { fr: 'Qu’est-ce qu’on mange ?', en: 'What’s for supper?' },
        detail: {
          fr: 'Le bouton de suggestion propose une idée de repas; touche encore pour une autre. (Demande l’IA — caché si elle est hors ligne.)',
          en: 'The suggest button offers a meal idea; tap again for another. (Uses AI — hidden when AI is offline.)',
        },
        why: {
          fr: 'De quoi casser le « je sais pas quoi faire » quand tu sèches.',
          en: 'Enough to break the “I don’t know what to make” when you’re stuck.',
        },
      },
      {
        label: { fr: 'Recettes', en: 'Recipes' },
        detail: {
          fr: 'Garde tes recettes, importe-les d’une photo ou d’un collé-copié, et planifie-les comme repas.',
          en: 'Keep your recipes, import them from a photo or a paste, and schedule them as meals.',
        },
        why: {
          fr: 'Une recette gardée devient un souper au calendrier, puis ses ingrédients arrivent sur la liste.',
          en: 'A saved recipe becomes a supper on the calendar, then its ingredients land on the list.',
        },
      },
      {
        label: { fr: 'Scanner une fiche (et la vérifier)', en: 'Scan a card (and check it)' },
        detail: {
          fr: 'Dans une nouvelle recette, touche « Scanner une fiche » et choisis la ou les photos (page de livre, fiche, capture d’écran). L’appareil LIT le texte lui-même, ici, sans l’envoyer nulle part — ça marche même sans connexion et sans IA. Avant que rien n’arrive dans la recette, on te montre la photo à côté du texte lu, et on surligne les endroits à vérifier d’un coup d’œil — les quantités (¾ et non ¼…) et les mots lus avec hésitation. Corrige au besoin, puis « C’est bon ». Recette en ligne ? Colle plutôt son lien : c’est une copie parfaite, rien à relire. Plusieurs pages (ingrédients d’un bord, étapes de l’autre) ? Scanne-les ensemble, on les recolle dans l’ordre. La photo lue se garde dans la fiche, sous « l’original », pour comparer plus tard.',
          en: 'In a new recipe, tap “Scan a card” and pick one or more photos (a book page, a card, a screenshot). The device READS the text itself, right here, without sending it anywhere — it works even offline and with no AI. Before anything lands in the recipe, we show the photo beside the read text and highlight the spots worth a glance — amounts (¾ not ¼…) and words read with hesitation. Fix what you need, then “Looks good”. Recipe online? Paste its link instead: it’s a perfect copy, nothing to re-read. Several pages (ingredients on one, steps on the other)? Scan them together and we stitch them in order. The scanned photo is kept on the card, under “the original”, to compare later.',
        },
        why: {
          fr: 'Une vraie lecture du texte (pas une devinette) ne transforme jamais un ¾ en ¼ ni n’invente un ingrédient — et le dernier coup d’œil sur la photo attrape le reste, en cinq secondes, pas au moment de cuisiner.',
          en: 'A real read of the text (not a guess) never turns a ¾ into a ¼ or invents an ingredient — and the last glance at the photo catches the rest in five seconds, not at the stove.',
        },
      },
      {
        label: { fr: 'Collections', en: 'Collections' },
        detail: {
          fr: 'Range tes recettes par étiquette (Soupes, Desserts…) et feuillette-les par collection. En vue Collections, touche des étiquettes pour n’afficher que ces collections-là (en vue « Aa », les mêmes étiquettes filtrent plutôt les recettes). En mode bambin, c’est trois écrans tout en images, lus à voix haute : la collection, la recette, puis le jour — deux touches pour confirmer.',
          en: 'Group your recipes by tag (Soups, Desserts…) and browse them by collection. In Collections view, tap tags to show only those collections (in “Aa” view the same tags filter the recipes instead). In toddler mode it’s three all-picture screens, read aloud: the collection, the recipe, then the day — two taps to confirm.',
        },
        why: {
          fr: 'Pour qu’un tout-petit choisisse un souper par lui-même, par l’image et le son, sans savoir lire — et sans rien créer de neuf : ce sont tes étiquettes de recettes, juste rangées.',
          en: 'So a pre-reader can pick a supper on their own, by picture and sound, without reading — and nothing new to build: it’s your recipe tags, just shelved.',
        },
      },
      {
        label: { fr: 'Cuisiner plusieurs plats ensemble', en: 'Cook several dishes together' },
        detail: {
          fr: 'Quand au moins deux repas prévus aujourd’hui sont des recettes, le ＋ « Cuisiner » offre « Cuisiner ensemble » en haut de la liste. Touche-le : tape les plats à cuisiner (deux ou plus), puis « Commencer ». Chaque plat s’ouvre dans le mode cuisson au complet — son affichage, sa taille de texte, ses minuteries — et un petit onglet sous les réglages te fait passer du plat A au plat B. Les plats restent ouverts en arrière-plan : une minuterie lancée sur le plat A continue et sonne pendant que tu lis le plat B.',
          en: 'When at least two of today’s planned meals are recipes, the ＋ “Cook” picker offers “Cook together” at the top of the list. Tap it: tap the dishes you want to cook (two or more), then “Start”. Each dish opens in the full cook mode — its own layout, text size and timers — and a small sub-tab under the controls flips you between dish A and dish B. The dishes stay open in the background: a timer you started on dish A keeps running and chimes while you read dish B.',
        },
        why: {
          fr: 'Faire souper et accompagnement en même temps sans jongler trois minuteurs de four : ils vivent tous au même endroit.',
          en: 'Get the main and the sides done at once without juggling three separate kitchen timers — they all live in one place.',
        },
      },
      {
        label: { fr: 'Le livre illustré des petits', en: 'The kids’ picture book' },
        detail: {
          fr: 'Un livre de cuisine tout en images, à LIRE à l’écran (jamais à imprimer). En mode bambin, dans la cuisine, touche « 📖 Mon livre »; tu peux aussi l’ouvrir avec le ＋ de la cuisine ▸ « Le livre illustré ». On le feuillette du doigt (glisse ou flèches), une grande page par recette : la photo, le nom lu à voix haute, et un gros « On cuisine ! » qui lance la recette. Un pré-lecteur s’en sert seul.',
          en: 'An all-pictures cookbook to READ on screen (never to print). In toddler mode, in the kitchen, tap “📖 My book”; you can also open it from the kitchen ＋ ▸ “The picture book”. Flip it with a finger (swipe or arrows), one big page per recipe: the photo, the name read aloud, and a big “Let’s cook!” that starts the recipe. A pre-reader uses it on their own.',
        },
        why: {
          fr: 'Un tout-petit « lit » et choisit ses recettes par l’image et le son, puis cuisine avec un grand — un jeu, pas une feuille à imprimer.',
          en: 'A little one “reads” and picks their recipes by picture and sound, then cooks with a grown-up — a game, not a printout.',
        },
      },
      {
        label: { fr: 'Lecture à voix haute dans la bonne langue', en: 'Read aloud in the right language' },
        detail: {
          fr: 'Trois réglages, du plus large au plus précis. (1) Réglages ▸ Système ▸ Voix ▸ « Langue de lecture » : Auto suit l’application, ou force tout en Français/Anglais. (2) Une recette gardée dans l’autre langue ? Sa fiche a son propre « Lecture à voix haute » qui la lit toujours dans SA langue — même dans une maison en français, ses étapes et son nom (jusque sur la grille bambin) sont dits avec une voix anglaise. (3) Sous « Voix », choisis la voix précise pour CHAQUE langue (Français / Anglais) et teste-la. Il faut qu’une voix de cette langue soit installée sur l’appareil; sinon, un message t’indique où l’ajouter. Note iPad/iPhone : le navigateur n’a souvent accès qu’aux voix « par défaut » — une voix « Améliorée » du système peut ne pas être disponible ici.',
          en: 'Three controls, broad to precise. (1) Settings ▸ System ▸ Voice ▸ “Reading language”: Auto follows the app, or force everything to French/English. (2) A recipe kept in the other language? Its card has its own “Read aloud” that always reads it in ITS language — even in a French household, its steps and name (right down to the toddler grid) are said with an English voice. (3) Under “Voice”, pick the exact voice for EACH language (French / English) and test it. The device needs a voice for that language installed; if not, a message points you where to add one. iPad/iPhone note: the browser often only has the “default” voices — a system “Enhanced” voice may not be available here.',
        },
        why: {
          fr: 'Pour qu’un tout-petit qui écoute entende les mots bien prononcés, peu importe la langue — et que tu puisses choisir la meilleure voix disponible pour chacune.',
          en: 'So a little one listening hears the words pronounced properly, whatever the language — and you can pick the best available voice for each.',
        },
      },
      {
        label: { fr: 'Tous les repas', en: 'All the meals' },
        detail: {
          fr: 'Pas juste le souper : déjeuner, dîner, collation, souper et dessert ont chacun leur case.',
          en: 'Not just supper: breakfast, lunch, snack, supper and dessert each have their own slot.',
        },
        why: {
          fr: 'Pour planifier aussi les lunchs, les collations et les desserts à l’avance, pas seulement le repas du soir.',
          en: 'So you can plan lunchboxes, snacks and desserts ahead too, not only the evening meal.',
        },
      },
      {
        label: { fr: 'Idées de repas', en: 'Meal ideas' },
        detail: {
          fr: 'Une petite réserve d’idées (texte libre ou recette [[icon:book-open-bold]]) sous la grille; touche-en une pour la déposer sur n’importe quel jour. Elle reste dans la réserve.',
          en: 'A small pool of ideas (free text or a [[icon:book-open-bold]] recipe) under the grid; tap one to drop it on any day. It stays in the pool.',
        },
        why: {
          fr: 'Tes valeurs sûres restent à portée pour les replanifier en un toucher, sans les retaper.',
          en: 'Your go-to meals stay within reach to re-plan in one tap, without retyping them.',
        },
      },
      {
        label: { fr: 'Note du jour', en: 'Day note' },
        detail: {
          fr: 'Un mémo par journée (« souper chez mémé », « lunch froid — sortie ») qui apparaît aussi sur le babillard la bonne date.',
          en: 'A per-day memo (“supper at grandma’s”, “cold lunch — outing”) that also shows on the board on the right date.',
        },
        why: {
          fr: 'Pour prévenir toute la maisonnée d’une journée qui sort de l’ordinaire, au bon moment.',
          en: 'To flag the whole household about an out-of-the-ordinary day, at the right time.',
        },
      },
      {
        label: { fr: 'À utiliser bientôt', en: 'Use it soon' },
        detail: {
          fr: 'Marque un aliment frais « à utiliser bientôt » avant qu’il se perde. Ça n’achète rien et ça ne va pas sur la liste (contrairement à « il en manque ») : ça nourrit plutôt la suggestion « finis ce que tu as » — « Qu’est-ce qu’on mange ? » te propose une recette qui passe au travers.',
          en: 'Flag a fresh food “use soon” before it spoils. It buys nothing and never hits the list (unlike “running low”): instead it feeds the “use what you have” suggestion — “What’s for supper?” proposes a recipe that gets through it.',
        },
        why: {
          fr: 'Pour gaspiller moins — sortir ce qui achève par une recette, sans en faire un inventaire à compter.',
          en: 'To waste less — cook down what’s about to turn, without turning it into an inventory to count.',
        },
      },
      {
        label: { fr: 'Vide-frigo AI', en: 'AI empty-fridge' },
        detail: {
          fr: 'Quand tu as marqué des aliments « à utiliser bientôt » (ou rangé des trucs dans La réserve), ouvre le tiroir d’idées-repas et prends « Vide-frigo » au bas du tiroir. L’IA te propose une dizaine d’idées de plats qui passent au travers de ce qui va se perdre; coche-en jusqu’à trois, et elle te rédige une vraie recette pour chacune. Garde celle que tu veux dans ton livre (étiquetée « Vide-frigo ») ou lance-la direct en mode cuisson.',
          en: 'Once you’ve flagged foods “use soon” (or stashed things in The réserve), open the meal-ideas drawer and take “Empty the fridge” at the bottom. The AI proposes about ten dish ideas that get through what’s about to spoil; tick up to three and it writes a real recipe for each. Keep the one you want in your book (tagged “Empty-fridge”) or jump straight into cook mode.',
        },
        why: {
          fr: 'Inventer un souper à partir de ce qui traîne — pas juste piger dans tes recettes — c’est ce qui sauve vraiment les restes, sans gaspillage et sans aller à l’épicerie. Tu décides : on ne rédige la recette complète que pour ce que tu choisis (moins d’IA, un choix plus calme).',
          en: 'Inventing a supper from what’s lying around — not just pulling from your saved recipes — is what actually rescues the odds and ends, with no waste and no grocery run. You decide: a full recipe is only written for what you pick (less AI, a calmer choice).',
        },
      },
      // ── C-14 (appended — indices above are load-bearing, never renumber) ──
      {
        label: { fr: 'Le tiroir « Idées »', en: 'The « Idées » drawer' },
        detail: {
          fr: 'Un seul tiroir réunit toutes les sources d’idées de repas, en chapitres qu’on touche un à la fois : Idées (ta réserve gardée) · ⭐ Favoris (ce que la maisonnée a aimé) · 🧊 À écouler (les restants à finir + ce qui utilise ce qui achève) · 🤖 IA (une volée d’idées fraîches) · 👧 Proposé par (les suggestions d’un enfant). Touche une idée pour la déposer sur un jour — elle reste dans sa source, prête à replanifier. Ouvre-le depuis la grille de la semaine ou le ＋ de la cuisine.',
          en: 'One drawer gathers every source of meal ideas, as chapters you tap one at a time: Idées (your kept pool) · ⭐ Favorites (what the household loved) · 🧊 Use it up (leftovers to finish + what uses what’s running out) · 🤖 AI (a fresh batch) · 👧 Suggested by (a child’s picks). Tap an idea to drop it on a day — it stays in its source, ready to re-plan. Open it from the week grid or the kitchen ＋.',
        },
        why: {
          fr: 'Avant, quatre ou cinq réserves d’idées vivaient chacune dans son coin — une famille en apprenait une et ne trouvait jamais les autres. Un seul tiroir, une seule habitude à retenir.',
          en: 'Before, four or five idea pools each lived in their own corner — a family learned one and never found the rest. One drawer, one habit to remember.',
        },
      },
      {
        label: { fr: '« Léa propose »', en: '“Léa suggests”' },
        detail: {
          fr: 'Quand un enfant choisit une recette pour un jour vide (dans la cuisine bambin), ça ne planifie rien tout seul — c’est une IDÉE, gardée dans le tiroir. La case du jour vide affiche un petit visage et « Léa propose 🍕 » ; touche la puce et le tiroir s’ouvre direct sur 👧 Proposé par pour la placer pour de vrai.',
          en: 'When a child picks a recipe for an empty day (in the toddler kitchen), nothing gets scheduled on its own — it’s an IDEA, kept in the drawer. The empty day’s tile shows a small face and “Léa suggests 🍕”; tap the chip and the drawer opens straight on 👧 Suggested by to place it for real.',
        },
        why: {
          fr: 'Le geste de l’enfant devient visible tout de suite au lieu de disparaître dans une réserve qu’un parent ne pense pas à ouvrir — sans jamais lui laisser décider un vrai souper à sa place.',
          en: 'The child’s tap becomes visible right away instead of vanishing into a pool a parent doesn’t think to open — without ever letting the pick commit a real supper on its own.',
        },
      },
    ],
  },
  {
    id: 'routines',
    tour: 'routines',
    icon: 'smiley-bold',
    group: 'sections',
    title: { fr: 'Routines', en: 'Routines' },
    what: {
      fr: 'Des routines en cartes-images pour les enfants (matin, dodo…), lues à voix haute sur l’appareil. Un pré-lecteur peut la faire seul.',
      en: 'Picture-card routines for kids (morning, bedtime…), read aloud on the device. A pre-reader can run it alone.',
    },
    points: [
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Dans Routines, le ＋ ouvre le gestionnaire : créer une nouvelle routine, ou toucher une routine existante pour la modifier (les cartes, les images, les minuteries).',
          en: 'In Routines, ＋ opens the manager: create a new routine, or tap an existing one to edit it (its cards, pictures, timers).',
        },
      },
      {
        label: { fr: 'Une étape à la fois', en: 'One step at a time' },
        detail: {
          fr: 'Une grande carte « c’est l’heure de… », puis « ensuite ». L’enfant touche pour avancer.',
          en: 'One big “right now…” card, then “next”. The child taps to move forward.',
        },
        why: {
          fr: 'Une seule chose à voir à la fois, pour ne pas submerger un tout-petit.',
          en: 'One thing to see at a time, so it never overwhelms a small child.',
        },
      },
      {
        label: { fr: 'Lu à voix haute', en: 'Read aloud' },
        detail: {
          fr: 'L’appareil lit chaque étape.',
          en: 'The device speaks each step.',
        },
        why: {
          fr: 'Aucune lecture requise de l’enfant — un pré-lecteur fait sa routine seul.',
          en: 'No reading required from the child — a pre-reader runs the routine alone.',
        },
      },
      {
        label: { fr: 'Ta voix sur une carte', en: 'Your voice on a card' },
        detail: {
          fr: 'Sur chaque carte (Réglages ▸ Routines), touche 🎙️ pour t’enregistrer en train de la nommer. L’enfant entend ta voix au lieu de la voix de l’appareil; sans clip, ça revient à la lecture automatique.',
          en: 'On each card (Settings ▸ Routines), tap 🎙️ to record yourself naming it. The child hears your voice instead of the device’s; with no clip, it falls back to read-aloud.',
        },
        why: {
          fr: 'Une voix familière rassure un tout-petit. C’est optionnel et ça se réenregistre ou s’efface en un toucher.',
          en: 'A familiar voice reassures a small child. It’s optional and re-records or clears in one tap.',
        },
      },
      {
        label: { fr: 'Une photo sur une carte', en: 'A photo on a card' },
        detail: {
          fr: 'Sur chaque carte (Réglages ▸ Routines), touche 📷 pour ajouter une vraie photo — la vraie brosse à dents, le vrai crochet à manteau. L’enfant la voit à la place de l’émoji; sans photo, l’émoji reste.',
          en: 'On each card (Settings ▸ Routines), tap 📷 to add a real photo — the actual toothbrush, the actual coat hook. The child sees it instead of the emoji; with no photo, the emoji stays.',
        },
        why: {
          fr: 'Un pré-lecteur reconnaît la vraie chose plus vite qu’un dessin générique. C’est optionnel et ça se change ou s’efface en un toucher.',
          en: 'A pre-reader recognises the real thing faster than a generic glyph. It’s optional and changes or clears in one tap.',
        },
      },
      {
        label: { fr: 'Un compagnon de routine', en: 'A routine companion' },
        detail: {
          fr: 'Dans Réglages ▸ Membres, choisis une petite créature (renard, hibou, chat…) pour une personne. Elle lui tient compagnie pendant sa routine (touche-la pour l’entendre te parler) et fait un somme sur l’écran de veille. Touche celle qui est choisie pour l’enlever.',
          en: 'In Settings ▸ Members, pick a small creature (fox, owl, cat…) for a person. It keeps them company during their routine (tap it to hear it talk) and takes a nap on the screensaver. Tap the chosen one again to remove it.',
        },
        why: {
          fr: 'Une présence amicale, jamais une récompense : le compagnon suit seulement l’heure du jour (il somnole le soir) et ne parle que si on le touche — il ne juge pas la routine, ne compte rien, ne donne pas de points.',
          en: 'A friendly presence, never a reward: the companion only follows the time of day (it dozes in the evening) and only speaks when tapped — it never grades the routine, counts anything, or gives points.',
        },
      },
      {
        label: { fr: 'Le mur d’autocollants (optionnel)', en: 'The sticker wall (optional)' },
        detail: {
          fr: 'Si tu désactives le « Mode calme » (Réglages ▸ Système), un mur d’autocollants apparaît : en finissant une routine, l’enfant place un autocollant sur sa collection, qui se remplit avec le temps. Par défaut, en mode calme, il n’existe pas.',
          en: 'If you turn OFF “Calm mode” (Settings ▸ System), a sticker wall appears: on finishing a routine, the child places a sticker on their collection, which fills up over time. By default, in calm mode, it doesn’t exist.',
        },
        why: {
          fr: 'C’est une récompense volontaire : Babillard est calme et sans récompenses par défaut, mais une famille qui VEUT un carnet d’autocollants peut l’activer. Il reste par enfant, sans classement ni « t’es en retard ».',
          en: 'It’s an opt-in reward: Babillard is calm and reward-free by default, but a family that WANTS a sticker book can enable it. It stays per-child, with no ranking and no “you’re behind”.',
        },
      },
      {
        label: { fr: 'Regroupées par moment', en: 'Grouped by moment' },
        detail: {
          fr: 'L’aperçu des routines se regroupe par moment de la journée (matin, après-midi, dodo), et le moment actuel remonte en haut. Chaque carte montre un anneau du progrès d’aujourd’hui.',
          en: 'The routines overview groups by moment of day (morning, afternoon, bedtime), and the current moment floats to the top. Each card shows a ring of today’s progress.',
        },
        why: {
          fr: 'L’anneau se vide chaque nuit — c’est « où on est rendu aujourd’hui », jamais une série ni un score.',
          en: 'The ring empties every night — it’s “where things stand today”, never a streak or a score.',
        },
      },
      {
        label: { fr: 'Une minuterie sur une étape', en: 'A timer on a step' },
        detail: {
          fr: 'Sur chaque carte (Réglages ▸ Routines), touche ⏱ pour donner une durée à l’étape — par exemple 2 minutes pour brosser les dents. Pendant la routine, l’étape montre un anneau : l’enfant touche pour le partir, et un petit son joue à la fin. Touche encore pour changer la durée; ça se retire en un toucher.',
          en: 'On each card (Settings ▸ Routines), tap ⏱ to give the step a length — say 2 minutes for brushing teeth. During the routine the step shows a ring: the child taps to start it, and a soft sound plays when it’s done. Tap again to change the length; it clears in one tap.',
        },
        why: {
          fr: 'Pour les étapes qui durent un temps précis. La minuterie ne force jamais la suite et ne presse pas — c’est un repère calme, pas un chrono.',
          en: 'For steps that should last a set time. The timer never forces the next step and never nags — it’s a calm cue, not a stopwatch.',
        },
      },
      {
        label: { fr: 'Se fait sur n’importe quel appareil', en: 'Done on any device' },
        detail: {
          fr: 'La routine ne se fait plus seulement sur la tablette en mode tout-petit : sur l’onglet Routines, touche ▶ « Faire » (ou « Faire la routine » dans la fiche) pour la lancer depuis ton téléphone et la faire avec l’enfant, minuteries comprises.',
          en: 'A routine isn’t only run on the toddler kiosk anymore: on the Routines tab, tap ▶ “Do it” (or “Do the routine” in the card) to run it from your phone and do it with the child — timers and all.',
        },
        why: {
          fr: 'Le même déroulé, partout — pratique en déplacement ou pour accompagner l’enfant.',
          en: 'The same flow, everywhere — handy on the go or to walk a child through it.',
        },
      },
      {
        label: { fr: 'D’une recette à une routine', en: 'From a recipe to a routine' },
        detail: {
          fr: 'Touche une [[card:recipes|recette]] dans la cuisine pour ouvrir sa fiche, puis « En routine pour enfant » : chaque étape devient une carte-image (avec sa photo d’étape si elle en a une), et l’enfant « cuisine » la recette comme une routine lue à voix haute. On te demande encore pour qui — tu peux retoucher les cartes avant de garder.',
          en: 'Tap a [[card:recipes|recipe]] in the kitchen to open its card, then “Make a kid routine”: each step becomes a picture card (with its step photo when it has one), and the child “cooks” the recipe as a read-aloud routine. You’re still asked who it’s for — and you can tweak the cards before saving.',
        },
        why: {
          fr: 'Cuisiner avec un tout-petit, étape par étape en images, sans qu’il ait à lire — et sans remonter la recette à la main.',
          en: 'Cook with a small child, step by step in pictures, without them needing to read — and without rebuilding the recipe by hand.',
        },
      },
      {
        label: { fr: 'Pas de récompenses', en: 'No rewards' },
        detail: {
          fr: 'Aucun point, aucune étoile, aucune séquence à entretenir. Elle se termine, et c’est tout.',
          en: 'No points, no stars, no streak to keep alive. It ends, and that’s it.',
        },
        why: {
          fr: 'Pour que la routine reste une habitude tranquille, pas un jeu à courir.',
          en: 'So the routine stays a calm habit, not a game to chase.',
        },
      },
      {
        label: { fr: 'Se crée dans Réglages', en: 'Set up in Settings' },
        detail: {
          fr: 'Les étapes et les images se montent dans Réglages ▸ Routines.',
          en: 'Steps and pictures are built in Settings ▸ Routines.',
        },
      },
      {
        label: { fr: 'Va droit à l’enfant', en: 'Jumps to the child' },
        detail: {
          fr: 'Si l’appareil a un visage choisi, on saute le choix du nom et on ouvre direct sa routine; une seule routine se lance toute seule.',
          en: 'If the device has a picked face, it skips the name-picker and opens that child’s routine; a single routine auto-starts.',
        },
        why: {
          fr: 'Moins de touchers entre l’enfant et sa routine — pensé pour qu’il démarre seul.',
          en: 'Fewer taps between the child and their routine — built so they can start on their own.',
        },
      },
      {
        label: { fr: 'Un chrono qui monte', en: 'A count-up timer' },
        detail: {
          fr: 'Le temps s’additionne du début à la fin.',
          en: 'Time adds up from start to finish.',
        },
        why: {
          fr: 'Aucun compte à rebours, aucune pression, aucun score — le temps informe, il ne presse pas.',
          en: 'No countdown, no pressure, no score — time informs, it doesn’t rush.',
        },
      },
      {
        label: { fr: 'Tout se touche pour l’entendre', en: 'Tap anything to hear it' },
        detail: {
          fr: 'En vue enfant, toucher la météo, une note ou même le message vide le lit à voix haute. Les grandes tuiles demandent deux touchers (« tape encore pour… ») pour confirmer.',
          en: 'In kid view, tapping the weather, a note or even the empty message reads it aloud. Big tiles ask for two taps (“tap again to…”) to confirm.',
        },
        why: {
          fr: 'Pour qu’un pré-lecteur explore l’écran par l’oreille, sans déclencher une action par accident.',
          en: 'So a pre-reader can explore the screen by ear, without triggering an action by accident.',
        },
      },
    ],
  },
  {
    id: 'cercle',
    tour: 'cercle',
    icon: 'users-three-bold',
    group: 'sections',
    title: { fr: 'Le cercle', en: 'The circle' },
    what: {
      fr: 'Le carnet des proches : famille et amis, avec photo, fête, courriel et téléphone — pour reconstruire d’un coup d’œil qui est qui.',
      en: 'The directory of the people close to you: family and friends, with a photo, birthday, email and phone — to see who’s who at a glance.',
    },
    points: [
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Dans Le cercle, le ＋ ajoute : une personne, bâtir une famille, relier deux personnes, un groupe, un business (vétérinaire, plombier…), un animal, ou un carnet (maison, auto…).',
          en: 'In the Circle, ＋ adds: a person, build a family, connect two people, a group, a business (vet, plumber…), a pet, or a carnet (home, car…).',
        },
      },
      {
        label: { fr: 'Ta Maisonnée, ta famille', en: 'Your Household, your family' },
        detail: {
          fr: 'En haut du cercle, une seule carte « famille » regroupe tous les membres de ta maisonnée — et tes animaux. Son titre, c’est le nom que tu donnes à ta maisonnée dans Réglages — change-le là et il se met à jour ici. C’est ta famille de base : pas besoin de la bâtir à la main, et aucune copie en double ne s’ajoute en dessous. L’icône arbre sur la carte ouvre « Définir les liens » : dis qui est le parent, l’enfant, le frère ou la sœur de qui — sans créer de groupe.',
          en: 'At the top of the circle, a single “family” card gathers everyone in your household — and your pets. Its title is the name you give your household in Settings — change it there and it updates here. It’s your home family: no need to build it by hand, and no duplicate copy is added below. The tree icon on the card opens “Set relationships”: say who’s the parent, child, brother or sister of whom — without creating a group.',
        },
        why: {
          fr: 'Une seule famille — la tienne — au lieu de visages éparpillés en double.',
          en: 'One family — yours — instead of the same faces scattered twice.',
        },
      },
      {
        label: { fr: 'Une personne, une fiche', en: 'One person, one card' },
        detail: {
          fr: 'Touche le ＋ pour ajouter quelqu’un : prénom, photo, fête, courriel, téléphone, notes. Touche une fiche pour la voir, avec « Appeler » et « Écrire ».',
          en: 'Tap ＋ to add someone: name, photo, birthday, email, phone, notes. Tap a card to see it, with “Call” and “Email”.',
        },
      },
      {
        label: { fr: '« Joindre », en haut sur mobile', en: '“Reach out”, up top on mobile' },
        detail: {
          fr: 'Sur ton téléphone, une petite rangée « Joindre » attend en haut du cercle : les visages et les commerces qu’on appelle le plus souvent, un doigt suffit. Elle apprend de tes appels et courriels — plus tu joins quelqu’un, plus il monte — et avant ça, elle met de l’avant tes contacts marqués « urgence », les membres de ta maisonnée, puis tes commerces. Rien sur la tablette murale (elle est partagée) ni pour une gardienne.',
          en: 'On your phone, a small “Reach out” row waits at the top of the circle: the faces and businesses you call most, one tap away. It learns from your calls and emails — reach someone more, they rise higher — and before that, it leads with your “urgence”-tagged contacts, your household members, then your businesses. Nothing on the wall tablet (it’s shared) or for a babysitter.',
        },
        why: {
          fr: '« Appeler le dentiste » ne devrait pas être une chasse à trois onglets.',
          en: '“Call the dentist” shouldn’t be a hunt across three tabs.',
        },
      },
      {
        label: { fr: 'Des liens entre les gens', en: 'Links between people' },
        detail: {
          fr: 'Dis « X est le parent de Y » dans une phrase à compléter : le lien inverse s’ajoute tout seul (Y devient l’enfant de X), et les familles se regroupent d’elles-mêmes. Mieux : les liens se propagent. Marque deux personnes comme frère et sœur, puis relie un seul grand-parent (ou un parent) à l’une d’elles — l’autre l’obtient aussi. Les grands-parents, oncles/tantes et cousins se déduisent tout seuls. Pas besoin de relier chaque paire ni de tout accrocher à une seule personne. Tes propres membres de la maisonnée comptent comme des personnes — relie-les depuis Réglages ▸ Membres. Les amis aussi : « Meilleur·e ami·e » marque la personne principale d’un membre — ton ami d’enfance relié à toi en « meilleur ami » peut aussi être relié à ta blonde en « ami », et chaque point de vue (la loupe « vu par ») le lit comme il faut.',
          en: 'Say “X is Y’s parent” in a fill-in sentence: the reverse link is added for you (Y becomes X’s child), and families group themselves. Better: links propagate. Mark two people as siblings, then link a single grandparent (or a parent) to just one of them — the other gets it too. Grandparents, aunts/uncles and cousins are inferred for you. No need to link every pair, or to hang everything off one person. Your own household members count as people too — link them from Settings ▸ Members. Friends too: “Best friend” marks a member’s principal one — your childhood friend linked to you as “best friend” can also be linked to your partner as “friend”, and each perspective (the “seen from” lens) reads it right.',
        },
        why: {
          fr: 'Relie le minimum ; l’appli déduit le reste de la famille — un lien ajouté à un endroit profite à toute la fratrie.',
          en: 'Link the minimum; the app infers the rest of the family — a tie added in one place reaches the whole set of siblings.',
        },
      },
      {
        label: { fr: 'Bâtir une famille d’un coup', en: 'Build a family at once' },
        detail: {
          fr: 'Sous la liste, « Bâtir une famille » ouvre un bâtisseur : nomme la famille, ajoute les personnes, puis choisis un mode. Tu peux aussi partir d’une personne — touche sa fiche, puis « Bâtir sa famille » : le bâtisseur s’ouvre déjà avec elle. Cherche quelqu’un par son prénom OU son nom de famille. En Cases, glisse chaque visage dans une rangée (Grands-parents, Parents, Enfants) et les liens se créent tout seuls : parents ↔ enfants, frères et sœurs, conjoint·e·s, grands-parents. En Liste, dis simplement « chacun est [lien] de » une personne pivot. Rouvre une famille (l’icône arbre) pour l’agrandir plus tard.',
          en: 'Under the list, “Build a family” opens a builder: name the family, add the people, then pick a mode. You can also start from a person — tap their card, then “Build their family”: the builder opens already holding them. Search someone by their first name OR last name. In Boxes, drag each face into a row (Grandparents, Parents, Children) and the links build themselves: parents ↔ children, siblings, partners, grandparents. In List, just say “everyone is [relation] of” one anchor person. Reopen a family (the tree icon) to extend it later.',
        },
        why: {
          fr: 'Définir une famille entière d’un coup, au lieu d’un lien à la fois.',
          en: 'Define a whole family in one pass instead of one link at a time.',
        },
      },
      {
        label: { fr: 'Relier deux familles', en: 'Connect two families' },
        detail: {
          fr: '« Relier deux personnes » (sous la liste) joint deux familles d’un seul lien : choisis une personne de chaque côté, dis comment elles sont liées, et c’est tout. Comme les liens se propagent, ce point de jonction unique suffit — pas besoin de tout relier à la main.',
          en: '“Connect two people” (under the list) joins two families with a single link: pick a person on each side, say how they’re related, and that’s it. Because links propagate, that one junction is enough — no need to wire everything by hand.',
        },
        why: {
          fr: 'Rattacher la belle-famille ou un nouveau conjoint sans tout ressaisir.',
          en: 'Attach the in-laws or a new partner without re-entering everything.',
        },
      },
      {
        label: { fr: 'Partager une famille', en: 'Share a family' },
        detail: {
          fr: 'Sur une carte « famille » (ta Maisonnée ou un groupe famille), l’icône de lien crée un lien de partage — envoie-le, ou fais-le scanner, à un proche qui a son propre Babillard. En l’ouvrant, il voit qui est dans la famille (avec les liens, les animaux et les photos), choisit qui ajouter à SON cercle, et confirme. C’est une copie : rien n’est partagé en direct, et chacun garde sa propre version. Pour recevoir : le ＋ ▸ « Ajouter une famille » (ou le lien reçu). Un lien expire de lui-même après 30 jours, et tu peux le retirer avant depuis « Familles partagées ».',
          en: 'On a “family” card (your Household or a family group), the link icon creates a share link — send it, or have it scanned, to a relative who has their own Babillard. Opening it, they see who’s in the family (with the relationships, pets and photos), pick who to add to THEIR circle, and confirm. It’s a copy: nothing is shared live, and each side keeps its own version. To receive one: ＋ ▸ “Add a family” (or the link you were sent). A link expires on its own after 30 days, and you can remove it earlier from “Shared families”.',
        },
        why: {
          fr: 'Donner la moitié de la famille au reste de la famille — sans que chacun la retape.',
          en: 'Hand half the family to the other half — without everyone re-typing it.',
        },
      },
      {
        label: { fr: 'Trois vues : Liste, Liens, Arbre', en: 'Three views: List, Links, Tree' },
        detail: {
          fr: 'Bascule en haut du cercle : Liste (le répertoire, regroupé par famille), Liens (touche un visage, ses liens s’affichent autour — touche un autre pour recentrer) et Arbre (les générations, les couples côte à côte). Sous la bascule, la rangée de visages te laisse choisir une personne : tout se relit alors de SON point de vue (la fiche de chacun affiche son lien avec elle — « Fille », « Cousin »…), et la vue Liens se centre sur elle. Reviens à « Maisonnée » pour la vue normale. Dans l’onglet Social, Liens et Arbre montrent plutôt TOUT le réseau d’un coup, pas une seule personne : Liens dessine chaque cercle d’amis dans sa propre bulle, et Arbre les réunit tous en un seul nuage relié. Pince ou utilise + / − pour zoomer.',
          en: 'Switch at the top of the circle: List (the directory, grouped by family), Links (tap a face, their ties fan out — tap another to re-center) and Tree (generations, couples side by side). Under the switch, the face row lets you pick a person: everything is then read from THEIR perspective (each card shows its tie to them — “Daughter”, “Cousin”…), and the Links view centers on them. Back to “Household” for the normal view. In the Social tab, Links and Tree instead show the WHOLE web at once, not one person: Links draws each circle of friends in its own bubble, and Tree gathers them all into a single connected cloud. Pinch or use + / − to zoom.',
        },
      },
      {
        label: { fr: 'Notre monde : la vue d’ensemble', en: 'Our world: the big picture' },
        detail: {
          fr: 'Les trois vues zooment sur une personne ou une famille; « Notre monde » fait le contraire — il prend de la hauteur. Touche « Voir notre monde » : ta Maisonnée s’affiche au centre, et tout autour, chaque famille et chaque groupe forme une île de couleur avec ses visages dedans. Un trait relie deux îles dès qu’une personne les rattache — ton ami à sa propre famille, ta maisonnée à la parenté. Tout se touche et se dit à voix haute : touche une île pour entendre son nom et qui s’y trouve, un visage pour son prénom, un trait pour savoir qui relie quoi. Et « Raconte-moi » fait le tour tout seul, île par île puis les liens — une petite histoire de notre monde, parfaite pour un enfant. Pince ou + / − pour explorer; le ✕ ferme. C’est fait pour COMPRENDRE l’ensemble : pour modifier, retourne dans le cercle.',
          en: 'The three views zoom IN on one person or family; “Our world” does the opposite — it pulls back. Tap “See our world”: your Household sits at the centre, and all around it each family and group is a coloured island with its faces inside. A line joins two islands wherever a person ties them together — your friend to his own family, your household to your kin. Everything taps and speaks: tap an island to hear its name and who’s in it, a face for their name, a line to hear who connects what. And “Tell me about us” takes the tour on its own, island by island then the bridges — a little story of our world, perfect for a child. Pinch or + / − to explore; ✕ closes. It’s built to UNDERSTAND the whole — to edit, go back into the circle.',
        },
        why: {
          fr: 'Voir d’un coup comment toutes les familles et tous les groupes s’emboîtent — pas juste une personne à la fois.',
          en: 'See at a glance how all the families and groups fit together — not just one person at a time.',
        },
      },
      {
        label: { fr: 'Groupes, adresse et photos', en: 'Groups, address and photos' },
        detail: {
          fr: 'Crée un groupe nommé (Famille Tremblay, Collègues…) avec son type et sa couleur, puis touche le crayon sur l’en-tête d’un groupe pour le renommer ou le recolorer. Range quelqu’un dedans en touchant sa fiche : les pastilles de groupes sont des boutons — touche pour l’ajouter, retouche pour le retirer. Pour supprimer n’importe quel groupe — même un vide ou un qui n’apparaît pas dans le répertoire — va dans Réglages ▸ Le cercle : ils y sont tous, avec un bouton supprimer; les personnes restent dans le cercle. Sur une fiche tu ajoutes aussi son adresse (un bouton « Itinéraire » ouvre la carte) et des photos avec légende, et « Exporter (vCard) » télécharge la personne pour l’ajouter à n’importe quel téléphone. À l’inverse, sur une NOUVELLE fiche, « Importer un .vcf » lit un fichier de contacts exporté d’un téléphone : un seul contact pré-remplit la fiche, et un fichier qui en contient plusieurs les ajoute tous d’un coup. Dans la liste, les icônes 📞 et ✉ appellent ou écrivent directement, sans ouvrir la fiche. Cherche quelqu’un par prénom OU nom de famille.',
          en: 'Create a named group (Tremblay family, Coworkers…) with its kind and colour, then tap the pencil on a group’s header to rename or recolour it. Drop someone in by tapping their card: the group chips are buttons — tap to add, tap again to remove. To delete any group — even an empty one or one that doesn’t show in the directory — go to Settings ▸ The circle: they’re all listed there with a delete button; the people stay in the circle. On a card you can also add their address (a “Directions” button opens the map) and photos with a caption, and “Export (vCard)” downloads the person to drop into any phone. The other way round, on a NEW card, “Import a .vcf” reads a contacts file exported from a phone: a single contact prefills the card, and a file holding many adds them all at once. In the list, the 📞 and ✉ icons call or write directly, without opening the card. Search someone by first name OR last name.',
        },
        why: {
          fr: 'Tout ce qu’on garde sur un proche au même endroit, sans appli de contacts en plus.',
          en: 'Everything you keep about someone in one place, without a separate contacts app.',
        },
      },
      {
        label: { fr: 'Les fêtes, en douceur', en: 'Birthdays, gently' },
        detail: {
          fr: 'Les anniversaires à venir apparaissent sur le babillard, et automatiquement dans le calendrier et l’agenda (un petit gâteau 🎂 le jour même) — tirés de la date de fête de chaque personne, sans rien créer. Touche-en un pour voir sa fiche — et tes 🎁 idées-cadeaux pour cette personne s’y affichent, ce que tu avais noté en mars te revient pile au bon moment. Jamais de notification.',
          en: 'Upcoming birthdays show on the board, and automatically in the calendar and agenda (a little cake 🎂 on the day) — pulled from each person’s birthday, nothing to create. Tap one to see their card — and your 🎁 gift ideas for that person show right there, so what you jotted in March comes back exactly when it helps. Never a notification.',
        },
        why: {
          fr: 'Un rappel calme, pas une alerte de plus à gérer.',
          en: 'A calm heads-up, not one more alert to manage.',
        },
      },
      {
        label: { fr: 'Vue enfant « Qui est-ce ? »', en: 'Kid view “Who is this?”' },
        detail: {
          fr: 'En vue enfant, les visages deviennent de grandes cartes : l’enfant touche une photo et entend le nom à voix haute.',
          en: 'In kid view, the faces become big cards: the child taps a photo and hears the name read aloud.',
        },
        why: {
          fr: 'Pour qu’un tout-petit apprenne à reconnaître grand-maman, mononcle, la gardienne.',
          en: 'So a small child learns to recognise grandma, uncle, the babysitter.',
        },
      },
      {
        label: { fr: 'Social / Famille + les notes', en: 'Social / Family + the notes' },
        detail: {
          fr: 'En haut du cercle, deux onglets : Famille (ta Maisonnée et ta parenté — tous ceux qui te sont reliés par un lien de famille) et Social (tes amis, collègues, voisins… ET leurs propres familles). La règle est simple : quelqu’un n’arrive dans Famille que s’il est relié à ta maisonnée par des liens de famille; un ami est relié par un lien social, donc lui, ses enfants et son animal restent dans le Social, regroupés sous une carte « Famille de … ». Ton ami reste le lien important, et tu n’hérites jamais d’un lien direct avec ses enfants. Et tu bâtis la famille d’un ami avec les mêmes outils que la tienne (liens, bâtisseur, « Compléter les familles ») — ils marchent dans les deux onglets. Sous Famille, « Notes & recommandations » : des notes rapides, façon iOS, pour toi ou pour toute la Maisonnée. Choisis un visage pour voir tes notes personnelles ET celles de la Maisonnée; choisis « Maisonnée » pour ne voir que celles de la famille. Le visage choisi décide aussi où la note se range — un visage = une note perso, « Maisonnée » = une note pour toute la famille (pas de bascule à régler). « Nouvelle note » (ou le crayon pour en modifier une) ouvre un éditeur plein écran, façon Notes d’iOS : donne-lui un titre (facultatif), puis écris avec la barre de mise en forme — gras, italique, barré, titres, listes à puces, listes numérotées, cases à cocher et citations. Tu peux y joindre une photo ou un dessin, ou enregistrer un mémo vocal rapide — et tout (titre + texte) se retrouve dans la recherche. Pas de bouton « Enregistrer » : ça se sauve tout seul en fermant. Une note un peu longue ? Touche-la pour la déplier et la lire au complet sur place (touche encore pour la replier) — plusieurs notes peuvent rester dépliées en même temps — et coche une case directement depuis la liste. Tiens la poignée ⠿ pour replacer une note dans l’ordre qui te convient. Les mêmes notes s’affichent aussi sur le babillard (la carte « Notes (cercle) ») selon le visage choisi en haut — masque ou replace la carte dans Réglages ▸ Affichage ▸ Disposition.',
          en: 'At the top of the circle, two tabs: Family (your Household and your kin — everyone tied to you by a family link) and Social (your friends, coworkers, neighbours… AND their own families). The rule is simple: someone lands in Family only if they’re tied to your household by family links; a friend is tied by a social link, so the friend, their kids and their pet stay in Social, gathered under a “Family of …” card. Your friend stays the important link, and you never inherit a direct tie to their kids. And you build a friend’s family with the same tools as your own (links, the builder, “Complete the families”) — they work in both tabs. Under Family, “Notes & recommendations”: quick, iOS-style notes for you or for the whole Household. Pick a face to see your personal notes AND the Household’s; pick “Household” to see only the family ones. The picked face also decides where the note lands — a face = a personal note, “Household” = a note for the whole family (no toggle to set). “New note” (or the pencil to edit one) opens a full-screen, iOS-Notes-style editor: give it a title (optional), then write with the formatting bar — bold, italic, strikethrough, headings, bulleted lists, numbered lists, checklists and quotes. Attach a photo or a drawing, or record a quick voice memo — and everything (title + text) turns up in search. No “Save” button: it saves itself when you close. A longish note? Tap it to expand and read it in full right there (tap again to collapse) — several notes can stay open at once — and tick a checkbox straight from the list. Hold the ⠿ grip to drag a note into the order you like. The same notes also show on the board (the “Notes (circle)” card) for the picked face — hide or move the card in Settings ▸ Display ▸ Layout.',
        },
        why: {
          fr: 'Un carnet calme par personne et pour la famille, au même endroit que les proches.',
          en: 'A calm notebook per person and for the family, right where the people live.',
        },
      },
      {
        label: { fr: 'Business : tes services & rendez-vous', en: 'Business: your services & rendez-vous' },
        detail: {
          fr: 'Un 4e onglet, « Business » : ton carnet de commerces et services — vétérinaire, hôpital, dentiste, plombier, garderie, le gars qui répare la maison… Ajoute-le avec sa catégorie, son téléphone, son courriel, son adresse, des notes et même la photo de sa carte d’affaires. Touche-le pour l’appeler, lui écrire ou ouvrir l’itinéraire d’un coup. C’est volontairement à part de la famille et des amis : un business n’entre jamais dans tes liens, tes familles ni l’arbre. Et quand tu crées un rendez-vous, tu peux le relier à un business (ou à une personne) — « rendez-vous chez le vét » montre alors avec qui, sur le babillard et dans la journée. Si tu l’as inscrit comme installateur dans le carnet d’une chose, sa fiche affiche aussi « A servi : 🔥 Chauffe-eau » — tu retrouves qui a fait quoi.',
          en: 'A 4th tab, “Business”: your directory of businesses and services — vet, hospital, dentist, plumber, daycare, the person who fixes the house… Add it with its category, phone, email, address, notes and even a photo of its business card. Tap it to call, write or open directions in one go. It’s deliberately separate from family and friends: a business never enters your links, families or the tree. And when you create a rendez-vous, you can link it to a business (or a person) — “vet appointment” then shows who it’s with, on the board and in the day. If you logged it as the installer in a thing’s carnet, its card also shows “Serviced: 🔥 Water heater” — so you can see who did what.',
        },
        why: {
          fr: 'Les numéros utiles et les rendez-vous au même endroit que le reste de la maison — sans mêler ça à la famille.',
          en: 'The useful numbers and appointments in the same place as the rest of the home — without mixing it into family.',
        },
      },
      {
        label: { fr: 'Les animaux de la maisonnée', en: 'Your household pets' },
        detail: {
          fr: 'Ajoute tes animaux comme des fiches dans Le cercle (tuile ＋ « Ajouter un animal », ou Réglages ▸ Le cercle ▸ La maisonnée) : espèce, race, anniversaire, numéro de micropuce, horaire des repas, consignes pour la gardienne, un petit suivi du poids, et le vétérinaire — choisi parmi tes Business. Choisis aussi le ou les propriétaires : un membre de la maisonnée → l’animal apparaît dans la carte Maisonnée, avec la famille; un ami → l’animal le suit dans le Social. Pas de propriétaire = à la maisonnée. Un animal peut faire partie d’une famille, mais n’entre jamais dans les liens parent/enfant (ton chien ne deviendra pas grand-père).',
          en: 'Add your pets as cards in the circle (the ＋ “Add a pet” tile, or Settings ▸ The circle ▸ Household): species, breed, birthday, microchip number, feeding schedule, sitter instructions, a small weight log, and the vet — picked from your Businesses. Also pick the owner(s): a household member → the pet shows in the Maisonnée card with the family; a friend → the pet follows them into Social. No owner = the household’s. A pet can belong to a family, but never enters the parent/child links (your dog won’t become a grandparent).',
        },
        why: {
          fr: 'Tes animaux avec ta famille, celui d’un ami avec lui — et tout ce qu’une gardienne ou le vét doit savoir au même endroit.',
          en: 'Your pets with your family, a friend’s with them — and everything a sitter or the vet needs in one place.',
        },
      },
      {
        label: { fr: 'Compléter les familles d’un bouton', en: 'Complete the families in one tap' },
        detail: {
          fr: 'Mets des gens dans un groupe « famille », puis touche « Compléter les familles » : à partir des liens que tu as déjà, on déduit les liens manquants (deux enfants d’un même parent sont frères/sœurs, le parent d’un parent est un grand-parent…) et on relie le reste comme « membre de la famille ». Rien n’est ajouté sans toi : tu vois la liste, tu coches ce que tu gardes, puis tu appliques — exactement comme l’import d’un fichier de contacts.',
          en: 'Put people in a “family” group, then tap “Complete the families”: from the links you already have, we infer the missing ones (two children of one parent are siblings, a parent’s parent is a grandparent…) and tie the rest together as “family member”. Nothing is added without you: you see the list, tick what to keep, then apply — exactly like importing a contacts file.',
        },
        why: {
          fr: 'Personne que tu as regroupé ne reste isolé — la famille se complète sans tout dessiner à la main.',
          en: 'No one you grouped stays disconnected — the family fills itself in without drawing every link by hand.',
        },
      },
      // ⚠ APPEND-ONLY: help entries (operatorHelp houseDiary) deep-link points
      // BY INDEX — this diary point is 16; add new points BELOW, never above.
      {
        label: { fr: 'La maison cette année', en: 'The home this year' },
        detail: {
          fr: 'Dans Réglages ▸ Le cercle ▸ Cette année, la maison relit son année, mois par mois : les soins notés aux carnets, les corvées faites, les voyages terminés, les dessins gardés. Le mois courant se lit d’un coup; les mois passés se déplient un à un. Des noms, des visages et des dates — jamais des comptes, jamais un fil. Et rien à tenir : ça s’écrit tout seul, au fil des gestes.',
          en: 'In Settings ▸ The circle ▸ This year, the home rereads its year, month by month: the care noted in the carnets, the chores done, the trips taken, the drawings kept. The current month reads at a glance; past months unfold one at a time. Names, faces and dates — never counts, never a feed. And nothing to maintain: it writes itself as life happens.',
        },
        why: {
          fr: 'Ouvrir l’album de l’année comme on feuillette un carnet — pas une notification, pas un palmarès.',
          en: 'Open the year’s album like leafing through a notebook — not a notification, not a leaderboard.',
        },
      },
    ],
  },
  {
    id: 'liste',
    tour: 'liste',
    icon: 'sparkle-bold',
    group: 'sections',
    title: { fr: 'La liste', en: 'The list' },
    what: {
      fr: 'Une seule liste partagée et active (l’épicerie, le plus souvent). Tout le monde la voit et l’ajoute, sur tous les appareils.',
      en: 'One single shared, active list (groceries, usually). Everyone sees it and adds to it, on every device.',
    },
    points: [
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Dans La liste, le ＋ ajoute : un article à la liste, l’ajout rapide (plusieurs d’un coup), parcourir les circulaires, « choisir les meilleurs » rabais, ou partager la liste.',
          en: 'In the List, ＋ adds: an item, quick-add (several at once), browse the flyers, “pick the best” deals, or share the list.',
        },
      },
      {
        label: { fr: 'Cocher en place', en: 'Check in place' },
        detail: {
          fr: 'Coche un article et il se marque fait, sans bouger. Pas de « tablette des faits », pas de modes.',
          en: 'Check an item and it marks done, in place. No “done shelf”, no modes.',
        },
        why: {
          fr: 'Pour que la liste reste simple à lire en magasin.',
          en: 'So the list stays simple to read in the store.',
        },
      },
      {
        label: { fr: 'Vider les cochés', en: 'Clear checked' },
        detail: {
          fr: 'Un bouton enlève tout ce qui est coché d’un coup.',
          en: 'One button removes everything checked at once.',
        },
        why: {
          fr: 'Et il le retient pour l’ajout rapide la prochaine fois — re-remplir va plus vite.',
          en: 'And it remembers it for quick-add next time — restocking goes faster.',
        },
      },
      {
        label: { fr: 'Pas pressé', en: 'No rush' },
        detail: {
          fr: 'Touche le nom d’un article déjà sur la liste, puis active « Pas pressé ». La ligne se met en gris pâle, encadrée d’un pointillé, et descend au bas de la liste — on la prend si une belle aubaine passe, sinon on l’oublie. Les nouveaux articles et le tri « Par allée » la laissent en bas ; si tu la remontes toi-même dans « Mon ordre », elle y reste. Retouche l’interrupteur pour l’enlever.',
          en: 'Tap the name of an item already on the list, then switch on “No rush”. The line goes pale grey with a dashed edge and sinks to the bottom — we grab it if a good deal comes up, otherwise we let it go. New items and the “By aisle” sort keep it down there; if you drag it back up in “My order”, it stays where you put it. Tap the switch again to undo it.',
        },
        why: {
          fr: 'Pour que l’œil saute d’un coup tout ce qui n’est pas une vraie commission. Un article ajouté presse toujours : rien à choisir, sauf ce cas rare. Ce n’est pas un rang ni une priorité.',
          en: 'So the eye skips everything that isn’t a real errand in one go. An added item is always an errand — nothing to choose, except in this rare case. It’s not a rank or a priority.',
        },
      },
      {
        label: { fr: 'Ajout rapide', en: 'Quick add' },
        detail: {
          fr: 'Re-remplis une semaine en quelques touches à partir de ce que tu achètes souvent. En haut, le groupe [[icon:push-pin-bold]] « Toujours » garde tes essentiels permanents (lait, pain…) à un tap, peu importe la date. Une suggestion qui ne sert plus ? Glisse-la vers la gauche pour la retirer — avec un « Annuler » au cas où (comme sur La liste, sans passer par Réglages).',
          en: 'Restock a week in a few taps from what you buy often. At the top, the [[icon:push-pin-bold]] “Always” group keeps your permanent staples (milk, bread…) one tap away, whatever the date. A suggestion you no longer want? Swipe it left to remove it — with an “Undo” just in case (just like La liste, no trip to Settings).',
        },
        why: {
          fr: 'Pour ne pas retaper chaque semaine les mêmes essentiels. « Toujours » ne s’ajoute jamais tout seul — la liste se vide et reste vide; c’est toi qui touches. Épingle un item depuis Réglages ▸ Courses.',
          en: 'So you don’t retype the same staples every week. “Always” never adds on its own — the list empties and stays empty; you tap. Pin an item from Settings ▸ Shopping.',
        },
      },
      {
        label: { fr: 'Chercher dans la circulaire', en: 'Search the flyer' },
        detail: {
          fr: 'La petite loupe [[icon:magnifying-glass-bold]] à côté d’« Ajouter » ouvre les [[card:flyers|circulaires]] de la semaine pour chercher un article en aubaine.',
          en: 'The small magnifier [[icon:magnifying-glass-bold]] beside “Add” opens this week’s [[card:flyers|flyers]] to search an item on sale.',
        },
        why: {
          fr: 'Un raccourci d’un geste vers une action fréquente, sans passer par le bouton ＋.',
          en: 'A one-tap shortcut to a frequent move, without going through the ＋ button.',
        },
      },
      {
        label: { fr: 'Parler ta liste', en: 'Speak your list' },
        detail: {
          fr: 'Touche le micro et nomme tes articles; le micro reste ouvert. Une phrase comme « lait, œufs pis pain » se découpe en trois articles.',
          en: 'Tap the mic and name your items; the mic stays open. A phrase like “milk, eggs and bread” splits into three items.',
        },
        why: {
          fr: 'Pour vider ta tête à voix haute, les mains prises, sans taper article par article.',
          en: 'To empty your head out loud, hands full, without typing item by item.',
        },
      },
      {
        label: { fr: 'Images d’articles', en: 'Item pictures' },
        detail: {
          fr: 'Chaque article montre une petite image (lait, pain, pomme).',
          en: 'Each item shows a small picture (milk, bread, apple).',
        },
        why: {
          fr: 'Repérable d’un coup d’œil, sans lire — utile en magasin et pour un enfant.',
          en: 'Spottable at a glance, no reading — handy in-store and for a child.',
        },
      },
      {
        label: { fr: 'Qui l’a ajouté', en: 'Who added it' },
        detail: {
          fr: 'Une pastille de couleur indique qui a ajouté l’article (selon le visage choisi sur l’appareil).',
          en: 'A colour dot shows who added the item (based on the face picked on that device).',
        },
        why: {
          fr: 'Pour savoir à qui poser la question quand un article est mystérieux.',
          en: 'So you know who to ask when an item is a mystery.',
        },
      },
      {
        label: { fr: 'Synonymes de recherche', en: 'Search synonyms' },
        detail: {
          fr: 'Modifie un article pour lui ajouter des synonymes (ex. œuf, œufs, egg). Ils survivent à un re-ajout.',
          en: 'Edit an item to add synonyms (e.g. egg, eggs, œuf). They survive a re-add.',
        },
        why: {
          fr: 'Les [[card:deals|rabais]] se trouvent mieux quand le nom de l’article colle à celui de la circulaire.',
          en: '[[card:deals|Deals]] match better when the item’s name lines up with the flyer’s wording.',
        },
      },
      {
        label: { fr: 'Choisir les meilleurs prix', en: 'Pick the best prices' },
        detail: {
          fr: 'Un bouton [[icon:sparkle-bold]] trouve le meilleur rabais (au prix unitaire) pour chaque article non coché et t’amène au [[card:cashier|mode caissier]].',
          en: 'A [[icon:sparkle-bold]] button finds the best deal (by unit price) for every unchecked item and takes you to [[card:cashier|cashier mode]].',
        },
        why: {
          fr: 'Pour comparer à ta place — le vrai meilleur prix par unité, pas juste le plus gros chiffre barré.',
          en: 'To compare for you — the true best price per unit, not just the biggest crossed-out number.',
        },
      },
      {
        label: { fr: 'Filet de sécurité (annuler)', en: 'Safety net (undo)' },
        detail: {
          fr: '« Vider les cochés » attend ~5 s derrière un bandeau « Annuler ».',
          en: '“Clear checked” waits ~5 s behind an “Undo” toast.',
        },
        why: {
          fr: 'Un faux pas ne coûte rien (voir [[card:undo|Annuler]]).',
          en: 'A mis-tap costs nothing (see [[card:undo|Undo]]).',
        },
      },
      {
        label: { fr: 'Trier par allée', en: 'Sort by aisle' },
        detail: {
          fr: 'En haut de la liste, bascule sur « Par allée » : tes articles se regroupent et se trient dans l’ordre de TON magasin (fruits → pain → viande → lait…). Tu règles cet ordre une seule fois dans [[card:settings|Réglages]] ▸ Magasinage en glissant les allées. Un article rangé dans la mauvaise allée ? Ouvre-le et choisis son allée — c’est gardé pour la prochaine fois. Tu préfères ton propre ordre ? Reste sur « Mon ordre » et glisse les articles à la main; « Ranger par allée » part de l’ordre des allées, que tu peux ensuite ajuster.',
          en: 'At the top of the list, flip to “By aisle”: your items group and sort in YOUR store’s order (produce → bread → meat → milk…). You set that order once in [[card:settings|Settings]] ▸ Shopping by dragging the aisles. An item in the wrong aisle? Open it and pick its aisle — it’s kept for next time. Prefer your own order? Stay on “My order” and drag items by hand; “Arrange by aisle” seeds it from the aisle order, which you can then tweak.',
        },
        why: {
          fr: 'Pour suivre ton parcours en magasin sans revenir sur tes pas — et sans jamais rien compter (juste un regroupement).',
          en: 'To follow your walk through the store without backtracking — and never counting anything (just grouping).',
        },
      },
    ],
  },
  {
    id: 'settings',
    icon: 'gear-six-bold',
    group: 'sections',
    title: { fr: 'Réglages', en: 'Settings' },
    what: {
      fr: 'Le poste de pilotage du parent : les personnes, les appareils, les corvées, les routines, l’affichage. Ce que tu montes ici alimente le babillard et la vue enfant. Réservé à l’opérateur (pas la tablette).',
      en: 'The parent’s control panel: people, devices, chores, routines, display. What you set up here feeds the board and the kid view. Operator-only (not the tablet).',
    },
    points: [
      {
        label: { fr: 'Maisonnée', en: 'Household' },
        detail: {
          fr: 'Ajoute les membres de la famille, leur couleur et leur photo.',
          en: 'Add the family members, their colour and photo.',
        },
        why: {
          fr: 'C’est ce qui peuple les visages et les agendas partout dans l’app.',
          en: 'It’s what populates the faces and agendas everywhere in the app.',
        },
      },
      {
        label: { fr: 'Appareils', en: 'Devices' },
        detail: {
          fr: 'Approuve une tablette qui demande à se jumeler, et retire-la quand tu veux (voir Jumelage).',
          en: 'Approve a tablet asking to pair, and remove it whenever you like (see Pairing).',
        },
        why: {
          fr: 'C’est ce qui laisse une tablette au mur voir le babillard, sans lui confier ton mot de passe.',
          en: 'It’s what lets a wall tablet see the board, without trusting it with your password.',
        },
      },
      {
        label: { fr: 'Corvées & routines', en: 'Chores & routines' },
        detail: {
          fr: 'Monte la rotation des corvées et les étapes des routines d’enfants ici.',
          en: 'Build the chore rotation and the kid routine steps here.',
        },
        why: {
          fr: 'Monté ici une fois, ça tourne ensuite tout seul — sur le babillard et dans la vue enfant.',
          en: 'Set up here once, it then runs on its own — on the board and in the kid view.',
        },
      },
      {
        label: { fr: 'Réservé au parent', en: 'Parent-only' },
        detail: {
          fr: 'Une tablette ou la vue enfant ne peuvent pas ouvrir Réglages — exprès.',
          en: 'A tablet or the kid view can’t open Settings — on purpose.',
        },
        why: {
          fr: 'Pour qu’un appareil partagé ou un tout-petit ne touche pas aux membres, au jumelage ou au compte.',
          en: 'So a shared device or a toddler can’t touch members, pairing or the account.',
        },
      },
    ],
  },

  // ── Key concepts (cross-cutting) ──────────────────────────────────────────
  {
    id: 'ai',
    icon: 'sparkle-bold',
    group: 'concepts',
    title: { fr: 'L’intelligence (l’IA)', en: 'The AI' },
    what: {
      fr: 'L’IA donne un coup de main à quelques endroits — toujours sur demande, jamais en arrière-plan. Le picto [[icon:sparkle-bold]] est le signe qu’une fonction utilise l’IA. Tu peux la couper : tout continue de marcher sans elle.',
      en: 'AI lends a hand in a few spots — always on demand, never in the background. The [[icon:sparkle-bold]] glyph marks a feature that uses AI. You can turn it off: everything keeps working without it.',
    },
    points: [
      {
        label: { fr: 'Où l’IA aide', en: 'Where AI helps' },
        detail: {
          fr: 'Six endroits, pas plus : la [[card:capture|capture]] (le ＋ devine si ta note est un événement, une tâche, un article…), l’import d’une [[card:recipes|recette]] (depuis une photo ou un collé-copié), le bilan de la semaine, les suggestions de souper, « Demander à l’IA » dans la recherche, et [[card:ask|« Demande à la maison »]] (le micro à voix haute). Partout ailleurs, aucune IA.',
          en: 'Six spots, no more: [[card:capture|capture]] (the ＋ guesses whether your note is an event, a task, an item…), [[card:recipes|recipe]] import (from a photo or a paste), the weekly recap, supper suggestions, “Ask the AI” in search, and [[card:ask|“Ask the household”]] (the spoken mic). Everywhere else, no AI.',
        },
        why: {
          fr: 'Savoir exactement quand l’IA entre en jeu — et quand elle n’y est pas du tout.',
          en: 'To know exactly when AI is involved — and when it isn’t at all.',
        },
      },
      {
        label: { fr: 'Ce qu’elle envoie', en: 'What it sends' },
        detail: {
          fr: 'Seulement ce qu’il faut pour la tâche, et seulement quand TU touches le bouton : le texte que tu écris (capture, question), la photo d’une recette, ou un court résumé daté de tes propres données (soupers, événements, liste, corvées) pour répondre à une question. C’est traité par Cloudflare Workers AI, puis oublié — jamais en continu, jamais sans ton geste.',
          en: 'Only what the task needs, and only when YOU tap the button: the text you type (capture, a question), a recipe photo, or a short dated summary of your own data (suppers, events, list, chores) to answer a question. It’s processed by Cloudflare Workers AI, then dropped — never continuously, never without your action.',
        },
        why: {
          fr: 'Pour que rien de ta maisonnée ne quitte l’appareil sans que tu l’aies déclenché.',
          en: 'So nothing about your household leaves the device unless you triggered it.',
        },
      },
      {
        label: { fr: 'Vie privée', en: 'Privacy' },
        detail: {
          fr: 'Le traitement reste dans le réseau de Cloudflare (conforme à la Loi 25 du Québec) et ne sert pas à entraîner des modèles ni à faire de la pub. Mais c’est quand même envoyé hors de l’appareil pour être traité — alors évite d’écrire un mot de passe ou un numéro sensible dans une note ou une question.',
          en: 'Processing stays inside Cloudflare’s network (compliant with Québec’s Law 25) and is not used to train models or for ads. It is still sent off the device to be processed, though — so don’t type a password or a sensitive number into a note or a question.',
        },
        why: {
          fr: 'Comprendre où vont tes mots avant de les écrire.',
          en: 'Understand where your words go before you type them.',
        },
      },
      {
        label: { fr: 'Ça peut se tromper', en: 'It can be wrong' },
        detail: {
          fr: 'L’IA devine — elle peut mal classer une note, inventer une étape de recette, ou mal lire une date. Rien n’est jamais perdu : tu corriges en un geste (« non, plutôt… » sur une capture, modifier la recette, ignorer une suggestion). Vérifie une réponse importante plutôt que de t’y fier les yeux fermés.',
          en: 'AI guesses — it can misfile a note, invent a recipe step, or misread a date. Nothing is ever lost: you fix it in one tap (“no, rather…” on a capture, edit the recipe, ignore a suggestion). Double-check an important answer instead of trusting it blindly.',
        },
        why: {
          fr: 'L’IA est une aide, pas une autorité — tu gardes le dernier mot.',
          en: 'AI is a helper, not an authority — you keep the last word.',
        },
      },
      {
        label: { fr: 'Jamais automatique', en: 'Never automatic' },
        detail: {
          fr: 'Une seule réponse par geste, jamais une boucle, jamais un fil sans fin, jamais une notification. L’IA ne tourne pas en arrière-plan et ne te relance pas — fidèle à l’esprit calme de l’app.',
          en: 'One answer per tap, never a loop, never an endless feed, never a notification. AI doesn’t run in the background and never nags you — true to the app’s calm spirit.',
        },
      },
      {
        label: { fr: 'Tu peux l’éteindre', en: 'You can turn it off' },
        detail: {
          fr: 'Un interrupteur permet de couper l’IA, en entier ou par fonction. Coupée, l’app reste entière : la capture offre un choix manuel du type, l’import de recette se fait à la main, et le bilan et les suggestions se cachent simplement. Rien ne casse.',
          en: 'A switch lets you turn AI off, whole or per feature. Off, the app stays complete: capture offers a manual type-picker, recipe import is done by hand, and the recap and suggestions simply hide. Nothing breaks.',
        },
        why: {
          fr: 'L’IA est un plus optionnel, jamais une dépendance.',
          en: 'AI is an optional plus, never a dependency.',
        },
      },
      {
        label: { fr: 'Quand une fonction IA bloque', en: 'When an AI feature is stuck' },
        detail: {
          fr: 'Réglages ▸ Débogage tient un petit journal d’entretien de l’IA : si une fonction cesse de répondre, tu y vois la vraie cause au lieu de deviner.',
          en: 'Settings ▸ Debug keeps a small AI maintenance log: if a feature stops responding, you see the real cause there instead of guessing.',
        },
      },
    ],
  },
  {
    id: 'capture',
    icon: 'microphone-bold',
    group: 'concepts',
    title: { fr: 'Classer (le micro « Parle à la maison »)', en: 'Filing it (the “Talk to the household” mic)' },
    what: {
      fr: 'Touche le micro en haut de n’importe quel onglet, choisis « Classer », puis dis ou écris une phrase : l’app devine quoi en faire — un rendez-vous, une corvée, un article de liste, un repas, un « il en manque », ou une note.',
      en: 'Tap the mic at the top of any tab, choose “File it”, then say or write a line: the app works out what it is — an event, a chore, a list item, a meal, a “running low”, or a note.',
    },
    points: [
      {
        label: { fr: 'Demander ou classer', en: 'Ask or file' },
        detail: {
          fr: 'Le même micro fait deux choses, et tu choisis laquelle : « Demander » répond à une question sur la maisonnée, « Classer » range ce que tu viens de dire.',
          en: 'The same mic does two things, and you pick which: “Ask” answers a question about the household, “File it” puts away what you just said.',
        },
        why: {
          fr: 'Avant, le ＋ avait un micro qui dictait du texte et, juste en dessous, un bouton micro qui enregistrait un clip — deux micros, deux sens opposés. Maintenant l’onglet dit lequel tu tiens.',
          en: 'The ＋ button used to hold a mic that dictated text and, right below it, a mic button that recorded a clip — two mics, opposite meanings. Now the segment tells you which one you’re holding.',
        },
      },
      {
        label: { fr: 'Le ＋ reste pour ajouter', en: 'The ＋ is still for adding' },
        detail: {
          fr: 'Le bouton ＋ s’adapte à la section où tu es (une recette dans la cuisine, un article sur la liste). Sa « Note rapide » écrit une note au babillard — avec un trombone 📎 pour y joindre un mémo vocal, un dessin ou une photo.',
          en: 'The ＋ button adapts to the section you’re in (a recipe in the kitchen, an item on the list). Its “Quick note” writes a note to the board — with a 📎 to clip on a voice memo, a drawing or a photo.',
        },
        why: {
          fr: 'Une note garde tes mots ET ce que tu y joins. Avant, enregistrer un mémo jetait le texte que tu venais d’écrire.',
          en: 'A note keeps your words AND whatever you clip to it. Recording a memo used to throw away the text you had just typed.',
        },
      },
      {
        label: { fr: 'Des raccourcis selon la section', en: 'Shortcuts per section' },
        detail: {
          fr: 'Sur le babillard, le ＋ offre aussi « Planifier aujourd’hui » et « Planifier demain » (toute la journée d’un coup : repas, rendez-vous, corvées, note). Dans la cuisine, il ajoute aussi à La réserve.',
          en: 'On the board, the ＋ also offers “Plan today” and “Plan tomorrow” (a whole day at once: meals, events, chores, note). In the kitchen, it can also add to The stash.',
        },
        why: {
          fr: 'Les gestes les plus utiles de chaque section sont à un seul toucher, sans changer de page.',
          en: 'Each section’s most-wanted actions are one tap away, no page-hopping.',
        },
      },
      {
        label: { fr: 'Parler plutôt qu’écrire', en: 'Speak instead of type' },
        detail: {
          fr: 'La reconnaissance vocale se fait sur l’appareil. « souper spaghetti jeudi » devient un repas, le bon jour.',
          en: 'Voice recognition runs on the device. “spaghetti supper Thursday” becomes a meal, on the right day.',
        },
        why: {
          fr: 'Plus rapide que taper, les mains occupées, et rien n’est envoyé ailleurs.',
          en: 'Faster than typing, hands full, and nothing is sent away.',
        },
      },
      {
        label: { fr: 'Si l’IA est hors ligne', en: 'If AI is offline' },
        detail: {
          fr: 'Tu choisis toi-même le type dans une petite liste.',
          en: 'You pick the type yourself from a small list.',
        },
        why: {
          fr: 'Rien n’est perdu — la capture fonctionne même quand [[card:ai|l’IA]] est absente.',
          en: 'Nothing is lost — capture works even when [[card:ai|AI]] is down.',
        },
      },
      {
        label: { fr: 'Joindre un mémo vocal, un dessin ou une photo', en: 'Clip on a voice memo, a drawing or a photo' },
        detail: {
          fr: 'Le trombone 📎, dans le champ de texte, joint un mémo vocal, un dessin ou une photo à la note que tu écris — la note garde tes mots ET ce que tu y joins (avant, enregistrer un mémo jetait le texte). Un mémo tout seul, sans un mot, est une note valide lui aussi. Le dessin a un crayon (trait net et régulier, exactement de l’épaisseur montrée), un pot de peinture pour remplir une zone fermée d’un toucher (comme dans Paint), des collants (animaux, saisons, lettres…), un mode pixels et des mots à tamponner, un miroir rigolo, défaire/refaire (même « Effacer » se défait) et plein de couleurs. Le pot de peinture se glisse sous tes traits, donc tu peux dessiner par-dessus un remplissage et tes traits restent visibles. « Aplatir » fusionne tout en une seule image figée quand un dessin devient chargé. Et si tu fermes par accident un dessin en cours, il est récupéré à la réouverture. Et c’est éducatif : un modèle peut s’afficher dessous — lignes d’écriture, des lettres à tracer (majuscule + minuscule, « Aa Bb ») ou même un mot entier à tracer (un prénom de la maisonnée ou du cercle, une recette : « trace ton nom »), du quadrillé, ou une page à colorier (étoile, cœur, fleur, maison, chat, papillon, voiture, bateau…). Les lettres sont en trait simple, faciles à suivre. Tu peux aussi dessiner « Sur une photo » : choisis une photo, elle s’affiche en filigrane sous ta feuille et tu dessines par-dessus pour la suivre. Une glissière (avec des choix rapides Pâle / Doux / Net / Plein) règle à quel point la photo paraît — laisse-la visible pour décalquer, ou mets-la à zéro pour garder seulement ton dessin. Les dessins s’épinglent dans la vue Grille du babillard ; touche-en un pour continuer dessus (même les enfants), partage-le ou fais-en une carte de routine.',
          en: 'The 📎 inside the text field clips a voice memo, a drawing or a photo onto the note you are writing — the note keeps your words AND whatever you attach (recording a memo used to throw the text away). A memo on its own, with no words, is a valid note too. Drawing has a pen (a crisp, even line, exactly the width shown), a paint bucket to flood-fill an enclosed area in one tap (like Paint), sticker packs (animals, seasons, letters…), a pixel mode and word stamps, a fun mirror, undo/redo (even “Clear” can be undone) and lots of colours. The paint bucket sits under your lines, so you can draw on top of a fill and your strokes stay visible. “Flatten” merges everything into one frozen image when a drawing gets busy. And if you close an in-progress drawing by accident, it’s recovered when you reopen. And it’s educational: a template can sit underneath — handwriting lines, letters to trace (capital + lowercase, “Aa Bb”) or even a whole word to trace (a name from the household or Le cercle, a recipe: “trace your name”), dot paper, or a colour-in page (star, heart, flower, house, cat, butterfly, car, boat…). Letters are single-line, easy to follow. You can also draw “Over a photo”: pick a photo, it shows as a faint watermark under your sheet and you draw on top to follow it. A slider (with quick Faint / Soft / Strong / Full presets) sets how much the photo shows — leave it visible to trace, or drop it to zero to keep just your drawing. Drawings pin to the board’s Grille view; tap one to keep drawing on it (kids too), share it, or turn it into a routine card.',
        },
        why: {
          fr: 'Un mot doux, un dessin d’enfant ou un rappel parlé — plus chaleureux qu’un texte, et sans effacer ce que tu as écrit. Et comme tout le monde peut continuer un dessin, ça devient un petit babillard à dessiner en famille. Les dessins gardés vivent dans « Mes dessins » (la galerie) — ouvre-la depuis la tuile du mode enfant ou le lien sous la vue Grille; un dessin gardé n’est pas effacé avec les notes.',
          en: 'A sweet word, a kid’s drawing or a spoken reminder — warmer than text, and it never erases what you wrote. And since anyone can add to a drawing, it becomes a little family doodle board. Kept drawings live in “My drawings” (the gallery) — open it from the kid-board tile or the link under the Grille view; a kept drawing isn’t cleared away with the notes.',
        },
      },
      {
        label: { fr: 'Laisse un mot', en: 'Leave a note' },
        detail: {
          fr: 'Depuis le ＋, « Laisse un mot » écrit un petit message pour quelqu’un en particulier — choisis un visage (ou « Toute la Maisonnée »), puis écris ou dicte ta ligne — et joins-y un mémo vocal, un dessin ou une photo avec le trombone 📎 si tu veux. Le mot attend tranquillement : il apparaît sur le babillard quand cette personne choisit son visage, et un petit point sur son visage (dans la rangée des visages) annonce qu’un mot l’attend — jamais un chiffre. En l’ouvrant, on l’entend ou on le lit, et il cesse de réclamer — et on peut y « Répondre » d’un mot en retour. Avec « Plus tard », on choisit le moment où il apparaîtra (un « bonne fête » le matin venu, un rappel juste avant de partir) — des choix rapides « Ce soir / Demain matin / Ce week-end » évitent de fouiller le calendrier. Dans ces choix rapides, « Me le rappeler » se laisse un mot à soi-même pour demain matin : le rappel le plus calme qui soit, sans notification. Quand tu as choisi ton visage, « Ce que j’ai laissé » regroupe tes propres mots : tu vois s’ils ont été « Vu » ou sont « En attente », et un mot « Plus tard » pas encore paru peut être reprogrammé, envoyé tout de suite, ou annulé avant qu’il n’arrive. Un mot qu’on veut garder se met de côté avec « Garder » ; les mots déjà vus se replient sous « Déjà vus ». C’est interne à la maisonnée — différent de « La boîte aux lettres », qui sert aux proches de l’extérieur.',
          en: 'From the ＋, “Leave a note” writes a little message for one person — pick a face (or “the whole Household”), then type or dictate your line — and clip on a voice memo, a drawing or a photo with the 📎 if you like. The note waits quietly: it appears on the board when that person picks their face, and a small dot on their face (in the face row) signals a note is waiting — never a number. Opening it plays or reads it, and it stops prompting — and you can “Reply” with a note back. With “Later”, you pick when it appears (a “happy birthday” on the morning, a reminder right before they leave) — quick picks “Tonight / Tomorrow morning / This weekend” save digging through the calendar. Among those quick picks, “Remind me” leaves a note to yourself for tomorrow morning: the calmest possible reminder, no notification. Once you’ve picked your face, “What I left” gathers your own notes: you can see whether they’ve been “Seen” or are still “Waiting”, and a “Later” note that hasn’t appeared yet can be rescheduled, sent right away, or cancelled before it lands. A note worth keeping is set aside with “Keep”; already-seen notes fold under “Already seen”. It’s internal to the household — different from “The mailbox”, which is for relatives from outside.',
        },
        why: {
          fr: 'Le frigo a toujours servi à se laisser des mots : « ton lunch est prêt », « bonne journée ». Ici le mot trouve la bonne personne sans déranger personne d’autre — pas de notification, pas de cloche, juste un mot qui attend.',
          en: 'The fridge has always been where we leave each other notes: “your lunch is ready”, “have a good day”. Here the note finds the right person without disturbing anyone else — no notification, no chime, just a note that waits.',
        },
      },
      {
        label: { fr: 'Hors ligne', en: 'Offline' },
        detail: {
          fr: 'Sans connexion, la capture se garde quand même — un petit message le confirme, la boîte se vide. Elle se classe dès que l’appareil retrouve internet, sans rien retaper.',
          en: 'With no connection, capture still gets kept — a small message confirms it, the box clears. It gets sorted the moment the device is back online, no retyping.',
        },
        why: {
          fr: 'Le babillard tourne sur une tablette murale, pas toujours branchée au wifi — une note dictée un jeudi soir ne devrait jamais se perdre parce que le signal a flanché.',
          en: 'The board runs on a wall tablet that isn’t always on wifi — a note jotted down on a Thursday evening should never be lost because the signal blipped.',
        },
      },
    ],
  },
  {
    id: 'type-or-choose',
    icon: 'magnifying-glass-bold',
    group: 'concepts',
    title: { fr: 'Écrire ou choisir', en: 'Type or choose' },
    what: {
      fr: 'Partout où tu ajoutes un repas, une idée ou un reste, la même boîte fait deux choses : écris librement, ou choisis dans la liste qui se filtre à mesure que tu tapes.',
      en: 'Everywhere you add a meal, an idea or a leftover, one box does two things: type freely, or pick from the list that filters as you type.',
    },
    points: [
      {
        label: { fr: 'Une seule boîte', en: 'One box' },
        detail: {
          fr: 'Plus de bouton séparé « Choisir une recette ». Commence à écrire et les recettes (et les restes) qui correspondent apparaissent dessous — touche-en une pour la lier.',
          en: 'No more separate “Choose a recipe” button. Start typing and matching recipes (and leftovers) appear below — tap one to link it.',
        },
        why: {
          fr: 'Un seul geste au lieu de deux, et on voit tout de suite ce qui existe déjà.',
          en: 'One gesture instead of two, and you see right away what already exists.',
        },
      },
      {
        label: { fr: 'Écrire reste permis', en: 'Free text still works' },
        detail: {
          fr: 'Rien dans la liste ne convient ? Écris ton propre texte et touche ＋ (ou Entrée). Ta note passe telle quelle.',
          en: 'Nothing in the list fits? Type your own text and tap ＋ (or Enter). Your note goes through as-is.',
        },
      },
      {
        label: { fr: 'La flèche ouvre la liste', en: 'The arrow opens the list' },
        detail: {
          fr: 'La petite flèche ▾ au bout de la boîte déroule tous les choix, comme un menu — pour parcourir sans écrire.',
          en: 'The little ▾ arrow at the end of the box drops the full list, like a menu — to browse without typing.',
        },
      },
      {
        label: { fr: 'Les recettes, classées', en: 'Recipes, sorted' },
        detail: {
          fr: 'Quand tu choisis une recette, celles que tu peux cuisiner maintenant remontent en haut, avec « Prêt » ou « il manque 2 ».',
          en: 'When you pick a recipe, the ones you could cook now rise to the top, badged “Ready” or “missing 2”.',
        },
        why: {
          fr: 'Décider du souper en regardant ce qui est déjà à portée de main.',
          en: 'Decide supper from what’s already within reach.',
        },
      },
      {
        label: { fr: 'Les étiquettes sans doublons', en: 'Tags without duplicates' },
        detail: {
          fr: 'En étiquetant une recette, écris quelques lettres : si « végé » existe déjà, elle te la propose au lieu d’en créer une presque pareille.',
          en: 'When tagging a recipe, type a few letters: if “végé” already exists it suggests it, instead of creating a near-duplicate.',
        },
        why: {
          fr: 'Les collections restent nettes — pas de « végé » ET « végétarien » qui se séparent en deux.',
          en: 'Collections stay tidy — no “végé” AND “vegetarian” splitting in two.',
        },
      },
    ],
  },
  {
    // D-33 — search finally has its own card: it joins the Guide, the themed map
    // AND (because the Guide feeds the global search index) search itself.
    id: 'search',
    icon: 'magnifying-glass-bold',
    group: 'concepts',
    route: '/search',
    title: { fr: 'Chercher partout', en: 'Search everywhere' },
    what: {
      fr: 'Une seule recherche pour toute la maisonnée : recettes, personnes, listes, rendez-vous, routines, carnets… et le guide lui-même.',
      en: 'One search for the whole household: recipes, people, lists, appointments, routines, carnets… and the guide itself.',
    },
    points: [
      {
        label: { fr: 'La loupe, en haut de chaque section', en: 'The magnifier, atop every section' },
        detail: {
          fr: 'Touche la loupe dans l’en-tête (babillard, cuisine, liste, routines, cercle) et écris quelques lettres — sans accents, ça marche aussi. Les meilleurs résultats montent en premier.',
          en: 'Tap the magnifier in the header (board, kitchen, list, routines, circle) and type a few letters — accents optional. Best matches rise first.',
        },
        why: {
          fr: 'Peu importe où tu es, la réponse est à deux taps — pas besoin de savoir dans quelle section elle vit.',
          en: 'Wherever you are, the answer is two taps away — no need to know which section it lives in.',
        },
      },
      {
        label: { fr: 'Ça trouve aussi le mode d’emploi', en: 'It finds the manual too' },
        detail: {
          fr: 'Écris « comment inviter grand-maman » ou « circulaires » : les cartes du guide qui en parlent sortent avec le reste, et un tap ouvre l’explication.',
          en: 'Type “how to invite grandma” or “flyers”: the guide cards that cover it surface with the rest, and one tap opens the explanation.',
        },
      },
      {
        label: { fr: 'Un lien direct', en: 'A direct link' },
        detail: {
          fr: 'La page vit à /search et accepte ?q=… — un signet « /search?q=lait » ouvre la recherche déjà remplie.',
          en: 'The page lives at /search and accepts ?q=… — a “/search?q=milk” bookmark opens the search pre-filled.',
        },
      },
    ],
  },
  {
    id: 'mots',
    icon: 'envelope-bold',
    group: 'concepts',
    route: '/board',
    title: { fr: 'Laisse un mot', en: 'Leave a note' },
    what: {
      fr: 'Un petit message qu’un membre laisse à un autre — écrit, une note vocale, un dessin ou une photo — et qui l’attend, fermé, sur son visage jusqu’à ce qu’il l’ouvre.',
      en: 'A little message one member leaves for another — typed, a voice memo, a drawing or a photo — that waits, unopened, on their face until they open it.',
    },
    points: [
      {
        label: { fr: 'Déposer un mot', en: 'Leave a note' },
        detail: {
          fr: 'Touche le ＋ au babillard → « Laisse un mot », choisis à qui, puis écris ou enregistre. Tu peux même te le programmer à toi-même (« Me le rappeler »).',
          en: 'Tap ＋ on the board → “Leave a note”, choose who it’s for, then type or record. You can even schedule one to yourself (“Remind me”).',
        },
      },
      {
        label: { fr: 'Il attend, sans presser', en: 'It waits, no pressure' },
        detail: {
          fr: 'Le mot reste fermé sur le visage du destinataire — pas de pastille de compte, pas de « non lus » qui s’accumulent. On l’ouvre quand on passe.',
          en: 'The note stays closed on the recipient’s face — no unread count, no pile of “unread” building up. You open it when you pass by.',
        },
        why: {
          fr: 'Un mot sur le frigo, pas une notification — calme par choix.',
          en: 'A note on the fridge, not a notification — calm by choice.',
        },
      },
      {
        label: { fr: 'Différent de la boîte aux lettres', en: 'Different from the mailbox' },
        detail: {
          fr: '« Laisse un mot » reste entre les membres de la maisonnée. La boîte aux lettres, elle, reçoit les mots des proches de l’extérieur (voir « Partager un accès »).',
          en: '“Leave a note” stays between household members. The mailbox instead receives notes from relatives outside (see “Share access”).',
        },
      },
    ],
  },
  {
    id: 'habits',
    icon: 'repeat-bold',
    group: 'concepts',
    route: '/board/habitudes',
    title: { fr: 'Mes habitudes', en: 'My habits' },
    what: {
      fr: 'Les petits rythmes qu’on tient — marcher, boire de l’eau, deux sorties à vélo par semaine, fumer moins, éviter le chocolat. « Le point du jour » les rassemble en un écran, et un tap suffit.',
      en: 'The little rhythms you keep — walking, drinking water, two bike rides a week, smoking less, avoiding chocolate. “Today’s check-in” gathers them on one screen, and one tap is enough.',
    },
    points: [
      {
        label: { fr: 'Quatre genres d’habitude', en: 'Four kinds of habit' },
        detail: {
          fr: '« Faire » (marcher) se coche. « Compter » monte vers un objectif (8 verres d’eau). « Limiter » se compte sous un maximum (5 cigarettes). « Éviter » se confirme : Tenu, ou un petit écart.',
          en: '“Do” (walk) gets ticked. “Count” climbs toward a goal (8 glasses of water). “Limit” counts under a ceiling (5 cigarettes). “Avoid” gets confirmed: Held, or a small slip.',
        },
      },
      {
        label: { fr: 'Le rythme que tu veux', en: 'Whatever rhythm you want' },
        detail: {
          fr: 'Chaque jour, certains jours de la semaine, un jour sur trois — ou simplement « 2 fois par semaine », sans jour fixe : l’habitude attend jusqu’à ce que la semaine soit remplie.',
          en: 'Every day, certain weekdays, every third day — or simply “2 times a week”, with no fixed day: the habit waits until the week is filled.',
        },
      },
      {
        label: { fr: 'Ça s’ouvre tout seul', en: 'It opens by itself' },
        detail: {
          fr: 'Le matin, à la première ouverture, si quelque chose t’attend. Et aux heures que tu choisis, sur l’écran allumé. Jamais de notification poussée : rien ne sonne dans ta poche.',
          en: 'In the morning, on the first opening, if something is waiting. And at the times you choose, on the screen that’s on. Never a push notification: nothing buzzes in your pocket.',
        },
        why: {
          fr: 'Un babillard qui rappelle, pas un téléphone qui harcèle. Tout se désactive dans Réglages ▸ Système ▸ Mode veille.',
          en: 'A board that reminds, not a phone that nags. Everything can be turned off in Settings ▸ System ▸ Idle.',
        },
      },
      {
        label: { fr: 'Ni série, ni pointage', en: 'No streaks, no scoring' },
        detail: {
          fr: 'On voit la semaine et le mois — combien de jours, tout simplement. Jamais de « série en cours », jamais de points, jamais un membre comparé à un autre. Un écart, c’est noté, jamais reproché.',
          en: 'You see the week and the month — how many days, plainly. Never a “current streak”, never points, never one member compared to another. A slip is noted, never scolded.',
        },
        why: {
          fr: 'Une habitude tenue par culpabilité ne tient pas. Le babillard note ce qui s’est passé, un point c’est tout.',
          en: 'A habit held out of guilt doesn’t hold. The board records what happened, and that’s all.',
        },
      },
      {
        label: { fr: 'À toi, ou à la maisonnée', en: 'Yours, or the household’s' },
        detail: {
          fr: 'Une habitude appartient à un visage ou à toute la maisonnée. Les tiennes ne s’affichent qu’une fois ton visage choisi — le babillard dit seulement « Tes habitudes t’attendent ».',
          en: 'A habit belongs to one face or to the whole household. Yours only show once your face is picked — the board just says “Your habits are waiting”.',
        },
      },
    ],
  },
  {
    id: 'drawings',
    icon: 'paint-brush-bold',
    group: 'concepts',
    route: '/drawings',
    title: { fr: 'Dessiner & la galerie', en: 'Drawing & the gallery' },
    what: {
      fr: 'Un espace pour dessiner du doigt — un mot illustré, un bonhomme, une carte — qu’on garde dans « Mes dessins » et qu’on peut afficher au babillard.',
      en: 'A space to draw with a finger — an illustrated note, a doodle, a card — kept in “My drawings” and shown on the board.',
    },
    points: [
      {
        label: { fr: 'Le crayon, le seau, aplatir', en: 'Pen, fill bucket, flatten' },
        detail: {
          fr: 'Un vrai crayon (trait lisse), un seau pour remplir une zone (l’encre reste par-dessus), et « Aplatir » pour figer le fond. Tout s’annule.',
          en: 'A real pen (smooth stroke), a bucket to fill an area (ink stays on top), and “Flatten” to fix the background. Everything undoes.',
        },
      },
      {
        label: { fr: 'Garder, rouvrir, calquer', en: 'Keep, reopen, trace' },
        detail: {
          fr: 'Un dessin gardé va dans la galerie « Mes dessins ». En le rouvrant, tu peux le modifier, en faire une copie, ou le calquer.',
          en: 'A kept drawing goes to the “My drawings” gallery. Reopening it, you can modify it, copy it, or trace over it.',
        },
      },
      {
        label: { fr: 'Au babillard ou en veille', en: 'On the board or the screensaver' },
        detail: {
          fr: 'Un dessin peut devenir une note du frigo, et la galerie peut défiler dans le mode veille comme un cadre photo.',
          en: 'A drawing can become a fridge note, and the gallery can drift in the screensaver like a photo frame.',
        },
      },
    ],
  },
  {
    id: 'favorites',
    icon: 'heart-bold',
    group: 'concepts',
    title: { fr: 'Les coups de cœur', en: 'Favorites' },
    what: {
      fr: 'Mets un ❤ sur les recettes que tu aimes. « Qu’est-ce qu’on mange ? » penchera vers les plats aimés de la maisonnée.',
      en: 'Put a ❤ on recipes you love. “What’s for supper?” will lean toward the household’s loved dishes.',
    },
    points: [
      {
        label: { fr: 'Chacun le sien', en: 'Each their own' },
        detail: {
          fr: 'Le cœur suit le visage choisi : on voit QUI aime un plat (les frimousses), jamais un nombre ni un classement.',
          en: 'The heart follows the picked face: you see WHO loves a dish (the little faces), never a number or a ranking.',
        },
        why: {
          fr: 'Une préférence partagée, pas un concours — fidèle au calme.',
          en: 'A shared preference, not a contest — true to calm.',
        },
      },
      {
        label: { fr: 'En mode Maisonnée', en: 'In Household mode' },
        detail: {
          fr: 'Sans visage choisi, les cœurs s’affichent mais on n’en ajoute pas : choisis ton visage pour aimer.',
          en: 'With no face picked, the hearts show but you can’t add one: pick your face to love a dish.',
        },
        why: {
          fr: 'Un « j’aime » appartient à quelqu’un — pas à « tout le monde ».',
          en: 'A “love” belongs to someone — not to “everyone”.',
        },
      },
    ],
  },
  {
    id: 'share',
    icon: 'arrow-up-right-bold',
    group: 'concepts',
    title: { fr: 'Partager (recettes, familles…)', en: 'Sharing (recipes, families…)' },
    what: {
      fr: 'Envoie une recette, un rendez-vous ou une famille par un vrai lien : une belle page que n’importe qui peut ouvrir — même sans Babillard.',
      en: 'Send a recipe, an event, or a family as a real link: a proper page anyone can open — even without Babillard.',
    },
    points: [
      {
        label: { fr: 'Une page, pas un copier-coller', en: 'A page, not a paste' },
        detail: {
          fr: 'Sur une recette, touche « Partager » : on crée un lien vers une page avec la photo, les ingrédients et les étapes.',
          en: 'On a recipe, tap “Share”: it creates a link to a page with the photo, ingredients, and steps.',
        },
        why: {
          fr: 'Un lien qui s’ouvre proprement partout vaut mieux qu’un texte illisible.',
          en: 'A link that opens cleanly everywhere beats an unreadable text blob.',
        },
      },
      {
        label: { fr: 'Ceux qui ont Babillard l’ajoutent', en: 'Babillard users add it' },
        detail: {
          fr: 'Un ami connecté à Babillard voit un bouton « Ajouter à mon livre » ; les autres découvrent Babillard.',
          en: 'A friend signed into Babillard sees an “Add to my book” button; everyone else discovers Babillard.',
        },
        why: {
          fr: 'La copie arrive intacte dans leur compte, sans re-taper.',
          en: 'The copy lands intact in their account, no re-typing.',
        },
      },
      {
        label: { fr: 'Tu gardes la main', en: 'You stay in control' },
        detail: {
          fr: 'Un lien est une copie unique qui expire de lui-même ; retire-le quand tu veux dans Réglages ▸ Partage.',
          en: 'A link is a one-time copy that expires on its own; remove it anytime in Settings ▸ Sharing.',
        },
        why: {
          fr: 'Rien n’est partagé « en direct » — la copie ne change plus après l’envoi.',
          en: 'Nothing is shared “live” — the copy doesn’t change after you send it.',
        },
      },
    ],
  },
  {
    id: 'todos',
    icon: 'check-bold',
    group: 'concepts',
    title: { fr: 'À faire & à compléter', en: 'To do & to complete' },
    what: {
      fr: 'Sur le babillard, une seule carte « À faire » réunit deux choses : les p’tites tâches ponctuelles (souvent dictées — « appeler le dentiste »), et tes listes à cocher réutilisables (« À compléter »). Coche quand c’est fait, puis « Effacer cochées » nettoie.',
      en: 'On the board, a single “À faire” card gathers two things: small one-off tasks (often dictated — “call the dentist”), and your reusable check-off lists (“À compléter”). Check them off when done, then “Clear checked” tidies up.',
    },
    points: [
      {
        label: { fr: '« À faire » ou « À compléter » ?', en: '“À faire” or “À compléter”?' },
        detail: {
          fr: '« À faire » : une chose ponctuelle — tu la dictes ou la captures, tu coches, c’est fini. « À compléter » : une liste qui revient (sac de piscine, avant de partir) — préparée une fois, réutilisable d’un tap. Les deux vivent dans la même carte du babillard, sous leurs étiquettes. En cas de doute, touche le « ? » du babillard puis le titre de la carte.',
          en: '“À faire”: a one-off thing — dictate or capture it, tick it, done. “À compléter”: a recurring list (pool bag, before leaving) — set up once, reusable in one tap. Both live in the same board card under their labels. If unsure, tap the board’s “?” then the card title.',
        },
        why: { fr: 'Une chose vite faite et une liste qu’on garde, ce n’est pas pareil — mais c’est au même endroit.', en: 'A quick one-off and a list you keep aren’t the same — but they’re in one place.' },
      },
      {
        label: { fr: 'Globale ou pour une journée', en: 'Global or for one day' },
        detail: {
          fr: 'Depuis le ＋ du babillard, choisis « En tout temps » (ça reste jusqu’à effacé) ou « Aujourd’hui ». Sur la page d’une journée (dans La cuisine), tu l’ajoutes directement à cette date.',
          en: 'From the board ＋, pick “Anytime” (it stays until cleared) or “Today”. On a day’s page (in the kitchen), you add it straight onto that date.',
        },
        why: { fr: 'Ce qui traîne dans la tête se pose quelque part de calme.', en: 'What’s rattling in your head lands somewhere calm.' },
      },
      {
        label: { fr: 'Listes de départ', en: 'Departure lists' },
        detail: {
          fr: 'Prépare des modèles réutilisables dans Réglages ▸ À compléter (ex. « Avant de partir », « Chez grand-papa »). D’un geste, tout le modèle s’ajoute en cochables — un départ pressé devient moins stressant. Sur le babillard, l’écran « [[card:board|Avant de partir]] » montre ta vraie liste « À compléter » du jour (coche ici, c’est coché partout) avec la météo et le programme de la journée.',
          en: 'Prep reusable templates in Settings ▸ To complete (e.g. “Before leaving”, “At grandpa’s”). One tap drops the whole list in as check-offs — a hectic departure gets less stressful. On the board, the “[[card:board|Before you go]]” screen shows your real “To complete” list for the day (tick it here, it’s ticked everywhere) alongside the weather and the day’s plan.',
        },
        why: { fr: 'On y pense une fois, pas chaque fois qu’on court.', en: 'You think it through once, not every time you’re rushing out.' },
      },
      {
        label: { fr: 'Des listes dans des listes', en: 'Lists inside lists' },
        detail: {
          fr: 'Une liste peut en inclure d’autres : « Le matin » = « Sac à couches » + « Lunchs » + 2-3 extras. Une fois ajoutée, chaque liste incluse devient une section. Le même item venant de deux listes reste dans les deux (jamais fusionné).',
          en: 'A list can include others: “Morning” = “Diaper bag” + “Lunches” + a couple extras. Once added, each included list becomes a section. The same item from two lists is kept in both (never merged).',
        },
        why: { fr: 'Construis de grosses listes à partir de petites, sans tout retaper.', en: 'Build big lists out of small ones, without retyping everything.' },
      },
      {
        label: { fr: 'Calme', en: 'Calm' },
        detail: {
          fr: 'Pas de points, pas de pointage : cocher, c’est la récompense. La liste se vide et reste vide.',
          en: 'No points, no score: checking it off is the reward. The list empties and stays empty.',
        },
      },
    ],
    // The "À compléter" templates live under Réglages ▸ Routines ▸ À compléter.
    route: '/settings?tab=routines&sub=todos',
  },
  {
    id: 'activities',
    icon: 'users-three-bold',
    group: 'concepts',
    title: { fr: 'Les activités', en: 'Activities' },
    what: {
      fr: 'Le soccer du mardi, le piano du jeudi : une activité qui revient, avec qui conduit et quoi apporter. Tu la crées une fois et elle revient toute seule sur le babillard.',
      en: 'Tuesday soccer, Thursday piano: a recurring commitment, with who drives and what to bring. You create it once and it comes back on its own.',
    },
    points: [
      {
        label: { fr: 'Une fois, puis ça roule', en: 'Once, then it runs' },
        detail: {
          fr: 'Depuis le ＋ du babillard, choisis « Activité » : un titre, l’enfant, la récurrence (chaque mardi 17 h), qui conduit et — au besoin — l’auto. C’est un rendez-vous récurrent, donc il apparaît sur le babillard et le calendrier comme le reste.',
          en: 'From the board ＋, pick “Activity”: a title, the child, the recurrence (every Tuesday 5 pm), who drives and — if needed — the car. It’s a recurring event, so it shows on the board and calendar like everything else.',
        },
        why: { fr: 'Le rythme de la semaine se met en place sans y repenser.', en: 'The week’s rhythm falls into place without rethinking it.' },
      },
      {
        label: { fr: 'Quoi apporter, au bon moment', en: 'What to bring, at the right time' },
        detail: {
          fr: 'Attache une liste « [[card:todos|À apporter]] » (souliers, gourde…) — une de tes listes à compléter. Le jour de l’activité, l’écran « [[card:board|Avant de partir]] » la montre, et d’un geste tu la passes en cochables.',
          en: 'Attach a “[[card:todos|What to bring]]” list (cleats, water bottle…) — one of your to-do lists. On the activity’s day, the “[[card:board|Before you go]]” screen shows it, and one tap turns it into check-offs.',
        },
        why: { fr: 'Finis les « on a oublié les souliers ».', en: 'No more “we forgot the cleats”.' },
      },
    ],
  },
  {
    id: 'a-regler',
    icon: 'warning-bold',
    group: 'concepts',
    title: { fr: '« À régler »', en: '“To sort”' },
    what: {
      fr: 'Un coup d’œil qui relie ce que les onglets gardent séparé : une sortie sans conducteur, le souper de demain vide, une fête bientôt sans idée de cadeau. Seulement ce qui mérite ton attention — et ça se vide quand c’est réglé.',
      en: 'One glance that connects what the tabs keep apart: a ride with no driver, tomorrow’s supper empty, a birthday soon with no gift idea. Only what deserves your attention — and it empties as you sort it.',
    },
    points: [
      {
        label: { fr: 'Où le voir', en: 'Where to see it' },
        detail: {
          fr: 'Une petite carte « À régler » apparaît sur le babillard quand il y a quelque chose à régler. La liste complète, avec un raccourci pour chaque correction, vit dans Réglages ▸ « Cette semaine ».',
          en: 'A small “To sort” card shows on the board when there’s something to sort. The full list, with a one-tap fix for each, lives in Settings ▸ “This week”.',
        },
        why: { fr: 'La charge mentale invisible devient une courte liste qu’on règle.', en: 'The invisible mental load becomes a short list you can clear.' },
      },
      {
        label: { fr: 'Calme', en: 'Calm' },
        detail: {
          fr: 'Pas de score, pas de reproche. Quand il n’y a rien : « Tout est sous contrôle ». La liste se vide et reste vide.',
          en: 'No score, no blame. When there’s nothing: “Everything is under control.” The list empties and stays empty.',
        },
      },
    ],
  },
  {
    id: 'home-projects',
    icon: 'broom-bold',
    group: 'concepts',
    route: '/settings?tab=routines&sub=chores',
    title: { fr: 'Projets & entretien', en: 'Plans & maintenance' },
    what: {
      fr: 'Sous les corvées, deux listes pour les plus gros sujets de la maison : les Projets (rénover, budgéter — « nouvelle cuisine ») et l’Entretien qui revient (filtre, gouttières, vérifier les arbres). Une corvée, c’est aujourd’hui; un projet, c’est l’horizon.',
      en: 'Under chores, two lists for the bigger home topics: Plans (renovate, budget — “new kitchen”) and the Maintenance that comes back (filter, gutters, check the trees). A chore is for today; a plan is for the horizon.',
    },
    points: [
      {
        label: { fr: 'Projets', en: 'Plans' },
        detail: {
          fr: 'Les grands projets de la maison, avec un budget visé optionnel et des notes (devis, à déléguer). Sans date, ils restent au calme dans Réglages ▸ Routines ▸ Corvées ▸ Projets — rien sur le babillard.',
          en: 'The bigger home projects, with an optional target budget and notes (quotes, to delegate). With no date they rest quietly in Settings ▸ Chores ▸ Plans — nothing on the board.',
        },
        why: { fr: 'Un endroit pour « un jour », sans que ça crie chaque matin.', en: 'A home for “someday”, without it shouting every morning.' },
      },
      {
        label: { fr: 'Entretien', en: 'Maintenance' },
        detail: {
          fr: 'L’entretien qui revient se règle une fois (« tous les 3 mois ») et réapparaît tout seul. Avec une date, il s’affiche au babillard et au calendrier, avec un rappel « Bientôt » optionnel; coche-le quand c’est fait et la prochaine fois s’installe.',
          en: 'Recurring upkeep is set once (“every 3 months”) and comes back on its own. With a date it shows on the board and the calendar, with an optional “Soon” reminder; check it off when done and the next one settles in.',
        },
        why: { fr: 'Le chauffe-eau et les gouttières ne s’oublient plus.', en: 'The water heater and the gutters don’t get forgotten anymore.' },
      },
      {
        label: { fr: 'Calme', en: 'Calm' },
        detail: {
          fr: 'Le budget est une cible, pas un compteur : aucune barre de progression, aucun pointage. Juste de quoi se souvenir et planifier.',
          en: 'The budget is a target, not a tracker: no progress bar, no score. Just enough to remember and plan.',
        },
      },
    ],
  },
  {
    id: 'voyage',
    icon: 'map-pin-bold',
    group: 'concepts',
    route: '/voyage/new',
    title: { fr: 'Voyage', en: 'Trip' },
    what: {
      fr: 'Un carnet de voyage pour la famille : tout au même endroit, du rendez-vous de planification jusqu’au retour. Un itinéraire jour par jour qui apparaît sur ton calendrier, des infos par catégorie (vols, hôtel, auto, à apporter…), une liste de bagages par personne, et tes documents (réservations, passeports) disponibles même hors-ligne.',
      en: 'A family trip notebook: everything in one place, from the planning meeting to the trip home. A day-by-day itinerary that shows on your calendar, info by category (flights, hotel, car, what to bring…), a packing list per person, and your documents (reservations, passports) available even offline.',
    },
    points: [
      {
        label: { fr: 'Noter, comme une note du frigo', en: 'Jot it, like a fridge note' },
        detail: {
          fr: 'Chaque info se note avec le même petit bloc-notes que les notes du frigo : écris, dicte à la voix, dessine ou prends une photo. Choisis une catégorie (Vols, Hébergement, Transport…) et, au besoin, à qui ça s’adresse (les enfants, les parents).',
          en: 'Each info is jotted with the same little notepad as a fridge note: type, dictate by voice, draw or snap a photo. Pick a category (Flights, Lodging, Transport…) and, if you like, who it’s for (the kids, the parents).',
        },
        why: { fr: 'Au rendez-vous de planification, tu captes tout vite, sans nouveau système à apprendre.', en: 'At the planning meeting you capture everything fast, with no new system to learn.' },
      },
      {
        label: { fr: 'Jour par jour, sur le calendrier', en: 'Day by day, on the calendar' },
        detail: {
          fr: 'Donne les dates du voyage : il s’affiche comme une bande sur le calendrier, et chaque journée du voyage te laisse ajouter son programme. Ouvre une journée sur le calendrier et l’info de ce jour-là est juste là.',
          en: 'Give the trip dates: it shows as a band across the calendar, and each trip day lets you add its plan. Open a day on the calendar and that day’s info is right there.',
        },
      },
      {
        label: { fr: 'Bagages par personne', en: 'Packing per person' },
        detail: {
          fr: 'Une liste partagée plus une liste par membre : coche en faisant la valise, et l’item s’en va. Pas de pointage, pas de « 3 sur 10 » — juste une liste qui se vide.',
          en: 'A shared list plus one per member: check items off as you pack and they’re gone. No tally, no “3 of 10” — just a list that empties.',
        },
      },
      {
        label: { fr: 'Documents, même hors-ligne', en: 'Documents, even offline' },
        detail: {
          fr: 'Ajoute tes réservations, billets et passeports en photo ou en PDF. Touche « Préparer pour hors-ligne » avant de partir : ils restent lisibles en voyage, même sans réseau.',
          en: 'Add your reservations, tickets and passports as a photo or PDF. Tap “Save for offline” before you leave: they stay readable on the road, even with no network.',
        },
        why: { fr: 'À l’aéroport ou à l’hôtel, ta réservation s’ouvre sans dépendre du wifi.', en: 'At the airport or hotel, your reservation opens without depending on wifi.' },
      },
      {
        label: { fr: 'Partager en direct avec d’autres maisonnées', en: 'Share it live with other households' },
        detail: {
          fr: 'Touche « Partager en direct » pour ouvrir le voyage à d’autres familles (jusqu’à 6) qui ont leur propre Babillard. Chacune reçoit un lien d’invitation ; vous modifiez ensuite l’itinéraire, les infos et les documents ensemble, en direct. Les bagages restent par maisonnée : tu vois les valises des autres, mais tu ne modifies que les tiennes. Chaque maisonnée peut quitter le voyage (en gardant une copie si elle veut) ; le propriétaire peut réinitialiser le lien ou dissoudre le voyage.',
          en: 'Tap “Share live” to open the trip to other families (up to 6) who have their own Babillard. Each gets an invite link; you then edit the itinerary, info and documents together, live. Packing stays per household: you see the others’ bags but only edit your own. Any household can leave (keeping a copy if it wants); the owner can reset the link or dissolve the trip.',
        },
        why: { fr: 'Un voyage à plusieurs familles se planifie à un seul endroit, sans se renvoyer des captures d’écran.', en: 'A multi-family trip gets planned in one place, without trading screenshots back and forth.' },
      },
      {
        label: { fr: 'Après : l’album du voyage', en: 'After: the trip album' },
        detail: {
          fr: 'Un voyage terminé se rouvre en album, pas en outil : les photos qu’il a ramassées, le jour par jour tel qu’il s’est passé, les notes gardées, et qui y était. Rien à créer — c’est le même carnet, relu en souvenir. Un voyage terminé se retrouve aussi dans « La maison cette année » (Réglages ▸ Le cercle) — touche-le pour rouvrir l’album. Besoin de corriger ? « Modifier » ramène l’éditeur.',
          en: 'A finished trip reopens as an album, not a tool: the photos it gathered, the day-by-day as it happened, the kept notes, and who was there. Nothing to create — it’s the same notebook, reread as a keepsake. A finished trip also shows in “The home this year” (Settings ▸ The circle) — tap it to reopen the album. Need to fix something? “Edit” brings the editor back.',
        },
        why: {
          fr: 'Rouvrir un vieux voyage devrait ressembler à ouvrir un album — pas à retomber dans la liste de bagages.',
          en: 'Reopening an old trip should feel like opening an album — not falling back into the packing list.',
        },
      },
    ],
  },
  {
    id: 'carnets',
    icon: 'book-open-bold',
    group: 'concepts',
    route: '/cercle?section=carnets',
    title: { fr: 'Les carnets', en: 'The carnets' },
    what: {
      fr: 'Dans Le cercle, tes choses dont on prend soin — la maison, l’auto… et le chauffe-eau ou la toiture à l’intérieur d’une maison. Chacune garde son carnet, comme un carnet d’entretien d’auto : son identité, ses factures, son entretien qui revient, et « le long jeu » (quand la remplacer).',
      en: 'In Le cercle, your cared-for things — the house, the car… and the water heater or roof inside a house. Each keeps a carnet, like a car’s maintenance booklet: its identity, its invoices, its recurring upkeep, and “the long game” (when to replace it).',
    },
    points: [
      {
        label: { fr: 'Une chose, un carnet', en: 'A thing, a carnet' },
        detail: {
          fr: 'Ajoute la maison ou l’auto, puis ses choses à l’intérieur (le chauffe-eau, les pneus). Touche-en une pour l’ouvrir : « À surveiller » (ce qui s’en vient) et « Le carnet » (l’info, l’historique, ses choses).',
          en: 'Add the house or the car, then its things inside (the water heater, the tires). Tap one to open it: “To watch” (what’s coming) and “The carnet” (the info, the history, its things).',
        },
      },
      {
        label: { fr: 'L’historique', en: 'The history' },
        detail: {
          fr: 'Chaque entretien ou installation s’ajoute à l’historique avec la date, le coût, l’installateur (un business du cercle) et la facture ou le manuel joint — photo OU PDF. Touche un document pour le lire : une photo s’agrandit, un PDF s’ouvre dans une fenêtre de lecture. Nouveau chauffe-eau ? Une entrée « Installation » avec sa facture, gardée pour toujours.',
          en: 'Each service or install adds to the history with the date, the cost, the installer (a cercle business) and the invoice or manual attached — photo OR PDF. Tap a document to read it: a photo zooms, a PDF opens in a reading window. New water heater? One “Install” entry with its invoice, kept forever.',
        },
        why: { fr: 'Quand tu rappelles le plombier, tu sais déjà tout — et tu retrouves la facture en un geste.', en: 'When you call the plumber back, you already know everything — and the invoice is one tap away.' },
      },
      {
        label: { fr: 'Le long jeu', en: 'The long game' },
        detail: {
          fr: 'Donne une date d’installation et une durée de vie : Babillard calcule « à prévoir vers 20XX » et te fait un petit signe quand ça approche, sur le babillard. Le calendrier ne sait pas faire ça.',
          en: 'Give an install date and a service life: Babillard works out “plan around 20XX” and gives you a gentle nudge on the board when it nears. A calendar can’t do that.',
        },
      },
      {
        label: { fr: 'Les garanties', en: 'Warranties' },
        detail: {
          fr: 'Note « garantie jusqu’au… » dans l’identité d’une chose : Babillard te fait un signe quelques mois avant qu’elle se termine — le temps de t’en servir ou de la prolonger. Rien à programmer, c’est déduit tout seul.',
          en: 'Note a “warranty until…” on a thing’s identity: Babillard nudges you a few months before it lapses — time to use it or extend it. Nothing to schedule; it’s worked out for you.',
        },
      },
      {
        label: { fr: 'Cette saison', en: 'This season' },
        detail: {
          fr: 'L’entretien qui revient se regroupe par saison : une carte « Cet hiver / Ce printemps… » sur le babillard et un aperçu dans Réglages ▸ Routines ▸ Corvées ▸ Entretien montrent ce qui s’en vient avant que la saison tourne — calfeutrer les fenêtres, vider les gouttières, changer le filtre.',
          en: 'Recurring upkeep groups by season: a “This winter / This spring…” card on the board and a glance in Settings ▸ Chores ▸ Upkeep show what’s coming before the season turns — caulk the windows, clear the gutters, change the filter.',
        },
      },
      {
        label: { fr: 'En cas de pépin', en: 'In a pinch' },
        detail: {
          fr: 'Une maison garde aussi son « plan de secours » : où est la valve d’eau, le panneau électrique, la clé de rechange. Les repères « comment ça marche » (partir le lave-vaisselle, le thermostat) ont leur propre section. Tout ça s’affiche tout seul, en lecture seule, dans le lien gardien(ne) — la maison expliquée à qui passe la soirée.',
          en: 'A house also keeps its “in a pinch” map: where’s the water shutoff, the breaker panel, the spare key. The “how things work” notes (run the dishwasher, the thermostat) get their own section. All of it shows up, read-only, in the babysitter link — the house explained to whoever’s over for the evening.',
        },
      },
      {
        label: { fr: 'Calme', en: 'Calm' },
        detail: {
          fr: 'Aucun pointage, aucun inventaire. Le coût est une facture notée, pas un solde. La carte du babillard se montre seulement quand une chose approche de sa fin de vie, sinon elle reste invisible.',
          en: 'No score, no inventory. A cost is a noted invoice, not a balance. The board card only appears when something nears end of life — otherwise it stays out of the way.',
        },
      },
    ],
  },
  {
    id: 'screensaver',
    icon: 'clock-bold',
    group: 'concepts',
    title: { fr: 'Le mode veille', en: 'The screensaver' },
    what: {
      fr: 'Au repos, la tablette se transforme en joli cadran : une grande horloge, la date et tes photos qui défilent doucement. Touche l’écran pour la réveiller.',
      en: 'At rest the tablet becomes a pretty clock face: a big clock, the date and your photos drifting gently by. Touch the screen to wake it.',
    },
    points: [
      {
        label: { fr: 'À ton goût', en: 'Your way' },
        detail: {
          fr: 'Dans Réglages ▸ Système ▸ Mode veille, choisis le délai et ce qui s’affiche (horloge, date, photos, dessins, à venir).',
          en: 'In Settings ▸ Display ▸ Idle mode, pick the delay and what shows (clock, date, photos, drawings, next up).',
        },
        why: {
          fr: 'Le mur de la cuisine reste calme et vivant, sans rien faire.',
          en: 'The kitchen wall stays calm and alive, with nothing to do.',
        },
      },
      {
        label: { fr: 'Mur de souvenirs', en: 'Memory wall' },
        detail: {
          fr: 'Le fond de l’écran de veille mêle tes photos de famille ET les dessins gardés des enfants, qui se fondent doucement l’un dans l’autre. Le mélange suit l’heure du jour : les dessins ressortent le jour, les photos plus calmes le soir. Active ou coupe chacun (Photos / Dessins) dans Mode veille.',
          en: 'The screensaver background blends your family photos AND the kids’ kept drawings, gently cross-fading between them. The mix follows the time of day: drawings lead through the day, calmer photos in the evening. Turn each on or off (Photos / Drawings) in Idle mode.',
        },
        why: {
          fr: 'La tablette au repos devient un cadre vivant des souvenirs de la maisonnée — les vraies photos et l’art des petits, ensemble.',
          en: 'The resting tablet becomes a living frame of the household’s memories — real photos and the little ones’ art, together.',
        },
      },
      {
        label: { fr: 'Le souffle de l’heure', en: 'The hourly breath' },
        detail: {
          fr: 'Au sommet de l’heure, l’horloge de veille respire une fois — un lent battement de 2 secondes, sans son, sans pastille. Le battement de cœur de la maison. Ça se désactive dans Mode veille, et ça respecte le réglage « réduire les animations » de l’appareil.',
          en: 'At the top of the hour, the idle clock breathes once — one slow 2-second beat, no sound, no badge. The house’s heartbeat. Turn it off in Idle mode; it honours the device’s “reduce motion” setting.',
        },
        why: {
          fr: 'Une présence douce qui marque le temps sans jamais réclamer ton attention — le contraire d’une notification.',
          en: 'A soft presence that marks time without ever demanding attention — the opposite of a notification.',
        },
      },
      {
        label: { fr: 'Prendre soin de l’écran', en: 'Caring for the panel' },
        detail: {
          fr: 'L’horloge de veille se déplace d’elle-même de quelques pixels chaque minute (invisible à l’œil) pour qu’une tablette allumée en permanence ne « marque » pas son écran, et le voile s’assombrit la nuit. De ton côté : baisse la luminosité de la tablette vers 30–50 % et, si elle l’offre, programme une plage nuit — l’écran durera des années.',
          en: 'The idle clock shifts itself a few pixels every minute (invisible to the eye) so an always-on tablet never burns its screen, and the veil deepens at night. On your side: set the tablet’s brightness around 30–50% and, if it offers one, schedule a night window — the panel will last for years.',
        },
        why: {
          fr: 'Un meuble ne devrait pas se cicatriser.',
          en: 'Furniture shouldn’t scar.',
        },
      },
      {
        label: { fr: 'Retour à Maisonnée', en: 'Back to Household' },
        detail: {
          fr: 'Sur un kiosque, après un moment sans usage, le visage choisi revient à « Maisonnée » (un petit avertissement avant). Réglable, ou désactivable.',
          en: 'On a kiosk, after a while unused, the picked face drifts back to “Household” (a small heads-up first). Tunable, or off.',
        },
        why: {
          fr: 'Une tablette partagée ne reste jamais bloquée sur une seule personne.',
          en: 'A shared tablet never stays stuck on one person.',
        },
      },
    ],
  },
  {
    id: 'apod',
    icon: 'moon-stars-bold',
    group: 'concepts',
    title: { fr: 'La photo du jour', en: 'The picture of the day' },
    what: {
      fr: 'Derrière la météo du babillard, une belle photo qui change chaque jour. Elle puise dans plusieurs sources gratuites : la photo du jour de Bing (paysages, nature), l’image du jour de Wikipédia, et la NASA (l’espace, la Terre vue d’en haut, le robot sur Mars).',
      en: 'Behind the board’s weather, a beautiful photo that changes every day. It draws from several free sources: Bing’s photo of the day (landscapes, nature), Wikipedia’s picture of the day, and NASA (space, Earth from above, the rover on Mars).',
    },
    points: [
      {
        label: { fr: 'La météo, bien lisible', en: 'The weather, clearly readable' },
        detail: {
          fr: 'La photo sert de fond à la carte météo : la température reste toujours lisible par-dessus. Touche le 🔊 pour entendre ce que montre l’image — dans sa langue, pour une belle prononciation.',
          en: 'The photo is the backdrop of the weather card: the temperature stays readable on top. Tap 🔊 to hear what the image shows — in its own language, for a clean pronunciation.',
        },
        why: {
          fr: 'Un petit moment d’émerveillement chaque jour, sans rien faire.',
          en: 'A small daily moment of wonder, with nothing to do.',
        },
      },
      {
        label: { fr: 'Une autre image', en: 'Another image' },
        detail: {
          fr: 'Le bouton ⟳ dans le coin change de source au hasard quand tu as envie d’autre chose.',
          en: 'The ⟳ button in the corner switches to another source at random whenever you want something different.',
        },
      },
      {
        label: { fr: 'À couper si tu veux', en: 'Turn it off if you like' },
        detail: {
          fr: 'Active ou cache la bande dans Réglages ▸ [[card:display|Affichage]]. Le réglage ne touche que cet appareil.',
          en: 'Show or hide the band in Settings ▸ [[card:display|Display]]. The setting affects this device only.',
        },
      },
    ],
  },
  {
    // NOT the outbound « Partager » link card (id 'share') — this is the PWA
    // share-target (#13): other apps sharing INTO Babillard.
    id: 'share-target',
    icon: 'device-tablet-bold',
    group: 'concepts',
    title: { fr: 'Partager vers Babillard', en: 'Share to Babillard' },
    what: {
      fr: 'Depuis une autre app (courriel, navigateur, photos), utilise « Partager » et choisis Babillard : le texte, le lien ou la photo arrive ici.',
      en: 'From another app (mail, browser, photos), use “Share” and pick Babillard: the text, link or photo lands here.',
    },
    points: [
      {
        label: { fr: 'Texte ou lien', en: 'Text or link' },
        detail: {
          fr: 'Un courriel d’école, une adresse de recette : le texte se pré-remplit dans la capture, et l’app le classe (rendez-vous, liste, repas, note).',
          en: 'A school email, a recipe URL: the text pre-fills capture, and the app sorts it (event, list, meal, note).',
        },
        why: {
          fr: 'Pas de copier-coller — ça va droit au bon endroit.',
          en: 'No copy-paste — it goes straight to the right place.',
        },
      },
      {
        label: { fr: 'Une photo', en: 'A photo' },
        detail: {
          fr: 'Une photo partagée s’épingle sur le babillard comme une note ; ajoute une légende au besoin, efface-la d’un geste.',
          en: 'A shared photo pins to the board like a note; add a caption if you like, clear it with a tap.',
        },
        why: {
          fr: 'L’horaire de sport, un dessin, un souvenir — sur le frigo en deux gestes.',
          en: 'A sports schedule, a drawing, a memory — on the fridge in two taps.',
        },
      },
      {
        label: { fr: 'À installer d’abord', en: 'Install first' },
        detail: {
          fr: 'Le partage n’apparaît qu’une fois Babillard « installé » sur l’appareil (Ajouter à l’écran d’accueil).',
          en: 'Sharing only appears once Babillard is “installed” on the device (Add to Home Screen).',
        },
        why: {
          fr: 'C’est ce qui inscrit Babillard dans le menu Partager du téléphone.',
          en: 'That’s what puts Babillard in the phone’s Share menu.',
        },
      },
    ],
  },
  {
    id: 'share-access',
    icon: 'key-bold',
    group: 'concepts',
    title: { fr: 'Partager un accès', en: 'Share access' },
    what: {
      fr: 'Donne à quelqu’un un lien en lecture seule, sans lui ouvrir toute la maison : on choisit ce qu’il voit, et le lien s’éteint tout seul.',
      en: 'Give someone a read-only link without opening the whole house: you pick what they see, and the link expires on its own.',
    },
    points: [
      {
        label: { fr: 'Six genres de liens', en: 'Six kinds of links' },
        detail: {
          fr: '« Démo » montre tout le babillard en lecture seule (tes vraies données, pour « regarde mon app »); « Gardienne » montre la journée + les routines + les infos à savoir + les urgences + le wifi; « Accueil » montre le wifi + le jour des poubelles + les règles de la maison; « Famille » est la fenêtre des grands-parents (dates des enfants + anniversaires + photos); « Fiche famille » et « Boîte aux lettres » sont les deux liens qui écrivent — l’un pour qu’un proche remplisse ses coordonnées, l’autre pour qu’il laisse un mot sur le babillard.',
          en: '“Demo” shows the whole board read-only (your real data, for “look at my app”); “Sitter” shows today + the routines + things-to-know + emergencies + wifi; “Welcome” shows the wifi + bin day + house rules; “Family” is the grandparents’ window (kids’ dates + birthdays + photos); “Family details” and “Postbox” are the two writable links — one for a relative to fill in their own info, the other to leave a note on the board.',
        },
        why: {
          fr: 'Chaque visiteur a un besoin différent — un genre par besoin, jamais plus.',
          en: 'Each visitor has a different need — one kind per need, never more.',
        },
      },
      {
        label: { fr: '« Fiche famille » — remplie et renvoyée', en: '“Family details” — filled and sent back' },
        detail: {
          fr: 'Au lieu de tout saisir toi-même, envoie un lien « Fiche famille ». Le proche remplit ses coordonnées (et, s’il veut, sa maisonnée, ses animaux, et une photo), puis envoie. Tu choisis « Pour une personne » (le lien met à jour SA fiche) ou un « lien ouvert » que toute la famille peut remplir. Rien n’entre dans Le cercle tout de suite : la fiche t’attend dans Réglages ▸ Partage (« Fiches reçues ») — tu révises, tu coches qui ajouter, puis « Compléter les familles » déduit le reste (frères, beaux-parents…).',
          en: 'Instead of typing it all yourself, send a “Family details” link. The relative fills in their info (and, if they like, their household, their pets, and a photo), then sends. You pick “For one person” (the link updates THEIR card) or an “open link” the whole family can fill. Nothing enters Le cercle right away: the form waits in Settings ▸ Sharing (“Forms received”) — you review, tick who to add, then “Complete families” infers the rest (siblings, in-laws…).',
        },
        why: {
          fr: 'Ce sont eux qui connaissent leur anniversaire et leur numéro — laisse-les l’écrire, garde le contrôle de ce qui entre.',
          en: 'They’re the ones who know their birthday and number — let them write it, keep control of what lands.',
        },
      },
      {
        label: { fr: '« Boîte aux lettres » — un mot sur le babillard', en: '“Postbox” — a note on the board' },
        detail: {
          fr: 'Envoie un lien « Boîte aux lettres » à la parenté. Le proche se nomme, puis laisse un mot écrit, un message vocal, un dessin ou une photo — sans compte, depuis son téléphone. Rien n’apparaît tout de suite : le message t’attend dans Réglages ▸ Partage (« Messages reçus »). Tu acceptes, et il se pose sur le babillard comme une note de frigo, signé de son nom (et, si le nom correspond à un visage de la maisonnée, à sa couleur). C’est un lien ouvert : toute la famille peut s’en servir.',
          en: 'Send relatives a “Postbox” link. They say who they are, then leave a written note, a voice message, a drawing or a photo — no account, from their phone. Nothing appears right away: the message waits in Settings ▸ Sharing (“Messages received”). You accept it, and it lands on the board like a fridge note, signed with their name (and, if the name matches a household face, its colour). It’s an open link the whole family can use.',
        },
        why: {
          fr: 'Mamie n’a pas besoin de l’appli pour faire un coucou sur la tablette du mur — un lien suffit, et tu choisis ce qui s’affiche.',
          en: 'Grandma doesn’t need the app to say hello on the wall tablet — a link is enough, and you choose what shows.',
        },
      },
      {
        label: { fr: 'Tu choisis quoi demander', en: 'You choose what to ask for' },
        detail: {
          fr: 'À la création du lien, coche ce que le formulaire demande : anniversaire, téléphone/courriel, adresse, sa maisonnée, ses animaux, une photo. Le prénom est toujours demandé; le reste est optionnel — un formulaire court se remplit plus souvent.',
          en: 'When you create the link, tick what the form asks for: birthday, phone/email, address, their household, their pets, a photo. The first name is always asked; the rest is optional — a short form gets filled more often.',
        },
        why: {
          fr: 'Demande seulement ce dont tu as besoin — moins d’effort pour eux, moins de tri pour toi.',
          en: 'Ask only for what you need — less effort for them, less sorting for you.',
        },
      },
      {
        label: { fr: 'Photos et animaux', en: 'Photos and pets' },
        detail: {
          fr: 'Une photo envoyée attend dans une zone temporaire jusqu’à ce que tu l’ajoutes — elle se pose alors sur la bonne fiche; si tu ignores la fiche, la photo est effacée. Les animaux deviennent des fiches d’animal reliées à leur propriétaire.',
          en: 'A sent photo waits in a temporary holding area until you add it — then it lands on the right card; if you dismiss the form, the photo is deleted. Pets become pet cards linked to their owner.',
        },
        why: {
          fr: 'Rien ne traîne dans le stockage : une photo non utilisée est nettoyée toute seule.',
          en: 'Nothing lingers in storage: an unused photo is cleaned up on its own.',
        },
      },
      {
        label: { fr: 'Pas de doublons', en: 'No duplicates' },
        detail: {
          fr: 'Si la personne existe déjà (même courriel, téléphone ou nom), la révision propose de FUSIONNER au lieu de créer un doublon — et ne remplace jamais une info que tu as déjà par un champ vide. Tu peux toujours forcer « Créer une nouvelle fiche ».',
          en: 'If the person already exists (same email, phone or name), the review offers to MERGE instead of creating a duplicate — and never overwrites info you already have with a blank field. You can always force “Create a new card”.',
        },
      },
      {
        label: { fr: 'Lecture seule et minuté', en: 'Read-only and time-boxed' },
        detail: {
          fr: 'Un lien ne peut rien modifier, et par défaut il expire de lui-même (de 30 minutes à une semaine selon le genre) — sauf un lien « Durable », qui reste actif jusqu’à ce que tu le révoques (voir plus bas).',
          en: 'A link can change nothing, and by default it expires on its own (30 minutes to a week depending on the kind) — except a “Durable” link, which stays active until you revoke it (see below).',
        },
        why: {
          fr: 'Rien à révoquer ni à nettoyer pour un lien minuté : le temps fait le ménage.',
          en: 'Nothing to revoke or clean up for a time-boxed link: time does the housekeeping.',
        },
      },
      {
        label: { fr: '« Infos à partager »', en: '“Info to share”' },
        detail: {
          fr: 'Un petit éditeur (wifi, règles de la maison, jour des poubelles) alimente les liens Gardienne et Accueil — tu le remplis une fois dans Réglages.',
          en: 'A small editor (wifi, house rules, bin day) feeds the Sitter and Welcome links — you fill it once in Settings.',
        },
      },
      {
        label: { fr: 'Aperçu et impression', en: 'Preview and print' },
        detail: {
          fr: 'Le bouton « Aperçu » te montre exactement ce que le visiteur verra; la carte d’accueil s’imprime pour la coller sur le frigo ou près de la porte.',
          en: 'The “Preview” button shows exactly what the visitor will see; the welcome card prints to tape on the fridge or by the door.',
        },
      },
      {
        label: { fr: 'La vie privée d’abord', en: 'Privacy first' },
        detail: {
          fr: 'Un lien ciblé ne voit que sa propre vue — jamais le reste de la maison, même s’il bricole l’adresse.',
          en: 'A targeted link only sees its own view — never the rest of the house, even if it fiddles with the URL.',
        },
        why: {
          fr: 'La barrière est côté serveur, pas juste dans l’affichage.',
          en: 'The boundary is on the server, not just in the display.',
        },
      },
      {
        // D-18 (bmad/10) « Le pont » — a durable, named, revocable guest.
        label: { fr: 'Un lien durable et nommé', en: 'A durable, named link' },
        detail: {
          fr: 'À la création, choisis « Durable — jusqu’à révocation » (n’importe quel genre de lien) pour un accès qui ne s’éteint jamais tout seul — utile pour Mamie ou une gardienne régulière. Donne-lui un nom (« Pour qui ? ») pour le reconnaître dans « Liens actifs », où « Révoquer » est la SEULE façon de le fermer. Tu peux aussi fixer sa langue, si le proche ne lit pas dans la langue de la maisonnée. Pour la « Boîte aux lettres », son prochain passage sur ce lien affiche un petit « reçu ✓ » discret dès que son dernier mot a été accepté.',
          en: 'When you create it, pick “Durable — until revoked” (any kind of link) for access that never turns itself off on its own — handy for Grandma or a regular sitter. Give it a name (“For whom?”) so you can recognize it in “Active links”, where “Revoke” is the ONLY way to close it. You can also fix its language, if the relative doesn’t read the household’s language. For “Postbox”, their next visit on that link shows a small quiet “received ✓” once their last note has been accepted.',
        },
        why: {
          fr: 'Une gardienne régulière ou une grand-maman n’a pas à redemander un lien chaque semaine — et sait que son mot a bien été lu.',
          en: 'A regular sitter or a grandma doesn’t need to ask for a fresh link every week — and knows their note was actually read.',
        },
      },
      {
        // D-19 (bmad/10) « La carte de la gardienne se complète ».
        label: { fr: 'La carte gardienne te montre ses trous', en: 'The sitter card shows you its own gaps' },
        detail: {
          fr: 'En choisissant « Gardienne », un petit avis discret liste ce qui manque encore (contacts d’urgence, à savoir, routines du soir, wifi, en cas de pépin) — touche un élément pour aller le compléter. Ça n’empêche jamais de générer le lien : une section vide reste juste vide pour la gardienne. Tu peux aussi cocher « Joindre un parent » et choisir qui — la carte affiche alors son numéro tout en haut, pour un changement de plan en cours de soirée.',
          en: 'When you pick “Sitter”, a small quiet notice lists what’s still missing (emergency contacts, things to know, bedtime routines, wifi, in case of trouble) — tap an item to go complete it. It never stops you from generating the link — an empty section just stays empty for the sitter. You can also tick “Reach a parent” and pick who — the card then shows their number right at the top, for a plan change mid-evening.',
        },
        why: {
          fr: 'La carte gardienne est le lien le plus utilisé de l’appli — mieux vaut voir ses trous avant de l’envoyer que d’en entendre parler à 19 h.',
          en: 'The sitter card is the most-used link in the app — better to see its gaps before sending it than to hear about them at 7 pm.',
        },
      },
    ],
  },
  {
    id: 'cast-tv',
    icon: 'link-bold',
    group: 'concepts',
    route: '/settings?tab=settings&sub=tablets',
    title: { fr: 'Le babillard au salon (téléviseur)', en: 'The board in the living room (TV)' },
    what: {
      fr: 'Affiche le babillard en lecture seule sur la télé du salon — un écran d’appoint calme, sans toucher à ton compte. Tu le mets en place une fois dans Réglages ▸ Partage ▸ « Au salon ».',
      en: 'Show the board read-only on the living-room TV — a calm second screen, without touching your account. You set it up once in Settings ▸ Sharing ▸ “Living room”.',
    },
    points: [
      {
        label: { fr: 'Le lien court — facile à taper sur la télé', en: 'The short link — easy to type on the TV' },
        detail: {
          fr: 'Génère le lien : tu obtiens une adresse courte du genre babillard…/tv/k7m2 (4 caractères). Tape-la une fois dans le navigateur du téléviseur, puis garde-la en favori — le babillard s’affiche tout seul. Pas besoin de l’ordinateur ni de copier la longue adresse.',
          en: 'Generate the link: you get a short address like babillard…/tv/k7m2 (4 characters). Type it once in the TV’s browser, then bookmark it — the board shows on its own. No computer, no long URL to copy.',
        },
        why: {
          fr: 'Une télécommande ne peut pas taper la longue adresse; quatre caractères, oui.',
          en: 'A remote can’t type the long address; four characters, it can.',
        },
      },
      {
        label: { fr: 'Le babillard ou l’ambiance', en: 'The board or the ambience' },
        detail: {
          fr: 'Choisis l’écran : « Le babillard » (la vraie page complète) ou « Ambiance » (l’horloge / cadre-photo plein écran, comme l’[[card:screensaver|économiseur d’écran]]). Le lien court se souvient de ton choix.',
          en: 'Pick the screen: “The board” (the full real page) or “Ambience” (the full-screen clock / photo-frame, like the [[card:screensaver|screensaver]]). The short link remembers your choice.',
        },
      },
      {
        label: { fr: 'Diffuser depuis Chrome (en bonus)', en: 'Cast from Chrome (a bonus)' },
        detail: {
          fr: 'Sur un ordinateur avec Google Chrome, le bouton « Diffuser maintenant » l’envoie au Chromecast en un clic. Les iPhone/iPad ne peuvent pas lancer une diffusion (Apple le bloque) — d’où le lien à ouvrir directement sur la télé, qui marche pour tout le monde.',
          en: 'On a computer with Google Chrome, the “Cast now” button sends it to the Chromecast in one tap. iPhones/iPads can’t start a cast (Apple blocks it) — hence the link you open right on the TV, which works for everyone.',
        },
      },
      {
        label: { fr: 'Permanent, et révocable', en: 'Permanent, and revocable' },
        detail: {
          fr: 'La télé devient un appareil « écran » qui garde l’affichage indéfiniment. Elle apparaît dans Réglages ▸ Tablettes avec les autres : un seul bouton la révoque — et son lien court cesse aussitôt de fonctionner.',
          en: 'The TV becomes a “display” device that holds the screen indefinitely. It appears in Settings ▸ Tablets with the others: one button revokes it — and its short link stops working at once.',
        },
        why: {
          fr: 'Un écran d’appoint permanent doit pouvoir s’éteindre proprement quand tu le veux.',
          en: 'A permanent second screen must be able to be shut off cleanly when you want.',
        },
      },
      {
        label: { fr: 'Lecture seule', en: 'Read-only' },
        detail: {
          fr: 'La télé ne peut rien modifier — ni cocher, ni ouvrir un détail, ni atteindre les réglages. C’est une vitrine, pas une télécommande.',
          en: 'The TV can change nothing — no checking off, no opening a detail, no reaching settings. It’s a window, not a remote.',
        },
      },
    ],
  },
  {
    id: 'surface',
    icon: 'device-tablet-bold',
    group: 'concepts',
    title: { fr: 'Tablette ou téléphone (la « surface »)', en: 'Tablet or phone (the “surface”)' },
    what: {
      fr: 'Chaque appareil a un rôle : tablette au mur (partagée, à distance) ou téléphone perso (sur le pouce). L’app s’ajuste.',
      en: 'Each device has a role: wall tablet (shared, glanceable) or personal phone (on the go). The app adjusts.',
    },
    points: [
      {
        label: { fr: 'Choisi à l’installation', en: 'Chosen at setup' },
        detail: {
          fr: 'On le demande une fois : la tablette montre le grand babillard à lire de loin; le téléphone, une barre d’onglets sous le pouce.',
          en: 'Asked once: the tablet shows the big board to read from afar; the phone, a thumb-reach tab bar.',
        },
        why: {
          fr: 'Pour que chaque appareil montre la disposition qui convient à son rôle.',
          en: 'So each device shows the layout that fits its role.',
        },
      },
      {
        label: { fr: 'Ce n’est pas une sécurité', en: 'Not a permission' },
        detail: {
          fr: 'C’est juste de la présentation.',
          en: 'It’s only presentation.',
        },
        why: {
          fr: 'Ce qui protège vraiment l’écriture, c’est la connexion et le jumelage.',
          en: 'What actually protects writing is the login and the pairing.',
        },
      },
    ],
  },
  {
    id: 'audience',
    icon: 'smiley-bold',
    group: 'concepts',
    title: { fr: 'Vue parent, enfant ou simple (l’« audience »)', en: 'Parent, kid or simple view (the “audience”)' },
    what: {
      fr: 'La même information, montrée pour un parent, pour un tout-petit pré-lecteur ou en version « Simple » (grands boutons, gros texte). Chaque section sait s’afficher de toutes ces façons.',
      en: 'The same information, shown for a parent, for a pre-reader toddler, or as a “Simple” view (big buttons, large text). Each section knows how to show every way.',
    },
    points: [
      {
        label: { fr: 'La vue « Simple » (grand-parent, visite)', en: 'The “Simple” view (grandparent, visitor)' },
        detail: {
          fr: 'Dans Réglages ▸ Système ▸ Affichage, choisis « Simple » : tout devient plus gros, le babillard se résume à quatre grandes zones (Aujourd’hui, Souper, La liste, Notes), et les autres onglets restent complets — vrais mots, tout fonctionne. Démarre la tablette avec « ?simple=1 » pour la verrouiller sur cette vue; pour sortir, garde le doigt ~3 s sur l’interrupteur du bas (pas d’addition — c’est pensé pour un adulte).',
          en: 'In Settings ▸ System ▸ Display, pick “Simple”: everything gets bigger, the board becomes four large zones (Today, Supper, The list, Notes), and the other tabs stay complete — real words, everything works. Boot the tablet with “?simple=1” to lock it on this view; to leave, hold the bottom switch ~3 s (no sum — it’s made for an adult).',
        },
        why: {
          fr: 'Pour tendre l’appareil à un grand-parent ou une visite qui lit très bien mais veut calme, gros et parlé.',
          en: 'So you can hand the device to a grandparent or a visitor who reads fine but wants calm, big and spoken.',
        },
      },
      {
        label: { fr: 'Toucher pour entendre', en: 'Touch to hear' },
        detail: {
          fr: 'En vue Enfant ou Simple, garde le doigt une demi-seconde sur une ligne (une activité, un article de la liste, une note, une tuile) pour l’entendre à voix haute — sans rien déclencher. Ça se désactive dans Réglages ▸ Système ▸ Affichage ▸ Voix.',
          en: 'In the Kid or Simple view, hold a finger half a second on a line (an activity, a list item, a note, a tile) to hear it read aloud — without triggering anything. Turn it off in Settings ▸ System ▸ Display ▸ Voice.',
        },
        why: {
          fr: 'Entendre sans agir : on peut se faire lire n’importe quoi sans peur d’appuyer « pour vrai ».',
          en: 'Hear without acting: anything can be read to you with no fear of pressing “for real”.',
        },
      },
      {
        label: { fr: 'Passer en vue enfant', en: 'Switch to kid view' },
        detail: {
          fr: 'Touche [[icon:baby-bold]] dans la barre, ou démarre la tablette « verrouillée enfant » pour qu’elle reste sur cette vue.',
          en: 'Tap [[icon:baby-bold]] in the bar, or boot the tablet “kid-locked” so it stays on that view.',
        },
        why: {
          fr: 'Pour tendre l’appareil à un tout-petit sans qu’il tombe sur du texte ou des réglages.',
          en: 'So you can hand the device to a toddler without them landing on text or settings.',
        },
      },
      {
        label: { fr: 'Une porte à sens unique', en: 'A one-way door' },
        detail: {
          fr: 'En vue enfant, il n’y a aucun bouton pour revenir — exprès.',
          en: 'In kid view there’s no button back — on purpose.',
        },
        why: {
          fr: 'Pour qu’un tout-petit ne se promène pas dans les réglages.',
          en: 'So a toddler can’t wander into settings.',
        },
      },
      {
        label: { fr: 'Comment ressortir', en: 'How to get out' },
        detail: {
          fr: 'Garde le doigt appuyé ~3 s dans le coin haut-gauche, puis réponds à la petite addition.',
          en: 'Press and hold ~3 s in the top-left corner, then answer the little sum.',
        },
        why: {
          fr: 'Pensé pour un adulte, pas pour l’enfant.',
          en: 'Made for an adult, not the child.',
        },
      },
      {
        label: { fr: 'Le truc de l’adresse web', en: 'The web-address trick' },
        detail: {
          fr: 'Depuis un navigateur (pas l’app installée), ajoute « ?kid=1 » à l’adresse pour démarrer verrouillé enfant, et « ?kid=0 » pour ressortir.',
          en: 'From a browser (not the installed app), add “?kid=1” to the address to boot kid-locked, and “?kid=0” to get back out.',
        },
        why: {
          fr: 'Un raccourci pratique pour verrouiller ou déverrouiller sans passer par les boutons.',
          en: 'A handy shortcut to lock or unlock without going through the buttons.',
        },
      },
    ],
  },
  {
    id: 'calm',
    icon: 'tree-bold',
    group: 'concepts',
    title: { fr: 'Le calme (par choix)', en: 'Calm (by design)' },
    what: {
      fr: 'L’app refuse volontairement ce qui rend accro : pas de points, pas de pastilles rouges, pas de notifications, pas de fil sans fin.',
      en: 'The app deliberately refuses the addictive stuff: no points, no red badges, no notifications, no endless feed.',
    },
    points: [
      {
        label: { fr: 'Les listes se vident', en: 'Lists empty out' },
        detail: {
          fr: 'La liste du jour se termine et reste vide.',
          en: 'The day’s list finishes and stays empty.',
        },
        why: {
          fr: 'Rien à entretenir pour le plaisir d’entretenir.',
          en: 'Nothing to maintain for the sake of maintaining.',
        },
      },
      {
        label: { fr: 'Mode calme (option)', en: 'Calm mode (toggle)' },
        detail: {
          fr: 'Dans Réglages, tu peux adoucir la friction de « refaire » la routine d’enfant. C’est la seule partie ajustable.',
          en: 'In Settings, you can soften the “redo” friction of the kid routine. That’s the only adjustable part.',
        },
        why: {
          fr: 'C’est la seule friction réglable — le reste du calme (listes qui se vident, « annuler » partout, zéro score dans les routines) est partout dans l’app et ne se touche pas.',
          en: 'It’s the only adjustable friction — the rest of the calm (lists that empty, “undo” everywhere, zero score in routines) is all over the app and can’t be touched.',
        },
      },
      {
        label: { fr: 'Garanti, pas négociable', en: 'Guaranteed, not negotiable' },
        detail: {
          fr: 'L’absence de points / notifications / inventaire est verrouillée dans le code.',
          en: 'The absence of points / notifications / inventory is locked in code.',
        },
        why: {
          fr: 'Impossible de la réactiver par accident — le calme ne peut pas dériver.',
          en: 'It can’t be switched back on by accident — the calm can’t drift.',
        },
      },
      {
        label: { fr: 'Tes données t’appartiennent', en: 'Your data is yours' },
        detail: {
          fr: 'Dans Réglages ▸ Système ▸ Diagnostics, « Emporter mes données » télécharge tout ce que Babillard garde pour ta maisonnée en un seul fichier JSON. Une copie de secours se fait aussi chaque nuit, automatiquement.',
          en: 'In Settings ▸ System ▸ Diagnostics, “Take my data” downloads everything Babillard keeps for your household as one JSON file. A backup copy is also made automatically every night.',
        },
        why: {
          fr: 'La confiance, c’est pouvoir partir — ou juste garder sa propre copie.',
          en: 'Trust means being able to leave — or just keep your own copy.',
        },
      },
    ],
  },
  {
    id: 'reminders',
    icon: 'clock-bold',
    group: 'concepts',
    title: { fr: 'Rappels « Bientôt »', en: '“Soon” reminders' },
    what: {
      fr: 'Un rendez-vous ou une corvée peut se faire remarquer à l’avance : choisis « Afficher dès » dans son formulaire, et le babillard lui ajoute une petite pastille « Bientôt » quand le moment approche.',
      en: 'An event or chore can draw attention ahead of time: pick “Show from” in its form, and the board adds a small “Soon” chip as the moment nears.',
    },
    points: [
      {
        label: { fr: 'Tu choisis le délai', en: 'You pick the lead' },
        detail: {
          fr: 'De « 3 h avant » à « 1 semaine avant ». À partir de là, la rangée porte la pastille « Bientôt » jusqu’à l’heure dite.',
          en: 'From “3 h before” to “1 week before”. From then on, the row carries the “Soon” chip right up to the time itself.',
        },
        why: {
          fr: 'Pour garder l’œil sur ce qui s’en vient — la veille d’un rendez-vous, quelques heures avant un souper.',
          en: 'To keep an eye on what’s coming — the day before an appointment, a few hours before a supper.',
        },
      },
      {
        label: { fr: 'Ça ne cache rien', en: 'It hides nothing' },
        detail: {
          fr: 'C’est seulement une mise en évidence : rien n’est masqué, rien ne sonne, aucune notification.',
          en: 'It’s only emphasis: nothing is hidden, nothing rings, no notification.',
        },
        why: {
          fr: 'Fidèle au calme de l’app — un rappel qui attire l’œil au passage, jamais qui interrompt.',
          en: 'True to the app’s calm — a reminder that catches the eye in passing, never one that interrupts.',
        },
      },
    ],
  },
  {
    id: 'moment',
    icon: 'sun-bold',
    group: 'concepts',
    title: { fr: '« Moments » : ta ligne du temps', en: '“Moments”: your timeline' },
    what: {
      fr: 'Une vue qui rassemble tout ce qui s’en vient pour un moment choisi — ce soir, demain, une date, ou la semaine — au même endroit : l’agenda, le souper, les corvées, l’auto… et la liste « À compléter » de chaque journée, à cocher sur place.',
      en: 'One view that gathers everything coming up for a chosen moment — tonight, tomorrow, a date, or the week — in one place: the agenda, supper, chores, the car… and each day’s “To complete” list, checkable right there.',
    },
    points: [
      {
        label: { fr: 'Choisis le moment', en: 'Pick the moment' },
        detail: {
          fr: 'En haut, un sélecteur : « Ce soir » (le reste de la journée), « Demain », « Une date » (choisis-la au calendrier), ou « Cette semaine » (les sept prochains jours, jour par jour).',
          en: 'At the top, a selector: “Tonight” (the rest of today), “Tomorrow”, “A date” (pick it on the calendar), or “This week” (the next seven days, day by day).',
        },
        why: {
          fr: 'Le coup d’œil du soir — « c’est quoi, demain ? » — sans fouiller le babillard, le menu et l’auto un par un.',
          en: 'The evening glance — “what does tomorrow look like?” — without digging through the board, the menu and the car one by one.',
        },
      },
      {
        label: { fr: 'Le passage de relais, en un geste', en: 'The quick handoff, in one tap' },
        detail: {
          fr: 'Chaque journée porte sa liste « À compléter » directement dans la vue. Le bouton « Avant de partir » dépose ta liste de départ sur CETTE journée d’un seul geste, ou ajoute une autre liste prête (« Chez grand-papa ») et coche-la sur place — parfait pour préparer demain ou briefer la gardienne.',
          en: 'Each day carries its “To complete” list right in the view. The “Before you go” button drops your leaving checklist onto THAT day in one tap, or add another ready list (“At grandpa’s”) and tick it off in place — perfect for prepping tomorrow or briefing the sitter.',
        },
        why: {
          fr: 'La vue récapitulative devient aussi l’endroit où tu prépares — voir et agir au même endroit.',
          en: 'The recap view doubles as where you prepare — see and act in the same place.',
        },
      },
      {
        label: { fr: 'Ce soir dans le ciel', en: 'In the sky tonight' },
        detail: {
          fr: 'Sur « Ce soir » et « Demain », une petite ligne montre la phase de la lune de ce soir 🌙. Touche-la pour l’entendre. C’est calculé sur l’appareil — ça marche même hors ligne, sans rien à régler.',
          en: 'On “Tonight” and “Tomorrow”, a small line shows tonight’s moon phase 🌙. Tap it to hear it. It’s computed on the device — it works offline, with nothing to set up.',
        },
        why: {
          fr: 'Un petit point d’émerveillement à hauteur d’enfant, à regarder dehors le soir.',
          en: 'A small wonder at a child’s level, to look up at outside in the evening.',
        },
      },
      {
        label: { fr: 'Pour agir en détail, ouvre la journée', en: 'To edit in detail, open the day' },
        detail: {
          fr: 'Le bouton « Planifier cette journée » mène à la page du jour pour ajouter ou modifier repas et rendez-vous. « Moments » reste un coup d’œil calme — il ne compte rien, ne classe personne.',
          en: 'The “Plan this day” button opens the day page to add or edit meals and events. “Moments” stays a calm glance — it counts nothing, ranks no one.',
        },
      },
      {
        label: { fr: 'Où la trouver', en: 'Where to find it' },
        detail: {
          fr: 'C’est une vue du babillard : touche « Moments » dans le sélecteur de vue (Grille · Maintenant · Par personne · Mois · Moments). En prime, le soir, le babillard montre un discret « Demain en bref » qui l’ouvre directement sur demain.',
          en: 'It’s one of the board’s views: tap “Moments” in the view switcher (Grid · Now · Per person · Month · Moments). As a bonus, in the evening the board shows a quiet “Tomorrow at a glance” that opens it straight on tomorrow.',
        },
      },
    ],
  },
  {
    id: 'pairing',
    icon: 'link-bold',
    group: 'concepts',
    title: { fr: 'Jumeler une tablette', en: 'Pairing a tablet' },
    what: {
      fr: 'Comment une tablette au mur obtient le droit de voir le babillard, sans donner ton mot de passe à un appareil partagé.',
      en: 'How a wall tablet earns the right to see the board, without handing your password to a shared device.',
    },
    points: [
      {
        label: { fr: 'Un code à 6 chiffres', en: 'A 6-digit code' },
        detail: {
          fr: 'La tablette affiche un code que tu approuves depuis ton téléphone dans Réglages ▸ Appareils.',
          en: 'The tablet shows a code you approve from your phone in Settings ▸ Devices.',
        },
        why: {
          fr: 'La preuve que c’est bien toi, et bien cette tablette-là, qui obtient l’accès.',
          en: 'Proof that it’s really you, and really that tablet, getting access.',
        },
      },
      {
        label: { fr: 'Un jeton révocable', en: 'A revocable token' },
        detail: {
          fr: 'Une fois approuvée, la tablette garde un jeton — pas ton mot de passe.',
          en: 'Once approved, the tablet keeps a token — not your password.',
        },
        why: {
          fr: 'Tu peux le retirer à tout moment, sans avoir à changer ton mot de passe.',
          en: 'You can revoke it anytime, without having to change your password.',
        },
      },
      {
        label: { fr: 'Si elle perd l’accès', en: 'If it loses access' },
        detail: {
          fr: 'Si tu retires l’appareil, la tablette montre un écran plein « accès perdu » avec « Re-jumeler » et « Réessayer ».',
          en: 'If you remove the device, the tablet shows a full “access lost” screen with “Re-pair” and “Retry”.',
        },
        why: {
          fr: '« Réessayer » couvre une simple panne passagère, et re-jumeler exige toujours ton approbation.',
          en: '“Retry” covers a passing blip, and re-pairing always needs your approval.',
        },
      },
    ],
  },
  {
    id: 'deals',
    icon: 'tag-bold',
    group: 'concepts',
    title: { fr: 'Rabais & circulaires', en: 'Deals & flyers' },
    what: {
      fr: 'Trouve les rabais d’épicerie près de chez toi et accroche-les à un article de ta liste, pour le présenter à la caisse.',
      en: 'Find grocery deals near you and attach one to an item on your list, to show at the till.',
    },
    points: [
      {
        label: { fr: 'Attaché à un article', en: 'Attached to an item' },
        detail: {
          fr: 'Le rabais voyage avec l’article de liste et s’affiche sur tous tes appareils. Il reste générique (jamais renommé). À la caisse, présente-le en [[card:cashier|mode caissier]].',
          en: 'The deal rides on the list item and shows on all your devices. It stays generic (never renamed). At the till, present it in [[card:cashier|cashier mode]].',
        },
        why: {
          fr: 'Pour qu’un même article (« fromage ») puisse porter un rabais différent d’une semaine à l’autre, sans se dédoubler.',
          en: 'So one item (“cheese”) can carry a different deal week to week, without splitting into duplicates.',
        },
      },
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets ton code postal dans Réglages ▸ La liste ▸ Magasinage.',
          en: 'Set your postal code in Settings ▸ Shopping.',
        },
        why: {
          fr: 'Pour voir les rabais des magasins proches de chez toi.',
          en: 'So you see deals from the stores near you.',
        },
      },
      {
        label: { fr: 'La vraie circulaire', en: 'The real flyer' },
        detail: {
          fr: 'L’app reconstruit les rabais; pour la circulaire complète, elle te renvoie vers le site du marchand. Pour les feuilleter en détail, vois [[card:flyers|Naviguer les circulaires]].',
          en: 'The app reconstructs the deals; for the full flyer it links you out to the merchant’s site. To leaf through them in detail, see [[card:flyers|Browsing the flyers]].',
        },
        why: {
          fr: 'Pour chercher vite dans l’app, tout en gardant accès à la page officielle complète quand tu la veux.',
          en: 'So you can search fast in-app, while still reaching the full official page when you want it.',
        },
      },
    ],
  },
  {
    id: 'cashier',
    icon: 'receipt-bold',
    group: 'concepts',
    title: { fr: 'Mode caissier', en: 'Cashier mode' },
    what: {
      fr: 'À la caisse : une grille de tes rabais. Touche celui que la caissière scanne pour montrer sa preuve de prix, en grand.',
      en: 'At the till: a grid of your deals. Tap the one being scanned to show its price proof, big.',
    },
    points: [
      {
        label: { fr: 'Touche, pas défile', en: 'Tap, don’t scroll' },
        detail: {
          fr: 'Tes articles avec un rabais, en grille. Touche celui qui passe sur le tapis — dans n’importe quel ordre.',
          en: 'Your items with a deal, in a grid. Tap whichever is on the belt — in any order.',
        },
        why: {
          fr: 'Les articles passent dans le désordre : tu choisis, tu n’avances pas dans une liste fixe.',
          en: 'Items come down the belt out of order: you pick, you don’t advance through a fixed list.',
        },
      },
      {
        label: { fr: 'Preuve de prix', en: 'Price proof' },
        detail: {
          fr: 'Montre le [[card:deals|rabais]] accroché à l’article : image de circulaire, magasin, prix, dates de validité. [[icon:caret-left-bold]] Retour pour revenir à la grille.',
          en: 'Shows the [[card:deals|deal]] attached to the item: flyer image, store, price, valid dates. [[icon:caret-left-bold]] Back returns to the grid.',
        },
        why: {
          fr: 'De quoi réclamer l’ajustement « Imbattable » à la caisse, preuve à l’appui.',
          en: 'Enough to claim the price-match at the till, with the proof in hand.',
        },
      },
      {
        label: { fr: 'Déjà montré', en: 'Already shown' },
        detail: {
          fr: 'Un article montré se grise avec un ✓. « Tout réafficher » remet la grille à neuf.',
          en: 'A shown item dims with a ✓. “Show all again” resets the grid.',
        },
        why: {
          fr: 'Pour suivre où tu en es dans un gros panier — sans pointage ni compte (ça reste calme).',
          en: 'To keep track in a big cart — with no score or count (it stays calm).',
        },
      },
    ],
  },
  {
    id: 'recipes',
    icon: 'book-open-bold',
    group: 'concepts',
    title: { fr: 'Recettes & mode cuisson', en: 'Recipes & cook mode' },
    what: {
      fr: 'Garde tes recettes et cuisine-les en plein écran, les mains à la pâte, sans rien toucher de fin.',
      en: 'Keep your recipes and cook them full-screen, hands in the dough, without any fiddly tapping.',
    },
    points: [
      {
        label: { fr: 'Importer facilement', en: 'Easy import' },
        detail: {
          fr: 'D’une photo, d’un collé-copié de page web, ou à la main. L’IA met les étapes au propre quand elle est là.',
          en: 'From a photo, a pasted web page, or by hand. AI tidies the steps when available.',
        },
        why: {
          fr: 'Pour faire entrer une recette sans tout retaper.',
          en: 'So you can get a recipe in without retyping it all.',
        },
      },
      {
        label: { fr: 'Mode cuisson', en: 'Cook mode' },
        detail: {
          fr: 'Plein écran, gros texte, les mains à la pâte. Il garde l’écran allumé, lit l’étape à voix haute et se ferme par un petit [[icon:x-bold]]. Tout son détail (minuteries, photos d’étape) est dans [[card:cookmode|Le mode cuisson en détail]].',
          en: 'Full screen, big text, hands in the dough. It keeps the screen awake, reads the step aloud, and closes with a small [[icon:x-bold]]. All its detail (timers, step photos) is in [[card:cookmode|Cook mode in detail]].',
        },
        why: {
          fr: 'Pour suivre la recette les mains à la pâte, sans rien toucher de fin. Tu peux aussi en faire une [[card:routines|routine pour enfant]].',
          en: 'To follow the recipe hands-in-the-dough, with nothing fiddly to tap. You can also turn it into a [[card:routines|kid routine]].',
        },
      },
      {
        label: { fr: 'Trois affichages (parent)', en: 'Three layouts (parent)' },
        detail: {
          fr: 'En vue parent, un sélecteur dans la barre choisit : [[icon:scroll-bold]] Recette (toute la page), [[icon:book-open-bold]] Côte à côte (ingrédients à gauche, étapes à droite — deux onglets sur le téléphone) ou [[icon:square-bold]] Focus (une étape à la fois). Ton choix est retenu par recette. L’enfant garde toujours le pas-à-pas.',
          en: 'In the parent view a bar switcher picks: [[icon:scroll-bold]] Recipe (whole page), [[icon:book-open-bold]] Side by side (ingredients left, steps right — two tabs on a phone) or [[icon:square-bold]] Focus (one step at a time). Your pick is remembered per recipe. The toddler always keeps the stepper.',
        },
        why: {
          fr: 'Pour cuisiner à ta façon : survoler, garder les ingrédients sous les yeux, ou avancer pas à pas.',
          en: 'To cook your way: skim it, keep the ingredients in view, or move one step at a time.',
        },
      },
      {
        label: { fr: 'Taille du texte', en: 'Text size' },
        detail: {
          fr: 'Un contrôle A / A / A dans la barre règle Compact, Normal ou Grand pour tous les affichages — Grand grossit et contraste pour lire de l’autre bout de la cuisine.',
          en: 'An A / A / A control in the bar sets Compact, Normal or Large for every layout — Large bumps the size and contrast to read from across the kitchen.',
        },
      },
      {
        label: { fr: 'Envoyer les ingrédients à La liste', en: 'Send ingredients to La liste' },
        detail: {
          fr: 'Un bouton « Ajouter les ingrédients » verse toute la recette sur [[card:liste|la liste d’épicerie]] en un coup : chaque ligne est ramenée à son nom achetable (« 15 ml de beurre » → « Beurre ») et les doublons sont fusionnés.',
          en: 'An “Add ingredients” button pours the whole recipe onto [[card:liste|the grocery list]] at once: each line is reduced to its buyable name (“15 ml butter” → “Butter”) and duplicates are merged.',
        },
        why: {
          fr: 'C’est le lien recette → épicerie : tu choisis quoi cuisiner et la liste se remplit toute seule, sans recopier ligne par ligne ni emporter les « 2 c. à thé » au magasin.',
          en: 'It’s the recipe → groceries link: you pick what to cook and the list fills itself, with no copying line by line and no “2 tsp” tagging along to the store.',
        },
      },
      {
        label: { fr: 'Mesures en couleurs', en: 'Colour-coded measures' },
        detail: {
          fr: 'Les quantités (c. à thé, tasse…) sont des pastilles colorées; touche-les pour les entendre. En mode cuisson, chaque mesure se dessine aussi en ronds pleins : « 2 c. à soupe » = 2 ronds de la même couleur (remplis cette cuillère 2 fois), une demie = un rond à moitié rempli.',
          en: 'Amounts (tsp, cup…) are colour-coded pills; tap one to hear it. In Cook mode each measure also draws as fill circles: “2 tbsp” = 2 circles of the same colour (fill this spoon twice), a half = a half-filled circle.',
        },
        why: {
          fr: 'Pour confirmer une mesure sans lire, les mains pleines — et pour qu’un enfant compte les ronds et attrape la bonne cuillère de couleur.',
          en: 'To confirm a measure without reading, hands full — and so a child can count the circles and grab the right-coloured spoon.',
        },
      },
      {
        label: { fr: 'Couleurs de tes ustensiles', en: 'Your own tool colours' },
        detail: {
          fr: 'Dans Réglages ▸ La cuisine, donne à chaque cuillère et tasse la couleur de tes vrais ustensiles. Toutes les pastilles et tous les ronds des recettes suivent, partout.',
          en: 'In Settings ▸ Display, give each spoon and cup the colour of your real tools. Every recipe pill and circle follows, everywhere.',
        },
        why: {
          fr: 'Pour que la couleur à l’écran soit exactement celle de la cuillère que tu attrapes.',
          en: 'So the colour on screen is exactly the spoon you reach for.',
        },
      },
      {
        label: { fr: 'Sections de recette', en: 'Recipe sections' },
        detail: {
          fr: 'Tu peux titrer des groupes (« ## Sauce ») dans les ingrédients et les étapes.',
          en: 'You can title groups (“## Sauce”) inside ingredients and steps.',
        },
        why: {
          fr: 'Pour t’y retrouver dans une longue recette à plusieurs préparations.',
          en: 'To find your way in a long recipe with several preparations.',
        },
      },
      {
        label: { fr: 'Doubler ou couper', en: 'Scale up or down' },
        detail: {
          fr: 'Des boutons ×½ / ×1 / ×2 / ×3 (ou ± sur les portions) ajustent les quantités; les pastilles de mesure colorées et leurs ronds suivent, et le mode cuisson aussi.',
          en: 'Buttons ×½ / ×1 / ×2 / ×3 (or ± on servings) adjust the amounts; the colour-coded measure pills and their circles follow, and so does cook mode.',
        },
        why: {
          fr: 'Pour cuisiner pour 2 ou pour 12 sans calcul mental.',
          en: 'To cook for 2 or for 12 without mental math.',
        },
      },
      {
        label: { fr: 'Tous les détails', en: 'All the details' },
        detail: {
          fr: 'Photo du plat, portions (« 24 biscuits »), temps de prép/cuisson/total, étiquettes, source et notes — remplis ce que tu veux.',
          en: 'Dish photo, yield (“24 cookies”), prep/cook/total time, tags, source and notes — fill what you like.',
        },
      },
      {
        label: { fr: 'Voir l’original ([[icon:scroll-bold]])', en: 'See the original ([[icon:scroll-bold]])' },
        detail: {
          fr: 'Un bouton montre la recette telle qu’importée, avant tes retouches, avec la date d’import.',
          en: 'A button shows the recipe exactly as imported, before your edits, with the import date.',
        },
        why: {
          fr: 'Pour revenir à la version d’origine si une retouche a mal tourné.',
          en: 'To fall back to the original if an edit went wrong.',
        },
      },
      {
        label: { fr: 'Réordonner les rangées', en: 'Reorder rows' },
        detail: {
          fr: 'Des flèches [[icon:caret-up-bold]]/[[icon:caret-down-bold]] montent ou descendent un ingrédient ou une étape.',
          en: 'Arrows [[icon:caret-up-bold]]/[[icon:caret-down-bold]] move an ingredient or step up or down.',
        },
        why: {
          fr: 'Sans glisser-déposer — plus sûr au doigt sur une tablette.',
          en: 'No drag-and-drop — surer with a finger on a tablet.',
        },
      },
      {
        label: { fr: 'Trouver une recette', en: 'Find a recipe' },
        detail: {
          fr: 'En haut du livre : une boîte de recherche, des pastilles de filtre (Quoi cuisiner ?, Favoris…) et un bouton « Aa / Collections » qui passe de la liste alphabétique au rangement par étiquette. Touche une recette pour l’ouvrir, ou planifie-la direct comme repas.',
          en: 'At the top of the book: a search box, filter pills (What can I cook?, Favorites…) and an “Aa / Collections” toggle that flips between the alphabetical list and the tag-grouped shelves. Tap a recipe to open it, or plan it straight as a meal.',
        },
        why: {
          fr: 'Pour retomber sur la bonne recette quand le livre grossit, sans la faire défiler en entier.',
          en: 'So you land on the right recipe as the book grows, without scrolling the whole thing.',
        },
      },
    ],
  },
  {
    id: 'ghost',
    icon: 'ghost-bold',
    group: 'concepts',
    title: { fr: 'Suivi fantôme (achats)', en: 'Ghost tracking (purchases)' },
    what: {
      fr: 'Un suivi discret de ce que tu rachètes souvent. Quand un article suivi approche de sa date de rachat, il remonte tout seul dans le panneau d’ajout rapide de La liste, marqué « bientôt » ou « dû » — un toucher le remet sur la liste. Toujours sur invitation, jamais imposé.',
      en: 'A quiet track of what you restock often. When a tracked item nears its renewal date it floats back up in the quick-add panel on La liste, marked “soon” or “due” — one tap puts it back on the list. Always opt-in, never forced.',
    },
    points: [
      {
        label: { fr: 'Tu choisis', en: 'You choose' },
        detail: {
          fr: 'Acheter n’inscrit jamais un article tout seul; tu l’ajoutes au suivi à la main (voir Réglages ▸ Suivi).',
          en: 'Buying never enrolls an item by itself; you add it to tracking by hand (see Settings ▸ Tracking).',
        },
        why: {
          fr: 'Rien ne s’active sans que tu le demandes — pas de « l’app a deviné » dans ton dos. (« [[card:kitchen|Il en manque]] » est un drapeau manuel ; le fantôme, lui, prédit la date de rachat.)',
          en: 'Nothing turns on unless you ask — no “the app guessed” behind your back. (“[[card:kitchen|Running low]]” is a manual flag; the ghost predicts the renewal date.)',
        },
      },
      {
        label: { fr: 'Où ça apparaît', en: 'Where it shows up' },
        detail: {
          fr: 'Sur La liste, dans le panneau d’ajout rapide (l’éclair ⚡) : tes fantômes « dûs » passent en tête, devant le reste de ton historique.',
          en: 'On La liste, in the quick-add panel (the ⚡): your “due” ghosts jump to the top, ahead of the rest of your history.',
        },
        why: {
          fr: 'C’est le seul endroit où ça sort — pas de notification, pas de badge ailleurs. Tu ne le vois que quand tu fais ta liste, au moment où c’est utile.',
          en: 'That’s the only place it surfaces — no notification, no badge elsewhere. You only see it when you’re making your list, exactly when it helps.',
        },
      },
      {
        label: { fr: 'Pourquoi t’embêter', en: 'Why bother' },
        detail: {
          fr: 'Le fantôme garde aussi les synonymes de circulaire de l’article : remettre « Pain » réactive « baguette/bread » pour le pige-prix.',
          en: 'The ghost also keeps the item’s flyer synonyms: re-adding “Pain” re-arms “baguette/bread” for price-matching.',
        },
        why: {
          fr: 'Pour ne plus oublier le lait ou le café juste parce que tu n’y as pas pensé en faisant la liste — sans qu’une app te harcèle pour autant.',
          en: 'So you stop forgetting the milk or the coffee just because it slipped your mind at list time — without an app nagging you for it.',
        },
      },
      {
        label: { fr: '« Toujours » (essentiels permanents)', en: '“Always” (permanent staples)' },
        detail: {
          fr: 'Différent du fantôme : épingle un item avec [[icon:push-pin-bold]] « Toujours » dans Réglages ▸ Courses et il reste en tête de l’Ajout rapide en permanence, sans deviner de date. Le fantôme prédit; « Toujours » ne devine pas.',
          en: 'Different from the ghost: pin an item with [[icon:push-pin-bold]] “Always” in Settings ▸ Shopping and it stays at the top of Quick add permanently, no date guessing. The ghost predicts; “Always” doesn’t guess.',
        },
        why: {
          fr: 'Pour les indispensables que tu rachètes sans faute — un tap à chaque épicerie, et jamais d’ajout automatique : la liste se vide et reste vide.',
          en: 'For the must-haves you rebuy without fail — one tap each grocery run, and never auto-added: the list empties and stays empty.',
        },
      },
    ],
  },
  {
    id: 'leftovers',
    icon: 'arrow-counter-clockwise-bold',
    group: 'concepts',
    title: { fr: 'Les restants', en: 'Leftovers' },
    what: {
      fr: 'Ce qu’il reste d’un souper, noté pour qu’on le mange avant d’ouvrir du neuf. Un rappel calme, pas un inventaire à tenir.',
      en: 'What’s left from a supper, noted so it gets eaten before anything new is opened. A calm reminder, not an inventory to keep.',
    },
    points: [
      {
        label: { fr: 'Annonce le restant', en: 'Announce the leftover' },
        detail: {
          fr: 'Note le restant d’un souper (« reste de pâté chinois ») et il s’affiche sur le babillard, à côté du repas du jour.',
          en: 'Note a supper’s leftover (“leftover shepherd’s pie”) and it shows on the board, beside the day’s meal.',
        },
        why: {
          fr: 'Pour que toute la maisonnée sache quoi finir, sans avoir à fouiller dans le frigo.',
          en: 'So the whole household knows what to finish, without digging through the fridge.',
        },
      },
      {
        label: { fr: 'À manger en premier', en: 'Eat it first' },
        detail: {
          fr: 'Le restant passe avant un nouveau plat : place-le sur un jour comme dîner ou souper, ou laisse-le « à finir bientôt ».',
          en: 'The leftover comes before a fresh dish: put it on a day as lunch or supper, or leave it “to finish soon”.',
        },
        why: {
          fr: 'Moins de gaspillage, et un repas déjà prêt les soirs pressés.',
          en: 'Less waste, and a meal already made on busy nights.',
        },
      },
      {
        label: { fr: 'Disparaît une fois fini', en: 'Gone once finished' },
        detail: {
          fr: 'Quand le restant est mangé, marque-le « fini »; il quitte le babillard et rien ne traîne.',
          en: 'Once the leftover is eaten, mark it “done”; it leaves the board and nothing lingers.',
        },
        why: {
          fr: 'Un simple drapeau « à finir », pas un compte de portions à tenir à jour.',
          en: 'Just a “finish me” flag, not a portion count to keep current.',
        },
      },
    ],
  },
  {
    id: 'reserve',
    icon: 'cloud-snow-bold',
    group: 'concepts',
    title: { fr: 'La réserve', en: 'The stash' },
    what: {
      fr: 'Ce que tu gardes au congélateur ou au fond du garde-manger, noté par endroit pour ne pas l’oublier — ni le racheter pour rien.',
      en: 'What you keep in the freezer or at the back of the pantry, noted by spot so you don’t forget it — or buy it again for nothing.',
    },
    points: [
      {
        label: { fr: 'Rangé par endroit', en: 'Grouped by spot' },
        detail: {
          fr: 'Note un article et dis où il est : congélateur, garde-manger, sous-sol. La réserve les regroupe par endroit.',
          en: 'Note an item and say where it is: freezer, pantry, basement. The stash groups them by spot.',
        },
        why: {
          fr: 'Pour retrouver d’un coup d’œil ce qui dort au congélateur avant de planifier un souper.',
          en: 'So you can spot at a glance what’s tucked in the freezer before planning a supper.',
        },
      },
      {
        label: { fr: 'Un rappel, pas un inventaire', en: 'A reminder, not an inventory' },
        detail: {
          fr: 'Tu notes ce qui vaut la peine d’être retenu — pas chaque boîte de conserve. Aucun chiffre à tenir à jour.',
          en: 'You note what’s worth remembering — not every can. No numbers to keep current.',
        },
        why: {
          fr: '« Un rappel, pas un inventaire » garde la cuisine calme : zéro corvée de comptage.',
          en: '“A reminder, not an inventory” keeps the kitchen calm: zero counting chore.',
        },
      },
      {
        label: { fr: 'Sors-le quand tu l’utilises', en: 'Pull it when you use it' },
        detail: {
          fr: 'Quand tu sors un article de la réserve, retire-le. S’il achève, touche le [[icon:shopping-bag-bold]] sur la rangée pour l’ajouter direct à la liste — sans quitter la réserve (un « Annuler » te couvre).',
          en: 'When you take an item out of the stash, clear it. If it’s running low, tap the [[icon:shopping-bag-bold]] on the row to send it straight to the list — without leaving the stash (an “Undo” has your back).',
        },
        why: {
          fr: 'La réserve dit ce que tu as déjà; « [[card:kitchen|il en manque]] » dit ce qu’il faut racheter — les deux se complètent sans se mélanger.',
          en: 'The stash says what you already have; “[[card:kitchen|running low]]” says what to rebuy — the two complement each other without blurring.',
        },
      },
    ],
  },
  {
    id: 'offline',
    icon: 'wifi-high-bold',
    group: 'concepts',
    title: { fr: 'Hors ligne & installation (PWA)', en: 'Offline & install (PWA)' },
    what: {
      fr: 'L’app s’installe sur l’écran d’accueil et reste utile même quand le wifi tombe.',
      en: 'The app installs to the home screen and stays useful even when the wifi drops.',
    },
    points: [
      {
        label: { fr: 'Garde le dernier bon affichage', en: 'Keeps the last good frame' },
        detail: {
          fr: 'Si la connexion saute, le babillard garde ce qu’il montrait.',
          en: 'If the connection drops, the board keeps what it was showing.',
        },
        why: {
          fr: 'Au lieu de devenir blanc — le mur reste utile même quand le wifi flanche.',
          en: 'Instead of going blank — the wall stays useful even when the wifi falters.',
        },
      },
      {
        label: { fr: 'Redémarre hors ligne', en: 'Reboots offline' },
        detail: {
          fr: 'La tablette peut redémarrer sans wifi et réafficher le dernier babillard, les listes et les recettes déjà consultés.',
          en: 'The tablet can reboot with no wifi and bring back the last board, lists and recipes you’d already viewed.',
        },
        why: {
          fr: 'Pour qu’une panne de courant ou une coupure d’internet ne laisse pas le mur blanc.',
          en: 'So a power blip or an internet outage never leaves the wall blank.',
        },
      },
      {
        label: { fr: 'Tes changements attendent et se synchronisent', en: 'Your changes wait, then sync' },
        detail: {
          fr: 'Hors ligne, cocher un article, marquer une corvée faite, ajouter à la liste fonctionnent quand même : un bandeau « Hors ligne » indique combien de changements sont en attente, et tout se synchronise tout seul au retour du wifi.',
          en: 'Offline, checking an item, marking a chore done, adding to the list still work: a “Offline” banner shows how many changes are waiting, and everything syncs by itself when the wifi returns.',
        },
        why: {
          fr: 'Pour que la signal faible à l’épicerie ou au mur ne te fasse pas perdre un geste.',
          en: 'So weak signal at the store or on the wall never loses a tap.',
        },
      },
      {
        label: { fr: 'Ce qui a besoin d’internet', en: 'What needs the internet' },
        detail: {
          fr: 'Quelques gestes ont besoin du réseau : le micro, l’ajout intelligent qui range tout seul, les photos et les circulaires. Hors ligne, ils s’affichent simplement en grisé.',
          en: 'A few things need the network: the mic, the smart add that files things for you, photos and flyers. Offline, they simply appear greyed out.',
        },
        why: {
          fr: 'Pour que ce soit clair en un coup d’œil, sans toucher un bouton qui ne pourrait pas répondre.',
          en: 'So it’s clear at a glance, instead of tapping a button that couldn’t answer.',
        },
      },
      {
        label: { fr: 'Le micro, autorisé une fois', en: 'The mic, allowed once' },
        detail: {
          fr: 'Le navigateur demande le micro la première fois — accepte une fois et c’est retenu. Astuce : installe l’app sur l’écran d’accueil et garde-la utilisée; l’autorisation tient bien mieux que dans un simple onglet. Sur iPhone/iPad, si tu refuses, on ne peut plus redemander depuis la page : va dans Réglages → Safari → Microphone pour réautoriser.',
          en: 'The browser asks for the mic the first time — allow it once and it’s remembered. Tip: install the app to the home screen and keep it in use; the grant holds far better than in a plain tab. On iPhone/iPad, if you decline, the page can’t ask again — go to Settings → Safari → Microphone to allow it.',
        },
        why: {
          fr: 'Pour dicter tes articles à la voix plutôt que de les taper un à un.',
          en: 'So you can dictate items by voice instead of typing them one by one.',
        },
      },
      {
        // bmad/10 B-7 — « La ligne de vérité » : appended at the END on purpose
        // (point indices are load-bearing elsewhere in guideContent).
        label: { fr: 'Même « en ligne », le mur le dit s’il n’a rien reçu', en: 'Even “online”, the wall says so if nothing’s landed' },
        detail: {
          fr: 'Une borne wifi captive ou une panne du serveur peut laisser l’appareil « en ligne » sans que rien ne se rafraîchisse. Si les données affichées n’ont pas été renouvelées depuis un bon moment, une petite ligne calme « Données de … » apparaît — même sans le bandeau « Hors ligne ».',
          en: 'A captive wifi portal or a server outage can leave the device reading “online” while nothing actually refreshes. If what’s on screen hasn’t updated in a good while, a small calm “Data from …” line appears — even without the “Offline” banner.',
        },
        why: {
          fr: 'Pour que le mur ne mente jamais par silence — une donnée figée se voit, elle ne se devine pas.',
          en: 'So the wall never lies by omission — stale data is visible, not something you have to guess at.',
        },
      },
    ],
  },

  {
    id: 'cookmode',
    icon: 'clock-bold',
    group: 'concepts',
    title: { fr: 'Le mode cuisson en détail', en: 'Cook mode in detail' },
    what: {
      fr: 'La recette en plein écran pendant que tu cuisines : grosses étapes, minuteries, lecture à voix haute — les mains libres.',
      en: 'The recipe full-screen while you cook: big steps, timers, read-aloud — hands free.',
    },
    points: [
      {
        label: { fr: 'Naviguer les étapes', en: 'Move through steps' },
        detail: {
          fr: 'Une étape à la fois; glisse à gauche/droite (ou les flèches du clavier) pour avancer. Le titre de section s’affiche au-dessus.',
          en: 'One step at a time; swipe left/right (or arrow keys) to move. The section title shows above.',
        },
        why: {
          fr: 'Pour ne jamais perdre ta place dans la recette, même les mains pleines de pâte.',
          en: 'So you never lose your place in the recipe, even with hands full of dough.',
        },
      },
      {
        label: { fr: 'Minuteries automatiques', en: 'Automatic timers' },
        detail: {
          fr: 'Si une étape dit « cuire 25 min », un bouton de minuterie apparaît : un toucher la lance (pause/reprise), et l’appareil vibre à la fin.',
          en: 'If a step says “bake 25 min”, a timer button appears: one tap starts it (pause/resume), and the device buzzes when it’s done.',
        },
        why: {
          fr: 'Pour ne pas jongler avec une minuterie à part — ni rien faire brûler.',
          en: 'So you don’t juggle a separate timer — or burn anything.',
        },
      },
      {
        label: {
          fr: 'Lecture auto ([[icon:speaker-high-bold]]/[[icon:speaker-slash-bold]])',
          en: 'Auto read-aloud ([[icon:speaker-high-bold]]/[[icon:speaker-slash-bold]])',
        },
        detail: {
          fr: 'Chaque étape se lit toute seule en arrivant; coupe-la d’un toucher si tu préfères le silence (retenu par appareil).',
          en: 'Each step reads itself on arrival; mute it with a tap if you prefer quiet (remembered per device).',
        },
        why: {
          fr: 'Pour suivre la recette sans lire ni toucher l’écran, les mains occupées.',
          en: 'To follow the recipe without reading or touching the screen, hands busy.',
        },
      },
      {
        label: { fr: 'Les bons ingrédients', en: 'The right ingredients' },
        detail: {
          fr: 'Chaque étape montre les ingrédients qu’elle utilise.',
          en: 'Each step shows the ingredients it uses.',
        },
        why: {
          fr: 'Pas besoin de remonter chercher dans la liste.',
          en: 'No scrolling back to the list to find them.',
        },
      },
      {
        label: { fr: 'Une photo par étape', en: 'A photo per step' },
        detail: {
          fr: 'En modifiant une [[card:recipes|recette]], touche 📷 sous une étape pour y joindre une photo (la pâte au bon stade, le pliage…). Elle s’affiche en grand dans le mode cuisson; les étapes sans photo n’en montrent pas.',
          en: 'When editing a [[card:recipes|recipe]], tap 📷 under a step to attach a photo (the dough at the right stage, the fold…). It shows large in cook mode; steps with no photo simply show none.',
        },
        why: {
          fr: 'Une image vaut mille mots pour un geste délicat — et c’est optionnel, étape par étape.',
          en: 'A picture is worth a thousand words for a tricky move — and it’s optional, step by step.',
        },
      },
    ],
  },
  {
    id: 'flyers',
    icon: 'newspaper-bold',
    group: 'concepts',
    title: { fr: 'Naviguer les circulaires', en: 'Browsing the flyers' },
    what: {
      fr: 'Feuilleter les rabais de la semaine, par article ou par magasin, et ouvrir la circulaire reconstruite d’un marchand.',
      en: 'Leaf through the week’s deals, by item or by store, and open a merchant’s reconstructed flyer.',
    },
    points: [
      {
        label: { fr: 'Par article ou par magasin', en: 'By item or by store' },
        detail: {
          fr: 'Cherche un aliment, ou parcours les magasins.',
          en: 'Search a food, or browse the stores.',
        },
        why: {
          fr: 'Des suggestions (lait, pain, œufs) évitent de taper. Accroche un rabais à un article depuis [[card:deals|Rabais & circulaires]].',
          en: 'Suggestions (milk, bread, eggs) save typing. Attach a deal to an item from [[card:deals|Deals & flyers]].',
        },
      },
      {
        label: { fr: 'Cette semaine vs à venir', en: 'This week vs upcoming' },
        detail: {
          fr: 'Les circulaires courantes et celles de la semaine prochaine (publiées d’avance) sont séparées.',
          en: 'Current flyers and next week’s (published early) are split.',
        },
        why: {
          fr: 'Pour préparer ta liste à l’avance, dès que les rabais de la semaine prochaine sortent.',
          en: 'So you can prep your list ahead, as soon as next week’s deals come out.',
        },
      },
      {
        label: { fr: 'Officielle ou reconstruite', en: 'Official or reconstructed' },
        detail: {
          fr: 'Un ✓ marque une vraie image de circulaire; un ≈ marque une reconstruction; le lien Flipp ouvre la vraie page complète à part.',
          en: 'A ✓ marks a real flyer image; a ≈ marks a reconstruction; the Flipp link opens the full real page separately.',
        },
        why: {
          fr: 'Pour savoir à quel point te fier à chaque rabais avant de te déplacer.',
          en: 'So you know how much to trust each deal before making the trip.',
        },
      },
      {
        label: { fr: 'Trouver l’article sur la page', en: 'Find the item on the page' },
        detail: {
          fr: 'Le rabais indique sa page et sa position (haut/milieu/bas, gauche/centre/droite); feuillette les articles avec [[icon:caret-left-bold]] [[icon:caret-right-bold]], et touche une image pour l’agrandir.',
          en: 'A deal shows its page and position (top/middle/bottom, left/centre/right); step through items with [[icon:caret-left-bold]] [[icon:caret-right-bold]], and tap an image to zoom.',
        },
        why: {
          fr: 'Pour retrouver vite l’article dans une grosse circulaire papier.',
          en: 'So you can quickly find the item in a big paper flyer.',
        },
      },
    ],
  },
  {
    id: 'undo',
    icon: 'arrow-counter-clockwise-bold',
    group: 'concepts',
    title: { fr: 'Annuler (le filet de sécurité)', en: 'Undo (the safety net)' },
    what: {
      fr: 'Presque rien ne se supprime sèchement. Un geste destructeur attend quelques secondes derrière un bandeau « Annuler ».',
      en: 'Almost nothing deletes outright. A destructive action waits a few seconds behind an “Undo” toast.',
    },
    points: [
      {
        label: { fr: 'Cinq secondes pour revenir', en: 'Five seconds to come back' },
        detail: {
          fr: 'Supprimer un membre, une corvée, vider les cochés… l’élément disparaît tout de suite, mais la vraie suppression attend ~5 s. Touche « Annuler » et c’est revenu.',
          en: 'Delete a member, a chore, clear checked… the item vanishes at once, but the real delete waits ~5 s. Tap “Undo” and it’s back.',
        },
        why: {
          fr: 'Pour qu’une erreur se rattrape toujours, sans confirmation anxiogène à chaque geste.',
          en: 'So a mistake is always recoverable, without an anxious confirm on every action.',
        },
      },
      {
        label: { fr: 'Plusieurs gestes, et un journal « Récents »', en: 'Several actions, and a “Recents” log' },
        detail: {
          fr: 'Plusieurs annulations peuvent attendre en même temps : le bandeau montre la plus récente et un « Récents (N) » dessus ouvre la liste des derniers gestes — touche « Annuler » sur n’importe lequel encore dans sa fenêtre. Le bandeau reste ensuite comme petit bouton « Récents », même une fois les gestes validés, et la même liste vit dans Réglages ▸ Système ▸ Affichage. Rien n’est gardé après un rechargement.',
          en: 'Several undos can wait at once: the toast shows the most recent and a “Recents (N)” on it opens the list of the latest actions — tap “Undo” on any still in its window. The toast then lingers as a small “Recents” button, even after the actions commit, and the same list lives in Settings ▸ Display. Nothing is kept after a reload.',
        },
        why: {
          fr: 'Un filet calme et réversible, accessible d’un coup d’œil — sans journal permanent ni compteurs.',
          en: 'A calm, reversible net you can glance at — with no permanent log or counters.',
        },
      },
    ],
  },
  {
    id: 'account',
    icon: 'key-bold',
    group: 'concepts',
    title: { fr: 'Compte & connexion', en: 'Account & sign-in' },
    what: {
      fr: 'L’opérateur (le parent) crée une maisonnée et s’y connecte — c’est ce compte qui débloque les membres, le jumelage des tablettes et la synchro entre appareils. La tablette, elle, n’a pas de compte : elle se jumelle (voir [[card:pairing|Jumeler une tablette]]).',
      en: 'The operator (the parent) creates a household and signs in — this account is what unlocks members, tablet pairing and sync across devices. The tablet has no account: it pairs instead (see [[card:pairing|Pairing a tablet]]).',
    },
    points: [
      {
        label: { fr: 'Créer ta maisonnée', en: 'Create your household' },
        detail: {
          fr: 'L’inscription crée la maisonnée et t’amène au babillard, où une courte liste de départ te guide (ajouter la famille, planifier les repas, jumeler une tablette). Une maisonnée par courriel.',
          en: 'Signup creates the household and lands you on the board, where a short starter checklist guides you (add the family, plan the meals, pair a tablet). One household per email.',
        },
        why: {
          fr: 'C’est le point de départ : sans maisonnée, rien à peupler, rien à jumeler, rien à synchroniser.',
          en: 'It’s the starting point: with no household, there’s nothing to populate, pair or sync.',
        },
      },
      {
        label: { fr: 'Mot de passe', en: 'Password' },
        detail: {
          fr: 'Minimum 8 caractères, avec un petit compteur « N/8 » qui se coche quand c’est bon.',
          en: 'At least 8 characters, with a small “N/8” counter that ticks when it’s enough.',
        },
        why: {
          fr: 'C’est tout ce qui sépare tes données du web — et la tablette au mur n’en a jamais besoin, elle se jumelle.',
          en: 'It’s all that stands between your data and the web — and the wall tablet never needs it, it pairs.',
        },
      },
      {
        label: { fr: 'Code d’invitation', en: 'Invite code' },
        detail: {
          fr: 'Si le déploiement est protégé, l’inscription et la connexion demandent en plus un code partagé.',
          en: 'If the deployment is gated, signup and sign-in also ask for a shared code.',
        },
        why: {
          fr: 'Pour garder l’instance privée, réservée aux gens à qui tu donnes le code.',
          en: 'To keep the instance private, limited to the people you give the code.',
        },
      },
    ],
  },

  // ── Settings, tab by tab (the Réglages reference) ─────────────────────────
  {
    id: 'set-household',
    icon: 'users-three-bold',
    group: 'settings',
    route: '/settings?tab=cercle&sub=members',
    title: { fr: 'La maisonnée', en: 'The household' },
    what: {
      fr: 'Qui fait partie de la famille, et le cercle autour d’elle. C’est ce qui peuple les visages, les couleurs et les agendas partout dans l’app.',
      en: 'Who’s in the family, and the circle around it. This populates the faces, colours and agendas everywhere in the app.',
    },
    points: [
      {
        label: { fr: 'Ajouter une personne', en: 'Add a person' },
        detail: {
          fr: 'Tape un nom et touche Ajouter. Chacun reçoit une couleur distincte automatiquement.',
          en: 'Type a name and tap Add. Each person gets a distinct colour automatically.',
        },
        why: {
          fr: 'Pour distinguer chaque personne d’un coup d’œil partout dans l’app.',
          en: 'So you can tell each person apart at a glance everywhere in the app.',
        },
      },
      {
        label: { fr: 'Marquer « enfant »', en: 'Mark as “child”' },
        detail: {
          fr: 'Coche la case enfant.',
          en: 'Tick the child box.',
        },
        why: {
          fr: 'La personne peut alors avoir des routines en images, faites pour un pré-lecteur.',
          en: 'That person can then have picture routines, built for a pre-reader.',
        },
      },
      {
        label: { fr: 'Photo de visage', en: 'Face photo' },
        detail: {
          fr: 'Touche [[icon:camera-bold]] pour prendre/choisir une photo (redimensionnée petite); le [[icon:x-bold]] la retire.',
          en: 'Tap [[icon:camera-bold]] to take/pick a photo (resized small); the [[icon:x-bold]] removes it.',
        },
        why: {
          fr: 'C’est ce visage qu’on reconnaît et qu’on touche sur le babillard — une photo rend la personne repérable sans lire.',
          en: 'This is the face people recognize and tap on the board — a photo makes the person spottable without reading.',
        },
      },
      {
        label: { fr: 'Couleur', en: 'Colour' },
        detail: {
          fr: 'La couleur de la personne apparaît partout : événements, corvées, pastille de visage.',
          en: 'The person’s colour appears everywhere: events, chores, face dot.',
        },
        why: {
          fr: 'Un même repère visuel pour savoir à qui appartient quoi, sans lire.',
          en: 'One consistent visual cue for who owns what, without reading.',
        },
      },
      {
        label: { fr: 'Le cercle et les groupes', en: 'The circle and groups' },
        detail: {
          fr: 'Sous les membres, « Le cercle » garde la famille élargie et les amis (grands-parents, gardienne, voisins) et les regroupe en familles. Voir [[card:cercle|Le cercle]] pour le détail; tu peux y défaire un groupe sans perdre les personnes.',
          en: 'Below the members, “The circle” keeps extended family and friends (grandparents, sitter, neighbours) and clusters them into families. See [[card:cercle|The circle]] for the detail; you can break a group here without losing the people.',
        },
        why: {
          fr: 'La maisonnée, c’est le noyau qui a des corvées et des routines; le cercle, c’est tout le monde autour qu’on relie à un événement ou une fête.',
          en: 'The household is the core that gets chores and routines; the circle is everyone around it you can attach to an event or a birthday.',
        },
      },
    ],
  },
  {
    id: 'set-agenda',
    icon: 'calendar-dots-bold',
    group: 'settings',
    route: '/settings?tab=board&sub=events',
    title: { fr: 'Agenda & auto', en: 'Agenda & car' },
    what: {
      fr: 'Les rendez-vous et événements de la famille, plus l’auto partagée et les horaires de travail. Ce qui s’affiche dans « Aujourd’hui / À venir » sur le babillard.',
      en: 'The family’s appointments and events, plus the shared car and work schedules. What shows under “Today / Upcoming” on the board.',
    },
    points: [
      {
        label: { fr: 'Ajouter / modifier', en: 'Add / edit' },
        detail: {
          fr: 'Le même formulaire que le bouton ＋. Titre, date/heure (ou toute la journée), et à qui ça appartient.',
          en: 'The same form as the ＋ button. Title, date/time (or all-day), and whose it is.',
        },
        why: {
          fr: 'Tout ce que tu entres ici remonte sur le babillard à la bonne date — c’est ce qui fait que le mur connaît la journée.',
          en: 'Everything you enter here surfaces on the board on the right date — it’s what lets the wall know the day.',
        },
      },
      {
        label: { fr: 'Assigner à une personne', en: 'Assign to a person' },
        detail: {
          fr: 'Relie l’événement à un membre (sa couleur apparaît à côté sur le babillard) OU à quelqu’un du cercle — « Mamie visite », « dîner chez les Roy ». Choisir un contact remplace le membre : un seul « qui » par événement.',
          en: 'Link the event to a member (their colour shows beside it on the board) OR to someone from the circle — “Mamie visits”, “dinner at the Roys’”. Picking a contact replaces the member: one “who” per event.',
        },
        why: {
          fr: 'Pour voir d’un coup à qui appartient chaque rendez-vous, sans lire les noms — même quand ce n’est pas quelqu’un de la maisonnée.',
          en: 'So you can see at a glance whose appointment each one is, without reading names — even when it isn’t someone in the household.',
        },
      },
      {
        label: { fr: 'Récurrent ([[icon:repeat-bold]])', en: 'Recurring ([[icon:repeat-bold]])' },
        detail: {
          fr: 'Un événement qui revient (chaque jour/semaine/mois/année) porte le [[icon:repeat-bold]] dans la liste.',
          en: 'An event that repeats (daily/weekly/monthly/yearly) carries the [[icon:repeat-bold]] in the list.',
        },
        why: {
          fr: 'Pour entrer une seule fois ce qui se répète (le cours de natation du mardi) au lieu de le retaper chaque semaine.',
          en: 'So you enter a repeating thing once (Tuesday swim class) instead of retyping it every week.',
        },
      },
      {
        label: { fr: 'L’auto partagée', en: 'The shared car' },
        detail: {
          fr: 'Donne un nom et une couleur à l’auto que la maisonnée se partage; les trajets s’y rattachent et un membre du cercle peut conduire en covoiturage. Voir [[card:auto|L’auto]] pour tout le détail.',
          en: 'Name and colour the car the household shares; rides attach to it and a circle member can drive as a carpool. See [[card:auto|The car]] for the full detail.',
        },
        why: {
          fr: 'Un seul endroit pour savoir qui a l’auto et quand elle est libre — fini les cinq fils de textos.',
          en: 'One place to know who has the car and when it’s free — no more five text threads.',
        },
      },
      {
        label: { fr: 'Les horaires de travail', en: 'Work schedules' },
        detail: {
          fr: 'Entre une fois les heures récurrentes de chacun (travail, garderie) et coche « prend l’auto » au besoin; ça dit à [[card:auto|L’auto]] quand la voiture n’est pas là et façonne chaque journée tout seul.',
          en: 'Enter everyone’s recurring hours once (work, daycare) and tick “takes the car” where it applies; it tells [[card:auto|The car]] when the vehicle is away and shapes each day on its own.',
        },
      },
    ],
  },
  {
    id: 'set-chores',
    icon: 'broom-bold',
    group: 'settings',
    route: '/settings?tab=routines&sub=chores',
    title: { fr: 'Corvées & routines', en: 'Chores & routines' },
    what: {
      fr: 'Les tâches de la maison et leur horaire, les routines en images des enfants, et les listes « À compléter ». Les corvées tournent et s’affichent sur le babillard avec « c’est le tour de… ».',
      en: 'The house tasks and their schedule, the kids’ picture routines, and the “To complete” lists. Chores rotate and show on the board with “whose turn it is…”.',
    },
    points: [
      {
        label: { fr: 'Créer une corvée', en: 'Create a chore' },
        detail: {
          fr: 'Donne-lui un titre et une couleur. Tu peux l’assigner à une personne.',
          en: 'Give it a title and a colour. You can assign it to a person.',
        },
        why: {
          fr: 'La corvée s’affiche sur le babillard avec « c’est le tour de… » ; ajoute d’abord les membres, car la rotation se choisit parmi eux.',
          en: 'The chore shows on the board with “whose turn it is…”; add members first, since the rotation is picked from them.',
        },
      },
      {
        label: { fr: 'Donner un horaire', en: 'Give it a schedule' },
        detail: {
          fr: 'Le bouton « Céduler » ouvre la récurrence — tous les N jours/semaines/mois/années, et pour « semaine » le choix des jours (D L M M J V S) — plus une date de départ.',
          en: 'The “Schedule” button opens the recurrence — every N days/weeks/months/years, and for “weekly” a choice of days (S M T W T F S) — plus a start date.',
        },
        why: {
          fr: 'Pour que la corvée revienne et tourne toute seule, sans la recréer chaque fois.',
          en: 'So the chore comes back and rotates on its own, without recreating it each time.',
        },
      },
      {
        label: { fr: 'Effacer un horaire', en: 'Clear a schedule' },
        detail: {
          fr: 'Remets la récurrence à « Jamais » et la corvée redevient ponctuelle.',
          en: 'Set the recurrence back to “Never” and the chore becomes one-off again.',
        },
        why: {
          fr: 'Pour une corvée qui n’arrive qu’une fois — elle quitte le babillard une fois faite.',
          en: 'For a chore that happens only once — it leaves the board once it’s done.',
        },
      },
      {
        label: { fr: 'Le journal des corvées', en: 'The chore ledger' },
        detail: {
          fr: 'Sous les corvées, un coup d’œil « qui a fait quoi cette semaine » : les noms et les visages, le jour où c’est arrivé. C’est tout — aucun nombre, aucun classement, aucun « meilleur ».',
          en: 'Below the chores, a “who did what this week” glance: the names and faces, the day it happened. That’s all — no counts, no ranking, no “top helper”.',
        },
        why: {
          fr: 'Pour voir que la maison a roulé sans en faire un concours — fidèle au calme, jamais un tableau de pointage.',
          en: 'To see the house got run without turning it into a contest — true to calm, never a scoreboard.',
        },
      },
      {
        label: { fr: 'Créer une routine d’enfant', en: 'Create a kid routine' },
        detail: {
          fr: 'Sous « Routines », nomme-la, assigne-la à un enfant, et ajoute des étapes (chacune avec une image).',
          en: 'Under “Routines”, name it, assign it to a child, and add steps (each with a picture).',
        },
      },
      {
        label: { fr: 'Moment de la journée', en: 'Time of day' },
        detail: {
          fr: 'La pastille fait défiler : n’importe quand → [[icon:sun-horizon-bold]] matin → [[icon:sun-bold]] après-midi → [[icon:moon-stars-bold]] soir.',
          en: 'The chip cycles: anytime → [[icon:sun-horizon-bold]] morning → [[icon:sun-bold]] afternoon → [[icon:moon-stars-bold]] evening.',
        },
        why: {
          fr: 'Ça ordonne les routines pour l’enfant — la bonne au bon moment de la journée.',
          en: 'It orders the routines for the child — the right one at the right time of day.',
        },
      },
      {
        label: { fr: 'Où l’enfant la voit', en: 'Where the child sees it' },
        detail: {
          fr: 'Dans l’onglet Routines, en vue enfant — lue à voix haute, une carte à la fois.',
          en: 'In the Routines tab, in kid view — read aloud, one card at a time.',
        },
      },
      {
        label: { fr: 'Listes « À compléter »', en: '“To complete” lists' },
        detail: {
          fr: 'Prépare ici tes listes à cocher réutilisables (sac de piscine, « Avant de partir »). Voir [[card:todos|À faire & à compléter]] : préparées une fois, elles s’ajoutent au babillard d’un seul geste.',
          en: 'Build your reusable check-off lists here (pool bag, “Before leaving”). See [[card:todos|To do & to complete]]: set up once, they drop onto the board in one tap.',
        },
      },
      {
        label: { fr: 'Projets & entretien', en: 'Plans & maintenance' },
        detail: {
          fr: 'Sous les corvées, deux listes pour les plus gros sujets de la maison : les Projets (un jour, sans date) et l’Entretien qui revient. Voir [[card:home-projects|Projets & entretien]].',
          en: 'Under chores, two lists for the bigger home topics: Plans (someday, no date) and recurring Maintenance. See [[card:home-projects|Plans & maintenance]].',
        },
      },
    ],
  },
  {
    id: 'set-shopping',
    icon: 'shopping-bag-bold',
    group: 'settings',
    route: '/settings?tab=liste&sub=shop',
    title: { fr: 'Magasinage', en: 'Shopping' },
    what: {
      fr: 'Tout ce qui alimente la liste et les rabais : ton code postal, les magasins à garder, l’ordre des allées, l’historique d’achats, et le suivi fantôme opt-in.',
      en: 'Everything feeding the list and deals: your postal code, which stores to keep, the aisle order, the purchase history, and opt-in ghost tracking.',
    },
    points: [
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets-le une fois.',
          en: 'Set it once.',
        },
        why: {
          fr: 'Il dit aux circulaires où chercher les rabais près de chez toi.',
          en: 'It tells the flyers where to look for deals near you.',
        },
      },
      {
        label: { fr: 'Filtre de magasins', en: 'Store filter' },
        detail: {
          fr: 'Garde seulement les magasins où tu vas; ceux que tu retires ne reviennent plus dans les rabais. Rien de coché = tous gardés.',
          en: 'Keep only the stores you shop; ones you drop never come back in deals. Nothing ticked = all kept.',
        },
        why: {
          fr: 'Pour ne pas noyer tes rabais sous des magasins où tu ne vas jamais.',
          en: 'So your deals aren’t drowned out by stores you never set foot in.',
        },
      },
      {
        label: { fr: 'Historique', en: 'History' },
        detail: {
          fr: 'Ce que l’ajout rapide te propose. Renomme une entrée vers son nom générique ou supprime-la.',
          en: 'What quick-add suggests. Rename an entry to its generic name or remove it.',
        },
        why: {
          fr: 'Pour garder les suggestions propres et utiles plutôt qu’encombrées.',
          en: 'To keep the suggestions clean and useful rather than cluttered.',
        },
      },
      {
        label: { fr: 'Ordre des allées', en: 'Aisle order' },
        detail: {
          fr: 'Glisse les rayons (fruits, laitier, congelé…) dans l’ordre où tu parcours TON magasin. La liste « Par allée » suit alors ton trajet réel.',
          en: 'Drag the aisles (produce, dairy, frozen…) into the order you walk YOUR store. The list’s “By aisle” view then follows your real path.',
        },
        why: {
          fr: 'Pour magasiner d’un bout à l’autre sans revenir sur tes pas.',
          en: 'So you shop end to end without doubling back.',
        },
      },
      {
        label: { fr: 'Suivre un article (fantôme)', en: 'Track an item (ghost)' },
        detail: {
          fr: 'Le suivi d’achats opt-in : les achats fréquents apparaissent en suggestions ＋ « le suivre ? ». Un tap, jamais automatique — le suivi reste ton choix (voir [[card:ghost|Suivi fantôme]]).',
          en: 'Opt-in purchase tracking: frequent buys show as ＋ “track it?” suggestions. One tap, never automatic — tracking stays your choice (see [[card:ghost|Ghost tracking]]).',
        },
      },
      {
        label: { fr: 'Fréquence (jours)', en: 'Cadence (days)' },
        detail: {
          fr: 'Règle « tous les N jours » pour chaque article suivi.',
          en: 'Set “every N days” per tracked item.',
        },
        why: {
          fr: 'Pour qu’il revienne sur la liste juste quand tu en rachètes d’habitude.',
          en: 'So it returns to the list right around when you’d normally rebuy it.',
        },
      },
      {
        label: { fr: 'Mettre en sourdine / retirer', en: 'Mute / remove' },
        detail: {
          fr: 'Mets un article en sourdine sans le supprimer, ou retire ceux que tu as ajoutés à la main.',
          en: 'Mute an item without deleting it, or remove the ones you added by hand.',
        },
        why: {
          fr: 'Pour faire taire une suggestion encombrante sans perdre son historique.',
          en: 'To silence a noisy suggestion without losing its history.',
        },
      },
    ],
  },
  {
    id: 'set-recipes',
    icon: 'tag-bold',
    group: 'settings',
    route: '/settings?tab=kitchen&sub=apparence',
    title: { fr: 'La cuisine', en: 'The kitchen' },
    what: {
      fr: 'Les réglages de cuisine : les étiquettes de recettes, la couleur des cuillères et tasses, la couleur et l’affichage de chaque repas, et la réserve.',
      en: 'The kitchen settings: recipe tags, the colour of spoons and cups, each meal’s colour and display, and the reserve.',
    },
    points: [
      {
        label: { fr: 'Pastilles proposées', en: 'Suggested pills' },
        detail: {
          fr: 'Ajoute ou enlève les étiquettes offertes quand tu crées une recette (ex. Végé, Rapide). Glisse le ⠿ pour les réordonner — y compris les étiquettes déjà utilisées — et cet ordre décide aussi de l’ordre des collections.',
          en: 'Add or remove the tags offered when you create a recipe (e.g. Veggie, Quick). Drag the ⠿ to reorder them — including tags already in use — and that order also sets the order of your collections.',
        },
        why: {
          fr: 'Pour étiqueter vite, à partir de ton propre vocabulaire, et garder les mêmes mots d’une recette à l’autre.',
          en: 'To tag fast, from your own vocabulary, and keep the same words across recipes.',
        },
      },
      {
        label: { fr: 'Renommer partout', en: 'Rename everywhere' },
        detail: {
          fr: 'Renomme une étiquette une fois et toutes les recettes qui la portent suivent.',
          en: 'Rename a tag once and every recipe carrying it follows.',
        },
        why: {
          fr: 'Fini « Végé / végé / vege » — une seule façon d’écrire chaque étiquette, donc un filtre fiable.',
          en: 'No more “Veggie / veggie / vege” — one spelling per tag, so filtering stays reliable.',
        },
      },
      {
        label: { fr: 'Supprimer une étiquette', en: 'Remove a tag' },
        detail: {
          fr: 'L’enlève de toutes les recettes d’un coup (avec confirmation).',
          en: 'Removes it from every recipe at once (with confirmation).',
        },
      },
      {
        label: { fr: 'Une couleur par repas', en: 'A colour per meal' },
        detail: {
          fr: 'Touche une pastille pour donner sa couleur à un repas (déjeuner, dîner, collation, souper, dessert). « Couleur par défaut » la remet comme avant.',
          en: 'Tap a dot to give a meal (breakfast, lunch, snack, supper, dessert) its colour. “Default colour” puts it back as it was.',
        },
        why: {
          fr: 'La couleur suit le repas PARTOUT — babillard, calendrier du mois, cuisine — alors un coup d’œil dit « ça, c’est le souper ».',
          en: 'The colour follows the meal EVERYWHERE — board, month calendar, kitchen — so a glance says “that’s supper”.',
        },
      },
      {
        label: { fr: 'Afficher / masquer un repas', en: 'Show / hide a meal' },
        detail: {
          fr: 'Le bouton Affiché/Masqué enlève un repas du babillard et de l’aperçu de la cuisine (ex. ne garder que le souper). Un repas masqué se planifie quand même via « Gérer » une journée.',
          en: 'The Shown/Hidden button drops a meal from the board and the kitchen glance (e.g. keep only supper). A hidden meal can still be planned via a day’s “Gérer”.',
        },
        why: {
          fr: 'Pour un babillard calme qui ne montre que ce qui compte pour toi — par défaut, tous les repas sont affichés. Couleurs et choix sont partagés par tous les appareils.',
          en: 'For a calm board that shows only what matters to you — by default every meal is shown. Colours and choices are shared across every device.',
        },
      },
      {
        label: { fr: 'Cuillères et tasses en couleur', en: 'Spoons and cups in colour' },
        detail: {
          fr: 'Donne à chaque cuillère et tasse la couleur de tes vrais ustensiles. Toutes les pastilles de mesure et les ronds de recettes suivent, partout.',
          en: 'Give each spoon and cup the colour of your real tools. Every measure pill and recipe scoop follows, everywhere.',
        },
        why: {
          fr: 'Pour qu’un enfant trouve « la cuillère verte » en cuisinant, par la couleur plutôt que par les chiffres.',
          en: 'So a child grabs “the green spoon” while cooking, by colour rather than numbers.',
        },
      },
      {
        label: { fr: 'La réserve', en: 'The reserve' },
        detail: {
          fr: 'Nomme et colore les endroits de ta réserve (congélateur, garde-manger…) où les articles sont regroupés. Voir [[card:reserve|La réserve]].',
          en: 'Name and colour your reserve spots (freezer, pantry…) where items are grouped. See [[card:reserve|The reserve]].',
        },
      },
    ],
  },
  {
    id: 'set-devices',
    icon: 'device-tablet-bold',
    group: 'settings',
    route: '/settings?tab=settings&sub=tablets',
    title: { fr: 'Accès & appareils', en: 'Access & devices' },
    what: {
      fr: 'Les tablettes jumelées et les liens de partage temporaires (gardienne, accueil, famille). C’est ici que tu donnes — ou reprends — l’accès au babillard.',
      en: 'The paired tablets and the temporary share links (sitter, welcome, family). This is where you grant — or revoke — board access.',
    },
    points: [
      {
        label: { fr: 'Approuver un code', en: 'Approve a code' },
        detail: {
          fr: 'Entre le code à 6 chiffres que la tablette affiche, donne-lui un nom, et touche Jumeler.',
          en: 'Enter the 6-digit code the tablet shows, give it a name, and tap Pair.',
        },
      },
      {
        label: { fr: 'Retirer un appareil', en: 'Revoke a device' },
        detail: {
          fr: 'Un tap retire l’accès (annulable par le bandeau d’annulation); la tablette devra se re-jumeler.',
          en: 'One tap removes access (undoable via the undo toast); the tablet will have to re-pair.',
        },
        why: {
          fr: 'Pour reprendre l’accès d’une tablette perdue, vendue ou donnée, quand tu veux.',
          en: 'So you can pull access from a lost, sold or handed-on tablet whenever you want.',
        },
      },
      {
        label: { fr: 'Choisir le genre de lien', en: 'Pick the link kind' },
        detail: {
          fr: 'Crée un lien temporaire en lecture seule — Démo, Gardienne, Accueil ou Famille — plus la « Fiche famille » qu’un proche remplit et te renvoie. Voir [[card:share-access|Partager un accès]] pour le détail des genres.',
          en: 'Mint a temporary read-only link — Demo, Sitter, Welcome or Family — plus the “Family details” form a relative fills and sends back. See [[card:share-access|Share access]] for the detail of the kinds.',
        },
      },
      {
        label: { fr: 'Chaque genre, sa vue', en: 'Each kind, its view' },
        detail: {
          fr: 'Démo (tout le babillard), Gardienne (journée + routines + à savoir + le plan de secours « en cas de pépin » + wifi), Accueil (wifi + poubelles + règles), Famille (dates des enfants + anniversaires + photos) ou Fiche famille (un proche remplit ses infos et te les renvoie) — chacun avec sa durée.',
          en: 'Demo (the whole board), Sitter (day + routines + things-to-know + the house’s “in a pinch” map + wifi), Welcome (wifi + bin day + rules), Family (kids’ dates + birthdays + photos) or Family details (a relative fills in their info and sends it back) — each with its own duration.',
        },
        why: {
          fr: 'Un lien par besoin : le visiteur ne voit que ce qui le concerne.',
          en: 'One link per need: the visitor only sees what concerns them.',
        },
      },
      {
        label: { fr: 'En lecture seule, minuté', en: 'Read-only, time-boxed' },
        detail: {
          fr: 'Aucun bouton d’ajout/modif/suppression, et le lien expire tout seul après le délai choisi.',
          en: 'No add/edit/delete buttons, and the link expires on its own after the chosen window.',
        },
        why: {
          fr: 'On confie l’info utile sans confier les commandes — rien à révoquer à la main.',
          en: 'You hand over the useful info, not the controls — nothing to revoke by hand.',
        },
      },
      {
        label: { fr: '« Infos à partager »', en: '“Info to share”' },
        detail: {
          fr: 'Remplis une fois le wifi, les règles de la maison et le jour des poubelles : les liens Gardienne et Accueil les affichent.',
          en: 'Fill in the wifi, house rules and bin day once: the Sitter and Welcome links show them.',
        },
      },
      {
        label: { fr: 'Aperçu et QR', en: 'Preview and QR' },
        detail: {
          fr: 'Le bouton « Aperçu » montre exactement ce que le visiteur verra; un code QR accompagne chaque lien pour le scanner ou le coller près de la porte.',
          en: 'The “Preview” button shows exactly what the visitor will see; a QR code rides along with each link to scan it or tape it by the door.',
        },
        why: {
          fr: 'Pour vérifier que tout l’utile est là, et rien de plus.',
          en: 'To check the useful stuff is there, and nothing more.',
        },
      },
    ],
  },
  {
    id: 'set-ai',
    icon: 'sparkle-bold',
    group: 'settings',
    route: '/settings?tab=settings&sub=ai',
    title: { fr: 'IA & système', en: 'AI & system' },
    what: {
      fr: '« Cette semaine » par visages, le bilan IA sur demande, l’interrupteur marche/arrêt de l’IA, et les outils de mise au point (journal d’entretien, mode veille).',
      en: '“This week” by faces, the AI recap on demand, the household AI on/off switch, and the troubleshooting tools (maintenance log, idle mode).',
    },
    points: [
      {
        label: { fr: 'Des visages, pas des pointages', en: 'Faces, not scores' },
        detail: {
          fr: 'On voit QUI a donné un coup de main, jamais un classement ni un décompte.',
          en: 'You see WHO pitched in, never a ranking or a count.',
        },
        why: {
          fr: 'Observer ce qu’on a fait ensemble, sans en faire une compétition (NFR-CALM).',
          en: 'See what we did together, without turning it into a competition (NFR-CALM).',
        },
      },
      {
        label: { fr: 'Bilan IA sur demande', en: 'AI recap on demand' },
        detail: {
          fr: 'Touche le bouton quand ça te tente.',
          en: 'Tap the button when you feel like it.',
        },
        why: {
          fr: 'Rien ne se génère tout seul, rien ne te relance — un bilan, pas un fil sans fin.',
          en: 'Nothing generates on its own, nothing nags you — a recap, not an endless feed.',
        },
      },
      {
        label: { fr: 'Peut être absent', en: 'May be hidden' },
        detail: {
          fr: 'Si l’IA est hors ligne, l’onglet « Cette semaine » disparaît.',
          en: 'If AI is offline, the “This week” tab disappears.',
        },
        why: {
          fr: 'Plutôt que d’afficher un bouton mort qui ne ferait rien.',
          en: 'Rather than show a dead button that would do nothing.',
        },
      },
      {
        label: { fr: 'Allumer / éteindre l’IA', en: 'Turn AI on / off' },
        detail: {
          fr: 'L’interrupteur marche/arrêt de l’IA pour toute la maisonnée. Coupé, l’IA ne tourne plus nulle part et toutes les fonctions IA se cachent — tout le reste continue de marcher.',
          en: 'The household-wide AI on/off switch. Off, AI stops running everywhere and every AI feature hides — everything else keeps working.',
        },
        why: {
          fr: 'Pour garder le contrôle : rien ne part vers un modèle si tu n’y tiens pas.',
          en: 'To stay in control: nothing goes to a model unless you want it to.',
        },
      },
      {
        label: { fr: 'Mode inactif (test)', en: 'Idle mode (test)' },
        detail: {
          fr: 'Accélère ou force le retour à « Maisonnée » d’un kiosque pour le voir à l’œuvre.',
          en: 'Speed up or force a kiosk’s drift back to “Household” to watch it work.',
        },
        why: {
          fr: 'Le vrai délai est de 3 minutes — impossible à vérifier sans un raccourci.',
          en: 'The real delay is 3 minutes — impossible to check without a shortcut.',
        },
      },
      {
        label: { fr: 'Journal d’entretien de l’IA', en: 'AI maintenance log' },
        detail: {
          fr: 'Voir ce qui a brisé et quand. Le bouton « Tester l’IA » vérifie en direct si les modèles répondent.',
          en: 'See what broke and when. The “Test AI” button live-checks whether the models respond.',
        },
        why: {
          fr: 'Pour comprendre une fonction IA qui ne répond plus, au lieu de deviner.',
          en: 'To make sense of an AI feature that stopped responding, instead of guessing.',
        },
      },
      {
        label: { fr: 'Pas une métrique', en: 'Not a metric' },
        detail: {
          fr: 'Touche « Effacer » quand tu l’as lu, et c’est vide.',
          en: 'Tap “Clear” once you’ve read it, and it’s empty.',
        },
        why: {
          fr: 'Aucun compteur à surveiller — c’est un carnet d’entretien, pas un tableau de bord.',
          en: 'No counter to watch — it’s a maintenance log, not a dashboard.',
        },
      },
    ],
  },
  {
    id: 'set-display',
    icon: 'paint-brush-bold',
    group: 'settings',
    route: '/settings?tab=settings&sub=display',
    title: { fr: 'Le babillard', en: 'The board' },
    what: {
      fr: 'L’apparence de cet appareil et du babillard : thème jour/nuit, langue, vue parent/enfant, accessibilité, disposition des cartes, mode veille, voix de lecture, photos de famille et mode calme.',
      en: 'How this device and the board look: day/night theme, language, parent/kid view, accessibility, card layout, idle mode, reading voice, family photos and calm mode.',
    },
    points: [
      {
        label: { fr: 'Thème jour / nuit', en: 'Day / night theme' },
        detail: {
          fr: 'Bascule entre [[icon:sun-bold]] jour et [[icon:moon-stars-bold]] nuit. Avec « Ambiance du jour » activée, le thème suit l’heure tout seul et passe au mode nuit le soir.',
          en: 'Toggle between [[icon:sun-bold]] day and [[icon:moon-stars-bold]] night. With “Ambient theming” on, the theme follows the time on its own and switches to night in the evening.',
        },
        why: {
          fr: 'Pour la lisibilité selon l’heure — doux le soir, net en plein jour. Sur un mur allumé tout le jour, l’ambiance s’en occupe sans que personne y touche.',
          en: 'For readability by time of day — gentle at night, crisp in daylight. On a wall lit all day, ambient theming handles it with nobody touching a thing.',
        },
      },
      {
        label: { fr: 'Langue', en: 'Language' },
        detail: {
          fr: 'Français ou anglais.',
          en: 'French or English.',
        },
        why: {
          fr: 'Le réglage suit cet appareil — chacun le sien, sans imposer sa langue aux autres.',
          en: 'The setting follows this device — each its own, without forcing a language on the others.',
        },
      },
      {
        label: { fr: 'Vue parent / enfant', en: 'Parent / kid view' },
        detail: {
          fr: 'Passe en vue enfant d’ici. Rappel : pour ressortir, garde le doigt dans le coin haut-gauche (voir « Vue parent ou enfant »).',
          en: 'Switch to kid view here. Reminder: to get back out, hold the top-left corner (see “Parent or kid view”).',
        },
        why: {
          fr: 'C’est le même interrupteur que le [[icon:baby-bold]] de la barre : il rebascule toutes les sections d’un coup pour ce seul appareil, sans toucher aux autres.',
          en: 'It’s the same switch as the [[icon:baby-bold]] in the bar: it flips every section at once for this one device, without touching the others.',
        },
      },
      {
        label: { fr: 'Récents', en: 'Recent' },
        detail: {
          fr: '« Voir les récents » [[icon:clock-bold]] ouvre un retour calme sur tes dernières actions de la session — quoi, et il y a combien de temps. Celles encore récentes gardent un « Annuler ».',
          en: '“View recent” [[icon:clock-bold]] opens a calm look back at your latest actions this session — what, and how long ago. The ones still recent keep an “Undo”.',
        },
        why: {
          fr: 'Le bandeau « Annuler » disparaît vite; ceci te laisse rattraper une action manquée. Rien n’est gardé après le rechargement — un aide-mémoire, pas un journal.',
          en: 'The “Undo” toast fades fast; this lets you catch one you missed. Nothing is kept after a reload — a memory aid, not an audit log.',
        },
      },
      {
        label: { fr: 'Accessibilité', en: 'Accessibility' },
        detail: {
          fr: 'Renforce le [[icon:sparkle-bold]] contraste et grossis le [[icon:magnifying-glass-bold]] texte pour mieux voir — de loin du mur ou de plus près.',
          en: 'Boost the [[icon:sparkle-bold]] contrast and enlarge the [[icon:magnifying-glass-bold]] text to see better — from across the room or up close.',
        },
        why: {
          fr: 'Au-delà de la vue enfant : pour une vision basse ou un mur regardé de loin, sans changer les données. Le réglage suit cet appareil.',
          en: 'Beyond the kid view: for low vision or a wall read from afar, without changing the data. The setting follows this device.',
        },
      },
      {
        label: { fr: 'Mode veille', en: 'Idle mode' },
        detail: {
          fr: 'Au repos, le kiosque montre une horloge, la date, tes photos et « à venir » : le prochain repas, événement et la routine du moment. Choisis le délai et ce qui s’affiche ; touche l’écran pour réveiller.',
          en: 'At rest the kiosk shows a clock, the date, your photos and “up next”: the next meal, event and the routine of the moment. Pick the delay and what appears; touch the screen to wake.',
        },
        why: {
          fr: 'Un mur calme et joli quand personne ne s’en sert — et l’option de revenir à « Maisonnée » pour ne pas rester bloqué sur un visage.',
          en: 'A calm, pretty wall when nobody’s using it — plus the option to return to “Household” so it never stays stuck on one face.',
        },
      },
      {
        label: { fr: 'Disposition du babillard', en: 'Board layout' },
        detail: {
          fr: 'Choisis quelles cartes du babillard afficher (Le fil du jour, L’auto, À faire, À venir, Dessins…) et glisse-les dans l’ordre voulu. Propre à CET appareil — la tablette murale et ton téléphone gardent chacun leur disposition.',
          en: 'Choose which board cards show (The day’s timeline, The car, To do, Coming up, Drawings…) and drag them into the order you want. Specific to THIS device — the wall tablet and your phone keep their own layout.',
        },
        why: {
          fr: 'Pour que le babillard montre ce qui compte pour TOI sur CET écran — la tablette glanceable, ton téléphone plus court.',
          en: 'So the board shows what matters to YOU on THIS screen — the tablet glanceable, your phone shorter.',
        },
      },
      {
        label: { fr: 'Voix de lecture', en: 'Reading voice' },
        detail: {
          fr: 'Choisis la voix de lecture à voix haute pour chaque langue (Français / Anglais) et la vitesse, et entends un extrait. « Langue de lecture » force tout en une langue ou suit l’app.',
          en: 'Pick the read-aloud voice for each language (French / English) and the speed, and hear a sample. “Reading language” forces everything to one language or follows the app.',
        },
        why: {
          fr: 'Pour qu’un tout-petit qui écoute entende les mots bien prononcés, dans la bonne langue.',
          en: 'So a little one listening hears the words pronounced properly, in the right language.',
        },
      },
      {
        label: { fr: 'Photos de famille', en: 'Family photos' },
        detail: {
          fr: 'Téléverse une ou plusieurs photos d’un coup (un compteur « 2/5 » suit le lot); elles dérivent doucement sur le babillard et en mode veille.',
          en: 'Upload one or many photos at once (a “2/5” counter tracks the batch); they gently drift across the board and during idle mode.',
        },
        why: {
          fr: 'Elles sont redimensionnées petites avant l’envoi, pour charger vite et rester gratuites.',
          en: 'They’re resized small before upload, to load fast and stay free.',
        },
      },
      {
        label: { fr: 'Retirer une photo', en: 'Remove a photo' },
        detail: {
          fr: 'Le [[icon:x-bold]] sur une vignette l’enlève. Le nombre total est plafonné côté serveur, alors ça reste gratuit.',
          en: 'The [[icon:x-bold]] on a thumbnail removes it. The total is capped server-side, so it stays free.',
        },
      },
      {
        label: { fr: 'Les photos peuvent être absentes', en: 'Photos may be hidden' },
        detail: {
          fr: 'Si le stockage photo (R2) n’est pas branché, les contrôles de photos se cachent tout seuls.',
          en: 'If photo storage (R2) isn’t wired up, the photo controls hide themselves.',
        },
        why: {
          fr: 'Pour ne pas te montrer une fonction qui ne marcherait pas sur ce déploiement.',
          en: 'So it doesn’t show you a feature that wouldn’t work on this deployment.',
        },
      },
      {
        label: { fr: 'Mode calme — ce que ça change', en: 'Calm mode — what it changes' },
        detail: {
          fr: 'Le seul réglage « anti-friction » (activé par défaut) : quand c’est activé, la routine d’enfant ne pousse pas à tout recommencer; elle se termine.',
          en: 'The one “anti-friction” toggle (on by default): when on, the kid routine doesn’t push the child to start over; it just ends.',
        },
        why: {
          fr: 'Pour finir sur du calme, sans relancer un enfant déjà prêt à passer à autre chose.',
          en: 'To end on calm, without re-prompting a child who’s ready to move on.',
        },
      },
      {
        label: { fr: 'Mode calme — ce que ça ne touche pas', en: 'Calm mode — what it never touches' },
        detail: {
          fr: 'Pas de points, pas de notifications, pas d’inventaire : ces garanties sont verrouillées. Ce réglage adoucit une seule friction; il ne déverrouille jamais le calme structurel.',
          en: 'No points, no notifications, no inventory: those guarantees are locked. This toggle softens one friction; it never unlocks the structural calm.',
        },
      },
    ],
  },
  // ── « L'auto » (#28) — the single shared car + carpool + work schedules ──────
  {
    id: 'auto',
    icon: 'key-bold',
    group: 'concepts',
    route: '/voiture',
    title: { fr: 'L’auto', en: 'The car' },
    what: {
      fr: 'Une seule auto pour la maisonnée ? L’auto sait quand elle est prise, quand elle est libre, et qui reconduit qui — sans cinq fils de textos.',
      en: 'One car for the household? The car knows when it’s taken, when it’s free, and who drives whom — without five text threads.',
    },
    points: [
      {
        label: { fr: 'Ton auto', en: 'Your car' },
        detail: {
          fr: 'Donne un nom et une couleur à l’auto dans Réglages ▸ L’auto. Pas d’auto à toi ? Laisse la liste vide — les trajets se font alors en covoiturage.',
          en: 'Name and colour the car in Settings ▸ The car. No car of your own? Leave the list empty — rides are then carpooled.',
        },
      },
      {
        label: { fr: 'Les horaires, une fois', en: 'Schedules, once' },
        detail: {
          fr: 'Dans Réglages ▸ L’auto ▸ Horaires, entre les heures de chacun (travail, garderie) et coche « prend l’auto » au besoin. C’est ce qui dit à L’auto quand la voiture n’est pas là. Choisis la répétition : chaque semaine, ou aux 2 (3, 4) semaines pour un quart en alternance.',
          en: 'In Settings ▸ The car ▸ Schedules, enter everyone’s hours (work, daycare) and tick “takes the car” where it applies. That’s what tells The car when the vehicle is away. Pick the repeat: every week, or every 2 (3, 4) weeks for an alternating shift.',
        },
        why: {
          fr: 'Réglé une fois, ça façonne chaque journée tout seul — tu n’y reviens que pour une semaine différente.',
          en: 'Set once, it shapes every day on its own — you only return for an off week.',
        },
      },
      {
        label: { fr: 'Visible partout', en: 'Visible everywhere' },
        detail: {
          fr: 'Les horaires apparaissent là où c’est utile : la carte L’auto du babillard (toujours là quand tu utilises l’auto, même un jour libre), les journées de chacun sur le babillard, et le calendrier — chaque case porte une petite horloge. En lecture seule ailleurs : touche-la et ça ouvre la vue de la semaine pour l’ajuster.',
          en: 'Schedules show where they help: the board’s The-car card (always there once you use the car, even on a free day), everyone’s board lanes, and the calendar — each cell carries a small clock. Read-only elsewhere: tap one and it opens the week view to adjust it.',
        },
      },
      {
        label: { fr: 'La semaine, en un tap', en: 'The week, one tap' },
        detail: {
          fr: 'Touche l’auto sur le babillard pour ouvrir la semaine. L’horaire la remplit déjà ; touche un jour pour ajuster qui a l’auto (ou « reste à la maison ») sans toucher au modèle. « Copier la semaine passée » pour les semaines qui se ressemblent.',
          en: 'Tap the car on the board to open the week. The schedule pre-fills it; tap a day to adjust who has the car (or “stays home”) without touching the template. “Copy last week” for weeks that look alike.',
        },
      },
      {
        label: { fr: 'Qui reconduit', en: 'Who drives' },
        detail: {
          fr: 'Un trajet conduit par un membre prend votre auto ; choisis plutôt une personne du cercle et c’est elle qui conduit (covoiturage) — sans mobiliser la voiture. Ajoute les enfants comme passagers.',
          en: 'A ride driven by a member takes your car; pick someone from the circle instead and they drive (carpool) — without tying up the vehicle. Add the kids as passengers.',
        },
      },
      {
        label: { fr: 'Quand ça se chevauche', en: 'When it clashes' },
        detail: {
          fr: 'Si un trajet tombe pendant que l’auto est déjà prise (au travail, par exemple), une petite note ⚠ le signale — calme, jamais bloquant.',
          en: 'If a ride lands while the car is already taken (at work, say), a small ⚠ note flags it — calm, never blocking.',
        },
        why: {
          fr: 'C’est le piège du foyer à une auto : L’auto le voit pour toi au lieu de te laisser le découvrir à 17 h.',
          en: 'That’s the one-car household trap: The car spots it for you instead of letting you find out at 5 p.m.',
        },
      },
    ],
  },
  {
    id: 'ask',
    icon: 'microphone-bold',
    group: 'concepts',
    route: '/board',
    title: { fr: 'Demande à la maison', en: 'Ask the household' },
    what: {
      fr: 'Une question à voix haute sur ce que la maison sait déjà — soupers, rendez-vous, anniversaires, un numéro de téléphone, un entretien à prévoir — répondue à voix haute, sur demande seulement.',
      en: 'A spoken question about what the house already knows — suppers, appointments, birthdays, a phone number, upkeep coming due — answered out loud, on demand only.',
    },
    points: [
      {
        label: { fr: 'Tiens le micro et parle', en: 'Hold the mic and talk' },
        detail: {
          fr: 'Touche le micro à côté de la loupe (babillard, cuisine, liste, routines) et pose ta question : « c’est quand le rendez-vous chez le dentiste ? », « c’est quoi le numéro du vétérinaire ? », « quand est le prochain entretien du chauffe-eau ? ». Pas de micro ou tu préfères écrire ? Le champ texte fait exactement la même chose.',
          en: 'Tap the mic beside the magnifier (board, kitchen, list, routines) and ask: “when’s the dentist appointment?”, “what’s the vet’s phone number?”, “when’s the water heater’s next service?”. No mic, or you’d rather type? The text field does exactly the same thing.',
        },
        why: {
          fr: 'La maison connaît déjà la réponse — plus vite que d’ouvrir trois sections pour la trouver.',
          en: 'The house already knows the answer — faster than opening three sections to find it.',
        },
      },
      {
        label: { fr: 'Répond à voix haute', en: 'Answers out loud' },
        detail: {
          fr: 'La réponse se lit à voix haute automatiquement, une seule fois ; touche [[icon:speaker-high-bold]] pour la réentendre.',
          en: 'The answer reads itself out loud automatically, once; tap [[icon:speaker-high-bold]] to hear it again.',
        },
      },
      {
        label: { fr: 'Ce qu’elle regarde', en: 'What it looks at' },
        detail: {
          fr: 'Un instantané daté et borné : les soupers planifiés, les rendez-vous (incluant les récurrents), les anniversaires, la liste, les corvées, les notes du frigo, le cercle (personnes et commerces) et les prochains entretiens des carnets. Une seule question, une seule fois — jamais une écoute continue.',
          en: 'A dated, bounded snapshot: planned suppers, appointments (including recurring ones), birthdays, the list, chores, fridge notes, the circle (people and businesses) and carnet upkeep coming due. One question, once — never a continuous listen.',
        },
      },
      {
        label: { fr: 'Strictement sur demande', en: 'Strictly on demand' },
        detail: {
          fr: 'Le micro ne s’ouvre que sous ton doigt — fermer la fenêtre l’éteint immédiatement, même en pleine écoute. Rien n’écoute en arrière-plan.',
          en: 'The mic only opens under your finger — closing the sheet kills it immediately, even mid-listen. Nothing listens in the background.',
        },
        why: {
          fr: 'Une maison calme, jamais un assistant qui traîne les oreilles ouvertes.',
          en: 'A calm household, never an assistant with its ears left open.',
        },
      },
      {
        label: { fr: 'Si l’IA est coupée', en: 'If AI is off' },
        detail: {
          fr: 'Sans [[card:ai|IA]], le micro disparaît — seule la loupe reste, avec sa recherche habituelle (jamais l’IA).',
          en: 'Without [[card:ai|AI]], the mic hides — only the magnifier remains, with its regular (never-AI) search.',
        },
      },
    ],
  },
]

// ── Single-source help text (P2-9 / C-15) ───────────────────────────────────
// A help-mode registry entry (ADD_HELP/CERCLE_HELP/…) that merely restates a
// GUIDE card's `what` or one of its points' `detail` used to type that sentence
// out a SECOND time — the exact prose-drift class this closes. Reach for
// `helpFromGuide` instead of hand-typing `body` whenever the bubble should say
// the same thing the guide already says; keep a bespoke `body` only for a
// bubble that's genuinely contextual (explains the CONTROL, not the concept).
// Both throw at module load on a bad id/point — same failure class as the
// dead-`what`-typo bug: a typo can't ship a blank/broken help bubble.

// The one-line `what` of a Guide card, reused verbatim (originally lib/tourContent's
// private helper, promoted here so helpFromGuide and the tours share one lookup).
export function guideWhat(id: string): Bi {
  const card = GUIDE.find((e) => e.id === id)
  if (!card) throw new Error(`guideContent: no Guide card "${id}"`)
  return card.what
}

// A help-registry `body`: the card's `what` (no `point`), or a specific point's
// `detail` (0-based index into that card's `points`) when the bubble should
// explain one control rather than the whole concept.
export function helpFromGuide(card: string, point?: number): Bi {
  if (point == null) return guideWhat(card)
  const entry = GUIDE.find((e) => e.id === card)
  if (!entry) throw new Error(`guideContent: no Guide card "${card}"`)
  const p = entry.points[point]
  if (!p) throw new Error(`guideContent: card "${card}" has no point ${point} (${entry.points.length} points)`)
  return p.detail
}
