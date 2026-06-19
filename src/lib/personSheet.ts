import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { useWrite } from './write'
import { CERCLE_KEY, BOARD_KEY } from './queryKeys'
import type { Contact, ContactLink, Member } from './cercle'

interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
}

// « Détailler dans Le cercle » — open the rich person sheet for a household member.
//
// Members and contacts are deliberately SEPARATE concepts: a member is the lean
// Maisonnée identity (name, face, colour, child) the board/routines/chores need;
// the exhaustive "everything about this human" (coordonnées, anniversaire, notes,
// genre, liens familiaux, groupes…) lives on a « Le cercle » CONTACT hard-linked
// to the member via `contact.memberId`. This helper bridges the two: it finds that
// linked contact, or CREATES one the first time (prefilled with the member's name),
// then navigates to the SAME ContactForm every other contact is edited through.
export function useOpenPersonSheet() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const write = useWrite()

  return async (member: { id: string; name: string }) => {
    // Prefer the cache (instant if Le cercle was visited); fall back to a fetch so
    // it works cold too. Either way we need the contacts to spot an existing link.
    const data =
      qc.getQueryData<CercleData>(CERCLE_KEY) ?? (await api<CercleData>('cercle').catch(() => null))
    const existing = data?.contacts.find((c) => c.memberId === member.id)
    if (existing) {
      nav(`/cercle/person/${existing.id}`)
      return
    }

    // First time: spin up a linked contact prefilled with the member's name (split
    // into first/last on the first space — the form lets them refine it).
    const parts = member.name.trim().split(/\s+/)
    const firstName = parts[0] || member.name.trim()
    const lastName = parts.slice(1).join(' ')
    const res = await write<{ id: string }>('cercle', {
      method: 'POST',
      body: { firstName, lastName, memberId: member.id },
      affectedKeys: [CERCLE_KEY, BOARD_KEY],
    })
    const id = res.queued ? null : res.data?.id ?? null
    if (!id) {
      // Offline: the create is queued with no id yet — land on the directory.
      nav('/cercle')
      return
    }
    // Seed the cache so the edit page finds the fresh contact at once — otherwise
    // the invalidate race lets CercleFormPage see stale data and bounce to /cercle.
    qc.setQueryData<CercleData>(CERCLE_KEY, (old) => {
      const fresh: Contact = {
        id,
        firstName,
        lastName,
        nickname: null,
        photoKey: null,
        birthday: null,
        email: null,
        phone: null,
        address: null,
        notes: null,
        tags: [],
        memberId: member.id,
        customFields: [],
        gender: null,
      }
      return old
        ? { ...old, contacts: [...old.contacts, fresh] }
        : { contacts: [fresh], members: [], links: [] }
    })
    nav(`/cercle/person/${id}`)
  }
}
