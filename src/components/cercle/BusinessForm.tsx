import { useState } from 'react'
import { useT, useLang } from '../../i18n'
import { api } from '../../lib/api'
import { resizeImage, imgUrl } from '../../lib/image'
import { useWrite } from '../../lib/write'
import { BUSINESSES_KEY } from '../../lib/queryKeys'
import { type Business, BUSINESS_CATEGORIES, BUSINESS_COLOUR } from '../../lib/businesses'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { ColorPicker } from '../ColorPicker'
import { StatusMessage } from '../StatusMessage'
import { Icon } from '../Icon'

// « Le cercle » → Business: add / edit one service card (vet, plombier, hôpital…).
// A much simpler ContactForm — no relationships, no vCard, no member link, no
// birthday: just the reach-and-remember fields + an optional card photo. POST when
// new, PATCH when `value`. Writes via useWrite (offline-safe); the photo blob goes
// through api() directly (blobs can't queue in the outbox).
export function BusinessForm({
  value,
  onSaved,
  onCancel,
}: {
  value?: Business | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const bz = t.cercle.business

  const [name, setName] = useState(value?.name ?? '')
  const [category, setCategory] = useState(value?.category ?? '')
  const [phone, setPhone] = useState(value?.phone ?? '')
  const [email, setEmail] = useState(value?.email ?? '')
  const [address, setAddress] = useState(value?.address ?? '')
  const [website, setWebsite] = useState(value?.website ?? '')
  const [notes, setNotes] = useState(value?.notes ?? '')
  const [colour, setColour] = useState(value?.colour ?? BUSINESS_COLOUR)
  const [photoKey, setPhotoKey] = useState<string | null>(value?.photoKey ?? null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  // Import from a shared Google Maps link (new cards only) — the backend follows the
  // share-link redirects and reads the place's name + address off the resolved URL.
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  async function importLink() {
    const url = importUrl.trim()
    if (!url || importing) return
    setImporting(true)
    setImportMsg(null)
    try {
      const place = await api<{
        name: string | null
        address: string | null
        category: string | null
        photoKey: string | null
        empty?: boolean
      }>('place-import', { method: 'POST', body: { url } })
      if (place.empty || (!place.name && !place.address)) {
        setImportMsg(bz.importEmpty)
        return
      }
      if (place.name) setName(place.name)
      if (place.address) setAddress(place.address)
      if (place.category && !category.trim()) setCategory(place.category)
      if (place.photoKey) setPhotoKey(place.photoKey)
      setImportUrl('')
    } catch {
      setImportMsg(bz.importFailed)
    } finally {
      setImporting(false)
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const blob = await resizeImage(file, 1024)
      const { key } = await api<{ key: string }>('businesses', { method: 'POST', body: blob })
      setPhotoKey(key)
    } catch {
      /* R2 unset / failed upload → keep the icon tile */
    } finally {
      setUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy) return
    const body = {
      name: name.trim(),
      category: category.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      website: website.trim() || null,
      notes: notes.trim() || null,
      colour,
      photoKey,
    }
    setBusy(true)
    setErr(false)
    try {
      await write('businesses', {
        method: value ? 'PATCH' : 'POST',
        body: value ? { id: value.id, ...body } : body,
        affectedKeys: [BUSINESSES_KEY],
      })
      onSaved()
    } catch {
      setErr(true)
    } finally {
      setBusy(false)
    }
  }

  const photo = photoKey ? imgUrl(photoKey) : null

  return (
    <form className="operator__inline-form" onSubmit={submit}>
      {/* Import from a shared Google Maps link — only when adding a new card (an edit
          already has its fields). Paste → fills name + address for review. */}
      {!value && (
        <div className="business-form__import">
          <div className="business-form__import-row">
            <input
              className="input"
              type="url"
              inputMode="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void importLink()
                }
              }}
              placeholder={bz.importLabel}
              aria-label={bz.importLabel}
            />
            <button type="button" className="btn btn--ghost" onClick={() => void importLink()} disabled={!importUrl.trim() || importing}>
              <Icon name="map-pin-bold" size={16} /> {importing ? bz.importing : bz.importBtn}
            </button>
          </div>
          {importMsg ? <StatusMessage tone="error">{importMsg}</StatusMessage> : <p className="business-form__import-hint mono">{bz.importHint}</p>}
        </div>
      )}

      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={bz.name} aria-label={bz.name} />

      {/* Category — free text, with a suggestion list (typeaheadOnly). */}
      <EntityCombobox<string>
        value={category}
        onChange={setCategory}
        options={BUSINESS_CATEGORIES.map((c): ComboOption<string> => ({ id: c[lang], label: c[lang], data: c[lang], icon: 'storefront-bold' }))}
        onPick={(opt) => setCategory(opt.label)}
        placeholder={bz.category}
        submitIcon={null}
        typeaheadOnly
      />

      <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={bz.phone} aria-label={bz.phone} />
      <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={bz.email} aria-label={bz.email} />
      <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={bz.address} aria-label={bz.address} />
      <input className="input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder={bz.website} aria-label={bz.website} />
      <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={bz.notes} aria-label={bz.notes} rows={3} />

      {/* A colour for this business — tints its row, its detail peek, and every
          rendez-vous linked to it (board, calendar, day page, agenda). */}
      <label className="business-form__colour">
        <span className="cf__label">{bz.colour}</span>
        <ColorPicker value={colour} onChange={setColour} label={bz.colour} />
      </label>

      {/* Optional business-card photo (hidden gracefully if R2 is unset → upload fails). */}
      <label className="business-form__photo">
        {photo ? (
          <img src={photo} alt="" className="business-form__photo-img" />
        ) : (
          <span className="business-form__photo-add">
            <Icon name="storefront-bold" size={20} /> {uploading ? bz.uploading : bz.addPhoto}
          </span>
        )}
        <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      </label>

      {err && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}
      <button type="submit" className="btn" disabled={!name.trim() || busy}>
        {value ? t.common.save : bz.add}
      </button>
      {onCancel && (
        <button type="button" className="btn btn--ghost mono" onClick={onCancel}>
          {t.common.cancel}
        </button>
      )}
    </form>
  )
}
