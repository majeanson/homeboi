import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../i18n'
import { createDeviceStore } from '../../lib/createDeviceStore'
import { useWrite } from '../../lib/write'
import { api } from '../../lib/api'
import { useOnline } from '../../lib/online'
import { useModal } from '../../lib/useModal'
import { caretIntoView } from '../../lib/viewportVars'
import { useHScroll } from '../../lib/hscroll'
import { imgUrl } from '../../lib/image'
import { uploadMedia, MediaUnavailableError } from '../../lib/uploadMedia'
import { FAMILY_NOTES_KEY } from '../../lib/queryKeys'
import { useNotesAdvanced } from '../../lib/notesMode'
import { type FamilyNote, type NoteScope, seedMd } from '../../lib/familyNotes'
import type { MemberFace } from '../MemberSwitcher'
import { FaceSelect } from '../FaceSelect'
import {
  blockKindOf,
  convertLine,
  htmlToMd,
  type LineKind,
  makeLine,
  mdToHtml,
  toggleCheckbox,
} from '../../lib/noteHtml'
import { Icon, type IconName } from '../Icon'
import { DrawPad } from '../DrawPad'

// Full-screen iOS-Notes-style editor for « Le cercle » → Notes, reused for BOTH a new
// note and modifying an existing one (#richnotes). Mirrors DrawPad's shell: a portal to
// <body> + `useModal` (Esc/scroll-lock/focus-trap), flex column sized to the viewport.
//
// ALWAYS WYSIWYG: the body is a contentEditable that is always rendered formatted — the
// user never sees raw Markdown. It uses a FLAT line-block model (lib/noteHtml): each
// visual line is one top-level element, so every toolbar button is a single pure element
// transform (unit-tested in noteHtml.test) and renders identically every time. Storage
// stays Markdown (so the row list + search keep working); we convert on seed (mdToHtml)
// and read back on save (htmlToMd). Inline bold/italic/strike use the browser's native
// execCommand; block kinds (heading/bullet/numbered/checklist/quote) and the tappable
// checkbox use the tested pure transforms.
//
// AUTO-SAVE (iOS-style): closing — back arrow, Esc, OS back gesture — commits the current
// { title, body, scope, attachment }; a brand-new empty note is discarded, an emptied
// existing note is deleted. No Cancel. One optional photo/drawing attachment (uploadMedia /
// DrawPad); audio memos stay a quick-add. R2 unbound (503) → the attach controls hide.
//
// "POUR QUI" (re-scope): a face picker lets you choose who the note is FOR — a member
// (a personal "Moi" note) or the whole Maisonnée — seeded from the picked face for a new
// note and from the note's own scope when editing. Changing it moves the note between
// lists on save (POST/PATCH carry scope + member_id); the author is never rewritten.
type AttachKind = 'image' | 'drawing'
type Fmt = { kind: string; label: string; inline?: boolean; block?: LineKind } & (
  | { glyph: string; mod?: string }
  | { icon: IconName }
)

// « BETA » — the opt-in TipTap editing surface (NoteEditorTiptap), per device.
// The note itself stays the same Markdown either way; this only picks which
// surface edits it, so flipping back and forth is always safe. Lazy: only a
// device that opts in ever downloads TipTap.
const NoteEditorTiptapLazy = lazy(() => import('./NoteEditorTiptap'))
const betaStore = createDeviceStore<boolean>('babillard-note-editor-beta', false, {
  read: (raw) => raw === 'on',
  write: (on) => (on ? 'on' : 'off'),
})

export function NoteEditor({
  open,
  note,
  scope,
  memberId,
  faces,
  onClose,
}: {
  open: boolean
  /** null = compose a new note; otherwise edit this one in place. */
  note: FamilyNote | null
  /** Initial scope for a NEW note (follows the picked face); the "Pour qui" picker can change it. */
  scope: NoteScope
  memberId: string | null
  /** Household faces for the "Pour qui" picker — pre-resolved (photoUrl included), so
   *  BOTH member shapes can host the editor (the cercle's camelCase Member and the
   *  board's snake_case row map to the same MemberFace). */
  faces: MemberFace[]
  onClose: () => void
}) {
  const t = useT()
  const fn = t.cercle.familyNotes
  const write = useWrite()
  const online = useOnline()
  const toolbarScroll = useHScroll<HTMLDivElement>()

  const rootRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Every R2 key we UPLOADED during this editing session. On close we free any that
  // the saved note won't reference — an in-editor replace/remove/discard would
  // otherwise orphan the superseded blob in R2 (it was never written into a row, so
  // no server-side row-delete ever frees it). Reset each time the editor (re)opens.
  const sessionKeysRef = useRef<Set<string>>(new Set())
  // The last caret/selection that lived INSIDE the body. A toolbar button must not steal
  // or reset the caret, but if focus drifted (the title input, or a never-touched new
  // note) we restore from here so every button "just works". See ensureSelection().
  const lastRangeRef = useRef<Range | null>(null)

  const [title, setTitle] = useState('')
  // "Pour qui" — who the note is FOR: a member id (personal "Moi" note) or null = Maisonnée.
  const [forMember, setForMember] = useState<string | null>(null)
  const [mediaKind, setMediaKind] = useState<AttachKind | null>(null)
  const [mediaKey, setMediaKey] = useState<string | null>(null)
  const [sceneKey, setSceneKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mediaOff, setMediaOff] = useState(false)
  const [drawOpen, setDrawOpen] = useState(false)
  const [active, setActive] = useState<Record<string, boolean>>({})

  // « BETA » — which editing surface this device uses (see betaStore above). The
  // in-progress body survives a flip: toggling snapshots the live Markdown into
  // draftMdRef, and whichever surface mounts next seeds from it. SIMPLE mode has no
  // BETA chip, so it also has no way back out of the TipTap surface — pin it to the
  // classic one there rather than stranding a device that had flipped it on.
  const advanced = useNotesAdvanced()
  const beta = betaStore.use() && advanced
  const tiptapMdRef = useRef<(() => string) | null>(null)
  const draftMdRef = useRef<string | null>(null)

  // The CURRENT body as Markdown, whichever surface is live. Falls back to the
  // last flip snapshot, then the stored note (the beta surface may still be
  // lazy-loading when a fast close commits).
  function currentMd(): string {
    if (beta) return tiptapMdRef.current?.() ?? draftMdRef.current ?? note?.text ?? ''
    if (editorRef.current) return htmlToMd(editorRef.current)
    return draftMdRef.current ?? note?.text ?? ''
  }
  function toggleBeta() {
    draftMdRef.current = currentMd()
    betaStore.set(!beta)
  }

  // Seed from the note each time the editor opens (or the target note changes). The
  // contentEditable is uncontrolled — we set its HTML ONCE here and never from a render,
  // so the caret is never disturbed by React updates. (The body itself seeds in the
  // effect below, which also re-runs on a BETA↔classic flip.)
  useEffect(() => {
    if (!open) return
    // Simple mode has no title FIELD: the note's first words are its title (iOS
    // style), so the stored title folds into the body on open (see seedMd) and the
    // save writes an empty one.
    setTitle(advanced ? (note?.title ?? '') : '')
    // Editing → the note's own scope; new note → the picked face (scope/memberId props).
    setForMember(note ? note.member_id : scope === 'self' ? memberId : null)
    const mk = note && (note.media_kind === 'image' || note.media_kind === 'drawing') ? note.media_kind : null
    setMediaKind(mk)
    setMediaKey(mk ? note!.media_key : null)
    setSceneKey(mk === 'drawing' ? (note?.scene_key ?? null) : null)
    sessionKeysRef.current = new Set() // fresh editing session — nothing uploaded yet
    draftMdRef.current = null // a new session never inherits the last one's flip snapshot
    setActive({})
  }, [open, note, scope, memberId, advanced])

  // Seed the CLASSIC body — on open, and again whenever the BETA flip hands the
  // surface back (the contentEditable remounts empty then; the draft snapshot,
  // else the stored note, refills it).
  useEffect(() => {
    if (!open || beta) return
    const root = editorRef.current
    if (!root) return
    const md = draftMdRef.current ?? seedMd(note, advanced)
    root.innerHTML = mdToHtml(md)
    root.setAttribute('data-empty', md.trim() ? 'false' : 'true')
    // With no title field above it, the body IS the first thing you type into.
    if (!advanced && !note) root.focus()
  }, [open, note, beta, advanced])

  // Commit on close (auto-save). Held in a ref so the stable handleClose passed to
  // useModal always runs the latest state without re-subscribing the Esc handler.
  const commitRef = useRef<() => void>(() => {})
  commitRef.current = () => {
    // Simple mode: the title is DERIVED (the rows already fall back to the body's
    // first line), so it saves empty — the words you typed are the heading.
    const ti = advanced ? title.trim() : ''
    const bo = currentMd().trim()
    const empty = !ti && !bo && !mediaKey
    // The "Pour qui" pick → wire scope: a member id = a personal note, null = Maisonnée.
    const effScope: NoteScope = forMember ? 'self' : 'family'

    // Free any blob we uploaded this session that the saved note won't reference —
    // a replace/remove/discard leaves the superseded upload orphaned in R2 (it was
    // never written into a row, so no server-side row-delete frees it). The note's
    // OWN persisted keys aren't in this set, so the server still owns those (it frees
    // them on PATCH/DELETE). Best-effort, fire-and-forget — a leak beats a failed save.
    const keptKeys = new Set<string>()
    if (!empty && mediaKind && mediaKey) {
      keptKeys.add(mediaKey)
      if (sceneKey) keptKeys.add(sceneKey)
    }
    sessionKeysRef.current.forEach((k) => {
      if (!keptKeys.has(k)) void api('note-media', { method: 'DELETE', body: { key: k } }).catch(() => {})
    })
    if (!note) {
      if (empty) return // discard a brand-new, untouched note
      void write('family-notes', {
        method: 'POST',
        body: { title: ti, text: bo, scope: effScope, member_id: forMember, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
        affectedKeys: [FAMILY_NOTES_KEY],
      }).catch(() => {})
      return
    }
    if (empty) {
      void write('family-notes', { method: 'DELETE', body: { id: note.id }, affectedKeys: [FAMILY_NOTES_KEY] }).catch(() => {})
      return
    }
    void write('family-notes', {
      method: 'PATCH',
      body: { id: note.id, title: ti, text: bo, scope: effScope, member_id: forMember, media_kind: mediaKind, media_key: mediaKey, scene_key: sceneKey },
      affectedKeys: [FAMILY_NOTES_KEY],
    }).catch(() => {})
  }

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const handleClose = useRef(() => {
    commitRef.current()
    onCloseRef.current()
  }).current

  useModal(rootRef, handleClose, { open })

  // Keep toolbar active-state in sync as the caret moves, and remember the latest caret
  // that was inside the body so a toolbar press can restore it if focus drifted.
  useEffect(() => {
    if (!open) return
    const h = () => {
      saveSelection()
      updateActive()
    }
    document.addEventListener('selectionchange', h)
    return () => document.removeEventListener('selectionchange', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Enter's SECOND door: mobile soft keyboards (GBoard, iOS) report keyCode 229 for
  // every key, so the keydown guard below — there to protect real IME composition —
  // swallows their Enter too, and the native insertParagraph then clones the current
  // block, checkbox widget included. `beforeinput` fires reliably with a typed
  // inputType on those keyboards; both doors funnel into the ONE handleEnter().
  // Native listener (not React's onBeforeInput, which predates Input Events L2 and
  // doesn't expose inputType everywhere). When keydown DID handle it, its
  // preventDefault stops this event from ever firing — no double line.
  useEffect(() => {
    if (!open || beta) return // the BETA surface (ProseMirror) owns its own Enter
    const el = editorRef.current
    if (!el) return
    const h = (e: InputEvent) => {
      if (e.inputType !== 'insertParagraph') return
      if (handleEnter()) {
        e.preventDefault()
        afterInput()
      }
    }
    el.addEventListener('beforeinput', h)
    return () => el.removeEventListener('beforeinput', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, beta])

  if (!open) return null

  // ── contentEditable helpers (flat line-block model) ───────────────────────────────
  function topLevelOf(node: Node | null): HTMLElement | null {
    const root = editorRef.current
    if (!root || !node) return null
    let el: HTMLElement | null = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement
    while (el && el.parentElement && el.parentElement !== root) el = el.parentElement
    return el && el.parentElement === root ? el : null
  }
  function selectedBlocks(): HTMLElement[] {
    const sel = window.getSelection()
    const root = editorRef.current
    if (!sel || sel.rangeCount === 0 || !root) return []
    const a = topLevelOf(sel.anchorNode)
    const f = topLevelOf(sel.focusNode)
    if (!a) return []
    if (!f || a === f) return [a]
    const kids = Array.from(root.children) as HTMLElement[]
    let i = kids.indexOf(a)
    let j = kids.indexOf(f)
    if (i < 0 || j < 0) return [a]
    if (i > j) [i, j] = [j, i]
    return kids.slice(i, j + 1)
  }
  function caretToEnd(el: HTMLElement) {
    const sel = window.getSelection()
    if (!sel) return
    const r = document.createRange()
    r.selectNodeContents(el)
    r.collapse(false)
    sel.removeAllRanges()
    sel.addRange(r)
  }
  // Caret to the START of a line's CONTENT — after the checkbox widget on a check
  // line, never before it (text typed ahead of the box would render outside it).
  function caretToContentStart(el: HTMLElement) {
    const sel = window.getSelection()
    if (!sel) return
    const r = document.createRange()
    const cb = el.querySelector(':scope > .ne-cb')
    if (cb) r.setStartAfter(cb)
    else r.setStart(el, 0)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)
  }
  // Is the live selection anchored inside the body? (vs. the title input / nowhere.)
  function selectionInEditor(): boolean {
    const sel = window.getSelection()
    const root = editorRef.current
    if (!sel || sel.rangeCount === 0 || !root) return false
    return !!sel.anchorNode && root.contains(sel.anchorNode)
  }
  // Snapshot the caret whenever it's inside the body, so a toolbar press can put it back.
  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount && selectionInEditor()) lastRangeRef.current = sel.getRangeAt(0).cloneRange()
  }
  // Guarantee a caret lives inside the body before running any command — the heart of
  // both fixes. If the selection is already in the body we leave it EXACTLY where it is
  // (so a mid-sentence bold/italic toggle keeps its collapsed caret instead of jumping to
  // the start on a re-focus). Otherwise we restore the last in-body caret, or drop one at
  // the end of the last line — so clicking any button from a fresh/empty note just works.
  function ensureSelection(): boolean {
    const root = editorRef.current
    if (!root) return false
    if (selectionInEditor()) return true
    const sel = window.getSelection()
    if (!sel) return false
    const last = lastRangeRef.current
    if (last && root.contains(last.startContainer)) {
      root.focus()
      sel.removeAllRanges()
      sel.addRange(last)
      return true
    }
    root.focus()
    const blocks = Array.from(root.children) as HTMLElement[]
    const target = blocks[blocks.length - 1]
    if (!target) return false
    caretToEnd(target)
    return true
  }
  function updateActive() {
    const a: Record<string, boolean> = {}
    try {
      a.bold = document.queryCommandState('bold')
      a.italic = document.queryCommandState('italic')
      a.strike = document.queryCommandState('strikeThrough')
    } catch {
      /* queryCommandState unsupported — leave inline states off */
    }
    const blocks = selectedBlocks()
    const k = blocks.length ? blockKindOf(blocks[0]) : 'plain'
    a.heading = k === 'heading'
    a.bullet = k === 'bullet'
    a.numbered = k === 'numbered'
    a.check = k === 'check'
    a.quote = k === 'quote'
    // selectionchange fires on EVERY frame of a selection-handle drag — bail on a
    // no-op so the whole editor doesn't re-render 60×/s under the user's finger.
    setActive((prev) => (Object.keys(a).every((key) => !!prev[key] === a[key]) && Object.keys(prev).length === Object.keys(a).length ? prev : a))
  }
  function afterInput() {
    const root = editorRef.current
    if (!root) return
    root.setAttribute('data-empty', htmlToMd(root).trim() ? 'false' : 'true')
    updateActive()
    // Every edit path funnels through here (typing, Enter-continues-the-list, a toolbar
    // command, a checkbox toggle), so this is the one place that has to keep the line
    // being written above the keyboard rather than letting it run off the bottom.
    caretIntoView(root)
  }
  function inlineCmd(cmd: string) {
    if (!ensureSelection()) return
    try {
      // Force tag-based output (<b>/<i>/<s>) not inline styles, so strike/bold always
      // round-trip through htmlToMd — a styled <span> would serialize to nothing.
      document.execCommand('styleWithCSS', false, 'false')
      document.execCommand(cmd, false)
    } catch {
      /* execCommand unsupported — inline formatting unavailable, the rest still works */
    }
    afterInput()
  }
  function blockCmd(kind: LineKind) {
    const root = editorRef.current
    if (!root) return
    if (!ensureSelection()) return
    const blocks = selectedBlocks()
    if (!blocks.length) return
    // Toggle: if every selected line already IS this kind, turn them back to plain.
    const target: LineKind = blocks.every((b) => blockKindOf(b) === kind) ? 'plain' : kind
    let last: HTMLElement | null = null
    blocks.forEach((b) => {
      const nb = convertLine(b, target)
      b.replaceWith(nb)
      last = nb
    })
    if (last) caretToEnd(last)
    afterInput()
  }
  function onEditorPaste(e: React.ClipboardEvent) {
    // Rich clipboard HTML would land as arbitrary live DOM (foreign tags, inline
    // styles, <img> with event attributes) that the flat line-block model can't
    // represent — htmlToMd drops it all on save, but the transient DOM shouldn't
    // hold it either. Force plain text through the caret: behaves like fast
    // typing (native undo, caret follows, \n becomes <br> which htmlToMd already
    // splits back into lines).
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    try {
      document.execCommand('insertText', false, text)
    } catch {
      /* execCommand unsupported — drop the paste rather than inject raw HTML */
    }
    afterInput()
  }
  // The ONE Enter behaviour for list/check lines, shared by the keydown door
  // (hardware keyboards) and the beforeinput door (mobile soft keyboards — see the
  // effect above). Returns true when it handled the key (caller preventDefaults +
  // afterInput); false lets the browser's native insertParagraph run (plain lines,
  // headings, quotes).
  function handleEnter(): boolean {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return false
    // Enter over an expanded selection replaces it — native behaviour we were
    // suppressing before (the old handler preventDefaulted without deleting, so the
    // selected text survived every Enter).
    if (!sel.isCollapsed) sel.deleteFromDocument()
    const cur = selectedBlocks()[0]
    if (!cur) return false
    const k = blockKindOf(cur)
    if (k !== 'bullet' && k !== 'numbered' && k !== 'check') return false
    // Intuitive list behaviour: Enter continues the list; Enter on an empty item ends it.
    if (!(cur.textContent ?? '').trim()) {
      const plain = makeLine('plain', '')
      cur.replaceWith(plain)
      caretToEnd(plain)
      return true
    }
    // SPLIT at the caret: everything after it moves into the new same-kind line —
    // Enter mid-sentence must carry the tail along ("reposition things"), not
    // strand it on the old line while the caret jumps to an empty one below.
    let tailHtml = ''
    try {
      const r = sel.getRangeAt(0)
      const tail = document.createRange()
      tail.setStart(r.startContainer, r.startOffset)
      tail.setEnd(cur, cur.childNodes.length)
      const frag = tail.extractContents()
      const tmp = document.createElement('div')
      tmp.appendChild(frag)
      // A caret sitting BEFORE the checkbox widget would drag the original widget
      // into the tail — the new makeLine brings its own; drop any stowaway.
      tmp.querySelectorAll('.ne-cb').forEach((n) => n.remove())
      tailHtml = tmp.innerHTML
    } catch {
      /* an odd range (e.g. anchored outside cur) — fall back to an empty new line */
    }
    // Re-normalize what's left of the current line (the extraction can leave it
    // empty, or a check line without its widget when the caret sat at position 0).
    const fixedCur = convertLine(cur, k)
    cur.replaceWith(fixedCur)
    const nl = makeLine(k, tailHtml) // a split check line continues UNCHECKED
    fixedCur.after(nl)
    caretToContentStart(nl)
    return true
  }
  function onEditorKeyDown(e: React.KeyboardEvent) {
    // Mid-IME-composition Enter commits the composition, not the line — let the
    // editor see only the real keystroke (keyCode 229 = the legacy IME signal; on
    // mobile soft keyboards that code covers EVERY key, which is exactly why the
    // beforeinput door exists).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key !== 'Enter' || e.shiftKey) return
    if (handleEnter()) {
      e.preventDefault()
      afterInput()
    }
  }
  function onEditorClick(e: React.MouseEvent) {
    const cb = (e.target as HTMLElement).closest?.('.ne-cb')
    if (cb) {
      e.preventDefault()
      const line = cb.closest('.ne-check')
      if (line && toggleCheckbox(line)) afterInput()
    }
  }

  async function onPhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return
    setBusy(true)
    try {
      const key = await uploadMedia('note-media', file, { resize: true })
      sessionKeysRef.current.add(key) // track for cleanup if later replaced/removed/discarded
      setMediaKind('image')
      setMediaKey(key)
      setSceneKey(null)
    } catch (err) {
      if (err instanceof MediaUnavailableError) setMediaOff(true)
    } finally {
      setBusy(false)
    }
  }
  async function onDrawSave(png: Blob, scene: string) {
    setDrawOpen(false)
    setBusy(true)
    try {
      const key = await uploadMedia('note-media', png, { resize: false, filename: 'drawing.png' })
      sessionKeysRef.current.add(key) // track for cleanup if later replaced/removed/discarded
      let sk: string | null = null
      if (scene) {
        try {
          sk = await uploadMedia('note-media', new Blob([scene], { type: 'application/json' }), { resize: false })
          sessionKeysRef.current.add(sk)
        } catch {
          /* scene optional — the PNG stands alone */
        }
      }
      setMediaKind('drawing')
      setMediaKey(key)
      setSceneKey(sk)
    } catch (err) {
      if (err instanceof MediaUnavailableError) setMediaOff(true)
    } finally {
      setBusy(false)
    }
  }
  function removeMedia() {
    setMediaKind(null)
    setMediaKey(null)
    setSceneKey(null)
  }

  const FORMATS: Fmt[] = [
    { kind: 'bold', inline: true, glyph: 'B', mod: 'b', label: fn.fmtBold },
    { kind: 'italic', inline: true, glyph: 'I', mod: 'i', label: fn.fmtItalic },
    { kind: 'strike', inline: true, glyph: 'S', mod: 's', label: fn.fmtStrike },
    { kind: 'heading', block: 'heading', glyph: 'H', mod: 'h', label: fn.fmtHeading },
    { kind: 'bullet', block: 'bullet', glyph: '•', label: fn.fmtBullet },
    { kind: 'numbered', block: 'numbered', glyph: '1.', label: fn.fmtNumbered },
    { kind: 'check', block: 'check', icon: 'check-square-bold', label: fn.fmtCheck },
    { kind: 'quote', block: 'quote', glyph: '❝', label: fn.fmtQuote },
  ]
  const runFmt = (f: Fmt) => {
    if (f.inline) inlineCmd(f.kind === 'bold' ? 'bold' : f.kind === 'italic' ? 'italic' : 'strikeThrough')
    else if (f.block) blockCmd(f.block)
  }

  return createPortal(
    <div ref={rootRef} className="note-editor" role="dialog" aria-modal="true" aria-label={note ? fn.editorEdit : fn.editorNew}>
      <header className="note-editor__head">
        <button type="button" className="note-editor__back" onClick={handleClose} aria-label={fn.done}>
          <Icon name="caret-left-bold" size={20} />
        </button>
        <span className="note-editor__heading">{note ? fn.editorEdit : fn.editorNew}</span>
        {/* « BETA » — flip to the TipTap surface (and back). The body carries over;
            the note stays the same Markdown either way. Advanced only: simple mode
            keeps the editor to one surface (lib/notesMode). */}
        {advanced && (
          <button
            type="button"
            className={'note-editor__toggle mono' + (beta ? ' is-on' : '')}
            onClick={toggleBeta}
            aria-pressed={beta}
            aria-label={beta ? fn.betaBack : fn.betaTry}
            title={beta ? fn.betaBack : fn.betaTry}
          >
            BETA
          </button>
        )}
      </header>

      {/* The explicit title field is ADVANCED only. In simple mode the note's first
          words are its title (iOS style) — one thing to write, not two. */}
      {advanced && (
        <input
          className="input note-editor__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={fn.titlePlaceholder}
          aria-label={fn.titlePlaceholder}
          maxLength={120}
          autoFocus={!note}
        />
      )}

      {/* "Pour qui" — re-scope the note to a member ("Moi") or the whole Maisonnée. */}
      <div className="note-editor__scope">
        <span className="note-editor__scopelabel mono">{fn.forWhom}</span>
        <FaceSelect
          faces={faces}
          value={forMember}
          onChange={setForMember}
          allLabel={fn.scopeFamily}
          ariaLabel={fn.forWhom}
        />
      </div>

      {beta ? (
        // The BETA surface (TipTap) renders its own toolbar + body in the same
        // chrome slots, so the keyboard-fit CSS applies unchanged. While the lazy
        // chunk loads, an empty stage keeps the shell's layout stable.
        <Suspense fallback={<div className="note-editor__stage" />}>
          <NoteEditorTiptapLazy
            initialMd={draftMdRef.current ?? note?.text ?? ''}
            getMdRef={tiptapMdRef}
            ariaLabel={note ? fn.editorEdit : fn.editorNew}
          />
        </Suspense>
      ) : (
        <>
          {/* The format row hides its scrollbar and overflows on a phone (the ❝ quote
              button was cut in half). useHScroll is the house rule for any such row: it
              maps the mouse wheel onto it — without which the clipped buttons are
              literally unreachable on a desktop — and its data-hs stamp fades the edge
              so a phone can SEE that the row continues. */}
          <div ref={toolbarScroll.ref} className="note-editor__toolbar" role="group" aria-label={fn.format}>
            {FORMATS.map((f) => (
              <button
                key={f.kind}
                type="button"
                className={'note-editor__fmt' + (active[f.kind] ? ' is-on' : '')}
                // Keep the editor's selection — a button mousedown must not steal focus.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runFmt(f)}
                aria-label={f.label}
                aria-pressed={!!active[f.kind]}
                title={f.label}
              >
                {'icon' in f ? <Icon name={f.icon} size={18} /> : <span className={'note-editor__glyph' + (f.mod ? ' note-editor__glyph--' + f.mod : '')} aria-hidden="true">{f.glyph}</span>}
              </button>
            ))}
          </div>

          <div className="note-editor__stage">
            <div
              ref={editorRef}
              className="note-editor__body note-md"
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label={note ? fn.editorEdit : fn.editorNew}
              data-placeholder={fn.placeholder}
              data-empty="true"
              onInput={afterInput}
              onKeyDown={onEditorKeyDown}
              onPaste={onEditorPaste}
              onClick={onEditorClick}
            />
          </div>
        </>
      )}

      {!mediaOff && (
        <div className="note-editor__media">
          {mediaKey ? (
            <div className="note-editor__attach">
              <img src={imgUrl(mediaKey)} alt="" className="note-editor__attachimg" />
              <button type="button" className="btn btn--ghost" onClick={() => (mediaKind === 'drawing' ? setDrawOpen(true) : photoInputRef.current?.click())} disabled={busy || (mediaKind === 'image' && !online)}>
                <Icon name="pencil-simple-bold" size={16} /> {mediaKind === 'drawing' ? fn.attachDrawing : fn.attachPhoto}
              </button>
              <button type="button" className="btn btn--ghost note-editor__attachdel" onClick={removeMedia} disabled={busy}>
                <Icon name="trash-bold" size={16} /> {fn.attachRemove}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => photoInputRef.current?.click()} disabled={busy || !online}>
                <Icon name="image-square-bold" size={18} /> {fn.attachPhoto}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setDrawOpen(true)} disabled={busy}>
                <Icon name="pencil-simple-bold" size={18} /> {fn.attachDrawing}
              </button>
            </>
          )}
        </div>
      )}

      <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={onPhotoFile} aria-hidden="true" tabIndex={-1} />

      {drawOpen && (
        <DrawPad
          open
          onCancel={() => setDrawOpen(false)}
          onSave={onDrawSave}
          initial={mediaKind === 'drawing' && mediaKey ? imgUrl(mediaKey) : undefined}
          initialSceneUrl={mediaKind === 'drawing' && sceneKey ? imgUrl(sceneKey) : undefined}
        />
      )}
    </div>,
    document.body,
  )
}
