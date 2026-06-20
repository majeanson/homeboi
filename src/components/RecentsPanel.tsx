import { useEffect, useState } from 'react'
import { useLang, useT } from '../i18n'
import { useRecents } from '../lib/toast'
import { formatAgo } from '../lib/format'
import { Modal } from './Modal'
import { EmptyState } from './EmptyState'
import { InlineIcon } from './Icon'

// The calm "Récents" review (#38): a quiet, opt-in look at the last few actions
// this session — what happened + when — with a late "Annuler" for anything still
// in its hold window. It's the same session log the undo toast shows when expanded
// (useRecents), surfaced here so you can glance back AFTER the toast has faded.
// Session-only, no counts/ranks/streaks (calm tenet) — just a record. A button
// that opens a Modal; the count sits quietly on the button so an untouched session
// reads "Récents" with nothing shouting.
export function RecentsPanel() {
  const t = useT()
  const { lang } = useLang()
  const { history, undo, isLive } = useRecents()
  const [open, setOpen] = useState(false)
  // Keep the relative times honest while the panel is open, without a busy clock:
  // a gentle 30 s tick is plenty for "il y a 2 min".
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [open])

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <InlineIcon name="clock-bold" size={16} /> {t.recents.open}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={t.recents.title} className="recents">
        {history.length === 0 ? (
          <EmptyState>{t.recents.empty}</EmptyState>
        ) : (
          <ul className="recents__list">
            {history
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="recents__row">
                  <span className="recents__msg">{e.message}</span>
                  <span className="recents__ago mono">{formatAgo(e.at, lang)}</span>
                  {isLive(e.id) && (
                    <button type="button" className="recents__undo" onClick={() => undo(e.id)}>
                      {t.undo.action}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        )}
        <p className="recents__note mono">{t.recents.note}</p>
      </Modal>
    </>
  )
}
