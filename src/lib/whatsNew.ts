// « Quoi de neuf » (bmad/08 B-14) — the gentle, hand-maintained changelog.
// Découvrir shows the NEWEST entry a device hasn't dismissed yet, as ONE quiet
// line. No feed, no badge, no unread count: one line, dismiss is forever
// (per device), the next entry only shows once this one is dismissed.
//
// DISCIPLINE (see COMPONENTS.md): a PR that ships a user-visible feature adds
// ONE entry at the TOP of this list — three words of copy, newest first. That's
// the whole system; there is no server, no dates, no automation to maintain.
// Keep entries that have a Guide card pointing at it (`card`) so « En savoir
// plus » lands on the real explanation.
import type { Bi } from './guideContent'

export type WhatsNewEntry = {
  // Stable id — it's what a dismissal records; never reuse one.
  id: string
  text: Bi
  // Optional GUIDE card id → the line offers "En savoir plus" into the manual.
  card?: string
}

// Newest FIRST.
export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: 'carte-gardienne',
    text: {
      fr: 'Nouveau : le lien « Gardienne » te montre maintenant ce qui manque encore avant de l’envoyer, et une case « Joindre un parent » optionnelle.',
      en: 'New: the “Sitter” link now shows you what’s still missing before you send it, plus an optional “Reach a parent” checkbox.',
    },
    card: 'share-access',
  },
  {
    id: 'ask',
    text: {
      fr: 'Nouveau : touche le micro à côté de la loupe pour « Demander à la maison » — une question à voix haute sur tes soupers, rendez-vous, anniversaires, le cercle ou l’entretien.',
      en: 'New: tap the mic beside the magnifier for “Ask the household” — a spoken question about your suppers, appointments, birthdays, circle or upkeep.',
    },
    card: 'capture',
  },
  {
    id: 'sortir-le-bac',
    text: {
      fr: 'Nouveau : coche « Annoncer la veille au soir » dans une corvée récurrente — le babillard le rappelle « Ce soir », le soir d’avant.',
      en: 'New: check “Announce the evening before” on a recurring chore — the board reminds you “Tonight”, the evening before.',
    },
    card: 'board',
  },
  {
    id: 'ideas-drawer',
    text: {
      fr: 'Nouveau : un seul tiroir « Idées » — favoris, à écouler, IA, proposé par un enfant — à ouvrir depuis la grille ou le ＋.',
      en: 'New: one “Idées” drawer — favorites, use-it-up, AI, suggested by a child — open it from the grid or the ＋.',
    },
    card: 'kitchen',
  },
  {
    id: 'le-pont',
    text: {
      fr: 'Nouveau : un lien « Durable — jusqu’à révocation » pour un proche régulier (Mamie, une gardienne) — nommé, ne s’éteint jamais tout seul, et la « Boîte aux lettres » lui montre un reçu ✓ à son prochain passage.',
      en: 'New: a “Durable — until revoked” link for a regular relative (Grandma, a sitter) — named, never expires on its own, and “Postbox” shows them a received ✓ next time they visit.',
    },
    card: 'share-access',
  },
  {
    id: 'rentree',
    text: {
      fr: 'Nouveau : « La rentrée » — donne une fois la rentrée, le dernier jour et les relâches dans Réglages ▸ Le babillard, et « Demain » sait dire école ou congé.',
      en: 'New: “Back to school” — give the first day, last day and breaks once in Settings ▸ The board, and “Tomorrow” can say school or day off.',
    },
    card: 'board',
  },
  {
    id: 'since-morning',
    text: {
      fr: 'Nouveau : touche la salutation du babillard pour voir « Depuis ce matin » — ce que la maisonnée a ajouté aujourd’hui, par visage.',
      en: 'New: tap the board greeting to see “Since this morning” — what the household added today, by face.',
    },
    card: 'board',
  },
  {
    id: 'capture-offline-queue',
    text: {
      fr: 'Nouveau : la capture (le ＋) tient parole hors ligne — ta note se garde et se classe toute seule à la reconnexion.',
      en: 'New: capture (the ＋) keeps its word offline — your note is kept and files itself once you’re back online.',
    },
    card: 'capture',
  },
  {
    id: 'kid-demain-fix',
    text: {
      fr: 'Corrigé : « Demain » sur l’écran des enfants suit maintenant les mêmes règles de repas que le babillard parent — plus de repas caché qui s’affiche, ni de souper compté deux fois.',
      en: 'Fixed: “Tomorrow” on the kids’ screen now follows the same meal rules as the parent board — no more hidden meal leaking through, no more supper counted twice.',
    },
    card: 'board',
  },
  {
    id: 'kitchen-apparence',
    text: {
      fr: 'Réglages ▸ La cuisine : les étiquettes, pastilles et couleurs de mesure se retrouvent dans une seule section « Apparence ».',
      en: 'Settings ▸ Kitchen: tags, pills and measure colours now live under one “Appearance” section.',
    },
    card: 'set-recipes',
  },
  {
    id: 'joindre-rail',
    text: {
      fr: 'Nouveau : « Joindre » — sur mobile, une rangée en haut du cercle pour appeler ou écrire d’un doigt, les plus utiles en premier.',
      en: 'New: “Reach out” — on mobile, a row at the top of the circle to call or email in one tap, the most useful ones first.',
    },
    card: 'cercle',
  },
  {
    id: 'stale-stamp',
    text: {
      fr: 'Nouveau : si le wifi ment (borne captive, panne du serveur) et que rien ne se rafraîchit, une petite ligne « Données de … » l’indique — même « en ligne ».',
      en: 'New: if the wifi lies (captive portal, server outage) and nothing refreshes, a small “Data from …” line says so — even while “online”.',
    },
    card: 'settings',
  },
  {
    id: 'a-regler-kiosk',
    text: {
      fr: 'Nouveau : « À régler » apparaît maintenant aussi sur la tablette murale, pas seulement sur ton téléphone.',
      en: 'New: “To sort” now shows on the wall tablet too, not just your phone.',
    },
    card: 'capture',
  },
  {
    id: 'annee-view',
    text: {
      fr: 'Nouveau : « L’année » — une troisième vue du babillard : douze petits mois avec les repères de l’année (fêtes, anniversaires, voyages, entretien).',
      en: 'New: “The year” — a third board view: twelve small months with the year’s fixed points (holidays, birthdays, trips, upkeep).',
    },
    card: 'board',
  },
  {
    id: 'trip-album',
    text: {
      fr: 'Nouveau : un voyage terminé se rouvre en album — photos, jour par jour, notes gardées. « Modifier » ramène l’éditeur.',
      en: 'New: a finished trip reopens as an album — photos, day by day, kept notes. “Edit” brings the editor back.',
    },
    card: 'voyage',
  },
  {
    id: 'house-diary',
    text: {
      fr: 'Nouveau : « La maison cette année » — le journal calme de l’année (soins, corvées, voyages, dessins), dans Réglages ▸ Le cercle.',
      en: 'New: “The home this year” — the year’s calm journal (care, chores, trips, drawings), in Settings ▸ The circle.',
    },
    card: 'cercle',
  },
  {
    id: 'countdown',
    text: {
      fr: 'Nouveau : « Le décompte » — le babillard propose de compter les dodos jusqu’à la prochaine fête ou le prochain anniversaire.',
      en: 'New: “The countdown” — the board offers to count the sleeps until the next holiday or birthday.',
    },
    card: 'board',
  },
  {
    id: 'fetes',
    text: {
      fr: 'Nouveau : les fêtes du Québec et du Canada s’annoncent d’elles-mêmes sur le babillard — rien à créer.',
      en: 'New: Québec and Canada holidays announce themselves on the board — nothing to create.',
    },
    card: 'board',
  },
  {
    id: 'takeout',
    text: {
      fr: 'Nouveau : « Emporter mes données » — tout ce que garde Babillard, en un fichier, dans Réglages ▸ Système. Et une copie de secours se fait chaque nuit.',
      en: 'New: “Take my data” — everything Babillard keeps, in one file, in Settings ▸ System. And a backup copy is made every night.',
    },
    card: 'calm',
  },
  {
    id: 'hourly-breath',
    text: {
      fr: 'Nouveau : le souffle de l’heure — au sommet de l’heure, l’horloge de veille respire une fois. Sans son, sans pastille.',
      en: 'New: the hourly breath — at the top of the hour, the idle clock breathes once. No sound, no badge.',
    },
    card: 'screensaver',
  },
  {
    id: 'simple-lens',
    text: {
      fr: 'Nouveau : la vue « Simple » — grands boutons, gros texte, et garde le doigt sur une ligne pour l’entendre. Parfait pour une visite ou un grand-parent.',
      en: 'New: the “Simple” view — big buttons, large text, and hold a finger on a line to hear it. Perfect for a visitor or a grandparent.',
    },
    card: 'audience',
  },
  {
    id: 'search-partout',
    text: {
      fr: 'Nouveau : la loupe en haut de chaque section cherche partout — même dans le guide.',
      en: 'New: the magnifier atop every section searches everywhere — even the guide.',
    },
    card: 'board',
  },
  {
    id: 'favorites-hearts',
    text: {
      fr: 'Nouveau : les cœurs — chaque visage peut marquer les recettes qu’il aime, et les suggestions en tiennent compte.',
      en: 'New: hearts — every face can mark the recipes they love, and suggestions take note.',
    },
    card: 'recipes',
  },
  {
    id: 'mots',
    text: {
      fr: 'Nouveau : les mots doux — laisse un message (écrit, vocal ou dessiné) sur le visage de quelqu’un.',
      en: 'New: little notes — leave a message (typed, voice or drawn) on someone’s face.',
    },
    card: 'mots',
  },
]
