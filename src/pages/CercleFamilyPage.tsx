import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, useParams } from 'react-router-dom'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { isGuest } from '../lib/device'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { CERCLE_KEY, BOARD_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { Loading } from '../components/Fallback'
import { FamilyBuilder } from '../components/cercle/FamilyBuilder'
import { unifyCircle, type Contact, type ContactLink, type Member, type ContactGroupRaw } from '../lib/cercle'

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups?: ContactGroupRaw[]
}

// /cercle/family/new — build a new family; /cercle/family/:groupId — extend an
// existing family group. A full-screen scene (like the contact + recipe builders)
// so the roster, the bands and the mobile keyboard all have room. Parent-only —
// a read-only guest is bounced (contacts/links are shared household writes).
export function CercleFamilyPage() {
  const t = useT()
  const qc = useQueryClient()
  const { groupId } = useParams()
  const close = useSceneClose('/cercle')
  useEscapeKey(close)

  const { data } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle') })

  if (isGuest()) return <Navigate to="/cercle" replace />
  if (!data) return <Loading />

  // Collapse member + linked contact into one person, and remap links/group keys onto
  // the member — so the builder shows each human once and links attach to one node.
  const unified = unifyCircle(data.contacts, data.members, data.links, data.groups ?? [])
  const group = groupId ? unified.groups.find((g) => g.id === groupId) ?? null : null
  // Editing but the group is gone (loaded + not found) → bounce back to the directory.
  if (groupId && !group) return <Navigate to="/cercle" replace />

  return (
    <div className="scene" aria-label={t.cercle.familyBuild}>
      <SceneHead title={t.cercle.familyBuild} icon="tree-bold" card="cercle" onClose={close} />
      <div className="scene__body">
        <FamilyBuilder
          people={unified.people}
          links={unified.links}
          group={group}
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
