import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { OperatorSection } from './OperatorSection'
import { IntakeReview } from './IntakeReview'
import { PostboxReview } from './PostboxReview'
import { api } from '../../lib/api'
import { isGuest, type GuestKind } from '../../lib/device'
import { CERCLE_KEY, SHARES_KEY } from '../../lib/queryKeys'
import { useConfirm } from '../../lib/confirm'
import { useShares, revokeShare, type ShareKind } from '../../lib/share'
import type { IconName } from '../Icon'
import {
  unifyCircle,
  type Contact,
  type ContactLink,
  type ContactGroupRaw,
  type Member,
  type Person,
} from '../../lib/cercle'
import { encodeIntakeScope, type IntakeScope } from '../../lib/intake'
import { InlineIcon } from '../Icon'
import { StatusMessage } from '../StatusMessage'
import { QrCode } from '../QrCode'
import { Chip } from '../Chip'
import { SubTabs } from '../SubTabs'
import { castSenderPossible, castToSalon } from '../../lib/cast'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'

// Typed read-only share links. The operator picks a KIND (what the link can see)
// and a duration, and gets a time-boxed token (?guest=<token>). The link lands on
// the right surface per kind — main.tsx stashes the token and strips it from the
// URL. The token is stateless: it just stops working at its TTL, no revoke-before
// (keep durations short) — see functions/_lib/auth.ts GuestKind + guest/start.ts.
//
//   showcase → the full read-only hub (a "Démo" link of your real data)
//   sitter   → /handoff, the babysitter card (today + routines + à-savoir + wifi)
//   welcome  → /welcome, the visitor card (wifi + bin day + house rules)
//   family   → /family, the grandparents' window (kids' dates + birthdays + photos)
//   intake   → /intake, the family-info FORM a relative fills + sends back (a writable
//              kind; the submission is quarantined for the operator to merge)
//   postbox  → /courrier, « La boîte aux lettres » — a relative leaves a MESSAGE
//              (word / voice / drawing / photo) that, once accepted, lands as a board
//              fridge note (the second writable kind; quarantined for the operator)
type KindLabelKey = 'kindShowcase' | 'kindSitter' | 'kindWelcome' | 'kindFamily' | 'kindIntake' | 'kindPostbox'
type KindHintKey =
  | 'kindShowcaseHint'
  | 'kindSitterHint'
  | 'kindWelcomeHint'
  | 'kindFamilyHint'
  | 'kindIntakeHint'
  | 'kindPostboxHint'
// Curated, least-privilege kinds lead; `showcase` (the read-EVERYTHING Démo link) sits
// LAST and is no longer the default — an operator must consciously pick it (and see its
// warning) rather than accidentally mint a full-household public link (REVIEW-PASS §518).
const KINDS: { kind: GuestKind; path: string; labelKey: KindLabelKey; hintKey: KindHintKey }[] = [
  { kind: 'sitter', path: '/handoff', labelKey: 'kindSitter', hintKey: 'kindSitterHint' },
  { kind: 'welcome', path: '/welcome', labelKey: 'kindWelcome', hintKey: 'kindWelcomeHint' },
  { kind: 'family', path: '/family', labelKey: 'kindFamily', hintKey: 'kindFamilyHint' },
  { kind: 'intake', path: '/intake', labelKey: 'kindIntake', hintKey: 'kindIntakeHint' },
  { kind: 'postbox', path: '/courrier', labelKey: 'kindPostbox', hintKey: 'kindPostboxHint' },
  { kind: 'showcase', path: '/board', labelKey: 'kindShowcase', hintKey: 'kindShowcaseHint' },
]

// Per-kind duration menu (mirrors the server clamp in _lib/shareModes). showcase can
// run up to a week (a Démo link to paste somewhere); the curated kinds stay short.
type TtlKey = 'ttl30m' | 'ttl1h' | 'ttl4h' | 'ttl12h' | 'ttl24h' | 'ttl2d' | 'ttl7d'
const H = 3600
const TTL_BY_KIND: Record<GuestKind, { seconds: number; key: TtlKey }[]> = {
  showcase: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  sitter: [
    { seconds: 1800, key: 'ttl30m' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  welcome: [
    { seconds: H, key: 'ttl1h' },
    { seconds: 4 * H, key: 'ttl4h' },
    { seconds: 12 * H, key: 'ttl12h' },
    { seconds: 24 * H, key: 'ttl24h' },
  ],
  family: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  // A relative needs a few days to get to the form — same window as the family one.
  intake: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
  // « La boîte aux lettres » — an open link relatives keep around to drop a word.
  postbox: [
    { seconds: 24 * H, key: 'ttl24h' },
    { seconds: 48 * H, key: 'ttl2d' },
    { seconds: 7 * 24 * H, key: 'ttl7d' },
  ],
}
const DEFAULT_TTL: Record<GuestKind, number> = {
  showcase: 24 * H,
  sitter: 12 * H,
  welcome: 4 * H,
  family: 7 * 24 * H,
  intake: 7 * 24 * H,
  postbox: 7 * 24 * H,
}

// D-18 (bmad/10) — « Le pont »: a durable, named, revocable guest. Any kind may be
// standing (decided) — modelled as one more option in the SAME duration <select> (a
// sentinel value no real TTL takes; every real TTL is ≥30 min) rather than a second
// control, so picking it is a one-tap "instead of a duration, pick never". Choosing
// it reveals the required "Pour qui ?" name + the how-to-revoke hint below.
const STANDING_SENTINEL = -1
// E-38 per-guest locale, rides along: 'household' = no override (the default UI
// language wins for that visitor); 'fr' | 'en' pins the link's own language.
type GuestLangChoice = 'household' | 'fr' | 'en'

// The operator's still-live share-links, so a leaked/over-shared one can be REVOKED
// before its TTL (§509). Shared key so minting a fresh link (generate) refreshes it.
const GUEST_LINKS_KEY = ['guest-links']

export function GuestSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const navigate = useNavigate()
  const qc = useQueryClient()
  // Issuing a share link is operator-only — a read-only guest can't mint more, so
  // the whole section is hidden for them.
  const ro = isGuest()
  // The two ways to share, as sub-tabs ("one job at a time"): a link for someone's
  // PHONE (the typed read-only kinds), or a face cast to the living-room TV.
  const [subTab, setSubTab] = useState<'phone' | 'salon'>('phone')
  // Default to the safe curated « babysitter » link, NOT the read-everything Démo —
  // so the pre-selected option can't leak the whole household (REVIEW-PASS §518).
  const [kind, setKind] = useState<GuestKind>('sitter')
  const [ttl, setTtl] = useState(DEFAULT_TTL.sitter)
  // D-18 — set when `ttl === STANDING_SENTINEL`; the required "Pour qui ?" name for
  // a standing link (guests.label). E-38 — the per-link locale override.
  const [standingLabel, setStandingLabel] = useState('')
  const [guestLang, setGuestLang] = useState<GuestLangChoice>('household')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const [linkStanding, setLinkStanding] = useState(false)
  const [copied, setCopied] = useState(false)
  // For an 'intake' link: the person it's pre-addressed to (null = an open link
  // anyone can fill). Bound into the signed token by the server.
  const [targetKey, setTargetKey] = useState<string | null>(null)
  const [targetText, setTargetText] = useState('')
  // For an 'intake' link: which optional sections the form asks for (name is always
  // required). All on by default — the operator unchecks what they don't want.
  const [scope, setScope] = useState<IntakeScope>({
    bday: true,
    contact: true,
    addr: true,
    household: true,
    pets: true,
    photo: true,
  })

  // People to choose a per-person intake link's recipient from — loaded only when
  // the intake kind is picked. unifyCircle gives one node per person (member +
  // hard-linked contact merged), and its .key is exactly the token's targetKey.
  const { data: cercleData } = useQuery({
    queryKey: CERCLE_KEY,
    queryFn: () =>
      api<{ contacts: Contact[]; members: Member[]; links: ContactLink[]; groups?: ContactGroupRaw[] }>('cercle'),
    enabled: kind === 'intake',
  })
  const people = useMemo<Person[]>(
    () =>
      cercleData
        ? unifyCircle(cercleData.contacts, cercleData.members, cercleData.links, cercleData.groups ?? []).people
        : [],
    [cercleData],
  )

  function chooseKind(k: GuestKind) {
    setKind(k)
    setTtl(DEFAULT_TTL[k]) // reset the duration to the kind's sensible default (never standing)
    setLink(null) // a link minted for the old kind no longer matches the picker
    setTargetKey(null) // the recipient picker only applies to intake
    setTargetText('')
    setStandingLabel('')
  }

  const standing = ttl === STANDING_SENTINEL

  async function generate() {
    if (busy) return
    if (standing && !standingLabel.trim()) {
      setErr(t.guest.standingNameRequired)
      return
    }
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      const res = await api<{ guestToken: string }>('guest/start', {
        method: 'POST',
        body: {
          ...(standing ? { standing: true, label: standingLabel.trim() } : { ttlSeconds: ttl }),
          kind,
          ...(guestLang !== 'household' ? { lang: guestLang } : {}),
          ...(kind === 'intake'
            ? { ...(targetKey ? { targetKey } : {}), fields: encodeIntakeScope(scope) }
            : {}),
        },
      })
      const path = KINDS.find((k) => k.kind === kind)?.path ?? '/board'
      const langParam = guestLang !== 'household' ? `&lang=${guestLang}` : ''
      setLink(`${window.location.origin}${path}?guest=${encodeURIComponent(res.guestToken)}${langParam}`)
      setLinkStanding(standing)
      // The freshly-minted link now has a guests row — refresh the active-links list.
      void qc.invalidateQueries({ queryKey: GUEST_LINKS_KEY })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  }

  async function share() {
    if (!link || !navigator.share) return
    try {
      await navigator.share({ title: t.guest.title, url: link })
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  }

  if (ro) return null

  const ttlOptions = TTL_BY_KIND[kind]

  return (
    <>
      <SubTabs
        options={[
          { key: 'phone', label: t.guest.onPhone },
          { key: 'salon', label: t.guest.toTv },
        ]}
        value={subTab}
        onSelect={setSubTab}
        ariaLabel={t.guest.title}
      />

      {subTab === 'salon' && <CastTvSection help={help} />}

      {subTab === 'phone' && (
        <>
      <OperatorSection title={t.guest.title} help={help} helpKey="guest">
        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.kindLabel}</span>
          <select className="input" value={kind} onChange={(e) => chooseKind(e.target.value as GuestKind)} disabled={busy}>
            {KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {t.guest[k.labelKey]}
              </option>
            ))}
          </select>
        </label>
        <p className="operator__hint mono">{t.guest[KINDS.find((k) => k.kind === kind)!.hintKey]}</p>
        {/* showcase is the read-EVERYTHING Démo link — warn before it's shared publicly.
            A caution glyph (not the neutral info clock) so it reads as "careful". */}
        {kind === 'showcase' && (
          <StatusMessage tone="info" icon="warning-bold">
            {t.guest.kindShowcaseWarn}
          </StatusMessage>
        )}

        {/* Per-person intake: pick WHO the form is for, or leave blank for an open
            "add yourself" link the whole family can use. */}
        {kind === 'intake' && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.guest.intakeForLabel}</span>
            <EntityCombobox<Person>
              value={targetText}
              onChange={(v) => {
                setTargetText(v)
                if (!v.trim()) setTargetKey(null)
                setLink(null)
              }}
              options={people.map((p): ComboOption<Person> => ({ id: p.key, label: p.name, data: p, icon: 'user-bold' }))}
              onPick={(opt) => {
                setTargetKey(opt.id)
                setTargetText(opt.label)
                setLink(null)
              }}
              placeholder={t.guest.intakeOpenPlaceholder}
              submitIcon={null}
              typeaheadOnly
            />
            <p className="operator__hint mono">
              {targetKey ? t.guest.intakeForPerson(targetText) : t.guest.intakeOpenHint}
            </p>
          </div>
        )}

        {/* Which optional sections the form asks for. Name is always required; the
            operator unchecks anything they'd rather not request. */}
        {kind === 'intake' && (
          <div className="operator__seg">
            <span className="operator__seg-label mono">{t.guest.intakeAsk}</span>
            <div className="cf__gender-chips">
              <Chip selected={scope.bday} onClick={() => setScope((s) => ({ ...s, bday: !s.bday }))}>
                {t.guest.intakeFieldBday}
              </Chip>
              <Chip selected={scope.contact} onClick={() => setScope((s) => ({ ...s, contact: !s.contact }))}>
                {t.guest.intakeFieldContact}
              </Chip>
              <Chip selected={scope.addr} onClick={() => setScope((s) => ({ ...s, addr: !s.addr }))}>
                {t.guest.intakeFieldAddr}
              </Chip>
              <Chip selected={scope.household} onClick={() => setScope((s) => ({ ...s, household: !s.household }))}>
                {t.guest.intakeFieldHousehold}
              </Chip>
              <Chip selected={scope.pets} onClick={() => setScope((s) => ({ ...s, pets: !s.pets }))}>
                {t.guest.intakeFieldPets}
              </Chip>
              <Chip selected={scope.photo} onClick={() => setScope((s) => ({ ...s, photo: !s.photo }))}>
                {t.guest.intakeFieldPhoto}
              </Chip>
            </div>
          </div>
        )}

        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.ttlLabel}</span>
          <select className="input" value={ttl} onChange={(e) => setTtl(Number(e.target.value))} disabled={busy}>
            {ttlOptions.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {t.guest[o.key]}
              </option>
            ))}
            {/* D-18 — a durable link, for any kind: doesn't expire, only revoke closes it. */}
            <option value={STANDING_SENTINEL}>{t.guest.ttlStanding}</option>
          </select>
        </label>
        <p className="operator__hint mono">{t.guest.limitation}</p>

        {/* Standing: a required name identifies this link in « Liens actifs » — and
            a prominent reminder of the ONE way to close it (since time no longer will). */}
        {standing && (
          <>
            <label className="operator__seg">
              <span className="operator__seg-label mono">{t.guest.standingNameLabel}</span>
              <input
                className="input"
                value={standingLabel}
                onChange={(e) => setStandingLabel(e.target.value)}
                placeholder={t.guest.standingNamePlaceholder}
                disabled={busy}
                maxLength={60}
              />
            </label>
            <StatusMessage tone="info" icon="warning-bold">
              {t.guest.standingHint}
            </StatusMessage>
          </>
        )}

        {/* E-38 — per-guest locale: rides every kind, not just standing. */}
        <label className="operator__seg">
          <span className="operator__seg-label mono">{t.guest.guestLangLabel}</span>
          <select className="input" value={guestLang} onChange={(e) => setGuestLang(e.target.value as GuestLangChoice)} disabled={busy}>
            <option value="household">{t.guest.guestLangDefault}</option>
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
        </label>

        <div className="operator__inline-form">
          <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
            <InlineIcon name="key-bold" /> {busy ? t.guest.generating : t.guest.generate}
          </button>
          {/* Aperçu: see exactly what this kind shows before sharing. Curated kinds
              open their scene with ?preview=<kind> (the server returns the curated
              payload for an operator); showcase IS the real hub, so open /board. */}
          <button
            type="button"
            className="btn"
            onClick={() => {
              const k = KINDS.find((x) => x.kind === kind)!
              navigate(kind === 'showcase' ? '/board' : `${k.path}?preview=${kind}`)
            }}
            disabled={busy}
          >
            <InlineIcon name="magnifying-glass-bold" /> {t.shareMode.preview}
          </button>
        </div>

        {err && <StatusMessage tone="error">{err}</StatusMessage>}

        {link && (
          <div className="operator__guest-link">
            <p className="operator__hint mono">
              {t.guest.linkReady} {linkStanding && <Chip selected>{t.guest.noExpiry}</Chip>}
            </p>
            <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t.guest.title} />
            <div className="operator__inline-form">
              <button type="button" className="btn" onClick={copy}>
                <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button type="button" className="btn" onClick={share}>
                  <InlineIcon name="arrow-right-bold" /> {t.guest.share}
                </button>
              )}
            </div>
            {/* A QR by the door (#35): scan the link off the wall tablet, or print
                it to tape on the fridge. White tile so it scans on any theme. */}
            <QrCode value={link} />
          </div>
        )}

        {/* Every still-live link you've minted, each with a « Révoquer » so a leaked
            or over-shared one can be killed before its TTL (§509). Hidden when empty. */}
        {subTab === 'phone' && <ActiveLinksList />}
        {/* « Mes partages » — the snapshot shares (recette/rendez-vous/routine/famille)
            handed out via a /partage link, each revocable. Hidden when empty (calm). */}
        {subTab === 'phone' && <MySharesList />}
      </OperatorSection>

      {/* The two "things people sent us" buckets — both hidden until one arrives, so
          they never add noise. Infos (intake forms) and Messages (boîte aux lettres). */}
      <IntakeReview help={help} />
      <PostboxReview help={help} />

      <ShareInfoEditor help={help} />
        </>
      )}
    </>
  )
}

// « Mes partages » — the snapshot shares this household handed out via a /partage link
// (recipe/event/routine/family, migration 0102). One row each with « Retirer » (DELETE
// /api/share → the link dies + its media copies are freed). Hidden when empty (calm),
// mirroring ActiveLinksList. Distinct from the guest-link ledger above: those are typed
// read-only sessions into THIS household; these are one-time COPIES sent OUT.
const SHARE_KIND_ICON: Record<ShareKind, IconName> = {
  recipe: 'book-open-bold',
  event: 'calendar-blank-bold',
  routine: 'baby-bold',
  family: 'user-bold',
}

function MySharesList() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data } = useShares()
  const shares = data?.shares ?? []
  const [busyId, setBusyId] = useState<string | null>(null)
  if (shares.length === 0) return null
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'

  async function revoke(id: string) {
    if (!(await confirm({ message: t.shareLink.revokeConfirm, confirmLabel: t.shareLink.revoke, tone: 'danger' }))) return
    setBusyId(id)
    try {
      await revokeShare(id)
      await qc.invalidateQueries({ queryKey: SHARES_KEY })
    } catch {
      /* the refetch reconciles — leave the row */
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="operator__guest-links">
      <h4 className="mono">{t.shareLink.myShares}</h4>
      <p className="operator__hint mono">{t.shareLink.mySharesHint}</p>
      <ul className="operator__list meal-slots">
        {shares.map((s) => (
          <li key={s.id} className="meal-slots__row">
            <span className="meal-slots__name">
              <InlineIcon name={SHARE_KIND_ICON[s.kind]} />{' '}
              <strong>{s.label || t.shareLink.kinds[s.kind]}</strong>
              {s.expiresAt != null && (
                <span className="mono meal-slots__label">
                  {' · '}
                  {t.shareLink.expiresOn(
                    new Date(s.expiresAt * 1000).toLocaleDateString(loc, { day: 'numeric', month: 'short' }),
                  )}
                </span>
              )}
            </span>
            <button type="button" className="btn btn--ghost mono" disabled={busyId === s.id} onClick={() => void revoke(s.id)}>
              <InlineIcon name="x-bold" /> {t.shareLink.revoke}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// One row per still-live minted link (guests table, §509) with « Révoquer ». A revoke
// POSTs guest-links → resolveActor rejects the token at once (reads AND writes die),
// then the list refetches. Hidden entirely when there are no live links (calm).
interface GuestLinkRow {
  id: string
  kind: GuestKind
  target_key: string | null
  standing: number
  label: string | null
  created_at: number
  expires_at: number
}

function ActiveLinksList() {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data } = useQuery({ queryKey: GUEST_LINKS_KEY, queryFn: () => api<{ links: GuestLinkRow[] }>('guest-links') })
  const links = data?.links ?? []
  const [busyId, setBusyId] = useState<string | null>(null)
  const [revoked, setRevoked] = useState(false)
  if (links.length === 0) return null
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const kindLabel = (k: GuestKind) => t.guest[KINDS.find((x) => x.kind === k)?.labelKey ?? 'kindShowcase']
  async function revoke(id: string, standing: boolean) {
    // D-18 — a standing link is the only kind whose SOLE stop is this button (no TTL
    // is coming to close it), so a confirm gate matches every other danger-tone delete
    // in this codebase; an ordinary time-boxed link keeps the old one-tap revoke.
    if (standing && !(await confirm({ message: t.guest.revokeStandingConfirm, confirmLabel: t.guest.revoke, tone: 'danger' })))
      return
    setBusyId(id)
    try {
      await api('guest-links', { method: 'POST', body: { revokeId: id } })
      setRevoked(true)
      await qc.invalidateQueries({ queryKey: GUEST_LINKS_KEY })
    } catch {
      /* the list refetch reconciles — leave the row */
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div className="operator__guest-links">
      <h4 className="mono">{t.guest.activeLinks}</h4>
      <p className="operator__hint mono">{t.guest.activeLinksHint}</p>
      <ul className="operator__list meal-slots">
        {links.map((l) => (
          <li key={l.id} className="meal-slots__row">
            <span className="meal-slots__name">
              <strong>
                {kindLabel(l.kind)}
                {l.label ? ` — ${l.label}` : ''}
              </strong>
              <span className="mono meal-slots__label">
                {' · '}
                {l.standing ? (
                  <Chip selected>{t.guest.noExpiry}</Chip>
                ) : (
                  <>
                    {t.guest.linkExpiresPrefix}{' '}
                    {new Date(l.expires_at * 1000).toLocaleString(loc, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </>
                )}
              </span>
            </span>
            <button
              type="button"
              className="btn btn--ghost mono"
              disabled={busyId === l.id}
              onClick={() => void revoke(l.id, !!l.standing)}
            >
              <InlineIcon name="x-bold" /> {t.guest.revoke}
            </button>
          </li>
        ))}
      </ul>
      {revoked && <StatusMessage tone="success">{t.guest.revoked}</StatusMessage>}
    </div>
  )
}

// The few free-text facts a "Babysitter" / "Welcome" link surfaces (migration 0072):
// wifi, house rules, bin day. Stored on the household; read by /api/guest/window.
interface ShareFields {
  wifiSsid: string
  wifiPassword: string
  houseRules: string
  binDay: string
}
const EMPTY: ShareFields = { wifiSsid: '', wifiPassword: '', houseRules: '', binDay: '' }

function ShareInfoEditor({ help }: { help?: HelpMode }) {
  const t = useT()
  const [fields, setFields] = useState<ShareFields>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    api<Partial<Record<keyof ShareFields, string | null>>>('household')
      .then((h) => {
        if (!alive) return
        setFields({
          wifiSsid: h.wifiSsid ?? '',
          wifiPassword: h.wifiPassword ?? '',
          houseRules: h.houseRules ?? '',
          binDay: h.binDay ?? '',
        })
      })
      .catch(() => {
        /* offline — leave blank; saving still works once back online */
      })
    return () => {
      alive = false
    }
  }, [])

  const set = (k: keyof ShareFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFields((f) => ({ ...f, [k]: e.target.value }))
    setSaved(false)
  }

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await api('household', { method: 'PATCH', body: fields })
      setSaved(true)
    } catch {
      /* surfaced nowhere fancy — the operator can retry */
    } finally {
      setSaving(false)
    }
  }

  return (
    <OperatorSection title={t.shareMode.editorTitle} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.shareMode.editorHint}</p>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiNetwork}</span>
        <input className="input" value={fields.wifiSsid} onChange={set('wifiSsid')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.wifiPassword}</span>
        <input className="input mono" value={fields.wifiPassword} onChange={set('wifiPassword')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.binDay}</span>
        <input className="input" value={fields.binDay} onChange={set('binDay')} autoComplete="off" />
      </label>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.shareMode.houseRules}</span>
        <textarea className="input" value={fields.houseRules} onChange={set('houseRules')} rows={3} />
      </label>
      <button type="button" className="btn" onClick={save} disabled={saving}>
        <InlineIcon name="check-bold" /> {saved ? t.shareMode.saved : t.common.save}
      </button>
    </OperatorSection>
  )
}

// « Diffuser au salon » — set up a TV face for the living room. Pick the face, mint the
// right credential, then either cast from Chrome (the bonus one-tap, only on a Chromium
// device) or — the path that works for EVERYONE since iOS can't START a cast — open the
// link/QR once in any TV browser so it holds the screen:
//   board   → the full board     — a PERMANENT, revocable read-only DISPLAY device
//   ambient → the screensaver    — the same permanent display device (/cast?scene=ambient)
//   welcome → the visitor window — a time-boxed WELCOME guest link (24 h), /welcome
// board/ambient ride a display DEVICE token (never expires; killed from the paired-
// devices list, Réglages ▸ Tablettes); they read board+meals+recipes+household, which a
// kiosk-scope device can. welcome needs the guest-curated /welcome window → guest token.
type CastScene = 'board' | 'ambient' | 'welcome'
const CAST_SCENES: Record<
  CastScene,
  { cred: 'display' | 'guest'; kind?: GuestKind; link: (origin: string, token: string, hh: string) => string }
> = {
  board: {
    cred: 'display',
    link: (o, tk, hh) => `${o}/cast?display=${encodeURIComponent(tk)}&hh=${encodeURIComponent(hh)}`,
  },
  ambient: {
    cred: 'display',
    link: (o, tk, hh) => `${o}/cast?scene=ambient&display=${encodeURIComponent(tk)}&hh=${encodeURIComponent(hh)}`,
  },
  welcome: { cred: 'guest', kind: 'welcome', link: (o, tk) => `${o}/welcome?guest=${encodeURIComponent(tk)}` },
}

function CastTvSection({ help }: { help?: HelpMode }) {
  const t = useT()
  // Minting a link is operator-only — a read-only guest can't hand out access.
  const ro = isGuest()
  const [scene, setScene] = useState<CastScene>('board')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The raw token (the sender needs it) + householdId (a display link carries it so the
  // TV can stash the device token); the shareable link is derived from both.
  const [token, setToken] = useState<string | null>(null)
  const [hh, setHh] = useState('')
  // A display scene also gets a short, hand-typeable /tv/<code> link (the easy TV path).
  const [shortCode, setShortCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [casting, setCasting] = useState(false)
  // Show the one-tap cast button only where the Web Sender can actually run (Chrome
  // desktop/Android, with an App ID configured) — never on iOS.
  const canCast = castSenderPossible()
  if (ro) return null
  const cfg = CAST_SCENES[scene]
  const link = token ? cfg.link(window.location.origin, token, hh) : null
  // The short TV link — the path we lead with, since a TV remote can't type the long one.
  const shortLink = shortCode ? `${window.location.origin}/tv/${shortCode}` : null

  // Mint the scene's credential. A display scene creates a PERMANENT revocable device
  // (pair/devices mintDisplay) and returns its token + householdId; welcome mints a 24 h
  // guest token. NOTE: this runs in the OPERATOR's browser — we never call setDeviceToken
  // here (that would turn THIS device into the display); we only hand the token to the
  // link/QR for the TV to stash.
  async function mint(): Promise<{ token: string; hh: string }> {
    if (cfg.cred === 'display') {
      const label = `${t.operator.castDisplayLabel} — ${scene === 'ambient' ? t.operator.castSceneAmbient : t.operator.castSceneBoard}`
      const res = await api<{ token: string; householdId: string; shortCode?: string }>('pair/devices', {
        method: 'POST',
        body: { mintDisplay: true, label, scene },
      })
      setToken(res.token)
      setHh(res.householdId)
      setShortCode(res.shortCode ?? null)
      return { token: res.token, hh: res.householdId }
    }
    const res = await api<{ guestToken: string }>('guest/start', {
      method: 'POST',
      body: { kind: cfg.kind, ttlSeconds: 24 * 3600 },
    })
    setToken(res.guestToken)
    setHh('')
    setShortCode(null)
    return { token: res.guestToken, hh: '' }
  }

  function chooseScene(s: CastScene) {
    setScene(s)
    setToken(null) // a token minted for the old scene's link no longer matches it
    setHh('')
    setShortCode(null)
    setCopied(false)
    setErr(null)
  }

  async function generate() {
    if (busy) return
    setBusy(true)
    setErr(null)
    setCopied(false)
    try {
      await mint()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // One-tap cast (Chrome only): ensure a token, then open the device picker + launch the
  // receiver, handing it the token, scene, and (for a display) the device flag + hh. Any
  // failure (cancelled picker, non-Chrome) falls back to the link/QR below.
  async function castNow() {
    if (casting) return
    setCasting(true)
    setErr(null)
    try {
      const minted = token ? { token, hh } : await mint()
      await castToSalon(minted.token, scene, cfg.cred === 'display', minted.hh)
    } catch {
      setErr(t.operator.castFailed)
    } finally {
      setCasting(false)
    }
  }

  async function copy(value: string | null) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      /* clipboard blocked — the link is shown for manual copy */
    }
  }

  return (
    <OperatorSection title={t.operator.castTitle} help={help} helpKey="guest">
      <p className="operator__hint mono">{t.operator.castIntro}</p>
      <label className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.castSceneLabel}</span>
        <select className="input" value={scene} onChange={(e) => chooseScene(e.target.value as CastScene)} disabled={busy}>
          <option value="board">{t.operator.castSceneBoard}</option>
          <option value="ambient">{t.operator.castSceneAmbient}</option>
          <option value="welcome">{t.operator.castSceneWelcome}</option>
        </select>
      </label>
      <p className="operator__hint mono">{t.operator.castSceneHint[scene]}</p>
      <div className="operator__inline-form">
        {canCast && (
          <button type="button" className="btn btn--primary" onClick={castNow} disabled={casting}>
            <InlineIcon name="key-bold" /> {casting ? t.operator.castNowBusy : t.operator.castNow}
          </button>
        )}
        <button type="button" className={`btn${canCast ? '' : ' btn--primary'}`} onClick={generate} disabled={busy}>
          <InlineIcon name="link-bold" /> {busy ? t.guest.generating : t.operator.castGenerate}
        </button>
      </div>
      {canCast && <p className="operator__seg-hint mono">{t.operator.castNowHint}</p>}
      {err && <StatusMessage tone="error">{err}</StatusMessage>}
      {link && (
        <div className="operator__guest-link">
          {/* Lead with the short /tv/<code> link — the only one typeable on a TV remote. */}
          {shortLink && (
            <>
              <p className="operator__hint mono">{t.operator.castShortReady}</p>
              <input
                className="input mono"
                readOnly
                value={shortLink}
                onFocus={(e) => e.target.select()}
                aria-label={t.operator.castShortLink}
              />
              <div className="operator__inline-form">
                <button type="button" className="btn btn--primary" onClick={() => void copy(shortLink)}>
                  <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
                </button>
              </div>
              {/* Scan off the wall tablet, or just type the short link on the TV. */}
              <QrCode value={shortLink} />
              <p className="operator__seg-hint mono">{t.operator.castShortHint}</p>
            </>
          )}
          <p className="operator__hint mono">{shortLink ? t.operator.castFullLink : t.operator.castReady}</p>
          <input
            className="input mono"
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            aria-label={t.operator.castTitle}
          />
          <div className="operator__inline-form">
            <button type="button" className="btn" onClick={() => void copy(link)}>
              <InlineIcon name="link-bold" /> {copied ? t.guest.copied : t.guest.copy}
            </button>
          </div>
          {/* No short link (welcome scene): the long link is the one to scan/copy. */}
          {!shortLink && <QrCode value={link} />}
          <ol className="operator__hint mono">
            <li>{t.operator.castStep1}</li>
            <li>{t.operator.castStep2}</li>
            <li>{t.operator.castStep3}</li>
          </ol>
          <p className="operator__seg-hint mono">{t.operator.castCaveat}</p>
        </div>
      )}
    </OperatorSection>
  )
}
