import { describe, it, expect } from 'vitest'
import { isSurfaced, isScheduled, visibleMots, waitingMots, savedMots, sentMots, waitingRecipientIds, motLabel, motFromNote, type Mot } from './mots'

// A minimal Mot factory — only the fields the pure helpers read.
function mot(p: Partial<Mot>): Mot {
  return {
    id: p.id ?? 'm1',
    member_id: p.member_id ?? null,
    author_member_id: p.author_member_id ?? null,
    text: p.text ?? '',
    transcript: p.transcript ?? null,
    media_kind: p.media_kind ?? null,
    media_key: p.media_key ?? null,
    scene_key: p.scene_key ?? null,
    created_at: p.created_at ?? 0,
    updated_at: p.updated_at ?? null,
    opened_at: p.opened_at ?? null,
    saved_at: p.saved_at ?? null,
    surface_at: p.surface_at ?? null,
    dismissed_at: p.dismissed_at ?? null,
    author_label: p.author_label ?? null,
  }
}

describe('mots helpers', () => {
  describe('isSurfaced (scheduled gate)', () => {
    it('an unscheduled mot (surface_at null) is always surfaced', () => {
      expect(isSurfaced(mot({}), 100)).toBe(true)
    })
    it('a scheduled mot is hidden until its time, then surfaces', () => {
      expect(isSurfaced(mot({ surface_at: 200 }), 100)).toBe(false)
      expect(isSurfaced(mot({ surface_at: 200 }), 200)).toBe(true)
      expect(isSurfaced(mot({ surface_at: 200 }), 300)).toBe(true)
    })
  })

  describe('visibleMots (recipient scope)', () => {
    const all = [
      mot({ id: 'mine', member_id: 'A', created_at: 2 }),
      mot({ id: 'house', member_id: null, created_at: 3 }),
      mot({ id: 'theirs', member_id: 'B', created_at: 1 }),
    ]
    it('a picked face sees their own + Maisonnée, newest first', () => {
      expect(visibleMots(all, 'A').map((m) => m.id)).toEqual(['house', 'mine'])
    })
    it('Maisonnée (null face) sees only family-wide mots', () => {
      expect(visibleMots(all, null).map((m) => m.id)).toEqual(['house'])
    })
  })

  describe('isScheduled (sender outbox badge — inverse of surfaced)', () => {
    it('a future surface_at is scheduled; a past one or null is not', () => {
      expect(isScheduled(mot({ surface_at: 200 }), 100)).toBe(true)
      expect(isScheduled(mot({ surface_at: 200 }), 200)).toBe(false) // surfaced now, not scheduled
      expect(isScheduled(mot({ surface_at: 200 }), 300)).toBe(false)
      expect(isScheduled(mot({}), 100)).toBe(false) // unscheduled
    })
  })

  describe('sentMots (the author’s outbox)', () => {
    const all = [
      mot({ id: 'a', author_member_id: 'A', member_id: 'B', created_at: 1 }),
      mot({ id: 'b', author_member_id: 'A', member_id: null, created_at: 3, surface_at: 4000000000 }), // scheduled, still included
      mot({ id: 'c', author_member_id: 'C', member_id: 'A', created_at: 2 }), // someone else's
      mot({ id: 'd', author_member_id: 'A', member_id: 'B', created_at: 2, opened_at: 5 }), // seen, still included
      // Since 0142 every fridge paper is a mot: a plain family-wide one I left is simply ON
      // THE FRIDGE, where I see it — it is not « sent », or the outbox would be the fridge.
      mot({ id: 'plain', author_member_id: 'A', member_id: null, created_at: 4 }),
      mot({ id: 'gone', author_member_id: 'A', member_id: 'B', created_at: 5, dismissed_at: 6 }), // taken down
    ]
    it('returns what I left FOR someone (or for later), newest first, incl. scheduled + seen', () => {
      expect(sentMots(all, 'A').map((m) => m.id)).toEqual(['b', 'd', 'a'])
    })
    it('a null author (Maisonnée at rest) has no outbox', () => {
      expect(sentMots(all, null)).toEqual([])
    })
  })

  describe('waiting / saved split', () => {
    const all = [
      mot({ id: 'wait', member_id: 'A', opened_at: null }),
      mot({ id: 'seen', member_id: 'A', opened_at: 50 }),
      mot({ id: 'kept', member_id: 'A', opened_at: 50, saved_at: 60 }),
      // A family-wide paper is on the fridge for everyone — it never « waits » on a face.
      mot({ id: 'house', member_id: null, opened_at: null }),
    ]
    it('waiting = addressed to THIS face and unopened — never a family-wide paper', () => {
      expect(waitingMots(all, 'A').map((m) => m.id)).toEqual(['wait'])
      expect(waitingMots(all, null)).toEqual([])
    })
    it('saved = kept keepsakes — and a kept one outlives being taken down', () => {
      const shelf = [...all, mot({ id: 'retired', member_id: 'A', saved_at: 70, dismissed_at: 80 })]
      expect(savedMots(shelf, 'A').map((m) => m.id).sort()).toEqual(['kept', 'retired'])
    })
    it('a taken-down paper is off the fridge even for its own face', () => {
      const withGone = [...all, mot({ id: 'gone', member_id: 'A', dismissed_at: 80 })]
      expect(visibleMots(withGone, 'A').map((m) => m.id)).not.toContain('gone')
    })
  })

  describe('waitingRecipientIds (per-face dot)', () => {
    it('returns member ids with an unopened mot, excluding Maisonnée and taken-down ones', () => {
      const ids = waitingRecipientIds([
        mot({ member_id: 'A', opened_at: null }),
        mot({ member_id: 'B', opened_at: 99 }), // opened → no dot
        mot({ member_id: null, opened_at: null }), // Maisonnée → excluded (the fridge shows it)
        mot({ member_id: 'C', opened_at: null, dismissed_at: 5 }), // taken down → no dot
      ])
      expect([...ids]).toEqual(['A'])
    })
  })
})

// THE trap, pinned in one place: `member_id` is the AUTHOR on a note row and the RECIPIENT
// on a Mot. Every reader of the fridge-as-mots reads the Mot; only motFromNote reads the row.
describe('motFromNote', () => {
  it('maps the note author/recipient onto the mot shape the readers use', () => {
    const m = motFromNote({
      id: 'n1', text: 'Bravo', member_id: 'papa', for_member_id: 'lea', created_at: 1, updated_at: null,
      media_kind: null, media_key: null, scene_key: null, opened_at: null, saved_at: null, surface_at: null,
      transcript: null, dismissed_at: null, author_label: null,
    })
    expect(m.author_member_id).toBe('papa')
    expect(m.member_id).toBe('lea')
  })
})

// The label chain a row, a peek title and a quoted reply all share (A5).
describe('motLabel', () => {
  const L = { memo: 'Mémo vocal', drawing: 'Dessin', photo: 'Photo', untitled: 'Un mot' }
  it('a written line wins — the transcript never overrides what someone typed', () => {
    expect(motLabel(mot({ text: 'Bonne fête', transcript: 'bon effet' }), L)).toBe('Bonne fête')
  })
  it('a voice mot reads as its words instead of « Mémo vocal »', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: 'Je rentre plus tard' }), L)).toBe(
      'Je rentre plus tard',
    )
  })
  it('falls back to the media label when AI is unset (transcript NULL) — the ordinary local path', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: null }), L)).toBe('Mémo vocal')
  })
  it('a whitespace-only transcript is not a label', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: '   \n  ' }), L)).toBe('Mémo vocal')
  })
  it('takes the FIRST line of a multi-line transcript, not the whole paragraph', () => {
    expect(motLabel(mot({ text: '', media_kind: 'audio', transcript: 'Salut\nça va ?' }), L)).toBe('Salut')
  })
  it('a mot with nothing at all still reads as something', () => {
    expect(motLabel(mot({ text: '' }), L)).toBe('Un mot')
  })
})
