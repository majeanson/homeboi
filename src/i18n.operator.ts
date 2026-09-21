import { useEffect, useState } from 'react'
import { useLang } from './i18n'

// RÉGLAGES' OWN COPY, OUT OF THE BOOT PATH.
//
// This namespace is 703 lines — 21% of the French dictionary — and every word of it
// belongs to ONE lazily-code-split route (/settings). It was being parsed before first
// paint on a wall tablet that may never open Réglages at all.
//
// It left because the eager `i18n-*.js` chunk hit its 130 KB cap with 16 bytes to
// spare (« Les remarques » spent the last of it), and the honest answer to a full budget
// is to take something out, never to raise the number. scripts/check-bundle.mjs said so
// in writing before this was done; this is that note being cashed.
//
// HOW IT STAYS OUT. Nothing here is imported by src/i18n.ts — the arrow points the other
// way. The only importers are the Réglages tree, which the router already loads lazily,
// so the bundler puts this copy in that chunk without anyone asking it to.
//
// THE ENGLISH HALF MIRRORS useT() EXACTLY: French first so the first frame never waits,
// then a dynamic import swaps in EN. A caller therefore always gets a dictionary and
// never a loading state: `useOperatorT()` has the same contract as `useT()`, one
// namespace down.
export const FR_OPERATOR = {
  members: 'La maisonnée',
  householdName: 'Nom de la maisonnée',
  householdNameHint: 'Le nom de ta famille / maisonnée, affiché un peu partout.',
  welcomeTitle: 'Bienvenue ! Trois petites étapes :',
  welcomeStep1: 'Ajoute les personnes de ta maisonnée, juste en bas.',
  welcomeStep2: 'Jumelle la tablette du mur (Réglages ▸ Système ▸ Appareils & accès).',
  welcomeStep3: 'Ouvre le babillard.',
  welcomeBoard: 'Voir le babillard',
  addMember: 'Ajouter une personne',
  name: 'Nom',
  isChild: 'Enfant',
  companion: 'Compagnon de routine',
  memberEmail: 'Courriel',
  memberPhone: 'Téléphone',
  memberBirthday: 'Anniversaire',
  memberNotes: 'Notes',
  devices: 'Tablettes jumelées',
  revoke: 'Révoquer',
  noDevices: 'Aucune tablette jumelée.',
  // « La maison, adressable » — le serveur MCP (functions/api/mcp.ts).
  agentTitle: 'Agent IA (MCP)',
  agentLead:
    'Donne à Claude — ou à un autre agent — une fenêtre en LECTURE SEULE sur la maisonnée : les repas, la liste, le calendrier, les recettes. Rien ne peut être modifié d’ici.',
  agentMint: 'Créer un jeton',
  agentLabel: 'Agent MCP',
  agentOnce:
    'Le jeton n’est montré qu’une fois. Copie la commande, colle-la dans ton terminal. Tu peux le révoquer en tout temps dans la liste ci-dessus.',
  agentCopy: 'Copier la commande',
  agentCopied: 'Copié',
  agentKindAgent: 'agent',
  agentKindDisplay: 'écran',
  chores: 'Corvées',
  addChore: 'Ajouter une corvée',
  schedule: 'Céduler',
  routines: 'Routines (mode enfant)',
  addRoutine: 'Créer une routine',
  routineName: 'Nom de la routine',
  editMember: 'Modifier la personne',
  detailInCercle: 'Fiche complète dans Maison ▸ Famille',
  detailInCercleHint: 'Coordonnées, anniversaire, genre et liens familiaux y vivent.',
  deleteMember: 'Supprimer la personne',
  deleteMemberConfirm: (name: string) =>
    `Supprimer « ${name} » de la maisonnée ? Ses routines seront aussi effacées; les rendez-vous et corvées resteront, sans personne d’assigné.`,
  editChore: 'Modifier la corvée',
  deleteChore: 'Supprimer la corvée',
  ledgerTitle: 'Qui a fait quoi cette semaine ?',
  ledgerHint: 'Un simple coup d’œil pour replacer les tours — pas un pointage.',
  ledgerEmpty: 'Rien de noté pour l’instant. Ça se remplira tout seul.',
  ledgerDoneBy: 'Fait par',
  ledgerHelpedBy: 'Aidé par',
  ledgerHelperChild: 'Un coup de main',
  // « La maison cette année » (B-8, bmad/09) — the house's diary read view.
  diaryTab: 'Cette année',
  diaryTitle: 'La maison cette année',
  diaryHint:
    'Ce que la maison a vécu, mois par mois — les soins notés, les corvées faites, les voyages terminés, les dessins gardés. Des noms et des dates, jamais des comptes.',
  diaryEmpty: 'L’année s’écrira ici, un moment à la fois.',
  diaryDrawing: 'Un dessin gardé',
  editRoutine: 'Modifier la routine',
  deleteRoutine: 'Supprimer la routine',
  noRoutines: 'Aucune routine encore. Crée-en une avec le ＋ — « Matin », « Dodo » — et ton enfant la suivra seul, en images.',
  editEvent: 'Modifier le rendez-vous',
  deleteEvent: 'Supprimer le rendez-vous',
  renameDevice: 'Renommer la tablette',
  colorLabel: 'Couleur',
  colourTaken: 'déjà utilisée',
  sections: 'Sections',
  jumpAria: 'Sections de cette page',
  // The themed Réglages tabs (one per hub section, same wording as the nav —
  // board/liste/cercle/routines reuse t.nav.* directly) + the Découvrir entry
  // tab and the per-tab « Comprendre / Régler » lens toggle.
  secDiscover: 'Découvrir',
  secKitchen: 'La cuisine',
  secBoard: 'Le babillard',
  secSystem: 'Système',
  // C-15 — kitchen's three colour subs (étiquettes/pastilles/mesures) folded
  // into ONE « Apparence » sub (standing rule: a new setting merges into an
  // existing sub, never a new pill).
  kitchenLookTitle: 'Apparence',
  lensLearn: 'Comprendre',
  lensSet: 'Régler',
  lensAria: 'Comprendre ou régler',
  kioskNotice:
    'Tablette jumelée : tu peux ajuster la plupart des réglages ici. Ajouter quelqu’un ou jumeler une tablette se fait avec le compte parent (connexion sur un téléphone).',
  // A read-only guest (la démo) reaches Réglages for the guide + this device's own
  // display. Say what IS theirs rather than what isn't — they can't sign in anyway.
  guestNotice:
    'Lecture seule : tu peux lire le guide et régler l’affichage de cet appareil. Rien de ça ne change quoi que ce soit pour la maisonnée.',
  kioskSignIn: 'Se connecter avec le compte parent',
  needChild: 'Ajoute d’abord un enfant (coche « Enfant »).',
  forWho: 'Pour qui :',
  tplStart: 'Modèle :',
  choreCommon: 'Courantes :',
  choreStart: 'À partir du',
  // D-21 (bmad/10) « Sortir le bac » — opt-in per-chore evening announce (only
  // meaningful with a schedule; sits right under LeadPicker in the same form).
  announceEveningLabel: 'Annoncer la veille au soir',
  announceEveningHint: 'Le babillard affichera une ligne calme le soir d’avant (« Ce soir » — pas une notification).',
  // Projets & Entretien — the longer-horizon home work under Corvées (#home-projects).
  home: {
    subCorvees: 'Corvées',
    subProjets: 'Projets',
    subEntretien: 'Entretien',
    projetsTitle: 'Projets de la maison',
    entretienTitle: 'Entretien',
    addProjet: 'Ajouter un projet',
    addEntretien: 'Ajouter un entretien',
    // A-4 (bmad/09) — les rituels de saison offerts (pneus, gouttières, abris).
    seedsTitle: 'Idées de saison',
    // « comme n'importe quelle tâche » disait le mot d'une AUTRE chose : la section
    // ajoute des entretiens, et « tâche » est la forme perdante de « corvée ». Dit
    // sans répéter « entretien » deux fois dans la même phrase (UNIFY, 2026-09-09).
    seedsHint: 'Les grands rituels d’ici, prêts à ajouter — un toucher les met dans l’Entretien, comme si tu l’avais inscrit toi-même. Le ✕ les cache pour de bon.',
    seedDismiss: 'Cacher cette idée',
    editProjet: 'Modifier le projet',
    deleteProjet: 'Supprimer le projet',
    editEntretien: 'Modifier l’entretien',
    deleteEntretien: 'Supprimer l’entretien',
    emptyProjets: 'Aucun projet. Un projet, c’est un chantier avec une date — « Repeindre la chambre ». Ajoute-le avec le bouton ci-dessus.',
    emptyEntretien: 'Aucun entretien. Ajoute ce qui revient — « Changer le filtre » — ou touche une idée de saison plus haut.',
    budgetLabel: 'Budget visé',
    budgetPlaceholder: 'ex. 15 000',
    notesLabel: 'Notes',
    notesPlaceholder: 'Détails, devis, à déléguer…',
    dateLabel: 'Date (optionnel)',
    // « À partir de la dernière fois » (recur_from='done', mig 0119) — the cycle
    // re-anchors on the last check-off instead of the fixed date grid.
    fromLastDone: 'À partir de la dernière fois',
    fromLastDoneHint: 'La prochaine échéance se compte depuis la dernière coche, pas depuis la date fixe.',
    fromLastDoneShort: 'depuis la dernière fois',
    snoozedUntil: (d: string) => `Reporté au ${d}`,
    // Seasonal cadence presets (upkeep form) — one tap fills date + recurrence.
    seasonLabel: 'Rythmes de saison :',
    everySeason: 'Chaque saison',
    everySpring: 'Chaque printemps',
    everySummer: 'Chaque été',
    everyAutumn: 'Chaque automne',
    everyWinter: 'Chaque hiver',
    common: 'Courants :',
    done: 'Fait',
    // The ＋ « Corvées » sub-choice prompt (board AddSheet): chore vs the two
    // home-project kinds.
    pickKind: 'Corvée, entretien ou projet ?',
  },
  cardWord: 'mot',
  addCard: 'carte',
  emojiPick: 'Changer l’emoji',
  moveUp: 'Monter',
  moveDown: 'Descendre',
  removeCard: 'Retirer la carte',
  dragHint: 'Glisser pour réordonner',
  display: 'Affichage',
  displayHint: 'Le thème, la langue et la vue.',
  // Customizable measuring-tool colours (Cook-mode pills + scoop circles).
  measureColorsTitle: 'Couleurs des mesures',
  measureColorsHint:
    'Donne à chaque cuillère et tasse la couleur de tes vrais ustensiles. Les pastilles et les pastilles-pleines des recettes suivent.',
  measureColorsReset: 'Couleurs d’origine',
  measureColorsPreview: 'Aperçu',
  themeLabel: 'Thème',
  themeDay: 'Jour',
  themeNight: 'Nuit',
  themeFollowsTime: 'Suit l’heure : passe au mode nuit le soir venu.',
  ambientLabel: 'Ambiance du jour',
  ambientOn: 'Suit la journée',
  ambientOff: 'Couleurs fixes',
  apodLabel: 'Photo du jour',
  apodHint: 'Une photo de la NASA, différente chaque jour, au bas du babillard. N’affecte que cet appareil.',
  apodOn: 'Affichée',
  apodOff: 'Cachée',
  canvasLabel: 'Ambiance vivante',
  canvasHint: 'Un fond discret qui suit la saison, la météo et l’heure (une teinte douce, un peu de neige l’hiver). N’affecte que cet appareil.',
  canvasOn: 'Activée',
  canvasOff: 'Éteinte',
  keepAwakeLabel: 'Garder l’écran allumé',
  keepAwakeOn: 'Allumé',
  keepAwakeOff: 'Veille normale',
  keepAwakeHint: 'Garde cet écran allumé tant que le babillard est affiché — pour la tablette du mur. Sur un téléphone, laisse la veille normale.',
  // « Diffuser au salon » — un lien TV (lecture seule) pour montrer le babillard sur
  // le téléviseur via Chromecast (diffuser l’onglet depuis Chrome sur l’ordinateur).
  castTitle: 'Diffuser au salon',
  castIntro:
    'Montre le babillard, en lecture seule, sur la télé du salon. Choisis l’écran, crée le lien, puis ouvre-le sur la télé.',
  // Which TV face the link shows — the full board, the ambient screensaver, or the
  // visitor welcome window. Mirrors the per-kind picker on the phone-link side.
  castSceneLabel: 'Écran',
  castSceneBoard: 'Le babillard',
  castSceneAmbient: 'L’ambiance — horloge & photos',
  castSceneWelcome: 'L’accueil — wifi & consignes',
  castSceneHint: {
    board: 'Le babillard complet, en lecture seule. Écran permanent — révocable depuis Réglages ▸ Système ▸ Appareils & accès.',
    ambient:
      'L’écran de veille : grande horloge, date et cadre photo qui défile. Écran permanent — révocable depuis Réglages ▸ Système ▸ Appareils & accès.',
    welcome:
      'La fenêtre d’accueil pour les visiteurs : wifi, jour des poubelles et consignes. Lien temporaire (24 h).',
  },
  // Label given to a permanent TV (a read-only 'display' device) in the devices list.
  castDisplayLabel: 'Téléviseur du salon',
  castGenerate: 'Générer le lien TV',
  // The short /tv/<code> link — the one to actually type on a TV remote.
  castShortReady: 'Lien court — tape-le dans le navigateur du téléviseur (facile à la télécommande) :',
  castShortLink: 'Lien TV court',
  castShortHint: 'Tape ce lien une fois sur la télé, puis garde-le en favori. Pour le révoquer : Réglages ▸ Système ▸ Appareils & accès.',
  castFullLink: 'Lien complet (à copier-coller) :',
  castReady: 'Lien TV prêt — ouvre-le dans le navigateur du téléviseur, ou diffuse-le depuis Chrome :',
  castStep1: 'Ouvre ce lien dans Google Chrome sur l’ordinateur.',
  castStep2: 'Menu ⋮ ▸ Caster… ▸ choisis le Chromecast.',
  castStep3: 'Sources ▸ « Caster l’onglet » — le babillard s’affiche au salon.',
  castCaveat:
    'Diffusé depuis Chrome, l’ordinateur doit rester allumé ; ouvert sur la télé, non. Le lien reste actif jusqu’à ce que tu le révoques ici.',
  // Stage 2 — le bouton « Diffuser maintenant » (Chrome seulement) lance le récepteur.
  castNow: 'Diffuser maintenant',
  castNowBusy: 'Diffusion…',
  castNowHint: 'Diffuse directement depuis Chrome sur cet ordinateur, sans copier le lien.',
  castFailed: 'La diffusion n’a pas pu démarrer. Choisis le Chromecast, ou utilise le lien ci-dessous.',
  // Lecture des recettes photo : moteur sur l’appareil vs nuage haute précision.
  ocrLabel: 'Lecture des photos de recette',
  ocrDevice: 'Sur l’appareil',
  ocrCloud: 'Haute précision',
  ocrDeviceHint: 'Lecture gratuite et privée, directement sur l’appareil — rien n’est envoyé ailleurs. Idéal pour le texte imprimé.',
  ocrCloudHint: 'Lecture par le nuage (Mistral), bien meilleure sur les petits chiffres. La photo est envoyée pour être lue — gratuit à l’essai, puis moins d’un sou par recette.',
  // « Disposition du babillard » — per-device show/hide + reorder of the Grille cards.
  boardLayout: 'Disposition du babillard',
  boardLayoutHint: 'Choisis quelles cartes afficher, leur largeur et leur ordre — propre à cet appareil. Glisse une poignée pour réordonner, ou même pour déplacer une carte d’un groupe à l’autre.',
  boardLayoutReset: 'Réinitialiser',
  // Shared by every « Réinitialiser » / « par défaut » button that discards
  // customization in one tap (disposition, allées, repas, couleurs) — added
  // 2026-09-03 after an audit found these sharing the undo icon with genuine
  // undo, with no confirm behind any of them (STATE.md's predictability entry).
  resetConfirm: 'Effacer tes changements et remettre la disposition de départ ? Les cartes cachées reviennent.',
  boardLayoutBand: 'Bandeau du haut',
  boardLayoutGrid: 'Cartes',
  // Drop target at the end of a group, so a card can be moved into an emptied one.
  boardLayoutDropHere: 'Déposer ici',
  // The per-card width. `boardLayoutSizeN` names it for a screen reader.
  boardLayoutSize: (card: string) => `Largeur de « ${card} »`,
  boardLayoutSizeN: (n: number) => (n === 1 ? '1 colonne' : `${n} colonnes`),
  boardLayoutSizeFull: 'Pleine largeur',
  // The tri-state: what an EMPTY card does. Cycles always → auto → never.
  boardLayoutMode: (card: string) => `« ${card} » quand la carte est vide`,
  boardLayoutModeAlways: 'Toujours',
  boardLayoutModeAuto: 'Si non vide',
  boardLayoutModeNever: 'Jamais',
  a11yTitle: 'Accessibilité',
  a11yHint:
    'Contraste renforcé et plus gros texte, pour mieux voir de loin ou de plus près. N’affecte que cet appareil.',
  contrastLabel: 'Contraste',
  contrastNormal: 'Normal',
  contrastHigh: 'Renforcé',
  textScaleLabel: 'Texte',
  // Clés par VALEUR (lib/accessibility TextScale), pour que le contrôle se mappe
  // sur TEXT_SCALES au lieu de nommer chaque option à la main.
  textScale: { normal: 'Normal', large: 'Plus gros', 'x-large': 'Très gros' },
  langLabel: 'Langue',
  viewLabel: 'Vue',
  voiceTitle: 'Voix de lecture',
  voiceHint: 'La voix qui lit les routines et les cartes à voix haute. Tout reste sur l’appareil ; rien n’est envoyé en ligne.',
  voiceLabel: 'Voix',
  readLangLabel: 'Langue de lecture',
  voiceAuto: 'Automatique (meilleure voix)',
  voiceTest: 'Tester la voix',
  voiceSpeedLabel: 'Vitesse',
  // Tap-to-hear (bmad/08 A-2) — the long-press-to-speak pref, per appareil.
  tapToHearLabel: 'Toucher pour entendre',
  tapToHearHint: 'En vue Enfant ou Simple : garde le doigt une demi-seconde sur une ligne pour l’entendre à voix haute.',
  voiceNone: 'Aucune voix « Français (Canada) » n’est installée sur cet appareil. Ajoute-en une dans les réglages du système pour entendre la lecture.',
  voiceNoneLang: 'Aucune voix pour cette langue sur cet appareil. Ajoute-en une dans les réglages de l’appareil (Accessibilité ▸ Contenu énoncé). Sur iPad et iPhone, seules les voix de base sont offertes ici.',
  tutorialTitle: 'Aide contextuelle',
  tutorialHint: 'Les petits « ? » près des sections ouvrent le guide à la bonne page. Passe en mode expert pour les masquer.',
  tutorialLabel: 'Mode',
  tutorialOn: 'Tutoriel',
  tutorialOff: 'Expert',
  calmTitle: 'Mode calme',
  calmHint:
    'Allumé : la routine se termine sans récompense. Éteint : l’enfant colle en plus un autocollant sur son mur. Rien d’autre ne change — jamais de points ni de notifications.',
  calmOn: 'Activé',
  calmOff: 'Désactivé',
  aiOn: 'IA : active',
  aiOff: 'IA indisponible',
  aiTab: 'IA',
  aiTitle: 'Intelligence artificielle',
  aiDisabled: 'IA : désactivée',
  aiSaving: 'Enregistrement…',
  aiUnavailableHint: 'Aucune IA n’est configurée sur ce déploiement — il n’y a rien à activer ici.',
  aiToggleHintOn: 'L’IA est active. Touche pour la couper pour toute la maisonnée.',
  aiToggleHintOff:
    'L’IA est coupée. Les fonctions IA sont masquées et rien n’est envoyé pour analyse. Touche pour la réactiver.',
  aiToggleTitle: 'Allumer / éteindre l’IA',
  aiLearnMore: 'En savoir plus sur l’IA',
  shopping: 'Magasinage',
  shopHint: 'Ton code postal sert à trouver les circulaires près de chez toi (preuve de prix à la caisse).',
  postalLabel: 'Code postal',
  postalPlaceholder: 'H2X 1Y4',
  postalSaved: 'Enregistré.',
  postalBad: 'Code postal invalide.',
  // The Flipp APP's language (2026-09-11): Flipp publishes each flyer once per
  // language with different ids; its app only recognizes a clipping from its own.
  flippLangLabel: 'Langue de ton app Flipp',
  flippLangHint: 'Flipp existe en français et en anglais, et ses rabais n’ont pas les mêmes numéros dans les deux. Mets la langue de ton app Flipp — sinon elle affiche tes rabais « non disponibles ».',
  flippLangFr: 'Français',
  flippLangEn: 'English',
  flippLangRestaging: 'Langue enregistrée — je rebascule les rabais de ta liste…',
  flippLangSaved: (found: number, dropped: number) =>
    `Langue Flipp enregistrée · ${found} rabais rebasculé${found > 1 ? 's' : ''}${dropped ? ` · ${dropped} sans rabais cette semaine` : ''}`,
  storeFilter: 'Mes magasins',
  // Réglages ▸ La liste ▸ Magasinage ▸ « Ma liste Flipp » — the one-time bookmark.
  flippTitle: 'Ma liste Flipp',
  // LE MODE D'EMPLOI, réécrit le 2026-09-12 : un geste par étape, chaque bouton
  // nommé avec les mots exacts qu'il porte à l'écran, et les quatre verbes tenus —
  // MONTRER (à la caisse) · ENVOYER (vers Flipp) · RAPPORTER (vers Babillard) ·
  // VIDER. Avant, la même idée se disait « Ma liste → Flipp », « Copier pour
  // Flipp », « Coller ma liste Babillard » et « Envoyer à Flipp » selon l'écran,
  // et l'étape 1 envoyait encore à la caisse, où ces portes ne sont plus.
  flippIntro: 'Babillard garde ta liste ; Flipp montre les rabais en photo. Pour que les deux disent la même chose : une mise en place une fois, puis deux taps ici et deux dans Safari à chaque épicerie.',
  flippOnceTitle: 'Une seule fois',
  // Le même bloc, une fois que CET appareil a copié le signet. « Refaire » et non
  // « fait » : on a vu le tap sur Copier, jamais le signet posé dans Safari.
  flippRedoTitle: 'Refaire la mise en place',
  flippOnce0: 'Choisis la langue de ton app Flipp, juste au-dessus — sinon Flipp affiche tes rabais comme « non disponibles ».',
  flippOnce1: 'Touche « Copier le signet », plus bas.',
  flippOnce2: 'Ouvre Safari, va sur flipp.com et connecte-toi (l’icône de personne, en haut à droite) — le même compte que ton app Flipp.',
  flippOnce3: 'Toujours sur flipp.com : Partage ▸ « Ajouter un signet ». Nomme-le « Coller de Babillard ».',
  flippOnce4: 'Signets ▸ Modifier ▸ « Coller de Babillard » ▸ remplace l’adresse par ce que tu as copié. C’est fait pour toujours.',
  flippEachTitle: 'À chaque épicerie',
  flippEach1: 'Dans La liste, touche « Ma liste Flipp ».',
  flippEach2: 'Touche « Envoyer ma liste ». Safari s’ouvre sur flipp.com, ta liste voyage dans l’adresse.',
  flippEach3: 'Lance le signet « Coller de Babillard », puis « Remplacer ma liste Flipp ». Rien à coller : il trouve ta liste tout seul.',
  flippEach4: 'C’est fait : tes rabais sont dans ton compte Flipp, avec leur photo, par magasin. L’app Flipp la montre — quitte-la et rouvre-la si elle tarde.',
  flippWhat: 'Ce qui part : ce qu’il te reste à acheter. Les lignes cochées restent ici. Les rabais voyagent avec leur photo, le reste en articles écrits.',
  flippWords: 'Pas de signet sous la main ? « Envoyer sans les rabais » envoie les mêmes lignes en texte, droit dans l’app Flipp — mais sans les photos.',
  flippDealsOnly: '« Les rabais seulement » envoie les aubaines de la semaine sans y déverser le reste de l’épicerie.',
  // The way back, and the other phones.
  flippBackTitle: 'De Flipp vers Babillard',
  flippBack1: 'Sur flipp.com, lance le signet ▸ « Rapporter Flipp → Babillard » : Babillard s’ouvre et te montre ce qui changerait avant d’écrire.',
  // Every convenience the phone offers (Marc, 2026-09-11: « clear up all we can do for
  // convenience in the how to »). Folded: read once, then muscle memory.
  flippTipsTitle: 'Plus pratique',
  flippTip1: 'Mets « Coller de Babillard » dans tes Favoris Safari : sur flipp.com, touche la barre d’adresse, il est là — un tap.',
  flippTip2: 'Ou tape « Coller » dans la barre d’adresse : Safari le propose.',
  flippTip3: 'Lancé ailleurs que depuis Babillard, le signet propose « Coller ma liste Babillard » (Safari demande la permission de coller : accepte), « Vider ma liste Flipp » et « Rapporter Flipp → Babillard ».',
  flippTip4: 'Si l’app Flipp marque tes rabais « non disponibles », le signet te le dit et pointe le réglage de langue. Tu n’as jamais à refaire le signet : il se met à jour tout seul.',
  flippOtherTitle: 'Autres chemins',
  flippAndroid: 'Android (Chrome) : ajoute n’importe quelle page aux favoris, modifie-la (nom « Coller de Babillard », adresse = le signet copié). Pour la lancer sur flipp.com, tape « Coller » dans la barre d’adresse et choisis le favori.',
  flippShortcut: 'iPhone, sans toucher aux signets : l’app Raccourcis ▸ nouveau raccourci ▸ « Exécuter JavaScript sur la page web » ▸ colle le code du signet sans le « javascript: » du début ▸ active « Afficher dans la feuille de partage ». Sur flipp.com : Partager ▸ ton raccourci.',
  flippCopyBookmarklet: 'Copier le signet',
  flippBookmarkletCopied: 'Signet copié',
  flippBookmarkletLabel: 'Adresse du signet',
  storeFilterHint:
    'Garde seulement les magasins où tu magasines : eux seuls paraîtront dans les rabais et les circulaires.',
  storeFilterNoPostal: 'Règle d’abord ton code postal ci-dessus pour voir les magasins du coin.',
  storeFilterError: 'Service de circulaires indisponible — réessaie plus tard.',
  storeFilterEmpty: 'Aucun magasin trouvé près de chez toi.',
  // Grocery aisle order — drag the aisles into YOUR store's layout; La liste's
  // « Par allée » then groups + sorts your items to follow that walk.
  aisleOrder: 'Ordre des allées',
  aisleOrderHint:
    'Glisse les allées dans l’ordre de TON magasin ; « Par allée » trie ensuite ta liste comme ton parcours.',
  aisleReset: 'Remettre l’ordre de départ',
  storeIncluded: 'Inclus',
  storeExcluded: 'Exclu',
  storeCashier: 'À la caisse',
  storeCashierOn: 'Oui',
  storeCashierOff: 'Non',
  storeCashierHint:
    'Cache les rabais de ce magasin dans « Montrer à la caisse » — pratique pour le magasin où tu fais ton épicerie.',
  history: 'Articles déjà achetés',
  historyHint:
    'Ce que l’« Ajout rapide » propose. Renomme un article spécifique vers son nom générique (ex. « Oeuf blanc sélection » → « Oeufs ») pour le regrouper, ou retire-le.',
  historyEmpty: 'Rien encore : l’historique se remplit à mesure que tu coches des articles, et il nourrit l’Ajout rapide ⚡.',
  historyRename: 'Renommer',
  historyRemove: 'Retirer',
  ghost: 'Liste fantôme',
  ghostStopConfirm: 'Arrêter de suivre cet article ? Il cesse de remonter dans l’Ajout rapide ; son historique reste.',
  mealsTab: 'Repas',
  mealColors: 'Couleurs des repas',
  // « Jours affichés » — the rolling meal-plan window (functions/_lib/mealSlots).
  // Replaced a Tuesday-anchored block that could not reach the coming weekend
  // from a Sunday evening (bmad/11 tier-1 seam #1).
  mealWindowTitle: 'Jours affichés',
  mealWindowLabel: 'La grille montre',
  mealWindowHint: 'À partir d’aujourd’hui, toujours. Dix jours suffisent pour planifier la fin de semaine qui vient, un dimanche soir comme un mercredi.',
  mealWindowDays: (n: number) => `${n} jours`,
  mealColorsHint:
    'Donne une couleur à chaque repas (déjeuner, dîner, collation, souper, dessert). Elle paraît partout où ce repas apparaît — babillard, calendrier, cuisine.',
  mealColorReset: 'Couleur de départ',
  mealShow: 'Repas affichés',
  mealShowHint:
    'Choisis les repas à voir sur le babillard et la cuisine. Décoche ceux qui t’encombrent (ex. ne garder que le souper). Tu peux quand même les planifier dans La cuisine.',
  mealVisible: 'Affiché',
  mealHidden: 'Masqué',
  mealOrderHint:
    'Glisse les repas dans l’ordre de ta journée. L’étoile marque le repas vedette ; l’heure décide lequel cuisiner ensuite.',
  mealReset: 'Ordre et heures de départ',
  mealHero: 'Vedette',
  mealHeroHint: 'Le repas vedette de la journée — celui qui fait la manchette du babillard.',
  mealHeroHidden: 'Le repas vedette est masqué : le babillard n’affichera pas de manchette « Ce soir ».',
  mealHourEarlier: 'Plus tôt',
  mealHourLater: 'Plus tard',
  todosTab: 'À compléter',
  reserveTab: 'Réserve',
  reserveTitle: 'Emplacements de la réserve',
  reserveHint:
    'Les endroits où tu ranges les aliments « cachés » (garde-manger, congélateur…). Ils regroupent La réserve dans La cuisine. Renomme-les, change leur couleur, retire-les ou ajoute les tiens.',
  reserveLocationName: 'Nom de l’emplacement',
  reserveAddLocation: 'Ajouter un emplacement…',
  reserveEmpty: 'Aucun emplacement. La réserve regroupe tout sous « Autres ».',
  autoTab: 'L’auto',
  carsTitle: 'Tes véhicules',
  carDefaultName: 'L’auto',
  carName: 'Nom du véhicule',
  carAdd: 'Ajouter un véhicule…',
  carsEmpty: 'Aucun véhicule — « Prend l’auto » n’apparaît plus sur les rendez-vous.',
  eventPeople: 'Pour qui ?',
  eventTakesCar: 'Prend l’auto',
  eventCarWho: 'Quelle auto ?',
  // Le repli « Note » du formulaire de rendez-vous (migration 0121) : ce qu'il faut
  // savoir, apporter ou demander — pas le titre, pas la note de la journée.
  eventNote: 'Note',
  eventNotePlaceholder: 'Ce qu’il faut apporter, l’étage, quoi demander…',
  // Le repli « Répéter » + « Afficher dès » : deux réglages à leur valeur par défaut
  // la plupart du temps.
  eventWhenMore: 'Répétition et rappel',
  eventBring: 'À apporter',
  // Inline bring-list builder in the event form's « À apporter » section.
  bringAddItem: 'Ajoute un article…',
  bringCreate: 'Créer la liste',
  bringDefaultName: 'À apporter',
  addActivity: 'Ajouter une activité',
  schedTitle: 'Horaires',
  schedEmpty: 'Aucun horaire. Ajoute les heures de travail pour savoir quand l’auto est prise.',
  schedAdd: 'Ajouter un horaire',
  schedNoMembers: 'Ajoute d’abord une personne à la maisonnée — un horaire appartient à quelqu’un. Réglages ▸ Maison ▸ La maisonnée.',
  schedLabel: 'Étiquette (Travail, Garderie…)',
  schedFrom: 'De',
  schedTo: 'à',
  schedHoldsCar: 'Prend l’auto',
  schedHoldsCarShort: '🚗',
  schedEveryDay: 'Tous les jours',
  schedBad: 'Membre et plage horaire valide requis.',
  schedRepeat: 'Répétition',
  schedEveryWeek: 'Chaque semaine',
  schedEveryNWeeks: (n: number) => `Aux ${n} semaines`,
  schedEveryNWeeksShort: (n: number) => `aux ${n} sem.`,
  cercleGroupsTitle: 'Groupes du cercle',
  cercleGroupsEmpty: 'Aucun groupe. Un groupe, c’est « Les cousins » ou « L’équipe de soccer » — crée-le dans Maison ▸ Famille avec le ＋.',
  cercleGroupMembers: (n: number) => `${n} ${n === 1 ? 'personne' : 'personnes'}`,
  cercleGroupHidden: 'Masqué du répertoire',
  recipesTab: 'Recettes',
  // Recipe-tab pills config (migration 0045) — Réglages ▸ La cuisine ▸ Apparence.
  pillsTitle: 'Pastilles de recettes',
  pillsHint:
    'Les filtres au-dessus des recettes. Glisse pour les réordonner, masque ceux que tu n’utilises pas, ou crée tes propres pastilles selon le temps, le nombre d’ingrédients, une étiquette…',
  pillShow: 'Afficher',
  pillHide: 'Masquer',
  pillAdd: 'Créer une pastille',
  pillNamePlaceholder: 'Nom (ex. Soupers rapides)',
  pillColor: 'Couleur de la pastille',
  pillEdit: 'Modifier la pastille',
  pillRemove: 'Supprimer la pastille',
  pillRemoveConfirm: (label: string) => `Supprimer la pastille « ${label} » ? Les recettes qui la portent la perdent.`,
  pillRuleField: 'Critère',
  pillRuleOp: 'Comparaison',
  pillRuleValue: 'Valeur',
  pillRuleAdd: 'Ajouter un critère',
  pillRuleRemove: 'Retirer le critère',
  pillRuleOr: 'ou',
  pillSave: 'Enregistrer la pastille',
  pillSlotsLabel: 'Priorité pour ces repas',
  pillSlotsHint:
    'Quand tu planifies un de ces repas, les recettes qui correspondent à cette pastille remontent en tête (juste après les restants).',
  pillFieldName: (f: string) =>
    (({
      totalMin: 'Temps total',
      prepMin: 'Préparation',
      cookMin: 'Cuisson',
      ingredients: 'Nombre d’ingrédients',
      servings: 'Portions',
      tag: 'Étiquette',
      favorite: 'Favori',
      photo: 'Avec photo',
    }) as Record<string, string>)[f] ?? f,
  tagsTitle: 'Étiquettes de recettes',
  tagsHint:
    'Les pastilles proposées quand tu étiquettes une recette, et le grand ménage : renommer ou retirer une étiquette partout d’un coup.',
  tagPills: 'Pastilles proposées',
  tagPillsHint: 'Ces pastilles apparaissent dans le formulaire de recette ; leur ordre décide aussi de l’ordre des collections. Glisse le ⠿ pour réorganiser. Les étiquettes déjà utilisées s’ajoutent automatiquement.',
  tagAddPill: 'Ajouter une pastille…',
  tagUsed: 'Étiquettes utilisées',
  tagNoneUsed: 'Aucune étiquette encore. Ajoute « Végé », « Rapide »… — elles classent tes recettes en collections.',
  tagOnN: (n: number) => `${n} recette${n > 1 ? 's' : ''}`,
  tagUnusedHint: 'Proposée',
  tagRename: 'Renommer',
  tagRemove: 'Retirer',
  tagRemoveConfirm: (tag: string) => `Retirer l’étiquette « ${tag} » de toutes les recettes ? Les recettes elles-mêmes restent.`,
  tagColor: 'Couleur',
  tagColorPick: (tag: string) => `Couleur de « ${tag} »`,
  tagColorNone: 'Aucune couleur',
  // Une étiquette peut dire à quels repas elle appartient. C'était déjà possible
  // via une PASTILLE portant une règle sur cette étiquette — mais ça demandait de
  // modéliser un filtre pour énoncer un fait sur un mot. L'étiquette est l'endroit
  // où on met le sens; c'est donc là que la préférence appartient.
  tagSlotsPick: (tag: string) => `Repas de « ${tag} »`,
  tagSlotsLabel: 'Pour ces repas',
  tagSlotsHint:
    'Quand tu planifies un de ces repas, les recettes portant cette étiquette remontent en tête (juste après les restants).',
  // La ligne discrète sur la rangée, pour que ça se lise sans ouvrir le tiroir.
  tagSlotsOn: (slots: string) => `Pour : ${slots}`,
  events: 'Rendez-vous',
  addEvent: 'Ajouter un rendez-vous',
  eventWhat: 'Quoi ? (ex. dentiste)',
  eventContact: '…ou quelqu’un du cercle',
  eventWith: '…ou avec une personne ou un commerce',
  eventAllDay: 'Toute la journée',
  eventDateLabel: 'Date',
  eventTimeLabel: 'Heure (optionnel)',
  eventUntilLabel: 'Jusqu’à',
  noEvents: 'Aucun rendez-vous à venir.',
  // D-17 (bmad/10) « La rentrée » — the school-year bounds, typed once a year.
  schoolYearTitle: 'Année scolaire',
  schoolYearHint: 'La rentrée, le dernier jour et les relâches, une fois par année : le babillard sait alors dire « école demain » ou « congé demain ».',
  schoolYearFirstDay: 'Rentrée (premier jour)',
  schoolYearLastDay: 'Dernier jour',
  schoolYearBreaksTitle: 'Relâches',
  schoolYearBreakFrom: 'Du',
  schoolYearBreakTo: 'au',
  schoolYearBreakLabel: 'Nom (optionnel, ex. « Relâche »)',
  schoolYearAddBreak: 'Ajouter une relâche',
  // Chaque relâche est REPLIÉE sur une ligne (nom + dates) ; le ✏ ouvre ses trois
  // champs. Sans nom tapé, la ligne se nomme elle-même ; sans dates, elle le dit.
  schoolYearBreakUnnamed: 'Relâche',
  schoolYearBreakBlank: 'Dates à remplir',
  schoolYearRemoveBreak: 'Retirer cette relâche',
  schoolYearClear: 'Effacer l’année scolaire',
  schoolYearClearConfirm: 'Effacer la rentrée, le dernier jour et toutes les relâches tapées ? Rien ne se récupère.',
  schoolYearBad: 'Dates invalides — vérifie que la rentrée précède le dernier jour.',
  recapTitle: 'Bilan de la semaine',
  recapHint: 'Un reflet doux de la semaine — sur demande, jamais automatique.',
  recapGen: 'Générer le bilan',
  recapThinking: 'Je résume…',
  thisWeekTab: 'Cette semaine',
  thisWeekTitle: 'Cette semaine ensemble',
  thisWeekHint: 'Un coup d’œil calme sur la semaine — ce qui s’en vient, et ce qu’on a fait ensemble. Des visages, jamais des pointages.',
  thisWeekAhead: 'Cette semaine',
  thisWeekBehind: 'Ce qu’on a fait ensemble',
  thisWeekMeals: 'Repas',
  thisWeekEvents: 'Rendez-vous',
  thisWeekBirthdays: 'Anniversaires',
  thisWeekWork: 'Au travail',
  thisWeekProjects: 'Projets',
  thisWeekChores: 'Corvées',
  thisWeekRoutines: 'Routines',
  thisWeekAheadEmpty: 'Rien de prévu cette semaine.',
  thisWeekBehindEmpty: 'La semaine commence — rien à montrer encore.',
  thisWeekYears: (n: number) => `${n} ans`,
  photo: 'Photo',
  removePhoto: 'Retirer la photo',
  photos: 'Photos de la maison',
  photoHint: 'Des photos qui défilent doucement sur le babillard. Ajoute-les depuis ton téléphone.',
  photoAdd: 'Ajouter des photos',
  photoUploading: 'Envoi…',
  photoUploadingN: (done: number, total: number) => `Envoi ${done}/${total}…`,
  noPhotos: 'Aucune photo pour le moment.',
  aiLog: 'Debug',
  aiLogTitle: 'Journal des erreurs IA',
  aiLogHint:
    'Quand une fonction IA échoue (modèle retiré, panne), une note apparaît à l’écran ; une fois acceptée, elle s’inscrit ici. Efface quand tu l’as lue.',
  aiLogEmpty: 'Aucune erreur enregistrée.',
  aiLogClear: 'Vider le journal',
  buildTitle: 'Version',
  buildBuilt: 'Dernière mise à jour',
  buildNever: 'Inconnue',
  kbDebugTitle: 'Diagnostic clavier',
  kbDebugOn: 'Activer le diagnostic clavier',
  kbDebugOff: 'Désactiver le diagnostic clavier',
  kbDebugHint: 'Affiche les mesures du clavier à l’écran (pour déboguer un champ caché).',
  // État des services (E-34, bmad/08): each optional binding, its state, and one
  // plain line on what quietly hides when it's absent — so a missing mic/photo
  // button reads as "not configured", never as a mystery bug.
  healthTitle: 'État des services',
  healthHint:
    'Ce qui est branché sur cette installation. Quand un service est absent, les fonctions qui en dépendent se cachent — tout le reste marche normalement.',
  healthOn: 'Actif',
  healthOff: 'Non configuré',
  healthDisabled: 'Désactivé pour la maisonnée',
  healthAi: 'Assistant IA',
  healthAiWhen: 'Sans lui : la capture demande le type à la main, et les idées de repas et le récap se cachent.',
  healthPhotos: 'Photos & fichiers',
  healthPhotosWhen: 'Sans eux : pas de photos, de mémos audio, de dessins ni de documents — les notes en texte marchent toujours.',
  healthRealtime: 'Temps réel',
  healthRealtimeWhen: 'Sans lui : les écrans se rafraîchissent aux quelques secondes au lieu d’instantanément. Rien d’autre ne change.',
  healthCloudOcr: 'Lecture haute précision',
  healthCloudOcrWhen: 'Sans elle : la lecture de photos de recettes se fait sur l’appareil, un peu moins précise.',
  healthRateLimit: 'Limite d’essais',
  healthRateLimitWhen: 'Sans elle : rien ne freine quelqu’un qui essaie des mots de passe en boucle sur la page de connexion.',
  healthAlerts: 'Alertes de nuit',
  healthAlertsWhen: 'Sans elles : une sauvegarde ratée ou un balayage cassé ne se voit que dans un journal que personne n’ouvre.',
  // Sub-tab labels that GROUP several sections under one pill (IA & système).
  weekTabTitle: 'La semaine',
  sysTabTitle: 'Version & diagnostics',
  // The merged Réglages pills (28 → 14, 2026-09-08). Each names what its stack
  // holds, in the order it holds it — lib/settingsNav SUB_LABEL_KEY points here.
  subAgendaWeek: 'Agenda & semaine',
  subHistoryTracking: 'Historique & suivi',
  subHomeTasks: 'Tâches de la maison',
  subCarsHours: 'L’auto & horaires',
  // Short on purpose: at 31 characters the first Système pill alone filled a 390px
  // row and the merge had bought nothing — the cards inside say the rest.
  subDevicesAccess: 'Appareils & accès',
  subDisplayIdle: 'Affichage & veille',
  subVoiceAi: 'Voix & IA',
  ambientTitle: 'Mode veille',
  ambientHint: 'Ce que la tablette du mur montre au repos : une horloge avec la date et tes photos après un délai, et le retour à « Maisonnée ».',
  ambientScreensaver: 'Économiseur',
  ambientIdleBefore: 'Délai avant la veille',
  ambientShows: 'Afficher',
  ambientClock: 'Horloge',
  ambientDate: 'Date',
  ambientPhotos: 'Photos',
  ambientDrawings: 'Dessins',
  ambientNext: 'À venir',
  ambientReturnHome: 'Revenir à Maisonnée',
  ambientReturnAfter: 'Délai avant le retour',
  // A-2 (bmad/09) — les fêtes dérivées au calendrier.
  fetesLabel: 'Les fêtes au calendrier',
  fetesHint: 'Les fêtes du Québec et du Canada s’annoncent d’elles-mêmes sur le babillard (Saint-Jean, Action de grâce, Noël…). Juste une ligne calme — rien à gérer, rien à créer.',
  // D-21 (bmad/10) « Sortir le bac » — the flagged-chore evening announce, per-device opt-out.
  binAnnounceLabel: 'L’annonce du soir (corvées)',
  binAnnounceHint: 'Une corvée cochée « Annoncer la veille au soir » se rappelle d’elle-même le soir d’avant — « c’est le soir du bac bleu ».',
  // E-35 — « Emporter mes données » (Réglages ▸ Système ▸ Appareils & accès).
  takeoutTitle: 'Emporter mes données',
  takeoutHint: 'Tout ce que Babillard garde pour ta maisonnée, en un seul fichier JSON — à toi. Une copie de secours se fait aussi chaque nuit, automatiquement.',
  householdTz: 'Fuseau horaire',
  householdTzHint: 'Où commence la journée de la maisonnée. Tout ce qui a une date s’y range — sur le babillard, sur les téléphones, partout. Un téléphone en voyage garde la journée de la maison.',
  takeoutBtn: 'Télécharger mes données (JSON)',
  // « Restaurer une copie » (STATE §4-L L8) — la sauvegarde de nuit avait tourné
  // pendant des mois sans que rien ne puisse la relire.
  restoreTitle: 'Restaurer une copie',
  restoreHint: 'Une copie de nuit, ou le fichier ci-dessus. Le contenu de la maisonnée est remplacé ; les appareils jumelés et les comptes restent.',
  restoreGo: 'Restaurer',
  restoreFromFile: 'Depuis un fichier…',
  restoreNoCopies: 'Aucune copie de nuit pour l’instant — la première arrive cette nuit.',
  restoreBadFile: 'Ce fichier n’est pas une copie Babillard.',
  restoreConfirm: (when: string) =>
    `Remplacer tout le contenu de la maisonnée par la copie du ${when} ? Ce qui a été ajouté depuis disparaît. Les appareils jumelés et les comptes restent.`,
  restoreDone: (n: number) => `C’est remis : ${n} lignes restaurées.`,
  ambientPreview: 'Aperçu maintenant',
  // F-47 — le souffle de l'heure (l'anti-notification).
  ambientBreath: 'Le souffle de l’heure',
  ambientBreathHint: 'Au sommet de l’heure, l’horloge de veille respire une fois — sans son, sans pastille. Le battement de cœur de la maison.',
  ambientOnWord: 'Activé',
  ambientOffWord: 'Désactivé',
  // « Mes habitudes » — quand « Le point du jour » s'ouvre de lui-même (C-15 :
  // même pilule que Mode veille, c'est la même idée : ce que l'écran fait seul).
  habitCheckinTitle: 'Le point du jour',
  habitCheckinMorning: 'Ouvrir le matin',
  habitCheckinMorningHint: 'À la première ouverture de la journée, si quelque chose t’attend. Une seule fois : le fermer, c’est ta réponse.',
  habitCheckinReminders: 'Rappels d’habitudes',
  habitCheckinRemindersHint: 'Aux heures que tu as choisies, sur l’écran allumé — jamais dans ta poche, jamais pendant une routine ou un formulaire.',
  habitCheckinReplay: 'Rejouer l’ouverture du jour',
  ambientMinutes: (n: number) => (n === 1 ? '1 minute' : `${n} minutes`),
  // Rendered under the screensaver toggle. It USED to say « seulement sur un
  // kiosque » and was never rendered anywhere — both wrong: HubLayout arms the
  // idle cycle on every surface (a wall tablet signed in as operator reads as
  // surface=mobile), so a phone really does fade to the clock after idleMin.
  ambientNote: 'L’économiseur s’affiche sur CET appareil — tablette murale comme téléphone. Touche l’écran pour le réveiller ; rien n’est jamais perdu.',
  aiTestTitle: 'État de l’IA',
  aiTestHint: 'Vérifie que l’IA répond vraiment — un vrai appel à chaque modèle, ici maintenant.',
  aiTestBtn: 'Tester l’IA',
  aiTestRunning: 'Test en cours…',
  aiTestOk: 'Fonctionne',
  aiTestFail: 'Échec',
  aiTestText: 'Texte (capture, idées, recettes)',
  aiTestVision: 'Photo (lire une recette)',
  aiTestUnavailable: 'L’IA n’est pas configurée sur ce déploiement.',
  // The probe tests the deployment's AI binding, not the household switch: it
  // can pass green while Réglages ▸ Système ▸ Voix & IA has AI off for everyone.
  aiTestWhileOff: 'L’IA est éteinte pour la maisonnée (Réglages ▸ Système ▸ Voix & IA). Ce test parle quand même au modèle : il vérifie le branchement, pas l’interrupteur.',
  micTestTitle: 'Test du micro',
  micTestHint:
    'Si le micro ne marche pas sur cet appareil, lance le test, dis « lait, œufs, pain », puis envoie-nous le rapport.',
  micTestBtn: 'Tester le micro',
  micTestStop: 'Arrêter',
  micTestListening: 'J’écoute… dis « lait, œufs, pain »',
  micTestSend: 'Copie ce rapport et envoie-le-nous.',
  micTestCopy: 'Copier le rapport',
  micTestCopied: 'Copié !',
  guide: 'Guide',
  guideTitle: 'Comment ça marche',
  guideHint: 'Tout le fonctionnement de Babillard, expliqué simplement, au même endroit.',
  guideSearch: 'Chercher dans le guide…',
  guideNone: 'Rien trouvé. Essaie un autre mot.',
  // The guide-card action row: « Ouvrir » = the live feature, « Régler » reuses
  // lensSet, « Essayer » = a point's own action link.
  guideOpen: 'Ouvrir',
  guideTry: 'Essayer',
  guideMap: 'Tout ce que Babillard fait',
  // « Voir dans l'app » — the shared Réglages-sub → live-surface backlink (SUB_GOTO).
  gotoFeature: 'Voir dans l’app',
  replayTour: 'Rejouer la visite guidée',
  replaySectionTour: 'Refaire le tour de cette section',
  resetOnboarding: 'Revoir l’accueil',
  guestTab: 'Partage',
}

// EN cache + one in-flight promise, so N components mounting at once trigger exactly ONE
// dynamic import. Same shape as i18n.ts's loadEN, one namespace down.
let cachedEN: typeof FR_OPERATOR | null = null
let enPromise: Promise<typeof FR_OPERATOR> | null = null
function loadEN(): Promise<typeof FR_OPERATOR> {
  if (!enPromise) enPromise = import('./i18n.operator.en').then((m) => (cachedEN = m.EN_OPERATOR))
  return enPromise
}

/** Réglages' copy. Same contract as `useT()`: always a dictionary, never undefined. */
export function useOperatorT(): typeof FR_OPERATOR {
  const { lang } = useLang()
  const [dict, setDict] = useState<typeof FR_OPERATOR>(() => (lang === 'en' && cachedEN) || FR_OPERATOR)
  useEffect(() => {
    if (lang !== 'en') {
      setDict(FR_OPERATOR)
      return
    }
    if (cachedEN) {
      setDict(cachedEN)
      return
    }
    let alive = true
    loadEN().then((en) => {
      if (alive) setDict(en)
    })
    return () => {
      alive = false
    }
  }, [lang])
  return dict
}
