import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useWrite } from '../lib/write'
import { useCalm } from '../lib/calm'
import { MEMBERS_KEY, STICKERS_KEY } from '../lib/queryKeys'
import { type StickerRow } from '../lib/stickers'
import { Loading } from '../components/Fallback'
import { SceneHead } from '../components/SceneHead'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { Icon } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'
import { isGuest } from '../lib/device'

interface MemberRow {
  id: string
  display_name: string
  avatar_kind: string
  avatar_ref: string
  colour: string
}

// /routine/stickers — « Le mur d'autocollants ». The permanent, per-child sticker
// collection a household fills by finishing routines. OPT-IN: it only exists when
// « Mode calme » is OFF (the calm default hides it entirely), so it never intrudes on
// the calm experience. Per-child grids, no count/rank — just each kid's own wall.
export function StickerWallPage() {
  const t = useT()
  const { calm } = useCalm()
  const close = useSceneClose('/routines')
  useEscapeKey(close)
  const write = useWrite()
  const [editing, setEditing] = useState(false)

  const stickersQ = useQuery({ queryKey: STICKERS_KEY, queryFn: () => api<{ stickers: StickerRow[] }>('routine-stickers') })
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: MemberRow[] }>('members') })

  // Calm mode ON → the wall doesn't exist; bounce back to the tab.
  if (calm) return <Navigate to="/routines" replace />
  if (!stickersQ.data || !membersQ.data) return stickersQ.isLoading || membersQ.isLoading ? <Loading /> : <Navigate to="/routines" replace />

  const members = membersQ.data.members
  const memberById = new Map(members.map((m) => [m.id, m]))
  const all = stickersQ.data.stickers

  // Group by member (null → a shared "Maisonnée" wall), preserving award order.
  const byMember = new Map<string, StickerRow[]>()
  for (const s of all) {
    const key = s.memberId ?? '__household__'
    if (!byMember.has(key)) byMember.set(key, [])
    byMember.get(key)!.push(s)
  }
  // Order: known members first (household roster order), then the shared group.
  const groupKeys = [
    ...members.filter((m) => byMember.has(m.id)).map((m) => m.id),
    ...(byMember.has('__household__') ? ['__household__'] : []),
  ]

  const remove = (id: string) =>
    write('routine-stickers', { method: 'DELETE', body: { id }, affectedKeys: [STICKERS_KEY] }).catch(() => {})

  return (
    <div className="scene sticker-wall-scene">
      <SceneHead
        title={t.routines.stickerWallTitle}
        icon="sparkle-bold"
        card="routines"
        onClose={close}
        action={
          !isGuest() && all.length > 0 ? (
            <button type="button" className="btn btn--sm" onClick={() => setEditing((e) => !e)}>
              {editing ? t.common.done : t.common.edit}
            </button>
          ) : undefined
        }
      />
      <div className="sticker-wall">
        {all.length === 0 ? (
          <EmptyState tone="calm">{t.routines.stickerWallEmpty}</EmptyState>
        ) : (
          groupKeys.map((key) => {
            const m = key === '__household__' ? null : memberById.get(key)
            const rows = byMember.get(key) ?? []
            const name = m?.display_name ?? t.routines.stickerWallHousehold
            return (
              <section key={key} className="sticker-wall__group">
                <h3 className="sticker-wall__who">
                  {m ? (
                    <Avatar kind={m.avatar_kind} photo={m.avatar_ref} colour={m.colour} name={name} size={30} />
                  ) : (
                    <Icon name="users-three-bold" size={20} />
                  )}
                  <span>{name}</span>
                </h3>
                <div className="sticker-wall__grid">
                  {rows.map((s) => (
                    <span key={s.id} className="sticker-wall__cell">
                      <span className="sticker-wall__glyph" aria-hidden="true">{s.sticker}</span>
                      {editing && !isGuest() && (
                        <button
                          type="button"
                          className="sticker-wall__remove"
                          aria-label={t.common.delete}
                          onClick={() => remove(s.id)}
                        >
                          <Icon name="x-bold" size={12} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}
