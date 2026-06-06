import { StrictMode, useState } from 'react'
// createRoot, not hydrateRoot — there's no prerender to match in the prototype,
// and even with one we'd render fresh over it (portal convention).
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { AppRoutes } from './router'
import { AuthProvider } from './lib/auth'
import { queryClient } from './lib/query'
import { LangContext, type Lang } from './i18n'
import { AudienceContext, type Audience } from './lib/audience'
import { CalmContext } from './lib/calm'
import { ToastProvider } from './lib/toast'
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

  // `?kid=1` is the kiosk boot lock: it forces the toddler view AND latches
  // `locked` so a toddler can't flip back or reach Réglages. PERSISTED to
  // localStorage so it survives navigation (which drops the query param) AND a
  // reload/kiosk reboot. Unlock is a deliberate adult action: load `?kid=0`.
  const [kidLocked] = useState<boolean>(() => {
    try {
      const kid = new URLSearchParams(window.location.search).get('kid')
      if (kid === '1') {
        localStorage.setItem('babillard-kid-lock', '1')
        return true
      }
      if (kid === '0') {
        localStorage.removeItem('babillard-kid-lock')
        return false
      }
      return localStorage.getItem('babillard-kid-lock') === '1'
    } catch {
      return false
    }
  })

  // Lock wins; else the last manual choice; else parent.
  const [audience, setAudienceState] = useState<Audience>(() => {
    if (kidLocked) return 'toddler'
    try {
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

  // Calm mode defaults ON (the tenet); only an explicit opt-out persists.
  const [calm, setCalmState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('babillard-calm') !== 'off'
    } catch {
      return true
    }
  })
  function setCalm(c: boolean) {
    setCalmState(c)
    try {
      localStorage.setItem('babillard-calm', c ? 'on' : 'off')
    } catch {
      /* noop */
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <LangContext.Provider value={{ lang, setLang }}>
        <AudienceContext.Provider value={{ audience, setAudience, locked: kidLocked }}>
          <CalmContext.Provider value={{ calm, setCalm }}>
            <ToastProvider>
              <AuthProvider>
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </AuthProvider>
            </ToastProvider>
          </CalmContext.Provider>
        </AudienceContext.Provider>
      </LangContext.Provider>
    </QueryClientProvider>
  )
}

// A little fridge-magnet note for anyone who opens the console. Calm by default —
// nothing to optimize, just a hello. 🧲
console.log(
  '%c🧲 Babillard %c— la maisonnée, en un coup d’œil · the household, at a glance',
  'font-weight:bold',
  'color:#9aa',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
