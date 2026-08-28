import { useT } from '../i18n'
import { useOnline } from '../lib/online'
import { StatusMessage } from './StatusMessage'

// The honest face of a data-less read that ERRORED. A query with no cached frame
// used to render « Chargement… » (or a lying empty state) forever when the fetch
// had in fact FAILED — on one-bar wifi, L'auto's week and the Mois grid just hung
// (2026-08-27). The rule: `loading` is only loading while the query is actually
// fetching; once it has errored with nothing to show, say so and offer a hand.
//
//   {!data && (q.isError ? <LoadError onRetry={() => void q.refetch()} /> : <Loading … />)}
//
// One line + « Réessayer » — calm, no alarm; polls/`live` keep retrying on their
// own regardless, this just names the wait and gives an immediate manual door.
//
// TWO THINGS IT NOW REFUSES TO DO (Marc's phone, 2026-08-28 — a Mois grid carrying
// the offline bar AND two identical red blocks, one of them with a « Réessayer »
// that could not possibly work):
//
//  1. **It does not shout when the device is OFFLINE.** A failed fetch with no
//     signal is not a surprise, it is the weather. The board already says it once
//     and calmly at the top (`board__synced`, whose own comment is the rule this
//     follows: "say so AT THE TOP … not as a stampless footnote below every card").
//     So offline drops the error TONE — but keeps the button.
//
//     Dropping the button too was the first version of this, and it was wrong: it
//     reads as "the retry cannot work offline, so do not offer it", which ignores
//     that the person taps it when they think the signal is BACK. On a surface with
//     no poll that button is the only door there is — `MONTH_KEY` has no `live` and
//     the client sets `refetchOnWindowFocus: false`, so a month whose one fetch
//     failed will never retry itself. Removing it turned a visible failure into a
//     blank calendar with two grey lines and no way out (Marc, 2026-08-28: "clicking
//     from the yearly calendar into a month, then nothing loads").
//  2. **`onRetry` is optional.** A screen gets ONE retry door. Where a surface
//     reports the same failed query in two regions (MonthView: above the grid AND
//     in the day panel), the second passes no handler and becomes a quiet echo
//     instead of a second alarm with a second button.
export function LoadError({ onRetry, className }: { onRetry?: () => void; className?: string }) {
  const t = useT()
  const online = useOnline()
  return (
    <div className={'load-error' + (className ? ` ${className}` : '')}>
      {online ? (
        <StatusMessage tone="error">{t.load.failed}</StatusMessage>
      ) : (
        <p className="load-error__offline mono">{t.board.offline}</p>
      )}
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          {t.load.retry}
        </button>
      )}
    </div>
  )
}
