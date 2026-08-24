// B-11 (bmad/10) — cercle.css moved out of the eager shell; load it whenever this
// page renders (CercleNotes/NotesList below lean on its .cercle-notes*/.cnote-*
// classes — .cnote-* itself is eager via styles/board/cnote-list.css, since the
// board's « Notes (cercle) » card needs it before this page ever loads).
import '../styles/cercle.css'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { CERCLE_KEY } from '../lib/queryKeys'
import { Loading, LoadError, PairPrompt } from '../components/Fallback'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { NOTES_HELP } from '../lib/notesHelp'
import { CercleNotes } from '../components/cercle/CercleNotes'
import { NotesKidView } from '../components/cercle/NotesKidView'
import type { Contact, ContactLink, ContactGroupRaw, Member, Pet } from '../lib/cercle'

// « Les notes » — split out of the old Le cercle ▸ Famille ▸ Notes sub-tab into its
// own hub tab (teal, `--teal-wash`): ONLY the cercle notes board (CercleNotes /
// family_notes), nothing else of the old cercle. The people directory, Business and
// Carnets moved to /maison (pages/Maison.tsx) instead. Toddler: a read-only,
// hear-first list (NotesKidView) — no composer, no edit, one-way door like every
// other toddler lens.
export function Notes() {
  const { audience } = useAudience()
  if (audience === 'toddler') return <NotesKidView />
  return <NotesParent />
}

// The same wire shape /api/cercle returns, copied from the old Cercle.tsx (contacts/
// links/groups/pets ride along unused here — the payload is heavier than a notes tab
// strictly needs, but it's shared via CERCLE_KEY, so it's usually already warm from
// the board/Maison having fetched it, and this page avoids standing up a second,
// members-only query shape just for its face row).
interface CercleData {
  contacts: Contact[]
  members: Member[]
  links: ContactLink[]
  groups: ContactGroupRaw[]
  pets: Pet[]
}

function NotesParent() {
  const t = useT()
  const help = useHelpMode(NOTES_HELP, (k) => (k === 'search' ? t.search.title : t.cercle.familyNotes.title))

  // Doors in from elsewhere: ?item=<id> (a global-search hit, §892 — land on that
  // exact note) and ?add=1 (the ＋ FAB's "cnote" mode, FORM_ROUTES.cnote =
  // '/notes?add=1' — open the rich editor composing a new note once).
  const [params, setParams] = useSearchParams()
  const [focusItem, setFocusItem] = useState<string | null>(null)
  // composeNew is read SYNCHRONOUSLY at first render (a lazy initializer), not via
  // an effect + setState: CercleNotes only opens its composer on its OWN mount-only
  // effect (empty deps — see composedRef there), so `composeOnMount` must already
  // be correct on CercleNotes' very first render. Setting it a render later (once
  // an effect here noticed `?add=1`) would land one tick too late and the composer
  // would never open. It never needs to change again, so no setter.
  const [composeNew] = useState(() => params.get('add') === '1')
  // Both doors are one-shot: stripped from the URL so a reload/back doesn't replay
  // them — the same pattern the old Cercle page used for its own ?item door.
  useEffect(() => {
    const item = params.get('item')
    const add = params.get('add') === '1'
    if (!item && !add) return
    if (item) setFocusItem(item)
    const next = new URLSearchParams(params)
    next.delete('item')
    next.delete('add')
    setParams(next, { replace: true })
  }, [params, setParams])

  const { data, error } = useQuery({ queryKey: CERCLE_KEY, queryFn: () => api<CercleData>('cercle'), ...live })
  const members = useMemo(() => data?.members ?? [], [data])

  if (isUnauthorized(error)) return <PairPrompt />
  // A non-401 failure with no cached frame must NOT fall through to render an empty
  // face row (reads as "you know nobody") — surface it. A stale-but-good `data` from
  // a prior poll still renders (kept over the error), the calm live-poll behaviour.
  if (error && !data) return <LoadError />
  if (!data) return <Loading />

  return (
    <main className={'today-feed notes-page' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.notes}
        icon="file-text-bold"
        iconColor="#2A8F85"
        background="var(--teal-wash)"
        card="notes"
        action={help.available ? <HelpToggle active={help.active} onToggle={help.toggle} /> : undefined}
        searchPick={(run) => help.pick('search', run)}
      />

      <SectionIntro card="notes" />

      {help.hint && <HelpHint />}
      {/* Only the header's own target renders here — `bubbleFor`, never the `bubble`
          catch-all (the two together would double-render): CercleNotes anchors the
          « notes » bubble under its OWN title, which is where that explanation belongs. */}
      {help.bubbleFor('search')}

      <CercleNotes
        members={members}
        help={help}
        focusId={focusItem}
        onFocused={() => setFocusItem(null)}
        composeOnMount={composeNew}
      />
    </main>
  )
}
