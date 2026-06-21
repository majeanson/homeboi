import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { formatDay } from '../../lib/format'
import { api, ApiError, isStatus } from '../../lib/api'
import { live } from '../../lib/query'
import { useWrite } from '../../lib/write'
import { useProfile } from '../../lib/profile'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { type FamilyNote, type NoteScope, visibleNotes } from '../../lib/familyNotes'
import type { Member } from '../../lib/cercle'
import { isGuest } from '../../lib/device'
import { imgUrl } from '../../lib/image'
import { Icon, InlineIcon } from '../Icon'
import { MemberSwitcher } from '../MemberSwitcher'
import { EditField } from '../EditField'
import { MemoControls } from '../MemoControls'
import { ZoomableImg } from '../ZoomableImg'
import { DrawPad } from '../DrawPad'
import { DrawEditChoice } from '../DrawEditChoice'
import { useDrawEdit } from '../../lib/drawEdit'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

// « Le cercle » → Famille → "Notes & recommandations". iOS-Notes-style quick notes
// scoped to ONE household member (the "Moi" list) or the whole Maisonnée (family-wide).
// A picked face (defaulting to the device profile) sees THEIR personal notes PLUS the
// Maisonnée notes always; "Maisonnée" sees only the family-wide notes (decision 3).
// The composer's Moi/Maisonnée toggle (decision 2) chooses the scope a new note lands
// in, and overrides the X-Profile header server-side. Media (audio/drawing/photo)
// reuses MemoControls + /api/note-media — durable, never touches the board notes.
export function CercleNotes({
  members,
  help,
}: {
  members: Member[]
  // Optional shared help mode (the Cercle page's) so the section header is explainable.
  help?: HelpMode
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const qc = useQueryClient()
  const { memberId: profileId } = useProfile()
  const ro = isGuest()

  // The acting face for the section: whose notes to show, and the default scope for a
  // new note. Seeded from the device profile (null = Maisonnée). A specific face also
  // surfaces the Maisonnée notes beneath their own (visibleNotes).
  const [face, setFace] = useState<string | null>(profileId)
  // The composer scope toggle. 'self' is only meaningful when a face is picked; at
  // Maisonnée it's forced to 'family'.
  const [scope, setScope] = useState<NoteScope>(profileId ? 'self' : 'family')
  const effScope: NoteScope = face ? scope : 'family'

  const [text, setText] = useState('')
  // iOS-Notes-style live search across the visible list (text + author name).
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Re-opening a drawing note (#14): the shared chooser (modify / copy / calquer) + the
  // pad load props it resolves to. `draw.isNew` = copy/trace (→ a new note in this list).
  const draw = useDrawEdit<FamilyNote>()
  const [drawHidden, setDrawHidden] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const { data } = useQuery({
    queryKey: FAMILY_NOTES_KEY,
    queryFn: () => api<{ notes: FamilyNote[] }>('family-notes'),
    ...live,
  })
  const all = useMemo(() => data?.notes ?? [], [data])
  const removal = useDeferredRemoval(FAMILY_NOTES_KEY)

  const colorOf = (id: string | null) => members.find((m) => m.id === id)?.colour ?? null
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.displayName ?? null

  // Newest first (iOS Notes orders by most-recent), then narrow by the search box.
  // Search matches the note text OR its author's name so "find Léa's note" works.
  const visible = useMemo(() => {
    const base = visibleNotes(all, face)
      .slice()
      .sort((a, b) => (b.updated_at ?? b.created_at) - (a.updated_at ?? a.created_at))
    const q = query.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      (n) =>
        n.text.toLowerCase().includes(q) ||
        (members.find((m) => m.id === n.author_member_id)?.displayName.toLowerCase().includes(q) ?? false),
    )
  }, [all, face, query, members])
  const shown = removal.visible(visible)

  const scopeBody = useMemo(
    () => (s: NoteScope) => ({ scope: s, member_id: s === 'self' ? face : null }),
    [face],
  )

  function submitText(v: string) {
    const body = { text: v.trim(), ...scopeBody(effScope) }
    if (!body.text) return
    setText('')
    void write('family-notes', {
      method: 'POST',
      body,
      affectedKeys: [FAMILY_NOTES_KEY],
    }).catch(() => {})
  }

  function saveEdit(n: FamilyNote, v: string) {
    setEditingId(null)
    const next = v.trim()
    if (next === n.text) return
    void write('family-notes', {
      method: 'PATCH',
      body: { id: n.id, text: next },
      affectedKeys: [FAMILY_NOTES_KEY],
    }).catch(() => {})
  }

  function remove(n: FamilyNote) {
    removal.remove([n.id], t.cercle.familyNotes.deleted, () =>
      write('family-notes', { method: 'DELETE', body: { id: n.id }, affectedKeys: [FAMILY_NOTES_KEY] }),
    )
  }

  // Re-draw a drawing note (mirror board Notes.saveDrawing): upload the PNG + editable
  // scene, then either PATCH the row in place (modify) or POST a fresh note in the same
  // scope (copy / calquer — the original stays). Media can't be queued offline → api()
  // direct; invalidate so the new/edited note shows at once.
  async function saveDrawing(png: Blob, scene: string, note: FamilyNote, isNew: boolean) {
    try {
      const { key } = await api<{ key: string }>('note-media', { method: 'POST', body: png })
      let sceneKey: string | undefined
      if (scene) {
        try {
          const r = await api<{ key: string }>('note-media', {
            method: 'POST',
            body: new Blob([scene], { type: 'application/json' }),
          })
          sceneKey = r.key
        } catch {
          /* scene optional */
        }
      }
      if (isNew) {
        // Keep the copy in the same list as the original (member_id NULL = Maisonnée).
        await api('family-notes', {
          method: 'POST',
          body: { media_kind: 'drawing', media_key: key, scene_key: sceneKey, text: '', scope: note.member_id ? 'self' : 'family', member_id: note.member_id },
        })
      } else {
        await api('family-notes', { method: 'PATCH', body: { id: note.id, media_key: key, scene_key: sceneKey } })
      }
    } catch (e) {
      if (isStatus(e, 503)) setDrawHidden(true)
      else if (!(e instanceof ApiError)) throw e
    } finally {
      qc.invalidateQueries({ queryKey: FAMILY_NOTES_KEY })
    }
  }

  function playClip(key: string) {
    try {
      audioRef.current?.pause()
      const a = new Audio(imgUrl(key))
      audioRef.current = a
      void a.play()
    } catch {
      /* autoplay blocked — harmless */
    }
  }

  const fn = t.cercle.familyNotes

  return (
    <section className="cercle-group cercle-notes">
      <header className="cercle-notes__head">
        <HelpTitle help={help} k="notes" className="cercle-notes__title">
          <InlineIcon name="file-text-bold" size={18} /> {fn.title}
        </HelpTitle>
        <p className="cercle-notes__sub mono">{fn.addHint}</p>
      </header>
      {help?.bubbleFor('notes')}

      {/* Whose notes — Maisonnée + each member. The SAME face row as the board's
          "Aujourd'hui" header (the shared MemberSwitcher); seeded from the device
          profile, but this picks LOCALLY (it doesn't move the device profile), and
          also sets the composer scope (a face → Moi, Maisonnée → famille). */}
      <MemberSwitcher
        faces={members.map((m) => ({
          id: m.id,
          name: m.displayName,
          colour: m.colour,
          photoUrl: m.avatarKind === 'photo' && m.avatarRef ? imgUrl(m.avatarRef) : null,
        }))}
        value={face}
        onChange={(id) => {
          setFace(id)
          setScope(id ? 'self' : 'family')
        }}
        allLabel={fn.scopeFamily}
        ariaLabel={fn.title}
      />

      {/* Composer — text + scope toggle (Moi / Maisonnée) + media. Hidden for guests. */}
      {!ro && (
        <div className="cercle-notes__composer card">
          {face && (
            <div className="cercle-notes__scope" role="radiogroup" aria-label={fn.title}>
              {(['self', 'family'] as NoteScope[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={scope === s}
                  className={'cercle-notes__scopebtn' + (scope === s ? ' is-active' : '')}
                  onClick={() => setScope(s)}
                >
                  {s === 'self' ? fn.scopeSelf : fn.scopeFamily}
                </button>
              ))}
            </div>
          )}
          <EditField
            value={text}
            onChange={setText}
            onSubmit={submitText}
            multiline
            maxLength={2000}
            placeholder={fn.placeholder}
            ariaLabel={fn.addHint}
            submitLabel={fn.add}
            submitLeadingIcon="plus-bold"
          />
          {!drawHidden && (
            <MemoControls
              onDone={() => {}}
              endpoint="family-notes"
              affectedKey={FAMILY_NOTES_KEY}
              extraBody={scopeBody(effScope)}
            />
          )}
        </div>
      )}

      {/* Search — iOS-Notes style: one always-there field so any note is a couple of
          keystrokes away (text or author name). Shown whenever there's something to
          search, and kept while a query is active so the clear button stays reachable. */}
      {(shown.length > 0 || query.trim() !== '') && (
        <div className="cnote-search">
          <InlineIcon name="magnifying-glass-bold" size={16} />
          <input
            className="cnote-search__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fn.search}
            aria-label={fn.search}
          />
          {query && (
            <button type="button" className="cnote-search__clear" onClick={() => setQuery('')} aria-label={t.common.close}>
              <Icon name="x-bold" size={14} />
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="cercle-notes__empty mono">{query.trim() ? fn.noMatch : face ? fn.emptyMine : fn.empty}</p>
      ) : (
        <ul className="cnote-list">
          {shown.map((n) => {
            const tint = colorOf(n.author_member_id) ?? 'var(--teal-deep, #2a8f85)'
            const css = { '--note-tint': tint } as React.CSSProperties
            const media = n.media_kind && n.media_key ? n.media_kind : null
            const scopeChip = n.member_id === null ? fn.forFamily : (nameOf(n.member_id) ?? fn.scopeSelf)
            const when = formatDay(n.created_at, lang)

            // Inline text edit — the row turns into the editor in place. Text notes
            // edit their body; audio/photo notes edit their NAME (the caption shown as
            // the title), so a "Mémo vocal" can become "Liste d'épicerie de mémé". A
            // drawing keeps the redraw flow instead, so it's excluded here.
            if (editingId === n.id && media !== 'drawing') {
              return (
                <li key={n.id} className="cnote cnote--editing" style={css}>
                  <EditField
                    value={editText}
                    onChange={setEditText}
                    onSubmit={(v) => saveEdit(n, v)}
                    onCancel={() => setEditingId(null)}
                    multiline={!media}
                    maxLength={2000}
                    autoFocus
                    placeholder={media ? fn.rename : fn.placeholder}
                    submitIcon="check-bold"
                    ariaLabel={media ? fn.rename : fn.edit}
                  />
                </li>
              )
            }

            // iOS row anatomy: a bold first-line title, then a quieter "date · preview"
            // line. Media notes title themselves (Dessin / Photo / Mémo vocal).
            const firstLine = n.text.split('\n').find((l) => l.trim()) ?? ''
            const rest = n.text.slice(firstLine.length).replace(/\n+/g, ' ').trim()
            const mediaLabel = media === 'audio' ? fn.memo : media === 'image' ? fn.photo : media === 'drawing' ? fn.drawing : ''
            const title = firstLine || mediaLabel || fn.title
            const preview = firstLine ? rest || (media ? mediaLabel : '') : media ? '' : rest

            return (
              <li key={n.id} className="cnote" style={css}>
                {/* Visual notes show a tappable thumbnail; text/audio show a tint dot. */}
                {media === 'drawing' || media === 'image' ? (
                  <ZoomableImg className="cnote__thumb" src={imgUrl(n.media_key!)} alt={title} />
                ) : (
                  <span className="cnote__dot" aria-hidden="true">
                    {media === 'audio' ? <InlineIcon name="play-bold" size={14} /> : null}
                  </span>
                )}

                {/* The body: tapping a text note edits it; an audio note plays it; a
                    visual note's body is inert (its thumbnail handles the zoom). */}
                {media === 'audio' ? (
                  <button type="button" className="cnote__main" onClick={() => playClip(n.media_key!)} aria-label={fn.memo}>
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__meta mono">{when}{preview ? ` · ${preview}` : ''}</span>
                  </button>
                ) : !media && !ro ? (
                  <button
                    type="button"
                    className="cnote__main"
                    onClick={() => {
                      setEditingId(n.id)
                      setEditText(n.text)
                    }}
                    aria-label={fn.edit}
                  >
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__meta mono">{when}{preview ? ` · ${preview}` : ''}</span>
                  </button>
                ) : (
                  <span className="cnote__main cnote__main--static">
                    <span className="cnote__title">{title}</span>
                    <span className="cnote__meta mono">{when}{preview ? ` · ${preview}` : ''}</span>
                  </span>
                )}

                <span className="cnote__chip mono">{scopeChip}</span>

                {!ro && (
                  <span className="cnote__actions">
                    {media === 'drawing' && (
                      <button type="button" className="cnote__act" onClick={() => draw.begin(n)} aria-label={fn.edit}>
                        <Icon name="pencil-simple-bold" size={15} />
                      </button>
                    )}
                    {/* Rename: audio + photo notes have no inline tap-to-edit (tapping
                        plays / zooms), so a pencil opens the in-place name editor. */}
                    {(media === 'audio' || media === 'image') && (
                      <button
                        type="button"
                        className="cnote__act"
                        onClick={() => {
                          setEditingId(n.id)
                          setEditText(n.text)
                        }}
                        aria-label={fn.rename}
                      >
                        <Icon name="pencil-simple-bold" size={15} />
                      </button>
                    )}
                    <button type="button" className="cnote__act cnote__act--del" onClick={() => remove(n)} aria-label={fn.delete}>
                      <Icon name="trash-bold" size={15} />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Ask how to continue a drawing note before opening the pad (#14): modify in
          place, an independent copy, or a faded calque. */}
      <DrawEditChoice open={draw.chooserOpen} onCancel={draw.cancelChoice} onPick={draw.pick} />
      {draw.editing && (
        <DrawPad
          open
          {...draw.padProps!}
          onCancel={draw.close}
          onSave={(png, scene) => {
            const note = draw.editing!
            const isNew = draw.isNew
            draw.close()
            void saveDrawing(png, scene, note, isNew)
          }}
        />
      )}
    </section>
  )
}
