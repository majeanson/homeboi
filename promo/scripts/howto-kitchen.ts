import type { PromoScript } from './types'

// A short "how-to" — the same capture→compose pipeline as the tour, but step-numbered
// for a single workflow (planning the week from La cuisine). This is the template to
// clone per feature/section: give each beat a numbered caption + the route/state that
// illustrates it. Captions can be lifted from the in-app Guide (src/lib/guideContent.ts
// GuideEntry.points[].detail / .why), which is already bilingual.
export const howtoKitchen: PromoScript = {
  id: 'howto-kitchen',
  kind: 'howto',
  title: { fr: 'Comment : planifier la semaine', en: 'How to: plan the week' },
  fps: 30,
  music: undefined,
  beats: [
    {
      id: '00-title',
      surfaces: [],
      titleCard: true,
      hold: 3,
      caption: { fr: 'Planifier la semaine', en: 'Plan the week' },
      sub: { fr: 'La cuisine, étape par étape.', en: 'The kitchen, step by step.' },
    },
    {
      id: '01-open',
      route: '/kitchen',
      surfaces: ['wall', 'phone'],
      hold: 4.5,
      caption: { fr: '1. Ouvre « La cuisine »', en: '1. Open “The kitchen”' },
      sub: {
        fr: 'Tout le plan de la semaine vit ici.',
        en: 'The whole week’s plan lives here.',
      },
    },
    {
      id: '02-pick',
      route: '/kitchen',
      surfaces: ['wall', 'phone'],
      hold: 4.5,
      caption: { fr: '2. Choisis un souper', en: '2. Pick a supper' },
      sub: {
        fr: 'Touche une case pour assigner un repas ou une recette.',
        en: 'Tap a slot to assign a meal or a recipe.',
      },
    },
    {
      id: '03-link',
      route: '/kitchen/recipe/rc1',
      surfaces: ['wall', 'phone'],
      hold: 4.5,
      caption: { fr: '3. Lie une recette', en: '3. Link a recipe' },
      sub: {
        fr: 'Ses ingrédients partent vers la liste.',
        en: 'Its ingredients head to the list.',
      },
    },
    {
      id: '04-list',
      route: '/liste',
      surfaces: ['wall', 'phone'],
      hold: 4.5,
      caption: { fr: '4. La liste se remplit', en: '4. The list fills up' },
      sub: {
        fr: 'Coche à l’épicerie ; les rabais suivent.',
        en: 'Check it off at the store; deals tag along.',
      },
    },
    {
      id: '05-cook',
      route: '/kitchen/recipe/rc1/cook',
      surfaces: ['wall', 'phone'],
      hold: 4.5,
      caption: { fr: '5. Cuisine sans les mains', en: '5. Cook hands-free' },
      sub: {
        fr: 'Le mode cuisson lit les étapes à voix haute.',
        en: 'Cook mode reads the steps aloud.',
      },
    },
  ],
}
