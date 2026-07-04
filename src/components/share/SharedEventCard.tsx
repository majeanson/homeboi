import { useLang } from '../../i18n'
import { formatDayLong, formatTime, capitalize } from '../../lib/format'
import type { EventSharePayload } from '../../lib/share'

// Read-only event render for the public /partage page — just the title, when, and a
// display "who" (never an id). Small card; the import adds it to the visitor's agenda.
export function SharedEventCard({ payload }: { payload: EventSharePayload }) {
  const { lang } = useLang()
  const when = payload.allDay
    ? capitalize(formatDayLong(payload.startAt, lang))
    : `${capitalize(formatDayLong(payload.startAt, lang))} · ${formatTime(payload.startAt, lang)}`
  return (
    <article className="partage__teaser card">
      <h1 className="partage__title">{payload.title}</h1>
      <p className="mono">{when}</p>
      {payload.whoLabel && <p className="mono partage__from">{payload.whoLabel}</p>}
    </article>
  )
}
