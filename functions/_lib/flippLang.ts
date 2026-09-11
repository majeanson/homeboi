import type { Env } from './env'
import { clearPref, getPref, setPref } from './householdPrefs'

// THE FLIPP APP'S LANGUAGE — a household preference, in household_preferences
// (migration 0106) under key 'flippLang'; never a `households` column (DB-6).
//
// Why it exists (2026-09-11, read on Marc's own account over CDP): Flipp publishes
// EVERY flyer twice, once per language, as two flyer objects with adjacent ids and
// two item ids per product (Provigo 8123487/8123488, item 1038553557/1038553558 for
// the same mini-cucumbers, same box, same picture). A clipping is only « available »
// to the Flipp app if its flyer id is in the app's own catalogue — and the app's
// catalogue is the one for the LANGUAGE the app runs in. Babillard searched Flipp in
// the UI language (`X-Lang`: French), Marc's app runs in English, so every deal we
// staged carried French ids the English app could not find: « Unavailable », even
// though the web page for the very same id said valid. Same postal code, same store,
// same picture — the language was the whole difference.
//
// So every Flipp lookup (deals search, flyers list, one flyer's items) uses THIS
// language when the household set it, ahead of the UI language. The setting lives in
// Réglages ▸ La liste ▸ Magasinage under the postal code, and switching it re-stages
// every deal already on the list (the ids change with the language).

export type FlippLang = 'fr' | 'en'

const PREF_KEY = 'flippLang'

/** 'fr' | 'en' or null for anything else — one validator for the URL, the body and the stored blob. */
export function cleanFlippLang(v: unknown): FlippLang | null {
  return v === 'fr' || v === 'en' ? v : null
}

/** The locale a Flipp lookup runs in: an explicit `?lang` on the request wins, then
 *  the Flipp-app language the household set, then the UI language. */
export function resolveFlippLang(explicit: string | null | undefined, pref: FlippLang | null, ui: FlippLang): FlippLang {
  return cleanFlippLang(explicit) ?? pref ?? ui
}

export async function householdFlippLang(env: Env, householdId: string): Promise<FlippLang | null> {
  const p = await getPref<{ lang?: unknown }>(env, householdId, PREF_KEY)
  return cleanFlippLang(p?.lang)
}

export async function setHouseholdFlippLang(env: Env, householdId: string, lang: FlippLang | null): Promise<void> {
  if (lang) await setPref(env, householdId, PREF_KEY, { lang })
  else await clearPref(env, householdId, PREF_KEY)
}
