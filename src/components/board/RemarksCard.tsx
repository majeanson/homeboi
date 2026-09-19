import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { BoardCard } from './BoardCard'
import { ListRow } from '../ListRow'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { isGuest } from '../../lib/device'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { REMARKS_KEY } from '../../lib/queryKeys'
import { type Remark, KIND_LABEL, STATUS_LABEL } from '../../lib/remarks'

const TO = '/settings?tab=settings&sub=tablets&focus=remarks'

// « Les remarques » on the board (0136) — what is still waiting on someone, and nothing
// else.
//
// IT SHOWS `open` AND `shipped`, NEVER `confirmed`. A card that kept listing what is
// already settled would never empty, and a list that never empties is the opposite of
// what this app promises. So it is a finite list that drains: you file a remark, it sits
// there, a deploy turns it « expédiée », you tap « C'est réglé » in Réglages — and the
// row leaves the wall. `mode: 'auto'` then hides the card entirely.
//
// NO COUNT ON THE HEADER, deliberately. `BoardCard` takes one and most cards use it, but
// « 3 » here would be a score for how broken the app is, sitting on a kitchen wall. The
// rows are the information.
//
// ListRow, NOT `Act`. Act is the board's ACTIVITY row and its `cat` is a closed union of
// household categories (event/meal/chore/list/pantry/routine/birthday/cercle/work) that
// drives colour and glyph. A remark is not one of those, and picking the nearest one
// would be a category error wearing the right component.
//
// A guest sees nothing. That is the MotsCard / home-pins privacy hide, not a permission
// check: an operator can mint a showcase link to their own household, and a babysitter
// has no standing to read what this family thinks of its own board.
export function RemarksCard() {
  const t = useT()
  const ro = isGuest()
  const { data } = useQuery({
    queryKey: REMARKS_KEY,
    queryFn: () => api<{ remarks: Remark[] }>('remarks'),
    ...live,
    enabled: !ro,
  })
  const rows = (data?.remarks ?? []).filter((r) => r.status !== 'confirmed')

  // Never a bare `return null`: the slot cannot tell empty from loading, and a card in
  // mode 'always' needs to know.
  useReportEmpty(rows.length === 0)
  if (ro || rows.length === 0) return null

  return (
    <BoardCard
      className="bento"
      label={t.remarks.title}
      icon="warning-bold"
      to={TO}
      compactItems={rows.map((r) => r.title)}
    >
      <ul className="operator__list">
        {rows.map((r) => (
          <li key={r.id}>
            <ListRow
              title={
                <Link to={TO} className="listrow__link">
                  {r.title}
                </Link>
              }
              // Genre and state as plain words. « Expédiée » is the interesting one: the
              // fix is really in production, and the row is asking someone to go look.
              subtitle={`${KIND_LABEL(t, r.kind)} · ${STATUS_LABEL(t, r.status)}`}
            />
          </li>
        ))}
      </ul>
    </BoardCard>
  )
}
