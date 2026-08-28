import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useNotice } from '../lib/toast'

// A deep link that no longer points at anything (bmad/12 #26).
//
// Every scene that opens ONE named thing — a recipe, a cook screen, a planned
// day — already redirected when that thing was gone, silently. From the user's
// side that reads as a broken tap: you follow a link a family member texted, or
// a bookmark from last week, and the app simply lands you on /kitchen with no
// explanation. The commonest cause is entirely ordinary — the recipe was
// deleted or re-imported since — and saying so takes one line.
//
// It rides the existing toast bar's 'notice' kind rather than inventing a
// second surface: same bar, same session log (« Récents »), same auto-dismiss,
// nothing to undo.
//
// Deliberately NOT used for a failed FETCH. « La recette n'existe plus » would
// be a lie when the truth is "we couldn't reach the server" — those paths keep
// their loading/error states.
export function StaleBounce({ to, message }: { to: string; message: string }) {
  const notice = useNotice()
  // Once per mount. StrictMode double-invokes effects in dev, and a duplicate
  // line in the log would read as two separate broken links.
  const said = useRef(false)
  useEffect(() => {
    if (said.current) return
    said.current = true
    notice(message)
  }, [notice, message])
  return <Navigate to={to} replace />
}
