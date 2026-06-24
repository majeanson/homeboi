import type { PromoScript } from './types'

// THE STORY (fil conducteur): a parent sits down to plan the week, then realises supper
// is tonight — and the household comes together. Dark, punchy open → cream body → dark
// close. Real recorded motion throughout (the ＋ sheet slides up, the list checks off,
// the calendar switches in, a layout toggle flips), a live cursor, kid-mode PiP insets,
// the app's own Pip brand (Baloo 2 / Hanken / marigold / warm paper). Hero = the ＋.
//
// Reliable selectors: [data-tour="add-fab"], :nth-match(.cat-pick,N), .kitchen__slot-add,
// .list-row__main, :nth-match(.boardview__opt,2), .board-layout__toggle, .routine-card--tap.
export const tour: PromoScript = {
  id: 'tour',
  kind: 'showcase',
  title: { fr: 'Babillard — visite', en: 'Babillard — tour' },
  fps: 30,
  music: undefined,
  cuts: ['full', 'short'],
  beats: [
    // ── DARK OPEN ──────────────────────────────────────────────────────────
    {
      id: '00-intro',
      surfaces: [],
      titleCard: true,
      surround: 'dark',
      short: true,
      hold: 3,
      caption: { fr: 'Babillard', en: 'Babillard' },
      kicker: { fr: 'Le centre de commande familial', en: 'The family command-center' },
    },
    // ── CREAM BODY: plan the week ──────────────────────────────────────────
    {
      id: '01-board',
      route: '/board',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'Le babillard', en: 'The board' },
      caption: { fr: 'Une nouvelle semaine commence', en: 'A new week begins' },
      play: async (d) => {
        await d.wait(700)
        await d.wheel('.hub__body', 320)
        await d.wait(500)
        await d.wheel('.hub__body', -200)
        await d.wait(400)
      },
    },
    {
      id: '02-flyers',
      route: '/liste/circulaires',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'On planifie', en: 'Let’s plan' },
      caption: { fr: 'D’abord, les rabais de la semaine', en: 'First, this week’s deals' },
      // Punch into the centred search + deal cards once they appear — fills the tablet
      // with the deals instead of leaving the sparse cream margins in frame.
      punch: { rect: { x: 0.2, y: 0.12, w: 0.6, h: 0.5 }, to: 1.42, start: 0.5 },
      play: async (d) => {
        await d.wait(600)
        // Tap a staple chip → the week's real deals fill in (price, store, was-price)
        // instead of sitting on the empty "search an article" prompt.
        await d.clickText({ fr: 'lait', en: 'milk' })
        await d.wait(1500)
      },
    },
    {
      id: '03-plan',
      route: '/kitchen',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'La cuisine', en: 'The kitchen' },
      caption: { fr: 'Je planifie les soupers de la semaine', en: 'I plan the week’s suppers' },
      play: async (d) => {
        await d.wait(700)
        await d.wheel('', 200) // pan the week of suppers
        await d.wait(500)
        // Tap a planned supper by its title → its detail peek (the meal-main span has
        // no hit-box, so target the title text; proper noun = same FR/EN).
        await d.clickText({ fr: 'Spaghetti maison', en: 'Spaghetti maison' })
        await d.wait(1300)
      },
    },
    {
      id: '04-recipe',
      route: '/kitchen/recipe/rc1',
      surfaces: ['wall', 'phone'],
      kicker: { fr: 'Recettes', en: 'Recipes' },
      caption: { fr: 'Mes recettes, à portée de main', en: 'My recipes, within reach' },
      punch: { rect: { x: 0.05, y: 0.22, w: 0.55, h: 0.4 }, to: 1.35 },
      play: async (d) => d.wait(2600),
    },
    {
      id: '05-liste',
      route: '/liste',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'La liste', en: 'The list' },
      caption: { fr: 'Et la liste d’épicerie se remplit toute seule', en: 'And the grocery list fills itself' },
      // Push gently into the first rows (the deal-tagged « Lait · Super C 4,99 $ »).
      punch: { rect: { x: 0.04, y: 0.18, w: 0.62, h: 0.4 }, to: 1.25, start: 0.4 },
      play: async (d) => {
        await d.wait(700)
        // Check an item OFF (the toggle, not the row body — that opens the editor):
        // the check animates and « Vider les cochés » appears. Calm, in place.
        await d.click('.list-row__toggle')
        await d.wait(1300)
      },
    },
    // ── back to the board: tonight! ────────────────────────────────────────
    {
      id: '06-tonight',
      route: '/board',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'Ce soir', en: 'Tonight' },
      caption: { fr: 'Oh — faut cuisiner ce soir !', en: 'Oh — we’re cooking tonight!' },
      punch: { rect: { x: 0.04, y: 0.62, w: 0.5, h: 0.3 }, to: 1.7 }, // push into the « Ce soir » card
      play: async (d) => {
        await d.wait(800)
        await d.wheel('.hub__body', 260)
        await d.wait(600)
      },
    },
    {
      id: '07-cook',
      route: '/kitchen/recipe/rc1/cook',
      surfaces: ['wall', 'phone'],
      short: true,
      pip: {}, // kid-mode inset: the toddler cook view (big measure scoops, colours)
      kicker: { fr: 'Mode cuisson', en: 'Cook mode' },
      caption: { fr: 'Mains libres, lu à voix haute', en: 'Hands-free, read aloud' },
      punch: { rect: { x: 0.04, y: 0.2, w: 0.5, h: 0.35 }, to: 1.3 },
      play: async (d) => d.wait(2800),
    },
    // ── everyone, including the three-year-old ─────────────────────────────
    {
      id: '08-routines',
      route: '/routines',
      surfaces: ['wall', 'phone'],
      surround: 'cream',
      short: true,
      // Parent overview is the MAIN frame; the toddler picture-card run rides as the
      // PiP inset (toddler-as-PiP rule — always focus on parent, show the kid small).
      pip: {},
      kicker: { fr: 'Routines', en: 'Routines' },
      caption: { fr: 'Chaque enfant suit la sienne, en images', en: 'Each kid follows theirs, in pictures' },
      punch: { rect: { x: 0.02, y: 0.16, w: 0.64, h: 0.5 }, to: 1.16, start: 0.45 },
      play: async (d) => {
        await d.wait(700)
        await d.click('.routine-card--tap') // peek a routine — its child + step pictures
        await d.wait(1400)
      },
    },
    {
      id: '09-dual',
      route: '/board',
      surfaces: ['wall', 'phone'],
      pip: {}, // same board, kid view, side-by-side
      kicker: { fr: 'Deux vues', en: 'Two views' },
      caption: { fr: 'Le même babillard, pensé pour les petits', en: 'The same board, made for little ones' },
      play: async (d) => d.wait(2600),
    },
    {
      id: '10-auto',
      route: '/voiture',
      surfaces: ['wall', 'phone'],
      kicker: { fr: 'L’auto', en: 'The car' },
      caption: { fr: 'Une seule auto, zéro chicane', en: 'One car, zero squabbles' },
      // Punch into the centred week rows — fills with the schedule, the empty lower half out of frame.
      punch: { rect: { x: 0.2, y: 0.16, w: 0.6, h: 0.44 }, to: 1.42, start: 0.4 },
      play: async (d) => {
        await d.wait(800)
        // Glide onto a real ride row (proper noun → same FR/EN) so the cursor lands on
        // content, not the empty lower half.
        await d.move('text=Soccer de Léa')
        await d.wait(1400)
      },
    },
    // ── the people it’s all for ────────────────────────────────────────────
    {
      id: '11-monde',
      route: '/cercle/monde',
      surfaces: ['wall', 'phone'],
      short: true,
      kicker: { fr: 'Le cercle', en: 'The circle' },
      caption: { fr: 'Au fond, c’est pour eux', en: 'In the end, it’s for them' },
      play: async (d) => d.wait(3000),
    },
    {
      id: '12-night',
      route: '/board',
      seed: { theme: 'night' },
      surfaces: ['wall', 'phone'],
      surround: 'dark',
      short: true,
      transition: 'slide',
      kicker: { fr: 'Du jour au soir', en: 'Day to night' },
      caption: { fr: 'Le soir venu, l’écran se repose', en: 'As evening falls, the screen rests' },
      play: async (d) => {
        await d.wait(700)
        await d.wheel('.hub__body', 220)
        await d.wait(500)
      },
    },
    // ── DARK CLOSE ─────────────────────────────────────────────────────────
    {
      id: '13-outro',
      surfaces: [],
      titleCard: true,
      surround: 'dark',
      short: true,
      hold: 4,
      caption: { fr: 'Calme par choix.', en: 'Calm by design.' },
      kicker: { fr: 'Pas de points. Pas de notifications.', en: 'No points. No notifications.' },
    },
  ],
}
