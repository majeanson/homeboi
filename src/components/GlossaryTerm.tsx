import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import type { GlossaryTerm } from '../lib/glossary'
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
// THE TABLE IS LOADED ON TAP, NEVER EAGERLY.
//
// A static `import { GLOSSARY }` here cost **12 KB in the EAGER chunk** and failed the
// bundle budget on CI (432 KB > 420 KB) — because `renderRich` is reachable from the
// board, so anything this file imports statically lands in the entry chunk. The whole
// table rides along: every term's FR and EN definition, and its `why`, which is prose
// written for whoever edits the glossary and has no business in a household's browser.
//
// A definition is only ever needed once someone TAPS a word, which makes this the rare
// case where a dynamic import is exactly right rather than a micro-optimisation: the
// mark itself is a dotted <button> and costs nothing, and the data arrives with the
// gesture that asks for it. `import type` above is erased at build time, so the shape
// still typechecks against the real table.
//
// The cache DROPS A FAILURE on purpose. `cached ??= import(...)` alone memoises a
// REJECTED promise, so one bad fetch would kill the lexicon for the rest of the session
// and every later tap would replay the same rejection. That is not hypothetical here: a
// service worker serving the SPA fallback (200, text/html) for a hashed chunk deleted by
// a deploy is a failure this app has already had once, and it is exactly what a kiosk
// left open across a deploy would hit.
let cached: Promise<typeof import('../lib/glossary')> | null = null
const loadGlossary = () => {
  cached ??= import('../lib/glossary').catch((e) => {
    cached = null // let the next tap try again
    throw e
  })
  return cached
}

export function GlossaryTermMark({ id, label }: { id: string; label: string }) {
  const t = useT()
  const { lang } = useLang()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState<GlossaryTerm | null>(null)
  // An unknown id cannot ship — `glossary.test.ts` fails the build on a [[mot:…]] that
  // names no term — so the mark renders without waiting to confirm the lookup.
  return (
    <span className="gloss">
      <button
        type="button"
        className="gloss__word"
        // Reflects what is ON SCREEN, not what was intended: between the tap and the
        // chunk landing there is no panel, and a screen reader told "expanded" about
        // nothing has been lied to.
        aria-expanded={open && !!term}
        onClick={(e) => {
          // The manual's `what` line is itself a <summary>; explaining a word must not
          // also fold the card it sits in.
          e.stopPropagation()
          if (open) {
            setOpen(false)
            return
          }
          setOpen(true)
          if (!term) {
            loadGlossary()
              .then((m) => setTerm(m.GLOSSARY.find((x) => x.id === id) ?? null))
              // A definition that cannot be fetched is not worth an error message — the
              // word itself is still readable in its sentence, which is the whole point
              // of marking prose rather than replacing it. Fold back to the plain word
              // so the mark stays honest and the next tap simply retries.
              .catch(() => setOpen(false))
          }
        }}
      >
        {label}
      </button>
      {open && term && (
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
