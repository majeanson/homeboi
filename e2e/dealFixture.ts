import { BOARD, flyerIso } from './mocks'

// A board whose lines carry STAGED DEALS — the shape both shopping surfaces need.
//
// It lived inside `cashier.spec.ts` while the till was the only place that read it.
// « Ma liste Flipp » moved off the till on 2026-09-12 and needs exactly the same
// fixture, and two copies of "what a staged deal looks like" is how the two specs
// start proving different things about one payload. One source, both specs.

// The unbreakable stress word the long-text fixture uses — so the staged deals get
// genuinely long names in the long-text tests.
export const LONG = 'à la bolognaise maison avec béchamel gratinée Supercalifragilisticexpialidocieux'

// A staged deal per list line, so the grid has SEVERAL distinct tiles (different
// store / price / name) — the real high-stress shape. The mock board is static, so a
// spec serves this through its own board route override rather than staging writes.
export const DEALS = [
  { id: 101, flyerId: 5001, name: 'Lait 2% 4L', price: 4.99, unitPrice: 1.25, unitLabel: '/L', merchant: 'Super C' },
  { id: 102, flyerId: 5002, name: 'Pain tranché blé entier', price: 2.49, unitPrice: 0.5, unitLabel: '/100g', merchant: 'IGA' },
  { id: 103, flyerId: 5001, name: 'Pommes Gala 3 lb', price: 3.99, unitPrice: 1.32, unitLabel: '/lb', merchant: 'Metro' },
  // ENDED on purpose (validTo two days back): the staged deal a household forgot on
  // its list from last week's flyer — Marc's mini-concombres at Provigo.
  { id: 104, flyerId: 5002, name: 'Couches Pampers méga', price: 24.97, unitPrice: null, unitLabel: null, merchant: 'Walmart', endedDaysAgo: 2 },
]

export const stagedDeal = (d: (typeof DEALS)[number], long: boolean, allEnded = false) => ({
  id: d.id,
  flyerId: d.flyerId,
  name: long ? `${d.name} ${LONG}` : d.name,
  price: d.price,
  wasPrice: null,
  unitPrice: d.unitPrice,
  unitLabel: d.unitLabel,
  unitKind: null,
  unitApprox: false,
  merchant: long ? `${d.merchant} ${LONG}` : d.merchant,
  logo: null,
  premium: true,
  // The mock serves /api/flyer-img as a tiny SVG, so the tile thumbnail + the peek's
  // two-column picture|facts layout both render.
  image: `/api/flyer-img?d=${d.id}`,
  // Live-clock dates (the fixture doctrine of 2026-09-10): a fixed June date reads as
  // ENDED on every surface once the calendar passes it, silently.
  validFrom: flyerIso(-2),
  validTo: allEnded || ('endedDaysAgo' in d && d.endedDaysAgo) ? flyerIso(-(('endedDaysAgo' in d && d.endedDaysAgo) || 2)) : flyerIso(4),
})

export const boardWithDeals = (long: boolean, allEnded = false) => ({
  ...BOARD,
  list: [
    ...BOARD.list.map((item, i) => ({
      ...item,
      text: long ? `${item.text} ${LONG}` : item.text,
      deal_json: JSON.stringify(stagedDeal(DEALS[i] ?? DEALS[0], long, allEnded)),
    })),
    // Two plain lines — no deal — so « Ma liste Flipp » has typed items to carry;
    // the checked one must NOT go (it is already bought).
    { id: 'l5', text: 'Oeufs', source: 'manual' },
    { id: 'l6', text: 'Beurre', source: 'manual', checked_at: 1_700_000_000 },
  ],
})
