// #12 / E-22 — the shared "ask the AI a question over your own data" answer card,
// extracted from SearchPage so the global-search "Ask" box AND the board mic
// (AskSheet, E-22) render the IDENTICAL card — same domain-coloured icon disc,
// same "not what you wanted?" related-section chips — instead of drifting into
// two hand-rolled copies. SearchPage renders it inline in the search scene;
// AskSheet renders it inside a Modal, optionally with a 🔊 replay control beside
// the domain tag (E-22's auto-speak-once + replay).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { useT } from '../i18n'
import { CATS } from './cats'
import { Icon, InlineIcon, type IconName } from '../components/Icon'

// The AI answer's domain — mirrors AnswerKind in functions/_lib/ai.ts.
export type AnswerKind = 'meal' | 'event' | 'list' | 'chore' | 'recipe' | 'cercle' | 'note' | 'none'

// The answer card's look per domain — reuses lib/cats inks/washes so an AI answer
// reads in the SAME colour language as the board tiles it's about.
export const ASK_LOOK: Record<AnswerKind, { icon: IconName; color: string; wash: string }> = {
  meal: { icon: CATS.meal.icon, color: CATS.meal.deep, wash: CATS.meal.wash },
  event: { icon: CATS.event.icon, color: CATS.event.deep, wash: CATS.event.wash },
  list: { icon: 'shopping-bag-bold', color: CATS.list.deep, wash: CATS.list.wash },
  chore: { icon: CATS.chore.icon, color: CATS.chore.deep, wash: CATS.chore.wash },
  recipe: { icon: 'book-open-bold', color: CATS.meal.deep, wash: CATS.meal.wash },
  cercle: { icon: CATS.cercle.icon, color: CATS.cercle.deep, wash: CATS.cercle.wash },
  note: { icon: 'push-pin-bold', color: CATS.list.deep, wash: CATS.list.wash },
  none: { icon: 'sparkle-bold', color: CATS.list.deep, wash: CATS.list.wash },
}

// "Not what you wanted?" — where each kind of answer lives, drawn from our existing
// hub sections + the Guide (Réglages ▸ Guide). Always ends with the Guide.
export function relatedFor(kind: AnswerKind, t: ReturnType<typeof useT>): { to: string; label: string; icon: IconName }[] {
  const S = {
    board: { to: '/board', label: t.nav.board, icon: 'calendar-blank-bold' as IconName },
    kitchen: { to: '/kitchen', label: t.nav.kitchen, icon: 'fork-knife-bold' as IconName },
    liste: { to: '/liste', label: t.nav.list, icon: 'shopping-bag-bold' as IconName },
    cercle: { to: '/cercle', label: t.nav.cercle, icon: 'users-three-bold' as IconName },
    settings: { to: '/settings', label: t.nav.operator, icon: 'gear-six-bold' as IconName },
  }
  const guide = { to: '/settings?tab=decouvrir', label: t.search.guide, icon: 'book-open-bold' as IconName }
  const map: Record<AnswerKind, { to: string; label: string; icon: IconName }[]> = {
    meal: [S.kitchen, S.liste],
    event: [S.board],
    list: [S.liste],
    chore: [S.settings, S.board],
    recipe: [S.kitchen],
    cercle: [S.cercle],
    note: [S.board],
    none: [S.board, S.kitchen, S.liste],
  }
  return [...map[kind], guide]
}

export type AskAnswerStatus = 'asking' | 'answer' | 'error' | 'off'

// The model answers in one or two sentences, and puts an enumeration one item per
// line prefixed with "- " (see answerQuestion's system prompt). Rendering that raw
// into a <p> collapses every newline, which is how "où est la liste ?" came back as
// an unreadable comma-wall. So parse the shape back out: runs of bullet lines become
// a real <ul>, everything else stays a paragraph.
const BULLET = /^\s*[-–—•*]\s+/

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }

export function answerBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (BULLET.test(trimmed)) {
      const item = trimmed.replace(BULLET, '')
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'ul') last.items.push(item)
      else blocks.push({ kind: 'ul', items: [item] })
    } else {
      blocks.push({ kind: 'p', text: trimmed })
    }
  }
  return blocks
}

// What read-aloud should hear: the bullet dashes are a visual affordance, not words
// ("tiret, Lime, tiret, Citron"). Drop the markers and end each line so the voice
// pauses between items — without doubling punctuation a line already carries.
export function speakableAnswer(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim().replace(BULLET, ''))
    .filter(Boolean)
    .map((l) => (/[.!?:;,…]$/.test(l) ? l : `${l}.`))
    .join(' ')
    .trim()
}

function AnswerBody({ text }: { text: string }) {
  return (
    <>
      {answerBlocks(text).map((b, i) =>
        b.kind === 'ul' ? (
          <ul key={i} className="search__answer-list">
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="search__answer-text">
            {b.text}
          </p>
        ),
      )}
    </>
  )
}

// THE shared answer card. `replay` slots an optional control beside the domain
// tag (AskSheet's 🔊 replay button); `onRelatedClick` fires when a "not what you
// wanted?" chip is tapped (AskSheet closes itself so the sheet doesn't linger
// over the page it just navigated away from — SearchPage, already a full page,
// passes nothing).
export function AskAnswerCard({
  t,
  status,
  answer,
  replay,
  onRelatedClick,
}: {
  t: ReturnType<typeof useT>
  status: AskAnswerStatus
  answer: { text: string; kind: AnswerKind } | null
  replay?: ReactNode
  onRelatedClick?: () => void
}) {
  return (
    <div className="surface search__answer">
      {status === 'asking' ? (
        <p className="search__asking mono">
          <InlineIcon name="sparkle-bold" /> {t.search.asking}
        </p>
      ) : status === 'answer' && answer ? (
        <>
          <div className="search__answer-head">
            <span
              className="search__answer-icon"
              style={{ background: ASK_LOOK[answer.kind].wash, color: ASK_LOOK[answer.kind].color }}
              aria-hidden="true"
            >
              <Icon name={ASK_LOOK[answer.kind].icon} size={20} />
            </span>
            <span className="search__answer-kind mono">{t.search.kinds[answer.kind]}</span>
            {replay}
          </div>
          <AnswerBody text={answer.text} />
        </>
      ) : status === 'off' ? (
        <p className="search__asking mono">{t.search.askUnavailable}</p>
      ) : (
        <p className="search__asking mono">{t.search.askError}</p>
      )}

      {/* "Not what you wanted?" — related sections + the Guide. */}
      {(status === 'answer' || status === 'error') && (
        <div className="search__related">
          <span className="search__related-head mono">{t.search.notWhat}</span>
          <div className="search__related-row">
            {relatedFor(answer?.kind ?? 'none', t).map((d) => (
              <Link key={d.to} to={d.to} className="search__related-chip" onClick={onRelatedClick}>
                <InlineIcon name={d.icon} /> {d.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
