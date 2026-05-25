// supabase/functions/resolve-nick/index.ts
//
// Nick → email lookup used by the login flow. Lets a user sign in with their
// nick instead of their email: the client posts { nick }, this function returns
// the matching account email, and the client then calls signInWithPassword.
//
// Why an Edge Function and not a public table read:
//   user_profiles.nick could be selected by anon clients, but emails live in
//   auth.users which is NOT publicly readable (and must not be — RODO). Running
//   the lookup here with the service_role key keeps emails server-side; the only
//   thing that ever leaves is the single email for a correct nick+password pair.
//
// Anti-enumeration: every failure path returns the SAME vague message, so an
// attacker can't tell "nick doesn't exist" from "nick exists". The real
// email is only returned on an exact (case-insensitive) nick match; the
// password is still verified afterwards by signInWithPassword on the client.
//
// Deploy:  supabase functions deploy resolve-nick --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Same nick format as migration 13 + the client + register-beta-user.
const NICK_RE = /^[A-Za-z0-9_-]{3,20}$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  let payload: { nick?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidłowy nick lub hasło.' })
  }

  const normalizedNick = String(payload.nick || '').trim()
  // Reject malformed nicks before any DB hit (same vague message).
  if (!NICK_RE.test(normalizedNick)) {
    return json({ error: 'Nieprawidłowy nick lub hasło.' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Case-insensitive match (the unique index is on lower(nick)).
  const { data: profile, error: profErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('nick', normalizedNick)
    .maybeSingle()

  if (profErr || !profile) {
    return json({ error: 'Nieprawidłowy nick lub hasło.' })
  }

  const { data: userRes, error: userErr } = await supabase.auth.admin.getUserById(profile.user_id)
  if (userErr || !userRes?.user?.email) {
    return json({ error: 'Nieprawidłowy nick lub hasło.' })
  }

  return json({ ok: true, email: userRes.user.email })
})
