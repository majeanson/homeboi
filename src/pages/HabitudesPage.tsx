import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import '../styles/habits.css'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isGuest } from '../lib/device'
import { useProfile } from '../lib/profile'
import { useWrite } from '../lib/write'
import { imgUrl } from '../lib/image'
import { type Member } from '../lib/members'
import { HABITS_KEY, BOARD_KEY, MONTH_KEY, MEMBERS_KEY } from '../lib/queryKeys'
import {
  useHabits,
  useMarkHabit,
  habitStatusOn,
  visibleHabits,
  isDaySettled,
  dayRow,
  habitToday,
  type Habit,
} from '../lib/habits'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Disclosure } from '../components/Disclosure'
import { RowActions } from '../components/RowActions'
import { ListRow } from '../components/ListRow'
import { Cluster } from '../components/Layout'
import { MemberSwitcher, type MemberFace } from '../components/MemberSwitcher'
import { HabitRow } from '../components/habits/HabitRow'
import { HabitHistory } from '../components/habits/HabitHistory'
import { DefiBlock } from '../components/habits/DefiBlock'
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
  const { signedIn } = useAuth()
  const nav = useNavigate()
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
  // Paused habits are invisible to visibleHabits (it filters archived out for
  // every other consumer, and its contract must stay that way) — computed
  // separately here so pausing is no longer a one-way door (see « En pause » below).
  const pausedMine = habits.filter(
    (h) => h.archived && (face ? h.member_id === null || h.member_id === face : h.member_id === null),
  )
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

  // The check-in write: ONE shared hook (lib/habits) used by every marking
  // surface — this scene, the history backfill dots, and the calendar day panel.
  const markHabit = useMarkHabit()

  // « Reprendre » — un-archive from the fold below; a plain field edit, not a day
  // mark, so it rides useWrite directly rather than useMarkHabit.
  const resume = (h: Habit) =>
    void write('habits', { method: 'PATCH', body: { id: h.id, archived: false }, affectedKeys: [HABITS_KEY, BOARD_KEY, MONTH_KEY] })

  const renderRow = (h: Habit) => (
    <div key={h.id} className="habitudes__item">
      <HabitRow
        habit={h}
        status={habitStatusOn(h, days, today)}
        onMark={(next) => markHabit(h, today, next)}
        onOpen={() => setOpenId((cur) => (cur === h.id ? null : h.id))}
        readOnly={ro}
      />
      {openId === h.id && (
        <div className="habitudes__peek">
          <HabitHistory habit={h} days={days} today={today} readOnly={ro} />
          {/* Editing lives behind the row's own peek rather than on the row: the
              check-in surface is for tapping, not for managing. */}
          <RowActions
            onEdit={() => nav(`/habitude/${h.id}/edit`)}
            editLabel={fn.editOne(h.title)}
            className="habitudes__row-actions"
          />
        </div>
      )}
    </div>
  )

  return (
    <div className="scene habitudes" aria-label={fn.checkin}>
      <SceneHead title={fn.checkin} icon="repeat-bold" card="habits" onClose={close} />
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

        {/* « Le défi du jour » — the day-long family défi, drawn and checked off
            here (the morning ritual: this scene auto-opens on a new local day) as
            well as on the board card. Above the habits, and shown even when there
            are none — a household with no habits can still have a défi. */}
        <DefiBlock payload={data} today={today} />

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

        {/* « En pause » — paused habits are invisible to visibleHabits (every other
            surface), so this is the ONLY door back: name it + « Reprendre », plus the
            edit door when signed in. Guests never see it (read-only, and there's
            nothing to reach for one anyway). Outside the mine.length===0 branch above
            so a face whose only habits are paused still finds this fold. */}
        {!ro && pausedMine.length > 0 && (
          <Disclosure label={fn.paused} count={pausedMine.length} className="habitudes__paused">
            <section className="habitudes__list">
              {pausedMine.map((h) => (
                <ListRow
                  key={h.id}
                  leading={<span aria-hidden="true">{h.icon || '•'}</span>}
                  title={h.title}
                  actions={
                    <Cluster>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => resume(h)}>
                        {fn.resume}
                      </button>
                      {signedIn && <RowActions onEdit={() => nav(`/habitude/${h.id}/edit`)} editLabel={fn.editOne(h.title)} />}
                    </Cluster>
                  }
                />
              ))}
            </section>
          </Disclosure>
        )}

        {/* Adding is operator-grade (the form is a FormScene), so a kiosk that
            isn't signed in — and a guest — never sees the door. */}
        {!ro && signedIn && (
          <Link className="btn btn--ghost habitudes__manage" to="/habitude/new">
            {fn.add}
          </Link>
        )}
      </div>
    </div>
  )
}
