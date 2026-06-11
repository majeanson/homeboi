// Explicit route table for the Worker entry. On Pages, file paths under
// functions/api/ WERE the routing; a Worker has one fetch handler, so we
// reproduce that mapping here as a static table (path after "api/" → the
// handler module). The handler modules themselves are UNCHANGED Pages
// Functions — index.ts adapts a Worker request into the EventContext they
// expect. One dynamic route (img/<key>) is matched specially.

import * as authLogin from '../functions/api/auth/login'
import * as authLogout from '../functions/api/auth/logout'
import * as authMe from '../functions/api/auth/me'
import * as authSignup from '../functions/api/auth/signup'
import * as board from '../functions/api/board'
import * as capture from '../functions/api/capture'
import * as chores from '../functions/api/chores'
import * as deals from '../functions/api/deals'
import * as events from '../functions/api/events'
import * as flyer from '../functions/api/flyer'
import * as flyers from '../functions/api/flyers'
import * as ghost from '../functions/api/ghost'
import * as health from '../functions/api/health'
import * as household from '../functions/api/household'
import * as list from '../functions/api/list'
import * as meals from '../functions/api/meals'
import * as mealStaples from '../functions/api/meal-staples'
import * as members from '../functions/api/members'
import * as membersAvatar from '../functions/api/members/avatar'
import * as notes from '../functions/api/notes'
import * as pantry from '../functions/api/pantry'
import * as photos from '../functions/api/photos'
import * as recap from '../functions/api/recap'
import * as recipeDraft from '../functions/api/recipe-draft'
import * as recipeImage from '../functions/api/recipe-image'
import * as recipeImport from '../functions/api/recipe-import'
import * as recipeVision from '../functions/api/recipe-vision'
import * as recipes from '../functions/api/recipes'
import * as recipeTags from '../functions/api/recipe-tags'
import * as recipeToList from '../functions/api/recipe-to-list'
import * as routines from '../functions/api/routines'
import * as suggestMeal from '../functions/api/suggest-meal'
import * as useSoon from '../functions/api/use-soon'
import * as weather from '../functions/api/weather'
import * as pairClaim from '../functions/api/pair/claim'
import * as pairDevices from '../functions/api/pair/devices'
import * as pairPoll from '../functions/api/pair/poll'
import * as pairStart from '../functions/api/pair/start'
import * as imgKey from '../functions/api/img/[key]'
import type { Env } from '../functions/_lib/env'

// A handler module exposes per-method exports (onRequestGet/Post/Patch/Delete),
// each a Pages Function. We index them by name at dispatch time. `any` for the
// params/data type args so every handler (incl. the [key] dynamic route) fits
// the one index signature; index.ts hands them a real EventContext.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteMod = Record<string, PagesFunction<Env, any, any> | undefined>

// Keyed by the path AFTER "api/" (no leading slash, no query).
const TABLE: Record<string, RouteMod> = {
  'auth/login': authLogin,
  'auth/logout': authLogout,
  'auth/me': authMe,
  'auth/signup': authSignup,
  board,
  capture,
  chores,
  deals,
  events,
  flyer,
  flyers,
  ghost,
  health,
  household,
  list,
  meals,
  'meal-staples': mealStaples,
  members,
  'members/avatar': membersAvatar,
  notes,
  pantry,
  photos,
  recap,
  'recipe-draft': recipeDraft,
  'recipe-image': recipeImage,
  'recipe-import': recipeImport,
  'recipe-vision': recipeVision,
  recipes,
  'recipe-tags': recipeTags,
  'recipe-to-list': recipeToList,
  routines,
  'suggest-meal': suggestMeal,
  'use-soon': useSoon,
  weather,
  'pair/claim': pairClaim,
  'pair/devices': pairDevices,
  'pair/poll': pairPoll,
  'pair/start': pairStart,
}

export interface Matched {
  mod: RouteMod
  params: Record<string, string>
}

// Resolve an api path to a handler module + URL params. Exact match first, then
// the single dynamic route (img/<key>, an opaque single-segment R2 key).
export function matchRoute(apiPath: string): Matched | null {
  const exact = TABLE[apiPath]
  if (exact) return { mod: exact, params: {} }
  if (apiPath.startsWith('img/')) {
    const key = apiPath.slice('img/'.length)
    if (key && !key.includes('/')) return { mod: imgKey, params: { key } }
  }
  return null
}
