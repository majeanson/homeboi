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

export type Bi = { fr: string; en: string }

export type GuidePoint = {
  label: Bi
  detail: Bi
}

export type GuideEntry = {
  id: string
  icon: string
  group: 'sections' | 'concepts' | 'settings'
  title: Bi
  what: Bi
  points: GuidePoint[]
}

export const GUIDE_GROUPS: { id: GuideEntry['group']; label: Bi; blurb: Bi }[] = [
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
  // ── Sections (the five hub tabs) ──────────────────────────────────────────
  {
    id: 'board',
    icon: '📋',
    group: 'sections',
    title: { fr: 'Le babillard', en: 'The board' },
    what: {
      fr: 'L’écran « coup d’œil » de la maisonnée : l’heure, l’agenda du jour, le souper de ce soir, la liste et les corvées — tout sur un même mur.',
      en: 'The household glance screen: the time, today’s agenda, tonight’s supper, the list and the chores — all on one wall.',
    },
    points: [
      {
        label: { fr: 'Pensé pour la tablette', en: 'Built for the tablet' },
        detail: {
          fr: 'Gros caractères, lisibles de l’autre bout de la cuisine. Ça se rafraîchit tout seul; pas besoin d’y toucher.',
          en: 'Big type, readable across the kitchen. It refreshes itself; no need to touch it.',
        },
      },
      {
        label: { fr: 'Ce soir', en: 'Tonight' },
        detail: {
          fr: 'Le souper prévu pour aujourd’hui, avec qui cuisine. Vide tant que rien n’est planifié dans La cuisine.',
          en: 'The supper planned for today, and who’s cooking. Empty until something is planned in the Kitchen.',
        },
      },
      {
        label: { fr: 'Changer la vue', en: 'Change the view' },
        detail: {
          fr: 'Grille, « Maintenant », par personne, ou le mois — choisis ce qui parle le plus à ta famille.',
          en: 'Grid, “Now”, by person, or the month — pick whatever speaks to your family.',
        },
      },
      {
        label: { fr: 'Toucher un visage', en: 'Tap a face' },
        detail: {
          fr: 'Touche ta photo pour mettre ta journée en avant; touche-la encore pour revenir à « toute la maisonnée ». Sur la tablette, ça revient tout seul après quelques minutes (avec un petit ⏳ d’avertissement).',
          en: 'Tap your photo to put your day front and centre; tap it again to go back to “everyone”. On the tablet it drifts back on its own after a few idle minutes (with a small ⏳ heads-up).',
        },
      },
      {
        label: { fr: 'Salutation selon l’heure', en: 'Greeting by time of day' },
        detail: {
          fr: 'Le mot d’accueil suit l’horloge : bon matin, bon après-midi, bonne soirée.',
          en: 'The greeting follows the clock: good morning, good afternoon, good evening.',
        },
      },
      {
        label: { fr: 'À préparer pour demain', en: 'Prep for tomorrow' },
        detail: {
          fr: 'La note prévue pour demain remonte dès aujourd’hui, avec un aperçu météo (haut/bas), pour t’y prendre à temps.',
          en: 'Tomorrow’s note surfaces today, with a coarse weather outlook (high/low), so you can act in time.',
        },
      },
      {
        label: { fr: 'Conseil météo', en: 'Weather tip' },
        detail: {
          fr: 'Sous la température, une ligne d’habillement (manteau, parapluie, bois de l’eau). De nuit, le ☀️ devient 🌙. En vue enfant, touche la météo pour l’entendre.',
          en: 'Under the temperature, a dressing tip (coat, umbrella, drink water). At night ☀️ becomes 🌙. In kid view, tap the weather to hear it.',
        },
      },
    ],
  },
  {
    id: 'kitchen',
    icon: '🥕',
    group: 'sections',
    title: { fr: 'La cuisine', en: 'The kitchen' },
    what: {
      fr: 'Le garde-manger : le plan des soupers de la semaine, les recettes, ce qui s’achève, et les suggestions de repas.',
      en: 'The pantry: the week’s supper plan, recipes, what’s running low, and meal suggestions.',
    },
    points: [
      {
        label: { fr: 'Planifier la semaine', en: 'Plan the week' },
        detail: {
          fr: 'Mets un repas dans une case et il apparaît sur le babillard la bonne journée. Pas obligé de tout remplir.',
          en: 'Drop a meal in a slot and it shows on the board on the right day. No need to fill every box.',
        },
      },
      {
        label: { fr: 'Ce qui s’achève', en: 'Running low' },
        detail: {
          fr: 'Un simple drapeau « il en manque » — pas un inventaire. Coche un aliment pour l’envoyer direct sur la liste d’épicerie.',
          en: 'Just a “we’re low” flag — not an inventory count. Check an item to send it straight to the grocery list.',
        },
      },
      {
        label: { fr: 'Qu’est-ce qu’on mange ?', en: 'What’s for supper?' },
        detail: {
          fr: 'Le bouton de suggestion propose une idée de repas. Touche encore pour une autre. (Demande l’IA — caché si elle est hors ligne.)',
          en: 'The suggest button offers a meal idea. Tap again for another. (Uses AI — hidden when AI is offline.)',
        },
      },
      {
        label: { fr: 'Recettes', en: 'Recipes' },
        detail: {
          fr: 'Garde tes recettes, importe-les d’une photo ou d’un collé-copié, et planifie-les comme repas.',
          en: 'Keep your recipes, import them from a photo or a paste, and schedule them as meals.',
        },
      },
      {
        label: { fr: 'Les quatre repas', en: 'All four meals' },
        detail: {
          fr: 'Pas juste le souper : déjeuner, dîner, souper et collation ont chacun leur case dans la semaine.',
          en: 'Not just supper: breakfast, lunch, supper and snack each have their own slot in the week.',
        },
      },
      {
        label: { fr: 'Idées de repas', en: 'Meal ideas' },
        detail: {
          fr: 'Une petite réserve d’idées (texte libre ou recette 📖) sous la grille; touche-en une pour la déposer sur n’importe quel jour. Elle reste dans la réserve pour réutiliser.',
          en: 'A small pool of ideas (free text or a 📖 recipe) under the grid; tap one to drop it on any day. It stays in the pool to reuse.',
        },
      },
      {
        label: { fr: 'Note du jour', en: 'Day note' },
        detail: {
          fr: 'Un mémo par journée (« souper chez mémé », « lunch froid — sortie ») qui apparaît aussi sur le babillard la bonne date.',
          en: 'A per-day memo (“supper at grandma’s”, “cold lunch — outing”) that also shows on the board on the right date.',
        },
      },
    ],
  },
  {
    id: 'routines',
    icon: '🧸',
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
      },
      {
        label: { fr: 'Lu à voix haute', en: 'Read aloud' },
        detail: {
          fr: 'L’appareil lit chaque étape — aucune lecture requise de l’enfant.',
          en: 'The device speaks each step — no reading required from the child.',
        },
      },
      {
        label: { fr: 'Pas de récompenses', en: 'No rewards' },
        detail: {
          fr: 'Aucun point, aucune étoile, aucune séquence à entretenir. La routine se termine et c’est tout.',
          en: 'No points, no stars, no streak to keep alive. The routine simply ends.',
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
      },
      {
        label: { fr: 'Un chrono qui monte', en: 'A count-up timer' },
        detail: {
          fr: 'Le temps s’additionne du début à la fin — aucun compte à rebours, aucune pression, aucun score.',
          en: 'Time adds up from start to finish — no countdown, no pressure, no score.',
        },
      },
      {
        label: { fr: 'Tout se touche pour l’entendre', en: 'Tap anything to hear it' },
        detail: {
          fr: 'En vue enfant, toucher la météo, une note ou même le message vide le lit à voix haute. Les grandes tuiles demandent deux touchers (« tape encore pour… ») pour confirmer.',
          en: 'In kid view, tapping the weather, a note or even the empty message reads it aloud. Big tiles ask for two taps (“tap again to…”) to confirm.',
        },
      },
    ],
  },
  {
    id: 'liste',
    icon: '🛒',
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
      },
      {
        label: { fr: 'Vider les cochés', en: 'Clear checked' },
        detail: {
          fr: 'Un bouton enlève tout ce qui est coché d’un coup (et le note pour l’ajout rapide la prochaine fois).',
          en: 'One button removes everything checked at once (and remembers it for quick-add next time).',
        },
      },
      {
        label: { fr: 'Ajout rapide', en: 'Quick add' },
        detail: {
          fr: 'Re-remplis une semaine en quelques touches à partir de ce que tu achètes souvent.',
          en: 'Restock a week in a few taps from what you buy often.',
        },
      },
      {
        label: { fr: 'Parler ta liste', en: 'Speak your list' },
        detail: {
          fr: 'Touche le micro et nomme tes articles; le micro reste ouvert. Une phrase comme « lait, œufs pis pain » se découpe en trois articles.',
          en: 'Tap the mic and name your items; the mic stays open. A phrase like “milk, eggs and bread” splits into three items.',
        },
      },
      {
        label: { fr: 'Images d’articles', en: 'Item pictures' },
        detail: {
          fr: 'Chaque article montre une petite image (lait, pain, pomme) — repérable d’un coup d’œil, sans lire.',
          en: 'Each item shows a small picture (milk, bread, apple) — spottable at a glance, no reading.',
        },
      },
      {
        label: { fr: 'Qui l’a ajouté', en: 'Who added it' },
        detail: {
          fr: 'Une pastille de couleur indique la personne qui a ajouté l’article (selon le visage choisi sur l’appareil).',
          en: 'A colour dot shows who added the item (based on the face picked on that device).',
        },
      },
      {
        label: { fr: 'Synonymes de recherche', en: 'Search synonyms' },
        detail: {
          fr: 'Modifie un article pour lui ajouter des synonymes (ex. œuf, œufs, egg) : les rabais se trouvent mieux. Ils survivent à un re-ajout.',
          en: 'Edit an item to add synonyms (e.g. egg, eggs, œuf): deals match better. They survive a re-add.',
        },
      },
      {
        label: { fr: 'Choisir les meilleurs prix', en: 'Pick the best prices' },
        detail: {
          fr: 'Un bouton ✨ trouve le meilleur rabais (au prix unitaire) pour chaque article non coché et t’amène au mode caissier.',
          en: 'A ✨ button finds the best deal (by unit price) for every unchecked item and takes you to cashier mode.',
        },
      },
      {
        label: { fr: 'Filet de sécurité (annuler)', en: 'Safety net (undo)' },
        detail: {
          fr: '« Vider les cochés » attend ~5 s derrière un bandeau « Annuler » — un faux pas ne coûte rien.',
          en: '“Clear checked” waits ~5 s behind an “Undo” toast — a mis-tap costs nothing.',
        },
      },
    ],
  },
  {
    id: 'settings',
    icon: '⚙️',
    group: 'sections',
    title: { fr: 'Réglages', en: 'Settings' },
    what: {
      fr: 'Le poste de pilotage du parent : les personnes, les appareils, les corvées, les routines, l’affichage. Réservé à l’opérateur (pas la tablette).',
      en: 'The parent’s control panel: people, devices, chores, routines, display. Operator-only (not the tablet).',
    },
    points: [
      {
        label: { fr: 'Maisonnée', en: 'Household' },
        detail: {
          fr: 'Ajoute les membres de la famille, leur couleur et leur photo. C’est ce qui peuple les visages et les agendas.',
          en: 'Add the family members, their colour and photo. This is what populates the faces and agendas.',
        },
      },
      {
        label: { fr: 'Appareils', en: 'Devices' },
        detail: {
          fr: 'Approuve une tablette qui demande à se jumeler, et retire-la quand tu veux (voir Jumelage).',
          en: 'Approve a tablet asking to pair, and remove it whenever you like (see Pairing).',
        },
      },
      {
        label: { fr: 'Corvées & routines', en: 'Chores & routines' },
        detail: {
          fr: 'Monte la rotation des corvées et les étapes des routines d’enfants ici.',
          en: 'Build the chore rotation and the kid routine steps here.',
        },
      },
      {
        label: { fr: 'Réservé au parent', en: 'Parent-only' },
        detail: {
          fr: 'Une tablette ou la vue enfant ne peuvent pas ouvrir Réglages — c’est volontaire.',
          en: 'A tablet or the kid view can’t open Settings — that’s on purpose.',
        },
      },
    ],
  },

  // ── Key concepts (cross-cutting) ──────────────────────────────────────────
  {
    id: 'capture',
    icon: '✍️',
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
      },
      {
        label: { fr: 'Parler plutôt qu’écrire', en: 'Speak instead of type' },
        detail: {
          fr: 'La reconnaissance vocale se fait sur l’appareil. « souper spaghetti jeudi » devient un repas, le bon jour.',
          en: 'Voice recognition runs on the device. “spaghetti supper Thursday” becomes a meal, on the right day.',
        },
      },
      {
        label: { fr: 'Si l’IA est hors ligne', en: 'If AI is offline' },
        detail: {
          fr: 'Tu choisis toi-même le type dans une petite liste. Rien n’est perdu.',
          en: 'You pick the type yourself from a small list. Nothing is lost.',
        },
      },
    ],
  },
  {
    id: 'surface',
    icon: '🖥️',
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
          fr: 'On le demande une fois. La tablette montre le grand babillard; le téléphone, une barre d’onglets sous le pouce.',
          en: 'Asked once. The tablet shows the big board; the phone, a thumb-reach tab bar.',
        },
      },
      {
        label: { fr: 'Ce n’est pas une sécurité', en: 'Not a permission' },
        detail: {
          fr: 'C’est juste de la présentation. Ce qui protège vraiment l’écriture, c’est la connexion et le jumelage.',
          en: 'It’s only presentation. What actually protects writing is the login and the pairing.',
        },
      },
    ],
  },
  {
    id: 'audience',
    icon: '👶',
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
          fr: 'Touche 👶 dans la barre, ou démarre la tablette « verrouillée enfant » pour qu’elle reste sur cette vue.',
          en: 'Tap 👶 in the bar, or boot the tablet “kid-locked” so it stays on that view.',
        },
      },
      {
        label: { fr: 'Une porte à sens unique', en: 'A one-way door' },
        detail: {
          fr: 'En vue enfant, il n’y a aucun bouton pour revenir — exprès, pour qu’un tout-petit ne se promène pas dans les réglages.',
          en: 'In kid view there’s no button back — on purpose, so a toddler can’t wander into settings.',
        },
      },
      {
        label: { fr: 'Comment ressortir', en: 'How to get out' },
        detail: {
          fr: 'Garde le doigt appuyé ~3 s dans le coin haut-gauche, puis réponds à la petite addition. Pensé pour un adulte, pas pour l’enfant.',
          en: 'Press and hold ~3 s in the top-left corner, then answer the little sum. Made for an adult, not the child.',
        },
      },
      {
        label: { fr: 'Le truc de l’adresse web', en: 'The web-address trick' },
        detail: {
          fr: 'Depuis un navigateur (pas l’app installée), ajoute « ?kid=1 » à l’adresse pour démarrer verrouillé enfant, et « ?kid=0 » pour ressortir.',
          en: 'From a browser (not the installed app), add “?kid=1” to the address to boot kid-locked, and “?kid=0” to get back out.',
        },
      },
    ],
  },
  {
    id: 'calm',
    icon: '🌿',
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
          fr: 'La liste du jour se termine et reste vide. Rien à entretenir pour le plaisir d’entretenir.',
          en: 'The day’s list finishes and stays empty. Nothing to maintain for the sake of maintaining.',
        },
      },
      {
        label: { fr: 'Mode calme (option)', en: 'Calm mode (toggle)' },
        detail: {
          fr: 'Dans Réglages, tu peux adoucir la friction de « refaire » la routine d’enfant. C’est la seule partie ajustable.',
          en: 'In Settings, you can soften the “redo” friction of the kid routine. That’s the only adjustable part.',
        },
      },
      {
        label: { fr: 'Garanti, pas négociable', en: 'Guaranteed, not negotiable' },
        detail: {
          fr: 'L’absence de points / notifications / inventaire est verrouillée dans le code — impossible de la réactiver par accident.',
          en: 'The absence of points / notifications / inventory is locked in code — it can’t be switched back on by accident.',
        },
      },
    ],
  },
  {
    id: 'pairing',
    icon: '🔗',
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
          fr: 'La tablette affiche un code. Tu l’approuves depuis ton téléphone dans Réglages ▸ Appareils.',
          en: 'The tablet shows a code. You approve it from your phone in Settings ▸ Devices.',
        },
      },
      {
        label: { fr: 'Un jeton révocable', en: 'A revocable token' },
        detail: {
          fr: 'Une fois approuvée, la tablette garde un jeton — pas ton mot de passe. Tu peux le retirer à tout moment.',
          en: 'Once approved, the tablet keeps a token — not your password. You can revoke it anytime.',
        },
      },
      {
        label: { fr: 'Si elle perd l’accès', en: 'If it loses access' },
        detail: {
          fr: 'Si tu retires l’appareil, la tablette montre un écran plein « accès perdu » avec « Re-jumeler » et « Réessayer » (au cas où c’est juste une panne passagère) — toujours avec ton approbation.',
          en: 'If you remove the device, the tablet shows a full “access lost” screen with “Re-pair” and “Retry” (in case it’s just a passing blip) — always with your approval.',
        },
      },
    ],
  },
  {
    id: 'deals',
    icon: '🏷️',
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
          fr: 'Le rabais voyage avec l’article de liste; il s’affiche sur toutes tes appareils. Il reste générique (pas renommé).',
          en: 'The deal rides on the list item; it shows on all your devices. It stays generic (not renamed).',
        },
      },
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets ton code postal dans Réglages ▸ Magasinage pour voir les rabais des magasins proches.',
          en: 'Set your postal code in Settings ▸ Shopping to see deals from nearby stores.',
        },
      },
      {
        label: { fr: 'La vraie circulaire', en: 'The real flyer' },
        detail: {
          fr: 'L’app reconstruit les rabais; pour la circulaire complète, elle te renvoie vers le site du marchand.',
          en: 'The app reconstructs the deals; for the full flyer it links you out to the merchant’s site.',
        },
      },
    ],
  },
  {
    id: 'cashier',
    icon: '🧾',
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
          fr: 'Un gros article à la fois, facile à suivre pendant que ça défile sur le tapis.',
          en: 'One big item at a time, easy to follow as things move down the belt.',
        },
      },
      {
        label: { fr: 'Preuve de prix', en: 'Price proof' },
        detail: {
          fr: 'Montre le rabais accroché à l’article (image de circulaire, magasin, prix, dates de validité) pour l’ajustement « Imbattable ».',
          en: 'Show the deal attached to the item (flyer image, store, price, valid dates) for a price-match.',
        },
      },
      {
        label: { fr: 'Trois temps', en: 'Three beats' },
        detail: {
          fr: 'Réviser la liste → présenter une carte à la fois (‹ Précédent / Suivant ›, avec « 3/5 ») → un petit écran de remerciement.',
          en: 'Review the list → present one card at a time (‹ Back / Next ›, with “3/5”) → a small thank-you screen.',
        },
      },
      {
        label: { fr: 'Rendre l’appareil calmement', en: 'Hand the device back calmly' },
        detail: {
          fr: 'À la fin, le bouton « Continuer » n’apparaît qu’après une courte pause — pas de sortie accidentelle en pleine transaction.',
          en: 'At the end, the “Continue” button only appears after a short pause — no accidental exit mid-transaction.',
        },
      },
    ],
  },
  {
    id: 'recipes',
    icon: '👩‍🍳',
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
      },
      {
        label: { fr: 'Mode cuisson', en: 'Cook mode' },
        detail: {
          fr: 'Plein écran, gros texte, une étape à la fois. Il suit la vue (parent/enfant) et se ferme par un petit ✕.',
          en: 'Full screen, big text, one step at a time. Follows the view (parent/kid) and closes with a small ✕.',
        },
      },
      {
        label: { fr: 'Pastilles de mesure', en: 'Measure pills' },
        detail: {
          fr: 'Les quantités (c. à thé, tasse…) sont des pastilles colorées; touche-les pour les entendre.',
          en: 'Amounts (tsp, cup…) are colour-coded pills; tap one to hear it.',
        },
      },
      {
        label: { fr: 'Sections de recette', en: 'Recipe sections' },
        detail: {
          fr: 'Tu peux titrer des groupes (« ## Sauce ») dans les ingrédients et les étapes pour t’y retrouver.',
          en: 'You can title groups (“## Sauce”) inside ingredients and steps to stay organized.',
        },
      },
      {
        label: { fr: 'Doubler ou couper', en: 'Scale up or down' },
        detail: {
          fr: 'Des boutons ×½ / ×1 / ×2 / ×3 (ou ± sur les portions) ajustent les quantités; le mode cuisson suit.',
          en: 'Buttons ×½ / ×1 / ×2 / ×3 (or ± on servings) adjust the amounts; cook mode follows.',
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
        label: { fr: 'Voir l’original (📜)', en: 'See the original (📜)' },
        detail: {
          fr: 'Un bouton montre la recette telle qu’importée, avant tes retouches, avec la date d’import.',
          en: 'A button shows the recipe exactly as imported, before your edits, with the import date.',
        },
      },
      {
        label: { fr: 'Réordonner les rangées', en: 'Reorder rows' },
        detail: {
          fr: 'Des flèches ↑/↓ montent ou descendent un ingrédient ou une étape, sans glisser-déposer.',
          en: 'Arrows ↑/↓ move an ingredient or step up or down, no drag-and-drop.',
        },
      },
    ],
  },
  {
    id: 'ghost',
    icon: '👻',
    group: 'concepts',
    title: { fr: 'Suivi fantôme (achats)', en: 'Ghost tracking (purchases)' },
    what: {
      fr: 'Un suivi discret de ce que tu achètes, pour mieux te proposer l’ajout rapide. Toujours sur invitation — jamais imposé.',
      en: 'A quiet track of what you buy, to power better quick-add. Always opt-in — never forced on you.',
    },
    points: [
      {
        label: { fr: 'Tu choisis', en: 'You choose' },
        detail: {
          fr: 'Acheter n’inscrit jamais un article tout seul. Rien ne s’active sans que tu le demandes.',
          en: 'Buying never enrolls an item by itself. Nothing turns on unless you ask.',
        },
      },
      {
        label: { fr: 'À quoi ça sert', en: 'What it’s for' },
        detail: {
          fr: 'À te resuggérer ce que tu reprends souvent, pour remplir une liste plus vite. C’est tout.',
          en: 'To re-suggest what you restock often, so a list fills faster. That’s all.',
        },
      },
    ],
  },
  {
    id: 'offline',
    icon: '📶',
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
          fr: 'Si la connexion saute, le babillard garde ce qu’il montrait au lieu de devenir blanc.',
          en: 'If the connection drops, the board keeps what it was showing instead of going blank.',
        },
      },
      {
        label: { fr: 'Redémarre hors ligne', en: 'Reboots offline' },
        detail: {
          fr: 'La tablette peut redémarrer sans wifi et afficher quand même l’app.',
          en: 'The tablet can reboot with no wifi and still show the app.',
        },
      },
    ],
  },

  {
    id: 'cookmode',
    icon: '⏲️',
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
      },
      {
        label: { fr: 'Minuteries automatiques', en: 'Automatic timers' },
        detail: {
          fr: 'Si une étape dit « cuire 25 min », un bouton de minuterie apparaît : un toucher la lance (pause/reprise), et l’appareil vibre à la fin.',
          en: 'If a step says “bake 25 min”, a timer button appears: one tap starts it (pause/resume), and the device buzzes when it’s done.',
        },
      },
      {
        label: { fr: 'Lecture auto (🔊/🔇)', en: 'Auto read-aloud (🔊/🔇)' },
        detail: {
          fr: 'Chaque étape se lit toute seule en arrivant; coupe-la d’un toucher si tu préfères le silence (retenu par appareil).',
          en: 'Each step reads itself on arrival; mute it with a tap if you prefer quiet (remembered per device).',
        },
      },
      {
        label: { fr: 'Les bons ingrédients', en: 'The right ingredients' },
        detail: {
          fr: 'Chaque étape montre les ingrédients qu’elle utilise — pas besoin de remonter chercher.',
          en: 'Each step shows the ingredients it uses — no scrolling back to find them.',
        },
      },
    ],
  },
  {
    id: 'flyers',
    icon: '📰',
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
          fr: 'Cherche un aliment, ou parcours les magasins. Des suggestions (lait, pain, œufs) évitent de taper.',
          en: 'Search a food, or browse the stores. Suggestions (milk, bread, eggs) save typing.',
        },
      },
      {
        label: { fr: 'Cette semaine vs à venir', en: 'This week vs upcoming' },
        detail: {
          fr: 'Les circulaires courantes et celles de la semaine prochaine (publiées d’avance) sont séparées, pour préparer ta liste à l’avance.',
          en: 'Current flyers and next week’s (published early) are split, so you can prep your list ahead.',
        },
      },
      {
        label: { fr: 'Officielle ou reconstruite', en: 'Official or reconstructed' },
        detail: {
          fr: 'Un ✓ marque une vraie image de circulaire; un ≈ marque une reconstruction. Pour la vraie page complète, le lien Flipp s’ouvre à part.',
          en: 'A ✓ marks a real flyer image; a ≈ marks a reconstruction. For the full real page, the Flipp link opens separately.',
        },
      },
      {
        label: { fr: 'Trouver l’article sur la page', en: 'Find the item on the page' },
        detail: {
          fr: 'Le rabais indique sa page et sa position (haut/milieu/bas, gauche/centre/droite); feuillette les articles avec ‹ ›, et touche une image pour l’agrandir.',
          en: 'A deal shows its page and position (top/middle/bottom, left/centre/right); step through items with ‹ ›, and tap an image to zoom.',
        },
      },
    ],
  },
  {
    id: 'undo',
    icon: '↩️',
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
      },
      {
        label: { fr: 'Un à la fois', en: 'One at a time' },
        detail: {
          fr: 'Lancer une nouvelle annulation valide la précédente — pas de pile d’annulations à gérer.',
          en: 'Starting a new undo commits the previous one — no stack of undos to manage.',
        },
      },
    ],
  },
  {
    id: 'account',
    icon: '🔑',
    group: 'concepts',
    title: { fr: 'Compte & connexion', en: 'Account & sign-in' },
    what: {
      fr: 'L’opérateur (le parent) crée une maisonnée et s’y connecte. La tablette, elle, n’a pas de compte — elle se jumelle (voir Jumelage).',
      en: 'The operator (the parent) creates a household and signs in. The tablet has no account — it pairs instead (see Pairing).',
    },
    points: [
      {
        label: { fr: 'Créer ta maisonnée', en: 'Create your household' },
        detail: {
          fr: 'L’inscription crée la maisonnée et t’amène direct à « La maisonnée » pour ajouter les personnes. Une maisonnée par courriel.',
          en: 'Signup creates the household and lands you in “Household” to add people. One household per email.',
        },
      },
      {
        label: { fr: 'Mot de passe', en: 'Password' },
        detail: {
          fr: 'Minimum 8 caractères, avec un petit compteur « N/8 » qui se coche quand c’est bon.',
          en: 'At least 8 characters, with a small “N/8” counter that ticks when it’s enough.',
        },
      },
      {
        label: { fr: 'Code d’invitation', en: 'Invite code' },
        detail: {
          fr: 'Si le déploiement est protégé, l’inscription et la connexion demandent en plus un code partagé — pour garder l’instance privée.',
          en: 'If the deployment is gated, signup and sign-in also ask for a shared code — to keep the instance private.',
        },
      },
    ],
  },

  // ── Settings, tab by tab (the Réglages reference) ─────────────────────────
  {
    id: 'set-household',
    icon: '👪',
    group: 'settings',
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
      },
      {
        label: { fr: 'Marquer « enfant »', en: 'Mark as “child”' },
        detail: {
          fr: 'Coche la case enfant : la personne peut alors avoir des routines en images.',
          en: 'Tick the child box: that person can then have picture routines.',
        },
      },
      {
        label: { fr: 'Photo de visage', en: 'Face photo' },
        detail: {
          fr: 'Touche 📷 pour prendre/choisir une photo (redimensionnée petite). Le ✕ la retire.',
          en: 'Tap 📷 to take/pick a photo (resized small). The ✕ removes it.',
        },
      },
      {
        label: { fr: 'Couleur', en: 'Colour' },
        detail: {
          fr: 'La couleur sert de code partout : événements, corvées, pastille de visage.',
          en: 'The colour is a code everywhere: events, chores, face dot.',
        },
      },
    ],
  },
  {
    id: 'set-agenda',
    icon: '📅',
    group: 'settings',
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
      },
      {
        label: { fr: 'Assigner à une personne', en: 'Assign to a person' },
        detail: {
          fr: 'Relie l’événement à un membre; sa couleur apparaît à côté sur le babillard.',
          en: 'Link the event to a member; their colour shows beside it on the board.',
        },
      },
      {
        label: { fr: 'Récurrent (🔁)', en: 'Recurring (🔁)' },
        detail: {
          fr: 'Un événement qui revient (chaque jour/semaine/mois) porte le 🔁 dans la liste.',
          en: 'An event that repeats (daily/weekly/monthly) carries the 🔁 in the list.',
        },
      },
    ],
  },
  {
    id: 'set-chores',
    icon: '🧹',
    group: 'settings',
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
      },
      {
        label: { fr: 'Donner un horaire', en: 'Give it a schedule' },
        detail: {
          fr: 'Le bouton « Céduler » ouvre la récurrence — tous les N jours/semaines/mois, et pour « semaine » le choix des jours (D L M M J V S) — plus une date de départ, sans recréer la corvée.',
          en: 'The “Schedule” button opens the recurrence — every N days/weeks/months, and for “weekly” a choice of days (S M T W T F S) — plus a start date, without recreating the chore.',
        },
      },
      {
        label: { fr: 'Effacer un horaire', en: 'Clear a schedule' },
        detail: {
          fr: 'Remets la récurrence à « Jamais » et la corvée redevient ponctuelle.',
          en: 'Set the recurrence back to “Never” and the chore becomes one-off again.',
        },
      },
    ],
  },
  {
    id: 'set-routines',
    icon: '🧸',
    group: 'settings',
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
          fr: 'La pastille fait défiler : n’importe quand → 🌅 matin → ☀️ après-midi → 🌙 soir. Ça ordonne les routines pour l’enfant.',
          en: 'The chip cycles: anytime → 🌅 morning → ☀️ afternoon → 🌙 evening. It orders the routines for the child.',
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
    icon: '🛍️',
    group: 'settings',
    title: { fr: 'Magasinage', en: 'Shopping' },
    what: {
      fr: 'Tout ce qui alimente les rabais et l’ajout rapide : ton code postal, les magasins à garder, et l’historique d’achats.',
      en: 'Everything feeding deals and quick-add: your postal code, which stores to keep, and the purchase history.',
    },
    points: [
      {
        label: { fr: 'Code postal', en: 'Postal code' },
        detail: {
          fr: 'Mets-le une fois : il dit aux circulaires où chercher les rabais près de chez toi.',
          en: 'Set it once: it tells the flyers where to look for deals near you.',
        },
      },
      {
        label: { fr: 'Filtre de magasins', en: 'Store filter' },
        detail: {
          fr: 'Garde seulement les magasins où tu vas. Ceux que tu retires ne reviennent plus dans les rabais. Rien de coché = tous gardés.',
          en: 'Keep only the stores you shop. Ones you drop never come back in deals. Nothing ticked = all kept.',
        },
      },
      {
        label: { fr: 'Historique', en: 'History' },
        detail: {
          fr: 'Ce que l’ajout rapide te propose. Tu peux renommer une entrée vers son nom générique ou la supprimer.',
          en: 'What quick-add suggests. You can rename an entry to its generic name or remove it.',
        },
      },
    ],
  },
  {
    id: 'set-recipes',
    icon: '🏷️',
    group: 'settings',
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
      },
      {
        label: { fr: 'Renommer partout', en: 'Rename everywhere' },
        detail: {
          fr: 'Renomme une étiquette une fois et toutes les recettes qui la portent suivent — fini « Végé / végé / vege ».',
          en: 'Rename a tag once and every recipe carrying it follows — no more “Veggie / veggie / vege”.',
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
    id: 'set-ghost',
    icon: '👻',
    group: 'settings',
    title: { fr: 'Suggestions (ghost)', en: 'Suggestions (ghost)' },
    what: {
      fr: 'Le réglage du suivi d’achats opt-in. Tu choisis quoi suivre et à quelle fréquence; ça nourrit l’ajout rapide.',
      en: 'The opt-in purchase-tracking setup. You choose what to track and how often; it powers quick-add.',
    },
    points: [
      {
        label: { fr: 'Suivre un article', en: 'Track an item' },
        detail: {
          fr: 'Les achats fréquents apparaissent en suggestions ＋ « le suivre ? ». Un tap, jamais automatique.',
          en: 'Frequent buys show as ＋ “track it?” suggestions. One tap, never automatic.',
        },
      },
      {
        label: { fr: 'Fréquence (jours)', en: 'Cadence (days)' },
        detail: {
          fr: 'Règle « tous les N jours » pour chaque article — quand le rappeler pour la liste.',
          en: 'Set “every N days” per item — when to nudge it back onto the list.',
        },
      },
      {
        label: { fr: 'Mettre en sourdine / retirer', en: 'Mute / remove' },
        detail: {
          fr: 'Mets un article en sourdine sans le supprimer, ou retire ceux que tu as ajoutés à la main.',
          en: 'Mute an item without deleting it, or remove the ones you added by hand.',
        },
      },
    ],
  },
  {
    id: 'set-devices',
    icon: '📱',
    group: 'settings',
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
          fr: 'Un tap retire l’accès (annulable par le bandeau d’annulation). La tablette devra se re-jumeler.',
          en: 'One tap removes access (undoable via the undo toast). The tablet will have to re-pair.',
        },
      },
    ],
  },
  {
    id: 'set-photos',
    icon: '🖼️',
    group: 'settings',
    title: { fr: 'Photos', en: 'Photos' },
    what: {
      fr: 'Les photos de famille qui dérivent doucement sur le babillard. Téléverse-les depuis ton téléphone.',
      en: 'The family photos that gently drift across the board. Upload them from your phone.',
    },
    points: [
      {
        label: { fr: 'Ajouter plusieurs photos', en: 'Add several photos' },
        detail: {
          fr: 'Choisis-en une ou plusieurs d’un coup; elles sont redimensionnées petites avant l’envoi (un compteur « 2/5 » suit le lot).',
          en: 'Pick one or many at once; they’re resized small before upload (a “2/5” counter tracks the batch).',
        },
      },
      {
        label: { fr: 'Retirer', en: 'Remove' },
        detail: {
          fr: 'Le ✕ sur une vignette l’enlève. Le nombre total est plafonné côté serveur, alors ça reste gratuit.',
          en: 'The ✕ on a thumbnail removes it. The total is capped server-side, so it stays free.',
        },
      },
      {
        label: { fr: 'Peut être absent', en: 'May be hidden' },
        detail: {
          fr: 'Si le stockage photo (R2) n’est pas branché, cet onglet se cache tout seul.',
          en: 'If photo storage (R2) isn’t wired up, this tab hides itself.',
        },
      },
    ],
  },
  {
    id: 'set-recap',
    icon: '📝',
    group: 'settings',
    title: { fr: 'Récapitulatif', en: 'Recap' },
    what: {
      fr: 'Un petit bilan calme de la semaine, écrit par l’IA — sur demande seulement. Un bouton, jamais un fil sans fin.',
      en: 'A small, calm weekly reflection, written by AI — on demand only. A button, never an endless feed.',
    },
    points: [
      {
        label: { fr: 'Sur demande', en: 'On demand' },
        detail: {
          fr: 'Touche le bouton quand ça te tente; rien ne se génère tout seul, rien ne te relance.',
          en: 'Tap the button when you feel like it; nothing generates on its own, nothing nags you.',
        },
      },
      {
        label: { fr: 'Peut être absent', en: 'May be hidden' },
        detail: {
          fr: 'Si l’IA est hors ligne, l’onglet disparaît plutôt que d’afficher un bouton mort.',
          en: 'If AI is offline, the tab disappears rather than show a dead button.',
        },
      },
    ],
  },
  {
    id: 'set-display',
    icon: '🎨',
    group: 'settings',
    title: { fr: 'Affichage', en: 'Display' },
    what: {
      fr: 'L’apparence de cet appareil : le thème jour/nuit, la langue, et la vue parent/enfant.',
      en: 'How this device looks: the day/night theme, the language, and the parent/kid view.',
    },
    points: [
      {
        label: { fr: 'Thème jour / nuit', en: 'Day / night theme' },
        detail: {
          fr: 'Bascule entre ☀️ jour et 🌙 nuit pour la lisibilité selon l’heure.',
          en: 'Toggle between ☀️ day and 🌙 night for readability by time of day.',
        },
      },
      {
        label: { fr: 'Langue', en: 'Language' },
        detail: {
          fr: 'Français ou anglais. Le réglage suit cet appareil.',
          en: 'French or English. The setting follows this device.',
        },
      },
      {
        label: { fr: 'Vue parent / enfant', en: 'Parent / kid view' },
        detail: {
          fr: 'Passe en vue enfant d’ici. Rappel : pour ressortir, garde le doigt dans le coin haut-gauche (voir « Vue parent ou enfant »).',
          en: 'Switch to kid view here. Reminder: to get back out, hold the top-left corner (see “Parent or kid view”).',
        },
      },
    ],
  },
  {
    id: 'set-calm',
    icon: '🌿',
    group: 'settings',
    title: { fr: 'Mode calme', en: 'Calm mode' },
    what: {
      fr: 'Le seul réglage « anti-friction » : adoucir le « refaire » de la routine d’enfant. Activé par défaut.',
      en: 'The one “anti-friction” toggle: soften the kid routine’s “redo”. On by default.',
    },
    points: [
      {
        label: { fr: 'Ce que ça change', en: 'What it changes' },
        detail: {
          fr: 'Quand c’est activé, la routine ne pousse pas l’enfant à tout recommencer — elle se termine, calme.',
          en: 'When on, the routine doesn’t push the child to start over — it just ends, calmly.',
        },
      },
      {
        label: { fr: 'Ce que ça ne touche pas', en: 'What it never touches' },
        detail: {
          fr: 'Pas de points, pas de notifications, pas d’inventaire : ces garanties sont verrouillées, pas ajustables.',
          en: 'No points, no notifications, no inventory: those guarantees are locked, not adjustable.',
        },
      },
    ],
  },
  {
    id: 'set-ailog',
    icon: '🩹',
    group: 'settings',
    title: { fr: 'Journal IA', en: 'AI log' },
    what: {
      fr: 'Un carnet d’entretien : quand une fonction IA échoue (modèle retiré, panne), la note acceptée à l’écran s’inscrit ici.',
      en: 'A maintenance log: when an AI feature fails (retired model, outage), the note you accepted on-screen lands here.',
    },
    points: [
      {
        label: { fr: 'À quoi ça sert', en: 'What it’s for' },
        detail: {
          fr: 'Voir ce qui a brisé et quand, pour comprendre une fonction IA qui ne répond plus.',
          en: 'See what broke and when, to make sense of an AI feature that stopped responding.',
        },
      },
      {
        label: { fr: 'Pas une métrique', en: 'Not a metric' },
        detail: {
          fr: 'Aucun compteur à surveiller : touche « Effacer » quand tu l’as lu, et c’est vide.',
          en: 'No counter to watch: tap “Clear” once you’ve read it, and it’s empty.',
        },
      },
    ],
  },
]
