import { StrictMode, useState } from 'react'
// createRoot, not hydrateRoot — there's no prerender to match in the prototype,
// and even with one we'd render fresh over it (portal convention).
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { LangContext, type Lang } from './i18n'
import { AudienceContext, type Audience } from './lib/audience'
import './styles.css'

function Root() {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('babillard-lang')
      if (saved === 'fr' || saved === 'en') return saved
    } catch {
      /* noop */
    }
    return 'fr'
  })
  function setLang(l: Lang) {
    setLangState(l)
    try {
      localStorage.setItem('babillard-lang', l)
    } catch {
      /* noop */
    }
    document.documentElement.lang = l
  }

  // `?kid=1` (a kiosk boot lock) wins; else the last manual choice; else parent.
  const [audience, setAudienceState] = useState<Audience>(() => {
    try {
      if (new URLSearchParams(window.location.search).get('kid') === '1') return 'toddler'
      const saved = localStorage.getItem('babillard-audience')
      if (saved === 'parent' || saved === 'toddler') return saved
    } catch {
      /* noop */
    }
    return 'parent'
  })
  function setAudience(a: Audience) {
    setAudienceState(a)
    try {
      localStorage.setItem('babillard-audience', a)
    } catch {
      /* noop */
    }
  }

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <AudienceContext.Provider value={{ audience, setAudience }}>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </AudienceContext.Provider>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
