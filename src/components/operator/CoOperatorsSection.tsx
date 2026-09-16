import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api, isStatus } from '../../lib/api'
import { MEMBERS_KEY, OPERATORS_KEY } from '../../lib/queryKeys'
import { useConfirm } from '../../lib/confirm'
import { useOnline } from '../../lib/online'
import { useAuth } from '../../lib/auth'
import { type Member } from '../../lib/members'
import { isGuest, isPaired } from '../../lib/device'
import { formatDay } from '../../lib/format'
import { CopyButton } from '../CopyButton'
import { RowActions } from '../RowActions'
import { Chip } from '../Chip'
import { Cluster } from '../Layout'
import { StatusMessage } from '../StatusMessage'
import { LoadError } from '../LoadError'
import { InlineIcon } from '../Icon'

// « L'autre parent » — invite a second adult to this household (migration 0128).
//
// The household this app is FOR has two adults in it, and until now it had one
// account. The partner's only options were to share a password or to pair their
// phone as a kiosk — which silently costs them every operator endpoint, including
// the one for recording a virement, a feature whose whole premise is that two people
// each send their share.
//
// Operator-only, like every card in this sub: the endpoint is `authed(…, 'operator')`
// on all three methods, so a kiosk following a link here would find nothing. `isGuest`
// / `isPaired` hide it rather than letting it 403 on tap.
export function CoOperatorsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const online = useOnline()
  const auth = useAuth()
  const [link, setLink] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const listQ = useQuery({
    queryKey: OPERATORS_KEY,
    queryFn: () => api<{ operators: { email: string; createdAt: number; isSelf: boolean }[] }>('operator-invite'),
    enabled: !isGuest() && !isPaired(),
  })

  if (isGuest() || isPaired()) return null

  async function mint() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ url: string; expiresAt: number }>('operator-invite', { method: 'POST' })
      setLink(r.url)
      setExpiresAt(r.expiresAt)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function rotate() {
    // The confirm names WHAT IS LOST, per the confirmCopy rule — « Réinitialiser ? »
    // alone does not tell you that the link you texted last night stops working.
    if (!(await confirm({ message: t.coop.rotateConfirm, confirmLabel: t.coop.rotate, tone: 'danger' }))) return
    setBusy(true)
    setErr(null)
    try {
      await api('operator-invite', { method: 'DELETE' })
      setLink(null)
      setExpiresAt(null)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeOperator(email: string) {
    // The confirm names WHAT IS LOST — and, just as load-bearing here, what is NOT:
    // nothing they wrote goes with them. Attribution in this app is a soft member
    // ref, never an operator FK, precisely so an account can be removed without
    // erasing a household's history. Saying so is what makes the tap answerable.
    // …and asks for YOUR password (2026-09-16, STATE §4-L L5): the session cookie
    // proves someone in the house, not the account's owner, and this door throws a
    // person out of the household.
    const password = await confirm({
      message: t.coop.removeConfirm(email),
      confirmLabel: t.coop.remove,
      tone: 'danger',
      input: { kind: 'password', label: t.sessions.passwordLabel },
    })
    if (password === null) return
    setBusy(true)
    setErr(null)
    try {
      await api('operator-invite', { method: 'DELETE', body: { email, password } })
      await qc.invalidateQueries({ queryKey: OPERATORS_KEY })
    } catch (e) {
      setErr(isStatus(e, 403) ? t.sessions.wrong : isStatus(e, 429) ? t.common.tooMany : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // The household faces this account can BE. Read here rather than passed down: this
  // card is the only place that asks, and MEMBERS_KEY is already warm everywhere else.
  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), enabled: !isGuest() && !isPaired() }).data?.members ?? []
  const myFace = auth.memberId

  async function setMyFace(id: string | null) {
    setBusy(true)
    setErr(null)
    try {
      await api('operator-invite', { method: 'PATCH', body: { memberId: id } })
      // refresh() re-reads /api/auth/me, which is what carries memberId — without it
      // the chip would look picked while every write still attributed to the old face.
      await auth.refresh()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const operators = listQ.data?.operators ?? []

  return (
    <OperatorSection title={t.coop.title} hint={t.coop.hint} help={help} helpKey="coop">
      {/* Who can act as this household today. No roles and no ranks: `operators` has
          no owner flag and resolveActor resolves scope from the ROW, so everyone
          listed here is an equal. Showing a hierarchy that does not exist would be
          the first lie in a permission model. */}
      {listQ.isError && !listQ.data ? (
        <LoadError onRetry={() => void qc.invalidateQueries({ queryKey: OPERATORS_KEY })} />
      ) : (
        <ul className="operator__list">
          {operators.map((o) => (
            <li key={o.email} className="operator__list-row">
              <InlineIcon name="user-bold" />
              <span className="mono">{o.email}</span>
              {o.isSelf ? (
                <Chip>{t.coop.you}</Chip>
              ) : (
                // Handing out a capability you can never take back is a one-way door
                // — the case that matters is an invite sent to the wrong address.
                // Not offered on your OWN row: removing that logs you out of a
                // household you may be the only operator of, from a button whose
                // label says nothing about it. « Se déconnecter » is that door.
                <RowActions onDelete={() => void removeOperator(o.email)} deleteLabel={t.coop.remove} />
              )}
            </li>
          ))}
        </ul>
      )}

      {/* « Mon visage » — which household face THIS account is (migration 0130).
          Your own row only: deciding what face somebody else's phone attributes to is
          putting words in their mouth, and the device pick they already control is the
          honest place for it.
          It SEEDS the device pick on a device that has never chosen; it never
          overrides one. On a shared wall tablet nothing changes — whoever is standing
          there taps their own face, as always. */}
      {members.length > 0 && (
        <div className="operator__seg">
          <span className="operator__seg-label mono">{t.coop.myFace}</span>
          <Cluster>
            {members.map((m) => (
              <Chip
                key={m.id}
                selected={myFace === m.id}
                onClick={() => void setMyFace(myFace === m.id ? null : m.id)}
              >
                {m.display_name}
              </Chip>
            ))}
          </Cluster>
          <p className="operator__hint">{t.coop.myFaceHint}</p>
        </div>
      )}

      {link ? (
        <>
          <p className="operator__hint">{t.coop.linkReady}</p>
          {/* Read-only + selectable, so the link is copyable by hand when the
              clipboard is refused (CopyButton's own lesson #2). */}
          <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t.coop.linkLabel} />
          <Cluster>
            <CopyButton text={link} label={t.coop.copy} copiedLabel={t.coop.copied} icon="link-bold" />
          </Cluster>
          {expiresAt != null && (
            // `formatDay`, not an inline toLocaleDateString: the intl-rule ratchet
            // counts Intl construction repo-wide, and the neighbouring share-link
            // list is one of the sites it already tolerates — copying it here would
            // have spent the budget on a duplicate. The cached helper adds a weekday
            // (« sam. 20 sept. »), which on an expiry date is the useful half anyway.
            <p className="operator__hint mono">{t.coop.expires(formatDay(expiresAt, lang))}</p>
          )}
        </>
      ) : null}

      {err && <StatusMessage tone="error">{err}</StatusMessage>}

      <Cluster>
        <button type="button" className="btn btn--primary" onClick={mint} disabled={busy || !online}>
          <InlineIcon name="link-bold" /> {link ? t.coop.mintAgain : t.coop.mint}
        </button>
        <button type="button" className="btn" onClick={rotate} disabled={busy || !online}>
          {t.coop.rotate}
        </button>
      </Cluster>
      {!online && <p className="operator__hint mono">{t.offline.unavailable}</p>}
      <p className="operator__hint">{t.coop.rotateHint}</p>
    </OperatorSection>
  )
}
