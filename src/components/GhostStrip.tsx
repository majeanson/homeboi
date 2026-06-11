import { useState } from 'react'
import { useT } from '../i18n'
import type { Ghost } from '../lib/ghost'

// The "👻 Suggestions" strip under the grocery list — predicted re-buys you tap
// once to add. Suggest-only and quiet by design (NFR-CALM): nothing is ever
// auto-added, and a long tail collapses behind a "+N" so the list stays calm.
// Renders nothing when there's nothing to suggest. Controlled by Liste, which
// owns the data and drops a chip optimistically the moment it's tapped.
const VISIBLE = 6

export function GhostStrip({ ghosts, onAdd }: { ghosts: Ghost[]; onAdd: (g: Ghost) => void }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  if (!ghosts.length) return null

  const shown = expanded ? ghosts : ghosts.slice(0, VISIBLE)
  const hidden = ghosts.length - shown.length
  // The restock shortcut: everything overdue, one tap. Still opt-in (the user
  // taps), still quiet (only shows when 2+ are due — one item IS the chip).
  const due = ghosts.filter((g) => g.status === 'due')

  return (
    <section className="ghost-strip" aria-label={t.ghost.title}>
      <div className="ghost-strip__head mono">
        👻 {t.ghost.title}
        {due.length >= 2 && (
          <button
            type="button"
            className="ghost-strip__all mono"
            onClick={() => due.forEach(onAdd)}
          >
            ✨ {t.ghost.addAllDue(due.length)}
          </button>
        )}
      </div>
      <div className="ghost-strip__chips">
        {shown.map((g) => (
          <button
            key={g.key}
            type="button"
            className="ghost-strip__chip"
            onClick={() => onAdd(g)}
            aria-label={`${t.ghost.add} ${g.label}`}
          >
            <span className="ghost-strip__plus" aria-hidden="true">＋</span>
            <span className="ghost-strip__label">{g.label}</span>
            {/* 'later' (tracked, just not near renewal) stays untagged — the chip
                itself is the offer; a badge would invent urgency it doesn't have. */}
            {g.status !== 'later' && (
              <span className={`ghost-strip__tag ghost-strip__tag--${g.status}`}>
                {g.status === 'due' ? t.ghost.due : t.ghost.soon}
              </span>
            )}
          </button>
        ))}
        {hidden > 0 && !expanded && (
          <button type="button" className="ghost-strip__more mono" onClick={() => setExpanded(true)}>
            +{hidden} {t.ghost.more}
          </button>
        )}
      </div>
    </section>
  )
}
