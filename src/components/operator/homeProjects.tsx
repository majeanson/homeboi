import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useUndoableRemove } from '../../lib/undoRemove'
import { useAuth } from '../../lib/auth'
import { isGuest } from '../../lib/device'
import { type HelpMode } from '../../lib/helpMode'
import { HOME_PROJECTS_KEY, BOARD_KEY } from '../../lib/queryKeys'
import { recurLabel } from '../../lib/recurLabel'
import { fold } from '../../lib/normalize'
import { useCarnets } from '../../lib/carnets'
import { SEASON_SEEDS, nextAnchorSec, useHiddenSeeds, hideSeed, type SeasonSeed } from '../../lib/year'
import { Cluster } from '../Layout'
import { currentSeason, SEASON_EMOJI, seasonUpkeepItems } from '../../lib/season'
import { formatDayMaybeYear } from '../../lib/format'
import { formatMoney } from '../../lib/money'
import { InlineIcon } from '../Icon'
import { ListRow } from '../ListRow'
import { colourFor } from '../../lib/things'
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
  const { lang } = useLang()
  const ro = isGuest()
  const nav = useNavigate()
  const { signedIn } = useAuth()
  const projectsQ = useQuery({
    queryKey: HOME_PROJECTS_KEY,
    queryFn: () => api<{ projects: HomeProject[] }>('home-projects'),
  })
  const undoableRemove = useUndoableRemove()
  const write = useWrite()
  const rows = (projectsQ.data?.projects ?? []).filter((p) => (p.kind ?? 'plan') === kind)
  // A-4 (bmad/09): the FR-CA season-ritual SEEDS (lib/year). Offered here —
  // inside the normal Entretien section — and accepting one just POSTs a
  // normal upkeep row (recurrence + week-scale lead + carnet link), so it
  // rides the whole existing machinery: board occurrences, ledger, the
  // carnet's cadence line. A seed hides once ANY row already covers it
  // (keyword match) or once this device dismissed it with ✕.
  const hidden = useHiddenSeeds()
  const { data: carnetsData } = useCarnets({ live: false })
  const seeds =
    kind === 'upkeep' && !ro
      ? SEASON_SEEDS.filter(
          (seed) =>
            !hidden.includes(seed.id) &&
            !rows.some((p) => seed.match.some((k) => fold(p.title).includes(k))),
        )
      : []
  function addSeed(seed: SeasonSeed) {
    const carnet = seed.carnetKind ? (carnetsData?.carnets ?? []).find((x) => x.kind === seed.carnetKind) : undefined
    void write('home-projects', {
      method: 'POST',
      body: {
        kind: 'upkeep',
        title: seed.title[lang],
        at: nextAnchorSec(seed.anchor),
        recur: seed.recur,
        leadSeconds: seed.leadWeeks * 7 * 86_400, // A-6: annual rituals get week-scale « Bientôt »
        carnetId: carnet?.id ?? null,
      },
      affectedKeys: [HOME_PROJECTS_KEY, BOARD_KEY, ['month']],
    })
  }
  // « Cette saison » — for Entretien only, a calm glance of the upkeep owed now or
  // due before the season turns over. seasonUpkeepItems (lib/season) is the ONE
  // selection the board card reads too, so the two never drift. Read-only; the
  // full editable list stays below.
  const seasonItems = kind === 'upkeep' ? seasonUpkeepItems(rows) : []
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
      commit: () => write('home-projects', { method: 'DELETE', body: { id: p.id }, affectedKeys: [HOME_PROJECTS_KEY, BOARD_KEY, ['month']] }),
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
              <li key={p.id} className="season-glance__item">
                {p.title}
                {/* The carry-forward, calmly: a muted date, never a count. */}
                {p.overdueSince != null && (
                  <span className="operator__hint mono"> · {t.board.lateSince(formatDayMaybeYear(p.overdueSince, lang))}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {seeds.length > 0 && (
        <div className="season-seeds">
          <p className="operator__seg-label mono">{t.operator.home.seedsTitle}</p>
          <p className="operator__hint mono">{t.operator.home.seedsHint}</p>
          {seeds.map((seed) => (
            <Cluster key={seed.id}>
              <button type="button" className="btn btn--sm" onClick={() => addSeed(seed)}>
                <InlineIcon name="plus-bold" size={14} /> <span aria-hidden="true">{seed.emoji}</span>{' '}
                {seed.title[lang]} · {recurLabel(JSON.stringify(seed.recur), t)}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => hideSeed(seed.id)}
                aria-label={t.operator.home.seedDismiss}
                title={t.operator.home.seedDismiss}
              >
                <InlineIcon name="x-bold" size={14} />
              </button>
            </Cluster>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState guide={{ card: 'set-chores', point: 8 }}>{emptyLabel}</EmptyState>
      ) : (
        <ul className="operator__list">
          {rows.map((p) => (
            <HomeProjectRow key={p.id} project={p} kind={kind} onRemove={() => remove(p)} />
          ))}
        </ul>
      )}
      {/* Add = the full-screen /home-project/new scene, the SAME one the board ＋ « Corvées »
          sub-choice opens. It used to unfold the form in place, at the bottom of the list —
          so on a long list the form you just asked for opened below the fold. A many-field
          form belongs in a scene anyway (FormScene: a height-capped sheet/section strands
          its inputs under the mobile keyboard). Editing stays in place on its row — that's
          anchored to what you tapped, not stranded at the end.
          Hidden for a read-only guest AND for an unsigned kiosk: FormScene is operator-only
          (it bounces an unsigned device to /board), so a kiosk would tap a button that just
          throws it off the page. Creating this is an operator job anyway — the board ＋ already
          hides « Corvées » from a kiosk (OPERATOR_MODES). */}
      {!ro && signedIn && (
        <button
          type="button"
          className="btn btn--primary operator__add"
          onClick={() => nav(`/home-project/new?kind=${kind}`)}
        >
          <InlineIcon name="plus-bold" /> {addLabel}
        </button>
      )}
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
  if (project.recur_json) {
    parts.push(recurLabel(project.recur_json, t))
    // « à partir de la dernière fois » (recur_from='done') — name the re-anchor mode
    // so two same-cadence rows don't read identical when they schedule differently.
    if (project.recur_from === 'done') parts.push(t.operator.home.fromLastDoneShort)
  } else if (project.at) parts.push(formatDayMaybeYear(project.at, lang))
  // « Reporté au … » — an active postpone is worth naming here, or a quiet row
  // reads as mysteriously absent from the board.
  if (project.snoozedUntil != null) parts.push(t.operator.home.snoozedUntil(formatDayMaybeYear(project.snoozedUntil, lang)))
  const money = formatMoney(project.budget_cents, lang)
  if (money) parts.push(money)
  const subtitle = parts.filter(Boolean).join(' · ')

  return (
    <li>
      <ListRow
        leading={<span className="operator__avatar" style={{ background: colourFor('project', project.color) }} aria-hidden="true" />}
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
