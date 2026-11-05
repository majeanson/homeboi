import type { ReactNode } from 'react'
import { InlineIcon, type IconName } from './Icon'

// The ONE inline status/feedback line under a form or action. Replaces the
// scattered `.error mono`, `.capture__routed`, voice-status one-offs with a single
// tone-driven line. An error reads as role='alert' (announced at once); success /
// info as role='status' (announced politely). Optional leading icon.
type Tone = 'error' | 'success' | 'info'

const TONE_ICON: Record<Tone, IconName> = {
  error: 'x-bold',
  success: 'check-bold',
  info: 'clock-bold',
}

// `live` (default on) gives the line its live-region role — an error is an alert, the
// rest a status; a line that is READ, not announced (a count beside a list, a hint that
// was there before the reader arrived) passes `live={false}`. `as="span"` for an
// inline host. The nine hand-rolled `<p role="status">` lines folded onto this on
// 2026-11-05 (solidify 2.3); `status-rule.test.ts` refuses a new raw role=status|alert.
export function StatusMessage({
  children,
  tone = 'info',
  icon,
  className,
  live = true,
  as: As = 'p',
}: {
  children: ReactNode
  tone?: Tone
  icon?: IconName | null
  className?: string
  live?: boolean
  as?: 'p' | 'span'
}) {
  const glyph = icon === null ? null : (icon ?? TONE_ICON[tone])
  return (
    <As
      className={'status-msg status-msg--' + tone + ' mono' + (className ? ' ' + className : '')}
      role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}
    >
      {glyph && <InlineIcon name={glyph} />} {children}
    </As>
  )
}
