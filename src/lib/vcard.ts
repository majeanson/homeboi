import type { Contact } from './cercle'
import { fullName } from './cercle'

// Export a « Le cercle » contact as a vCard (.vcf) — the universal format every
// phone/Mac Contacts app imports. Complements the in-app Contact Picker *import*
// (ContactForm) with a way to get a person back OUT, e.g. to text someone "here's
// grandma's number". Pure string-building; no backend.

// vCard escapes \ , ; and newlines in text values (RFC 6350 §3.4).
const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')

export function toVCard(c: Contact): string {
  const lines: string[] = ['BEGIN:VCARD', 'VERSION:3.0']
  // N: Family;Given;Additional;Prefix;Suffix — FN: the display name.
  lines.push(`N:${esc(c.lastName ?? '')};${esc(c.firstName)};;;`)
  lines.push(`FN:${esc(fullName(c))}`)
  if (c.nickname?.trim()) lines.push(`NICKNAME:${esc(c.nickname.trim())}`)
  if (c.phone?.trim()) lines.push(`TEL;TYPE=CELL:${esc(c.phone.trim())}`)
  if (c.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${esc(c.email.trim())}`)
  // Birthday: emit only a real date (skip the 0000-MM-DD "year unknown" sentinel,
  // which isn't a valid vCard BDAY).
  if (c.birthday && /^\d{4}-\d{2}-\d{2}$/.test(c.birthday) && !c.birthday.startsWith('0000')) lines.push(`BDAY:${c.birthday}`)
  // ADR: ;;street;city;region;postal;country
  const a = c.address
  if (a && (a.street || a.city || a.state || a.postalCode || a.country)) {
    lines.push(
      `ADR;TYPE=HOME:;;${esc(a.street ?? '')};${esc(a.city ?? '')};${esc(a.state ?? '')};${esc(a.postalCode ?? '')};${esc(a.country ?? '')}`,
    )
  }
  if (c.notes?.trim()) lines.push(`NOTE:${esc(c.notes.trim())}`)
  if (c.tags.length) lines.push(`CATEGORIES:${c.tags.map(esc).join(',')}`)
  lines.push('END:VCARD')
  // vCard lines are CRLF-terminated.
  return lines.join('\r\n') + '\r\n'
}

// Trigger a .vcf download for one contact (a filename safe across OSes).
export function downloadVCard(c: Contact): void {
  const safe = (fullName(c) || 'contact').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'contact'
  const blob = new Blob([toVCard(c)], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safe}.vcf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has had a tick to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
