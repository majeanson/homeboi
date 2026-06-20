import { type HelpEntry } from './helpMode'

// Help-mode copy for Réglages — the same reusable "?" mode as La cuisine. Arm it
// once via the HelpToggle in the Réglages header, then tap any section heading to
// learn what that section does in place, instead of acting on it. Each entry points
// at the matching GUIDE card/point so "→ Voir le guide" lands on the right line.
// Resets when the active tab changes (tab is passed as resetKey to useHelpMode).
export const OPERATOR_HELP: Record<string, HelpEntry> = {
  ai: {
    card: 'ai',
    body: {
      fr: `Le commutateur marche/arrêt de l'IA pour toute la maisonnée. Coupé, l'IA ne tourne plus nulle part et toutes les fonctions IA se cachent — tout le reste continue de marcher.`,
      en: `The household-wide AI on/off switch. Off, AI stops running everywhere and every AI feature hides — everything else keeps working.`,
    },
  },
  reserveLocations: {
    card: 'reserve',
    point: 0,
    body: {
      fr: `Les endroits de ta réserve (congélateur, garde-manger…) où les articles sont regroupés. Renomme-les, change leur couleur ou ajoute tes propres lieux.`,
      en: `Your stash spots (freezer, pantry…) where items are grouped. Rename them, change their colour, or add your own.`,
    },
  },
  ambient: {
    card: 'set-display',
    point: 5,
    body: {
      fr: `L'économiseur d'écran et le retour automatique à « Maisonnée » après quelques minutes d'inactivité sur le kiosque.`,
      en: `The screensaver and the automatic return to "Household" after a few idle minutes on the kiosk.`,
    },
  },
  display: {
    card: 'set-display',
    body: {
      fr: `Le thème (jour/nuit), la dérive de couleur selon le moment du jour, la langue et la vue parent/enfant — réglages propres à cet appareil.`,
      en: `Theme (day/night), colour drift by time of day, language and parent/kid view — settings local to this device.`,
    },
  },
  voice: {
    card: 'kitchen',
    point: 7,
    body: {
      fr: `La voix de lecture à haute voix dans les recettes et les routines — choisis la voix et la vitesse, et entends un extrait.`,
      en: `The read-aloud voice for recipes and routines — pick the voice and speed, and hear a sample.`,
    },
  },
  measureColors: {
    card: 'recipes',
    point: 6,
    body: {
      fr: `Donne à chaque cuillère et tasse la couleur de tes vrais ustensiles. Toutes les pastilles et les ronds de recettes suivent, partout.`,
      en: `Give each spoon and cup the colour of your real tools. Every recipe pill and scoop circle follows, everywhere.`,
    },
  },
  calm: {
    card: 'set-calm',
    point: 0,
    body: {
      fr: `Adoucit le « refaire » de la routine d'enfant. Les garanties calme (pas de points, pas de notifications) restent verrouillées quoi qu'il arrive.`,
      en: `Softens the kid routine's redo prompt. The calm guarantees (no points, no notifications) stay locked regardless.`,
    },
  },
  mealSlots: {
    card: 'set-meals',
    point: 0,
    body: {
      fr: `La couleur de chaque repas de la journée et lesquels tu veux voir sur le babillard et dans La cuisine.`,
      en: `Each meal's colour and which ones you want to show on the board and in the kitchen.`,
    },
  },
  todoTemplates: {
    card: 'todos',
    point: 1,
    body: {
      fr: `Des listes de départ prêtes à cocher — « Avant de partir », « Chez grand-papa ». Chaque titre et chaque étape sont éditables en place.`,
      en: `Starter checklists ready to tick — "Before leaving", "At grandpa's". Every title and step is editable in place.`,
    },
  },
  recipeTags: {
    card: 'set-recipes',
    point: 1,
    body: {
      fr: `Les étiquettes de tes recettes : renomme-les partout d'un coup ou retire-les de toutes les recettes en même temps.`,
      en: `Your recipe tags: rename them everywhere at once, or remove them from every recipe at once.`,
    },
  },
  tagPills: {
    card: 'set-recipes',
    point: 0,
    body: {
      fr: `Les pastilles proposées dans le formulaire de recette. Glisse ⠿ pour les réordonner — cet ordre décide aussi de l'ordre des collections.`,
      en: `The pills offered in the recipe form. Drag ⠿ to reorder — that order also sets your collections.`,
    },
  },
  tagUsed: {
    card: 'set-recipes',
    point: 1,
    body: {
      fr: `Les étiquettes déjà données à au moins une recette. Renomme-les partout d'un coup ou retire-les.`,
      en: `Tags already assigned to at least one recipe. Rename them everywhere at once or remove them.`,
    },
  },
  shop: {
    card: 'set-shopping',
    point: 0,
    body: {
      fr: `Ton code postal — il dit aux circulaires où chercher les rabais près de chez toi.`,
      en: `Your postal code — it tells the flyers where to look for deals near you.`,
    },
  },
  storeFilter: {
    card: 'set-shopping',
    point: 1,
    body: {
      fr: `Les magasins que tu gardes dans tes résultats. Ceux retirés ne reviennent plus dans les rabais.`,
      en: `The stores you keep in your results. Dropped ones never come back in deals.`,
    },
  },
  history: {
    card: 'set-shopping',
    point: 2,
    body: {
      fr: `Ce que l'ajout rapide te propose. Renomme une entrée vers son nom générique ou retire-la.`,
      en: `What quick-add suggests. Rename an entry to its generic name or remove it.`,
    },
  },
  ghost: {
    card: 'set-ghost',
    point: 0,
    body: {
      fr: `Configure le suivi opt-in : choisis quoi suivre, à quelle fréquence, et mets des articles en sourdine ou retire-les.`,
      en: `Configure opt-in tracking: choose what to track, how often, and mute or remove items.`,
    },
  },
  recipePills: {
    card: 'set-recipes',
    point: 0,
    body: {
      fr: `Les pastilles de filtre dans l'onglet Recettes — intégrées et personnalisées. Glisse ⠿ pour réordonner ; l'œil les cache sans les supprimer.`,
      en: `The filter pills on the Recipes tab — built-in and custom. Drag ⠿ to reorder; the eye hides without deleting.`,
    },
  },
  recap: {
    card: 'set-recap',
    point: 0,
    body: {
      fr: `Un bilan calme de la semaine écrit par l'IA sur demande. Un bouton, jamais un fil automatique. Se cache si l'IA n'est pas branchée.`,
      en: `A calm weekly reflection written by AI on demand. A button, never an automatic feed. Hides itself if AI is offline.`,
    },
  },
  photos: {
    card: 'set-photos',
    point: 0,
    body: {
      fr: `Les photos de famille qui dérivent doucement sur le babillard en mode veille. Redimensionnées à l'envoi, plafonnées côté serveur.`,
      en: `The family photos that gently drift across the board during idle mode. Resized on upload, capped server-side.`,
    },
  },
  micTest: {
    card: 'offline',
    point: 4,
    body: {
      fr: `Teste le micro sur cet appareil et génère un rapport de diagnostic à partager si la dictée ne fonctionne pas.`,
      en: `Tests the mic on this device and generates a diagnostic report to share if dictation isn't working.`,
    },
  },
  aiTest: {
    card: 'set-ailog',
    point: 1,
    body: {
      fr: `Vérifie en direct si les modèles IA (texte et vision) répondent — utile avant de signaler un problème de capture ou de suggestions.`,
      en: `Live-checks whether the AI models (text and vision) respond — useful before reporting a capture or suggestion issue.`,
    },
  },
  aiLog: {
    card: 'set-ailog',
    point: 1,
    body: {
      fr: `Le journal de maintenance : ce qui a brisé et quand. Efface-le une fois lu — pas un compteur, juste un carnet d'entretien.`,
      en: `The maintenance log: what broke and when. Clear it once read — not a counter, just a maintenance log.`,
    },
  },
  idleDebug: {
    card: 'set-ailog',
    point: 0,
    body: {
      fr: `Raccourcit le délai d'inactivité du kiosque pour tester l'économiseur d'écran et le retour à « Maisonnée » sans attendre 3 minutes.`,
      en: `Shortens the kiosk idle delay to test the screensaver and return to "Household" without waiting 3 minutes.`,
    },
  },
  guest: {
    card: 'set-guest',
    point: 0,
    body: {
      fr: `Un lien temporaire en lecture seule pour la gardienne. Elle voit le babillard et les routines sans rien pouvoir changer. Le lien expire tout seul.`,
      en: `A temporary read-only link for the babysitter. She sees the board and routines without changing anything. The link expires on its own.`,
    },
  },
  choreLedger: {
    card: 'set-chores',
    point: 3,
    body: {
      fr: `Ce que la maisonnée a fait cette semaine — qui a fait quoi, quel jour. Pas de scores ni de classements, juste les noms et les visages.`,
      en: `What the household did this week — who did what, which day. No scores or rankings, just names and faces.`,
    },
  },
  cercleGroups: {
    card: 'cercle',
    point: 6,
    body: {
      fr: `Tous tes groupes du cercle, même ceux que le répertoire cache (un groupe « famille » entièrement composé de la maisonnée). Supprime ici n'importe quel groupe — les personnes restent dans le cercle.`,
      en: `All your circle groups, even the ones the directory hides (a "family" group made up entirely of the household). Delete any group here — the people stay in the circle.`,
    },
  },
}
