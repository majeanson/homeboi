// A pre-reader can't read "lait" or "natation" — but they know the *picture* of
// milk, or a swimmer. The toddler surfaces lean on this (NFR-KID-2: meaning is
// carried by the icon, never required reading). So map common grocery, meal, and
// kid-activity words (FR + EN) to a single, friendly emoji, falling back to a
// generic plate/cart/calendar picture supplied by the caller.
//
// Deterministic on purpose: the same word always draws the same picture, every
// render — a calm, learnable association, not a variable reward (NFR-CALM-2).
// Order matters: more specific entries come first so "pomme de terre" reads as a
// potato, not an apple.
const MAP: [string, string[]][] = [
  // ── pantry / produce ──────────────────────────────────────────────────────
  ['🥔', ['pomme de terre', 'patate', 'potato']],
  ['🍎', ['pomme', 'apple']],
  ['🍌', ['banane', 'banana']],
  ['🍊', ['orange', 'clémentine', 'clementine', 'mandarine']],
  ['🍇', ['raisin', 'grape']],
  ['🍓', ['fraise', 'strawberr']],
  ['🫐', ['bleuet', 'myrtille', 'blueberr']],
  ['🍉', ['melon', 'watermelon', 'pastèque', 'pasteque']],
  ['🍑', ['pêche', 'peche', 'peach']],
  ['🍒', ['cerise', 'cherry', 'cherries']],
  ['🍐', ['poire', 'pear']],
  ['🥝', ['kiwi']],
  ['🍍', ['ananas', 'pineapple']],
  ['🥥', ['coco', 'coconut']],
  ['🍋', ['citron', 'lemon', 'lime']],
  ['🍅', ['tomate', 'tomato']],
  ['🥕', ['carotte', 'carrot']],
  ['🧅', ['oignon', 'onion']],
  ['🧄', ['ail ', 'garlic']],
  ['🥬', ['laitue', 'salade', 'lettuce', 'épinard', 'epinard', 'spinach']],
  ['🥦', ['brocoli', 'broccoli']],
  ['🌽', ['maïs', 'mais', 'corn']],
  ['🍄', ['champignon', 'mushroom']],
  ['🫑', ['poivron', 'pepper', 'bell pepper']],
  ['🥒', ['concombre', 'cucumber', 'cornichon', 'pickle']],
  ['🥑', ['avocat', 'avocado']],
  ['🫒', ['olive']],
  ['🥜', ['noix', 'arachide', 'cacahuète', 'peanut', 'nut']],
  // ── proteins ──────────────────────────────────────────────────────────────
  ['🥚', ['oeuf', 'œuf', 'egg']],
  ['🧀', ['fromage', 'cheese']],
  ['🥓', ['bacon', 'lard']],
  ['🍗', ['poulet', 'chicken', 'dinde', 'turkey']],
  ['🍖', ['jambon', 'ham', 'côte', 'cote', 'rib']],
  ['🥩', ['boeuf', 'bœuf', 'steak', 'viande', 'beef', 'meat']],
  ['🐟', ['poisson', 'fish', 'saumon', 'salmon', 'thon', 'tuna']],
  ['🦐', ['crevette', 'shrimp']],
  // ── staples / dairy / bakery ──────────────────────────────────────────────
  ['🥛', ['lait', 'milk', 'yaourt', 'yogourt', 'yogurt']],
  ['🧈', ['beurre', 'butter']],
  ['🍞', ['pain', 'bread', 'toast']],
  ['🥐', ['croissant']],
  ['🥯', ['bagel']],
  ['🍚', ['riz', 'rice']],
  ['🍯', ['miel', 'honey']],
  ['🧂', ['sel ', 'salt', 'épice', 'epice', 'spice']],
  ['🥣', ['céréale', 'cereale', 'cereal', 'gruau', 'oatmeal']],
  // ── dishes / meals ────────────────────────────────────────────────────────
  ['🍝', ['pâte', 'pate', 'spaghetti', 'pasta', 'nouille', 'noodle', 'lasagne']],
  ['🍕', ['pizza']],
  ['🍔', ['burger', 'hamburger']],
  ['🌭', ['hot dog', 'hot-dog', 'saucisse', 'sausage']],
  ['🌮', ['taco']],
  ['🌯', ['burrito', 'wrap']],
  ['🥗', ['salade', 'salad']],
  ['🥪', ['sandwich', 'sous-marin', 'sub']],
  ['🍟', ['frite', 'fries']],
  ['🍲', ['soupe', 'soup', 'ragoût', 'ragout', 'stew', 'mijoté', 'mijote', 'chili', 'bouilli']],
  ['🍛', ['curry', 'riz frit']],
  ['🍣', ['sushi']],
  ['🥞', ['crêpe', 'crepe', 'pancake']],
  ['🧇', ['gaufre', 'waffle']],
  ['🍳', ['déjeuner', 'dejeuner', 'breakfast', 'brunch']],
  // ── treats / drinks ───────────────────────────────────────────────────────
  ['🍪', ['biscuit', 'cookie']],
  ['🍰', ['gâteau', 'gateau', 'cake']],
  ['🧁', ['cupcake', 'muffin']],
  ['🍫', ['chocolat', 'chocolate']],
  ['🍬', ['bonbon', 'candy']],
  ['🍦', ['crème glacée', 'creme glacee', 'glace', 'ice cream', 'icecream']],
  ['🍩', ['beigne', 'donut', 'doughnut']],
  ['🍿', ['popcorn', 'maïs soufflé']],
  ['☕', ['café', 'cafe', 'coffee']],
  ['🍵', ['thé', 'tea']],
  ['🧃', ['jus', 'juice']],
  ['🥤', ['soda', 'cola', 'liqueur', 'pop']],
  ['💧', ['eau ', 'water']],
  // ── kid activities (board events) ─────────────────────────────────────────
  ['🏫', ['école', 'ecole', 'school', 'classe', 'garderie', 'daycare']],
  ['🏊', ['piscine', 'natation', 'swim', 'baignade']],
  ['🩺', ['docteur', 'médecin', 'medecin', 'doctor', 'clinique', 'rendez-vous']],
  ['🦷', ['dentiste', 'dentist']],
  ['🛝', ['parc', 'park', 'jeux', 'playground']],
  ['🎂', ['anniversaire', 'birthday', 'fête', 'fete', 'party']],
  ['⚽', ['soccer', 'football', 'foot']],
  ['🏒', ['hockey']],
  ['🩰', ['danse', 'dance', 'ballet']],
  ['🎵', ['musique', 'music', 'piano', 'guitare', 'chant']],
  ['🎨', ['dessin', 'peinture', 'art', 'bricolage']],
  ['📚', ['bibliothèque', 'bibliotheque', 'library', 'lecture', 'devoir', 'homework']],
  ['🛁', ['bain', 'bath']],
  ['🪥', ['brosser', 'dents', 'brush', 'teeth']],
  ['😴', ['dodo', 'sieste', 'nap', 'sleep', 'coucher', 'bedtime']],
  ['🧸', ['jouer', 'jeu', 'play', 'jouet']],
  ['🎬', ['film', 'cinéma', 'cinema', 'movie']],
  ['🧹', ['ménage', 'menage', 'nettoyer', 'clean', 'ranger', 'tidy']],
  ['🧺', ['lessive', 'linge', 'laundry']],
  ['💇', ['coiffeur', 'cheveux', 'haircut']],
  ['🏃', ['sport', 'gym', 'entraînement', 'entrainement', 'course']],
  ['🚗', ['voiture', 'auto', 'car', 'route']],
  ['🚌', ['bus', 'autobus']],
  ['✈️', ['avion', 'plane', 'vol ', 'flight', 'voyage', 'trip']],
  ['🏖️', ['plage', 'beach']],
  ['⛷️', ['ski', 'neige', 'snow']],
  ['🌱', ['jardin', 'garden', 'planter']],
]

// A key matches a WHOLE WORD (a trailing plural « s » allowed), never a fragment.
// Plain `includes` made « Spaghetti maison » land on 🌽 — « ma-IS-on » contains the
// corn key « mais », and corn is listed before pasta — so a pre-reader in the
// toddler lens, who trusts only the picture, was told tonight is corn. (The old
// `'vol '` key, padded by hand, was the same bug patched once at the call site.)
// Cached: the MAP is static, and pictoFor runs per row on every board render.
const WORD_RE = new Map<string, RegExp>()
function keyRe(k: string): RegExp {
  let re = WORD_RE.get(k)
  if (!re) {
    const esc = k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    re = new RegExp(`(^|[^\\p{L}])${esc}s?([^\\p{L}]|$)`, 'iu')
    WORD_RE.set(k, re)
  }
  return re
}

export function pictoFor(label: string, fallback = '•'): string {
  const s = label.toLowerCase()
  for (const [emoji, keys] of MAP) {
    if (keys.some((k) => keyRe(k).test(s))) return emoji
  }
  return fallback
}
