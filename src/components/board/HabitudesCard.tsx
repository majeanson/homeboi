import { Link } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { useAuth } from '../../lib/auth'
import { isGuest } from '../../lib/device'
import { useProfile } from '../../lib/profile'
import { useHabits, dueToday, habitReading, habitStatusOn, habitToday, todaysDefi, useMarkHabit, usePinnedAsking, visibleHabits } from '../../lib/habits'
import { HabitControls } from '../habits/HabitControls'
import { useBoardData } from '../../lib/queryHooks'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { type HelpMode } from '../../lib/helpMode'
import { BoardCard } from './BoardCard'
import { DefiBlock } from '../habits/DefiBlock'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildHabit, type DetailCtx } from '../detail/adapters'

// The board's « Mes habitudes » glance — now fronted by « Le défi du jour » (the
// day-long family défi anyone can try), with the habits still asking today below it.
// Each habit is named with the same quiet line the check-in row uses (« 0 sur 2
// verres »), so the card answers at a glance instead of only promising.
//
// Privacy is the face filter, not a blur: `dueToday` shows the maisonnée's habits
// plus the PICKED face's own — never another member's. Never a count, never a rank.
//
// Self-hides only when there is NOTHING to offer: no défi committed, no habit due,
// and the device can't pige (a guest). An operator/kiosk always sees at least the
// défi's « Pige un défi » invitation — the whole point of the card.
export function HabitudesCard({ help }: { help?: HelpMode }) {
  const t = useT()
  const fn = t.habits
  const { lang } = useLang()
  const { memberId: face } = useProfile()
  const { signedIn } = useAuth()
  // Per-habit peek (buildHabit): today's reading + week count + the edit door —
  // the one place a habit can be MODIFIED without hunting the check-in scene's
  // buried pencil. Members for the owner face ride the already-polled board read.
  const detail = useEntityDetail()
  const members = useBoardData().data?.members ?? []
  const detailCtx: DetailCtx = { t, lang, members }
  // Non-polling: a default-on board card must not add /api/habits to the board
  // poll (the free-tier lever). Realtime nudges refresh it on another device's tap.
  const { data } = useHabits({ live: false })
  const today = habitToday()

  const habits = data?.habits ?? []
  const days = data?.days ?? []
  // Marking happens HERE now (Marc, 2026-11-19: « edit them directly from the card and
  // not go to point du jour every time »): the same HabitControls and the same write as
  // the check-in scene, smaller. A row marked here stays until tomorrow (usePinnedAsking),
  // so « C'est fait » can be taken back and a tally's second tap has somewhere to land.
  const markHabit = useMarkHabit()
  const canMark = !isGuest()
  const asking = dueToday(habits, days, face, today)
  const pinned = usePinnedAsking(asking, today)
  const due = visibleHabits(habits, face).filter((h) => pinned.has(h.id) || asking.includes(h))

  // The défi surface shows for anyone who can pige (operator/kiosk) or whenever a
  // défi is already committed today (a guest sees it read-only). Only when there is
  // no défi AND nothing can pige AND no habit is due does the card fall away.
  const defi = todaysDefi(data, today)
  const canPige = !isGuest()
  const empty = !defi && !canPige && due.length === 0
  // Tell the slot BEFORE returning null (lib/useReportEmpty): a null render is
  // indistinguishable from a card that is still loading.
  useReportEmpty(empty)
  if (empty) return null

  return (
    <BoardCard
      className="habitudes-card"
      icon="repeat-bold"
      label={fn.title}
      ariaLabel={fn.checkin}
      // Compact: name the habits still asking, exactly as the rows below do. Never
      // per-person, never a streak or a rank (calm). The défi is a full-lens feature.
      compactItems={asking.map((h) => h.title)}
      compactHint={asking.length ? String(asking.length) : fn.defi.title}
    >
      {/* « Le défi du jour » — the shared défi surface (also mounted in « Le point
          du jour »). Its own buttons are why this card no longer wraps everything in
          a Link (a nested <button> inside <Link> is invalid). */}
      <DefiBlock payload={data} today={today} help={help} />

      {/* The habits still asking today, each marked right on its row. The name opens its
          own peek (buildHabit: today's reading, the week, the owner — and the « Modifier »
          door), the same tap-the-thing pattern as every other board row. « Le point du
          jour » keeps its door below for history, other faces and paused habits. */}
      {due.length > 0 && (
        <ul className="habitudes-card__list">
          {due.map((h) => {
            const status = habitStatusOn(h, days, today)
            const reading = habitReading(h, status, fn)
            return (
              <li key={h.id} className={'habitudes-card__item' + (status.settled ? ' is-settled' : '')}>
                <button
                  type="button"
                  className="habitudes-card__row"
                  onClick={() => detail.open(buildHabit(h, detailCtx, { days, today, canEdit: signedIn && !isGuest() }))}
                >
                  <span className="habitudes-card__ico" aria-hidden="true">
                    {h.icon || '•'}
                  </span>
                  <span className="habitudes-card__title">{h.title}</span>
                  {reading && <span className="habitudes-card__sub mono">{reading}</span>}
                </button>
                {canMark && <HabitControls habit={h} status={status} size="sm" className="habitudes-card__acts" onMark={(next) => markHabit(h, today, next)} />}
              </li>
            )
          })}
        </ul>
      )}
      <Link to="/board/habitudes" className="habitudes-card__open" aria-label={fn.checkin}>
        {fn.checkin}
      </Link>
    </BoardCard>
  )
}
