import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { api } from '../../lib/api'
import { useARegler, frictionRow } from '../../lib/aRegler'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { Icon } from '../Icon'
import { colourFor } from '../../lib/things'

// "Cette semaine ensemble" — a calm, READ-ONLY weekly ritual surface (Réglages).
// The week AHEAD (meals, who's at work, birthdays, events, projects) and the week
// BEHIND ("ce qu'on a fait ensemble" — chores/routines/projects, by FACE). It widens
// the chore-ledger pattern to the whole household and keeps its calm tenet: faces +
// names, NO count / tally / ranking / streak / score (NFR-CALM-1). Data: /api/this-week.

interface Face {
  memberId: string | null
  name: string | null
  avatarKind: string | null
  avatarRef: string | null
  colour: string | null
}
interface WeekData {
  ahead: {
    meals: { date: number; slot: string; title: string }[]
    events: { title: string; at: number; allDay: number; who: string | null }[]
    birthdays: { name: string; at: number; age: number | null }[]
    work: { at: number; label: string | null; who: string | null; face: Face }[]
    projects: { title: string; at: number; color: string | null }[]
  }
  behind: {
    chores: { date: number; choreTitle: string; choreColor: string | null; helpers: Face[] }[]
    routines: { name: string; who: string | null; face: Face }[]
    projects: { title: string; color: string | null }[]
  }
}

const THIS_WEEK_KEY = ['this-week']

export function ThisWeekTogetherSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const { data, isLoading } = useQuery({ queryKey: THIS_WEEK_KEY, queryFn: () => api<WeekData>('this-week') })
  // « À régler » — the cross-domain heads-up rides at the top of the ritual: resolve
  // these few frictions first, then read the week. Always enabled here (Réglages is
  // operator-only). One-tap fix links per row; empties to « Tout est sous contrôle ».
  const frictions = useARegler(true).data?.signals ?? []

  const dayName = (sec: number) => new Date(sec * 1000).toLocaleDateString(loc, { weekday: 'short', day: 'numeric' })

  // A face chip (reuses the chore-ledger Avatar+name idiom). null name → calm fallback.
  const faceChip = (f: Face, i: number) => {
    const label = f.name ?? t.operator.ledgerHelperChild
    return (
      <span key={`${f.memberId ?? 'x'}-${i}`} className="ledger__helper">
        <Avatar kind={f.avatarKind} photo={f.avatarRef} colour={f.colour} name={label} size={28} />
        <span className="ledger__name">{label}</span>
      </span>
    )
  }

  const ahead = data?.ahead
  const behind = data?.behind
  const hasAhead =
    !!ahead && (ahead.meals.length || ahead.events.length || ahead.birthdays.length || ahead.work.length || ahead.projects.length)
  const hasBehind = !!behind && (behind.chores.length || behind.routines.length || behind.projects.length)

  return (
    <OperatorSection title={t.operator.thisWeekTitle} help={help}>
      <p className="operator__hint mono">{t.operator.thisWeekHint}</p>

      {/* « À régler » — the few cross-domain frictions to resolve first, each a one-tap
          fix link. Calm: empties to « Tout est sous contrôle », never a backlog. */}
      <div className="tweek__regler">
        <h3 className="tweek__col-h"><Icon name="warning-bold" size={14} /> {t.aRegler.title}</h3>
        {frictions.length === 0 ? (
          <EmptyState tone="calm">{t.aRegler.empty}</EmptyState>
        ) : (
          frictions.map((f) => {
            const r = frictionRow(f, t)
            return (
              <Link key={f.key} to={f.href} className="tweek__row a-regler__row">
                <Icon name={r.icon} size={15} /> <span>{r.text}</span>
              </Link>
            )
          })
        )}
      </div>

      {isLoading ? null : (
        <div className="tweek">
          {/* ---- Week ahead ---- */}
          <div className="tweek__col">
            <h3 className="tweek__col-h">{t.operator.thisWeekAhead}</h3>
            {!hasAhead ? (
              <EmptyState tone="calm">{t.operator.thisWeekAheadEmpty}</EmptyState>
            ) : (
              <>
                {!!ahead!.birthdays.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="cake-bold" size={14} /> {t.operator.thisWeekBirthdays}</h4>
                    {ahead!.birthdays.map((b, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__when mono">{dayName(b.at)}</span>
                        <span className="tweek__what">
                          {b.name}
                          {b.age != null && <span className="tweek__sub mono"> · {t.operator.thisWeekYears(b.age)}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!!ahead!.meals.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="fork-knife-bold" size={14} /> {t.operator.thisWeekMeals}</h4>
                    {ahead!.meals.map((m, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__when mono">{dayName(m.date)}</span>
                        <span className="tweek__what">{m.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!!ahead!.work.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="clock-bold" size={14} /> {t.operator.thisWeekWork}</h4>
                    {ahead!.work.map((w, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__when mono">{dayName(w.at)}</span>
                        <span className="tweek__what tweek__what--face">
                          {faceChip(w.face, i)}
                          {w.label && <span className="tweek__sub mono"> {w.label}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!!ahead!.events.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="calendar-dots-bold" size={14} /> {t.operator.thisWeekEvents}</h4>
                    {ahead!.events.map((e, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__when mono">{dayName(e.at)}</span>
                        <span className="tweek__what">
                          {e.title}
                          {e.who && <span className="tweek__sub mono"> · {e.who}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!!ahead!.projects.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="paint-brush-bold" size={14} /> {t.operator.thisWeekProjects}</h4>
                    {ahead!.projects.map((p, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__when mono">{dayName(p.at)}</span>
                        <span className="tweek__what">{p.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ---- Week behind ---- */}
          <div className="tweek__col">
            <h3 className="tweek__col-h">{t.operator.thisWeekBehind}</h3>
            {!hasBehind ? (
              <EmptyState tone="calm">{t.operator.thisWeekBehindEmpty}</EmptyState>
            ) : (
              <>
                {!!behind!.chores.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="broom-bold" size={14} /> {t.operator.thisWeekChores}</h4>
                    {behind!.chores.map((c, i) => (
                      <div key={i} className="tweek__row tweek__row--faces">
                        <span className="tweek__spine" style={{ background: colourFor('chore', c.choreColor) }} aria-hidden="true" />
                        <span className="tweek__chore">{c.choreTitle}</span>
                        <span className="ledger__helpers">{c.helpers.map((h, j) => faceChip(h, j))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!!behind!.routines.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="sun-bold" size={14} /> {t.operator.thisWeekRoutines}</h4>
                    {behind!.routines.map((r, i) => (
                      <div key={i} className="tweek__row tweek__row--faces">
                        <span className="tweek__chore">{r.name}</span>
                        <span className="ledger__helpers">{faceChip(r.face, i)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!!behind!.projects.length && (
                  <div className="tweek__group">
                    <h4 className="tweek__h mono"><Icon name="paint-brush-bold" size={14} /> {t.operator.thisWeekProjects}</h4>
                    {behind!.projects.map((p, i) => (
                      <div key={i} className="tweek__row">
                        <span className="tweek__spine" style={{ background: colourFor('project', p.color) }} aria-hidden="true" />
                        <span className="tweek__chore">{p.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </OperatorSection>
  )
}
