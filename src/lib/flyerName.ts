// A FLYER TITLE → THE NAME OF A LIST LINE (2026-09-30).
//
// The deal ↔ item doctrine says a flyer deal rides on a generic recurring line and never
// names one. `matchListItem` enforces it when such a line exists; when none does, every
// flyer door (a Flipp clipping coming back, the store flyer, price-match « Ajouter »)
// inserted the product name verbatim. Marc's list on 2026-09-30 was nine of fourteen
// lines like « GROS ŒUFS BLANCS SANS NOM, 12 UN. » — shouting, with the pack size in it.
//
// This is what those doors put on the list instead. It only ever CUTS the title and
// lowers its case — it never rewrites a word — so the result is always a whole-word
// PREFIX of the title. That is the load-bearing property: `matchListItem`'s containment
// tier (a line's name inside the flyer name) then finds this same line the next time the
// same product comes through, on the client and in the server backstop alike, and the
// deal still carries the full flyer title in its own `name` (the till, the zoom caption,
// the Flipp clipping all read that, never the line). flyerName.test.ts holds the property
// over every real title we have.
//
// Cut, in order: at « | » (Flipp's bilingual names: « MIEL BILLY BEE | BILLY BEE HONEY »),
// at the first comma (flyers put the format after one: « FRAISES, 1 L »), and at the
// first pack-size or filler marker (« 3 LB », « SAC DE », « AVEC », the store brand
// « SANS NOM »). Never below one word: a title that is all marker keeps its first word.

// A quantity with a unit (« 12 un », « 550-800 g », « 1 l »). The unit needs a word
// boundary so « 2 laitues » is not read as « 2 l ».
const SIZE = /^\d+(?:[.,]\d+)?(?:\s*[-–à]\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|lb|lbs|oz|ml|l|un|unités?|x|pqt|pack)\.?$/i
// Words that start the part of a flyer title that is about the packaging or the offer,
// not the thing. Compared lower-case and accent-folded, as whole words.
const MARKERS = ['avec', 'sac', 'paquet', 'format', 'formats', 'caisse', 'boite', 'emballage', 'sans nom', 'environ', 'choix de']

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Mostly capitals (a flyer shouting) → sentence case. Anything a person typed with its own
// capitals (« Pommes Gala ») keeps them.
function calm(s: string): string {
  const letters = s.replace(/[^\p{L}]/gu, '')
  const upper = letters.replace(/[^\p{Lu}]/gu, '')
  if (letters.length < 2 || upper.length / letters.length < 0.8) return s
  const lower = s.toLocaleLowerCase('fr-CA')
  return lower.charAt(0).toLocaleUpperCase('fr-CA') + lower.slice(1)
}

export function itemNameFromFlyer(title: string): string {
  const whole = title.replace(/\s+/g, ' ').trim()
  if (!whole) return whole
  const head = whole.split('|')[0].split(',')[0].trim() || whole
  const words = head.split(' ')
  let end = words.length
  for (let i = 1; i < words.length; i++) {
    const rest = fold(words.slice(i).join(' '))
    const sizeHere = SIZE.test(words.slice(i, i + 2).join(' ')) || SIZE.test(words[i])
    if (sizeHere || MARKERS.some((m) => rest === m || rest.startsWith(m + ' '))) {
      end = i
      break
    }
  }
  // Trailing glue a cut can leave behind (« CAROTTES OU », « POULET DE »).
  while (end > 1 && /^(ou|et|de|du|des|d'|à|a|or|and|of|-|–)$/i.test(words[end - 1])) end--
  return calm(words.slice(0, end).join(' ').replace(/[\s.:;-]+$/, ''))
}
