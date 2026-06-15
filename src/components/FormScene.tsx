import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { useAuth } from '../lib/auth'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { Icon, InlineIcon, type IconName } from './Icon'

// Shared shell for the operator add-forms (event / chore / routine). These used
// to be tall forms inside the ＋ bottom-sheet, where a multi-field form strands
// its inputs under the mobile keyboard (a sheet is a height-capped box floating
// ABOVE the keyboard — there's not enough room above it for a long form). As a
// full-screen .scene they pin to the VISIBLE viewport (top:--vvt, height:--vvh)
// and scroll their body, so the focused field always rides above the keyboard —
// the same pattern the recipe builder / quick-add / cashier scenes already use.
//
// One shell, three pages: each page hands in its title, glyph, the form, and the
// query keys to refresh on save. Members are fetched here (every form needs the
// household roster). Operator-only: an unsigned device (kiosk / stray deep-link)
// has no business here, so it's bounced back to the fallback route.
export interface FormMember {
  id: string
  display_name: string
  is_child: number
}

export function FormScene({
  title,
  icon,
  fallback,
  children,
}: {
  title: string
  icon: IconName
  fallback: string
  // Render-prop so the page can wire the form's onSaved (invalidate + close).
  children: (members: FormMember[], close: () => void) => ReactNode
}) {
  const t = useT()
  const { signedIn, loading } = useAuth()
  const close = useSceneClose(fallback)
  useEscapeKey(close)
  const { data } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: FormMember[] }>('members'),
    enabled: signedIn,
  })

  // Wait for the auth check before bouncing — a transient loading=false flash
  // would otherwise redirect a signed-in operator on a cold deep-link.
  if (!loading && !signedIn) return <Navigate to={fallback} replace />

  const members = data?.members ?? []
  return (
    <div className="scene" aria-label={title}>
      <div className="scene__head">
        <h2 className="pm-sheet__title">
          <InlineIcon name={icon} /> {title}
        </h2>
        <button type="button" className="btn btn--ghost mono" onClick={close} aria-label={t.common.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>
      <div className="scene__body">{children(members, close)}</div>
    </div>
  )
}
