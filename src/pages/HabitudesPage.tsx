import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import '../styles/habits.css'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { isGuest } from '../lib/device'
import { useProfile } from '../lib/profile'
import { useWrite } from '../lib/write'
import { imgUrl } from '../lib/image'
import { type Member } from '../lib/members'
import { HABITS_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import {
  useHabits,
  habitStatusOn,
  visibleHabits,
  isDaySettled,
  dayRow,
  habitToday,
  type Habit,
  type HabitsPayload,
} from '../lib/habits'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Disclosure } from '../components/Disclosure'
import { MemberSwitcher, type MemberFace } from '../components/MemberSwitcher'
import { HabitRow } from '../components/habits/HabitRow'
import { HabitHistory } from '../components/habits/HabitHistory'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// « Le point du jour » — the daily check-in scene for « Mes habitudes ». A
// full-screen route (the « Avant de partir » shape), opened first thing on a new
// local day by the shell trigger, by a reminder time, or on demand from the board.
//
// Private-ish by face: a picked face sees THEIR habits plus the maisonnée-wide
// ones; « Maisonnée » sees only the household ones. Nothing here compares members.
// Habits still asking lead; settled ones fold away under « Déjà réglé » so the day
// empties and stays empty (NFR-CALM-4).

export function HabitudesPage() {
  const t = useT()
  const fn = t.habits
  const close = useSceneClose('/board')
  useEscapeKey(close)

  const { memberId: face, setMemberId } = useProfile()
  const write = useWrite()
  const ro = isGuest()
  const today = habitToday()
  const [openId, setOpenId] = useState<string | null>(null)

  const { data } = useHabits()
  const habits = data?.habits ?? []
  const days = data?.days ?? []

  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') }).data?.members ?? []
  const faces: MemberFace[] = members.map((m) => ({
    id: m.id,
    name: m.display_name,
    colour: m.colour,
    photoUrl: m.avatar_kind === 'photo' && m.avatar_ref ? imgUrl(m.avatar_ref) : null,
  }))

  const mine = visibleHabits(habits, face)
  const isAsking = (h: Habit) => habitStatusOn(h, days, today).due && !isDaySettled(h, dayRow(days, h.id, today))

  // A row must never be yanked out from under a finger. A `count` habit settles
  // only at its target, but a `limit` one settles on the FIRST ＋1 — if the list
  // re-partitioned on every tap, the second cigarette would have nowhere to land,
  // and a logged slip would vanish before you read its confirmation. So every habit
  // seen ASKING during this visit is pinned to the list: it settles in place (quietly
  // dimmed) and only folds away the next time the scene opens. The set accumulates
  // rather than snapshotting once, because picking a face reveals more habits — a
  // one-shot snapshot would let those jump into the fold on their first tap.
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set())
  const askingNow = mine.filter(isAsking)
  useEffect(() => {
    const fresh = askingNow.filter((h) => !pinned.has(h.id)).map((h) => h.id)
    if (fresh.length) setPinned((p) => new Set([...p, ...fresh]))
  }, [askingNow, pinned])

  const inList = (h: Habit) => pinned.has(h.id) || isAsking(h)
  const asking = mine.filter(inList)
  const settled = mine.filter((h) => !inList(h))

  // The check-in write: an ABSOLUTE per-day value, upserted on (habit, day). The
  // optimistic patch mirrors the server's upsert so the tap lands instantly and a
  // replayed offline write converges on the same row rather than double-counting.
  const mark = (habit: Habit, next: { value: number; slips?: number }) => {
    const body = { id: habit.id, mark: { day: today, value: next.value, slips: next.slips ?? 0 } }
    void write('habits', {
      method: 'PATCH',
      body,
      affectedKeys: [HABITS_KEY],
      optimistic: (qc) =>
        qc.setQueryData<HabitsPayload>(HABITS_KEY, (cur) => {
          if (!cur) return cur
          const rest = cur.days.filter((d) => !(d.habit_id === habit.id && d.day === today))
          return {
            ...cur,
            days: [
              ...rest,
              { habit_id: habit.id, day: today, value: next.value, slips: next.slips ?? 0, member_id: face, note: '' },
            ],
          }
        }),
    })
  }

  const renderRow = (h: Habit) => (
    <div key={h.id} className="habitudes__item">
      <HabitRow
        habit={h}
        status={habitStatusOn(h, days, today)}
        onMark={(next) => mark(h, next)}
        onOpen={() => setOpenId((cur) => (cur === h.id ? null : h.id))}
        readOnly={ro}
      />
      {openId === h.id && <HabitHistory habit={h} days={days} today={today} />}
    </div>
  )

  return (
    <div className="scene habitudes" aria-label={fn.checkin}>
      <SceneHead title={fn.checkin} icon="repeat-bold" onClose={close} />
      <div className="scene__body habitudes__body">
        {/* Whose day is this? Picking here sets the device's face, like the board's
            « Aujourd'hui » row — so attribution and the private-ish filter agree. */}
        {faces.length > 0 && (
          <MemberSwitcher
            faces={faces}
            value={face}
            onChange={setMemberId}
            allLabel={t.profile.household}
            ariaLabel={fn.whoseDay}
          />
        )}

        {mine.length === 0 ? (
          <EmptyState tone="calm">{face ? fn.emptyFace : fn.emptyHousehold}</EmptyState>
        ) : (
          <>
            {asking.length === 0 ? (
              <EmptyState tone="calm">{fn.allSettled}</EmptyState>
            ) : (
              <section className="habitudes__list">{asking.map(renderRow)}</section>
            )}

            {/* Settled today — folded away, still reachable to correct a mis-tap. */}
            {settled.length > 0 && (
              <Disclosure label={fn.alreadySettled} count={settled.length} className="habitudes__settled">
                <section className="habitudes__list">{settled.map(renderRow)}</section>
              </Disclosure>
            )}
          </>
        )}
      </div>
    </div>
  )
}
