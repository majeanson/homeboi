import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useConfirm } from '../../lib/confirm'
import { CERCLE_KEY } from '../../lib/queryKeys'
import {
  type ContactGroupRaw,
  type Member,
  type ContactGroup,
  buildGroups,
  personKey,
} from '../../lib/cercle'
import { EmptyState } from '../EmptyState'
import { RowActions } from '../RowActions'
import { Chip } from '../Chip'
import { OperatorSection } from './OperatorSection'

// Réglages ▸ Le cercle. The directory page (/cercle) deliberately HIDES some
// groups so the same faces don't show twice — a "famille" group whose every
// member is already in the Maisonnée is suppressed there, and so are groups you
// emptied out. That left those rows unreachable: real `contact_groups` rows with
// no delete affordance anywhere — the "phantom Jeanson group I can't edit out".
// This panel lists EVERY group row (buildGroups over the unfiltered set) with a
// member count and a delete, so any group is removable regardless of how the
// directory chooses to display (or hide) it. Deleting a group never touches the
// people — `contact_group_members` cascades from the FK, the contacts/members stay.
export function CercleGroupsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () => api<{ groups: ContactGroupRaw[]; members: Member[] }>('cercle'),
  })

  // Household member keys — used only to flag WHY a family group is invisible on
  // the directory (redundant with the Maisonnée card), so the panel explains the
  // phantom instead of just listing it.
  const householdKeys = new Set((data?.members ?? []).map((m) => personKey('member', m.id)))
  const groups = buildGroups(data?.groups ?? [])
  const isHiddenFamily = (g: ContactGroup) =>
    g.kind === 'family' && g.memberKeys.size > 0 && [...g.memberKeys].every((k) => householdKeys.has(k))

  async function remove(g: ContactGroup) {
    if (!(await confirm({ message: t.cercle.deleteGroupConfirm, tone: 'danger' }))) return
    await write('cercle-groups', { method: 'DELETE', body: { id: g.id }, affectedKeys: [CERCLE_KEY] }).catch(() => {})
  }

  if (isLoading && !data) return <p className="loading mono">{t.common.loading}</p>

  return (
    <OperatorSection title={t.operator.cercleGroupsTitle} hint={t.operator.cercleGroupsHint} help={help} helpKey="cercleGroups">
      {groups.length === 0 ? (
        <EmptyState>{t.operator.cercleGroupsEmpty}</EmptyState>
      ) : (
        <ul className="operator__list">
          {groups.map((g) => (
            <li key={g.id}>
              <span className="cercle-group__dot" style={{ background: g.colour ?? '#2A8F85' }} aria-hidden="true" />
              {/* The unclassed name span takes the row's slack (see .operator__list
                  li > span:not([class])), pushing the meta + delete to the right. */}
              <span>{g.name}</span>
              <Chip>{t.cercle.groupKinds[g.kind]}</Chip>
              <span className="mono">{t.operator.cercleGroupMembers(g.memberKeys.size)}</span>
              {isHiddenFamily(g) && <span className="mono">· {t.operator.cercleGroupHidden}</span>}
              <RowActions onDelete={() => remove(g)} deleteLabel={`${t.cercle.deleteGroup} — ${g.name}`} />
            </li>
          ))}
        </ul>
      )}
    </OperatorSection>
  )
}
