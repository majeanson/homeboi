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

// ── Import (#44) ──────────────────────────────────────────────────────────
// Parse a .vcf file (one or MANY VCARD blocks — a phone/Google "export all" is one
// file with every contact) back into the fields the cercle POST accepts. The exact
// reverse of toVCard, tolerant of other apps' exports: line-unfolding, param
// stripping (TEL;TYPE=CELL → phone), and value-unescaping. Best-effort — an
// unparseable property is skipped, never thrown, so a messy file still imports what
// it can.
export interface ParsedContact {
  firstName: string
  lastName: string
  nickname: string | null
  phone: string | null
  email: string | null
  birthday: string | null // 'YYYY-MM-DD' or null
  address: ContactAddressLike | null
  notes: string | null
  tags: string[]
}
interface ContactAddressLike {
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
}

const unesc = (s: string): string =>
  s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')

// vCard folds long lines: a CRLF followed by a space or tab continues the previous
// line. Rejoin those before parsing. Handles CRLF, LF, and CR.
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '') // a leading space/tab = continuation of the line above
    .split('\n')
}

// "TEL;TYPE=CELL:514-..." → { name:'TEL', value:'514-...' }. Splits on the FIRST
// unescaped colon (ADR/N values themselves carry ';' but never an unescaped ':').
function splitProp(line: string): { name: string; value: string } | null {
  const i = line.indexOf(':')
  if (i < 0) return null
  const head = line.slice(0, i)
  const name = head.split(';')[0].trim().toUpperCase()
  return { name, value: line.slice(i + 1) }
}

export function parseVCard(text: string): ParsedContact[] {
  const out: ParsedContact[] = []
  let cur: Partial<ParsedContact> & { _fn?: string } = {}
  let inCard = false
  for (const raw of unfold(text)) {
    const line = raw.trim()
    if (!line) continue
    const up = line.toUpperCase()
    if (up === 'BEGIN:VCARD') {
      inCard = true
      cur = { tags: [] }
      continue
    }
    if (up === 'END:VCARD') {
      if (inCard) {
        // Prefer the structured N (last;first); fall back to splitting FN.
        let first = cur.firstName ?? ''
        let last = cur.lastName ?? ''
        if (!first && !last && cur._fn) {
          const parts = cur._fn.trim().split(/\s+/)
          first = parts[0] ?? ''
          last = parts.slice(1).join(' ')
        }
        if (first || last) {
          out.push({
            firstName: first,
            lastName: last,
            nickname: cur.nickname ?? null,
            phone: cur.phone ?? null,
            email: cur.email ?? null,
            birthday: cur.birthday ?? null,
            address: cur.address ?? null,
            notes: cur.notes ?? null,
            tags: cur.tags ?? [],
          })
        }
      }
      inCard = false
      continue
    }
    if (!inCard) continue
    const p = splitProp(line)
    if (!p) continue
    switch (p.name) {
      case 'N': {
        // Family;Given;Additional;Prefix;Suffix
        const f = p.value.split(';')
        cur.lastName = unesc(f[0] ?? '').trim()
        cur.firstName = unesc(f[1] ?? '').trim()
        break
      }
      case 'FN':
        cur._fn = unesc(p.value).trim()
        break
      case 'NICKNAME':
        cur.nickname = unesc(p.value).trim() || null
        break
      case 'TEL':
        if (!cur.phone) cur.phone = unesc(p.value).trim() || null
        break
      case 'EMAIL':
        if (!cur.email) cur.email = unesc(p.value).trim() || null
        break
      case 'BDAY': {
        const m = p.value.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/)
        if (m) cur.birthday = `${m[1]}-${m[2]}-${m[3]}`
        break
      }
      case 'ADR': {
        // ;;street;city;region;postal;country
        const f = p.value.split(';').map((x) => unesc(x).trim())
        const a: ContactAddressLike = {}
        if (f[2]) a.street = f[2]
        if (f[3]) a.city = f[3]
        if (f[4]) a.state = f[4]
        if (f[5]) a.postalCode = f[5]
        if (f[6]) a.country = f[6]
        if (Object.keys(a).length) cur.address = a
        break
      }
      case 'NOTE':
        cur.notes = unesc(p.value).trim() || null
        break
      case 'CATEGORIES':
        cur.tags = p.value
          .split(',')
          .map((x) => unesc(x).trim())
          .filter(Boolean)
        break
    }
  }
  return out
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
