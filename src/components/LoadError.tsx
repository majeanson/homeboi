import { useT } from '../i18n'
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
export function LoadError({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const t = useT()
  return (
    <div className={'load-error' + (className ? ` ${className}` : '')}>
      <StatusMessage tone="error">{t.load.failed}</StatusMessage>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
        {t.load.retry}
      </button>
    </div>
  )
}
