import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { useProfile } from '../../lib/profile'
import { MEMBERS_KEY } from '../../lib/queryKeys'
import type { Member } from '../../lib/members'
import {
  type HabitsPayload,
  todaysDefi,
  defiMarkFaces,
  faceTriedDefi,
  recentDefiTexts,
  useCommitDefi,
  useToggleDefiMark,
} from '../../lib/habits'
import { pigeDefi, localizeDefi, type Defi } from '../../lib/defiDeck'
import { type HelpMode } from '../../lib/helpMode'
import { Avatar } from '../Avatar'
import { Cluster } from '../Layout'

// « Le défi du jour » — the ONE défi surface, mounted by both the board's
// HabitudesCard and the « Le point du jour » scene (reuse, not two copies). It
// draws today's day-long family défi, lets anyone commit it (« On l'essaie ! »,
// after up to 3 re-rolls — « la troisième est la bonne »), and lets each picked
// FACE check it off (« Je l'ai tenu ! »). Faces light up; nothing is ever counted
// or ranked (NFR-CALM-1). A guest sees a committed défi read-only and can't pige.
export function DefiBlock({
  payload,
  today,
  help,
}: {
  payload: HabitsPayload | undefined
  today: number
  // Board « ? » help-mode (optional): when armed, the kicker becomes tappable and
  // pops an in-place bubble. The scene passes nothing (no help mode there).
  help?: HelpMode
}) {
  const t = useT()
  const fn = t.habits.defi
  const { lang } = useLang()
  const { memberId: face } = useProfile()
  const ro = isGuest()

  const commit = useCommitDefi()
  const toggleMark = useToggleDefiMark()

  // A committed défi (its habit + today's text) or null. Re-rolls live only in
  // local state below — nothing but the accepted défi is ever written.
  const committed = todaysDefi(payload, today)
  const recent = useMemo(() => recentDefiTexts(payload), [payload])

  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') }).data?.members ?? []
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // The pige flow (only before a défi is committed): the drawn candidate + how many
  // times it's been re-rolled. After the 3rd, « Pige encore » retires.
  const [drawn, setDrawn] = useState<Defi | null>(null)
  const [rolls, setRolls] = useState(0)

  const pige = () => {
    const exclude = new Set(recent)
    if (drawn) exclude.add(drawn[lang].trim().toLowerCase()) // don't redraw the same one
    setDrawn(pigeDefi(exclude, lang))
    setRolls((r) => r + 1)
  }
  const accept = () => {
    if (!drawn) return
    commit(drawn[lang])
    setDrawn(null)
    setRolls(0)
  }

  // The header, shared by both branches: the 🎯 kicker becomes a « ? »-help title
  // when the board's help mode is armed (SecLabel's pattern), with the bubble just
  // below. `data-tour="defi"` on the block anchors the board tour's défi step.
  const head = (
    <div className="defi-block__head">
      <span className="defi-block__ico" aria-hidden="true">🎯</span>
      {help?.active ? (
        <button
          type="button"
          className="help-title defi-block__kicker"
          onClick={help.pick('defi', () => {})}
          title={t.help.learnMore}
        >
          {fn.title}
        </button>
      ) : (
        <span className="defi-block__kicker">{fn.title}</span>
      )}
    </div>
  )
  const bubble = help ? help.bubbleFor('defi') : null

  // --- Committed: show the défi + who's tried it -----------------------------
  if (committed) {
    const faces = defiMarkFaces(payload?.marks, committed.habit.id, today)
    const tried = faceTriedDefi(payload?.marks, committed.habit.id, today, face)
    return (
      <div className="defi-block defi-block--live" data-tour="defi">
        {head}
        {bubble}
        <p className="defi-block__text">{localizeDefi(committed.text, lang)}</p>
        <div className="defi-block__foot">
          {faces.length > 0 && (
            <Cluster>
              <span className="defi-block__whoLabel">{fn.whoTried}</span>
              <span className="defi-block__faces">
                {faces.map((id) => {
                  const m = memberById.get(id)
                  return (
                    <Avatar
                      key={id}
                      size={26}
                      kind={m?.avatar_kind}
                      photo={m?.avatar_ref}
                      colour={m?.colour}
                      name={m?.display_name}
                    />
                  )
                })}
              </span>
            </Cluster>
          )}
          {!ro &&
            (face ? (
              <button
                type="button"
                className={'btn btn--sm defi-block__mark ' + (tried ? 'btn--ghost' : 'btn--primary')}
                onClick={() => toggleMark(committed.habit.id, today, !tried)}
                aria-label={fn.markAria(localizeDefi(committed.text, lang))}
              >
                {tried ? fn.undo : fn.tried}
              </button>
            ) : (
              <span className="defi-block__hint mono">{fn.pickFace}</span>
            ))}
        </div>
      </div>
    )
  }

  // --- Guest with no défi drawn: nothing to offer (read-only, can't pige) -----
  if (ro) return null

  // --- Not committed: the pige flow ------------------------------------------
  return (
    <div className="defi-block defi-block--pige" data-tour="defi">
      {head}
      {bubble}
      {drawn ? (
        <>
          <p className="defi-block__text">{drawn[lang]}</p>
          <Cluster>
            <button type="button" className="btn btn--primary btn--sm" onClick={accept}>
              {fn.accept}
            </button>
            {rolls < 3 ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={pige}>
                {fn.pigeAgain}
              </button>
            ) : (
              <span className="defi-block__hint mono">{fn.thirdIsIt}</span>
            )}
          </Cluster>
        </>
      ) : (
        <>
          <p className="defi-block__sub">{fn.sub}</p>
          <button type="button" className="btn btn--primary btn--sm defi-block__pige" onClick={pige}>
            {fn.pige}
          </button>
        </>
      )}
    </div>
  )
}
