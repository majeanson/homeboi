import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { useAuth } from '../../lib/auth'
import { useAudience } from '../../lib/audience'
import { isGuest } from '../../lib/device'
import { Modal } from '../Modal'
import { StatusMessage } from '../StatusMessage'
import { EntityShareModal } from '../EntityShareModal'
import { EventForm, type EventInit } from '../forms/EventForm'
import type { FormMember } from '../FormScene'
import { EVENTS_KEY, BOARD_KEY, MONTH_KEY, MEMBERS_KEY } from '../../lib/queryKeys'

// The basic Modify / Delete / Share actions for an EVENT detail peek, hosted ONCE per
// surface. The event peek opens from the board, the month grid, and the moments view (the
// day page edits inline without a peek), so each of those calls `useEventPeekActions()`,
// spreads `optsFor(e)` into `buildEvent`, and renders `{node}` once. The hook owns the
// GATING (so every surface behaves identically) and both modals:
//   · Modify → the real EventForm in a Modal (parent + non-guest; a parent-mode kiosk may
//     edit the agenda too, matching /api/events). Fetches the base event + members itself,
//     so a recurring occurrence edits its series like the day page's openEventEdit.
//   · Delete → confirm (heavy: removes the whole series) then DELETE; the poll refetch drops
//     the row after the server delete lands (no optimistic hide → no flash-back).
//   · Share → the public /partage link (operator only — minting is a server write).
// A derived birthday has no event row behind it, so it gets none of these.

const baseId = (id: string) => id.split('#')[0]

type PeekEvent = { id: string; title: string; birthday?: boolean | null }

export interface EventPeekActions {
  optsFor: (e: PeekEvent) => { onEdit?: () => void; onDelete?: () => void; onShare?: () => void } | undefined
  node: React.ReactNode
}

export function useEventPeekActions(): EventPeekActions {
  const t = useT()
  const confirm = useConfirm()
  const write = useWrite()
  const { signedIn } = useAuth()
  const { audience } = useAudience()
  const [editId, setEditId] = useState<string | null>(null)
  const [share, setShare] = useState<{ id: string; title: string } | null>(null)

  const canEdit = !isGuest() && audience === 'parent'
  const canShare = signedIn && audience === 'parent'

  async function del(e: PeekEvent) {
    if (!(await confirm({ message: t.detail.deleteEvent, confirmLabel: t.common.delete, tone: 'danger' }))) return
    await write('events', { method: 'DELETE', body: { id: baseId(e.id) }, affectedKeys: [EVENTS_KEY, BOARD_KEY, MONTH_KEY] })
  }

  const optsFor = (e: PeekEvent) =>
    e.birthday
      ? undefined
      : {
          onEdit: canEdit ? () => setEditId(baseId(e.id)) : undefined,
          onDelete: canEdit ? () => void del(e) : undefined,
          onShare: canShare ? () => setShare({ id: e.id, title: e.title }) : undefined,
        }

  const node = (
    <>
      {editId && <EventEditModal eventId={editId} onClose={() => setEditId(null)} />}
      {share && (
        <EntityShareModal
          open
          onClose={() => setShare(null)}
          title={`${t.shareLink.action} · ${share.title}`}
          body={{ kind: 'event', eventId: share.id }}
        />
      )}
    </>
  )

  return { optsFor, node }
}

// Load the base event + members, host EventForm in a Modal. Mirrors the day page's inline
// edit (same EVENTS_KEY row shape as `value`), just in a portalled dialog for the peek path.
function EventEditModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const eventsQ = useQuery({ queryKey: EVENTS_KEY, queryFn: () => api<{ events: EventInit[] }>('events') })
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: FormMember[] }>('members') })
  const value = eventsQ.data?.events.find((e) => e.id === eventId) ?? null

  return (
    <Modal open onClose={onClose} title={t.common.edit}>
      {value ? (
        <EventForm
          members={membersQ.data?.members ?? []}
          value={value}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: BOARD_KEY })
            void qc.invalidateQueries({ queryKey: EVENTS_KEY })
            void qc.invalidateQueries({ queryKey: MONTH_KEY })
            onClose()
          }}
          onCancel={onClose}
        />
      ) : (
        <StatusMessage tone="info">{t.common.loading}</StatusMessage>
      )}
    </Modal>
  )
}
