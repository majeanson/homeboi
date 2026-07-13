import { type HelpEntry } from './helpMode'

// Help-mode copy for Réglages — the same reusable "?" mode as La cuisine. Arm it
// once via the HelpToggle in the Réglages header, then tap any section heading to
// learn what that section does in place, instead of acting on it. Each entry points
// at the matching GUIDE card/point so "→ Voir le guide" lands on the right line.
// Resets when the active tab changes (tab is passed as resetKey to useHelpMode).
export const OPERATOR_HELP = {
  boardLayout: {
    card: 'board',
    // 9 = « Personnaliser le babillard » (post-agglomeration board card).
    point: 9,
    body: {
      fr: `Choisis quelles cartes du babillard afficher, leur largeur et leur ordre — propre à CET appareil (la tablette murale et ton téléphone gardent chacun leur disposition). Glisse une poignée pour réordonner, ou même pour déplacer une carte d'un groupe à l'autre. Tu peux aussi garder le doigt sur une carte du babillard pour la réorganiser sur place.`,
      en: `Choose which board cards show, how wide they are, and in what order — specific to THIS device (the wall tablet and your phone keep their own layout). Drag a handle to reorder, or even to move a card from one group to the other. You can also press and hold a card on the board to rearrange it in place.`,
    },
  },
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
  cars: {
    card: 'auto',
    point: 0,
    body: {
      fr: `L'auto que la maisonnée se partage. Donne-lui un nom et une couleur — elle sert à savoir qui l'a, quand elle est libre et qui reconduit qui.`,
      en: `The car the household shares. Name and colour it — it's used to know who has it, when it's free, and who drives whom.`,
    },
  },
  schedule: {
    card: 'auto',
    point: 1,
    body: {
      fr: `Les heures récurrentes de chacun. Coche « prend l'auto » pour celles qui mobilisent la voiture — c'est ce qui dit à L'auto quand elle est prise. Une semaine différente s'ajuste dans la vue L'auto.`,
      en: `Everyone's recurring hours. Tick "takes the car" for the ones that tie up the vehicle — that's what tells The car when it's taken. An off week is adjusted in the car view.`,
    },
  },
  // « Le point du jour » — quand l'écran ouvre le bilan d'habitudes de lui-même.
  // Même pilule que « Mode veille » : c'est la même question, « qu'est-ce que
  // l'écran fait sans qu'on lui demande ? ».
  habits: {
    card: 'habits',
    point: 2,
    body: {
      fr: `Le matin à la première ouverture, et aux heures de rappel que tu as choisies — sur l'écran allumé seulement. Jamais de notification poussée.`,
      en: `In the morning on the first opening, and at the reminder times you picked — on the screen that's on only. Never a push notification.`,
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
    point: 4,
    body: {
      fr: `Donne à chaque cuillère et tasse la couleur de tes vrais ustensiles. Toutes les pastilles et les ronds de recettes suivent, partout.`,
      en: `Give each spoon and cup the colour of your real tools. Every recipe pill and scoop circle follows, everywhere.`,
    },
  },
  calm: {
    // Was 'set-calm' — never a GUIDE id; the real card is 'calm', and its
    // « Mode calme (option) » sub-point (index 1) is exactly this toggle.
    card: 'calm',
    point: 1,
    body: {
      fr: `Décide une seule chose : l'autocollant à la fin d'une routine d'enfant. Activé (par défaut), la routine se termine sans récompense. Les garanties calme (pas de points, pas de notifications) restent verrouillées quoi qu'il arrive.`,
      en: `Decides one thing: the sticker at the end of a kid routine. On (the default), the routine ends reward-free. The calm guarantees (no points, no notifications) stay locked regardless.`,
    },
  },
  mealSlots: {
    // Was 'set-meals' — never a GUIDE id (orphan caught by helpRegistry.test.ts).
    card: 'kitchen',
    body: {
      fr: `L'ordre, la couleur et l'heure de chaque repas de la journée, et lesquels tu veux voir sur le babillard et dans La cuisine. Glisse-les dans l'ordre de ta journée : il est respecté partout. L'étoile marque le repas vedette — celui qui fait la manchette « Ce soir ». L'heure dit quand chaque repas est servi : c'est elle, pas l'ordre, qui décide du prochain repas à cuisiner.`,
      en: `The order, colour and hour of each meal of the day, and which ones you want to show on the board and in the kitchen. Drag them into the order your day runs in: it's respected everywhere. The star marks the headline meal — the one the board leads with. The hour says when each meal is served: that, not the order, decides which meal to cook next.`,
    },
  },
  todoTemplates: {
    card: 'todos',
    point: 2,
    body: {
      fr: `Des listes de départ prêtes à cocher — « Avant de partir », « Chez grand-papa ». Chaque titre et chaque étape sont éditables en place.`,
      en: `Starter checklists ready to tick — "Before leaving", "At grandpa's". Every title and step is editable in place.`,
    },
  },
  recipeTags: {
    card: 'set-recipes',
    point: 0,
    body: {
      fr: `Toutes tes étiquettes de recettes dans une seule liste. Glisse ⠿ pour les réordonner — cet ordre décide aussi de l'ordre des collections. « Proposée » = offerte dans le formulaire mais pas encore sur une recette. Renomme ou retire une étiquette partout d'un coup, et donne-lui une couleur.`,
      en: `All your recipe tags in one list. Drag ⠿ to reorder — that order also sets your collections. "Suggested" = offered in the form but not on any recipe yet. Rename or remove a tag everywhere at once, and give it a colour.`,
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
    // Was 'set-ghost' — the real card is 'ghost' (orphan caught by helpRegistry.test.ts).
    card: 'ghost',
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
    // Was 'set-recap' — never a GUIDE id; the AI card covers the on-demand recap.
    card: 'ai',
    body: {
      fr: `Un bilan calme de la semaine écrit par l'IA sur demande. Un bouton, jamais un fil automatique. Se cache si l'IA n'est pas branchée.`,
      en: `A calm weekly reflection written by AI on demand. A button, never an automatic feed. Hides itself if AI is offline.`,
    },
  },
  photos: {
    // Was 'set-photos' — the screensaver card's « Mur de souvenirs » point IS this.
    card: 'screensaver',
    point: 1,
    body: {
      fr: `Les photos de famille qui dérivent doucement sur le babillard en mode veille. Redimensionnées à l'envoi, plafonnées côté serveur.`,
      en: `The family photos that gently drift across the board during idle mode. Resized on upload, capped server-side.`,
    },
  },
  micTest: {
    card: 'settings',
    point: 5,
    body: {
      fr: `Teste le micro sur cet appareil et génère un rapport de diagnostic à partager si la dictée ne fonctionne pas.`,
      en: `Tests the mic on this device and generates a diagnostic report to share if dictation isn't working.`,
    },
  },
  aiTest: {
    // Was 'set-ailog' — never a GUIDE id; the AI card is the home for diagnostics.
    card: 'ai',
    body: {
      fr: `Vérifie en direct si les modèles IA (texte et vision) répondent — utile avant de signaler un problème de capture ou de suggestions.`,
      en: `Live-checks whether the AI models (text and vision) respond — useful before reporting a capture or suggestion issue.`,
    },
  },
  aiLog: {
    // Was 'set-ailog' — same fix as aiTest above.
    card: 'ai',
    body: {
      fr: `Le journal de maintenance : ce qui a brisé et quand. Efface-le une fois lu — pas un compteur, juste un carnet d'entretien.`,
      en: `The maintenance log: what broke and when. Clear it once read — not a counter, just a maintenance log.`,
    },
  },
  guest: {
    // Was 'set-guest' — never a GUIDE id; 'share-access' is the guest-links card.
    card: 'share-access',
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
  homeProjets: {
    card: 'set-chores',
    point: 8,
    body: {
      fr: `Les grands projets : rénover, budgéter, planifier. Sans date, ils restent ici, au calme.`,
      en: `The bigger plans: renovate, budget, plan ahead. With no date they rest here, calmly.`,
    },
  },
  homeEntretien: {
    card: 'set-chores',
    point: 8,
    body: {
      fr: `L'entretien qui revient : filtre, gouttières, arbres. Avec une date, il s'affiche au babillard.`,
      en: `The upkeep that comes back: filter, gutters, trees. With a date it shows on the board.`,
    },
  },
  houseDiary: {
    // « La maison cette année » — the cercle card's diary point (12).
    card: 'cercle',
    point: 12,
    body: {
      fr: `Le journal calme de l'année : les soins notés aux carnets, les corvées faites, les voyages terminés, les dessins gardés — mois par mois. Des noms et des dates, jamais des comptes. Rien à tenir : ça s'écrit tout seul.`,
      en: `The year's calm journal: the care noted in the carnets, the chores done, the trips taken, the drawings kept — month by month. Names and dates, never counts. Nothing to maintain: it writes itself.`,
    },
  },
  schoolYear: {
    // « La rentrée » — the board card's school-year point (11).
    card: 'board',
    point: 11,
    body: {
      fr: `La rentrée, le dernier jour et les relâches — une fois par année. Le babillard sait alors dire « école demain » ou « congé demain » sans que ce soit affiché tous les jours.`,
      en: `The first day, the last day, and any breaks — once a year. The board can then say "school tomorrow" or "day off tomorrow" without showing it every single day.`,
    },
  },
  cercleGroups: {
    card: 'cercle',
    point: 8,
    body: {
      fr: `Tous tes groupes du cercle, même ceux que le répertoire cache (un groupe « famille » entièrement composé de la maisonnée). Supprime ici n'importe quel groupe — les personnes restent dans le cercle.`,
      en: `All your circle groups, even the ones the directory hides (a "family" group made up entirely of the household). Delete any group here — the people stay in the circle.`,
    },
  },
} satisfies Record<string, HelpEntry>
