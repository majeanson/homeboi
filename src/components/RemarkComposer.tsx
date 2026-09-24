import { useState } from 'react'
import { Modal } from './Modal'
import { EditField } from './EditField'
import { Chip, ChipGroup } from './Chip'
import { useMemoAttach } from './MemoAttach'
import { useVoiceInput } from '../lib/useVoiceInput'
import { useWrite } from '../lib/write'
import { useNotice } from '../lib/toast'
import { useT } from '../i18n'
import { useSurface } from '../lib/surface'
import { useAudience } from '../lib/audience'
import { useOnline } from '../lib/online'
import { recentErrors } from '../lib/errorTrail'
import { REMARKS_KEY } from '../lib/queryKeys'

// « Les remarques » — ONE composer, mounted by all three doors.
//
// Today: Réglages (nothing in particular is wrong) and the crash screen (something very
// particular is). They differ ONLY in the seed they hand in — so they hand it in, and
// share everything else. Two copies of a form is how two surfaces slowly stop agreeing
// about what a remark is; a third door adds a seed, not a file.
//
// ONE FIELD, NOT TWO. The first line becomes the title and the rest becomes the body.
// A title box plus a body box is more correct and less likely to be used: this opens
// because something just went wrong, which is the worst moment to ask someone to fill
// a form. LEAN.md's « generous inside » still applies — the field is multiline, the
// submit is a real labeled CTA under it, and the 📎 is a peer of the mic.

export type RemarkKind = 'bug' | 'wish' | 'polish'

/** What the door knows and the composer should not have to ask for. */
export interface RemarkSeed {
  kind?: RemarkKind
  /** The help-registry key of the section the door was opened from — a SEMANTIC
   *  locator (« kitchen.recipes »), which beats a URL path for finding the code. */
  helpKey?: string
  /** Prefilled text — the crash screen passes what threw. */
  text?: string
}

/**
 * Everything the app already knows and a person should never have to type.
 *
 * This is the half that answers « ça marche chez moi » before the question is asked,
 * and it costs the reporter nothing. Bounded and stringified by the endpoint; a
 * console error can carry household text, so the composer SAYS this travels along
 * rather than collecting it quietly.
 */
function collectContext(surface: string, audience: string, online: boolean): Record<string, unknown> {
  let theme = ''
  let vw = 0
  let vh = 0
  try {
    theme = document.documentElement.dataset.theme ?? ''
    vw = window.innerWidth
    vh = window.innerHeight
  } catch {
    /* a context we cannot read is not worth failing a report over */
  }
  return {
    surface,
    audience,
    online,
    theme,
    viewport: vw && vh ? `${vw}×${vh}` : '',
    lang: typeof document !== 'undefined' ? document.documentElement.lang : '',
    errors: recentErrors(),
  }
}

export function RemarkComposer({
  open,
  onClose,
  seed,
}: {
  open: boolean
  onClose: () => void
  seed?: RemarkSeed
}) {
  const t = useT()
  const write = useWrite()
  const notice = useNotice()
  const { surface } = useSurface()
  const { audience } = useAudience()
  const online = useOnline()

  const [kind, setKind] = useState<RemarkKind>(seed?.kind ?? 'bug')
  const [text, setText] = useState(seed?.text ?? '')
  const [busy, setBusy] = useState(false)
  const voice = useVoiceInput((said) => setText((v) => (v ? `${v} ${said}` : said)))
  const memo = useMemoAttach({ mediaEndpoint: 'remark-media', drawDraftId: 'remark' })

  async function send() {
    const raw = text.trim()
    // `allowEmpty` is on because an attachment can carry the report — but a remark
    // with neither words NOR a blob is nothing, and the host has to be the one to say
    // so (EditField only stops guarding on `value`).
    if (!raw && !memo.draft) return
    const [first, ...rest] = raw.split('\n')
    const title = (first || t.remarks.kindBug).trim().slice(0, 200)
    setBusy(true)
    try {
      await write('remarks', {
        method: 'POST',
        body: {
          kind,
          title,
          body: rest.join('\n').trim(),
          help_key: seed?.helpKey ?? '',
          seen_path: typeof location !== 'undefined' ? location.pathname + location.search : '',
          // The COMMIT, not a timestamp — so the fix reads the code this was seen on.
          // Guarded: the constant only exists in a vite build (see src/vite-env.d.ts).
          seen_build: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : '',
          context: collectContext(surface, audience, online),
          ...memo.body,
        },
        affectedKeys: [REMARKS_KEY],
      })
      memo.reset()
      setText('')
      notice(t.remarks.confirmed)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const KINDS: { id: RemarkKind; label: string }[] = [
    { id: 'bug', label: t.remarks.kindBug },
    { id: 'wish', label: t.remarks.kindWish },
    { id: 'polish', label: t.remarks.kindPolish },
  ]

  return (
    <Modal open={open} onClose={onClose} title={t.remarks.title}>
      <p className="lead">{t.remarks.lead}</p>
      <ChipGroup>
        {KINDS.map((k) => (
          <Chip key={k.id} selected={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </Chip>
        ))}
      </ChipGroup>
      <EditField
        value={text}
        onChange={setText}
        onSubmit={() => void send()}
        placeholder={t.remarks.titlePlaceholder}
        multiline
        rows={5}
        allowEmpty={!!memo.draft}
        busy={busy}
        voice={voice}
        boxActions={memo.attachButton}
        submitLabel={t.remarks.send}
        submitVariant="primary"
        limit={4000}
      >
        {memo.panel}
      </EditField>
      {!memo.hidden && <p className="hint">{t.remarks.attachHint}</p>}
      <p className="hint">{t.remarks.contextNote}</p>
    </Modal>
  )
}
