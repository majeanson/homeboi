import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { loadStateOf } from '../components/Fallback'
import { FormDelete } from '../components/FormDelete'
import { FormScene } from '../components/FormScene'
import { HomeProjectForm } from '../components/forms/HomeProjectForm'
import type { HomeProject } from '../components/operator/types'
import { useChoreRemovals } from '../components/detail/EntityRemovals'
import { useOperatorT } from '../i18n.operator'
import { api } from '../lib/api'
import { HOME_PROJECTS_KEY, MONTH_KEY, BOARD_KEY, TASKS_KEY } from '../lib/queryKeys'

// /home-project/new?kind=plan|upkeep — add a Projet (plan) or Entretien (upkeep) as a
// full-screen scene: the board ＋, the Tâches view and a carnet's section all land here.
// /home-project/:id edits one, the door every peek's « Modifier » opens. Mirrors ChoreFormPage.
export function HomeProjectFormPage() {
  const o18n = useOperatorT()
  const qc = useQueryClient()
  const { id } = useParams()
  const [params] = useSearchParams()
  const removals = useChoreRemovals()
  const q = useQuery({ queryKey: HOME_PROJECTS_KEY, queryFn: () => api<{ projects: HomeProject[] }>('home-projects'), enabled: !!id })
  const project = id ? q.data?.projects.find((p) => p.id === id) : undefined
  const wait = id && !project ? loadStateOf(q) : null
  const kind: 'plan' | 'upkeep' = project?.kind ?? (params.get('kind') === 'upkeep' ? 'upkeep' : 'plan')
  // ?carnet=<id> — added from a carnet's « Entretien » section, so the row files itself
  // back onto that carnet (the section is a filtered view of the same home_projects).
  const carnetId = params.get('carnet')
  const addTitle = kind === 'upkeep' ? o18n.home.addEntretien : o18n.home.addProjet
  const editTitle = kind === 'upkeep' ? o18n.home.editEntretien : o18n.home.editProjet
  return (
    <FormScene card="set-chores" title={id ? editTitle : addTitle} icon={kind === 'upkeep' ? 'gear-six-bold' : 'paint-brush-bold'} fallback="/board?view=taches" kiosk={!!id}>
      {(members, close) =>
        wait ?? (
          <>
            <HomeProjectForm
              key={project?.id ?? 'new'}
              kind={kind}
              value={project ?? null}
              members={members}
              carnetId={project ? undefined : (carnetId ?? undefined)}
              onSaved={() => {
                qc.invalidateQueries({ queryKey: HOME_PROJECTS_KEY })
                qc.invalidateQueries({ queryKey: BOARD_KEY })
                qc.invalidateQueries({ queryKey: TASKS_KEY })
                qc.invalidateQueries({ queryKey: MONTH_KEY }) // dated upkeep surfaces on the calendar + day page
                close()
              }}
            />
            {project && (
              <FormDelete
                label={kind === 'upkeep' ? o18n.home.deleteEntretien : o18n.home.deleteProjet}
                onDelete={() => {
                  removals.removeHome({ id: project.id, title: project.title })
                  close()
                }}
              />
            )}
          </>
        )
      }
    </FormScene>
  )
}
