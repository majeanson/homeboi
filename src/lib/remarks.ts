import { useCallback } from 'react'
import { useWrite } from './write'
import { REMARKS_KEY } from './queryKeys'
import type { FR } from '../i18n'

// The shape « Les remarques » (0136) travels in, and the three label lookups every
// surface needs. Shared because three of them read it — the Réglages section, the board
// card, and the composer — and a fourth spelling of « expédiée » is exactly what
// glossary.ts exists to prevent.

// The `kind` and `status` unions live where they are USED — RemarkComposer owns
// RemarkKind, and the rows come back as plain strings because they come from D1. Two
// speculative type aliases were exported from here in the first draft, for a board card
// that does not exist yet, and knip failed the build on them. It was right: an export
// with no reader is a promise nobody is keeping.

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

/**
 * THE remark verdict — and it is a hook here, not an inline `write()`, because it now
 * has TWO doors.
 *
 * Réglages owns the journal; the board card owns the glance. Both offer « C'est réglé »
 * / « Pas réglé », and the moment the same PATCH is spelled in two files it starts
 * drifting: a missing `affectedKeys` on one of them leaves the OTHER surface showing a
 * remark that is already closed, until its next poll. That is the documented 2026-09-03
 * leftover drift, which re-grew four times from exactly this shape — so the second door
 * arrives WITH the hook instead of beside it. `write-owners.test.ts` holds the line.
 *
 * `note` is accepted but unused by both doors today: the endpoint records it on the
 * journal event, and a « pas réglé, voici ce qui reste » field is the obvious next
 * thing. Passing it through costs nothing and keeps the shape honest.
 */
export function useRemarkVerdict() {
  const write = useWrite()
  return useCallback(
    (id: string, action: 'confirm' | 'reopen', note?: string) =>
      write('remarks', { method: 'PATCH', body: { id, action, note }, affectedKeys: [REMARKS_KEY] }),
    [write],
  )
}
