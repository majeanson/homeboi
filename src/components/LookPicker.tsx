import { useT } from '../i18n'
import { Chip } from './Chip'
import { ColorPicker } from './ColorPicker'
import { Disclosure } from './Disclosure'
import { EmojiField } from './EmojiPicker'
import { Field } from './Field'

// THE LOOK OF A THING: an icon and a colour, in ONE control (plans/2026-11-06-TACHE-UNIFIEE.md,
// phase 3). Every task form and every subject form picks its look here, so a carnet and the
// gutters it carries are dressed with the same two gestures (`look-rule.test.ts` fails a task
// or subject form that spells its own colour row or emoji grid).
//
// It is folded by default: adding a task stays one field, and the look is one tap away. The
// fold says what it holds while closed (LEAN invariant 1: the glyph, and « comme le sujet »
// or « personnalisée »), and it opens itself when the thing already wears a look of its own,
// so editing never hides a pick.
//
// TWO FLAVOURS, by `inherit`:
//   · a TASK inherits: null in either half means « like its subject » (`lookOf`, lib/subjects).
//     `inherit` names what that looks like right now, and the colour row offers it first.
//   · a SUBJECT is the source: it has no « like » to fall back on, so the colour is always a
//     real pick, and clearing the icon goes back to the kind's glyph (`fallbackIcon`).
//
// `suggest` is the title's picture (`suggestIcon`): offered as one tap, never written by itself.
export interface LookValue {
  icon: string | null
  colour: string | null
}

export function LookPicker({
  value,
  onChange,
  inherit,
  fallbackIcon,
  suggest,
  label,
  defaultOpen,
}: {
  value: LookValue
  onChange: (next: LookValue) => void
  /** A task's « like its subject »: what null shows now, and the words for it. */
  inherit?: { label: string; icon?: string | null | undefined; colour?: string | null | undefined } | undefined
  /** A subject's own default glyph (its kind's), shown when no icon is picked. */
  fallbackIcon?: string | undefined
  suggest?: string | null | undefined
  label?: string | undefined
  defaultOpen?: boolean | undefined
}) {
  const t = useT()
  const l = t.look
  const own = value.icon != null || (inherit != null && value.colour != null)
  const fallbackGlyph = inherit?.icon ?? fallbackIcon
  const shownIcon = value.icon ?? fallbackGlyph ?? null
  const offer = suggest && suggest !== value.icon ? suggest : null
  const note = offer && value.icon == null ? l.suggestNote(offer) : [shownIcon, inherit ? (own ? l.custom : inherit.label) : null].filter(Boolean).join(' · ')

  return (
    <Disclosure label={label ?? l.label} {...(note ? { note } : {})} defaultOpen={defaultOpen ?? own} className="look-picker">
      <Field as="div" inline label={l.icon}>
        <EmojiField value={value.icon} onSelect={(e) => onChange({ ...value, icon: e || null })} ariaLabel={l.icon} {...(fallbackGlyph ? { fallback: fallbackGlyph } : {})} />
      </Field>
      {offer && (
        <Chip onClick={() => onChange({ ...value, icon: offer })} className="look-picker__suggest">
          {l.take(offer)}
        </Chip>
      )}
      <Field as="div" label={l.colour}>
        <ColorPicker
          value={value.colour}
          onChange={(c) => onChange({ ...value, colour: c })}
          label={l.colour}
          none={inherit ? { label: inherit.label, colour: inherit.colour ?? null, onPick: () => onChange({ ...value, colour: null }) } : undefined}
        />
      </Field>
    </Disclosure>
  )
}
