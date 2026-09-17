import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { OperatorSection } from './OperatorSection'
import { InlineIcon } from '../Icon'
import { isGuest, isPaired } from '../../lib/device'
import { useOnline } from '../../lib/online'
import { useSandbox } from '../../lib/demo'
import { useConfirm } from '../../lib/confirm'
import { api, isStatus } from '../../lib/api'
import { formatDayMaybeYear } from '../../lib/format'
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
  const hidden = isGuest() || isPaired() || sandbox
  const backups = useQuery({
    queryKey: BACKUPS_KEY,
    queryFn: () => api<{ backups: Backup[] }>('takeout/backups'),
    enabled: !hidden && online,
    staleTime: 5 * 60_000,
  })
  if (hidden) return null
  const o = t.operator

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
          {backups.data && backups.data.backups.length > 0 && (
            <ul className="operator__list">
              {backups.data.backups.map((b) => {
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
          {backups.data && backups.data.backups.length === 0 && <p className="operator__hint mono">{o.restoreNoCopies}</p>}
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
    </OperatorSection>
  )
}
