import { useMemo, useState } from 'react'
import { useT, useLang } from '../../i18n'
import { formatMoneyExact } from '../../lib/money'
import { formatDayMaybeYear } from '../../lib/format'
import { summariseYear, transferYears, type Transfer, type TransferPlan, type YearMemberTotal } from '../../lib/transfers'
import { Chip } from '../Chip'
import { Cluster, Rail } from '../Layout'
import { CopyButton } from '../CopyButton'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'
import type { Member } from '../../lib/cercle'

// « Combien on a envoyé cette année, et qui. »
//
// The question that gets asked at a mortgage renewal, at tax time, and in the
// January conversation about whether the arrangement is actually working. Until
// this existed the only way to answer it was to scroll the history and add it up by
// hand — which is the exact chore the whole section exists to delete, left undone
// one level up.
//
// FOLDED, like « La math », for the same reason: it is a thing you go and get, never
// a thing that greets you. And the copy target is plain text rather than the ASCII
// fold the bank memo uses — this one goes into an email or a message to the other
// person, where « Hypothèque » should keep its accent.
export function YearSummary({
  transfers,
  plans,
  members,
}: {
  transfers: Transfer[]
  plans: TransferPlan[]
  members: Member[]
}) {
  const t = useT()
  const { lang } = useLang()
  const v = t.virements

  const years = useMemo(() => transferYears(transfers), [transfers])
  const [year, setYear] = useState<number | null>(null)
  // The newest year that holds something, until the reader picks another. Derived
  // rather than stored, so a first transfer in a new year moves it on its own.
  const shown = year != null && years.includes(year) ? year : (years[0] ?? null)

  const summary = useMemo(
    () => (shown == null ? null : summariseYear(transfers, plans, shown)),
    [transfers, plans, shown],
  )

  if (!summary) return null

  const nameOf = (id: string | null) => (id ? (members.find((m) => m.id === id)?.displayName ?? '?') : v.yearNobody)
  const money = (cents: number) => formatMoneyExact(cents, lang)
  const who = (row: YearMemberTotal) =>
    row.payments > 0 ? `${nameOf(row.memberId)} — ${v.yearPayments(row.payments, money(row.cents))}` : `${nameOf(row.memberId)} — ${money(row.cents)}`

  // THE COPYABLE BLOCK. Built from the same rows the panel renders, so what lands on
  // the clipboard is what the reader was looking at — never a second rendering that
  // can drift from the first.
  const text = () => {
    const out: string[] = [`${v.yearFold} — ${summary.year}`, '']
    for (const p of summary.plans) {
      out.push(p.title || v.yearUnknownPlan)
      for (const row of p.byMember) out.push(`  ${who(row)}`)
    }
    if (summary.topups.length) {
      out.push(v.yearTopups)
      for (const row of summary.topups) out.push(`  ${nameOf(row.memberId)} — ${money(row.cents)}`)
    }
    if (summary.others.length) {
      out.push(v.yearOthers)
      for (const o of summary.others) out.push(`  ${o.label} — ${money(o.cents)}`)
    }
    out.push('', `${v.yearTotal} : ${money(summary.totalCents)}`)
    for (const row of summary.byMember) out.push(`  ${nameOf(row.memberId)} — ${money(row.cents)}`)
    if (summary.firstSentAt != null && summary.lastSentAt != null) {
      out.push(
        '',
        v.yearSpan(
          summary.transfers,
          formatDayMaybeYear(summary.firstSentAt, lang),
          formatDayMaybeYear(summary.lastSentAt, lang),
        ),
      )
    }
    return out.join('\n')
  }

  return (
    <Disclosure label={v.yearFold} className="virements__year">
      {/* Only when there is more than one year to choose between — a single-year
          household should not have to read a picker that can only say one thing. */}
      {years.length > 1 && (
        <Rail className="virements__years" role="group" aria-label={v.yearPick}>
          {years.map((y) => (
            <Chip key={y} selected={y === shown} onClick={() => setYear(y)}>
              {String(y)}
            </Chip>
          ))}
        </Rail>
      )}

      {summary.transfers === 0 ? (
        <EmptyState>{v.yearEmpty}</EmptyState>
      ) : (
        <>
          {summary.plans.map((p) => (
            <div className="virements__year-group" key={p.planId}>
              <h4>{p.title || v.yearUnknownPlan}</h4>
              <ul>
                {p.byMember.map((row) => (
                  <li className="mono" key={row.memberId ?? ''}>
                    {who(row)}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {summary.topups.length > 0 && (
            <div className="virements__year-group">
              <h4>{v.yearTopups}</h4>
              <ul>
                {summary.topups.map((row) => (
                  <li className="mono" key={row.memberId ?? ''}>
                    {nameOf(row.memberId)} — {money(row.cents)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.others.length > 0 && (
            <div className="virements__year-group">
              <h4>{v.yearOthers}</h4>
              <ul>
                {summary.others.map((o) => (
                  <li className="mono" key={o.label}>
                    {o.label} — {money(o.cents)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="virements__year-group virements__year-total">
            <h4>
              {v.yearTotal} <strong className="mono">{money(summary.totalCents)}</strong>
            </h4>
            <ul>
              {summary.byMember.map((row) => (
                <li className="mono" key={row.memberId ?? ''}>
                  {nameOf(row.memberId)} — {money(row.cents)}
                </li>
              ))}
            </ul>
          </div>

          {summary.firstSentAt != null && summary.lastSentAt != null && (
            <p className="operator__seg-hint mono">
              {v.yearSpan(
                summary.transfers,
                formatDayMaybeYear(summary.firstSentAt, lang),
                formatDayMaybeYear(summary.lastSentAt, lang),
              )}
            </p>
          )}

          <Cluster>
            <CopyButton text={text} label={v.copyYear} copiedLabel={v.copiedYear} refusedLabel={v.copyRefused} icon="stack-bold" />
          </Cluster>
          <p className="operator__seg-hint mono">{v.yearHint}</p>
        </>
      )}
    </Disclosure>
  )
}
