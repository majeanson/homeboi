import { useT } from '../../i18n'
import { BirthdayPicker } from './BirthdayPicker'
import { Icon } from '../Icon'
import { Chip } from '../Chip'

// The shared identity field-cluster for a person: name parts, birthday, gender, and
// (optionally) phone/email/address. Extracted from ContactForm so the relative-facing
// intake form (src/pages/IntakeForm.tsx) reuses the EXACT same markup + cf.css styling
// instead of forking a parallel copy. Controlled: the parent owns the state and gets
// a partial patch on every change. `showContact` toggles the phone/email row;
// `showAddress` the structured address (a relative's kid usually needs neither).

export interface ContactCoreValue {
  firstName: string
  lastName: string
  nickname: string
  birthday: string // '' or 'YYYY-MM-DD' / '0000-MM-DD'
  gender: 'm' | 'f' | null
  phone: string
  email: string
  street: string
  city: string
  province: string
  postal: string
}

export const EMPTY_CONTACT_CORE: ContactCoreValue = {
  firstName: '',
  lastName: '',
  nickname: '',
  birthday: '',
  gender: null,
  phone: '',
  email: '',
  street: '',
  city: '',
  province: '',
  postal: '',
}

export function ContactFields({
  value,
  onChange,
  autoFocus,
  showContact = true,
  showAddress = true,
}: {
  value: ContactCoreValue
  onChange: (patch: Partial<ContactCoreValue>) => void
  autoFocus?: boolean
  showContact?: boolean
  showAddress?: boolean
}) {
  const t = useT()
  return (
    <>
      <div className="cf__grid">
        <label className="cf__field">
          <span className="cf__label">{t.cercle.firstName}</span>
          <input
            className="cf__input"
            value={value.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            autoFocus={autoFocus}
          />
        </label>
        <label className="cf__field">
          <span className="cf__label">{t.cercle.lastName}</span>
          <input className="cf__input" value={value.lastName} onChange={(e) => onChange({ lastName: e.target.value })} />
        </label>
        <label className="cf__field">
          <span className="cf__label">{t.cercle.nickname}</span>
          <input className="cf__input" value={value.nickname} onChange={(e) => onChange({ nickname: e.target.value })} />
        </label>
        <div className="cf__field cf__field--bday">
          <span className="cf__label">
            <Icon name="cake-bold" size={14} /> {t.cercle.birthday}
          </span>
          <BirthdayPicker value={value.birthday || null} onChange={(v) => onChange({ birthday: v ?? '' })} />
        </div>
        <div className="cf__field cf__gender">
          <span className="cf__label">{t.cercle.gender}</span>
          <div className="cf__gender-chips">
            {(['m', 'f', null] as const).map((g) => (
              <Chip key={String(g)} selected={value.gender === g} onClick={() => onChange({ gender: g })}>
                {g === 'm' ? t.cercle.genderM : g === 'f' ? t.cercle.genderF : t.cercle.genderN}
              </Chip>
            ))}
          </div>
        </div>
        {showContact && (
          <>
            <label className="cf__field">
              <span className="cf__label">
                <Icon name="phone-bold" size={14} /> {t.cercle.phone}
              </span>
              <input
                className="cf__input"
                type="tel"
                value={value.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
              />
            </label>
            <label className="cf__field">
              <span className="cf__label">
                <Icon name="envelope-bold" size={14} /> {t.cercle.email}
              </span>
              <input
                className="cf__input"
                type="email"
                value={value.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
            </label>
          </>
        )}
      </div>

      {showAddress && (
        <div className="cf__field">
          <span className="cf__label">
            <Icon name="map-pin-bold" size={14} /> {t.cercle.address}
          </span>
          <input
            className="cf__input"
            value={value.street}
            onChange={(e) => onChange({ street: e.target.value })}
            placeholder={t.cercle.addressStreet}
            autoComplete="address-line1"
          />
          <div className="cf__addr-row">
            <input
              className="cf__input"
              value={value.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder={t.cercle.addressCity}
              autoComplete="address-level2"
            />
            <input
              className="cf__input cf__addr-prov"
              value={value.province}
              onChange={(e) => onChange({ province: e.target.value })}
              placeholder={t.cercle.addressProvince}
              autoComplete="address-level1"
            />
            <input
              className="cf__input cf__addr-postal"
              value={value.postal}
              onChange={(e) => onChange({ postal: e.target.value })}
              placeholder={t.cercle.addressPostal}
              autoComplete="postal-code"
            />
          </div>
        </div>
      )}
    </>
  )
}
