import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { FAMILY_NOTES_KEY, MEMBERS_KEY } from '../../lib/queryKeys'
import { facesFromMembers, type RawMember } from '../../lib/faces'
import { type FamilyNote, visibleNotes } from '../../lib/familyNotes'
import { plainText } from '../../lib/noteMarkdown'
import { pictoFor } from '../../lib/picto'
import { imgUrl } from '../../lib/image'
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

  // Household faces, for the author tint below. Same shared key + shape every other
  // surface reads, so this rides the existing cache rather than adding a poll.
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: RawMember[] }>('members') })
  const faces = useMemo(() => facesFromMembers(membersQ.data?.members ?? []), [membersQ.data])
  const colorOf = (id: string | null) => faces.find((f) => f.id === id)?.colour ?? null

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

  // Tier 2 of the tile picture (see the grid below): the same title-to-emoji map the
  // list rows use. '' when it knows nothing, which is the signal to fall through.
  // The BODY is a second source, and a fair one here: a pre-reader picks by picture,
  // so « Épicerie · la marque de yogourt que Léa mange » drawing a 🥛 beats a third
  // identical document glyph. Title first — it is what the tile is labelled with —
  // and the body only when the title knows nothing.
  const picto = (n: FamilyNote): string => pictoFor(titleOf(n), '') || pictoFor(plainText(n.text), '')

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
                {/* PICTURE-FIRST, in three tiers — because « touche l'image » was a
                    promise the tile did not keep: with no media and no picto every
                    note drew the same document glyph, so a pre-reader could tell two
                    notes apart only by a WORD they cannot read (2026-09-10 matrix
                    pass; the kitchen and liste toddler views are genuinely
                    picture-first, this one was not).
                      1. the note's OWN picture, when it has one — a drawing or a
                         shared photo IS the thing, and a generic 🖼 glyph in front of
                         a real drawing is the worst of the three.
                      2. a picto derived from the title, reusing `pictoFor` (the same
                         map the list rows use): « Garderie » → 🏫, « Dentiste » → 🦷.
                         It covers about half of real titles and returns nothing for
                         the rest, which is why tier 3 stays.
                      3. the kind glyph, in the AUTHOR's colour (unchanged).
                    Only tier 3 is tinted: a photo and an emoji carry their own
                    colours, and tinting them would fight the picture. */}
                {(n.media_kind === 'image' || n.media_kind === 'drawing') && n.media_key ? (
                  <img className="cercle-kid__pic" src={imgUrl(n.media_key)} alt="" />
                ) : picto(n) ? (
                  <span className="cercle-kid__emoji" aria-hidden="true">
                    {picto(n)}
                  </span>
                ) : (
                  <Icon
                    name={n.media_kind === 'audio' ? 'speaker-high-bold' : 'file-text-bold'}
                    size={56}
                    color={colorOf(n.author_member_id) ?? '#2A8F85'}
                  />
                )}
                <span className="cercle-kid__name">{titleOf(n)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
