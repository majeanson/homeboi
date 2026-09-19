import type { FR } from '../i18n'

// The shape « Les remarques » (0136) travels in, and the three label lookups every
// surface needs. Shared because three of them read it — the Réglages section, the board
// card, and the composer — and a fourth spelling of « expédiée » is exactly what
// glossary.ts exists to prevent.

export type RemarkKind = 'bug' | 'wish' | 'polish'
export type RemarkStatus = 'open' | 'shipped' | 'confirmed'

export interface RemarkEvent {
  id: string
  remark_id: string
  /** 'filed' | 'shipped' | 'confirmed' | 'reopened' */
  kind: string
  text: string
  /** The commit that carried the fix — 'shipped' events only. */
  sha: string | null
  media_kind: string | null
  media_key: string | null
  scene_key: string | null
  /** ALWAYS null on 'shipped': the deploy pipeline is not a member and must not
   *  be able to wear a face. */
  author_member_id: string | null
  created_at: number
}

export interface Remark {
  id: string
  kind: string
  title: string
  body: string
  help_key: string | null
  seen_path: string | null
  seen_build: string | null
  context_json: string
  status: string
  reported_by: string | null
  created_at: number
  updated_at: number
  events: RemarkEvent[]
}

type T = typeof FR

export const KIND_LABEL = (t: T, kind: string): string =>
  kind === 'wish' ? t.remarks.kindWish : kind === 'polish' ? t.remarks.kindPolish : t.remarks.kindBug

export const STATUS_LABEL = (t: T, status: string): string =>
  status === 'shipped' ? t.remarks.statusShipped : status === 'confirmed' ? t.remarks.statusConfirmed : t.remarks.statusOpen

/** « Vu dans /kitchen · Version a3f21c9 » — the two facts that make a report actionable,
 *  and neither of which anyone should have to type. Either may be absent (a remark filed
 *  before the build stamp existed, or from a door that knows no path). */
export function remarkSubtitle(t: T, r: Remark): string {
  const bits: string[] = []
  if (r.seen_path) bits.push(`${t.remarks.seenOn} ${r.seen_path}`)
  if (r.seen_build) bits.push(`${t.remarks.seenBuild} ${r.seen_build}`)
  return bits.join(' · ')
}

/** Only the ones still waiting on someone. The board card shows these and nothing else:
 *  a card that keeps showing what is already settled never empties, and a list that never
 *  empties is the opposite of what this app promises. */
export const openRemarks = (rows: Remark[]): Remark[] => rows.filter((r) => r.status !== 'confirmed')
