// Shared search fold: lowercase + strip diacritics so substring matching is
// accent-insensitive (Québécois: souper vs soupér, Léa vs Lea). Punctuation is
// PRESERVED (unlike cookCommands' foldCmd, which also collapses punctuation) so a
// needle keeps apostrophes/hyphens. Same combining-mark range EntityCombobox used
// before this was extracted, so matching behaviour is unchanged.
export const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
