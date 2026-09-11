import { useT, useLang } from '../../i18n'
import { formatMoneyExact } from '../../lib/money'
import { formatDayMaybeYear } from '../../lib/format'
import { Disclosure } from '../Disclosure'
import type { CatchupProjection } from '../../lib/transfers'
import type { Member } from '../../lib/cercle'

// « La math » — the catch-up arrangement, in plain sentences.
//
// This is the one number in the app that sits BETWEEN two people, and bmad/06's
// own idea list (#12, the "who paid" ledger) refuses a "you owe me" balance on calm
// grounds. It exists here because a household explicitly wrote that agreement down
// and was already doing this arithmetic by hand, wrongly: the note it replaces
// carried its own correction line (« c'est pas 72 paiements de 300 mais 64 »), and
// 64 × 300 is not the total it also stated. Deriving it is the calm act; making
// someone redo it every two weeks was the stressful one.
//
// So it ships the way a receipt does, not the way a scoreboard does:
//   * FOLDED by default — you open it when you want it, it never greets you;
//   * full sentences, no chart, no percentage, no progress bar, no colour coding;
//   * read-only, and never on the board, the calendar or the toddler lens;
//   * denied to a showcase guest link with the rest of the money (guestScope.ts).
export function CatchupMath({ projection, members }: { projection: CatchupProjection; members: Member[] }) {
  const t = useT()
  const { lang } = useLang()
  const v = t.virements

  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? '?'
  const money = (cents: number) => formatMoneyExact(cents, lang)
  const day = (sec: number) => formatDayMaybeYear(sec, lang)

  // The projection is only ever built for a two-share plan (see the server), so both
  // names resolve or the arrangement is not describable.
  const behind = nameOf(projection.behindMemberId)
  const ahead = nameOf(projection.aheadMemberId)

  return (
    <Disclosure label={v.math} className="virements__math">
      <p>{v.mathAhead(ahead, money(projection.gapCents), day(projection.asOf))}</p>
      <p>{v.mathExtra(behind, money(projection.extraPerPayment))}</p>
      <p>{v.mathSoFar(projection.paymentsSoFar, money(projection.caughtUpCents))}</p>
      <p>{v.mathLeft(money(projection.remainingCents))}</p>
      {/* The honest ending, either way: this arrangement closes the gap by the end of
          its own term, or it does not — and if it does not, the number says so plainly
          rather than rounding the bad news away. */}
      <p>
        {projection.projectedRemainingCents > 0
          ? v.mathAtEnd(money(projection.projectedRemainingCents), day(projection.termEnd))
          : v.mathDone(day(projection.termEnd))}
      </p>
    </Disclosure>
  )
}
