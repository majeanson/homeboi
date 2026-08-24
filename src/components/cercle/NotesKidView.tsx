import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, visibleNotes } from '../../lib/familyNotes'
import { plainText } from '../../lib/noteMarkdown'
import { useSpeak, playNarration } from '../../lib/speak'
import { EmptyState } from '../EmptyState'
import { Icon } from '../Icon'

// Toddler lens for « Les notes » (pages/Notes.tsx): read-only, hear-first — the
// same `.cercle-kid` faces-grid anatomy CircleKidView uses (reused as-is, no new
// CSS), one card per Maisonnée note instead of one per person. Shows ONLY the
// family-wide notes (`visibleNotes(all, null)` — the "Maisonnée" scope the parent
// view's face row defaults to): a toddler has no face picker here, so there's no
// scope to narrow by and no author to attribute a new note to. Tap a note to hear
// it — an audio memo plays its recorded clip via the SAME shared helper BigTiles/
// KidView already use for parent-voice clips (`playNarration`, lib/speak), which
// falls back to on-device TTS of the title/text if the clip can't load (R2 off,
// offline, autoplay blocked); every other note is just TTS, with the Markdown
// stripped first (`plainText`, lib/noteMarkdown — a checklist/heading/bullet line
// would otherwise be read out with its literal `- [ ]`/`##`/`*` characters). No
// composer, no edit, no delete, no navigation away — a one-way door, like every
// other toddler surface (KidView, CircleKidView).
export function NotesKidView() {
  const t = useT()
  const speak = useSpeak()
  const { data } = useQuery({
    queryKey: FAMILY_NOTES_KEY,
    queryFn: () => api<{ notes: FamilyNote[] }>('family-notes'),
    ...live,
  })
  const notes = useMemo(() => visibleNotes(data?.notes ?? [], null), [data])

  // Title if set, else the body's first non-blank line (plain text), else a media
  // label — mirrors NotesList's own title-derivation rule so the same note reads
  // the same way on both surfaces.
  const fn = t.cercle.familyNotes
  const titleOf = (n: FamilyNote): string => {
    const body = plainText(n.text)
    const first = body.split('\n').find((l) => l.trim()) ?? ''
    return (
      n.title.trim() ||
      first ||
      (n.media_kind === 'audio' ? fn.memo : n.media_kind === 'image' ? fn.photo : n.media_kind === 'drawing' ? fn.drawing : fn.untitled)
    )
  }

  function tap(n: FamilyNote) {
    if (n.media_kind === 'audio' && n.media_key) {
      playNarration(n.media_key, titleOf(n), speak)
      return
    }
    const body = plainText(n.text).trim()
    speak([n.title.trim(), body].filter(Boolean).join('. ') || titleOf(n))
  }

  return (
    <main className="cercle-kid">
      <h1 className="cercle-kid__title">{t.nav.notes}</h1>
      {notes.length === 0 ? (
        <EmptyState>{fn.empty}</EmptyState>
      ) : (
        <>
          <p className="cercle-kid__hint mono">{t.kid.tapHear}</p>
          <div className="cercle-kid__grid">
            {notes.map((n) => (
              <button type="button" key={n.id} className="cercle-kid__card" onClick={() => tap(n)}>
                <Icon
                  name={n.media_kind === 'audio' ? 'speaker-high-bold' : n.media_kind === 'image' || n.media_kind === 'drawing' ? 'image-square-bold' : 'file-text-bold'}
                  size={56}
                  color="#2A8F85"
                />
                <span className="cercle-kid__name">{titleOf(n)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
