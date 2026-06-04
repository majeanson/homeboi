import { StrictMode, useState } from 'react'
// createRoot, not hydrateRoot — there's no prerender to match in the prototype,
// and even with one we'd render fresh over it (portal convention).
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { LangContext, type Lang } from './i18n'
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

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </LangContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
