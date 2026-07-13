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
// in any prose string, write [[card:<id>|label]] (e.g. [[card:deals|mode
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
  // Where THIS point's action lives — a « Essayer » link right under the
  // explanation (e.g. « Des liens entre les gens » → /cercle?connect=1, a ＋
  // tile → /board?plus=mot). Only when the point names ONE concrete action;
  // guideLinks.test.ts validates every target.
  route?: string
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
  // « Ouvrir » — the live feature this card documents (any hub tab or scene:
  // '/board', '/voyage/new', '/drawings'…), so the Guide is a launcher, not just
  // an explanation. The feature-discovery map's tiles reuse this same target via
  // CONCEPT_THEMES.route.
  route?: string
  // « Régler » — the exact Réglages spot for this card's knobs, always a
  // /settings?tab=…[&sub=…][&focus=…] URL (focus = a section card inside a
  // stacked sub, see lib/settingsNav). Distinct from `route` on purpose: a card
  // can open the feature AND its settings.
  settings?: string
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
    ids: ['board-widgets', 'capture', 'mots', 'habits'],
  },
  {
    key: 'kitchen',
    icon: 'carrot-bold',
    label: { fr: 'La cuisine', en: 'The kitchen' },
    route: '/kitchen',
    section: 'kitchen',
    ids: ['recipes', 'reserve'],
  },
  {
    key: 'liste',
    icon: 'sparkle-bold',
    label: { fr: 'La liste', en: 'The list' },
    route: '/liste',
    // deals / ghost ride the list-and-store world — sky.
    section: 'liste',
    ids: ['deals', 'ghost'],
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
    ids: ['ai', 'calm', 'audience', 'screensaver', 'share-access'],
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

// ── Retired card ids ─────────────────────────────────────────────────────────
// Every card the manual has ever RETIRED lives on here: old id → the card that
// absorbed it + the point index where its content now starts (`base`), so a
// bookmarked ?card=<old>&point=<n> deep-link still lands on the exact line
// (resolveGuideCard in components/operator/guide.tsx adds base + n). In-code
// references (the 7 help registries, tours, whatsNew, discovery) NEVER use
// these ids — they point at the live card directly; helpRegistry.test.ts
// enforces it. Recompute a base if you trim points above it on the host.
export const GUIDE_CARD_ALIAS: Record<string, { id: string; base: number }> = {
  // The original settings-card consolidation (15 → 8 cards).
  'set-guest': { id: 'set-devices', base: 2 },
  'set-routines': { id: 'set-chores', base: 4 },
  'set-meals': { id: 'set-recipes', base: 2 },
  'set-ghost': { id: 'set-shopping', base: 4 },
  'set-photos': { id: 'set-display', base: 8 },
  'set-calm': { id: 'set-display', base: 11 },
  'set-recap': { id: 'set-ai', base: 0 },
  'set-ailog': { id: 'set-ai', base: 4 },
  // The big agglomeration (55 → 32 cards) — each retired concept folded into
  // its host as appended points, or onto an existing host point (pure alias).
  'type-or-choose': { id: 'capture', base: 6 },
  ask: { id: 'capture', base: 7 },
  'a-regler': { id: 'capture', base: 8 },
  drawings: { id: 'mots', base: 3 },
  cookmode: { id: 'recipes', base: 7 },
  favorites: { id: 'recipes', base: 9 },
  flyers: { id: 'deals', base: 3 },
  cashier: { id: 'deals', base: 5 },
  undo: { id: 'calm', base: 4 },
  surface: { id: 'audience', base: 4 },
  apod: { id: 'screensaver', base: 5 },
  share: { id: 'share-access', base: 6 },
  'share-target': { id: 'share-access', base: 8 },
  account: { id: 'set-household', base: 5 },
  activities: { id: 'set-agenda', base: 5 },
  pairing: { id: 'set-devices', base: 0 },
  'cast-tv': { id: 'set-devices', base: 7 },
  offline: { id: 'settings', base: 4 },
  search: { id: 'board', base: 4 },
  moment: { id: 'board', base: 8 },
  reminders: { id: 'board', base: 10 },
  leftovers: { id: 'kitchen', base: 8 },
  'home-projects': { id: 'set-chores', base: 8 },
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
    route: '/board',
    settings: '/settings?tab=board',
    title: { fr: 'Le babillard', en: 'The board' },
    what: {
      fr: 'L’écran « coup d’œil » de la maison : l’heure, l’agenda du jour, le souper de ce soir et les corvées, sur un même mur.',
      en: 'The home’s glance screen: the time, today’s agenda, tonight’s supper and the chores, on one wall.',
    },
    points: [
      // ⚠ Help registries + GUIDE_CARD_ALIAS deep-link into this card BY POINT
      // INDEX — append new points at the END, never insert or reorder
      // (helpRegistry.test.ts checks range, not meaning; a shift would silently
      // mis-point every bubble and alias).
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Le ＋ (en bas) ajoute : une note, un rendez-vous, une corvée, un à-faire, un mot à laisser, un voyage, ou planifier la journée.',
          en: 'The ＋ (bottom) adds: a note, an appointment, a chore, a to-do, a note to leave, a trip, or plan the day.',
        },
        route: '/board?plus=1',
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
          fr: 'Les jours chargés, la carte « Aujourd’hui » se déplie en fil du jour : rendez-vous, trajets et heures de travail dans l’ordre de l’heure, avec un repère « Maintenant ». Touche une ligne pour sa fiche.',
          en: 'On a busy day the “Today” card unfolds into the day’s timeline: appointments, rides and work hours in time order, with a “Now” marker. Tap a row for its card.',
        },
      },
      {
        label: { fr: 'Toucher pour les détails', en: 'Tap for details' },
        detail: {
          fr: 'Touche une affaire pour l’ouvrir : le souper ouvre sa recette, une routine se met à jouer, le reste ouvre sa fiche avec un ou deux gestes rapides.',
          en: 'Tap a thing to open it: the supper opens its recipe, a routine starts playing, everything else opens its card with a quick action or two.',
        },
      },
      {
        label: { fr: 'Tout chercher', en: 'Search everything' },
        detail: {
          fr: 'La loupe 🔍 en haut de chaque onglet cherche partout d’un coup : recettes, personnes, listes, rendez-vous, routines — et ce guide. Les accents sont ignorés.',
          en: 'The magnifier 🔍 atop every tab searches everything at once: recipes, people, lists, appointments, routines — and this guide. Accents are ignored.',
        },
        route: '/search',
      },
      {
        label: { fr: 'Demander à l’IA', en: 'Ask the AI' },
        detail: {
          fr: 'Dans la recherche, pose une vraie question — « qu’est-ce qu’on mange vendredi ? » — puis touche [[icon:sparkle-bold]] « Demander à l’IA ». Elle ne lit que tes propres données.',
          en: 'In search, ask a real question — “what’s for supper Friday?” — then tap [[icon:sparkle-bold]] “Ask the AI”. It only reads your own data.',
        },
        route: '/search',
      },
      {
        label: { fr: 'Avant de partir', en: 'Before you go' },
        detail: {
          fr: 'Sa propre carte sur le babillard : tes listes de départ du jour (à cocher, réutilisables d’un geste), le « à apporter » des activités, et la porte vers l’écran de départ complet — météo, horaire, corvées, l’auto. Une liste de départ vit UN jour, puis s’efface d’elle-même.',
          en: 'Its own board card: today’s leaving checklists (tickable, reusable in one gesture), each activity’s “what to bring”, and the door to the full departure screen — weather, schedule, chores, the car. A leaving checklist lives ONE day, then clears itself.',
        },
        route: '/board/departure',
      },
      {
        label: { fr: 'Changer la vue', en: 'Change the view' },
        detail: {
          fr: 'Trois zooms : la Grille (la journée), le Mois et L’année. Le visage choisi filtre tout — Maisonnée montre tout le monde, un visage montre ses affaires à lui.',
          en: 'Three zooms: the Grid (the day), the Month and The year. The picked face filters everything — Household shows everyone, a face shows just their things.',
        },
      },
      {
        label: { fr: 'Voir un moment', en: 'See a moment' },
        detail: {
          fr: '« Moments » rassemble tout ce qui s’en vient pour ce soir, demain, une date ou la semaine — avec sa liste à cocher. Parfait pour préparer demain ou briefer la gardienne.',
          en: '“Moments” gathers everything coming up for tonight, tomorrow, a date or the week — with its checklist. Perfect to prep tomorrow or brief the sitter.',
        },
        route: '/moment',
      },
      {
        label: { fr: 'Personnaliser le babillard', en: 'Customize the board' },
        detail: {
          fr: 'Garde le doigt sur une carte : glisse-la, change sa largeur, ou retire-la. Chaque appareil garde SA disposition.',
          en: 'Press and hold a card: drag it, change its width, or remove it. Each device keeps ITS layout.',
        },
        route: '/board?edit=1',
      },
      {
        label: { fr: 'À préparer pour demain', en: 'Prep for tomorrow' },
        detail: {
          fr: 'Ce qui est prévu demain remonte dès aujourd’hui, avec un aperçu météo — le temps de sortir l’habit de neige.',
          en: 'What’s planned tomorrow surfaces today, with a weather outlook — time to dig out the snowsuit.',
        },
      },
      {
        label: { fr: 'La rentrée', en: 'Back to school' },
        detail: {
          fr: 'Donne une fois la rentrée, le dernier jour et les relâches. « Demain » sait alors dire 🎒 « École demain » ou 🏖️ « Congé demain » — jamais un jour ordinaire.',
          en: 'Give the first day, the last day and the breaks once. “Tomorrow” can then say 🎒 “School tomorrow” or 🏖️ “Day off tomorrow” — never on an ordinary day.',
        },
        route: '/settings?tab=board&sub=events&focus=schoolYear',
      },
    ],
  },
  {
    id: 'kitchen',
    icon: 'carrot-bold',
    group: 'sections',
    tour: 'kitchen',
    title: { fr: 'La cuisine', en: 'The kitchen' },
    route: '/kitchen',
    settings: '/settings?tab=kitchen',
    what: {
      fr: 'Tu planifies les soupers et tu signales ce qui achève; la cuisine remplit ta liste d’épicerie pour toi.',
      en: 'You plan the suppers and flag what’s running low; the kitchen fills your grocery list for you.',
    },
    points: [
      // ⚠ Registries + GUIDE_CARD_ALIAS index into this card — append only.
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Le ＋ ajoute : cuisiner une recette, ajouter une recette, le livre illustré, planifier un repas, des restants, un aliment qui achève, ou un article de la réserve.',
          en: 'The ＋ adds: cook a recipe, add a recipe, the picture book, plan a meal, leftovers, a running-low item, or a réserve item.',
        },
        route: '/kitchen?plus=1',
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
          fr: 'Le bouton de suggestion propose une idée; touche encore pour une autre. « Vide-frigo » invente même un souper avec ce qui va se perdre. (IA — caché si elle est coupée.)',
          en: 'The suggest button offers an idea; tap again for another. “Empty the fridge” even invents a supper from what’s about to spoil. (AI — hidden when off.)',
        },
      },
      {
        label: { fr: 'Recettes', en: 'Recipes' },
        detail: {
          fr: 'Garde tes recettes, importe-les d’une photo ou d’un lien, et planifie-les comme repas — leurs ingrédients arrivent sur la liste.',
          en: 'Keep your recipes, import them from a photo or a link, and plan them as meals — their ingredients land on the list.',
        },
      },
      {
        label: { fr: 'Collections', en: 'Collections' },
        detail: {
          fr: 'Range tes recettes par étiquette (Soupes, Desserts…) et feuillette-les par collection. En mode bambin, tout en images et lu à voix haute.',
          en: 'Group your recipes by tag (Soups, Desserts…) and browse by collection. In toddler mode, all pictures and read aloud.',
        },
      },
      {
        label: { fr: 'Le livre illustré des petits', en: 'The kids’ picture book' },
        detail: {
          fr: 'Un livre de cuisine tout en images, une grande page par recette, le nom lu à voix haute. Un pré-lecteur s’en sert seul.',
          en: 'An all-pictures cookbook, one big page per recipe, the name read aloud. A pre-reader uses it alone.',
        },
        route: '/kitchen/book',
      },
      {
        label: { fr: 'Lecture à voix haute', en: 'Read aloud' },
        detail: {
          fr: 'Les recettes et les routines se lisent à voix haute. Choisis la voix pour chaque langue dans Réglages ▸ Système ▸ Voix; une recette gardée en anglais se lit en anglais.',
          en: 'Recipes and routines read themselves aloud. Pick the voice per language in Settings ▸ System ▸ Voice; a recipe kept in English reads in English.',
        },
      },
      {
        label: { fr: 'À utiliser bientôt', en: 'Use it soon' },
        detail: {
          fr: 'Marque un aliment « à utiliser bientôt » avant qu’il se perde, et note les restants à finir. Rien ne va sur la liste : ça nourrit plutôt les idées de souper.',
          en: 'Flag a food “use soon” before it spoils, and note leftovers to finish. Nothing goes on the list: it feeds the supper ideas instead.',
        },
      },
      {
        label: { fr: 'Le tiroir « Idées »', en: 'The « Idées » drawer' },
        detail: {
          fr: 'Un seul tiroir pour toutes les idées de repas : tes valeurs sûres, ⭐ les favoris, 🧊 à écouler, 🤖 l’IA, et 👧 ce qu’un enfant propose. Touche une idée pour la déposer sur un jour.',
          en: 'One drawer for every meal idea: your go-tos, ⭐ favorites, 🧊 use-it-up, 🤖 AI, and 👧 what a child suggests. Tap an idea to drop it on a day.',
        },
        route: '/kitchen/idees',
      },
    ],
  },
  {
    id: 'routines',
    tour: 'routines',
    icon: 'smiley-bold',
    group: 'sections',
    route: '/routines',
    settings: '/settings?tab=routines',
    title: { fr: 'Routines', en: 'Routines' },
    what: {
      fr: 'Des routines en cartes-images pour les enfants (matin, dodo…), lues à voix haute. Un pré-lecteur les fait seul.',
      en: 'Picture-card routines for kids (morning, bedtime…), read aloud. A pre-reader runs them alone.',
    },
    points: [
      // ⚠ Registries index into this card — append only.
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Le ＋ ouvre le gestionnaire : créer une routine, ou toucher une routine existante pour la modifier.',
          en: 'The ＋ opens the manager: create a routine, or tap an existing one to edit it.',
        },
        route: '/routines?plus=1',
      },
      {
        label: { fr: 'Une étape à la fois', en: 'One step at a time' },
        detail: {
          fr: 'Une grande carte « c’est l’heure de… », puis « ensuite ». L’enfant touche pour avancer.',
          en: 'One big “right now…” card, then “next”. The child taps to move forward.',
        },
      },
      {
        label: { fr: 'Lu à voix haute', en: 'Read aloud' },
        detail: {
          fr: 'L’appareil lit chaque étape — aucune lecture requise de l’enfant.',
          en: 'The device speaks each step — no reading required from the child.',
        },
      },
      {
        label: { fr: 'Ta voix, tes photos', en: 'Your voice, your photos' },
        detail: {
          fr: 'Sur chaque carte, 🎙️ enregistre ta voix et 📷 met une vraie photo (la vraie brosse à dents). Optionnel, et ça s’efface en un toucher.',
          en: 'On each card, 🎙️ records your voice and 📷 adds a real photo (the actual toothbrush). Optional, and it clears in one tap.',
        },
      },
      {
        label: { fr: 'Le mur d’autocollants (optionnel)', en: 'The sticker wall (optional)' },
        detail: {
          fr: 'Si tu désactives le « Mode calme », l’enfant place un autocollant en finissant sa routine. Par défaut, il n’existe pas — c’est une récompense volontaire, jamais un classement.',
          en: 'If you turn OFF “Calm mode”, the child places a sticker on finishing a routine. By default it doesn’t exist — an opt-in reward, never a ranking.',
        },
        route: '/routine/stickers',
      },
      {
        label: { fr: 'Une minuterie sur une étape', en: 'A timer on a step' },
        detail: {
          fr: 'Donne une durée à une étape (2 minutes pour les dents) : l’enfant part l’anneau, un petit son joue à la fin. Un repère calme, pas un chrono.',
          en: 'Give a step a length (2 minutes for teeth): the child starts the ring, a soft sound plays at the end. A calm cue, not a stopwatch.',
        },
      },
      {
        label: { fr: 'Sur n’importe quel appareil', en: 'On any device' },
        detail: {
          fr: 'Touche ▶ « Faire » pour lancer la routine depuis ton téléphone et la faire avec l’enfant, minuteries comprises.',
          en: 'Tap ▶ “Do it” to run the routine from your phone and do it with the child, timers and all.',
        },
      },
      {
        label: { fr: 'D’une recette à une routine', en: 'From a recipe to a routine' },
        detail: {
          fr: 'Sur une [[card:recipes|recette]], « En routine pour enfant » : chaque étape devient une carte-image, et l’enfant « cuisine » la recette lue à voix haute.',
          en: 'On a [[card:recipes|recipe]], “Make a kid routine”: each step becomes a picture card, and the child “cooks” the recipe read aloud.',
        },
      },
      {
        label: { fr: 'Pas de récompenses', en: 'No rewards' },
        detail: {
          fr: 'Aucun point, aucune étoile, aucune séquence. Elle se termine, et c’est tout.',
          en: 'No points, no stars, no streak. It ends, and that’s it.',
        },
      },
      {
        label: { fr: 'Se crée dans Réglages', en: 'Set up in Settings' },
        detail: {
          fr: 'Les étapes et les images se montent dans Réglages ▸ Routines.',
          en: 'Steps and pictures are built in Settings ▸ Routines.',
        },
        route: '/settings?tab=routines&sub=routines',
      },
      {
        label: { fr: 'Jouer', en: 'Play' },
        detail: {
          fr: 'Un petit coin de jeux pour les tout-petits : trouve l’objet, la journée en images, le décompte des fêtes. Tout à voix haute, aucun pointage — un espace calme, jamais une récompense.',
          en: 'A little play corner for toddlers: find-the-object, the day in pictures, the birthday countdown. All read aloud, no scoring — a calm space, never a reward.',
        },
        route: '/jouer',
      },
      {
        label: { fr: 'Revenir en arrière', en: 'Going back' },
        detail: {
          fr: 'Un doigt trop rapide ? La ← à côté de la → défait la dernière étape : l’histoire recule et la carte se relit tout haut. Dans la pellicule d’étapes en bas, touche une étape déjà faite — elle demande « Revenir à … ? Tape encore » — et une étape à venir se contente de se dire (jamais de saut).',
          en: 'A finger too quick? The ← beside the → un-does the last step: the story rewinds and the card reads itself aloud again. In the filmstrip below, tap a finished step — it asks “Go back to …? Tap again” — while a step still coming up only speaks itself (never a jump).',
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
    route: '/cercle',
    settings: '/settings?tab=cercle',
    what: {
      fr: 'Le carnet des proches : famille, amis et animaux, avec photo, fête, courriel et téléphone.',
      en: 'The directory of the people close to you: family, friends and pets, with photo, birthday, email and phone.',
    },
    points: [
      // ⚠ Registries + GUIDE_CARD_ALIAS index into this card — append only.
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Le ＋ ajoute : une personne, bâtir une famille, relier deux personnes, un groupe, un business (vétérinaire, plombier…), un animal, ou un carnet (maison, auto…).',
          en: 'The ＋ adds: a person, build a family, connect two people, a group, a business (vet, plumber…), a pet, or a carnet (home, car…).',
        },
        route: '/cercle?plus=1',
      },
      {
        label: { fr: 'Ta Maisonnée, ta famille', en: 'Your Household, your family' },
        detail: {
          fr: 'En haut du cercle, une seule carte regroupe ta maisonnée — et tes animaux. Son titre suit le nom donné dans Réglages; rien à bâtir à la main.',
          en: 'At the top of the circle, one card gathers your household — and your pets. Its title follows the name set in Settings; nothing to build by hand.',
        },
      },
      {
        label: { fr: 'Une personne, une fiche', en: 'One person, one card' },
        detail: {
          fr: 'Prénom, photo, fête, courriel, téléphone, notes. Touche une fiche pour la voir, avec « Appeler » et « Écrire ».',
          en: 'Name, photo, birthday, email, phone, notes. Tap a card to see it, with “Call” and “Email”.',
        },
      },
      {
        label: { fr: 'Des liens entre les gens', en: 'Links between people' },
        detail: {
          fr: 'Dis « X est le parent de Y » : le lien inverse s’ajoute tout seul, et les familles se regroupent d’elles-mêmes. Les grands-parents, oncles et cousins se déduisent — relie le minimum, l’appli fait le reste.',
          en: 'Say “X is Y’s parent”: the reverse link is added for you, and families group themselves. Grandparents, uncles and cousins are inferred — link the minimum, the app does the rest.',
        },
        route: '/cercle?connect=1',
      },
      {
        label: { fr: 'Bâtir une famille d’un coup', en: 'Build a family at once' },
        detail: {
          fr: 'Nomme la famille, glisse chaque visage dans sa rangée (Grands-parents, Parents, Enfants) : les liens se créent tout seuls. « Compléter les familles » déduit ensuite ce qui manque.',
          en: 'Name the family, drag each face into its row (Grandparents, Parents, Children): the links build themselves. “Complete the families” then infers what’s missing.',
        },
        route: '/cercle/family/new',
      },
      {
        label: { fr: 'Relier deux familles', en: 'Connect two families' },
        detail: {
          fr: 'Choisis une personne de chaque côté, dis comment elles sont liées, et c’est tout — ce seul lien rattache la belle-famille au complet.',
          en: 'Pick a person on each side, say how they’re related, and that’s it — that one link attaches the whole in-law family.',
        },
        route: '/cercle?connect=1',
      },
      {
        label: { fr: 'Trois vues : Liste, Liens, Arbre', en: 'Three views: List, Links, Tree' },
        detail: {
          fr: 'Liste (le répertoire par famille), Liens (touche un visage, ses liens s’affichent autour) et Arbre (les générations). La rangée de visages relit tout du point de vue de la personne choisie. Dans Social, Liens montre plutôt tes cercles — chaque famille, chaque groupe — et Arbre la famille de chaque ami, reliée aux autres par les amitiés.',
          en: 'List (the directory by family), Links (tap a face, their ties fan out) and Tree (the generations). The face row rereads everything from the picked person’s perspective. Under Social, Links instead shows your circles — every family, every group — and Tree shows each friend’s family, joined to the others by the friendships between them.',
        },
      },
      {
        label: { fr: 'Notre monde', en: 'Our world' },
        detail: {
          fr: 'La vue d’ensemble : chaque famille et chaque groupe forme une île, des traits relient les îles. Tout se touche et se dit à voix haute; « Raconte-moi » fait le tour tout seul.',
          en: 'The big picture: every family and group is an island, lines join the islands. Everything taps and speaks; “Tell me about us” takes the tour on its own.',
        },
        route: '/cercle/monde',
      },
      {
        label: { fr: 'Groupes, adresse et photos', en: 'Groups, address and photos' },
        detail: {
          fr: 'Crée des groupes nommés (Famille Tremblay, Collègues…) et range les gens dedans d’un toucher. Une fiche garde aussi l’adresse, des photos, et s’exporte ou s’importe (vCard). Cherche par prénom OU nom.',
          en: 'Create named groups (Tremblay family, Coworkers…) and drop people in with a tap. A card also keeps the address and photos, and exports or imports (vCard). Search by first OR last name.',
        },
        route: '/settings?tab=cercle&sub=cercle',
      },
      {
        label: { fr: 'Les fêtes, en douceur', en: 'Birthdays, gently' },
        detail: {
          fr: 'Les anniversaires apparaissent tout seuls sur le babillard et le calendrier (🎂 le jour même), avec tes 🎁 idées-cadeaux sur la fiche. Jamais de notification.',
          en: 'Birthdays show up on their own on the board and calendar (🎂 on the day), with your 🎁 gift ideas on the card. Never a notification.',
        },
      },
      {
        label: { fr: 'Social / Famille + les notes', en: 'Social / Family + the notes' },
        detail: {
          fr: 'Deux onglets : Famille (ta parenté) et Social (les amis et leurs familles à eux). Sous Famille, « Notes & recommandations » : des notes rapides pour toi ou toute la Maisonnée, avec photo, dessin ou mémo vocal.',
          en: 'Two tabs: Family (your kin) and Social (friends and their own families). Under Family, “Notes & recommendations”: quick notes for you or the whole Household, with photo, drawing or voice memo.',
        },
      },
      {
        label: { fr: 'Business : tes services', en: 'Business: your services' },
        detail: {
          fr: 'Ton carnet de commerces — vétérinaire, dentiste, plombier, garderie. Touche pour appeler, écrire ou ouvrir l’itinéraire; un rendez-vous peut s’y relier.',
          en: 'Your directory of businesses — vet, dentist, plumber, daycare. Tap to call, write or open directions; an appointment can link to one.',
        },
      },
      {
        label: { fr: 'La maison cette année', en: 'The home this year' },
        detail: {
          fr: 'La maison relit son année, mois par mois : les soins, les corvées faites, les voyages, les dessins gardés. Des noms et des dates — jamais des comptes. Ça s’écrit tout seul.',
          en: 'The home rereads its year, month by month: the care, the chores done, the trips, the kept drawings. Names and dates — never counts. It writes itself.',
        },
        route: '/settings?tab=cercle&sub=annee',
      },
    ],
  },
  {
    id: 'liste',
    tour: 'liste',
    icon: 'sparkle-bold',
    group: 'sections',
    title: { fr: 'La liste', en: 'The list' },
    route: '/liste',
    settings: '/settings?tab=liste',
    what: {
      fr: 'Une seule liste partagée (l’épicerie, le plus souvent). Tout le monde la voit et l’ajoute, sur tous les appareils.',
      en: 'One shared list (groceries, usually). Everyone sees it and adds to it, on every device.',
    },
    points: [
      // ⚠ Registries index into this card — append only.
      {
        label: { fr: 'Le bouton ＋ ici', en: 'The ＋ button here' },
        detail: {
          fr: 'Le ＋ ajoute : un article, l’ajout rapide (plusieurs d’un coup), parcourir les circulaires, « choisir les meilleurs » rabais, ou partager la liste.',
          en: 'The ＋ adds: an item, quick-add (several at once), browse the flyers, “pick the best” deals, or share the list.',
        },
        route: '/liste?plus=1',
      },
      {
        label: { fr: 'Cocher en place', en: 'Check in place' },
        detail: {
          fr: 'Coche un article et il se marque fait, sans bouger — simple à lire en magasin.',
          en: 'Check an item and it marks done, in place — easy to read in the store.',
        },
      },
      {
        label: { fr: 'Vider les cochés', en: 'Clear checked' },
        detail: {
          fr: 'Un bouton enlève tout ce qui est coché d’un coup, derrière un « Annuler » de quelques secondes.',
          en: 'One button removes everything checked at once, behind a few-second “Undo”.',
        },
      },
      {
        label: { fr: 'Ajout rapide', en: 'Quick add' },
        detail: {
          fr: 'Re-remplis la semaine en quelques touches à partir de ce que tu achètes souvent. « Toujours » garde tes essentiels (lait, pain…) à un tap — sans jamais s’ajouter tout seul.',
          en: 'Restock the week in a few taps from what you buy often. “Always” keeps your staples (milk, bread…) one tap away — without ever adding on its own.',
        },
        route: '/liste/quick',
      },
      {
        label: { fr: 'Chercher dans la circulaire', en: 'Search the flyer' },
        detail: {
          fr: 'La loupe [[icon:magnifying-glass-bold]] à côté d’« Ajouter » ouvre les [[card:deals|circulaires]] de la semaine pour chercher un article en aubaine.',
          en: 'The magnifier [[icon:magnifying-glass-bold]] beside “Add” opens this week’s [[card:deals|flyers]] to search an item on sale.',
        },
        route: '/liste/circulaires',
      },
      {
        label: { fr: 'Parler ta liste', en: 'Speak your list' },
        detail: {
          fr: 'Touche le micro et nomme tes articles : « lait, œufs pis pain » se découpe en trois articles.',
          en: 'Tap the mic and name your items: “milk, eggs and bread” splits into three items.',
        },
      },
      {
        label: { fr: 'Synonymes de recherche', en: 'Search synonyms' },
        detail: {
          fr: 'Ajoute des synonymes à un article (œuf, œufs, egg) : les [[card:deals|rabais]] se trouvent mieux quand le nom colle à la circulaire.',
          en: 'Add synonyms to an item (egg, eggs, œuf): [[card:deals|deals]] match better when the name lines up with the flyer.',
        },
      },
      {
        label: { fr: 'Choisir les meilleurs prix', en: 'Pick the best prices' },
        detail: {
          fr: 'Un bouton [[icon:sparkle-bold]] trouve le meilleur rabais (au prix unitaire) pour chaque article non coché et t’amène au [[card:deals|mode caissier]].',
          en: 'A [[icon:sparkle-bold]] button finds the best deal (by unit price) for every unchecked item and takes you to [[card:deals|cashier mode]].',
        },
      },
      {
        label: { fr: 'Trier par allée', en: 'Sort by aisle' },
        detail: {
          fr: 'Bascule sur « Par allée » : les articles se trient dans l’ordre de TON magasin. Tu règles cet ordre une fois dans Réglages ▸ Magasinage.',
          en: 'Flip to “By aisle”: items sort in YOUR store’s order. You set that order once in Settings ▸ Shopping.',
        },
        route: '/settings?tab=liste&sub=aisles',
      },
    ],
  },
  {
    id: 'settings',
    icon: 'gear-six-bold',
    group: 'sections',
    route: '/settings',
    title: { fr: 'Réglages', en: 'Settings' },
    what: {
      fr: 'Le poste de pilotage du parent : les personnes, les appareils, les corvées, l’affichage. Réservé à l’opérateur.',
      en: 'The parent’s control panel: people, devices, chores, display. Operator-only.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('offline' → base 4) indexes into this card — append only.
      {
        label: { fr: 'Maisonnée', en: 'Household' },
        detail: {
          fr: 'Ajoute les membres, leur couleur et leur photo — c’est ce qui peuple les visages partout dans l’app.',
          en: 'Add the members, their colour and photo — it’s what populates the faces everywhere in the app.',
        },
        route: '/settings?tab=cercle&sub=members',
      },
      {
        label: { fr: 'Appareils', en: 'Devices' },
        detail: {
          fr: 'Approuve une tablette qui demande à se jumeler, et retire-la quand tu veux — sans lui confier ton mot de passe.',
          en: 'Approve a tablet asking to pair, and remove it whenever you like — without trusting it with your password.',
        },
        route: '/settings?tab=settings&sub=tablets',
      },
      {
        label: { fr: 'Corvées & routines', en: 'Chores & routines' },
        detail: {
          fr: 'Monte la rotation des corvées et les routines d’enfants une fois; ça tourne ensuite tout seul.',
          en: 'Build the chore rotation and the kid routines once; they then run on their own.',
        },
        route: '/settings?tab=routines&sub=chores',
      },
      {
        label: { fr: 'Réservé au parent', en: 'Parent-only' },
        detail: {
          fr: 'La vue enfant et les invités ne peuvent pas ouvrir Réglages — exprès.',
          en: 'The kid view and guests can’t open Settings — on purpose.',
        },
      },
      {
        label: { fr: 'Ça marche hors ligne', en: 'It works offline' },
        detail: {
          fr: 'Si le wifi tombe, le babillard garde ce qu’il montrait, et tes gestes (cocher, ajouter) attendent puis se synchronisent tout seuls au retour du réseau.',
          en: 'If the wifi drops, the board keeps what it was showing, and your actions (checking, adding) wait, then sync on their own when the network returns.',
        },
      },
      {
        label: { fr: 'Le micro, autorisé une fois', en: 'The mic, allowed once' },
        detail: {
          fr: 'Le navigateur demande le micro la première fois — accepte et c’est retenu. Sur iPhone/iPad, un refus se corrige dans Réglages → Safari → Microphone.',
          en: 'The browser asks for the mic the first time — allow it and it’s remembered. On iPhone/iPad, a decline is fixed in Settings → Safari → Microphone.',
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
    settings: '/settings?tab=settings&sub=ai',
    what: {
      fr: 'L’IA donne un coup de main à quelques endroits — toujours sur demande, jamais en arrière-plan. Tu peux la couper : tout marche sans elle.',
      en: 'AI lends a hand in a few spots — always on demand, never in the background. You can turn it off: everything works without it.',
    },
    points: [
      {
        label: { fr: 'Où l’IA aide', en: 'Where AI helps' },
        detail: {
          fr: 'Six endroits, pas plus : la [[card:capture|capture]], l’import d’une [[card:recipes|recette]], le bilan de la semaine, les suggestions de souper, « Demander à l’IA » dans la recherche, et le micro « Demande à la maison ». Partout ailleurs, aucune IA.',
          en: 'Six spots, no more: [[card:capture|capture]], [[card:recipes|recipe]] import, the weekly recap, supper suggestions, “Ask the AI” in search, and the “Ask the household” mic. Everywhere else, no AI.',
        },
      },
      {
        label: { fr: 'Ce qu’elle envoie', en: 'What it sends' },
        detail: {
          fr: 'Seulement ce qu’il faut pour la tâche, et seulement quand TU touches le bouton — puis c’est oublié. Rien ne sert à entraîner des modèles ni à faire de la pub; évite quand même d’y écrire un mot de passe.',
          en: 'Only what the task needs, and only when YOU tap the button — then it’s dropped. Nothing trains models or feeds ads; still, don’t type a password into it.',
        },
      },
      {
        label: { fr: 'Ça peut se tromper', en: 'It can be wrong' },
        detail: {
          fr: 'L’IA devine — elle peut mal classer une note ou mal lire une date. Rien n’est perdu : tu corriges en un geste, et tu gardes le dernier mot.',
          en: 'AI guesses — it can misfile a note or misread a date. Nothing is lost: you fix it in one tap, and you keep the last word.',
        },
      },
      {
        label: { fr: 'Tu peux l’éteindre', en: 'You can turn it off' },
        detail: {
          fr: 'Un interrupteur coupe l’IA pour toute la maisonnée. Coupée, l’app reste entière : les fonctions IA se cachent, rien ne casse — et jamais de boucle ni de notification de toute façon.',
          en: 'One switch turns AI off for the whole household. Off, the app stays complete: AI features hide, nothing breaks — and never a loop or a notification anyway.',
        },
      },
      {
        label: { fr: 'Quand une fonction IA bloque', en: 'When an AI feature is stuck' },
        detail: {
          fr: 'Un petit journal d’entretien note ce qui a brisé et quand — tu vois la vraie cause au lieu de deviner.',
          en: 'A small maintenance log records what broke and when — you see the real cause instead of guessing.',
        },
        route: '/settings?tab=settings&sub=system&focus=aiLog',
      },
    ],
  },
  {
    id: 'capture',
    icon: 'microphone-bold',
    group: 'concepts',
    route: '/board',
    settings: '/settings?tab=settings&sub=ai',
    title: { fr: 'Ajouter & demander (écrire ou parler)', en: 'Add & ask (type or speak)' },
    what: {
      fr: 'Dis ou écris une phrase — « souper spaghetti vendredi » — et l’app la range à la bonne place toute seule.',
      en: 'Say or type a line — “spaghetti supper Friday” — and the app files it in the right place on its own.',
    },
    points: [
      // ⚠ Registries + GUIDE_CARD_ALIAS index into this card — append only.
      {
        label: { fr: 'Demander ou classer', en: 'Ask or file' },
        detail: {
          fr: 'Le micro en haut fait deux choses : « Demander » répond à une question sur la maison, « Classer » range ce que tu viens de dire.',
          en: 'The mic up top does two things: “Ask” answers a question about the home, “File it” puts away what you just said.',
        },
      },
      {
        label: { fr: 'Le ＋ reste pour ajouter', en: 'The ＋ is still for adding' },
        detail: {
          fr: 'Le bouton ＋ s’adapte à la section (une recette dans la cuisine, un article sur la liste). Sa « Note rapide » garde tes mots ET ce que tu y joins avec le 📎.',
          en: 'The ＋ button adapts to the section (a recipe in the kitchen, an item on the list). Its “Quick note” keeps your words AND whatever you clip on with the 📎.',
        },
        route: '/board?plus=1',
      },
      {
        label: { fr: 'Des raccourcis selon la section', en: 'Shortcuts per section' },
        detail: {
          fr: 'Sur le babillard, le ＋ offre aussi « Planifier aujourd’hui » et « Planifier demain » — toute la journée d’un coup : repas, rendez-vous, corvées, note.',
          en: 'On the board, the ＋ also offers “Plan today” and “Plan tomorrow” — the whole day at once: meals, events, chores, note.',
        },
      },
      {
        label: { fr: 'Parler plutôt qu’écrire', en: 'Speak instead of type' },
        detail: {
          fr: 'La reconnaissance vocale se fait sur l’appareil — rien n’est envoyé ailleurs. « souper spaghetti jeudi » devient un repas, le bon jour.',
          en: 'Voice recognition runs on the device — nothing is sent away. “spaghetti supper Thursday” becomes a meal, on the right day.',
        },
      },
      {
        label: { fr: 'Si l’IA est hors ligne', en: 'If AI is offline' },
        detail: {
          fr: 'Tu choisis toi-même le type dans une petite liste — rien n’est perdu, même sans [[card:ai|IA]].',
          en: 'You pick the type yourself from a small list — nothing is lost, even without [[card:ai|AI]].',
        },
      },
      {
        label: { fr: 'Joindre un mémo, un dessin ou une photo', en: 'Clip on a memo, a drawing or a photo' },
        detail: {
          fr: 'Le trombone 📎 dans le champ de texte joint un mémo vocal, un dessin ou une photo à ta note — sans effacer ce que tu as écrit. « Photo » attache la pic telle quelle, d’un geste; pour dessiner par-dessus, ouvre « Dessiner » et charge-la avec l’outil 🖼. Un mémo tout seul est une note valide aussi.',
          en: 'The 📎 in the text field clips a voice memo, a drawing or a photo onto your note — without erasing what you wrote. “Photo” attaches the shot as-is, in one tap; to draw over it, open “Draw” and load it with the 🖼 tool. A memo on its own is a valid note too.',
        },
      },
      {
        label: { fr: 'Garder la photo (deux fois plutôt qu’une)', en: 'Keep the photo (twice, not once)' },
        detail: {
          fr: 'Une photo jointe à une note ne vivait que sur cette note-là : effacer la note l’emportait, et une pic prise dans l’app ne se rendait jamais dans la pellicule du téléphone. Sous la photo, deux petits choix : « Garder dans les photos » l’ajoute au cadre de la maison (elle dérive au babillard et en veille — [[card:screensaver|mode veille]]), et « Enregistrer sur l’appareil » te la redonne dans tes photos à toi. Chacune est une copie indépendante : effacer la note n’efface plus rien d’autre.',
          en: 'A photo clipped to a note used to live only on that note: clearing the note took it away, and a shot snapped inside the app never reached the phone’s camera roll. Under the photo, two small choices: “Keep in the photos” adds it to the household frame (it drifts across the board and the screensaver — [[card:screensaver|idle mode]]), and “Save to my device” hands it back to your own photos. Each is an independent copy: clearing the note no longer erases anything else.',
        },
      },
      {
        label: { fr: 'Écrire ou choisir', en: 'Type or choose' },
        detail: {
          fr: 'Partout où tu ajoutes un repas ou une idée, une seule boîte : écris librement, ou choisis dans la liste qui se filtre à mesure que tu tapes.',
          en: 'Everywhere you add a meal or an idea, one box: type freely, or pick from the list that filters as you type.',
        },
      },
      {
        label: { fr: 'Demande à la maison', en: 'Ask the household' },
        detail: {
          fr: 'Pose une question à voix haute — « c’est quand le rendez-vous chez le dentiste ? » — et la maison répond à voix haute. Sur demande seulement : rien n’écoute en arrière-plan.',
          en: 'Ask a question out loud — “when’s the dentist appointment?” — and the house answers out loud. On demand only: nothing listens in the background.',
        },
      },
      {
        label: { fr: '« À régler »', en: '“To sort”' },
        detail: {
          fr: 'Une petite carte du babillard signale ce qui mérite ton attention — une sortie sans conducteur, un souper vide. La liste complète, avec un raccourci par correction, vit dans Réglages ▸ « Cette semaine ». Elle se vide quand c’est réglé.',
          en: 'A small board card flags what deserves your attention — a ride with no driver, an empty supper. The full list, with a one-tap fix each, lives in Settings ▸ “This week”. It empties as you sort it.',
        },
        route: '/settings?tab=board&sub=thisweek',
      },
    ],
  },
  {
    id: 'mots',
    icon: 'envelope-bold',
    group: 'concepts',
    route: '/board?plus=mot',
    title: { fr: 'Mots & dessins', en: 'Notes & drawings' },
    what: {
      fr: 'Un petit message qu’un membre laisse à un autre — écrit, vocal, dessiné ou en photo — et qui l’attend, fermé, sur son visage.',
      en: 'A little message one member leaves for another — typed, spoken, drawn or a photo — waiting, unopened, on their face.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('drawings' → base 3) indexes into this card — append only.
      {
        label: { fr: 'Déposer un mot', en: 'Leave a note' },
        detail: {
          fr: 'Touche le ＋ → « Laisse un mot », choisis à qui, puis écris ou enregistre. « Plus tard » le programme (un « bonne fête » au matin); « Me le rappeler » se laisse un mot à soi-même.',
          en: 'Tap ＋ → “Leave a note”, choose who it’s for, then type or record. “Later” schedules it (a “happy birthday” in the morning); “Remind me” leaves one to yourself.',
        },
        route: '/board?plus=mot',
      },
      {
        label: { fr: 'Il attend, sans presser', en: 'It waits, no pressure' },
        detail: {
          fr: 'Le mot reste fermé sur le visage du destinataire — jamais de pastille de compte. On l’ouvre quand on passe, et on peut y répondre.',
          en: 'The note stays closed on the recipient’s face — never an unread count. You open it when you pass by, and you can reply.',
        },
      },
      {
        label: { fr: 'Différent de la boîte aux lettres', en: 'Different from the mailbox' },
        detail: {
          fr: '« Laisse un mot » reste entre membres de la maisonnée. La boîte aux lettres reçoit les mots des proches de l’extérieur (voir [[card:share-access|Partager & inviter]]).',
          en: '“Leave a note” stays between household members. The mailbox receives notes from relatives outside (see [[card:share-access|Share & invite]]).',
        },
      },
      {
        label: { fr: 'Dessiner', en: 'Drawing' },
        detail: {
          fr: 'Le dessin a un vrai crayon, un pot de peinture, des collants, défaire/refaire, et des modèles à tracer (lettres, mots, pages à colorier). On peut même décalquer une photo.',
          en: 'Drawing has a real pen, a paint bucket, stickers, undo/redo, and templates to trace (letters, words, colour-in pages). You can even trace over a photo.',
        },
      },
      {
        label: { fr: 'La galerie « Mes dessins »', en: 'The “My drawings” gallery' },
        detail: {
          fr: 'Un dessin gardé va dans la galerie : rouvre-le pour continuer dessus (les enfants aussi), affiche-le au babillard ou en mode veille.',
          en: 'A kept drawing goes to the gallery: reopen it to keep drawing (kids too), show it on the board or the screensaver.',
        },
        route: '/drawings',
      },
    ],
  },
  {
    id: 'habits',
    icon: 'repeat-bold',
    group: 'concepts',
    route: '/board/habitudes',
    settings: '/settings?tab=settings&sub=ambient&focus=habits',
    title: { fr: 'Mes habitudes', en: 'My habits' },
    what: {
      fr: 'Les petits rythmes qu’on tient — marcher, boire de l’eau, deux sorties à vélo par semaine, fumer moins, éviter le chocolat. « Le point du jour » les rassemble en un écran, et un tap suffit.',
      en: 'The little rhythms you keep — walking, drinking water, two bike rides a week, smoking less, avoiding chocolate. “Today’s check-in” gathers them on one screen, and one tap is enough.',
    },
    points: [
      {
        label: { fr: 'Le défi du jour', en: 'Today’s challenge' },
        detail: {
          fr: 'Un petit défi qui dure toute la journée — « porte du jaune », « salue une nouvelle personne ». Le matin, on en pige un (jusqu’à trois fois : la troisième est la bonne) — ou on écrit (ou dicte) le sien —, puis chacun le coche quand il l’a tenu. Les visages qui l’ont relevé s’allument sur le babillard.',
          en: 'A little challenge that lasts all day — “wear something yellow”, “greet someone new”. In the morning you draw one (up to three times: the third is the keeper) — or write (or dictate) your own — then each person checks it off once they’ve done it. The faces who took it on light up on the board.',
        },
        why: {
          fr: 'Une invitation, jamais un devoir : rien n’est compté, rien n’est classé, et un jour sans défi reste un jour tout à fait normal.',
          en: 'An invitation, never a duty: nothing is counted, nothing is ranked, and a day with no challenge is a perfectly normal day.',
        },
      },
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
          fr: 'Chaque jour, certains jours de la semaine, un jour sur trois. Ou sans jour fixe : « 2 fois par semaine », et l’habitude attend que la semaine soit remplie. Ou à l’intérieur d’une journée : « 3 fois par jour », ou « aux 4 heures » entre 8 h et 20 h — les rappels suivent alors le rythme tout seuls.',
          en: 'Every day, certain weekdays, every third day. Or with no fixed day: “2 times a week”, and the habit waits until the week is filled. Or inside a single day: “3 times a day”, or “every 4 hours” between 8am and 8pm — the reminders then follow the rhythm on their own.',
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
          fr: 'Une habitude appartient à un visage ou à toute la maisonnée. Les tiennes ne s’affichent qu’une fois ton visage choisi — le babillard nomme alors ce qui te reste (« 0 sur 2 verres »), et jamais les habitudes de quelqu’un d’autre.',
          en: 'A habit belongs to one face or to the whole household. Yours only show once your face is picked — the board then names what’s left (“0 of 2 glasses”), and never anyone else’s habits.',
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
      fr: 'Sur le babillard, la carte « À faire » tient les p’tites tâches ponctuelles (souvent dictées — « appeler le dentiste ») et tes cochables du quotidien. Tes listes de départ réutilisables vivent à part, sur la carte « Avant de partir ». Coche quand c’est fait, puis « Effacer cochées » nettoie.',
      en: 'On the board, the “À faire” card holds small one-off tasks (often dictated — “call the dentist”) and your everyday check-offs. Your reusable leaving checklists live apart, on the “Before you go” card. Check things off when done, then “Clear checked” tidies up.',
    },
    points: [
      {
        label: { fr: '« À faire » ou une liste de départ ?', en: '“À faire” or a leaving checklist?' },
        detail: {
          fr: '« À faire » : une chose ponctuelle — tu la dictes ou la captures, tu coches, c’est fini. Une liste de départ (sac de piscine, avant de partir) : préparée une fois, réutilisable d’un tap — elle vit sur la carte « [[card:board|Avant de partir]] », un jour à la fois. En cas de doute, touche le « ? » du babillard puis le titre de la carte.',
          en: '“À faire”: a one-off thing — dictate or capture it, tick it, done. A leaving checklist (pool bag, before leaving): set up once, reusable in one tap — it lives on the “[[card:board|Before you go]]” card, one day at a time. If unsure, tap the board’s “?” then the card title.',
        },
        why: { fr: 'Une chose vite faite et une liste qu’on garde, ce n’est pas pareil — chacune a sa carte.', en: 'A quick one-off and a list you keep aren’t the same — each has its own card.' },
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
          fr: 'Prépare des modèles réutilisables dans Réglages ▸ À compléter (ex. « Avant de partir », « Chez grand-papa »). D’un geste, tout le modèle s’ajoute en cochables POUR LA JOURNÉE — un départ pressé devient moins stressant, et la liste s’efface d’elle-même le lendemain. Elles vivent sur leur propre carte « [[card:board|Avant de partir]] » du babillard (coche ici, c’est coché partout), à part des choses « À faire » de tous les jours.',
          en: 'Prep reusable templates in Settings ▸ To complete (e.g. “Before leaving”, “At grandpa’s”). One tap drops the whole list in as check-offs FOR THE DAY — a hectic departure gets less stressful, and the list clears itself the next day. They live on their own “[[card:board|Before you go]]” board card (tick it there, it’s ticked everywhere), apart from the everyday “To do” items.',
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
    // The card lives on the board; its "À compléter" templates are the Régler side.
    route: '/board',
    settings: '/settings?tab=routines&sub=todos',
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
        route: '/cercle?add=carnet',
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
    settings: '/settings?tab=settings&sub=ambient&focus=ambient',
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
      // Appended: « La photo du jour » (the retired 'apod' card — GUIDE_CARD_ALIAS base 5).
      {
        label: { fr: 'La photo du jour', en: 'The picture of the day' },
        detail: {
          fr: 'Derrière la météo, une belle photo change chaque jour (Bing, Wikipédia, la NASA). Le ⟳ en change; ça se cache dans Réglages ▸ Affichage.',
          en: 'Behind the weather, a beautiful photo changes every day (Bing, Wikipedia, NASA). The ⟳ swaps it; hide it in Settings ▸ Display.',
        },
      },
    ],
  },
  {
    id: 'share-access',
    icon: 'key-bold',
    group: 'concepts',
    settings: '/settings?tab=settings&sub=guest',
    title: { fr: 'Partager & inviter', en: 'Share & invite' },
    what: {
      fr: 'Donne un lien à un proche sans lui ouvrir toute la maison : tu choisis ce qu’il voit, et le lien s’éteint tout seul.',
      en: 'Give a relative a link without opening the whole house: you pick what they see, and the link expires on its own.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('share' → 6, 'share-target' → 8) — append only.
      {
        label: { fr: 'Six genres de liens', en: 'Six kinds of links' },
        detail: {
          fr: '« Démo » (tout le babillard), « Gardienne » (la journée + routines + urgences + wifi), « Accueil » (wifi + poubelles + règles), « Famille » (la fenêtre des grands-parents), « Fiche famille » et « Boîte aux lettres » (les deux qui écrivent). Un genre par besoin.',
          en: '“Demo” (the whole board), “Sitter” (the day + routines + emergencies + wifi), “Welcome” (wifi + bins + rules), “Family” (the grandparents’ window), “Family details” and “Postbox” (the two that write). One kind per need.',
        },
      },
      {
        label: { fr: '« Fiche famille »', en: '“Family details”' },
        detail: {
          fr: 'Un proche remplit lui-même ses coordonnées et te les renvoie. Rien n’entre tout de suite : tu révises, tu coches qui ajouter, et « Compléter les familles » déduit le reste.',
          en: 'A relative fills in their own info and sends it back. Nothing lands right away: you review, tick who to add, and “Complete the families” infers the rest.',
        },
      },
      {
        label: { fr: '« Boîte aux lettres »', en: '“Postbox”' },
        detail: {
          fr: 'Mamie laisse un mot, une voix, un dessin ou une photo — sans compte, depuis son téléphone. Tu acceptes, et il se pose sur le babillard comme une note de frigo, signé de son nom.',
          en: 'Grandma leaves a note, a voice message, a drawing or a photo — no account, from her phone. You accept it, and it lands on the board like a fridge note, signed with her name.',
        },
      },
      {
        label: { fr: 'Lecture seule et minuté', en: 'Read-only and time-boxed' },
        detail: {
          fr: 'Un lien ne peut rien modifier et expire de lui-même. Il ne voit que sa propre vue — jamais le reste de la maison, la barrière est côté serveur.',
          en: 'A link can change nothing and expires on its own. It only sees its own view — never the rest of the house; the boundary is on the server.',
        },
      },
      {
        label: { fr: 'Un lien durable et nommé', en: 'A durable, named link' },
        detail: {
          fr: '« Durable — jusqu’à révocation » : un accès qui ne s’éteint pas tout seul, pour Mamie ou la gardienne régulière. Nomme-le; « Révoquer » est la seule façon de le fermer.',
          en: '“Durable — until revoked”: access that never turns itself off, for Grandma or the regular sitter. Name it; “Revoke” is the only way to close it.',
        },
      },
      {
        label: { fr: 'La carte gardienne montre ses trous', en: 'The sitter card shows its gaps' },
        detail: {
          fr: 'En choisissant « Gardienne », un petit avis liste ce qui manque (urgences, routines, wifi) — touche un élément pour aller le compléter avant d’envoyer.',
          en: 'When you pick “Sitter”, a small notice lists what’s missing (emergencies, routines, wifi) — tap an item to go complete it before sending.',
        },
      },
      // Appended: the retired 'share' card (outbound share links — alias base 6).
      {
        label: { fr: 'Partager une recette ou une famille', en: 'Share a recipe or a family' },
        detail: {
          fr: '« Partager » crée un vrai lien — une belle page que n’importe qui ouvre, même sans Babillard. Un ami qui a Babillard l’ajoute à son compte d’un bouton.',
          en: '“Share” creates a real link — a proper page anyone opens, even without Babillard. A friend with Babillard adds it to their account with one button.',
        },
      },
      {
        label: { fr: 'Une copie, pas un direct', en: 'A copy, not a live feed' },
        detail: {
          fr: 'Un lien est une copie qui expire de lui-même; retire-le quand tu veux dans Réglages ▸ Partage.',
          en: 'A link is a copy that expires on its own; remove it anytime in Settings ▸ Sharing.',
        },
      },
      // Appended: the retired 'share-target' card (sharing INTO Babillard — alias base 8).
      {
        label: { fr: 'Recevoir dans Babillard', en: 'Receive into Babillard' },
        detail: {
          fr: 'Depuis une autre app, « Partager » → Babillard : un texte se classe tout seul, une photo s’épingle au babillard. Il faut d’abord installer l’app sur l’écran d’accueil.',
          en: 'From another app, “Share” → Babillard: text files itself, a photo pins to the board. Install the app to the home screen first.',
        },
      },
    ],
  },
  {
    id: 'audience',
    icon: 'smiley-bold',
    group: 'concepts',
    settings: '/settings?tab=settings&sub=display',
    title: { fr: 'Tablette, téléphone & vue enfant', en: 'Tablet, phone & kid view' },
    what: {
      fr: 'La même information, montrée pour un parent, pour un tout-petit, ou en version « Simple » (gros boutons, gros texte).',
      en: 'The same information, shown for a parent, for a toddler, or as a “Simple” view (big buttons, large text).',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('surface' → base 4) — append only.
      {
        label: { fr: 'La vue « Simple »', en: 'The “Simple” view' },
        detail: {
          fr: 'Tout devient plus gros et le babillard se résume à quatre grandes zones — parfait pour un grand-parent ou une visite. Se choisit dans Réglages ▸ Système ▸ Affichage.',
          en: 'Everything gets bigger and the board becomes four large zones — perfect for a grandparent or a visitor. Pick it in Settings ▸ System ▸ Display.',
        },
      },
      {
        label: { fr: 'Toucher pour entendre', en: 'Touch to hear' },
        detail: {
          fr: 'En vue Enfant ou Simple, garde le doigt une demi-seconde sur une ligne pour l’entendre à voix haute — sans rien déclencher.',
          en: 'In the Kid or Simple view, hold a finger half a second on a line to hear it read aloud — without triggering anything.',
        },
      },
      {
        label: { fr: 'Passer en vue enfant', en: 'Switch to kid view' },
        detail: {
          fr: 'Touche [[icon:baby-bold]] dans la barre, ou démarre la tablette « verrouillée enfant » (?kid=1 dans l’adresse) pour qu’elle y reste.',
          en: 'Tap [[icon:baby-bold]] in the bar, or boot the tablet “kid-locked” (?kid=1 in the address) so it stays there.',
        },
      },
      {
        label: { fr: 'Une porte à sens unique', en: 'A one-way door' },
        detail: {
          fr: 'En vue enfant, aucun bouton pour revenir — exprès. Pour ressortir : garde le doigt ~3 s dans le coin haut-gauche, puis réponds à la petite addition.',
          en: 'In kid view there’s no button back — on purpose. To get out: hold ~3 s in the top-left corner, then answer the little sum.',
        },
      },
      // Appended: the retired 'surface' card (device role — alias base 4).
      {
        label: { fr: 'Tablette ou téléphone (la « surface »)', en: 'Tablet or phone (the “surface”)' },
        detail: {
          fr: 'Chaque appareil a un rôle, choisi une fois : la tablette au mur montre le grand babillard, le téléphone une barre d’onglets sous le pouce. C’est de la présentation — la sécurité, c’est la connexion et le jumelage.',
          en: 'Each device has a role, chosen once: the wall tablet shows the big board, the phone a thumb-reach tab bar. It’s presentation — security is the login and the pairing.',
        },
      },
    ],
  },
  {
    id: 'calm',
    icon: 'tree-bold',
    group: 'concepts',
    settings: '/settings?tab=settings&sub=calm',
    title: { fr: 'Le calme (par choix)', en: 'Calm (by design)' },
    what: {
      fr: 'L’app refuse volontairement ce qui rend accro : pas de points, pas de pastilles rouges, pas de notifications, pas de fil sans fin.',
      en: 'The app deliberately refuses the addictive stuff: no points, no red badges, no notifications, no endless feed.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('undo' → base 4) — append only.
      {
        label: { fr: 'Les listes se vident', en: 'Lists empty out' },
        detail: {
          fr: 'La liste du jour se termine et reste vide — rien à entretenir pour le plaisir d’entretenir.',
          en: 'The day’s list finishes and stays empty — nothing to maintain for the sake of maintaining.',
        },
      },
      {
        label: { fr: 'Mode calme (option)', en: 'Calm mode (toggle)' },
        detail: {
          fr: 'Le seul réglage, et il décide une seule chose : l’autocollant à la fin d’une routine d’enfant. Activé (par défaut), la routine se termine sans récompense; désactivé, l’enfant colle un autocollant sur son mur. Le reste du calme ne se touche pas.',
          en: 'The one toggle, and it decides one thing: the sticker at the end of a kid routine. On (the default), the routine ends reward-free; off, the child places a sticker on their wall. The rest of the calm can’t be touched.',
        },
      },
      {
        label: { fr: 'Garanti, pas négociable', en: 'Guaranteed, not negotiable' },
        detail: {
          fr: 'L’absence de points, de notifications et d’inventaire est verrouillée dans le code — impossible à réactiver par accident.',
          en: 'The absence of points, notifications and inventory is locked in code — impossible to switch back on by accident.',
        },
      },
      {
        label: { fr: 'Tes données t’appartiennent', en: 'Your data is yours' },
        detail: {
          fr: '« Emporter mes données » (Réglages ▸ Système) télécharge tout en un fichier. Une copie de secours se fait chaque nuit, toute seule.',
          en: '“Take my data” (Settings ▸ System) downloads everything as one file. A backup copy is made every night, on its own.',
        },
      },
      // Appended: the retired 'undo' card (alias base 4).
      {
        label: { fr: 'Annuler, partout', en: 'Undo, everywhere' },
        detail: {
          fr: 'Un geste destructeur attend quelques secondes derrière un bandeau « Annuler », et « Récents » garde les derniers gestes à portée. Une erreur se rattrape toujours.',
          en: 'A destructive action waits a few seconds behind an “Undo” toast, and “Recents” keeps the latest actions within reach. A mistake is always recoverable.',
        },
      },
    ],
  },
  {
    id: 'deals',
    icon: 'tag-bold',
    group: 'concepts',
    route: '/liste/circulaires',
    settings: '/settings?tab=liste&sub=shop',
    title: { fr: 'Rabais, circulaires & caissier', en: 'Deals, flyers & cashier' },
    what: {
      fr: 'Trouve les rabais d’épicerie près de chez toi, accroche-les à ta liste, et présente-les à la caisse.',
      en: 'Find grocery deals near you, attach them to your list, and show them at the till.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('flyers' → 3, 'cashier' → 5) — append only.
      {
        label: { fr: 'Attaché à un article', en: 'Attached to an item' },
        detail: {
          fr: 'Le rabais voyage avec l’article de liste et s’affiche sur tous tes appareils — le même « fromage » porte un rabais différent d’une semaine à l’autre.',
          en: 'The deal rides on the list item and shows on all your devices — the same “cheese” carries a different deal week to week.',
        },
      },
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets ton code postal une fois dans Réglages ▸ Magasinage : les rabais viennent des magasins proches de chez toi.',
          en: 'Set your postal code once in Settings ▸ Shopping: deals come from the stores near you.',
        },
        route: '/settings?tab=liste&sub=shop',
      },
      {
        label: { fr: 'La vraie circulaire', en: 'The real flyer' },
        detail: {
          fr: 'L’app reconstruit les rabais; pour la page officielle complète, elle te renvoie vers le site du marchand.',
          en: 'The app reconstructs the deals; for the full official page it links you out to the merchant’s site.',
        },
      },
      // Appended: the retired 'flyers' card (alias base 3).
      {
        label: { fr: 'Feuilleter les circulaires', en: 'Browse the flyers' },
        detail: {
          fr: 'Cherche un aliment ou parcours les magasins, cette semaine et la prochaine. Un ✓ marque une vraie image de circulaire, un ≈ une reconstruction.',
          en: 'Search a food or browse the stores, this week and next. A ✓ marks a real flyer image, a ≈ a reconstruction.',
        },
        route: '/liste/circulaires',
      },
      {
        label: { fr: 'Trouver l’article sur la page', en: 'Find the item on the page' },
        detail: {
          fr: 'Le rabais indique sa page et sa position (haut/bas, gauche/droite) — vite retrouvé dans la circulaire papier.',
          en: 'A deal shows its page and position (top/bottom, left/right) — quickly found in the paper flyer.',
        },
      },
      // Appended: the retired 'cashier' card (alias base 5).
      {
        label: { fr: 'Le mode caissier', en: 'Cashier mode' },
        detail: {
          fr: 'À la caisse, tes rabais en grille : touche celui que la caissière scanne — dans n’importe quel ordre. Un article montré se grise avec un ✓.',
          en: 'At the till, your deals in a grid: tap the one being scanned — in any order. A shown item dims with a ✓.',
        },
        route: '/liste/cashier',
      },
      {
        label: { fr: 'Preuve de prix', en: 'Price proof' },
        detail: {
          fr: 'La fiche montre l’image de circulaire, le magasin, le prix et les dates — de quoi réclamer l’ajustement, preuve à l’appui.',
          en: 'The card shows the flyer image, the store, the price and the dates — enough to claim the price-match, proof in hand.',
        },
      },
    ],
  },
  {
    id: 'recipes',
    icon: 'book-open-bold',
    group: 'concepts',
    route: '/kitchen',
    settings: '/settings?tab=kitchen&sub=apparence',
    title: { fr: 'Recettes & mode cuisson', en: 'Recipes & cook mode' },
    what: {
      fr: 'Garde tes recettes et cuisine-les en plein écran, les mains à la pâte, sans rien toucher de fin.',
      en: 'Keep your recipes and cook them full-screen, hands in the dough, without any fiddly tapping.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('cookmode' → 7, 'favorites' → 9) — append only.
      {
        label: { fr: 'Importer facilement', en: 'Easy import' },
        detail: {
          fr: 'D’une photo (l’appareil lit le texte lui-même), d’un lien collé, ou à la main — sans tout retaper.',
          en: 'From a photo (the device reads the text itself), a pasted link, or by hand — without retyping it all.',
        },
        route: '/kitchen/recipe/new',
      },
      {
        label: { fr: 'Mode cuisson', en: 'Cook mode' },
        detail: {
          fr: 'Plein écran, gros texte, l’écran reste allumé. Tu peux aussi en faire une [[card:routines|routine pour enfant]].',
          en: 'Full screen, big text, the screen stays awake. You can also turn it into a [[card:routines|kid routine]].',
        },
      },
      {
        label: { fr: 'Envoyer les ingrédients à La liste', en: 'Send ingredients to the list' },
        detail: {
          fr: '« Ajouter les ingrédients » verse la recette sur [[card:liste|la liste]] d’un coup : « 15 ml de beurre » devient « Beurre », et les doublons fusionnent.',
          en: '“Add ingredients” pours the recipe onto [[card:liste|the list]] at once: “15 ml butter” becomes “Butter”, and duplicates merge.',
        },
      },
      {
        label: { fr: 'Mesures en couleurs', en: 'Colour-coded measures' },
        detail: {
          fr: 'Les quantités sont des pastilles colorées; touche-les pour les entendre. « 2 c. à soupe » se dessine en 2 ronds — un enfant compte les ronds et attrape la bonne cuillère.',
          en: 'Amounts are colour-coded pills; tap to hear them. “2 tbsp” draws as 2 circles — a child counts the circles and grabs the right spoon.',
        },
      },
      {
        label: { fr: 'Couleurs de tes ustensiles', en: 'Your own tool colours' },
        detail: {
          fr: 'Donne à chaque cuillère et tasse la couleur de tes vrais ustensiles — l’écran montre exactement la cuillère que tu attrapes.',
          en: 'Give each spoon and cup the colour of your real tools — the screen shows exactly the spoon you reach for.',
        },
        route: '/settings?tab=kitchen&sub=apparence&focus=measureColors',
      },
      {
        label: { fr: 'Doubler ou couper', en: 'Scale up or down' },
        detail: {
          fr: '×½ / ×1 / ×2 / ×3 ajustent les quantités partout — pour 2 ou pour 12, sans calcul mental.',
          en: '×½ / ×1 / ×2 / ×3 adjust the amounts everywhere — for 2 or for 12, no mental math.',
        },
      },
      {
        label: { fr: 'Trouver une recette', en: 'Find a recipe' },
        detail: {
          fr: 'Une recherche, des pastilles de filtre (Quoi cuisiner ?, Favoris…) et « Aa / Collections ». Touche une recette pour l’ouvrir ou la planifier comme repas.',
          en: 'A search box, filter pills (What can I cook?, Favorites…) and “Aa / Collections”. Tap a recipe to open it or plan it as a meal.',
        },
        route: '/kitchen',
      },
      // Appended: the retired 'cookmode' card (alias base 7).
      {
        label: { fr: 'Cuisiner mains libres', en: 'Cook hands-free' },
        detail: {
          fr: 'Une étape à la fois, lue à voix haute; « cuire 25 min » fait apparaître une minuterie, et l’appareil vibre à la fin. Chaque étape montre ses ingrédients.',
          en: 'One step at a time, read aloud; “bake 25 min” shows a timer, and the device buzzes at the end. Each step shows its ingredients.',
        },
      },
      {
        label: { fr: 'Une photo par étape', en: 'A photo per step' },
        detail: {
          fr: 'Touche 📷 sous une étape pour y joindre une photo (la pâte au bon stade). Elle s’affiche en grand en mode cuisson.',
          en: 'Tap 📷 under a step to attach a photo (the dough at the right stage). It shows large in cook mode.',
        },
      },
      // Appended: the retired 'favorites' card (alias base 9).
      {
        label: { fr: 'Les coups de cœur ❤', en: 'Favorites ❤' },
        detail: {
          fr: 'Mets un ❤ sur les recettes que tu aimes : on voit QUI aime un plat (les frimousses), jamais un nombre. Les suggestions penchent vers les plats aimés.',
          en: 'Put a ❤ on recipes you love: you see WHO loves a dish (the little faces), never a number. Suggestions lean toward the loved dishes.',
        },
      },
    ],
  },
  {
    id: 'ghost',
    icon: 'ghost-bold',
    group: 'concepts',
    route: '/liste',
    settings: '/settings?tab=liste&sub=ghost',
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
    id: 'reserve',
    icon: 'cloud-snow-bold',
    group: 'concepts',
    route: '/kitchen?plus=reserve',
    settings: '/settings?tab=kitchen&sub=reserve',
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
    id: 'board-widgets',
    icon: 'stack-bold',
    group: 'concepts',
    route: '/board?edit=1',
    settings: '/settings?tab=board&sub=layout',
    title: { fr: 'Ton babillard, tes cartes', en: 'Your board, your cards' },
    what: {
      fr: 'Le babillard est un espace de cartes, comme l’écran d’accueil d’un téléphone : chaque carte se déplace, se redimensionne ou se retire — et chaque écran garde SA disposition (le frigo n’affiche pas la même chose que ton téléphone).',
      en: 'The board is a card space, like a phone’s home screen: every card can be moved, resized or removed — and each screen keeps ITS layout (the fridge doesn’t show the same thing as your phone).',
    },
    points: [
      {
        label: { fr: 'Tiens une carte pour réorganiser', en: 'Hold a card to rearrange' },
        detail: {
          fr: 'Un appui long ouvre le mode édition : glisse une carte (même entre le bandeau du haut et la grille), ✕ pour la retirer de cet écran, le chiffre pour changer sa largeur. « Terminé » garde tout ; « Annuler les changements » remet la disposition comme avant. Réglages ▸ Babillard ▸ Disposition fait la même chose, en version boutons.',
          en: 'A long press opens edit mode: drag a card (even between the top band and the grid), ✕ removes it from this screen, the number changes its width. “Done” keeps everything; “Undo the changes” puts the layout back the way it was. Settings ▸ Board ▸ Layout does the same with buttons.',
        },
        why: {
          fr: 'Chaque foyer regarde son babillard autrement — la disposition appartient à l’écran, pas au compte.',
          en: 'Every household reads its board differently — the layout belongs to the screen, not the account.',
        },
      },
      {
        label: { fr: 'Les petites cartes qui grandissent', en: 'Small cards that grow' },
        detail: {
          fr: 'Une demi-carte devient une vraie petite tuile — icône, titre, un indice discret. Touche-la : elle grandit sur place, puis se replie par son en-tête.',
          en: 'A half card becomes a genuine small tile — icon, title, one quiet hint. Tap it: it grows in place, then folds back from its header.',
        },
      },
      // Appended: the empty-card tri-state (condensed from the old board card).
      {
        label: { fr: 'Une carte vide : la garder ou non', en: 'An empty card: keep it or not' },
        detail: {
          fr: 'Chaque carte choisit quoi faire quand elle n’a rien à dire : « Si non vide » s’efface d’elle-même, « Toujours » garde sa place avec une ligne tranquille, « Jamais » ne vient pas du tout.',
          en: 'Each card decides what to do when it has nothing to say: “If not empty” steps aside, “Always” holds its place with a calm line, “Never” doesn’t come at all.',
        },
      },
      {
        label: { fr: 'Chaque écran, sa disposition', en: 'Each screen, its layout' },
        detail: {
          fr: 'La disposition appartient à l’écran, pas au compte : la tablette murale reste « coup d’œil », ton téléphone plus court.',
          en: 'The layout belongs to the screen, not the account: the wall tablet stays glanceable, your phone shorter.',
        },
      },
    ],
  },

  // ── Settings, tab by tab (the Réglages reference) ─────────────────────────
  {
    id: 'set-household',
    icon: 'users-three-bold',
    group: 'settings',
    settings: '/settings?tab=cercle&sub=members',
    title: { fr: 'La maisonnée', en: 'The household' },
    what: {
      fr: 'Qui fait partie de la famille, et le cercle autour d’elle. C’est ce qui peuple les visages, les couleurs et les agendas partout dans l’app.',
      en: 'Who’s in the family, and the circle around it. This populates the faces, colours and agendas everywhere in the app.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('account' → base 5) — append only.
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
      // Appended: the retired 'account' card (alias base 5).
      {
        label: { fr: 'Compte & connexion', en: 'Account & sign-in' },
        detail: {
          fr: 'L’opérateur (le parent) crée la maisonnée et s’y connecte — une maisonnée par courriel. La tablette, elle, n’a pas de compte : elle se jumelle.',
          en: 'The operator (the parent) creates the household and signs in — one household per email. The tablet has no account: it pairs instead.',
        },
      },
      {
        label: { fr: 'Mot de passe & code', en: 'Password & code' },
        detail: {
          fr: 'Au moins 8 caractères — c’est tout ce qui sépare tes données du web. Un déploiement protégé demande aussi un code d’invitation.',
          en: 'At least 8 characters — it’s all that stands between your data and the web. A gated deployment also asks for an invite code.',
        },
      },
    ],
  },
  {
    id: 'set-agenda',
    icon: 'calendar-dots-bold',
    group: 'settings',
    settings: '/settings?tab=board&sub=events',
    title: { fr: 'Agenda & auto', en: 'Agenda & car' },
    what: {
      fr: 'Les rendez-vous et événements de la famille, plus l’auto partagée et les horaires de travail. Ce qui s’affiche dans « Aujourd’hui / À venir » sur le babillard.',
      en: 'The family’s appointments and events, plus the shared car and work schedules. What shows under “Today / Upcoming” on the board.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('activities' → base 5) — append only.
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
        route: '/event/new',
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
        route: '/settings?tab=cercle&sub=schedule',
      },
      // Appended: the retired 'activities' card (alias base 5).
      {
        label: { fr: 'Les activités qui reviennent', en: 'Recurring activities' },
        detail: {
          fr: 'Le soccer du mardi, le piano du jeudi : crée « Activité » une fois — l’enfant, la récurrence, qui conduit, quoi apporter — et elle revient toute seule sur le babillard.',
          en: 'Tuesday soccer, Thursday piano: create an “Activity” once — the child, the recurrence, who drives, what to bring — and it comes back on its own on the board.',
        },
        route: '/event/new?activity=1',
      },
    ],
  },
  {
    id: 'set-chores',
    icon: 'broom-bold',
    group: 'settings',
    settings: '/settings?tab=routines&sub=chores',
    title: { fr: 'Corvées & routines', en: 'Chores & routines' },
    what: {
      fr: 'Les tâches de la maison et leur horaire, les routines en images des enfants, et les listes « À compléter ». Les corvées tournent et s’affichent sur le babillard avec « c’est le tour de… ».',
      en: 'The house tasks and their schedule, the kids’ picture routines, and the “To complete” lists. Chores rotate and show on the board with “whose turn it is…”.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('home-projects' → base 8, 'set-routines' → base 4) — append only.
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
        route: '/chore/new',
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
        route: '/routine/new',
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
          fr: 'Prépare ici tes listes à cocher réutilisables (sac de piscine, « Avant de partir »). Préparées une fois, elles s’ajoutent d’un seul geste sur la carte « [[card:board|Avant de partir]] » du babillard, pour la journée.',
          en: 'Build your reusable check-off lists here (pool bag, “Before leaving”). Set up once, they drop onto the board’s “[[card:board|Before you go]]” card in one tap, for the day.',
        },
      },
      {
        label: { fr: 'Projets & entretien', en: 'Plans & maintenance' },
        detail: {
          fr: 'Sous les corvées, deux listes pour les plus gros sujets : les Projets (un jour, sans date, avec un budget-cible optionnel) et l’Entretien qui revient tout seul (« tous les 3 mois ») et s’affiche au babillard quand il a une date.',
          en: 'Under chores, two lists for the bigger topics: Plans (someday, no date, with an optional target budget) and Maintenance that comes back on its own (“every 3 months”) and shows on the board when dated.',
        },
        route: '/home-project/new',
      },
    ],
  },
  {
    id: 'set-shopping',
    icon: 'shopping-bag-bold',
    group: 'settings',
    settings: '/settings?tab=liste&sub=shop',
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
    settings: '/settings?tab=kitchen&sub=apparence',
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
        label: { fr: 'Renommer ou supprimer partout', en: 'Rename or remove everywhere' },
        detail: {
          fr: 'Renomme une étiquette une fois et toutes les recettes suivent; la supprimer l’enlève partout d’un coup (avec confirmation).',
          en: 'Rename a tag once and every recipe follows; removing it takes it off everywhere at once (with confirmation).',
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
        route: '/settings?tab=kitchen&sub=apparence&focus=measureColors',
      },
      {
        label: { fr: 'La réserve', en: 'The reserve' },
        detail: {
          fr: 'Nomme et colore les endroits de ta réserve (congélateur, garde-manger…) où les articles sont regroupés. Voir [[card:reserve|La réserve]].',
          en: 'Name and colour your reserve spots (freezer, pantry…) where items are grouped. See [[card:reserve|The reserve]].',
        },
        route: '/settings?tab=kitchen&sub=reserve',
      },
    ],
  },
  {
    id: 'set-devices',
    icon: 'device-tablet-bold',
    group: 'settings',
    settings: '/settings?tab=settings&sub=tablets',
    title: { fr: 'Accès & appareils', en: 'Access & devices' },
    what: {
      fr: 'Les tablettes jumelées et les liens de partage temporaires (gardienne, accueil, famille). C’est ici que tu donnes — ou reprends — l’accès au babillard.',
      en: 'The paired tablets and the temporary share links (sitter, welcome, family). This is where you grant — or revoke — board access.',
    },
    points: [
      // ⚠ GUIDE_CARD_ALIAS ('pairing' → 0, 'set-guest' → 2, 'cast-tv' → 7) — append only.
      {
        label: { fr: 'Approuver un code', en: 'Approve a code' },
        detail: {
          fr: 'La tablette affiche un code à 6 chiffres; entre-le ici, nomme-la, et touche Jumeler. Elle garde un jeton révocable — jamais ton mot de passe.',
          en: 'The tablet shows a 6-digit code; enter it here, name it, and tap Pair. It keeps a revocable token — never your password.',
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
      // Appended: the retired 'cast-tv' card (alias base 7).
      {
        label: { fr: 'Le babillard au salon (télé)', en: 'The board on the TV' },
        detail: {
          fr: 'Génère un lien court (babillard…/tv/k7m2) et tape-le une fois dans le navigateur de la télé : le babillard s’affiche en lecture seule, en continu. Choisis « Le babillard » ou « Ambiance » (l’horloge/cadre-photo).',
          en: 'Generate a short link (babillard…/tv/k7m2) and type it once in the TV’s browser: the board shows read-only, continuously. Pick “The board” or “Ambience” (the clock/photo frame).',
        },
        route: '/cast',
      },
      {
        label: { fr: 'La télé se révoque comme une tablette', en: 'The TV revokes like a tablet' },
        detail: {
          fr: 'La télé apparaît dans Réglages ▸ Tablettes : un bouton la révoque, et son lien court cesse aussitôt de fonctionner.',
          en: 'The TV appears in Settings ▸ Tablets: one button revokes it, and its short link stops working at once.',
        },
      },
    ],
  },
  {
    id: 'set-ai',
    icon: 'sparkle-bold',
    group: 'settings',
    settings: '/settings?tab=settings&sub=ai',
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
    settings: '/settings?tab=settings&sub=display',
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
          fr: 'Choisis quelles cartes du babillard afficher (Aujourd’hui, L’auto, À faire, À venir, Dessins…) et glisse-les dans l’ordre voulu. Propre à CET appareil — la tablette murale et ton téléphone gardent chacun leur disposition.',
          en: 'Choose which board cards show (Today, The car, To do, Coming up, Drawings…) and drag them into the order you want. Specific to THIS device — the wall tablet and your phone keep their own layout.',
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
          fr: 'Téléverse une ou plusieurs photos d’un coup (un compteur « 2/5 » suit le lot); elles dérivent doucement sur le babillard et en mode veille. Une photo jointe à une note ou à un mot peut aussi atterrir ici : touche « Garder dans les photos » sous la photo, au moment de l’écrire ([[card:capture|le trombone 📎]]).',
          en: 'Upload one or many photos at once (a “2/5” counter tracks the batch); they gently drift across the board and during idle mode. A photo clipped to a note or a mot can land here too: tap “Keep in the photos” under the picture as you write it (the [[card:capture|📎 clip]]).',
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
          fr: 'Une seule chose (activé par défaut) : l’autocollant à la fin d’une routine d’enfant. Activé, la routine se termine sans récompense — le récap en images, le temps, et « Recommencer » si l’enfant veut. Désactivé, l’enfant colle un autocollant sur son mur.',
          en: 'One thing (on by default): the sticker at the end of a kid routine. On, the routine ends reward-free — the picture recap, the time it took, and “Start over” if they want. Off, the child places a sticker on their wall.',
        },
        why: {
          fr: 'Pour finir sur du calme, sans transformer le dodo en collection à entretenir.',
          en: 'To end on calm, without turning bedtime into a collection to keep up.',
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
    settings: '/settings?tab=cercle&sub=cars',
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
        route: '/settings?tab=cercle&sub=schedule',
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
