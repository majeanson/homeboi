// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY, A_REGLER_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { ContactForm } from '../components/cercle/ContactForm'
import type { Contact, ContactLink, Member, ContactGroupRaw } from '../lib/cercle'

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups?: ContactGroupRaw[]
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
  const close = useSceneClose('/maison?section=family')
  useEscapeKey(close)

  const { data } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<CercleData>('cercle'),
  })

  if (isGuest()) return <Navigate to="/maison?section=family" replace />

  const contact = editing ? data?.contacts.find((c) => c.id === id) ?? null : null
  // Editing but the contact is gone (loaded + not found → deleted elsewhere) →
  // bounce; still loading → wait.
  if (editing && !contact) return data ? <Navigate to="/maison?section=family" replace /> : <Loading />

  return (
    <div className="scene" aria-label={editing ? t.cercle.editPerson : t.cercle.newPerson}>
      <SceneHead title={editing ? t.cercle.editPerson : t.cercle.newPerson} icon="user-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        <ContactForm
          value={contact}
          contacts={data?.contacts ?? []}
          links={data?.links ?? []}
          members={data?.members ?? []}
          groups={data?.groups ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: CERCLE_KEY })
            qc.invalidateQueries({ queryKey: BOARD_KEY })
            // Editing a person feeds the « À régler » heads-up (e.g. a birthday's gift
            // idea just filled in). Without this, the polled signal lingered up to its
            // 5-min staleTime, so the « aucune idée de cadeau » warning cleared late.
            qc.invalidateQueries({ queryKey: A_REGLER_KEY })
            close()
          }}
        />
      </div>
    </div>
  )
}
