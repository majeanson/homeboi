import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { HOME_PROJECTS_KEY, BOARD_KEY, MONTH_KEY, CARNETS_KEY } from '../../lib/queryKeys'
import { currentSeason, SEASON_EMOJI, seasonUpkeepItems } from '../../lib/season'
import { formatDayMaybeYear } from '../../lib/format'
import type { HomeProject } from '../operator/types'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { BoardCard } from './BoardCard'
import { Act } from './Act'

// The board « Cette saison » glance — upkeep (home_projects 'upkeep') owed now
// (overdueSince, the calm carry-forward) or due before the season turns over
// (nextAt). The selection is seasonUpkeepItems (lib/season) — the SAME lens the
// Réglages Entretien glance reads, so the two never drift. Rows are checkable
// (the shared Act row: PATCH {id} stamps last_done_at, held behind the undo
// toast; Act itself drops the check for a read-only guest); an owed row wears
// the muted « en attente depuis » line — a date, never a count (NFR-CALM-1).
// Renders NOTHING when nothing's due this season (calm). Non-polling (staleTime)
// so this default-on card never adds /api/home-projects to the board poll.
export function SeasonUpkeepCard() {
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()
  const qc = useQueryClient()
  const write = useWrite()
  const removal = useDeferredRemoval(HOME_PROJECTS_KEY)
  const { data } = useQuery({
    queryKey: HOME_PROJECTS_KEY,
    queryFn: () => api<{ projects: HomeProject[] }>('home-projects'),
    staleTime: 5 * 60_000,
  })
  const s = currentSeason()
  const items = removal.visible(seasonUpkeepItems(data?.projects ?? []))
  const empty = items.length === 0
  useReportEmpty(empty)
  if (empty) return null

  // Check = the board's markHomeDone semantics, through the ONE deferred-removal
  // mechanism: the row hides on every surface in this scope at once, the toast holds
  // the PATCH, and the un-hide waits for a genuinely FRESH frame. That last part is
  // why this site had to move — HOME_PROJECTS_KEY is polled, and the optimistic cache
  // splice it used before could be refilled by the next poll mid-undo, flashing the
  // row back (the resurrection class this repo has already fixed twice).
  const markDone = (p: HomeProject) =>
    removal.remove([p.id], t.undo.choreDone(p.title), async () => {
      // The full HomeProjectForm list: the stamped last_done_at re-derives nextAt,
      // which the month grid and a carnet's rows display too — BOARD alone left
      // them stale until their next poll (invalidation-drift class, 2026-09-03).
      await write('home-projects', {
        method: 'PATCH',
        body: { id: p.id },
        affectedKeys: [BOARD_KEY, HOME_PROJECTS_KEY, MONTH_KEY, CARNETS_KEY],
      })
      void qc.refetchQueries({ queryKey: BOARD_KEY })
    })

  return (
    <BoardCard
      className="carnets-card"
      iconNode={SEASON_EMOJI[s]}
      label={t.season[s]}
      compactItems={items.map((p) => p.title)}
      compactHint={String(items.length)}
    >
      {items.map((p) => (
        <Act
          key={p.id}
          cat="chore"
          title={p.title}
          color={p.color ?? undefined}
          when={
            p.overdueSince != null
              ? t.board.lateSince(formatDayMaybeYear(p.overdueSince, lang))
              : p.snoozedUntil != null
                ? t.operator.home.snoozedUntil(formatDayMaybeYear(p.snoozedUntil, lang))
                : undefined
          }
          onCheck={() => markDone(p)}
          onOpen={p.carnet_id ? () => nav(`/cercle/carnet/${p.carnet_id}`) : undefined}
        />
      ))}
    </BoardCard>
  )
}
