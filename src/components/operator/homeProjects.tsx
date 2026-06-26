import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoableRemove } from '../../lib/undoRemove'
import { isGuest } from '../../lib/device'
import { type HelpMode } from '../../lib/helpMode'
import { HOME_PROJECTS_KEY } from '../../lib/queryKeys'
import { recurLabel } from '../../lib/recurLabel'
import { currentSeason, SEASON_EMOJI, isThisSeason } from '../../lib/season'
import { formatDayMaybeYear } from '../../lib/format'
import { formatMoney } from '../../lib/money'
import { InlineIcon } from '../Icon'
import { ListRow } from '../ListRow'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { SubTabs } from '../SubTabs'
import { OperatorSection } from './OperatorSection'
import { ChoresSection } from './chores'
import { ChoreLedger } from '../ChoreLedger'
import { HomeProjectForm } from '../forms/HomeProjectForm'
import type { Chore, HomeProject } from './types'

// The Réglages ▸ Corvées tab body — sub-tabbed into Corvées (the chores + the
// fairness ledger, unchanged) · Projets · Entretien. The two home-project lists
// share ONE table (kind-filtered); chores keep their own (tasks). One calm pill
// row, "one job at a time".
type ChoresTab = 'corvees' | 'projets' | 'entretien'
export function ChoresTabPanel({ chores, onChange, help }: { chores: Chore[]; onChange: () => void; help?: HelpMode }) {
  const t = useT()
  const [sub, setSub] = useState<ChoresTab>('corvees')
  return (
    <>
      <SubTabs<ChoresTab>
        ariaLabel={t.operator.chores}
        value={sub}
        onSelect={setSub}
        options={[
          { key: 'corvees', label: t.operator.home.subCorvees },
          { key: 'projets', label: t.operator.home.subProjets },
          { key: 'entretien', label: t.operator.home.subEntretien },
        ]}
      />
      {sub === 'corvees' && (
        <>
          <ChoresSection chores={chores} onChange={onChange} />
          <ChoreLedger help={help} />
        </>
      )}
      {sub === 'projets' && <HomeProjectsSection kind="plan" help={help} />}
      {sub === 'entretien' && <HomeProjectsSection kind="upkeep" help={help} />}
    </>
  )
}

// Réglages ▸ Corvées ▸ Projets / Entretien — the longer-horizon home work
// (home_projects). ONE component, parameterized by `kind`: 'plan' (Projets) or
// 'upkeep' (Entretien). Reads the shared ['home-projects'] cache and filters by
// kind; the dated upkeep rows ALSO surface on the board/month. Mirrors
// ChoresSection: in-section add (not the ＋ FAB), edit in place, deferred-undo
// delete; hidden writes for a read-only guest.
function HomeProjectsSection({ kind, help }: { kind: 'plan' | 'upkeep'; help?: HelpMode }) {
  const t = useT()
  const ro = isGuest()
  const [adding, setAdding] = useState(false)
  const projectsQ = useQuery({
    queryKey: HOME_PROJECTS_KEY,
    queryFn: () => api<{ projects: HomeProject[] }>('home-projects'),
  })
  const undoableRemove = useUndoableRemove()
  const write = useWrite()
  const rows = (projectsQ.data?.projects ?? []).filter((p) => (p.kind ?? 'plan') === kind)
  // « Cette saison » — for Entretien only, a calm glance of the upkeep due before the
  // season turns over (derived from the server's nextAt). Read-only; the full editable
  // list stays below. Same lens as the board card, so the two never drift.
  const seasonItems = kind === 'upkeep' ? rows.filter((p) => isThisSeason(p.nextAt)) : []
  const s = currentSeason()

  const c = kind === 'upkeep' ? t.operator.home.entretienTitle : t.operator.home.projetsTitle
  const helpKey = kind === 'upkeep' ? 'homeEntretien' : 'homeProjets'
  const addLabel = kind === 'upkeep' ? t.operator.home.addEntretien : t.operator.home.addProjet
  const emptyLabel = kind === 'upkeep' ? t.operator.home.emptyEntretien : t.operator.home.emptyProjets

  function remove(p: HomeProject) {
    undoableRemove({
      queryKey: HOME_PROJECTS_KEY,
      listProp: 'projects',
      id: p.id,
      label: p.title,
      commit: () => write('home-projects', { method: 'DELETE', body: { id: p.id }, affectedKeys: [HOME_PROJECTS_KEY, ['board'], ['month']] }),
      after: () => {},
    })
  }

  return (
    <OperatorSection title={c} help={help} helpKey={helpKey}>
      {seasonItems.length > 0 && (
        <div className="season-glance">
          <p className="season-glance__head mono">
            <span aria-hidden="true">{SEASON_EMOJI[s]}</span> {t.season[s]}
          </p>
          <ul className="season-glance__list">
            {seasonItems.map((p) => (
              <li key={p.id} className="season-glance__item">{p.title}</li>
            ))}
          </ul>
        </div>
      )}
      {rows.length === 0 && !adding ? (
        <EmptyState>{emptyLabel}</EmptyState>
      ) : (
        <ul className="operator__list">
          {rows.map((p) => (
            <HomeProjectRow key={p.id} project={p} kind={kind} onRemove={() => remove(p)} />
          ))}
        </ul>
      )}
      {/* In-section add (mirrors the cercle Business tab), not the ＋ FAB — creation
          lives here in Réglages. Hidden for a read-only guest. */}
      {!ro &&
        (adding ? (
          <HomeProjectForm kind={kind} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className="btn btn--primary operator__add" onClick={() => setAdding(true)}>
            <InlineIcon name="plus-bold" /> {addLabel}
          </button>
        ))}
    </OperatorSection>
  )
}

// One row. ✏️ expands the SAME form prefilled (one editor for create + edit); 🗑️
// removes it (deferred undo). The subtitle reads the cadence/date + target budget.
function HomeProjectRow({ project, kind, onRemove }: { project: HomeProject; kind: 'plan' | 'upkeep'; onRemove: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const [editing, setEditing] = useState(false)

  if (editing)
    return (
      <li className="operator__chore-row operator__chore-row--editing">
        <HomeProjectForm key={project.id} kind={kind} value={project} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </li>
    )

  const parts: string[] = []
  if (project.recur_json) parts.push(recurLabel(project.recur_json, t))
  else if (project.at) parts.push(formatDayMaybeYear(project.at, lang))
  const money = formatMoney(project.budget_cents, lang)
  if (money) parts.push(money)
  const subtitle = parts.filter(Boolean).join(' · ')

  return (
    <li>
      <ListRow
        leading={<span className="operator__avatar" style={{ background: project.color ?? '#88A36F' }} aria-hidden="true" />}
        title={project.title}
        subtitle={subtitle || undefined}
        actions={
          <RowActions
            onEdit={() => setEditing(true)}
            onDelete={onRemove}
            editLabel={kind === 'upkeep' ? t.operator.home.editEntretien : t.operator.home.editProjet}
            deleteLabel={kind === 'upkeep' ? t.operator.home.deleteEntretien : t.operator.home.deleteProjet}
          />
        }
      />
    </li>
  )
}
