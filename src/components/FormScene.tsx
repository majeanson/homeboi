import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { MEMBERS_KEY } from '../lib/queryKeys'
import { imgUrl } from '../lib/image'
import { type IconName } from './Icon'
import { type MemberFace } from './MemberSwitcher'
import { SceneHead } from './SceneHead'

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
  // The face tint + optional photo avatar the /api/members row already carries, so
  // the forms' face pickers (MemberPicker) render real colours/photos, not just a
  // neutral initial. avatar_kind === 'photo' → avatar_ref is the R2 key.
  colour: string | null
  avatar_kind: string
  avatar_ref: string
}

// Map a household member row (as /api/members returns it) to the shared MemberFace
// shape the face pickers (MemberSwitcher / MemberPicker) consume — resolving the R2
// photo URL HERE so those primitives stay presentational. Everything past
// id/display_name is optional so a narrowed board-members shape (DayPlanPage's
// board query, the chores cache) still maps: it just falls back to the coloured
// initial. Shared by every operator form's member picker.
export function toFace(m: {
  id: string
  display_name: string
  colour?: string | null
  avatar_kind?: string | null
  avatar_ref?: string | null
}): MemberFace {
  return {
    id: m.id,
    name: m.display_name,
    colour: m.colour ?? null,
    photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
  }
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
  const { signedIn, loading } = useAuth()
  const close = useSceneClose(fallback)
  useEscapeKey(close)
  const { data } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: FormMember[] }>('members'),
    enabled: signedIn,
  })

  // Wait for the auth check before bouncing — a transient loading=false flash
  // would otherwise redirect a signed-in operator on a cold deep-link.
  if (!loading && !signedIn) return <Navigate to={fallback} replace />
  // Read-only guest (incl. the operator's settings preview, which IS signed in so
  // the check above won't catch it): these are pure create forms — bounce out.
  if (isGuest()) return <Navigate to={fallback} replace />

  const members = data?.members ?? []
  return (
    <div className="scene" aria-label={title}>
      <SceneHead title={title} icon={icon} onClose={close} />
      <div className="scene__body">{children(members, close)}</div>
    </div>
  )
}
