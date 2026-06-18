import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { ContactForm } from '../components/cercle/ContactForm'
import type { Contact, ContactLink, Member } from '../lib/cercle'

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
}

// /cercle/person/new — add someone; /cercle/person/:id — edit. A full-screen
// scene (like the recipe/routine builders) so the multi-field form rides above
// the mobile keyboard. Works for any paired device in parent view (contacts are
// shared household data, like routines); a read-only guest is bounced out.
export function CercleFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const { id } = useParams()
  const editing = !!id
  const close = useSceneClose('/cercle')
  useEscapeKey(close)

  const { data } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<CercleData>('cercle'),
  })

  if (isGuest()) return <Navigate to="/cercle" replace />

  const contact = editing ? data?.contacts.find((c) => c.id === id) ?? null : null
  // Editing but the contact is gone (loaded + not found → deleted elsewhere) →
  // bounce; still loading → wait.
  if (editing && !contact) return data ? <Navigate to="/cercle" replace /> : <Loading />

  return (
    <div className="scene" aria-label={editing ? t.cercle.editPerson : t.cercle.newPerson}>
      <SceneHead title={editing ? t.cercle.editPerson : t.cercle.newPerson} icon="user-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        <ContactForm
          value={contact}
          contacts={data?.contacts ?? []}
          links={data?.links ?? []}
          members={data?.members ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: CERCLE_KEY })
            qc.invalidateQueries({ queryKey: BOARD_KEY })
            close()
          }}
        />
      </div>
    </div>
  )
}
