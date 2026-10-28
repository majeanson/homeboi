import { useState } from 'react'
import { useT } from '../i18n'
import { recipeBookmarklet } from '../lib/recipeBookmarklet'
import { currentPlatform } from '../lib/platform'
import { Icon } from './Icon'
import { Cluster } from './Layout'

// THE ONE how-to for the « Envoyer à Babillard » bookmark — shown where the cook needs
// it: in Réglages ▸ La cuisine (the standing card) AND right under a « ce site bloque
// l'importation » message in the recipe form (Marc, 2026-10-27: « if it's blocked,
// suggest what to do and how to access the signet »). One component, so the two never
// drift. The steps are worded for THIS device (lib/platform): where a bookmark is
// added and launched differs between iPhone Safari, Android Chrome and a desktop
// browser — the feature is the same everywhere.
//
// Copying writes nothing (no useWrite): the bookmark is the household's own origin
// baked into lib/recipeBookmarklet's body. The read-only address stays visible for a
// manual copy when the clipboard is refused.
export function BookmarkletHowTo({ compact = false }: { compact?: boolean }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const bookmarklet = recipeBookmarklet(window.location.origin)
  const platform = currentPlatform()
  const steps = t.recipes.bookmarkletSteps[platform]
  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarklet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the address is in the field below for a manual copy */
    }
  }
  return (
    <div className={'bookmarklet-howto' + (compact ? ' bookmarklet-howto--compact' : '')} data-testid="bookmarklet-howto">
      {!compact && <p className="operator__hint">{t.recipes.bookmarkletIntro}</p>}
      <ol className="operator__steps">
        <li>
          {t.recipes.bookmarkletStepCopy}
          <Cluster>
            <button type="button" className="btn btn--primary" onClick={copy}>
              {copied ? <Icon name="check-bold" size={16} /> : null} {copied ? t.recipes.bookmarkletCopied : t.recipes.bookmarkletCopy}
            </button>
          </Cluster>
          <input className="input mono flipp__bookmarklet" readOnly value={bookmarklet} onFocus={(e) => e.target.select()} aria-label={t.recipes.bookmarkletAddress} />
        </li>
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {platform === 'ios' && <p className="operator__hint mono">{t.recipes.bookmarkletSignIn}</p>}
    </div>
  )
}
