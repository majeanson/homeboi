import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { isGuest, isPaired } from '../../lib/device'
import { useOnline } from '../../lib/online'
import { useSandbox } from '../../lib/demo'
import { useConfirm } from '../../lib/confirm'
import { api, isStatus } from '../../lib/api'
import { formatDayMaybeYear } from '../../lib/format'
import { HOUSEHOLD_KEY } from '../../lib/queryKeys'
import { EditField } from '../EditField'
import { Cluster } from '../Layout'
import { Disclosure } from '../Disclosure'
import { ListRow } from '../ListRow'
import { StatusMessage } from '../StatusMessage'
import { type HelpMode } from '../../lib/helpMode'

// « Emporter mes données » (bmad/08 E-35) + « Restaurer une copie » (STATE §4-L L8).
//
// The export half is one button, one JSON: everything the household holds (+ an R2 media
// manifest), served by GET /api/takeout with a content-disposition so the browser saves
// it as a file. A Loi 25 gesture, a trust signal, and the household's own backup story.
//
// The RESTORE half is what was missing: a nightly copy had been written to R2 every
// night for months and nothing could read one back — no endpoint, no procedure, never
// rehearsed. Two doors now, both password-gated (the endpoint checks through
// _lib/sudo.ts, the dialog just collects it): one of the nightly copies, or the file
// this card handed out. The confirm names what is lost AND what is not.
//
// Operator-only: the endpoints 403 a kiosk/guest credential, so the section hides on
// those. A sandbox is hidden too — its operator has a password nobody knows, and a
// 24-hour household has nothing worth putting back.
interface Backup {
  date: string
  bytes: number
}

const BACKUPS_KEY = ['takeout-backups']

export function TakeoutSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const online = useOnline()
  const sandbox = useSandbox()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  // The retyped household name. Compared with accents and case folded away, exactly as
  // the endpoint folds them — « Chez Nous » vs « chez nous » is a typing accident, not a
  // different household, and a confirmation that fails on a capital teaches nothing.
  const [typed, setTyped] = useState('')
  // « Repartir à neuf » has its own field and its own line: two doors sharing one
  // retyped name would arm both at once.
  const [resetTyped, setResetTyped] = useState('')
  const [resetMsg, setResetMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const hidden = isGuest() || isPaired() || sandbox
  const backups = useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: () => api<{ backups: Backup[] }>('takeout/backups'),
    enabled: !hidden && online,
    staleTime: 5 * 60_000,
  })
  const household = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: () => api<{ name: string }>('household'),
    enabled: !hidden,
    staleTime: 5 * 60_000,
  })
  if (hidden) return null
  const o = useOperatorT()
  // Defensive: a payload without `backups` (an older Worker, a stubbed harness) must
  // render an empty list, not throw `reading 'length'` into the ErrorBoundary and take
  // the whole settings tab with it — which is what it did, caught by e2e the same
  // evening (2026-09-16).
  const copies = Array.isArray(backups.data?.backups) ? backups.data.backups : []
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
  const houseName = household.data?.name ?? ''
  const nameMatches = !!houseName && fold(typed) === fold(houseName)
  const resetNameMatches = !!houseName && fold(resetTyped) === fold(houseName)

  // The one restore call. `label` is what the confirm names; `body` is the source.
  async function restore(label: string, body: Record<string, unknown>) {
    if (busy) return
    const password = await confirm({
      message: o.restoreConfirm(label),
      confirmLabel: o.restoreGo,
      tone: 'danger',
      input: { kind: 'password', label: t.sessions.passwordLabel },
    })
    if (password === null) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await api<{ rows: number }>('takeout/restore', { method: 'POST', body: { ...body, password } })
      // Everything changed: drop the whole cache rather than naming twenty keys.
      await qc.invalidateQueries()
      setMsg({ tone: 'success', text: o.restoreDone(r.rows) })
    } catch (e) {
      setMsg({
        tone: 'error',
        text: isStatus(e, 403) ? t.sessions.wrong : isStatus(e, 429) ? t.common.tooMany : isStatus(e, 400) ? o.restoreBadFile : (e as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }

  // The leave door. Same password dialog as the restore — the endpoint checks it
  // through `_lib/sudo.ts` either way — with the retyped name already in hand.
  // `api()`, not `useWrite()`: an outbox replaying « delete my household » hours later,
  // after the person changed their mind and signed back in, is the worst write there is
  // to retry (`write-rule.test.ts` ALLOWED carries that reason).
  async function leave() {
    if (busy || !nameMatches) return
    const password = await confirm({
      message: o.leaveConfirm,
      confirmLabel: o.leaveGo,
      tone: 'danger',
      input: { kind: 'password', label: t.sessions.passwordLabel },
    })
    if (password === null) return
    setBusy(true)
    setMsg(null)
    try {
      await api('household', { method: 'DELETE', body: { password, name: typed } })
      // The household is gone and the session died with its `operators` row. Drop the
      // cache before leaving, or the next paint renders a board from memory that no
      // longer exists anywhere.
      qc.clear()
      location.assign('/')
    } catch (e) {
      setMsg({
        tone: 'error',
        text: isStatus(e, 403) ? t.sessions.wrong : isStatus(e, 429) ? t.common.tooMany : isStatus(e, 400) ? o.leaveNameWrong : (e as Error).message,
      })
      setBusy(false)
    }
  }

  // « Repartir à neuf » — the leave door's shape, with the account kept: the session
  // survives (the endpoint keeps the `operators` row), so the cache is invalidated and
  // the board refills empty, rather than signing out. Not in the outbox, same reason as
  // leaving (write-rule ALLOWED).
  async function startOver() {
    if (busy || !resetNameMatches) return
    const password = await confirm({
      message: o.startOverConfirm,
      confirmLabel: o.startOverGo,
      tone: 'danger',
      input: { kind: 'password', label: t.sessions.passwordLabel },
    })
    if (password === null) return
    setBusy(true)
    setResetMsg(null)
    try {
      await api('household/reset', { method: 'POST', body: { password, name: resetTyped } })
      await qc.invalidateQueries()
      setResetTyped('')
      setResetMsg({ tone: 'success', text: o.startOverDone })
    } catch (e) {
      setResetMsg({
        tone: 'error',
        text: isStatus(e, 403) ? t.sessions.wrong : isStatus(e, 429) ? t.common.tooMany : isStatus(e, 400) ? o.leaveNameWrong : (e as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }

  async function restoreFromFile(file: File) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      setMsg({ tone: 'error', text: o.restoreBadFile })
      return
    }
    await restore(file.name, { source: 'file', takeout: parsed })
  }

  return (
    <OperatorSection title={o.takeoutTitle} help={help} helpKey="takeout">
      <p className="operator__hint mono">{o.takeoutHint}</p>
      {/* A plain link: GET rides the operator session cookie, and the endpoint's
          content-disposition makes it a straight download. Online-only (there is
          no offline dump to give). */}
      {online ? (
        <a className="btn" href="/api/takeout" download>
          <InlineIcon name="download-simple-bold" /> {o.takeoutBtn}
        </a>
      ) : (
        <p className="operator__hint mono">{t.offline.unavailable}</p>
      )}

      {online && (
        <Disclosure label={o.restoreTitle}>
          <p className="operator__hint">{o.restoreHint}</p>
          {copies.length > 0 && (
            <ul className="operator__list">
              {copies.map((b) => {
                const when = formatDayMaybeYear(Date.parse(`${b.date}T12:00:00Z`) / 1000, lang)
                return (
                  <li key={b.date}>
                    <ListRow
                      leading={<InlineIcon name="clock-counter-clockwise-bold" />}
                      title={when}
                      subtitle={`${Math.max(1, Math.round(b.bytes / 1024))} ko`}
                      actions={
                        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void restore(when, { source: 'backup', date: b.date })}>
                          {o.restoreGo}
                        </button>
                      }
                    />
                  </li>
                )
              })}
            </ul>
          )}
          {backups.data && copies.length === 0 && <p className="operator__hint mono">{o.restoreNoCopies}</p>}
          <Cluster>
            <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
              <InlineIcon name="file-text-bold" /> {o.restoreFromFile}
            </button>
            {/* `hidden`, the repo's file-picker convention (ContactPhotos, NoteEditor,
                HomePinForm): it leaves the a11y tree and the tab order entirely, so the
                visible button above is the ONE control with that name — an sr-only input
                carrying the same aria-label made two, which e2e caught at once. */}
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void restoreFromFile(f)
              }}
            />
          </Cluster>
          {msg && <StatusMessage tone={msg.tone}>{msg.text}</StatusMessage>}
        </Disclosure>
      )}

      {/* « Repartir à neuf » (2026-09-23) — the leave door's little sibling, ABOVE it
          because it is the lesser door: everything the household holds goes, the
          account, the paired tablets and the settings stay. Same two deliberate acts
          (the fold, the name retyped) and the same two locks behind them. */}
      {online && (
        <Disclosure label={o.startOverTitle}>
          <p className="operator__hint">{o.startOverHint}</p>
          <p className="operator__hint">{o.leaveNameLabel(houseName)}</p>
          <EditField
            value={resetTyped}
            onChange={setResetTyped}
            ariaLabel={o.leaveNameLabel(houseName)}
            placeholder={o.leaveNamePlaceholder}
            onSubmit={() => void startOver()}
          />
          <Cluster>
            <button type="button" className="btn btn--danger" disabled={busy || !resetNameMatches} onClick={() => void startOver()}>
              <InlineIcon name="arrow-counter-clockwise-bold" /> {o.startOverGo}
            </button>
          </Cluster>
          {resetTyped && !resetNameMatches && <p className="operator__hint mono">{o.leaveNameWrong}</p>}
          {resetMsg && <StatusMessage tone={resetMsg.tone}>{resetMsg.text}</StatusMessage>}
        </Disclosure>
      )}

      {/* « Supprimer la maisonnée » (Wave 4) — folded, and folded UNDER the export on
          purpose: the first thing to offer someone who is leaving is their own things.
          Two deliberate acts guard it before the endpoint's two do (operator scope +
          password): the fold, then the household's NAME retyped. The name is the half a
          password cannot be — something you have to look at rather than something you
          know by heart — and it is why this is an inline field rather than a second
          `useConfirm` input: `confirm` takes one input, of kind 'password', and
          extending a dialog every surface uses, to serve one door, is the fork this
          codebase keeps paying for. */}
      {online && (
        <Disclosure label={o.leaveTitle}>
          <p className="operator__hint">{o.leaveHint}</p>
          <p className="operator__hint">{o.leaveNameLabel(houseName)}</p>
          <EditField
            value={typed}
            onChange={setTyped}
            ariaLabel={o.leaveNameLabel(houseName)}
            placeholder={o.leaveNamePlaceholder}
            onSubmit={() => void leave()}
          />
          <Cluster>
            <button type="button" className="btn btn--danger" disabled={busy || !nameMatches} onClick={() => void leave()}>
              <InlineIcon name="trash-bold" /> {o.leaveGo}
            </button>
          </Cluster>
          {typed && !nameMatches && <p className="operator__hint mono">{o.leaveNameWrong}</p>}
        </Disclosure>
      )}

      {/* The two public documents, mirrored here (Wave 4). They live at the foot of the
          marketing page for a stranger; a household that already signed up never sees
          that page again, and « what does it keep about us » is a question you ask from
          inside. Plain links, no fold: two words. */}
      <p className="operator__hint mono">
        <Link to="/confidentialite">{t.home.privacyDoc}</Link> · <Link to="/conditions">{t.home.termsDoc}</Link>
      </p>
    </OperatorSection>
  )
}
