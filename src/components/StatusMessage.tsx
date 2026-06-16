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

export function StatusMessage({
  children,
  tone = 'info',
  icon,
  className,
}: {
  children: ReactNode
  tone?: Tone
  icon?: IconName | null
  className?: string
}) {
  const glyph = icon === null ? null : (icon ?? TONE_ICON[tone])
  return (
    <p
      className={`status-msg status-msg--${tone} mono` + (className ? ` ${className}` : '')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {glyph && <InlineIcon name={glyph} />} {children}
    </p>
  )
}
