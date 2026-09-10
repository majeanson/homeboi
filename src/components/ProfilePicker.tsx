import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { useProfile } from '../lib/profile'
import { facesFromMembers } from '../lib/faces'
import { useFaceHasWaiting } from '../lib/mots'
import { type Member } from '../lib/members'
import { MEMBERS_KEY } from '../lib/queryKeys'
import { FaceSheet } from './FaceSheet'

// "Qui es-tu ?" — pick-your-face on a phone, so the device knows who is holding it.
// The BOUND sibling of `FaceSelect`: same sheet, but wired to the device profile
// (`lib/profile`) and fetching the household itself instead of taking `faces` as a
// prop. « tout le monde » clears the profile.
//
// The sheet body used to be a hand-copy of FaceSelect's (2026-09-09 parity audit found
// them character-for-character alike, down to the 250 ms close delay) and the copies
// had already drifted: only the chip marked a waiting-mot dot that belonged to a face
// other than the shown one. Both now render `FaceSheet`, so the face grid, the presence
// dot and the everyone tile exist once. This file is the fetch + the identity binding,
// which is the only part that was ever really its own.
export function ProfilePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const { memberId, setMemberId } = useProfile()
  const { data } = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members'), enabled: open })
  // « un mot t'attend » presence dot per face — boolean only (NFR-CALM).
  const hasWaiting = useFaceHasWaiting()
  const faces = facesFromMembers(data?.members ?? []).map((f) => ({ ...f, dot: hasWaiting(f.id) }))

  return (
    <FaceSheet
      open={open}
      onClose={onClose}
      faces={faces}
      value={memberId}
      onChange={setMemberId}
      allLabel={t.profile.household}
      ariaLabel={t.profile.who}
    />
  )
}
