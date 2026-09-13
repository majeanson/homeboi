import { useQuery } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isGuest } from '../lib/device'
import { live } from '../lib/query'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { TODO_TEMPLATES_KEY } from '../lib/queryKeys'
import { type TemplatesData, expandSectioned } from '../lib/todos'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { TemplateEditor } from '../components/todos/TemplateEditor'

// Where the ✕ lands on a cold deep-link: the section this scene belongs to.
const SETTINGS = '/settings?tab=maison&sub=routines&focus=todoTemplates'

// /liste-modele/:id — ONE « liste à compléter » (a todo template) edited on its own
// full-screen scene. Réglages ▸ Maison used to render every list's editor open at
// once, which turned the panel into a wall of fields you had to read past to find
// the one you came for; the section is now a short row per list, and its ✏ lands
// here. Scene-not-sheet is the standing rule for anything you TYPE into at length
// (the item field + rename strand under the mobile keyboard in a height-capped box).
//
// Operator-only: a read-only guest and an unsigned device bounce back to Réglages.
export function TodoTemplatePage() {
  const t = useT()
  const { id } = useParams()
  const { signedIn, loading } = useAuth()
  const close = useSceneClose(SETTINGS)
  useEscapeKey(close)
  const { data } = useQuery({
    queryKey: TODO_TEMPLATES_KEY,
    queryFn: () => api<TemplatesData>('todo-templates'),
    ...live,
    enabled: signedIn && !isGuest(),
  })

  // Wait for the auth check before bouncing — a transient loading=false flash would
  // redirect a signed-in operator on a cold deep-link (the FormScene precedent).
  if (!loading && !signedIn) return <Navigate to={SETTINGS} replace />
  if (isGuest()) return <Navigate to={SETTINGS} replace />

  const templates = data?.templates ?? []
  const tpl = templates.find((x) => x.id === id) ?? null
  // A list deleted from another device (or a stale link) — back to the section
  // rather than an empty scene with nothing to edit. `data === undefined` is the
  // "still loading" test, not `status`: a failed poll keeps the last good frame.
  if (data !== undefined && !tpl) return <Navigate to={SETTINGS} replace />

  return (
    <div className="scene" aria-label={tpl?.title ?? t.todos.templatesTitle}>
      <SceneHead
        title={tpl?.title ?? t.todos.templatesTitle}
        subtitle={tpl ? t.todos.templateItemsCount(expandSectioned(templates, tpl.id).length) : undefined}
        icon="check-square-bold"
        card="todos"
        onClose={close}
      />
      <div className="scene__body">{tpl ? <TemplateEditor templates={templates} tpl={tpl} /> : <Loading />}</div>
    </div>
  )
}
