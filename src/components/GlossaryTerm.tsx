import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { GLOSSARY } from '../lib/glossary'
import { Icon } from './Icon'

// A WORD YOU CAN TAP, in Réglages and Comprendre only.
//
// The glossary (src/lib/glossary.ts) settles which word the app uses for an idea.
// This is the half a household sees: in the manual's own prose, a term the app has
// a definition for wears a quiet dotted underline, and tapping it pops those two
// sentences — plus « Voir le guide » when the term has a card.
//
// WHY ONLY IN RÉGLAGES: reading the manual is a ONE-OFF. Marking words on the board
// or in the kitchen would tax every glance a daily user takes, for a definition they
// stopped needing months ago — the standing rule for this week was "teaching is
// allowed only where it costs a daily user nothing". Réglages is exactly that place.
//
// It is a <button>, never a chip (chip-rule.test.ts owns that class), and it is never
// rendered inside another control: `renderRich` refuses to mark a word inside a
// [[card:…]] label, because a control inside a control is what nested-interactive
// exists to stop.
export function GlossaryTermMark({ id, label }: { id: string; label: string }) {
  const t = useT()
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const term = GLOSSARY.find((x) => x.id === id)
  if (!term) return <>{label}</>
  return (
    <span className="gloss">
      <button
        type="button"
        className="gloss__word"
        aria-expanded={open}
        onClick={(e) => {
          // The manual's `what` line is itself a <summary>; explaining a word must not
          // also fold the card it sits in.
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {label}
      </button>
      {open && (
        <span className="gloss__pop" role="status">
          <span className="gloss__def">{term.def[lang]}</span>
          {term.card && (
            <Link
              className="gloss__guide"
              to={`/settings?tab=guide&card=${term.card}`}
              onClick={(e) => e.stopPropagation()}
            >
              {t.help.goToGuide} <Icon name="arrow-right-bold" size={13} />
            </Link>
          )}
        </span>
      )}
    </span>
  )
}
