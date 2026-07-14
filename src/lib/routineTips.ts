import type { Lang } from '../i18n'
import type { Bi } from './guideContent'
import { pictoFor } from './picto'

// « Le truc du compagnon » — one short, concrete trick per routine step, spoken by
// the child's companion when they TAP it during a run.
//
// Why this can exist without breaking the calm tenet. A companion is presence, not
// reward (see companions.ts): it may never react to whether steps got done. A tip
// respects that exactly — it is keyed to the PICTURE ON THE CURRENT CARD, never to
// progress, never to speed, never to a finish. The fox knows *what you're doing*, not
// *how well you're doing it*. There is no version of "brush the top, the bottom, and
// your tongue too" that grades a child.
//
// It is also strictly TAP-INITIATED (RoutinePlayer.sayCompanion). An unasked-for tip
// is a nag, and a nag is friction — the thing this app is built to not have. The child
// asks; the fox answers.
//
// Keyed by EMOJI, because a routine card's picture is authored, not inferred: the
// parent picks `card.icon` by hand in the deck editor. So the tip lands on exactly the
// glyph they chose. A card with no matching glyph falls back to reading its LABEL
// through pictoFor() — the app's one word→picture vocabulary (never a second, forked
// word list) — and, failing that, to a warm generic line.
//
// The register is the child's, not the manual's: second person, one idea, sayable in a
// breath, and true whether or not a grown-up is in the room.
const TIPS: Record<string, Bi> = {
  // ── hygiene ───────────────────────────────────────────────────────────────
  '🪥': {
    fr: 'En haut, en bas… et la langue aussi ! Doucement, en petits ronds.',
    en: 'Top teeth, bottom teeth… and your tongue too! Gentle little circles.',
  },
  '🛁': {
    fr: 'Teste l’eau avec ton coude avant d’entrer — le coude, c’est le meilleur juge.',
    en: 'Test the water with your elbow before you get in — elbows are the best judges.',
  },
  '🚿': {
    fr: 'Rince jusqu’à ce qu’il n’y ait plus de mousse dans tes cheveux.',
    en: 'Rinse until there’s no more foam left in your hair.',
  },
  '🧼': {
    fr: 'Frotte tes mains le temps de chanter deux fois « Bonne fête ».',
    en: 'Scrub your hands for as long as it takes to sing "Happy Birthday" twice.',
  },
  '🧴': {
    fr: 'Sèche-toi partout — même entre les orteils, c’est là que ça chatouille !',
    en: 'Dry everywhere — even between your toes, that’s the ticklish part!',
  },
  '🚽': {
    fr: 'On tire la chasse, puis on lave ses mains. Toujours dans cet ordre.',
    en: 'Flush first, then wash your hands. Always in that order.',
  },
  '💇': {
    fr: 'Commence par le bout des cheveux, puis remonte tranquillement.',
    en: 'Start at the ends of your hair, then work your way up slowly.',
  },
  // ── getting dressed ───────────────────────────────────────────────────────
  '👕': {
    fr: 'L’étiquette va derrière, dans ton cou — touche-la pour vérifier.',
    en: 'The tag goes at the back, on your neck — touch it to check.',
  },
  '👚': {
    fr: 'Les boutons, un à la fois, en partant du bas.',
    en: 'Buttons one at a time, starting from the bottom.',
  },
  '👟': {
    fr: 'Les deux souliers font un cœur : le gauche à gauche, le droit à droite.',
    en: 'Your shoes make a heart shape: left one left, right one right.',
  },
  '🧦': {
    fr: 'Roule la chaussette, glisse tes orteils, puis déroule jusqu’en haut.',
    en: 'Roll the sock up, slide your toes in, then unroll it all the way.',
  },
  '🧥': {
    fr: 'Manteau à plat, capuchon vers toi, les bras dedans… et hop, par-dessus la tête !',
    en: 'Coat flat, hood towards you, arms in… and flip it over your head!',
  },
  '🧤': {
    fr: 'Le pouce a sa propre maison — trouve-la en premier.',
    en: 'Your thumb has its own little house — find that one first.',
  },
  // ── meals ─────────────────────────────────────────────────────────────────
  '🥞': {
    fr: 'Assis-toi avant la première bouchée, et prends ton temps.',
    en: 'Sit down before your first bite, and take your time.',
  },
  '🥣': {
    fr: 'Le bol reste sur la table — c’est la cuillère qui voyage.',
    en: 'The bowl stays on the table — it’s the spoon that travels.',
  },
  '🍽️': {
    fr: 'Ton assiette va au comptoir quand tu as fini.',
    en: 'Your plate goes to the counter when you’re done.',
  },
  '💧': {
    fr: 'Prends de vraies gorgées — pas juste une petite goutte.',
    en: 'Take real sips — not just a tiny drop.',
  },
  // ── tidying ───────────────────────────────────────────────────────────────
  '🧸': {
    fr: 'Une sorte de jouet à la fois : d’abord les blocs, ensuite les autos.',
    en: 'One kind of toy at a time: blocks first, then the cars.',
  },
  '📚': {
    fr: 'Les livres se rangent debout, le dos vers toi, pour qu’on lise les titres.',
    en: 'Books stand up with their spines facing out, so you can read the titles.',
  },
  '🧺': {
    fr: 'Les pâles avec les pâles, les foncées avec les foncées.',
    en: 'Light clothes with the light ones, dark with the dark.',
  },
  '🧹': {
    fr: 'Balaie tout vers un seul petit tas, au milieu.',
    en: 'Sweep everything towards one little pile in the middle.',
  },
  '🛏️': {
    fr: 'Tire la couverture jusqu’en haut, puis lisse-la avec ta main.',
    en: 'Pull the blanket all the way up, then smooth it flat with your hand.',
  },
  '🗑️': {
    fr: 'Noue le sac avant de le sortir — sinon, il se renverse.',
    en: 'Tie the bag shut before you carry it out — otherwise it spills.',
  },
  // ── going out ─────────────────────────────────────────────────────────────
  '🎒': {
    fr: 'Vérifie trois choses : ton lunch, tes mitaines, ton devoir.',
    en: 'Check three things: your lunch, your mittens, your homework.',
  },
  '🏫': {
    fr: 'Souliers, manteau, sac — dans cet ordre, et tu n’oublies rien.',
    en: 'Shoes, coat, backpack — in that order, and you won’t forget a thing.',
  },
  '🚗': {
    fr: 'On attache sa ceinture avant que l’auto bouge. Clic !',
    en: 'Buckle up before the car moves. Click!',
  },
  '🚌': {
    fr: 'On attend sur le trottoir, loin du bord, jusqu’à l’arrêt complet.',
    en: 'Wait on the sidewalk, back from the edge, until it comes to a full stop.',
  },
  // ── winding down ──────────────────────────────────────────────────────────
  '📖': {
    fr: 'Choisis l’histoire, puis blottis-toi. On lit doucement.',
    en: 'Pick the story, then snuggle in. We read it slowly.',
  },
  '🌙': {
    fr: 'Trois grandes respirations : le ventre monte… le ventre descend.',
    en: 'Three big breaths: your belly goes up… your belly goes down.',
  },
  '😴': {
    fr: 'Ferme les yeux et écoute : combien de sons entends-tu ?',
    en: 'Close your eyes and listen: how many sounds can you hear?',
  },
  '🌅': {
    fr: 'Étire-toi grand comme un chat avant de sortir du lit.',
    en: 'Stretch out big like a cat before you climb out of bed.',
  },
  // ── play / doing ──────────────────────────────────────────────────────────
  '🎨': {
    fr: 'Mets ton tablier — et on lave le pinceau entre les couleurs.',
    en: 'Put your apron on — and rinse the brush between colours.',
  },
  '🎵': {
    fr: 'Commence lentement. La vitesse, ça vient tout seul après.',
    en: 'Start slowly. The speed comes on its own afterwards.',
  },
  '🌱': {
    fr: 'Arrose la terre, pas les feuilles — c’est les racines qui ont soif.',
    en: 'Water the soil, not the leaves — it’s the roots that are thirsty.',
  },
  '🐟': {
    fr: 'Juste une petite pincée. Trop de nourriture rend l’eau trouble.',
    en: 'Just a tiny pinch. Too much food makes the water cloudy.',
  },
  '🏃': {
    fr: 'Bouge tes bras et tes jambes un peu avant de partir vite.',
    en: 'Wake your arms and legs up a bit before you go fast.',
  },
}

// The trick the companion offers for ONE card, in the child's language.
//
// The cascade, in order (the parent's own words always win):
//   1. `card.tip` — a trick the parent typed in the deck editor, verbatim. They know
//      the real one ("regarde derrière la porte"); a generic catalog never will.
//   2. the card's EMOJI — the picture the parent picked by hand.
//   3. the card's LABEL, read through pictoFor() → an emoji → the same table. Catches
//      a card whose glyph is off-catalog ('⭐') but whose word is plain ("brosse tes
//      dents"), reusing the app's ONE word→picture vocabulary rather than forking it.
//   4. nothing — and the caller says a warm generic line instead. A step with no trick
//      worth knowing gets company, not filler dressed up as advice.
export function tipFor(card: { icon?: string; label?: string; tip?: string }, lang: Lang): string | null {
  const own = card.tip?.trim()
  if (own) return own
  const byIcon = card.icon && TIPS[card.icon.trim()]
  if (byIcon) return byIcon[lang]
  // pictoFor returns the fallback ('') when the label matches no known word — which
  // simply misses the table below, exactly as intended.
  const byLabel = card.label ? TIPS[pictoFor(card.label, '')] : undefined
  return byLabel ? byLabel[lang] : null
}

// Does this card have a built-in trick? (The deck editor shows it to the parent as the
// tip field's placeholder — so they see what the fox would say, and type over it only
// when they have a better one.) Deliberately ignores `card.tip`: this answers "what
// would the catalog say here", not "what will be said".
export const suggestedTip = (card: { icon?: string; label?: string }, lang: Lang): string | null =>
  tipFor({ icon: card.icon, label: card.label }, lang)
