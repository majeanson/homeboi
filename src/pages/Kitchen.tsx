import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { formatWeekday } from '../lib/format'

// Garde-manger. Weekly supper slots + a "running low" list (never a full
// inventory — brief tenet 3). One AI button asks for a supper suggestion; it
// hides itself when the AI binding is off (503).
interface MealRow { id: string; date: number; title: string; cook_member_id: string | null }
interface LowRow { id: string; item: string; marked_at: number }

export function Kitchen() {
  const t = useT()
  const { lang } = useLang()
  const [days, setDays] = useState<MealRow[]>([])
  const [weekStart, setWeekStart] = useState<number>(0)
  const [low, setLow] = useState<LowRow[]>([])
  const [unauth, setUnauth] = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  const [newLow, setNewLow] = useState('')
  const [editDate, setEditDate] = useState<number | null>(null)
  const [mealText, setMealText] = useState('')

  const load = useCallback(async () => {
    try {
      const [m, l] = await Promise.all([
        api<{ days: MealRow[]; weekStart: number }>('meals'),
        api<{ low: LowRow[] }>('pantry'),
      ])
      setDays(m.days)
      setWeekStart(m.weekStart)
      setLow(l.low)
      setUnauth(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUnauth(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Build the 7-day grid from weekStart, slotting in any planned meal.
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = weekStart + i * 86400
    const meal = days.find((d) => d.date === date)
    return { date, meal }
  })

  async function setMeal(date: number) {
    const title = mealText.trim()
    if (!title) return
    await api('meals', { method: 'POST', body: { date, title } }).catch(() => {})
    setEditDate(null)
    setMealText('')
    load()
  }

  async function addLow(e: React.FormEvent) {
    e.preventDefault()
    const item = newLow.trim()
    if (!item) return
    setNewLow('')
    await api('pantry', { method: 'POST', body: { item } }).catch(() => {})
    load()
  }

  async function clearLow(id: string) {
    setLow((l) => l.filter((x) => x.id !== id))
    await api('pantry', { method: 'DELETE', body: { id } }).catch(() => load())
  }

  async function suggest() {
    setSuggesting(true)
    setSuggestion(null)
    try {
      const res = await api<{ suggestion: string }>('suggest-meal', { method: 'POST' })
      setSuggestion(res.suggestion)
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setAiUnavailable(true)
    } finally {
      setSuggesting(false)
    }
  }

  if (unauth) {
    return (
      <div className="page">
        <TopBar />
        <main className="narrow">
          <Link to="/pair" className="btn btn--primary">
            {t.home.ctaPair}
          </Link>
        </main>
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar>
        <Link to="/board" className="btn btn--ghost mono">
          {t.nav.board}
        </Link>
      </TopBar>
      <main className="kitchen">
        <h1>{t.kitchen.title}</h1>

        <section>
          <div className="kitchen__head">
            <h2>{t.kitchen.week}</h2>
            {!aiUnavailable && (
              <button type="button" className="btn" onClick={suggest} disabled={suggesting}>
                {suggesting ? t.kitchen.suggestThinking : t.kitchen.suggest}
              </button>
            )}
          </div>
          {suggestion && (
            <p className="kitchen__suggestion" role="status">
              🍽 {suggestion}
            </p>
          )}
          <ul className="kitchen__week">
            {week.map(({ date, meal }) => (
              <li key={date} className="surface kitchen__day">
                <span className="kitchen__day-name mono">{formatWeekday(date, lang)}</span>
                {editDate === date ? (
                  <form
                    className="kitchen__day-edit"
                    onSubmit={(e) => {
                      e.preventDefault()
                      setMeal(date)
                    }}
                  >
                    <input
                      className="input"
                      autoFocus
                      value={mealText}
                      onChange={(e) => setMealText(e.target.value)}
                      placeholder={t.kitchen.plan}
                    />
                    <button type="submit" className="btn btn--ghost mono">
                      {t.kitchen.setMeal}
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="kitchen__day-meal"
                    onClick={() => {
                      setEditDate(date)
                      setMealText(meal?.title ?? '')
                    }}
                  >
                    {meal?.title ?? <span className="kitchen__day-empty mono">{t.kitchen.plan}</span>}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>{t.kitchen.low}</h2>
          <form className="kitchen__low-add" onSubmit={addLow}>
            <input
              className="input"
              value={newLow}
              onChange={(e) => setNewLow(e.target.value)}
              placeholder={t.kitchen.lowAdd}
            />
            <button type="submit" className="btn" disabled={!newLow.trim()}>
              {t.capture.add}
            </button>
          </form>
          {low.length === 0 ? (
            <p className="board__empty mono">{t.kitchen.lowEmpty}</p>
          ) : (
            <ul className="kitchen__low">
              {low.map((l) => (
                <li key={l.id}>
                  <button type="button" className="board__list-item" onClick={() => clearLow(l.id)}>
                    <span className="board__check" aria-hidden="true">
                      ☐
                    </span>
                    <span>{l.item}</span>
                    <span className="kitchen__low-note mono">{t.kitchen.addToList}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
