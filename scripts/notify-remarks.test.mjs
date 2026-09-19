import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRemarkTrailers } from './notify-remarks.mjs'

// The trailer parser, held by a test, because what it reads is a COMMIT MESSAGE: text
// authored outside this app, outside review, and handed to a script running on a runner
// that holds CLOUDFLARE_API_TOKEN. Every case below names the mutation it goes red
// against.

describe('the Regle-remarque trailer', () => {
  it('finds several trailers in ONE commit', () => {
    // Red against dropping the /g flag, or using String.match instead of matchAll. One
    // fix closing two remarks is the normal case, and the SECOND one is what gets lost.
    const { ids } = parseRemarkTrailers(
      'fix(cuisine): deux affaires\n\nExplication: la même cause.\n\nRegle-remarque: rm7fK2Qa\nRegle-remarque: rmAAbbCC',
    )
    expect(ids).toEqual(['rm7fK2Qa', 'rmAAbbCC'])
  })

  it('does NOT treat a mention mid-sentence as a trailer', () => {
    // Red against dropping `^` or the `m` flag. Someone writing « voir Regle-remarque:
    // abc123xx dans la doc » must not ship a notification.
    const { ids } = parseRemarkTrailers('docs: parler du flux\n\nvoir Regle-remarque: abc123xx dans la doc')
    expect(ids).toEqual([])
  })

  it('refuses an id that is not an id — it drops it, it does not sanitize it', () => {
    // Red against widening the capture to (\S+). A shell metacharacter never reaches the
    // request body, because the id is matched against the server's own alphabet HERE too.
    for (const bad of ['a$(id)b', '../../etc', 'rm;DROP', 'rm 7fK2', 'short']) {
      expect(parseRemarkTrailers(`fix: x\n\nRegle-remarque: ${bad}`).ids).toEqual([])
    }
  })

  it('collapses the same id named twice', () => {
    // Red against dropping the Set. Two notifications for one remark is not wrong, but
    // the second one answers `duplicate` and prints a confusing line.
    const { ids } = parseRemarkTrailers('fix: x\n\nRegle-remarque: rmSameSame\nRegle-remarque: rmSameSame')
    expect(ids).toEqual(['rmSameSame'])
  })

  it('reads the Explication paragraph up to the blank line, and no further', () => {
    // Red against a greedy inner group, which would swallow the trailers into the prose.
    const { explanation, ids } = parseRemarkTrailers(
      [
        'fix(cuisine): les en-têtes partaient à l’épicerie',
        '',
        'Explication: l’itérateur ne sautait pas les lignes',
        'd’en-tête, donc « ## Pour la sauce » devenait un article.',
        '',
        'Regle-remarque: rm7fK2Qa',
      ].join('\n'),
    )
    expect(explanation).toBe(
      'l’itérateur ne sautait pas les lignes d’en-tête, donc « ## Pour la sauce » devenait un article.',
    )
    expect(ids).toEqual(['rm7fK2Qa'])
  })

  it('caps a runaway explanation', () => {
    const { explanation } = parseRemarkTrailers(`fix: x\n\nExplication: ${'a'.repeat(5000)}\n\nRegle-remarque: rmCapCap1`)
    expect(explanation).toHaveLength(2000)
  })

  it('an ordinary commit yields nothing at all', () => {
    // Red against any change that defaults to notifying HEAD. Silence on the common path
    // is what keeps the annotations meaningful.
    expect(parseRemarkTrailers('chore: bump a dep').ids).toEqual([])
    expect(parseRemarkTrailers('').ids).toEqual([])
    expect(parseRemarkTrailers(undefined).ids).toEqual([])
  })

  it('carries hostile text through as DATA, untouched', () => {
    // The partner of ci-untrusted.test.mjs: this proves the payload keeps the characters,
    // and that one proves they never reach a shell.
    const { explanation } = parseRemarkTrailers(
      'fix: x\n\nExplication: $(rm -rf /) `whoami` "quotes" \'single\' && echo\n\nRegle-remarque: rmHostile1',
    )
    expect(explanation).toContain('$(rm -rf /)')
    expect(explanation).toContain('`whoami`')
  })

  it('never exits non-zero on the notify path', () => {
    // The whole file must not be able to fail the deploy job. Asserted against the source
    // because the exit path only runs as a script.
    const src = readFileSync(join(import.meta.dirname, 'notify-remarks.mjs'), 'utf8')
    expect(src).not.toMatch(/process\.exit\([1-9]/)
    expect(src).toContain('.catch(')
  })
})
