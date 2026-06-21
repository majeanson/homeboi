import { describe, it, expect } from 'vitest'
import {
  googleMapsUrl,
  googleImageUrl,
  splitNameAddress,
  parseGoogleMapsUrl,
  parseMapsTitle,
  parsePlaceOg,
  metaContent,
} from './placeImport'

describe('googleMapsUrl (SSRF allowlist)', () => {
  it('accepts the share shortener and maps domains', () => {
    expect(googleMapsUrl('https://maps.app.goo.gl/NQPCmAJX8pTKDF998?g_st=ic')).not.toBeNull()
    expect(googleMapsUrl('https://maps.google.com/maps?q=x')).not.toBeNull()
    expect(googleMapsUrl('https://www.google.com/maps/place/x')).not.toBeNull()
    expect(googleMapsUrl('https://goo.gl/maps/abc')).not.toBeNull()
    expect(googleMapsUrl('https://google.ca/maps?q=x')).not.toBeNull()
  })
  it('rejects non-Google hosts and non-http schemes', () => {
    expect(googleMapsUrl('https://evil.com/maps?q=x')).toBeNull()
    expect(googleMapsUrl('http://localhost/maps')).toBeNull()
    expect(googleMapsUrl('file:///etc/passwd')).toBeNull()
    expect(googleMapsUrl('https://notgoogle.com.evil.net/')).toBeNull()
    expect(googleMapsUrl('gibberish')).toBeNull()
  })
})

describe('splitNameAddress', () => {
  it('splits name from address at the first street-number segment', () => {
    expect(
      splitNameAddress('Clinique Dentaire Otterburn Park, 617 Chem. Ozias-Leduc, Otterburn Park, Quebec J3H 2M7'),
    ).toEqual({
      name: 'Clinique Dentaire Otterburn Park',
      address: '617 Chem. Ozias-Leduc, Otterburn Park, Quebec J3H 2M7',
    })
  })
  it('keeps a comma inside the name when the address starts later', () => {
    expect(splitNameAddress("Joe's Bar, Grill, 123 Main St, Montréal")).toEqual({
      name: "Joe's Bar, Grill",
      address: '123 Main St, Montréal',
    })
  })
  it('falls back to first segment = name when nothing looks like a street number', () => {
    expect(splitNameAddress('Parc national, Québec')).toEqual({ name: 'Parc national', address: 'Québec' })
  })
  it('handles a single segment', () => {
    expect(splitNameAddress('Just A Name')).toEqual({ name: 'Just A Name', address: null })
  })
})

describe('parseGoogleMapsUrl', () => {
  it('parses the share-link redirect target (q = name, address)', () => {
    const p = parseGoogleMapsUrl(
      'https://maps.google.com/maps?q=Clinique+Dentaire+Otterburn+Park,+617+Chem.+Ozias-Leduc,+Otterburn+Park,+Quebec+J3H+2M7&ftid=0x4cc9ab093def9d13:0xc252761d2920bee8',
    )
    expect(p.name).toBe('Clinique Dentaire Otterburn Park')
    expect(p.address).toBe('617 Chem. Ozias-Leduc, Otterburn Park, Quebec J3H 2M7')
    expect(p.mapUrl).toContain('maps.google.com')
  })
  it('parses a /maps/place/<name>/@lat,lng permalink', () => {
    const p = parseGoogleMapsUrl('https://www.google.com/maps/place/Caf%C3%A9+Olimpico/@45.523,-73.59,17z/data=!x')
    expect(p.name).toBe('Café Olimpico')
    expect(p.lat).toBeCloseTo(45.523)
    expect(p.lng).toBeCloseTo(-73.59)
  })
  it('does not treat a bare coordinate q as a name', () => {
    const p = parseGoogleMapsUrl('https://maps.google.com/maps?q=45.5,-73.6')
    expect(p.name).toBeNull()
    expect(p.lat).toBeCloseTo(45.5)
    expect(p.lng).toBeCloseTo(-73.6)
  })
  it('is null-safe on a junk URL', () => {
    expect(parseGoogleMapsUrl('not a url').name).toBeNull()
  })
})

describe('googleImageUrl (photo SSRF allowlist)', () => {
  it('accepts Google image CDNs over https', () => {
    expect(googleImageUrl('https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=x')).not.toBeNull()
    expect(googleImageUrl('https://lh5.googleusercontent.com/p/abc')).not.toBeNull()
  })
  it('rejects other hosts, http, and empty', () => {
    expect(googleImageUrl('https://evil.com/a.jpg')).toBeNull()
    expect(googleImageUrl('http://lh5.googleusercontent.com/p/abc')).toBeNull()
    expect(googleImageUrl(null)).toBeNull()
  })
})

describe('parseMapsTitle', () => {
  it('splits name / rating / category', () => {
    expect(parseMapsTitle('Clinique Dentaire Otterburn Park · 5.0★(20) · Dentist')).toEqual({
      name: 'Clinique Dentaire Otterburn Park',
      category: 'Dentist',
    })
  })
  it('keeps name, no category when only a rating follows', () => {
    expect(parseMapsTitle('Chez Lévêque · 4.3★(1,204)')).toEqual({ name: 'Chez Lévêque', category: null })
  })
  it('skips a price tier to find the category', () => {
    expect(parseMapsTitle('Resto · 4.5★(88) · $$ · French restaurant')).toEqual({
      name: 'Resto',
      category: 'French restaurant',
    })
  })
  it('plain name only', () => {
    expect(parseMapsTitle('Parc Safari')).toEqual({ name: 'Parc Safari', category: null })
  })
})

describe('metaContent + parsePlaceOg', () => {
  // Mirrors a real Google share-link preview: · and ★ arrive as literal UTF-8, the
  // image URL's separators are &amp;-encoded, and attribute order varies.
  const html = `<html><head>
    <meta property="og:title" content="Clinique Dentaire Otterburn Park · 5.0★(20) · Dentist">
    <meta content="617 Chem. Ozias-Leduc, Otterburn Park, QC J3H 2M7" property="og:description">
    <meta property="og:image" content="https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=QXW6&amp;w=900">
  </head></html>`

  it('reads a meta tag in either attribute order, entity-decoded', () => {
    expect(metaContent(html, 'og:description')).toBe('617 Chem. Ozias-Leduc, Otterburn Park, QC J3H 2M7')
    expect(metaContent(html, 'og:image')).toBe('https://streetviewpixels-pa.googleapis.com/v1/thumbnail?panoid=QXW6&w=900')
    expect(metaContent(html, 'og:missing')).toBeNull()
  })

  it('decodes numeric entities (e.g. &#39; / &#x2F;)', () => {
    const h = `<meta property="og:title" content="Joe&#39;s Caf&#xe9; &#x2F; Bar">`
    expect(metaContent(h, 'og:title')).toBe("Joe's Café / Bar")
  })

  it('parses name/address/category/photo from a real place preview', () => {
    const og = parsePlaceOg(html)
    expect(og.name).toBe('Clinique Dentaire Otterburn Park')
    expect(og.category).toBe('Dentist')
    expect(og.address).toBe('617 Chem. Ozias-Leduc, Otterburn Park, QC J3H 2M7')
    expect(og.photoUrl).toContain('streetviewpixels-pa.googleapis.com')
  })

  it('returns all-null for the generic Google Maps shell', () => {
    const generic = `<meta property="og:title" content="Google Maps">
      <meta property="og:description" content="Find local businesses, view maps and get driving directions in Google Maps.">
      <meta property="og:image" content="https://maps.google.com/maps/api/staticmap?center=1,2">`
    expect(parsePlaceOg(generic)).toEqual({ name: null, address: null, category: null, photoUrl: null })
  })

  it('drops the boilerplate description and the static-map fallback image', () => {
    const partial = `<meta property="og:title" content="Some Place · Cafe">
      <meta property="og:description" content="Find local businesses, view maps and get driving directions in Google Maps.">
      <meta property="og:image" content="https://maps.google.com/maps/api/staticmap?center=1,2">`
    const og = parsePlaceOg(partial)
    expect(og.name).toBe('Some Place')
    expect(og.category).toBe('Cafe')
    expect(og.address).toBeNull()
    expect(og.photoUrl).toBeNull()
  })
})
