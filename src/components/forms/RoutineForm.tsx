import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useWrite } from '../../lib/write'
import { useLang, useT } from '../../i18n'
import { CardDeckEditor } from '../CardDeckEditor'
import { routineTemplates, type DeckCard } from '../../lib/routineTemplates'
import { ROUTINE_TODS, TOD_ICON, TOD_TINT, isRoutineTod, type RoutineTod } from '../../lib/routineTod'
import { InlineIcon } from '../Icon'

// The complete kid-routine form — who it's for (one or several toddlers, each
// gets their own copy), a name, a template starting point, and the picture-card
// deck. Shared by Settings ▸ Routines and the Add sheet. Shows the "add a child
// first" hint when there are no children. Owns its POST (create); calls onSaved().
//
// Pass `value` to EDIT an existing routine in place (PATCH): the "for who" and
// template pickers drop away (a routine already belongs to its child, and the
// backend edits one row), leaving name + moment + the card deck — mirrors how the
// other forms reuse one component for add and edit.
interface FormMember {
  id: string
  display_name: string
  is_child: number
}
export interface RoutineInit {
  id: string
  name: string
  timeOfDay: string | null
  cards?: { icon: string; label: string; narration?: string }[]
}

export function RoutineForm({
  members,
  value,
  onSaved,
  onCancel,
}: {
  members: FormMember[]
  value?: RoutineInit | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const editing = !!value
  const children = members.filter((m) => m.is_child)
  const templates = routineTemplates(lang)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [name, setName] = useState(value?.name ?? '')
  const [cards, setCards] = useState<DeckCard[]>(
    value?.cards?.map((c) => ({ icon: c.icon, label: c.label })) ?? [],
  )
  // The moment-of-day cue (null = anytime). Orders the kid view; never a gate.
  const initTod = isRoutineTod(value?.timeOfDay) ? value?.timeOfDay : null
  const [tod, setTod] = useState<RoutineTod | null>(initTod)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const write = useWrite()

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
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if ((!editing && !memberIds.length) || !name.trim() || busy) return
    const payload = cards
      .map((c) => ({ icon: c.icon, label: c.label.trim() }))
      .filter((c) => c.label || c.icon)
      .map((c) => ({ icon: c.icon, label: c.label || c.icon, narration: c.label || c.icon }))
    setBusy(true)
    setErr(false)
    try {
      if (editing) {
        await write('routines', {
          method: 'PATCH',
          body: { routineId: value!.id, name: name.trim(), cards: payload, timeOfDay: tod ?? null },
          affectedKeys: [['routines']],
        })
      } else {
        await write('routines', {
          method: 'POST',
          body: { memberIds, name: name.trim(), cards: payload, timeOfDay: tod ?? undefined },
          affectedKeys: [['routines']],
        })
        setName('')
        setCards([])
        setMemberIds([])
        setTod(null)
      }
      onSaved()
    } catch {
      // Keep the deck — a failed write shouldn't eat a hand-built routine.
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  // Not a dead end: the fix (add a child) is one tap away instead of "close the
  // sheet, find Réglages, find the household tab" — three taps a new family
  // shouldn't have to guess. (Creation only — editing an existing routine never
  // hits this since its child already exists.)
  if (!editing && children.length === 0)
    return (
      <p className="board__empty mono">
        {t.operator.needChild} <Link to="/settings?tab=household">{t.board.welcomeCta}</Link>
      </p>
    )

  return (
    <form className="operator__inline-form operator__routine-form" onSubmit={submit}>
      {!editing && (
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
              <InlineIcon name={memberIds.includes(m.id) ? 'check-square-bold' : 'square-bold'} /> {m.display_name}
            </button>
          ))}
        </div>
      )}

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
            <InlineIcon name={TOD_ICON[v]} color={TOD_TINT[v]} /> {t.routines.tod[v]}
          </button>
        ))}
      </div>

      {!editing && (
        <div className="picker-chips mono">
          <span className="picker-chips__label">{t.operator.tplStart}</span>
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className="chip" onClick={() => applyTemplate(tpl)}>
              {tpl.cards[0]?.icon} {tpl.name}
            </button>
          ))}
        </div>
      )}

      <CardDeckEditor cards={cards} onChange={setCards} />

      {/* TODO #17 record clip — per-card parent-voice recording UI. The data
          model + endpoint exist (POST /api/routine-audio → { key }, then send a
          cardsNarration[] parallel to cards on POST/PATCH); this needs a small
          per-card 🎙️ control (record/preview/clear) wired through CardDeckEditor.
          Hide the control where R2 is unset (the endpoint 503s) — the kid view
          already falls back to on-device TTS. Labels are staged in i18n:
          t.routines.recordClip / clipRecorded / clipRecord / clipRemove / clipOff. */}

      {err && <p className="error mono">{t.common.saveFailed}</p>}
      <button
        type="submit"
        className="btn btn--primary"
        disabled={(!editing && !memberIds.length) || !name.trim() || busy}
      >
        {editing ? t.common.save : t.operator.addRoutine}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
