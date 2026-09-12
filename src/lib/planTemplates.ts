import type { IconName } from '../components/Icon'
import type { TransferRecur } from './transfers'

// WHAT « Les virements » IS, once you stop calling it a mortgage feature.
//
// The model underneath is « a recurring shared obligation with per-person shares ».
// That is a mortgage, but it is equally rent, a daycare bill, a car loan, siblings
// splitting what it costs to care for a parent, or a subscription four friends
// share. All of them already worked on the day this shipped — the only thing
// missing was the app SAYING so, which is why a first-time reader saw an empty
// screen and assumed it was for somebody with a mortgage.
//
// So these are not features. They are NAMES for a shape that already fits, offered
// where a household is most likely to be stuck: the empty state, and the first
// screen of a brand-new agreement. Picking one fills in a title and a rhythm and
// nothing else — every number stays the household's to type, because a suggested
// amount is a guess about someone's money.
export type PlanTemplateKey = 'mortgage' | 'rent' | 'daycare' | 'loan' | 'care' | 'shared'

export interface PlanTemplate {
  key: PlanTemplateKey
  icon: IconName
  /** The rhythm these bills usually keep. Always editable afterwards. */
  recur: TransferRecur
}

// Order is « most likely to be why you opened this screen » first. Weekly/biweekly
// rules carry no `weekdays`: the household's own first date decides the day, which
// is what the anchor is for.
export const PLAN_TEMPLATES: readonly PlanTemplate[] = [
  { key: 'mortgage', icon: 'house-bold', recur: { freq: 'weekly', interval: 2 } },
  { key: 'rent', icon: 'key-bold', recur: { freq: 'monthly', interval: 1 } },
  { key: 'daycare', icon: 'baby-bold', recur: { freq: 'weekly', interval: 1 } },
  { key: 'loan', icon: 'car-bold', recur: { freq: 'monthly', interval: 1 } },
  { key: 'care', icon: 'hand-heart-bold', recur: { freq: 'monthly', interval: 1 } },
  { key: 'shared', icon: 'users-three-bold', recur: { freq: 'monthly', interval: 1 } },
]

/** The template a `?modele=` link names, or null — never throws on a stale link. */
export function planTemplate(key: string | null | undefined): PlanTemplate | null {
  return PLAN_TEMPLATES.find((x) => x.key === key) ?? null
}
