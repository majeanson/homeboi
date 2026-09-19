import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { live } from '../../lib/query'
import { useConfirm } from '../../lib/confirm'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
import { REMARKS_KEY } from '../../lib/queryKeys'
import { EmptyState } from '../EmptyState'
import { LoadError } from '../LoadError'
import { Chip, ChipGroup } from '../Chip'
import { Disclosure } from '../Disclosure'
import { RowActions } from '../RowActions'
import { OperatorSection } from './OperatorSection'
import { RemarkComposer, type RemarkSeed } from '../RemarkComposer'
import { type Remark, KIND_LABEL, STATUS_LABEL, remarkSubtitle } from '../../lib/remarks'

// Réglages ▸ Système ▸ Appareils & accès ▸ « Les remarques ».
//
// The deliberate door — the one you walk through when nothing crashed and you simply
// want to say something. It is also where you read what came back.
//
// Two other doors open the SAME composer with a seed (see takeSeed below): the « ? »
// bubble on any surface, which knows WHICH section you were asking about, and the crash
// screen, which knows what threw. One composer, three seeds — three copies of a form is
// how three surfaces slowly stop agreeing about what a remark is.
//
// It stacks under the existing pill next to the AI error journal rather than growing a
// fifteenth pill (C-15): both are « what the app has to say about itself », and a
// household that wants one wants the other.
//
// Modelled on todos.tsx, NOT on aiErrors.tsx — that file is the documented exception to
// the write rule (its clear-all deliberately bypasses the outbox) and it has no
// per-row action to copy.

/**
 * The hand-off. ONE mechanism, two callers.
 *
 * `?report=1` means « open the composer », and what rides with it says where from:
 *  · the « ? » bubble on any surface adds `&hk=<help key>` — a SEMANTIC locator
 *    (`kitchen.recipes`), which beats a URL path for finding the code later;
 *  · the crash screen adds the error message through `sessionStorage`, because
 *    ErrorBoundary is deliberately hook-free (it must not be able to throw while
 *    rendering the fallback) and a query string is all it can safely write.
 *
 * Read ONCE and cleared, so a reload does not reopen it.
 */
function takeSeed(): RemarkSeed | null {
  try {
    const params = new URLSearchParams(location.search)
    if (!params.has('report')) return null
    const raw = sessionStorage.getItem('bb-remark-seed')
    sessionStorage.removeItem('bb-remark-seed')
    const stashed = raw ? (JSON.parse(raw) as { text?: string }) : {}
    return {
      kind: 'bug',
      helpKey: params.get('hk') ?? (stashed.text ? 'crash' : ''),
      text: stashed.text ?? '',
    }
  } catch {
    // Blocked storage, or a URL we cannot parse. The door still opened and the person
    // can type. Losing the prefill is never worth losing the report.
    return null
  }
}

export function RemarksSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const confirm = useConfirm()
  const ro = isGuest()
  const [seed] = useState<RemarkSeed | null>(takeSeed)
  const [composing, setComposing] = useState(() => seed !== null)
  const [busy, setBusy] = useState<string | null>(null)

  const state = useQuery({
    queryKey: REMARKS_KEY,
    queryFn: () => api<{ remarks: Remark[] }>('remarks'),
    ...live,
    enabled: !ro,
  })
  // The list is POLLED, so a delete must be deferred: hiding the row optimistically and
  // deferring the write lets the next poll resurrect it mid-undo (the documented
  // flash-back). `visible` and `remove` are two halves of one mechanism — wiring only
  // one is the bug.
  const { remove, visible } = useDeferredRemoval(REMARKS_KEY)

  if (ro) return null

  const all = state.data?.remarks ?? []
  const rows = visible(all)

  async function act(r: Remark, action: 'confirm' | 'reopen', note?: string) {
    setBusy(r.id)
    try {
      await write('remarks', { method: 'PATCH', body: { id: r.id, action, note }, affectedKeys: [REMARKS_KEY] })
    } finally {
      setBusy(null)
    }
  }

  async function drop(r: Remark) {
    // A heavy delete: the journal and every attachment go with it, and the copy says
    // so (confirmCopy.test.ts holds every `…Confirm` string to a consequence).
    if (!(await confirm({ message: t.remarks.deleteConfirm, confirmLabel: t.remarks.deleteLabel, tone: 'danger' }))) return
    remove([r.id], t.remarks.removed, () =>
      write('remarks', { method: 'DELETE', body: { id: r.id }, affectedKeys: [REMARKS_KEY] }),
    )
  }

  return (
    <OperatorSection
      title={t.remarks.title}
      hint={t.remarks.lead}
      help={help}
      helpKey="remarks"
      action={
        <button type="button" className="btn btn--sm" onClick={() => setComposing(true)}>
          {t.remarks.signalHere}
        </button>
      }
    >
      {/* A failed read with nothing cached is a LINE plus « Réessayer » — never a silent
          empty state, which would claim there are no remarks when we simply could not ask. */}
      {state.data === undefined && state.isError ? (
        <LoadError onRetry={() => void state.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState>{t.remarks.empty}</EmptyState>
      ) : (
        <ul className="operator__list">
          {rows.map((r) => (
            <li key={r.id}>
              <Disclosure label={r.title} count={r.events.length}>
                <ChipGroup>
                  <Chip>{KIND_LABEL(t, r.kind)}</Chip>
                  <Chip>{STATUS_LABEL(t, r.status)}</Chip>
                </ChipGroup>
                {r.body && <p>{r.body}</p>}
                <p className="hint">{remarkSubtitle(t, r)}</p>

                <ul className="operator__list">
                  {r.events.map((e) => (
                    <li key={e.id}>
                      <p className="hint">
                        {/* A machine event never wears a face: author_member_id is NULL on
                            'shipped' by schema, and the label says the deployment did it. */}
                        {e.kind === 'shipped' ? t.remarks.journalMachine : ''} {journalLabel(t, e.kind)}
                        {e.sha ? ` — ${t.remarks.shippedIn(e.sha.slice(0, 8))}` : ''}
                      </p>
                      {e.text && <p>{e.text}</p>}
                    </li>
                  ))}
                </ul>

                {/* The human verdict. Only offered once a deploy has claimed it — before
                    that there is nothing to confirm, and offering it anyway would invite
                    someone to close a remark nobody has acted on. */}
                {r.status === 'shipped' && (
                  <ChipGroup>
                    <Chip onClick={() => void act(r, 'confirm')} disabled={busy === r.id}>
                      {t.remarks.confirmFix}
                    </Chip>
                    <Chip onClick={() => void act(r, 'reopen')} disabled={busy === r.id}>
                      {t.remarks.reopen}
                    </Chip>
                  </ChipGroup>
                )}
                <RowActions onDelete={() => void drop(r)} deleteLabel={`${t.remarks.deleteLabel} — ${r.title}`} />
              </Disclosure>
            </li>
          ))}
        </ul>
      )}

      <RemarkComposer open={composing} onClose={() => setComposing(false)} seed={seed ?? undefined} />
    </OperatorSection>
  )
}

// « Expédiée » and « Réglée » are the SAME words as the status chips, on purpose: one
// word per idea (glossary.ts), and a journal that renamed the state it records would be
// two vocabularies for one thing.
function journalLabel(t: ReturnType<typeof useT>, kind: string): string {
  if (kind === 'shipped') return t.remarks.statusShipped
  if (kind === 'confirmed') return t.remarks.statusConfirmed
  if (kind === 'reopened') return t.remarks.journalReopened
  return t.remarks.journalFiled
}
