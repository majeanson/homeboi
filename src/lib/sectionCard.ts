// WHICH SECTION AM I IN, for help purposes — one table, because the answer drives
// two doors that must agree: the « ? » bar's « Faire le tour » (a Tour whose id is
// this card — the SectionIntro convention since #32) and its « Tout savoir » (the
// GUIDE card of the same id).
//
// It exists because the mapping was about to be written twice: Maison needs it to
// offer the tour of the SECTION you are looking at (routines and the cercle each own
// one), and the ＋ sheet needs it because it is opened from a section but is handed
// only its modes. Two spellings of a taxonomy is how a door starts pointing at the
// wrong card — see DISCOVERY.md's rule about one taxonomy per concept.
//
// `undefined` = a surface with no section card (a scene, /settings, /pair…): the
// « ? » bar then shows the hint line alone, which is what it always did.

const HUB_CARDS: Record<string, string> = {
  '/board': 'board',
  '/kitchen': 'kitchen',
  '/liste': 'liste',
  '/notes': 'notes',
}

// Maison holds five sections inherited from three former hub tabs; two of them own
// their own tour. Business and Carnets have none, and fall back to the tab's — the
// honest answer, since the maison tour is what covers the sub-tab row they live in.
const MAISON_SECTION_CARDS: Record<string, string> = {
  routines: 'routines',
  family: 'cercle',
  social: 'cercle',
}

export function sectionCardFor(pathname: string, search = ''): string | undefined {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/maison') {
    const section = new URLSearchParams(search).get('section') ?? 'routines'
    return MAISON_SECTION_CARDS[section] ?? 'maison'
  }
  return HUB_CARDS[path]
}
