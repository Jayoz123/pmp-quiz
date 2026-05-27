// supabase/functions/claim-oauth-beta/index.ts
//
// Beta gate for Google OAuth sign-in. Enabling the Google provider lets Supabase
// create an auth.users row for ANY Google account, even with "Enable sign ups"
// OFF — so the beta code MUST be enforced server-side, AFTER the user exists.
// That's what this function does: the client signs in with Google, then (on the
// first OAuth login, when no profile exists yet) posts the pending beta code
// here with the user's access token; we verify the token, claim the code, and
// create the tester profile.
//
// Identity comes from the USER'S TOKEN (not email+password): we read
// Authorization: Bearer <access_token>, verify it with auth.getUser(token), and
// trust the userId/email it returns. This is why we deploy with --no-verify-jwt
// (we verify the token ourselves rather than letting the platform gate it).
//
// Nick: Google doesn't give us one in this flow, so we auto-generate a unique
// "tester-XXXXXX" nick (backlog: a "change nick" screen). The nick still obeys
// the same format + uniqueness rules as email registration.
//
// Idempotent: a double-click / retry where the profile already exists returns
// { ok:true } without touching the code again. Empty Google users left behind
// by a failed claim (wrong code) are NOT deleted here — the next attempt with a
// good code finishes the same account (see plan §4.5, option A).
//
// Deploy:  supabase functions deploy claim-oauth-beta --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Auto-nick format must satisfy the same CHECK/regex as email registration:
// 3–20 chars, [A-Za-z0-9_-]. "tester-" + 6 hex chars = 13 chars → OK.
const NICK_RE = /^[A-Za-z0-9_-]{3,20}$/
const CODE_RE = /^[A-Z0-9-]{12,}$/

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// Generate a candidate auto-nick like "tester-a1b2c3".
const randomNick = () => {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `tester-${hex}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  // ── 0. Read + verify the user's access token ─────────────────────────────────
  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'Brak autoryzacji.' }, 401)
  }

  let payload: { code?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidłowe żądanie.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify the token and resolve the user (service_role client + explicit token).
  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return json({ error: 'Sesja wygasła — zaloguj się ponownie.' }, 401)
  }
  const userId = userData.user.id
  const userEmail = (userData.user.email || '').trim().toLowerCase()

  // ── 1. Validate the beta code ────────────────────────────────────────────────
  const normalizedCode = String(payload.code || '').toUpperCase().trim()
  if (!CODE_RE.test(normalizedCode)) {
    return json({ error: 'Nieprawidłowy kod beta. Sprawdź kod i spróbuj ponownie.' })
  }

  // ── 2. Idempotency: profile already exists → nothing to do ───────────────────
  // Covers double-click / retry, and an existing email tester signing in via
  // Google with the same (already-linked) account.
  const { data: existing, error: existingErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existingErr) {
    return json({ error: 'Błąd serwera — spróbuj ponownie.' })
  }
  if (existing) {
    return json({ ok: true, userId })
  }

  // ── 3. Verify the code exists and is unused (friendly messages) ──────────────
  const { data: betaCode, error: codeErr } = await supabase
    .from('beta_codes')
    .select('code, used')
    .eq('code', normalizedCode)
    .maybeSingle()
  if (codeErr || !betaCode) {
    return json({ error: 'Nieprawidłowy kod beta. Sprawdź kod i spróbuj ponownie.' })
  }
  if (betaCode.used) {
    return json({ error: 'Ten kod został już wykorzystany. Każdy kod jest jednorazowy.' })
  }

  // ── 4. Atomically claim the code (guards against parallel requests) ──────────
  const now = new Date().toISOString()
  const { data: claimed, error: claimErr } = await supabase
    .from('beta_codes')
    .update({ used: true, used_by: userId, used_at: now })
    .eq('code', normalizedCode)
    .eq('used', false)            // only succeeds if still unused
    .select('code')
    .maybeSingle()
  if (claimErr || !claimed) {
    // Lost the race — do NOT delete the Google user (they can retry with a new
    // code; the idempotency check finishes the account next time).
    return json({ error: 'Ten kod został właśnie wykorzystany. Poproś o nowy kod.' })
  }

  // ── 5. Insert the tester profile with a unique auto-nick ─────────────────────
  // Retry on a nick collision (23505 on the lower(nick) unique index). A handful
  // of attempts is plenty given 16M possible "tester-XXXXXX" values.
  let inserted = false
  let lastErrCode: string | undefined
  for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
    const candidate = randomNick()
    if (!NICK_RE.test(candidate)) continue   // belt-and-suspenders
    const { error: profileErr } = await supabase.from('user_profiles').insert({
      user_id:            userId,
      nick:               candidate,
      email:              userEmail,
      auth_provider:      'google',
      is_tester:          true,
      tester_since:       now,
      beta_code_used:     normalizedCode,
      can_report_bugs:    true,
      can_see_debug_info: false,
    })
    if (!profileErr) { inserted = true; break }
    lastErrCode = profileErr.code
    if (profileErr.code !== '23505') break    // non-collision error → stop retrying
    // else: nick collision → loop and try another candidate
  }

  if (!inserted) {
    // Could not create the profile → roll the code back so it stays usable and
    // a retry (with the idempotency check) can finish cleanly.
    await supabase.from('beta_codes')
      .update({ used: false, used_by: null, used_at: null })
      .eq('code', normalizedCode)
    const msg = lastErrCode === '23505'
      ? 'Nie udało się przydzielić nicka — spróbuj ponownie.'
      : 'Błąd tworzenia profilu — spróbuj ponownie.'
    return json({ error: msg })
  }

  // ── 6. Initialise user_progress (back-compat with existing sync code) ────────
  await supabase.from('user_progress').upsert(
    { user_id: userId, is_tester: true },
    { onConflict: 'user_id' },
  )

  return json({ ok: true, userId })
})
