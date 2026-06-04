import type { Env } from '../../_lib/env'
import { clearSessionCookies } from '../../_lib/auth'

export const onRequestPost: PagesFunction<Env> = async () => {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' })
  for (const c of clearSessionCookies()) headers.append('Set-Cookie', c)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}
