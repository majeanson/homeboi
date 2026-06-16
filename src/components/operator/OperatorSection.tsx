import type { ReactNode } from 'react'

// Every Réglages panel is the same shell: a `.surface` card with an <h2>, an
// optional lead paragraph, and the body. All 13 operator/* sections hand-rolled
// it; this is the one wrapper. `action` rides at the top-right of the heading (a
// "＋ Ajouter" that opens an add-scene, a day/night toggle…).
export function OperatorSection({
  title,
  hint,
  action,
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="surface operator__section">
      {action ? (
        <div className="operator__section-head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : (
        <h2>{title}</h2>
      )}
      {hint != null && <p className="lead">{hint}</p>}
      {children}
    </section>
  )
}
