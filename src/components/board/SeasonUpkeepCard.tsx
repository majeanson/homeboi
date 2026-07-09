import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { HOME_PROJECTS_KEY } from '../../lib/queryKeys'
import { currentSeason, SEASON_EMOJI, isThisSeason } from '../../lib/season'
import type { HomeProject } from '../operator/types'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { BoardCard } from './BoardCard'

// The board « Cette saison » glance — recurring upkeep (home_projects 'upkeep') whose
// next occurrence falls before the season turns over: "🔥 changer le filtre", "🍂
// gouttières". DERIVED from the server's nextAt (no rows), so a calm seasonal to-do a
// calendar buries. Renders NOTHING when nothing's due this season (calm). Non-polling
// (staleTime) so this default-on card never adds /api/home-projects to the board poll.
export function SeasonUpkeepCard() {
  const t = useT()
  const { data } = useQuery({
    queryKey: HOME_PROJECTS_KEY,
    queryFn: () => api<{ projects: HomeProject[] }>('home-projects'),
    staleTime: 5 * 60_000,
  })
  const s = currentSeason()
  const items = (data?.projects ?? []).filter((p) => (p.kind ?? 'plan') === 'upkeep' && isThisSeason(p.nextAt))
  const empty = items.length === 0
  useReportEmpty(empty)
  if (empty) return null

  return (
    <BoardCard className="carnets-card" iconNode={SEASON_EMOJI[s]} label={t.season[s]}>
      <ul className="carnets-card__list">
        {items.map((p) =>
          p.carnet_id ? (
            <li key={p.id} className="carnets-card__row">
              <Link to={`/cercle/carnet/${p.carnet_id}`} className="carnets-card__open">
                <span className="carnets-card__name">{p.title}</span>
              </Link>
            </li>
          ) : (
            <li key={p.id} className="carnets-card__row">
              <span className="carnets-card__name">{p.title}</span>
            </li>
          ),
        )}
      </ul>
    </BoardCard>
  )
}
