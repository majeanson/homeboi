import { useState } from 'react'
import { api } from '../../lib/api'
import { useLang, useT } from '../../i18n'
import { CardDeckEditor } from '../CardDeckEditor'
import { routineTemplates, type DeckCard } from '../../lib/routineTemplates'
import { ROUTINE_TODS, TOD_EMOJI, type RoutineTod } from '../../lib/routineTod'

// The complete kid-routine form — who it's for (one or several toddlers, each
// gets their own copy), a name, a template starting point, and the picture-card
// deck. Shared by Settings ▸ Routines and the Add sheet. Shows the "add a child
// first" hint when there are no children. Owns its POST; calls onSaved().
interface FormMember {
  id: string
  display_name: string
  is_child: number
}

export function RoutineForm({ members, onSaved }: { members: FormMember[]; onSaved: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const children = members.filter((m) => m.is_child)
  const templates = routineTemplates(lang)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [name, setName] = useState('')
  const [cards, setCards] = useState<DeckCard[]>([])
  // The moment-of-day cue (null = anytime). Orders the kid view; never a gate.
  const [tod, setTod] = useState<RoutineTod | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  function toggleMember(id: string) {
    setMemberIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }
  function applyTemplate(tpl: { name: string; tod: RoutineTod | null; cards: DeckCard[] }) {
    setCards(tpl.cards.map((c) => ({ ...c })))
    // The template knows its moment (Matin → morning, Dodo → evening).
    setTod(tpl.tod)
    if (!name.trim()) {
      const icon = tpl.cards[0]?.icon
      setName(icon ? `${icon} ${tpl.name}` : tpl.name)
    }
  }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!memberIds.length || !name.trim() || busy) return
    const payload = cards
      .map((c) => ({ icon: c.icon, label: c.label.trim() }))
      .filter((c) => c.label || c.icon)
      .map((c) => ({ icon: c.icon, label: c.label || c.icon, narration: c.label || c.icon }))
    setBusy(true)
    setErr(false)
    try {
      await api('routines', {
        method: 'POST',
        body: { memberIds, name: name.trim(), cards: payload, timeOfDay: tod ?? undefined },
      })
      setName('')
      setCards([])
      setMemberIds([])
      setTod(null)
      onSaved()
    } catch {
      // Keep the deck — a failed write shouldn't eat a hand-built routine.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  if (children.length === 0) return <p className="board__empty mono">{t.operator.needChild}</p>

  return (
    <form className="operator__inline-form operator__routine-form" onSubmit={add}>
      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.operator.forWho}</span>
        {children.map((m) => (
          <button
            key={m.id}
            type="button"
            className={'chip' + (memberIds.includes(m.id) ? ' is-on' : '')}
            onClick={() => toggleMember(m.id)}
            aria-pressed={memberIds.includes(m.id)}
          >
            {memberIds.includes(m.id) ? '☑' : '☐'} {m.display_name}
          </button>
        ))}
      </div>

      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.operator.routineName} />

      {/* The moment of day: orders the kid view (morning shows Matin first). */}
      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.routines.todLabel}</span>
        <button
          type="button"
          className={'chip' + (tod === null ? ' is-on' : '')}
          onClick={() => setTod(null)}
          aria-pressed={tod === null}
        >
          {t.routines.tod.any}
        </button>
        {ROUTINE_TODS.map((v) => (
          <button
            key={v}
            type="button"
            className={'chip' + (tod === v ? ' is-on' : '')}
            onClick={() => setTod(tod === v ? null : v)}
            aria-pressed={tod === v}
          >
            {TOD_EMOJI[v]} {t.routines.tod[v]}
          </button>
        ))}
      </div>

      <div className="picker-chips mono">
        <span className="picker-chips__label">{t.operator.tplStart}</span>
        {templates.map((tpl) => (
          <button key={tpl.id} type="button" className="chip" onClick={() => applyTemplate(tpl)}>
            {tpl.cards[0]?.icon} {tpl.name}
          </button>
        ))}
      </div>

      <CardDeckEditor cards={cards} onChange={setCards} />

      {err && <p className="error mono">{t.common.saveFailed}</p>}
      <button type="submit" className="btn btn--primary" disabled={!memberIds.length || !name.trim() || busy}>
        {t.operator.addRoutine}
      </button>
    </form>
  )
}
