import { describe, it, expect } from 'vitest'
import { googleMapsUrl, splitNameAddress, parseGoogleMapsUrl } from './placeImport'

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
