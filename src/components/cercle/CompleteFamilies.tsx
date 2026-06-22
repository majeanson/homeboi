import { useMemo, useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { CERCLE_KEY } from '../../lib/queryKeys'
import { Icon } from '../Icon'
import { ReviewChecklist } from '../ReviewChecklist'
import {
  proposeAllFamilyLinks,
  parsePersonKey,
  genderedRelLabel,
  isFamilyRel,
  type Person,
  type ContactLink,
  type ContactGroup,
  type FamilyLinkProposal,
} from '../../lib/cercle'

// « Compléter les familles » — ONE button that deduces every family link worth making
// across the whole circle, then lets you tick which to keep (the same approve-then-apply
// ReviewChecklist as the .vcf import). It proposes both:
//   • the precise rungs that complete each named famille group (siblings via a shared
//     parent, grandparent chains, cousins…) + a generic « membre de la famille » tie
//     where no rung is knowable, AND
//   • the cross-family bridges the existing links already imply (`proposeAllFamilyLinks`
//     folds in inferLinks: co-parents → spouse, shared parent → sibling, a spouse's
//     parents → in-law) — so connecting ONE member to another family surfaces all the
//     in-law/sibling ties between them, no named group required.
// Nothing to propose yet → a calm hint nudges "link a few people first, then complete
// here" instead of an empty void.
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
  const proposals = useMemo(() => proposeAllFamilyLinks(people, storedLinks, groups), [people, storedLinks, groups])

  // Nothing deducible. Distinguish "no links seeded yet" → a one-line nudge to get
  // started ("link a few people, then complete here"), from "already all connected" →
  // stay calm + empty (no dangling affordance). The nudge only shows on a sparse circle.
  if (proposals.length === 0) {
    if (storedLinks.some((l) => isFamilyRel(l.type))) return null
    return (
      <p className="cercle-complete__hint mono">
        <Icon name="users-three-bold" size={14} /> {t.cercle.completeHint}
      </p>
    )
  }

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
    const why = p.reason ? p.reason[lang] : p.op === 'modify' ? t.cercle.completePrecise : p.inferred ? t.cercle.completeInferred : t.cercle.completeGuess
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
