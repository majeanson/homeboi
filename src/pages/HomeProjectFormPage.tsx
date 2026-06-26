import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FormScene } from '../components/FormScene'
import { HomeProjectForm } from '../components/forms/HomeProjectForm'
import { useT } from '../i18n'
import { HOME_PROJECTS_KEY, MONTH_KEY, BOARD_KEY } from '../lib/queryKeys'

// /home-project/new?kind=plan|upkeep — add a Projet (plan) or Entretien (upkeep)
// as a full-screen scene, the create path the board ＋ « Corvées » sub-choice
// uses (Réglages ▸ Corvées still edits these inline). Mirrors ChoreFormPage; the
// home-project form needs no member roster, so FormScene's members arg is unused.
export function HomeProjectFormPage() {
  const t = useT()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const kind: 'plan' | 'upkeep' = params.get('kind') === 'upkeep' ? 'upkeep' : 'plan'
  const title = kind === 'upkeep' ? t.operator.home.addEntretien : t.operator.home.addProjet
  return (
    <FormScene title={title} icon={kind === 'upkeep' ? 'gear-six-bold' : 'paint-brush-bold'} fallback="/board">
      {(_members, close) => (
        <HomeProjectForm
          kind={kind}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: HOME_PROJECTS_KEY })
            qc.invalidateQueries({ queryKey: BOARD_KEY })
            qc.invalidateQueries({ queryKey: MONTH_KEY }) // dated upkeep surfaces on the calendar + day page
            close()
          }}
        />
      )}
    </FormScene>
  )
}
