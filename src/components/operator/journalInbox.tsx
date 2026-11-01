import { useEffect, useState } from 'react'
import { useOperatorT } from '../../i18n.operator'
import { api } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { useConfirm } from '../../lib/confirm'
import { Cluster } from '../Layout'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'

// « Mon journal » — the one new SURFACE this feature adds (migration 0146,
// plans/JOURNAL-EWRITER.md). Deliberately one card and three actions, nothing more.
//
// The feature's whole design is that an arriving entry needs NO new UI: a handwritten
// page mailed in becomes an ordinary `family_notes` row, so it shows up in « Les notes »
// beside the typed ones and is searchable at once through SEARCH_INDEX.familyNote.
// What a person cannot do without a screen is learn the address to point the device at
// — so that, and only that, is what this card is for.
//
// It stacks under Système ▸ « Appareils & accès » rather than opening a fifteenth pill
// (C-15, the standing rule). That sub is the household's ACCESS screen — pairing, the
// agent credential, guest links, the other parent — and an inbound mail address is
// exactly that: a credential that lets something outside write in.

// No `helpKey`, and that is a decision rather than an omission: a help bubble here
// would need a new entry in OPERATOR_HELP, which must cite a guide card + point — and
// CLAUDE.md records the guide at 32 cards against a ~32 merge-first ceiling. Spending
// the 33rd on an address field would be the wrong call for a feature that is one line
// of explanation. `anchor` still gives the card its `?focus=journalInbox` DOM id, so a
// deep link lands on it; the hint line carries the explanation a bubble would have.
export function JournalInboxSection() {
  const o = useOperatorT()
  const confirm = useConfirm()
  const [address, setAddress] = useState<string | null>(null)
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    api<{ address: string | null; enabled: boolean }>('journal-inbox')
      .then((r) => {
        if (!alive) return
        setAddress(r.address)
        setEnabled(r.enabled)
      })
      // A failed read leaves `enabled` null → the card renders its own quiet line
      // rather than an empty box that looks like « there is nothing here ».
      .catch(() => alive && setEnabled(null))
    return () => {
      alive = false
    }
  }, [])

  // Minting an address is a write, and it hands out a credential: a read-only link
  // guest never sees this door. (The server refuses it too — the endpoint is
  // operator-scoped — so this is the visible half of a guard that holds either way.)
  if (isGuest()) return null

  async function mint(rotate: boolean) {
    if (busy) return
    if (rotate) {
      const okToRotate = await confirm({ message: o.journalRotateConfirm, confirmLabel: o.journalRotateGo })
      if (!okToRotate) return
    }
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      // `api()` and not `useWrite()`, on purpose, and the ALLOWED entry in
      // write-rule.test.ts says the same: the offline outbox would be actively WRONG
      // here. The caller needs the minted address to display NOW, and a queued mint
      // replayed after a reconnection could hand back a second address for a face that
      // already has one — the exact duplicate the unique index exists to prevent.
      const res = await api<{ address: string | null }>('journal-inbox', {
        method: 'POST',
        body: rotate ? { rotate: true } : {},
      })
      setAddress(res.address)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
    } catch {
      // Clipboard denied (an insecure origin, a locked-down tablet). The address is on
      // screen and selectable, so a convenience failed, not the door.
    }
  }

  return (
    <OperatorSection title={o.journalTitle} hint={o.journalLead} anchor="journalInbox">
      {enabled === false ? (
        // JOURNAL_MAIL_DOMAIN unset — the optional-binding contract (AI, R2, the DO all
        // behave this way): say so plainly instead of offering a button that 503s.
        <StatusMessage tone="info">{o.journalOff}</StatusMessage>
      ) : !address ? (
        <button type="button" className="btn btn--primary" onClick={() => mint(false)} disabled={busy}>
          {o.journalMint}
        </button>
      ) : (
        <>
          <pre className="operator__token">{address}</pre>
          <Cluster>
            <button type="button" className="btn" onClick={copy}>
              {copied ? o.journalCopied : o.journalCopy}
            </button>
            <button type="button" className="btn" onClick={() => mint(true)} disabled={busy}>
              {o.journalRotate}
            </button>
          </Cluster>
          <StatusMessage tone="info">{o.journalHow}</StatusMessage>
        </>
      )}
      {err && <StatusMessage tone="error">{err}</StatusMessage>}
    </OperatorSection>
  )
}
