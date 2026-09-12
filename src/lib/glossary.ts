import type { Bi } from './guideContent'

// THE TERM TABLE — one word per idea, in both languages, as DATA.
//
// The app has always had a vocabulary; it has never had a place that says which word
// wins. `CLAUDE.md`'s « Shared jargon » explains CONCEPTS to whoever is writing code;
// this file governs WORDS on screen, and it is what the guards read. The two are not
// the same job: "capture spine" is a concept, « Ajouter » is a word.
//
// Why it exists (census, 2026-09-09, walking the FR/EN dictionaries as objects — the
// only method that proved exact; see glossary.test.ts for the two that did not):
// the delete family ran six verbs — retirer 75 · supprimer 43 · vider 29 · effacer 14 ·
// enlever 1 · révoquer — with `effacer` doing three different jobs and no assigned
// meaning. The smoking gun was one key spelled two ways: `liste.clearChecked`
// = « Vider les cochés » and `todos.clearChecked` = « Effacer cochées ». Same key name,
// same act, two words.
//
// HOW TO USE IT
//   · `fr`/`en` are the WINNER forms. Write those.
//   · `rivals` are the losing spellings. `src/lib/glossary.test.ts` counts them in the
//     i18n dicts and in `e2e/`, and the count may only go DOWN — never up.
//   · `def` is the definition a person reads. It is deliberately short: this is the
//     text the in-app lexicon pops when a term is tapped in Réglages/Comprendre.
//   · `codeIds` records the identifiers the concept wears in code. Those are FROZEN —
//     `business`, `cercle`, `mots`, `operator` stay as ids for ever. A divergence
//     between an id and a label is deliberate here, and this is where it's written down.
//
// WHAT IS NOT A TERM: an idea with no user-visible word (a hook, a pattern, a lens).
// Those live in `CLAUDE.md`. A term earns its row by being READ by a household.

export type TermScope = 'verb' | 'entity' | 'surface'

export interface GlossaryTerm {
  /** Frozen id, never user-visible. The lexicon token is `[[mot:<id>]]`. */
  id: string
  scope: TermScope
  /** The winner form. Write this word; the guard bans the rivals. */
  fr: string
  en: string
  /** What a person reads when they tap the term. Two sentences at most. */
  def: Bi
  /** The GUIDE card the definition can hand off to (« Voir le guide »). */
  card?: string
  /** Identifiers this concept wears in code — deliberately frozen, listed so the gap is documented. */
  codeIds?: string[]
  /** Losing spellings, hunted by the ratchet. */
  rivals?: { fr?: string[]; en?: string[] }
  /** Why a rival survives, or why an id diverges from the label. */
  why?: string
}

// ── The verbs ───────────────────────────────────────────────────────────────
// Four acts, four words, and they are NOT interchangeable. The test that a word is
// right: say what happens to the thing. It leaves this surface (retirer) · it is gone
// (supprimer) · the container stays and empties (vider) · the link stops working
// (révoquer).
const VERBS: GlossaryTerm[] = [
  {
    id: 'retirer',
    scope: 'verb',
    fr: 'Retirer',
    en: 'Remove',
    def: {
      fr: 'Enlever quelque chose de CET écran-ci, sans le détruire : la personne reste dans le cercle, le repas reste dans les recettes.',
      en: 'Take something off THIS screen without destroying it: the person stays in the circle, the meal stays in the recipes.',
    },
    rivals: { fr: ['Enlever'] },
    why: '« Enlever » says the same thing with a second word. The last stray (a habit counter) went on day 2; the ratchet holds it at zero.',
  },
  {
    id: 'supprimer',
    scope: 'verb',
    fr: 'Supprimer',
    en: 'Delete',
    def: {
      fr: 'Détruire pour de bon. Ce qui part ne revient pas, et la question posée avant doit dire ce qu’on perd.',
      en: 'Destroy for good. What goes does not come back, and the question asked first must say what is lost.',
    },
  },
  {
    id: 'vider',
    scope: 'verb',
    fr: 'Vider',
    en: 'Clear',
    def: {
      fr: 'Enlever le contenu, garder le contenant : la liste reste, elle est juste vide. C’est le grand ménage, pas la destruction.',
      en: 'Take out the contents, keep the container: the list stays, it is simply empty. A tidy-up, not a destruction.',
    },
  },
  {
    id: 'revoquer',
    scope: 'verb',
    fr: 'Révoquer',
    en: 'Revoke',
    def: {
      fr: 'Faire cesser un accès : un lien de partage, une tablette jumelée. Le lien ne fonctionne plus, tout de suite.',
      en: 'Stop an access: a share link, a paired tablet. The link stops working, right away.',
    },
    card: 'share-access',
  },
  {
    id: 'effacer',
    scope: 'verb',
    fr: 'Effacer',
    en: 'Erase',
    def: {
      fr: 'Enlever une marque que tu as faite : l’encre d’un dessin, le texte tapé dans une case, des dates entrées. Jamais une chose de la maisonnée.',
      en: 'Take off a mark you made: ink on a drawing, text typed in a field, dates you entered. Never a thing belonging to the household.',
    },
    why:
      'Kept as a FIFTH verb, and day 2 sharpened what it means: it erases MARKS (ink, typed text, ' +
      'typed values), never OBJECTS. That line is what tells the DrawPad’s « Tout effacer » and the ' +
      'field ✕ « Effacer le texte » (both correct) from « Effacer cochées » (a container of items — ' +
      '« Vider »). It is also legitimate in consequence prose (« le média joint sera effacé »), ' +
      'which describes what happens rather than naming a button.',
  },
]

// ── The things ──────────────────────────────────────────────────────────────
const ENTITIES: GlossaryTerm[] = [
  {
    id: 'corvee',
    scope: 'entity',
    fr: 'Corvée',
    en: 'Chore',
    def: {
      fr: 'Une tâche du ménage qui revient : sortir les poubelles, vider le lave-vaisselle. Elle tourne entre les personnes de la maisonnée.',
      en: 'A household task that comes back: taking out the bins, emptying the dishwasher. It rotates between the people of the household.',
    },
    card: 'set-chores',
    codeIds: ['tasks', 'task_participants'],
    rivals: { fr: ['Tâche'] },
    why:
      '« Tâches de la maison » is a Réglages PILL that stacks three sections (routines, corvées, ' +
      'à compléter) — a container name, not a synonym. Only a lone « tâche » standing for one ' +
      'corvée is a rival.',
  },
  {
    id: 'a-completer',
    scope: 'entity',
    fr: 'À compléter',
    en: 'To finish',
    def: {
      fr: 'Une chose à faire une seule fois, qu’on coche et qui s’en va — pas une corvée qui revient chaque semaine.',
      en: 'Something to do once, ticked off and gone — not a chore that comes back every week.',
    },
    card: 'todos',
    codeIds: ['todos', 'todo_templates'],
    why:
      'The code says `todos`; the app has never shown that word. The surface is « À compléter », ' +
      'and its Réglages home sits under the « Tâches de la maison » pill — a container name, not a synonym.',
  },
  {
    id: 'rendez-vous',
    scope: 'entity',
    fr: 'Rendez-vous',
    en: 'Appointment',
    def: {
      fr: 'Quelque chose qui arrive à une heure donnée : le dentiste, un souper, un match. C’est ce que l’agenda montre.',
      en: 'Something happening at a given time: the dentist, a supper, a game. It is what the agenda shows.',
    },
    card: 'set-agenda',
    codeIds: ['events'],
    rivals: { fr: ['Événement'], en: ['Event'] },
    why:
      'The app says « rendez-vous » wherever the entity is named. « Événement » survived in search + capture ' +
      'until day 3; the ratchet holds it at zero. EN was the worse half and went unnoticed behind it: FR had ' +
      'been clean for days while English still said "Event" in 17 places (search, capture, the calendar ' +
      'legend, edit/delete/add, the empty state, two confirms). Marc settled it on 2026-09-09 — Appointment — ' +
      'and declaring the EN rival here is what makes the English side enforced rather than merely documented. ' +
      'The `events` code id stays frozen, as every code id here does.',
  },
  {
    id: 'mot',
    scope: 'entity',
    fr: 'Mot',
    en: 'Message',
    def: {
      fr: 'Un petit message laissé à quelqu’un de la maisonnée, comme un papier collé sur le frigo. Il attend la personne visée.',
      en: 'A short message left for someone in the household, like a paper stuck on the fridge. It waits for the person it names.',
    },
    card: 'mots',
    codeIds: ['mots'],
    why:
      'FR keeps three words for three different tables (mot · note du frigo · note de famille) and that ' +
      'is the rule WORKING. English collapsed all three onto "note"; « Message » is the EN winner so the ' +
      'three stay distinct in both languages.',
  },
  {
    id: 'note',
    scope: 'entity',
    fr: 'Note',
    en: 'Note',
    def: {
      fr: 'Une note durable, pour toi ou pour toute la maisonnée : une recette de grand-maman, un code de porte, une adresse.',
      en: 'A note that lasts, for you or for the whole household: a grandmother’s recipe, a door code, an address.',
    },
    card: 'notes',
    codeIds: ['family_notes'],
    why:
      'Three tables carry note-ish rows — `mots`, `notes` (the fridge memo) and `family_notes`. ' +
      'This term is the last one. FR keeps them apart; EN had collapsed all three onto "note".',
  },
  {
    id: 'memo',
    scope: 'entity',
    fr: 'Mémo vocal',
    en: 'Voice memo',
    def: {
      fr: 'Une note dite à voix haute plutôt qu’écrite. Elle se rattache à une note ou à un mot, et se réécoute d’une tape.',
      en: 'A note spoken aloud instead of written. It rides along with a note or a message, and plays back with one tap.',
    },
    card: 'mots',
  },
  {
    id: 'maisonnee',
    scope: 'entity',
    fr: 'Maisonnée',
    en: 'Household',
    def: {
      fr: 'Tout le monde de la maison, pris ensemble. Choisir « Maisonnée » plutôt qu’un visage veut dire : c’est pour tout le monde.',
      en: 'Everyone in the house, taken together. Picking “Household” instead of a face means: this is for everybody.',
    },
    card: 'set-household',
    codeIds: ['households', 'members'],
    rivals: { fr: ['Tout le monde'], en: ['Everyone'] },
    why: 'Two tables (`households`, the tenant row, and `members`, the people) wear one word on screen, on purpose: a household is who is in it. The rival is the same FACE-PICKER option under another name: four surfaces pass an `allLabel` to the same picker and three of them spelled it differently — « Tout le monde » (Voyage), « Toute la maisonnée » (the habit form), and in EN the board itself said "Everyone" while every other surface said "Household" (settled 2026-09-10). The ceiling is a FLOOR, not a target: « Tout le monde est là » is a sentence about the car, and « Tout le monde (lien ouvert) » is an intake link that is genuinely for anyone — neither is a second name for the household lens.',
  },
  {
    id: 'garde-manger',
    scope: 'entity',
    fr: 'Garde-manger',
    en: 'Pantry',
    def: {
      fr: 'Ce qui manque ou achève dans l’armoire — jamais un inventaire. On dit « il en manque », pas « il en reste deux ».',
      en: 'What is missing or running low in the cupboard — never an inventory. You say “we’re out”, never “two left”.',
    },
    card: 'kitchen',
    codeIds: ['pantry_low'],
    why: 'A count here would be an inventory, which calm-tenets.test.ts forbids at the schema level.',
  },
  {
    id: 'restant',
    scope: 'entity',
    fr: 'Restant',
    en: 'Leftover',
    def: {
      fr: 'Un plat déjà cuisiné qui attend au frigo. Le planifier pour un soir veut dire : rien à cuisiner ce soir-là.',
      en: 'A dish already cooked, waiting in the fridge. Planning it for an evening means: nothing to cook that night.',
    },
    card: 'kitchen',
  },
  {
    id: 'routine',
    scope: 'entity',
    fr: 'Routine',
    en: 'Routine',
    def: {
      fr: 'Une suite de cartes-images qu’un enfant suit tout seul, lue à voix haute : se lever, s’habiller, brosser les dents.',
      en: 'A run of picture cards a child follows alone, read aloud: get up, get dressed, brush teeth.',
    },
    card: 'routines',
  },
  {
    id: 'habitude',
    scope: 'entity',
    fr: 'Habitude',
    en: 'Habit',
    def: {
      fr: 'Quelque chose que tu veux faire souvent et suivre dans le temps. Sans série ni pointage — juste le fil des jours.',
      en: 'Something you want to do often and follow over time. No streak, no score — just the thread of the days.',
    },
    card: 'habits',
  },
  {
    id: 'carnet',
    scope: 'entity',
    fr: 'Carnet',
    en: 'Logbook',
    def: {
      fr: 'Le dossier d’une chose qui dure : la maison, l’auto, l’aspirateur. Entretien, factures et papiers au même endroit.',
      en: 'The file of something that lasts: the house, the car, the vacuum. Upkeep, invoices and papers in one place.',
    },
    card: 'carnets',
    codeIds: ['carnets'],
    why: 'The FR word still stands untranslated in ~8 EN strings; « Logbook » is the EN winner that fixes them (UNIFY day 3).',
  },
  {
    id: 'commerce',
    scope: 'entity',
    fr: 'Commerce',
    en: 'Business',
    def: {
      fr: 'Un service qu’on appelle : le vétérinaire, le plombier, la clinique. C’est un carnet d’adresses, pas des personnes du cercle.',
      en: 'A service you call: the vet, the plumber, the clinic. An address book, not people of the circle.',
    },
    card: 'cercle',
    codeIds: ['businesses'],
    why: 'FR renamed « Business » → « Commerces » on 2026-09-08; ids and routes stayed `business`.',
  },
  {
    id: 'cercle',
    scope: 'entity',
    fr: 'Le cercle',
    en: 'The circle',
    def: {
      fr: 'Le monde autour de la maisonnée : la parenté, les amis, les voisins, et les liens entre eux. Il vit dans Maison ▸ Famille et ▸ Social.',
      en: 'The world around the household: relatives, friends, neighbours, and the ties between them. It lives in Maison ▸ Family and ▸ Social.',
    },
    card: 'cercle',
    codeIds: ['contacts', 'cercle_links', 'cercle_groups'],
    why:
      'A CONCEPT, not a place — which is why it survived the tab rename. « Ajouter au cercle » is right; ' +
      '« Fiche complète dans Le cercle » was not, because it points at a place, and that place is now ' +
      'Maison ▸ Famille. A string that NAVIGATES names the live surface; a string that names the people ' +
      'says le cercle.',
  },
  {
    id: 'invite',
    scope: 'entity',
    fr: 'Invité',
    en: 'Guest',
    def: {
      fr: 'Quelqu’un à qui tu prêtes un lien pour REGARDER la maisonnée — la gardienne, un proche. Il ne peut rien changer.',
      en: 'Someone you lend a link to LOOK at the household — the sitter, a relative. They can change nothing.',
    },
    card: 'share-access',
  },
  {
    id: 'envoyer-flipp',
    scope: 'verb',
    fr: 'Envoyer',
    en: 'Send',
    def: {
      fr: 'Mettre ta liste dans Flipp. Seul ce qu’il te reste à acheter part.',
      en: 'Put your list into Flipp. Only what is still to buy goes.',
    },
    card: 'liste',
    // THE COLLISION THIS ROW EXISTS FOR (2026-09-12). One idea — « get my Babillard
    // list into Flipp » — wore five names depending on the screen: « Ma liste →
    // Flipp » (the till), « Copier pour Flipp » (a dead key still quoted in two live
    // bookmarklet strings), « Coller ma liste Babillard » and « Coller de Babillard »
    // (the bookmark's own menu and name), « Envoyer à Flipp » (the words-only door).
    // The app side now says ENVOYER, once; the two doors differ by their CARGO, not
    // their verb (« Envoyer ma liste » vs « Envoyer sans les rabais »).
    rivals: { fr: ['Copier pour Flipp'], en: ['Copy for Flipp'] },
    why:
      'The bookmarklet’s own sheet keeps « Remplacer » / « Ajouter »: those name two genuinely ' +
      'different landings (replace the Flipp list, or append to it), they are chosen ON flipp.com, ' +
      'and their strings live in a generated file with its own byte-for-byte guard (flippPaste.test.ts). ' +
      'They are not rivals of « Envoyer » — they are what happens after it.',
  },
  {
    id: 'rapporter-flipp',
    scope: 'verb',
    fr: 'Rapporter',
    en: 'Bring back',
    def: {
      fr: 'Le chemin inverse : ta liste Flipp revient dans Babillard. Rien n’est retiré.',
      en: 'The way back: your Flipp list returns to Babillard. Nothing is removed.',
    },
    card: 'liste',
  },
  {
    id: 'virement',
    scope: 'entity',
    fr: 'Virement',
    en: 'Transfer',
    def: {
      fr: 'Un envoi d’argent au compte commun, noté après coup : ce qu’il couvre, le message envoyé à la banque, et son numéro de référence.',
      en: 'A payment sent to the shared account, noted afterwards: what it covers, the message sent to the bank, and its reference number.',
    },
    card: 'notes',
    codeIds: ['transfers'],
    why:
      'The household already said « virement » in its own handwritten note and in every Interac memo, ' +
      'so the app adopted their word rather than teaching them a new one. NO rival is declared, and ' +
      'that is a decision: « paiement » looks like a synonym and is not one here — it names ONE ' +
      'scheduled occurrence of an entente (« 300 $ de plus par paiement », « 3 paiements notés »), ' +
      'which is the thing a virement COVERS. Banning it would have forced worse sentences and taught ' +
      'the ratchet to cry wolf.',
  },
  {
    id: 'entente',
    scope: 'entity',
    fr: 'Entente',
    en: 'Agreement',
    def: {
      fr: 'Ce que vous vous partagez et comment : le montant, à quel rythme il revient, et la part de chaque personne. Écrite une fois, elle prépare chaque virement.',
      en: 'What you split and how: the amount, how often it comes back, and each person’s share. Written once, it fills in every transfer.',
    },
    card: 'notes',
    codeIds: ['transfer_plans'],
    why:
      '« Engagement » is already the rendez-vous noun in this app (ONE engagement model — see CLAUDE.md), ' +
      'so it could not be reused here without making one word mean two things. « Plan » is the code id ' +
      'and stays out of the copy.',
  },
  {
    id: 'renflouement',
    scope: 'entity',
    fr: 'Renflouement',
    en: 'Top-up',
    def: {
      fr: 'L’argent qu’on remet dans le compte commun pour le quotidien, en plus des ententes — le même montant des deux bords.',
      en: 'Money put back into the shared account for day-to-day spending, on top of the agreements — the same amount from each of you.',
    },
    card: 'notes',
    why: 'The word the household already used in its bank memos (« renflou 2000 »), kept verbatim.',
  },
]

// ── The places ──────────────────────────────────────────────────────────────
// The six tabs plus Réglages. Their names are the app's skeleton, so a retired name
// left standing in copy is the most confusing kind of drift there is.
const SURFACES: GlossaryTerm[] = [
  {
    id: 'babillard',
    scope: 'surface',
    fr: 'Le babillard',
    en: 'The board',
    def: {
      fr: 'L’écran d’un coup d’œil : l’heure, la journée, le souper, les corvées. C’est ce que la tablette montre au mur.',
      en: 'The at-a-glance screen: the time, the day, supper, the chores. It is what the wall tablet shows.',
    },
    card: 'board',
  },
  {
    id: 'maison',
    scope: 'surface',
    fr: 'Maison',
    en: 'Home',
    def: {
      fr: 'L’onglet qui tient les routines et le monde autour de la maisonnée : la famille, les proches, les commerces, les carnets.',
      en: 'The tab holding the routines and the world around the household: family, close ones, businesses, logbooks.',
    },
    card: 'maison',
    codeIds: ['cercle'],
    why:
      'The old « Le cercle » TAB became Maison ▸ Famille. Day 3 corrected a day-1 assumption here: ' +
      '« le cercle » is NOT a rival of « Maison » — it names the PEOPLE (see the `cercle` term), while ' +
      'Maison names the place that holds them. Only a string that POINTS somewhere must say the live ' +
      'place; « Personne dans le cercle pour l’instant » was right all along. The route /cercle/* and the ' +
      'guide card id `cercle` are frozen — they sit in family links people have already texted.',
  },
  {
    id: 'cuisine',
    scope: 'surface',
    fr: 'La cuisine',
    en: 'The kitchen',
    def: {
      fr: 'Le plan des repas de la semaine, les recettes, le garde-manger et les rabais. Ce qu’on mange et ce qu’il faut acheter.',
      en: 'The week’s meal plan, the recipes, the pantry and the deals. What you eat and what to buy.',
    },
    card: 'kitchen',
  },
  {
    id: 'liste',
    scope: 'surface',
    fr: 'La liste',
    en: 'The list',
    def: {
      fr: 'UNE seule liste d’épicerie, partagée. On coche en magasin, et « Vider les cochés » l’allège une fois sorti.',
      en: 'ONE shared grocery list. You tick things off in the store, and “Clear checked” lightens it once you’re out.',
    },
    card: 'liste',
  },
  {
    id: 'reglages',
    scope: 'surface',
    fr: 'Réglages',
    en: 'Settings',
    def: {
      fr: 'Où l’on comprend et où l’on règle : une pastille par section de l’app, chacune avec « Comprendre » et « Régler ».',
      en: 'Where you understand and where you set: one pill per section of the app, each with “Understand” and “Set”.',
    },
    card: 'settings',
    codeIds: ['operator'],
    why: 'The code says `operator` (the signed-in adult); the copy says « Réglages » for the place and « compte parent » for the person.',
  },
]

export const GLOSSARY: GlossaryTerm[] = [...VERBS, ...ENTITIES, ...SURFACES]

/** Every rival spelling, flattened — what the ratchet in glossary.test.ts hunts. */
export function rivalForms(): { term: string; lang: 'fr' | 'en'; form: string }[] {
  const out: { term: string; lang: 'fr' | 'en'; form: string }[] = []
  for (const t of GLOSSARY) {
    for (const form of t.rivals?.fr ?? []) out.push({ term: t.id, lang: 'fr', form })
    for (const form of t.rivals?.en ?? []) out.push({ term: t.id, lang: 'en', form })
  }
  return out
}
