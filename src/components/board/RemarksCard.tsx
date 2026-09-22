import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { BoardCard } from './BoardCard'
import { ListRow } from '../ListRow'
import { Chip, ChipGroup } from '../Chip'
import { SectionAdd, useSectionAdd } from '../SectionAdd'
import { RemarkComposer } from '../RemarkComposer'
import { api } from '../../lib/api'
import { live } from '../../lib/query'
import { isGuest } from '../../lib/device'
import { useReportEmpty } from '../../lib/useReportEmpty'
import { REMARKS_KEY } from '../../lib/queryKeys'
import { type Remark, KIND_LABEL, STATUS_LABEL, useRemarkVerdict } from '../../lib/remarks'

const TO = '/settings?tab=settings&sub=tablets&focus=remarks'

// « Les remarques » on the board (0136) — what is still waiting on someone, and nothing
// else.
//
// IT SHOWS `open` AND `shipped`, NEVER `confirmed`. A card that kept listing what is
// already settled would never empty, and a list that never empties is the opposite of
// what this app promises. So it is a finite list that drains: you file a remark, it sits
// there, a deploy turns it « expédiée », you tap « C'est réglé » — and the row leaves the
// wall. `mode: 'auto'` then hides the card entirely.
//
// IT IS A WIDGET, NOT A SHORTCUT — Marc's own remark (« widget on board for remarques
// (add and resolve) »), and the first version got it wrong in a way worth writing down.
// It shipped as a pure glance: every row a link into Réglages, the whole card one big
// `<Link>`. That reads well and costs a navigation for the two things you actually do
// with a remark — file one, and say whether it is fixed. Both are here now, in place:
//   · the header ＋ opens the ONE shared composer (a Modal — three doors, one form);
//   · a `shipped` row carries the same two verdict chips Réglages offers.
// The card is therefore a `<div>`, not a `<Link>`: a button inside an anchor is invalid
// HTML and its clicks navigate anyway (the CercleNotesCard precedent — a card that acts
// keeps its door as an explicit link per row, which each title still is).
//
// NO COUNT ON THE HEADER, deliberately. `BoardCard` takes one and most cards use it, but
// « 3 » here would be a score for how broken the app is, sitting on a kitchen wall. The
// rows are the information.
//
// ListRow, NOT `Act`. Act is the board's ACTIVITY row and its `cat` is a closed union of
// household categories (event/meal/chore/list/pantry/routine/birthday/cercle/work) that
// drives colour and glyph. A remark is not one of those, and picking the nearest one
// would be a category error wearing the right component.
//
// A guest sees nothing. That is the MotsCard / home-pins privacy hide, not a permission
// check: an operator can mint a showcase link to their own household, and a babysitter
// has no standing to read what this family thinks of its own board.
export function RemarksCard() {
  const t = useT()
  const ro = isGuest()
  const compose = useSectionAdd()
  const verdict = useRemarkVerdict()
  const [busy, setBusy] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: REMARKS_KEY,
    queryFn: () => api<{ remarks: Remark[] }>('remarks'),
    ...live,
    enabled: !ro,
  })
  const rows = (data?.remarks ?? []).filter((r) => r.status !== 'confirmed')

  // Never a bare `return null`: the slot cannot tell empty from loading, and a card in
  // mode 'always' needs to know.
  useReportEmpty(rows.length === 0)
  // …but an OPEN composer outlives the last row on purpose. Confirming the only remark
  // while filing the next one would otherwise unmount the modal mid-sentence and take
  // the draft with it. The header-only card behind the dialog lasts exactly as long as
  // the dialog does.
  if (ro || (rows.length === 0 && !compose.open)) return null

  async function act(r: Remark, action: 'confirm' | 'reopen') {
    setBusy(r.id)
    try {
      await verdict(r.id, action)
    } finally {
      setBusy(null)
    }
  }

  return (
    <BoardCard
      className="bento"
      label={t.remarks.title}
      icon="warning-bold"
      // The mini keeps the old whole-tile door: a glance tile has no room for chips, so
      // its job is still « take me to the journal ».
      compactTo={TO}
      compactItems={rows.map((r) => r.title)}
      action={<SectionAdd popup open={compose.open} onToggle={compose.toggle} label={t.remarks.signalHere} />}
    >
      <ul className="operator__list">
        {rows.map((r) => (
          <li key={r.id}>
            <ListRow
              title={
                <Link to={TO} className="listrow__link">
                  {r.title}
                </Link>
              }
              // Genre and state as plain words. « Expédiée » is the interesting one: the
              // fix is really in production, and the row is asking someone to go look.
              subtitle={`${KIND_LABEL(t, r.kind)} · ${STATUS_LABEL(t, r.status)}`}
            />
            {/* The human verdict — the SAME pair, the same words and the same rule as
                Réglages (only once a deploy has claimed it: there is nothing to confirm
                before that, and offering it invites closing a remark nobody acted on).
                Under the row, not in ListRow's trailing `actions` slot: two labelled
                chips beside a title do not fit a one-column board card, and a ChipGroup
                wraps where a trailing slot would only get narrower. */}
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
          </li>
        ))}
      </ul>
      <RemarkComposer open={compose.open} onClose={compose.close} />
    </BoardCard>
  )
}
