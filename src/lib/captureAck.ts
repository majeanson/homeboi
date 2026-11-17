import type { Lang } from '../i18n'
import { formatDay, formatDayTime } from './format'

// What a capture SAYS it did: « Ajouté : Rendez-vous · dentiste · Léa · mar. 24 nov., 15 h 00 ».
//
// Review #10 (2026-11-17): a stranger typed the landing's own example and read back
// « Ajouté : dentiste · Léa »: no kind, no day. « mardi » typed on a Tuesday means NEXT
// Tuesday, which the week on screen could not show, so the one proof that the magic had
// worked was missing. The server now returns the day it filed on (`when`, plus a meal's
// `slot`); this turns it into the line, ONE spelling for the inline confirmation, the
// undo toast and the ＋ sheet.

export type CaptureKind = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'leftover' | 'note'

export type RoutedAck = { kind: string; label: string; when?: { at: number; allDay: boolean }; slot?: string }

export type AckCopy = {
  routed: string
  types: Record<CaptureKind, string>
  slots: Record<string, string>
}

export function captureAck(r: RoutedAck, copy: AckCopy, lang: Lang): string {
  // A meal names its place in the day (« Dîner » is lunch here, never « Souper »).
  const kind = (r.kind === 'meal' && r.slot && copy.slots[r.slot]) || copy.types[r.kind as CaptureKind] || ''
  const when = r.when ? (r.when.allDay ? formatDay(r.when.at, lang) : formatDayTime(r.when.at, lang)) : ''
  return [copy.routed, [kind, r.label, when].filter(Boolean).join(' · ')].join(' ')
}
