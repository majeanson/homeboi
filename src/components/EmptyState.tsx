import type { ReactNode } from 'react'

// The ONE "nothing here, and that's fine" line. Empty states were scattered across
// ~7 class names (feed-empty, board__empty, *-empty…); this is the calm default —
// a quiet, balanced line, never a stray dash or an alarm. `tone='calm'` adds a
// touch more breathing room for the deliberate "nothing planned tonight" case.
// role='status' so a screen reader announces it when a list empties.
export function EmptyState({
  children,
  tone = 'plain',
  className,
}: {
  children: ReactNode
  tone?: 'plain' | 'calm'
  className?: string
}) {
  return (
    <p
      className={'empty-state' + (tone === 'calm' ? ' empty-state--calm' : '') + (className ? ` ${className}` : '')}
      role="status"
    >
      {children}
    </p>
  )
}
