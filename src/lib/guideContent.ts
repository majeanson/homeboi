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

import type { IconName } from '../components/Icon'

export type Bi = { fr: string; en: string }

export type GuidePoint = {
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
  // An optional action button the card hosts. 'replay-tour' restarts the guided
  // tour (lib/tour.tsx) — used by the "Première fois" card.
  action?: 'replay-tour'
}

export const GUIDE_GROUPS: { id: GuideEntry['group']; label: Bi; blurb: Bi }[] = [
  {
    id: 'start',
    label: { fr: 'Pour commencer', en: 'To get started' },
    blurb: {
      fr: 'Nouveau sur Babillard ? Commence ici : l’ensemble en quelques lignes, et le bouton pour rejouer la visite guidée.',
      en: 'New to Babillard? Start here: the whole thing in a few lines, and the button to replay the guided tour.',
    },
  },
  {
    id: 'sections',
    label: { fr: 'Les cinq sections', en: 'The five sections' },
    blurb: {
      fr: 'Les cinq onglets en bas (ou à gauche sur la tablette). Chacun montre la même information de famille sous un angle différent.',
      en: 'The five tabs at the bottom (or down the left on the tablet). Each shows the same household info from a different angle.',
    },
  },
  {
    id: 'concepts',
    label: { fr: 'Les concepts clés', en: 'Key concepts' },
    blurb: {
      fr: 'Les quelques idées qui reviennent partout dans l’app. Les comprendre une fois, c’est comprendre le reste.',
      en: 'The few ideas that show up everywhere in the app. Understand these once and the rest follows.',
    },
  },
  {
    id: 'settings',
    label: { fr: 'Les réglages, onglet par onglet', en: 'Settings, tab by tab' },
    blurb: {
      fr: 'Chaque onglet de Réglages, et exactement ce que tu peux y faire. Le poste de pilotage du parent.',
      en: 'Every Settings tab, and exactly what you can do in it. The parent’s control panel.',
    },
  },
]

export const GUIDE: GuideEntry[] = [
  // ── Pour commencer (the overview + replay) ────────────────────────────────
  {
    id: 'first-time',
    icon: 'sparkle-bold',
    group: 'start',
    action: 'replay-tour',
    title: { fr: 'Première fois', en: 'First time' },
    what: {
      fr: 'Tout Babillard en bref — ce que c’est, les cinq sections, comment ajouter, et la promesse « calme ».',
      en: 'All of Babillard in brief — what it is, the five sections, how to add, and the “calm” promise.',
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
        label: { fr: 'Les cinq sections', en: 'The five sections' },
        detail: {
          fr: '[[icon:sun-bold]] Le babillard (le coup d’œil), [[icon:carrot-bold]] La cuisine (soupers et recettes), [[icon:smiley-bold]] Routines (les enfants), [[icon:sparkle-bold]] La liste (l’épicerie) et [[icon:gear-six-bold]] Réglages (ton poste de pilotage).',
          en: '[[icon:sun-bold]] the Board (the glance), [[icon:carrot-bold]] the Kitchen (suppers and recipes), [[icon:smiley-bold]] Routines (the kids), [[icon:sparkle-bold]] the List (groceries) and [[icon:gear-six-bold]] Settings (your control panel).',
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
        label: { fr: 'Deux appareils, deux vues', en: 'Two devices, two views' },
        detail: {
          fr: 'La tablette au mur (le kiosque) montre le coup d’œil de toute la maisonnée ; ton téléphone sert aux notes rapides. Et la vue Enfant transforme chaque page en grandes cartes en images pour un pré-lecteur.',
          en: 'The wall tablet (the kiosk) shows the whole household at a glance; your phone is for quick notes. And the Toddler view turns every page into big picture-cards for a pre-reader.',
        },
        why: {
          fr: 'Pour que chaque appareil — et chaque personne — voie la forme qui lui convient.',
          en: 'So each device — and each person — sees the form that suits them.',
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
        label: { fr: 'Rejouer la visite', en: 'Replay the tour' },
        detail: {
          fr: 'Le petit tour interactif démarre tout seul la première fois. Pour le revoir, touche le bouton ci-dessous : il t’amène au babillard et te guide.',
          en: 'The little interactive tour starts on its own the first time. To see it again, tap the button below: it takes you to the board and walks you through.',
        },
      },
    ],
  },
  // ── Sections (the five hub tabs) ──────────────────────────────────────────
  {
    id: 'board',
    icon: 'sun-bold',
    group: 'sections',
    title: { fr: 'Le babillard', en: 'The board' },
    what: {
      fr: 'L’écran « coup d’œil » de la maisonnée : l’heure, l’agenda du jour, le souper de ce soir, la liste et les corvées, réunis sur un même mur — pour que tout le monde voie la journée d’un regard, sans demander ni rien toucher.',
      en: 'The household glance screen: the time, today’s agenda, tonight’s supper, the list and the chores, gathered on one wall — so everyone sees the day at a glance, without asking or touching a thing.',
    },
    points: [
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
          fr: 'Le souper prévu pour aujourd’hui, et qui cuisine. Vide tant que rien n’est planifié dans La cuisine.',
          en: 'Today’s planned supper, and who’s cooking. Empty until something is planned in the Kitchen.',
        },
        why: {
          fr: 'La réponse à « qu’est-ce qu’on mange ? » sans que personne ait à demander.',
          en: 'The answer to “what’s for supper?” without anyone having to ask.',
        },
      },
      {
        label: { fr: 'Changer la vue', en: 'Change the view' },
        detail: {
          fr: 'Grille (toute la semaine), « Maintenant » (la prochaine affaire), par personne (la journée d’un seul) ou le mois (la vue d’ensemble).',
          en: 'Grid (the whole week), “Now” (the next thing), by person (one person’s day) or the month (the big picture).',
        },
        why: {
          fr: 'Chaque vue répond à une question différente; choisis celle qui parle à ta famille.',
          en: 'Each view answers a different question; pick the one that speaks to your family.',
        },
      },
      {
        label: { fr: 'Planifier une journée', en: 'Plan a day' },
        detail: {
          fr: 'Dans la vue Mois, touche une journée puis « Planifier cette journée » : sa page s’ouvre pour y mettre repas, note, rendez-vous et corvées — pour n’importe quelle date, pas juste aujourd’hui.',
          en: 'In the Month view, tap a day then “Plan this day”: that day’s page opens to add meals, a note, events and chores — for any date, not just today.',
        },
        why: {
          fr: 'Pour préparer une journée à l’avance d’un seul endroit, au lieu de chercher où ajouter chaque chose.',
          en: 'To set a day up ahead from one place, instead of hunting for where to add each thing.',
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
          fr: 'Sous la température, une ligne d’habillement (manteau, parapluie, bois de l’eau). De nuit, le [[icon:sun-bold]] devient [[icon:moon-stars-bold]]. En vue enfant, touche la météo pour l’entendre.',
          en: 'Under the temperature, a dressing tip (coat, umbrella, drink water). At night [[icon:sun-bold]] becomes [[icon:moon-stars-bold]]. In kid view, tap the weather to hear it.',
        },
        why: {
          fr: 'Pour habiller les enfants comme il faut avant de sortir, sans ouvrir une autre app.',
          en: 'So you dress the kids right before heading out, without opening another app.',
        },
      },
    ],
  },
  {
    id: 'kitchen',
    icon: 'carrot-bold',
    group: 'sections',
    title: { fr: 'La cuisine', en: 'The kitchen' },
    what: {
      fr: 'Le garde-manger : tu planifies les repas de la semaine et tu signales ce qui achève, et la cuisine remplit ta liste d’épicerie pour toi. Elle garde aussi tes recettes et propose des idées quand tu sèches.',
      en: 'The pantry: you plan the week’s meals and flag what’s running low, and the kitchen fills your grocery list for you. It also keeps your recipes and suggests ideas when you’re stuck.',
    },
    points: [
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
        label: { fr: 'Les quatre repas', en: 'All four meals' },
        detail: {
          fr: 'Pas juste le souper : déjeuner, dîner, souper et collation ont chacun leur case.',
          en: 'Not just supper: breakfast, lunch, supper and snack each have their own slot.',
        },
        why: {
          fr: 'Pour planifier aussi les lunchs et les collations à l’avance, pas seulement le repas du soir.',
          en: 'So you can plan lunchboxes and snacks ahead too, not only the evening meal.',
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
    ],
  },
  {
    id: 'routines',
    icon: 'smiley-bold',
    group: 'sections',
    title: { fr: 'Routines', en: 'Routines' },
    what: {
      fr: 'Des routines en cartes-images pour les enfants (matin, dodo…), lues à voix haute sur l’appareil. Un pré-lecteur peut la faire seul.',
      en: 'Picture-card routines for kids (morning, bedtime…), read aloud on the device. A pre-reader can run it alone.',
    },
    points: [
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
    id: 'liste',
    icon: 'sparkle-bold',
    group: 'sections',
    title: { fr: 'La liste', en: 'The list' },
    what: {
      fr: 'Une seule liste partagée et active (l’épicerie, le plus souvent). Tout le monde la voit et l’ajoute, sur tous les appareils.',
      en: 'One single shared, active list (groceries, usually). Everyone sees it and adds to it, on every device.',
    },
    points: [
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
        label: { fr: 'Ajout rapide', en: 'Quick add' },
        detail: {
          fr: 'Re-remplis une semaine en quelques touches à partir de ce que tu achètes souvent.',
          en: 'Restock a week in a few taps from what you buy often.',
        },
        why: {
          fr: 'Pour ne pas retaper chaque semaine les mêmes essentiels.',
          en: 'So you don’t retype the same staples every week.',
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
          fr: 'Les rabais se trouvent mieux quand le nom de l’article colle à celui de la circulaire.',
          en: 'Deals match better when the item’s name lines up with the flyer’s wording.',
        },
      },
      {
        label: { fr: 'Choisir les meilleurs prix', en: 'Pick the best prices' },
        detail: {
          fr: 'Un bouton [[icon:sparkle-bold]] trouve le meilleur rabais (au prix unitaire) pour chaque article non coché et t’amène au mode caissier.',
          en: 'A [[icon:sparkle-bold]] button finds the best deal (by unit price) for every unchecked item and takes you to cashier mode.',
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
          fr: 'Un faux pas ne coûte rien.',
          en: 'A mis-tap costs nothing.',
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
    id: 'capture',
    icon: 'plus-bold',
    group: 'concepts',
    title: { fr: 'La capture (le bouton ＋)', en: 'Capture (the ＋ button)' },
    what: {
      fr: 'Écris ou dis une note, et l’app devine quoi en faire : un rendez-vous, une corvée, un article de liste, un repas, un « il en manque », ou une note.',
      en: 'Type or say a note, and the app guesses what it is: an event, a chore, a list item, a meal, a “running low”, or a note.',
    },
    points: [
      {
        label: { fr: 'Un seul endroit', en: 'One place' },
        detail: {
          fr: 'Le bouton ＋ s’adapte à la section où tu es (une recette dans la cuisine, un article sur la liste).',
          en: 'The ＋ button adapts to the section you’re in (a recipe in the kitchen, an item on the list).',
        },
        why: {
          fr: 'Un seul geste à retenir, jamais à chercher où ajouter quelque chose.',
          en: 'One gesture to remember, never hunting for where to add something.',
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
          fr: 'Rien n’est perdu — la capture fonctionne même quand l’IA est absente.',
          en: 'Nothing is lost — capture works even when AI is down.',
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
    title: { fr: 'Vue parent ou vue enfant (l’« audience »)', en: 'Parent or kid view (the “audience”)' },
    what: {
      fr: 'La même information, montrée pour un parent ou pour un tout-petit pré-lecteur. Chaque section sait s’afficher des deux façons.',
      en: 'The same information, shown for a parent or for a pre-reader toddler. Each section knows how to show both ways.',
    },
    points: [
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
          fr: 'Le rabais voyage avec l’article de liste et s’affiche sur tous tes appareils. Il reste générique (jamais renommé).',
          en: 'The deal rides on the list item and shows on all your devices. It stays generic (never renamed).',
        },
        why: {
          fr: 'Pour qu’un même article (« fromage ») puisse porter un rabais différent d’une semaine à l’autre, sans se dédoubler.',
          en: 'So one item (“cheese”) can carry a different deal week to week, without splitting into duplicates.',
        },
      },
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets ton code postal dans Réglages ▸ Magasinage.',
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
          fr: 'L’app reconstruit les rabais; pour la circulaire complète, elle te renvoie vers le site du marchand.',
          en: 'The app reconstructs the deals; for the full flyer it links you out to the merchant’s site.',
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
      fr: 'Une vue plein écran à la caisse : coche au fur et à mesure et montre tes preuves de prix pour l’ajustement.',
      en: 'A full-screen view at the till: check items off as you go and show your price-match proof.',
    },
    points: [
      {
        label: { fr: 'Étape par étape', en: 'Step by step' },
        detail: {
          fr: 'Un gros article à la fois.',
          en: 'One big item at a time.',
        },
        why: {
          fr: 'Facile à suivre pendant que ça défile sur le tapis.',
          en: 'Easy to follow as things move down the belt.',
        },
      },
      {
        label: { fr: 'Preuve de prix', en: 'Price proof' },
        detail: {
          fr: 'Montre le rabais accroché à l’article : image de circulaire, magasin, prix, dates de validité.',
          en: 'Shows the deal attached to the item: flyer image, store, price, valid dates.',
        },
        why: {
          fr: 'De quoi réclamer l’ajustement « Imbattable » à la caisse, preuve à l’appui.',
          en: 'Enough to claim the price-match at the till, with the proof in hand.',
        },
      },
      {
        label: { fr: 'Trois temps', en: 'Three beats' },
        detail: {
          fr: 'Réviser la liste → présenter une carte à la fois ([[icon:caret-left-bold]] Précédent / Suivant [[icon:caret-right-bold]], avec « 3/5 ») → un petit écran de remerciement.',
          en: 'Review the list → present one card at a time ([[icon:caret-left-bold]] Back / Next [[icon:caret-right-bold]], with “3/5”) → a small thank-you screen.',
        },
        why: {
          fr: 'Une cadence claire pour ne pas fouiller dans l’app devant la caissière.',
          en: 'A clear rhythm so you’re not fumbling in the app in front of the cashier.',
        },
      },
      {
        label: { fr: 'Rendre l’appareil calmement', en: 'Hand the device back calmly' },
        detail: {
          fr: 'À la fin, le bouton « Continuer » n’apparaît qu’après une courte pause.',
          en: 'At the end, the “Continue” button only appears after a short pause.',
        },
        why: {
          fr: 'Pas de sortie accidentelle en pleine transaction.',
          en: 'No accidental exit mid-transaction.',
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
          fr: 'Plein écran, gros texte, une étape à la fois. Il suit la vue (parent/enfant) et se ferme par un petit [[icon:x-bold]].',
          en: 'Full screen, big text, one step at a time. Follows the view (parent/kid) and closes with a small [[icon:x-bold]].',
        },
        why: {
          fr: 'Pour suivre la recette les mains à la pâte, sans rien toucher de fin.',
          en: 'To follow the recipe hands-in-the-dough, with nothing fiddly to tap.',
        },
      },
      {
        label: { fr: 'Envoyer les ingrédients à La liste', en: 'Send ingredients to La liste' },
        detail: {
          fr: 'Un bouton « Ajouter les ingrédients » verse toute la recette sur la liste d’épicerie en un coup : chaque ligne est ramenée à son nom achetable (« 15 ml de beurre » → « Beurre ») et les doublons sont fusionnés.',
          en: 'An “Add ingredients” button pours the whole recipe onto the grocery list at once: each line is reduced to its buyable name (“15 ml butter” → “Butter”) and duplicates are merged.',
        },
        why: {
          fr: 'C’est le lien recette → épicerie : tu choisis quoi cuisiner et la liste se remplit toute seule, sans recopier ligne par ligne ni emporter les « 2 c. à thé » au magasin.',
          en: 'It’s the recipe → groceries link: you pick what to cook and the list fills itself, with no copying line by line and no “2 tsp” tagging along to the store.',
        },
      },
      {
        label: { fr: 'Pastilles de mesure', en: 'Measure pills' },
        detail: {
          fr: 'Les quantités (c. à thé, tasse…) sont des pastilles colorées; touche-les pour les entendre.',
          en: 'Amounts (tsp, cup…) are colour-coded pills; tap one to hear it.',
        },
        why: {
          fr: 'Pour confirmer une mesure sans t’arrêter de lire, les mains pleines, ou pour un enfant qui aide.',
          en: 'To confirm a measure without stopping to read, hands full, or for a child helping out.',
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
          fr: 'Des boutons ×½ / ×1 / ×2 / ×3 (ou ± sur les portions) ajustent les quantités; le mode cuisson suit.',
          en: 'Buttons ×½ / ×1 / ×2 / ×3 (or ± on servings) adjust the amounts; cook mode follows.',
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
          fr: 'Rien ne s’active sans que tu le demandes — pas de « l’app a deviné » dans ton dos.',
          en: 'Nothing turns on unless you ask — no “the app guessed” behind your back.',
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
          fr: 'Quand tu sors un article de la réserve, retire-le; s’il achève, donne-lui plutôt le drapeau « il en manque » pour qu’il saute sur la liste.',
          en: 'When you take an item out of the stash, clear it; if it’s running low, flag it “running low” instead so it jumps onto the list.',
        },
        why: {
          fr: 'La réserve dit ce que tu as déjà; « il en manque » dit ce qu’il faut racheter — les deux se complètent sans se mélanger.',
          en: 'The stash says what you already have; “running low” says what to rebuy — the two complement each other without blurring.',
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
          fr: 'Des suggestions (lait, pain, œufs) évitent de taper.',
          en: 'Suggestions (milk, bread, eggs) save typing.',
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
        label: { fr: 'Un à la fois', en: 'One at a time' },
        detail: {
          fr: 'Lancer une nouvelle annulation valide la précédente.',
          en: 'Starting a new undo commits the previous one.',
        },
        why: {
          fr: 'Pas de pile d’annulations à gérer — tu sais toujours ce que « Annuler » va défaire.',
          en: 'No stack of undos to manage — you always know what “Undo” will reverse.',
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
      fr: 'L’opérateur (le parent) crée une maisonnée et s’y connecte — c’est ce compte qui débloque les membres, le jumelage des tablettes et la synchro entre appareils. La tablette, elle, n’a pas de compte : elle se jumelle (voir Jumelage).',
      en: 'The operator (the parent) creates a household and signs in — this account is what unlocks members, tablet pairing and sync across devices. The tablet has no account: it pairs instead (see Pairing).',
    },
    points: [
      {
        label: { fr: 'Créer ta maisonnée', en: 'Create your household' },
        detail: {
          fr: 'L’inscription crée la maisonnée et t’amène direct à « La maisonnée » pour ajouter les personnes. Une maisonnée par courriel.',
          en: 'Signup creates the household and lands you in “Household” to add people. One household per email.',
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
    tab: 'household',
    title: { fr: 'Maisonnée', en: 'Household' },
    what: {
      fr: 'Qui fait partie de la famille. C’est ce qui peuple les visages, les couleurs et les agendas partout dans l’app.',
      en: 'Who’s in the family. This populates the faces, colours and agendas everywhere in the app.',
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
    ],
  },
  {
    id: 'set-agenda',
    icon: 'calendar-dots-bold',
    group: 'settings',
    tab: 'agenda',
    title: { fr: 'Agenda', en: 'Agenda' },
    what: {
      fr: 'Les rendez-vous et événements de la famille. Ce qui s’affiche dans « Aujourd’hui / À venir » sur le babillard.',
      en: 'The family’s appointments and events. What shows under “Today / Upcoming” on the board.',
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
          fr: 'Relie l’événement à un membre; sa couleur apparaît à côté sur le babillard.',
          en: 'Link the event to a member; their colour shows beside it on the board.',
        },
        why: {
          fr: 'Pour voir d’un coup à qui appartient chaque rendez-vous, sans lire les noms.',
          en: 'So you can see at a glance whose appointment each one is, without reading names.',
        },
      },
      {
        label: { fr: 'Récurrent ([[icon:repeat-bold]])', en: 'Recurring ([[icon:repeat-bold]])' },
        detail: {
          fr: 'Un événement qui revient (chaque jour/semaine/mois) porte le [[icon:repeat-bold]] dans la liste.',
          en: 'An event that repeats (daily/weekly/monthly) carries the [[icon:repeat-bold]] in the list.',
        },
        why: {
          fr: 'Pour entrer une seule fois ce qui se répète (le cours de natation du mardi) au lieu de le retaper chaque semaine.',
          en: 'So you enter a repeating thing once (Tuesday swim class) instead of retyping it every week.',
        },
      },
    ],
  },
  {
    id: 'set-chores',
    icon: 'broom-bold',
    group: 'settings',
    tab: 'chores',
    title: { fr: 'Corvées', en: 'Chores' },
    what: {
      fr: 'Les tâches de la maison et leur horaire. Elles tournent et s’affichent sur le babillard avec « c’est le tour de… ».',
      en: 'The house tasks and their schedule. They rotate and show on the board with “whose turn it is…”.',
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
          fr: 'Le bouton « Céduler » ouvre la récurrence — tous les N jours/semaines/mois, et pour « semaine » le choix des jours (D L M M J V S) — plus une date de départ.',
          en: 'The “Schedule” button opens the recurrence — every N days/weeks/months, and for “weekly” a choice of days (S M T W T F S) — plus a start date.',
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
    ],
  },
  {
    id: 'set-routines',
    icon: 'smiley-bold',
    group: 'settings',
    tab: 'routines',
    title: { fr: 'Routines (réglage)', en: 'Routines (setup)' },
    what: {
      fr: 'Là où tu montes les routines en images des enfants : les étapes, à qui elles appartiennent, et le moment de la journée.',
      en: 'Where you build the kids’ picture routines: the steps, who they belong to, and the time of day.',
    },
    points: [
      {
        label: { fr: 'Créer une routine', en: 'Create a routine' },
        detail: {
          fr: 'Nomme-la, assigne-la à un enfant, et ajoute des étapes (chacune avec une image).',
          en: 'Name it, assign it to a child, and add steps (each with a picture).',
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
    ],
  },
  {
    id: 'set-shopping',
    icon: 'shopping-bag-bold',
    group: 'settings',
    tab: 'shopping',
    title: { fr: 'Magasinage', en: 'Shopping' },
    what: {
      fr: 'Tout ce qui alimente les rabais et l’ajout rapide : ton code postal, les magasins à garder, et l’historique d’achats.',
      en: 'Everything feeding deals and quick-add: your postal code, which stores to keep, and the purchase history.',
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
    ],
  },
  {
    id: 'set-recipes',
    icon: 'tag-bold',
    group: 'settings',
    tab: 'recipes',
    title: { fr: 'Recettes (étiquettes)', en: 'Recipes (tags)' },
    what: {
      fr: 'La couche d’étiquettes de tes recettes : les pastilles proposées dans le formulaire, et le ménage des étiquettes déjà utilisées.',
      en: 'The tag layer for your recipes: the pills offered in the form, and the cleanup of tags already in use.',
    },
    points: [
      {
        label: { fr: 'Pastilles proposées', en: 'Suggested pills' },
        detail: {
          fr: 'Ajoute ou enlève les étiquettes offertes quand tu crées une recette (ex. Végé, Rapide).',
          en: 'Add or remove the tags offered when you create a recipe (e.g. Veggie, Quick).',
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
    ],
  },
  {
    id: 'set-meals',
    icon: 'fork-knife-bold',
    group: 'settings',
    tab: 'meals',
    title: { fr: 'Repas (couleurs et affichage)', en: 'Meals (colours and display)' },
    what: {
      fr: 'Le look de chaque repas de la journée — déjeuner, dîner, collation, souper. Donne-lui une couleur, et choisis lesquels tu veux voir.',
      en: 'The look of each meal of the day — breakfast, lunch, snack, supper. Give it a colour, and pick which ones you want to see.',
    },
    points: [
      {
        label: { fr: 'Une couleur par repas', en: 'A colour per meal' },
        detail: {
          fr: 'Touche une pastille pour donner sa couleur à un repas. « Couleur par défaut » la remet comme avant.',
          en: 'Tap a dot to give a meal its colour. “Default colour” puts it back as it was.',
        },
        why: {
          fr: 'La couleur suit le repas PARTOUT — babillard, calendrier du mois, cuisine — alors un coup d’œil dit « ça, c’est le souper ».',
          en: 'The colour follows the meal EVERYWHERE — board, month calendar, kitchen — so a glance says “that’s supper”.',
        },
      },
      {
        label: { fr: 'Afficher / masquer un repas', en: 'Show / hide a meal' },
        detail: {
          fr: 'Le bouton Affiché/Masqué enlève un repas du babillard et de l’aperçu de la cuisine (ex. ne garder que le souper).',
          en: 'The Shown/Hidden button drops a meal from the board and the kitchen glance (e.g. keep only supper).',
        },
        why: {
          fr: 'Pour un babillard calme qui ne montre que ce qui compte pour toi — par défaut, tous les repas sont affichés.',
          en: 'For a calm board that shows only what matters to you — by default, every meal is shown.',
        },
      },
      {
        label: { fr: 'Planifier reste toujours possible', en: 'You can still plan everything' },
        detail: {
          fr: 'Un repas masqué se planifie quand même : ouvre une journée dans La cuisine avec « Gérer » — tous les repas y sont.',
          en: 'A hidden meal can still be planned: open a day in the Kitchen with “Gérer” — every meal is there.',
        },
      },
      {
        label: { fr: 'Pour toute la maisonnée', en: 'For the whole household' },
        detail: {
          fr: 'Couleurs et choix sont partagés par tous les appareils — la tablette murale et chaque téléphone voient la même chose.',
          en: 'Colours and choices are shared across every device — the wall tablet and each phone see the same thing.',
        },
      },
    ],
  },
  {
    id: 'set-ghost',
    icon: 'ghost-bold',
    group: 'settings',
    tab: 'ghost',
    title: { fr: 'Suggestions (ghost)', en: 'Suggestions (ghost)' },
    what: {
      fr: 'Le réglage du suivi d’achats opt-in : tu choisis quoi suivre et à quelle fréquence. C’est ici qu’on monte ce qui ressort plus tard, marqué « dû / bientôt », dans le panneau d’ajout rapide de La liste (voir Suivi fantôme).',
      en: 'The opt-in purchase-tracking setup: you choose what to track and how often. This is where you build what later resurfaces, marked “due / soon”, in the quick-add panel on La liste (see Ghost tracking).',
    },
    points: [
      {
        label: { fr: 'Suivre un article', en: 'Track an item' },
        detail: {
          fr: 'Les achats fréquents apparaissent en suggestions ＋ « le suivre ? ».',
          en: 'Frequent buys show as ＋ “track it?” suggestions.',
        },
        why: {
          fr: 'Un tap, jamais automatique — le suivi reste ton choix.',
          en: 'One tap, never automatic — tracking stays your choice.',
        },
      },
      {
        label: { fr: 'Fréquence (jours)', en: 'Cadence (days)' },
        detail: {
          fr: 'Règle « tous les N jours » pour chaque article.',
          en: 'Set “every N days” per item.',
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
    id: 'set-devices',
    icon: 'device-tablet-bold',
    group: 'settings',
    tab: 'devices',
    title: { fr: 'Appareils', en: 'Devices' },
    what: {
      fr: 'Approuve les tablettes jumelées et retire-les. C’est ici que tu donnes (ou reprends) l’accès au babillard.',
      en: 'Approve paired tablets and remove them. This is where you grant (or revoke) board access.',
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
    ],
  },
  {
    id: 'set-photos',
    icon: 'image-square-bold',
    group: 'settings',
    tab: 'photos',
    title: { fr: 'Photos', en: 'Photos' },
    what: {
      fr: 'Les photos de famille qui dérivent doucement sur le babillard. Téléverse-les depuis ton téléphone.',
      en: 'The family photos that gently drift across the board. Upload them from your phone.',
    },
    points: [
      {
        label: { fr: 'Ajouter plusieurs photos', en: 'Add several photos' },
        detail: {
          fr: 'Choisis-en une ou plusieurs d’un coup (un compteur « 2/5 » suit le lot).',
          en: 'Pick one or many at once (a “2/5” counter tracks the batch).',
        },
        why: {
          fr: 'Elles sont redimensionnées petites avant l’envoi, pour charger vite et rester gratuites.',
          en: 'They’re resized small before upload, to load fast and stay free.',
        },
      },
      {
        label: { fr: 'Retirer', en: 'Remove' },
        detail: {
          fr: 'Le [[icon:x-bold]] sur une vignette l’enlève.',
          en: 'The [[icon:x-bold]] on a thumbnail removes it.',
        },
        why: {
          fr: 'Le nombre total est plafonné côté serveur, alors ça reste gratuit.',
          en: 'The total is capped server-side, so it stays free.',
        },
      },
      {
        label: { fr: 'Peut être absent', en: 'May be hidden' },
        detail: {
          fr: 'Si le stockage photo (R2) n’est pas branché, cet onglet se cache tout seul.',
          en: 'If photo storage (R2) isn’t wired up, this tab hides itself.',
        },
        why: {
          fr: 'Pour ne pas te montrer une fonction qui ne marcherait pas sur ce déploiement.',
          en: 'So it doesn’t show you a feature that wouldn’t work on this deployment.',
        },
      },
    ],
  },
  {
    id: 'set-recap',
    icon: 'pencil-simple-bold',
    group: 'settings',
    tab: 'recap',
    title: { fr: 'Récapitulatif', en: 'Recap' },
    what: {
      fr: 'Un petit bilan calme de la semaine, écrit par l’IA — sur demande seulement. Un bouton, jamais un fil sans fin.',
      en: 'A small, calm weekly reflection, written by AI — on demand only. A button, never an endless feed.',
    },
    points: [
      {
        label: { fr: 'Sur demande', en: 'On demand' },
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
          fr: 'Si l’IA est hors ligne, l’onglet disparaît.',
          en: 'If AI is offline, the tab disappears.',
        },
        why: {
          fr: 'Plutôt que d’afficher un bouton mort qui ne ferait rien.',
          en: 'Rather than show a dead button that would do nothing.',
        },
      },
    ],
  },
  {
    id: 'set-display',
    icon: 'paint-brush-bold',
    group: 'settings',
    tab: 'display',
    title: { fr: 'Affichage', en: 'Display' },
    what: {
      fr: 'L’apparence de cet appareil : le thème jour/nuit, la langue, et la vue parent/enfant.',
      en: 'How this device looks: the day/night theme, the language, and the parent/kid view.',
    },
    points: [
      {
        label: { fr: 'Thème jour / nuit', en: 'Day / night theme' },
        detail: {
          fr: 'Bascule entre [[icon:sun-bold]] jour et [[icon:moon-stars-bold]] nuit.',
          en: 'Toggle between [[icon:sun-bold]] day and [[icon:moon-stars-bold]] night.',
        },
        why: {
          fr: 'Pour la lisibilité selon l’heure — doux le soir, net en plein jour.',
          en: 'For readability by time of day — gentle at night, crisp in daylight.',
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
    ],
  },
  {
    id: 'set-calm',
    icon: 'tree-bold',
    group: 'settings',
    tab: 'calm',
    title: { fr: 'Mode calme', en: 'Calm mode' },
    what: {
      fr: 'Le seul réglage « anti-friction » : adoucir le « refaire » de la routine d’enfant. Activé par défaut.',
      en: 'The one “anti-friction” toggle: soften the kid routine’s “redo”. On by default.',
    },
    points: [
      {
        label: { fr: 'Ce que ça change', en: 'What it changes' },
        detail: {
          fr: 'Quand c’est activé, la routine ne pousse pas l’enfant à tout recommencer; elle se termine.',
          en: 'When on, the routine doesn’t push the child to start over; it just ends.',
        },
        why: {
          fr: 'Pour finir sur du calme, sans relancer un enfant déjà prêt à passer à autre chose.',
          en: 'To end on calm, without re-prompting a child who’s ready to move on.',
        },
      },
      {
        label: { fr: 'Ce que ça ne touche pas', en: 'What it never touches' },
        detail: {
          fr: 'Pas de points, pas de notifications, pas d’inventaire : ces garanties sont verrouillées.',
          en: 'No points, no notifications, no inventory: those guarantees are locked.',
        },
        why: {
          fr: 'Ce réglage adoucit une seule friction; il ne déverrouille jamais le calme structurel.',
          en: 'This toggle softens one friction; it never unlocks the structural calm.',
        },
      },
    ],
  },
  {
    id: 'set-ailog',
    icon: 'first-aid-kit-bold',
    group: 'settings',
    tab: 'ai-log',
    title: { fr: 'Journal IA', en: 'AI log' },
    what: {
      fr: 'Un carnet d’entretien : quand une fonction IA échoue (modèle retiré, panne), la note acceptée à l’écran s’inscrit ici.',
      en: 'A maintenance log: when an AI feature fails (retired model, outage), the note you accepted on-screen lands here.',
    },
    points: [
      {
        label: { fr: 'À quoi ça sert', en: 'What it’s for' },
        detail: {
          fr: 'Voir ce qui a brisé et quand.',
          en: 'See what broke and when.',
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
]
