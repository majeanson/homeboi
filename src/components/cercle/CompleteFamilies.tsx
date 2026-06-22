import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY } from '../../lib/queryKeys'
import { Icon } from '../Icon'
import { ReviewChecklist } from '../ReviewChecklist'
import {
  proposeFamilyLinks,
  parsePersonKey,
  genderedRelLabel,
  type Person,
  type ContactLink,
  type ContactGroup,
  type FamilyLinkProposal,
} from '../../lib/cercle'

// « Compléter les familles » — one button that makes every named « famille »-kind
// group 100% related, using the hierarchy the existing links already imply: it
// proposes the precise rung where the links reveal one (siblings via a shared parent,
// grandparent chains, cousins…) and a generic « membre de la famille » tie where none
// can be known, so nobody you grouped together is left disconnected. The proposals go
// through the SHARED ReviewChecklist (the same approve-then-apply flow as the .vcf
// import) — the operator ticks what to keep, then we POST/PATCH the chosen links.
export function CompleteFamilies({
  people,
  storedLinks,
  groups,
  disabled = false,
}: {
  people: Person[]
  storedLinks: ContactLink[]
  groups: ContactGroup[] // the family-kind groups to complete
  disabled?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const byKey = useMemo(() => new Map(people.map((p) => [p.key, p])), [people])
  const proposals = useMemo(() => proposeFamilyLinks(people, storedLinks, groups), [people, storedLinks, groups])

  // Nothing to do (no family groups, or every one already complete) → no button, calm.
  if (proposals.length === 0) return null

  async function apply(selected: FamilyLinkProposal[]) {
    setBusy(true)
    try {
      for (const p of selected) {
        const a = parsePersonKey(p.aKey)
        const b = parsePersonKey(p.bKey)
        try {
          if (p.op === 'create')
            await write('cercle-links', {
              method: 'POST',
              body: { aId: a.id, aKind: a.kind, bId: b.id, bKind: b.kind, type: p.type },
              affectedKeys: [CERCLE_KEY],
            })
          else
            await write('cercle-links', {
              method: 'PATCH',
              body: { id: p.existingId, type: p.type },
              affectedKeys: [CERCLE_KEY],
            })
        } catch {
          // A pair that raced to "already linked" (409) — skip it, keep applying the rest.
        }
      }
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }

  // "Léa · Sœur de Jérémie" — the relation reads from A's side, gendered by A.
  const renderRow = (p: FamilyLinkProposal) => {
    const a = byKey.get(p.aKey)
    const b = byKey.get(p.bKey)
    const rel = genderedRelLabel(p.type, a?.gender ?? null, lang)
    const why = p.op === 'modify' ? t.cercle.completePrecise : p.inferred ? t.cercle.completeInferred : t.cercle.completeGuess
    return (
      <>
        <span className="review__name">
          {a?.name ?? '—'} · <strong>{rel}</strong> {lang === 'fr' ? 'de' : 'of'} {b?.name ?? '—'}
        </span>
        <span className="review__sub">{why}</span>
      </>
    )
  }

  return (
    <>
      <button type="button" className="btn btn--sm btn--ghost cercle-complete" disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name="users-three-bold" size={15} /> {t.cercle.completeFamilies}
        <span className="mono cercle-complete__n">{proposals.length}</span>
      </button>
      <ReviewChecklist
        open={open}
        onClose={() => setOpen(false)}
        title={t.cercle.completeFamilies}
        items={proposals}
        renderItem={renderRow}
        onApply={(sel) => void apply(sel)}
        applyAllLabel={(n) => t.cercle.completeApplyAll(n)}
        applySelectedLabel={(n) => t.cercle.completeApply(n)}
        emptyLabel={t.cercle.completeEmpty}
        busy={busy}
      />
    </>
  )
}
