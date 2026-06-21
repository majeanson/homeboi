import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { TODO_TEMPLATES_KEY } from '../lib/queryKeys'
import { type TemplatesData, expandSectioned } from '../lib/todos'
import { type Weather, type DayOutlook, weatherIcon, weatherTint, weatherTip } from '../lib/weather'
import { useBoardData } from '../lib/queryHooks'
import { nameOf } from '../components/board/types'
import { SceneHead } from '../components/SceneHead'
import { EmptyState } from '../components/EmptyState'
import { Icon, InlineIcon } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// #17 — departure mode: one calm "before you go" screen that fuses a chosen to-do
// TEMPLATE ("Avant de partir", "Chez grand-papa"), today's EVENTS, and the WEATHER
// dressing tip. The checklist is EPHEMERAL — tick items as you grab keys/bag while
// leaving; it resets next time and never writes a todo (so it can't pollute the
// "À compléter" list or break the calm finite-list tenet). A navigate-only ＋
// quick-add action on the board (NOT an on-page button). Reuses the templates,
// board events, and weather caches — no new endpoint.
const LAST_KEY = 'babillard-departure-template'

export function DeparturePage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)

  const templates = useQuery({ queryKey: TODO_TEMPLATES_KEY, queryFn: () => api<TemplatesData>('todo-templates'), ...live }).data?.templates ?? []
  const board = useBoardData().data
  const wx = useQuery({ queryKey: ['weather'], queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'), staleTime: 15 * 60 * 1000 }).data
  const weather = wx?.weather ?? null

  // Which template to run (remember the last pick); default to the first list.
  const [pick, setPick] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_KEY)
    } catch {
      return null
    }
  })
  const activeId = templates.find((tp) => tp.id === pick)?.id ?? templates[0]?.id ?? null
  const choose = (id: string) => {
    setPick(id)
    setDone(new Set()) // checks are index-keyed — start the new list fresh
    try {
      localStorage.setItem(LAST_KEY, id)
    } catch {
      /* private mode — the pick still holds for this session */
    }
  }

  // The chosen list, flattened into sectioned items (refs expand). Ephemeral checks.
  const items = useMemo(() => (activeId ? expandSectioned(templates, activeId) : []), [templates, activeId])
  const [done, setDone] = useState<Set<string>>(new Set())
  const toggle = (k: string) =>
    setDone((s) => {
      const n = new Set(s)
      n.has(k) ? n.delete(k) : n.add(k)
      return n
    })
  const doneCount = items.filter((_, i) => done.has(String(i))).length

  const events = board?.today ?? []
  const tip = weatherTip(weather)

  const timeLabel = (start_at: number, all_day: number) =>
    all_day ? t.departure.allDay : new Date(start_at * 1000).toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="scene departure" aria-label={t.departure.title}>
      <SceneHead title={t.departure.title} icon="key-bold" onClose={close} />
      <div className="scene__body departure__body">
        {/* Weather + the one dressing tip — the first glance before the door. */}
        {weather && (
          <div className="departure__wx" style={{ borderColor: weatherTint(weather) }}>
            <InlineIcon name={weatherIcon(weather)} size={30} color={weatherTint(weather)} />
            <span className="departure__wx-temp">{Math.round(weather.tempC)}°</span>
            <span className="departure__wx-text">
              <span className="departure__wx-cond">{t.weather[weather.bucket]}</span>
              {tip && <span className="departure__wx-tip mono">{t.weather.tip[tip]}</span>}
            </span>
          </div>
        )}

        {/* The checklist — pick a list, then tick as you go (resets next time). */}
        {templates.length === 0 ? (
          <EmptyState>{t.departure.noTemplate}</EmptyState>
        ) : (
          <section className="departure__list">
            <div className="departure__head">
              <h2 className="departure__h mono">{t.departure.checklist}</h2>
              {items.length > 0 && <span className="departure__count mono">{doneCount}/{items.length}</span>}
            </div>
            {templates.length > 1 && (
              <div className="departure__picks">
                {templates.map((tp) => (
                  <button
                    key={tp.id}
                    type="button"
                    className={'chip' + (tp.id === activeId ? ' is-on' : '')}
                    onClick={() => choose(tp.id)}
                    aria-pressed={tp.id === activeId}
                  >
                    {tp.title}
                  </button>
                ))}
              </div>
            )}
            <ul className="departure__rows">
              {items.map((it, i) => {
                const k = String(i)
                const checked = done.has(k)
                const head = i === 0 || items[i - 1].section !== it.section
                return (
                  <li key={k}>
                    {head && it.section && <p className="departure__section mono">{it.section}</p>}
                    <button type="button" className={'departure__row' + (checked ? ' is-done' : '')} onClick={() => toggle(k)} aria-pressed={checked}>
                      <span className="departure__check" aria-hidden="true">
                        {checked && <Icon name="check-bold" size={20} />}
                      </span>
                      <span className="departure__label">{it.label}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {items.length === 0 && activeId && <p className="departure__empty mono">{t.departure.emptyList}</p>}
          </section>
        )}

        {/* Today's plan — a read-only reminder of what the day holds before you go. */}
        <section className="departure__events">
          <h2 className="departure__h mono">{t.departure.today}</h2>
          {events.length === 0 ? (
            <p className="departure__empty mono">{t.departure.noEvents}</p>
          ) : (
            <ul className="departure__agenda">
              {events.map((e) => {
                const who = e.business_name ?? e.contact_name ?? nameOf(board?.members ?? [], e.member_id)
                return (
                  <li key={e.id} className="departure__ev">
                    <span className="departure__ev-time mono">{timeLabel(e.start_at, e.all_day)}</span>
                    <span className="departure__ev-title">
                      {e.birthday && <InlineIcon name="cake-bold" size={14} />} {e.title}
                    </span>
                    {who && <span className="departure__ev-who mono">{who}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
