import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { TopBar } from '../components/TopBar'
import { useLang } from '../i18n'
import { api } from '../lib/api'

// « Confidentialité » (/confidentialite) and « Conditions » (/conditions) — Wave 4.
//
// TWO PAGES, ONE FILE, and the copy lives HERE rather than in `src/i18n.ts`. That is
// deliberate and it is the interesting decision: the eager French dictionary is capped
// at 110 KB by `scripts/check-bundle.mjs` and sits at 99 — two legal documents in two
// languages would have eaten the remaining headroom in one commit, to ship text that a
// household reads once, on a route it reaches from a footer. Both pages are `lazy()`
// routes, so their words are downloaded by the person actually reading them. If a third
// legal page ever arrives, it belongs here too.
//
// WRITTEN TO BE TRUE, not to be reassuring. Every claim below was checked against the
// code on 2026-09-22: the tables in D1, the blobs in R2, the two AI destinations, the
// 14-night backup window (`BACKUP_KEEP`), the 24-hour sandbox TTL (`DEMO_SANDBOX_TTL`),
// and the two doors that make Law 25's access + deletion rights real rather than
// promised — « Emporter mes données » and « Supprimer la maisonnée », both in Réglages ▸
// Système ▸ Appareils & accès. A privacy policy that describes a deletion door that does
// not exist is worse than no policy; that door shipped in the same commit as this page.
//
// The CONTACT block reads `/api/health` → `contact`, which is the `CONTACT_EMAIL` var
// (`functions/_lib/env.ts`). Unset → the block hides and the page says the app is run
// privately. That is honest for one family, and it is a gate on opening signup (Wave 5),
// not on this page.

type Lang = 'fr' | 'en'

interface Section {
  h: string
  p: string[]
}

const PRIVACY: Record<Lang, { title: string; lead: string; updated: string; sections: Section[] }> = {
  fr: {
    title: 'Confidentialité',
    updated: 'Mise à jour : 22 septembre 2026',
    lead: 'Babillard est le tableau d’une maisonnée. Ce qu’il garde, il le garde pour elle — voici exactement quoi, où, et pour combien de temps.',
    sections: [
      {
        h: 'Ce qui est gardé',
        p: [
          'Le contenu que ta maisonnée écrit : repas, liste d’épicerie, recettes, rendez-vous, corvées, routines, notes, personnes et animaux du cercle, carnets, virements.',
          'Les fichiers que vous joignez : photos, mémos vocaux, dessins.',
          'Le compte : une adresse courriel et une empreinte du mot de passe (jamais le mot de passe lui-même).',
          'Les appareils jumelés : un nom, une date, un jeton révocable. Aucun identifiant publicitaire, aucun profil de navigation.',
        ],
      },
      {
        h: 'Où c’est gardé',
        p: [
          'Dans le réseau de Cloudflare : la base de données (D1) et les fichiers (R2). Rien n’est copié ailleurs.',
          'Une copie de sauvegarde de ta maisonnée est faite chaque nuit et les 14 dernières sont conservées. Elles sont supprimées avec la maisonnée.',
        ],
      },
      {
        h: 'L’intelligence artificielle',
        p: [
          'Quand l’IA est activée, le texte que tu dictes ou écris dans la capture est envoyé aux modèles Workers AI de Cloudflare pour deviner s’il s’agit d’un rendez-vous, d’une tâche ou d’un article de liste. Les photos de recettes y passent aussi pour être lues.',
          'Si la « lecture haute précision » est activée, la photo de recette est envoyée à Mistral (api.mistral.ai) pour la reconnaissance de texte.',
          'L’IA se désactive au complet dans Réglages ▸ Système ▸ Voix & IA. Sans elle, l’app fonctionne : la capture demande simplement de choisir le type toi-même.',
        ],
      },
      {
        h: 'Ce qui n’est PAS fait',
        p: [
          'Aucune analyse d’audience, aucun pisteur, aucun cookie publicitaire. Les seuls témoins sont ceux de la session et de la protection CSRF.',
          'Rien n’est vendu, loué ni partagé avec un tiers à des fins de marketing.',
          'Aucune notification poussée : l’app n’a pas de quoi en envoyer, et c’est un choix de conception, pas un oubli.',
        ],
      },
      {
        h: 'Tes droits (Loi 25)',
        p: [
          'ACCÈS ET PORTABILITÉ — « Emporter mes données » (Réglages ▸ Système ▸ Appareils & accès) télécharge tout ce que la maisonnée contient, en un fichier JSON lisible.',
          'RECTIFICATION — tout se modifie dans l’app, à l’endroit où ça s’affiche.',
          'SUPPRESSION — « Supprimer la maisonnée », au même endroit, efface tout : le contenu, les fichiers, les appareils, les copies de nuit et le compte. C’est immédiat et irréversible.',
        ],
      },
      {
        h: 'La démo',
        p: [
          'Un visiteur qui essaie l’app obtient une maisonnée jetable, remplie d’exemples. Elle est supprimée automatiquement après 24 heures, avec tout ce qui y a été écrit.',
          'Un lien de partage (gardienne, famille) donne une lecture seule et expire de lui-même.',
        ],
      },
    ],
  },
  en: {
    title: 'Privacy',
    updated: 'Updated: 22 September 2026',
    lead: 'Babillard is one household’s board. What it keeps, it keeps for them — here is exactly what, where, and for how long.',
    sections: [
      {
        h: 'What is kept',
        p: [
          'The content your household writes: meals, the grocery list, recipes, appointments, chores, routines, notes, the people and pets in your circle, logbooks, transfers.',
          'The files you attach: photos, voice memos, drawings.',
          'The account: one email address and a hash of the password (never the password itself).',
          'Paired devices: a name, a date, a revocable token. No advertising identifier, no browsing profile.',
        ],
      },
      {
        h: 'Where it is kept',
        p: [
          'In Cloudflare’s network: the database (D1) and the files (R2). Nothing is copied anywhere else.',
          'A backup of your household is taken every night and the last 14 are kept. They are deleted with the household.',
        ],
      },
      {
        h: 'Artificial intelligence',
        p: [
          'When AI is on, the text you dictate or type into capture is sent to Cloudflare’s Workers AI models to guess whether it is an appointment, a task or a list item. Recipe photos go there too, to be read.',
          'If “high-accuracy reading” is on, a recipe photo is sent to Mistral (api.mistral.ai) for text recognition.',
          'AI can be switched off entirely in Settings ▸ System ▸ Voice & AI. Without it the app still works: capture simply asks you to pick the type yourself.',
        ],
      },
      {
        h: 'What is NOT done',
        p: [
          'No analytics, no trackers, no advertising cookies. The only cookies are the session and its CSRF protection.',
          'Nothing is sold, rented or shared with a third party for marketing.',
          'No push notifications: the app has nothing to send them with, and that is a design choice, not an oversight.',
        ],
      },
      {
        h: 'Your rights (Québec Law 25)',
        p: [
          'ACCESS AND PORTABILITY — “Take my data” (Settings ▸ System ▸ Devices & access) downloads everything the household holds, as one readable JSON file.',
          'CORRECTION — everything is editable in the app, where it is displayed.',
          'DELETION — “Delete this household”, in the same place, erases everything: the content, the files, the devices, the nightly backups and the account. It is immediate and irreversible.',
        ],
      },
      {
        h: 'The demo',
        p: [
          'A visitor who tries the app gets a throwaway household filled with examples. It is deleted automatically after 24 hours, along with everything written in it.',
          'A share link (babysitter, family) is read-only and expires on its own.',
        ],
      },
    ],
  },
}

const TERMS: Record<Lang, { title: string; lead: string; updated: string; sections: Section[] }> = {
  fr: {
    title: 'Conditions d’utilisation',
    updated: 'Mise à jour : 22 septembre 2026',
    lead: 'Babillard est un projet personnel, offert tel quel à quelques maisonnées. Voici ce que ça veut dire concrètement.',
    sections: [
      {
        h: 'Le service',
        p: [
          'Babillard est fourni « tel quel », sans garantie de disponibilité. C’est un tableau familial, pas un service essentiel : garde tes rendez-vous importants ailleurs aussi.',
          'L’inscription se fait par invitation pour l’instant. Un compte peut être refusé ou fermé s’il sert à autre chose qu’une maisonnée.',
        ],
      },
      {
        h: 'Ton contenu',
        p: [
          'Ce que ta maisonnée écrit lui appartient. Rien n’est utilisé pour entraîner un modèle, ni revendu.',
          'Tu es responsable de ce que tu déposes — en particulier des photos où apparaissent d’autres personnes, et de ce que tu partages par un lien.',
          'Un lien de partage est lisible par quiconque l’a. Traite-le comme une clé.',
        ],
      },
      {
        h: 'Ce qui est interdit',
        p: [
          'Se servir de l’app pour du contenu illégal, pour harceler quelqu’un, ou pour héberger autre chose que la vie d’une maisonnée.',
          'Tenter de lire la maisonnée de quelqu’un d’autre. Chaque requête est vérifiée côté serveur, et une tentative est un motif de fermeture.',
        ],
      },
      {
        h: 'Arrêter',
        p: [
          'Tu peux partir quand tu veux : « Supprimer la maisonnée » dans Réglages ▸ Système ▸ Appareils & accès efface tout, immédiatement. Emporte tes données avant — le bouton est juste au-dessus.',
          'Le service peut changer ou s’arrêter. Si ça devait arriver, l’export resterait disponible le temps de récupérer tes données.',
        ],
      },
      {
        h: 'Le droit applicable',
        p: ['Les lois du Québec et du Canada s’appliquent.'],
      },
    ],
  },
  en: {
    title: 'Terms of use',
    updated: 'Updated: 22 September 2026',
    lead: 'Babillard is a personal project, offered as-is to a few households. Here is what that means in practice.',
    sections: [
      {
        h: 'The service',
        p: [
          'Babillard is provided “as is”, with no guarantee of availability. It is a family board, not an essential service: keep your important appointments somewhere else too.',
          'Signing up is invite-only for now. An account may be refused or closed if it is used for something other than a household.',
        ],
      },
      {
        h: 'Your content',
        p: [
          'What your household writes belongs to your household. Nothing is used to train a model, and nothing is resold.',
          'You are responsible for what you put in — particularly photos with other people in them, and anything you hand out by link.',
          'A share link is readable by whoever holds it. Treat it like a key.',
        ],
      },
      {
        h: 'What is not allowed',
        p: [
          'Using the app for illegal content, to harass someone, or to host anything other than a household’s life.',
          'Trying to read someone else’s household. Every request is checked server-side, and an attempt is grounds for closing the account.',
        ],
      },
      {
        h: 'Leaving',
        p: [
          'You can leave whenever you like: “Delete this household” in Settings ▸ System ▸ Devices & access erases everything, immediately. Take your data first — the button is right above it.',
          'The service may change or stop. If that happened, the export would stay available long enough to get your data out.',
        ],
      },
      {
        h: 'Governing law',
        p: ['The laws of Québec and Canada apply.'],
      },
    ],
  },
}

const CONTACT: Record<Lang, { h: string; lead: string; none: string }> = {
  fr: {
    h: 'Nous joindre',
    lead: 'Une question sur tes données, ou un problème ? Écris ici :',
    none: 'Ce Babillard est opéré en privé et n’affiche pas d’adresse publique. Passe par la personne qui t’a invité.',
  },
  en: {
    h: 'Contact',
    lead: 'A question about your data, or a problem? Write here:',
    none: 'This Babillard is run privately and publishes no public address. Go through whoever invited you.',
  },
}

function LegalScene({ doc }: { doc: typeof PRIVACY }) {
  const { lang } = useLang()
  const l: Lang = lang === 'en' ? 'en' : 'fr'
  const page = doc[l]
  const c = CONTACT[l]
  // The one live fact on an otherwise static page. `/api/health` is open to an
  // unauthenticated visitor by design (it is what /login reads to decide whether the
  // password-reset door exists), which is exactly the caller this page has.
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ contact: string | null }>('health'),
    staleTime: 60 * 60_000,
  })
  const contact = health.data?.contact ?? null

  return (
    <div className="page">
      <TopBar />
      <main className="narrow">
        <h1>{page.title}</h1>
        <p className="lead">{page.lead}</p>
        <p className="hint mono">{page.updated}</p>
        {page.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
        <section>
          <h2>{c.h}</h2>
          {contact ? (
            <p>
              {c.lead} <a href={`mailto:${contact}`}>{contact}</a>
            </p>
          ) : (
            <p>{c.none}</p>
          )}
        </section>
        <p className="auth__alt mono">
          <Link to={l === 'en' ? '/conditions' : '/conditions'}>{TERMS[l].title}</Link> ·{' '}
          <Link to="/confidentialite">{PRIVACY[l].title}</Link> · <Link to="/">{l === 'en' ? 'Home' : 'Accueil'}</Link>
        </p>
      </main>
    </div>
  )
}

export function PrivacyPage() {
  return <LegalScene doc={PRIVACY} />
}

export function TermsPage() {
  return <LegalScene doc={TERMS} />
}
