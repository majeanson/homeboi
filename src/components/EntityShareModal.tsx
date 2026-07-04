import { type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../i18n'
import { ShareModal } from './ShareModal'
import { createShare, type CreateShareBody } from '../lib/share'
import { SHARES_KEY } from '../lib/queryKeys'

// The generic "share one of my things" modal: mints a /partage link for a content kind
// (recipe / event / routine) the moment it opens, over the shared ShareModal. Callers
// pass the title, an optional intro, and the CreateShareBody ({kind, <id>}). Recipe wraps
// this (RecipeShareModal); the event/routine peeks use it directly.
export function EntityShareModal({
  open,
  onClose,
  title,
  intro,
  body,
}: {
  open: boolean
  onClose: () => void
  title: string
  intro?: ReactNode
  body: CreateShareBody
}) {
  const t = useT()
  const qc = useQueryClient()
  return (
    <ShareModal
      open={open}
      onClose={onClose}
      title={title}
      intro={intro}
      linkHint={t.shareLink.linkHint}
      autoCreate
      onCreate={async () => {
        const res = await createShare(body)
        void qc.invalidateQueries({ queryKey: SHARES_KEY })
        return { url: res.url }
      }}
    />
  )
}
