// B-11 (bmad/10) — cercle.css moved out of the eager shell (position-immaterial
// .cercle-*/.cf-* classes); load it whenever this page renders instead.
import '../styles/cercle.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { PetForm } from '../components/cercle/PetForm'
import type { Pet } from '../lib/cercle'

interface CercleData {
  pets?: Pet[]
}

// /cercle/pet/new — add an animal; /cercle/pet/:id — edit. A full-screen scene
// (like the person/recipe/routine builders) so the multi-field care form (photo,
// weight log, vet picker) rides above the mobile keyboard instead of a cramped
// modal. Parent view only; a read-only guest is bounced out.
export function CerclePetPage() {
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

  const pet = editing ? data?.pets?.find((p) => p.id === id) ?? null : null
  // Editing but the pet is gone (loaded + not found → deleted elsewhere) →
  // bounce; still loading → wait.
  if (editing && !pet) return data ? <Navigate to="/maison?section=family" replace /> : <Loading />

  return (
    <div className="scene" aria-label={editing ? t.cercle.pet.edit : t.cercle.pet.add}>
      <SceneHead title={editing ? t.cercle.pet.edit : t.cercle.pet.add} icon="smiley-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        <PetForm
          value={pet}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: CERCLE_KEY })
            qc.invalidateQueries({ queryKey: BOARD_KEY })
            close()
          }}
          onCancel={close}
        />
      </div>
    </div>
  )
}
