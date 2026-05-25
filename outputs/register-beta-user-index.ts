// supabase/functions/register-beta-user/index.ts
//
// Atomic beta registration. The ONLY way to create an account once
// "Enable sign ups" is OFF in the Supabase Dashboard.
//
// Flow:
//   1. validate input (code, email, password, nick)
//   2. verify the beta code exists and is unused  (nice error messages)
//   3. pre-check that the nick is free            (friendly message)
//   4. create the auth user (admin API — bypasses "Disable sign ups")
//   5. atomically claim the code (conditional UPDATE ... WHERE used = false)
//      → on a lost race, roll back the just-created user
//   6. write the full tester profile (user_profiles, incl. nick) + user_progress
//      → unique nick collision (23505) from a parallel request rolls back cleanly
//
// Deploy:  supabase functions deploy register-beta-user --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
//          by Supabase for deployed functions.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Source of truth for the nick format (mirrors the CHECK constraint in
// migration 13 and the client-side regex): 3–20 chars, [A-Za-z0-9_-], no spaces.
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

  let payload: { code?: string; email?: string; password?: string; nick?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidłowe żądanie.' }, 400)
  }

  const { code, email, password, nick } = payload

  // ── 0. Validate input ──────────────────────────────────────────────────
  if (!code || !email || !password || !nick) {
    return json({ error: 'Brak kodu, emaila, hasła lub nicka.' }, 400)
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: 'Podaj prawidłowy adres email.' }, 400)
  }
  if (password.length < 6) {
    return json({ error: 'Hasło musi mieć co najmniej 6 znaków.' }, 400)
  }
  const normalizedNick = String(nick).trim()
  if (!NICK_RE.test(normalizedNick)) {
    return json({ error: 'Nick musi mieć 3–20 znaków: litery, cyfry, _ lub -.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const normalizedCode  = code.toUpperCase().trim()
  const normalizedEmail = email.trim().toLowerCase()

  // ── 1. Verify code (for a friendly message before we touch auth) ─────────
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

  // ── 2. Pre-check the nick is free (friendly message before touching auth) ─
  // Case-insensitive: the unique index is on lower(nick), so 'Bartek' == 'bartek'.
  // This is a best-effort early check; the DB unique index in step 5 is the
  // real guard against a race between this check and the insert.
  const { data: nickTaken, error: nickErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('nick', normalizedNick)
    .maybeSingle()

  if (nickErr) {
    return json({ error: 'Błąd weryfikacji nicka — spróbuj ponownie.' })
  }
  if (nickTaken) {
    return json({ error: 'Ten nick jest już zajęty. Wybierz inny.' })
  }

  // ── 3. Create the user account (admin — ignores "Disable sign ups") ──────
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    // Auto-confirm: the beta code already proves the invite, and — unlike
    // signUp() — admin.createUser does NOT send a confirmation email. Setting
    // this true lets the tester sign in immediately, no email round-trip.
    email_confirm: true,
  })

  if (authErr || !authData?.user) {
    const already = authErr?.message?.toLowerCase().includes('already')
    const msg = already
      ? 'Ten adres email jest już zarejestrowany.'
      : (authErr?.message || 'Błąd rejestracji — spróbuj ponownie.')
    return json({ error: msg })
  }

  const userId = authData.user.id
  const now    = new Date().toISOString()

  // ── 4. Atomically claim the code (guards against two parallel requests) ──
  const { data: claimed, error: claimErr } = await supabase
    .from('beta_codes')
    .update({ used: true, used_by: userId, used_at: now })
    .eq('code', normalizedCode)
    .eq('used', false)            // only succeeds if still unused
    .select('code')
    .maybeSingle()

  if (claimErr || !claimed) {
    // Someone else used this code in the meantime — undo the account we made.
    await supabase.auth.admin.deleteUser(userId)
    return json({ error: 'Ten kod został właśnie wykorzystany. Poproś o nowy kod.' })
  }

  // ── 5. Create the full tester profile (incl. nick) ───────────────────────
  const { error: profileErr } = await supabase.from('user_profiles').insert({
    user_id:            userId,
    nick:               normalizedNick,
    is_tester:          true,
    tester_since:       now,
    beta_code_used:     normalizedCode,
    can_report_bugs:    true,
    can_see_debug_info: false,   // flip per-tester manually if needed
  })

  if (profileErr) {
    // Roll back so the code stays usable and no half-account lingers.
    await supabase.from('beta_codes')
      .update({ used: false, used_by: null, used_at: null })
      .eq('code', normalizedCode)
    await supabase.auth.admin.deleteUser(userId)

    // 23505 = unique_violation. The only unique constraints that can fire here
    // are the nick index (lower(nick)) — a parallel request grabbed the same
    // nick between our pre-check and this insert.
    if (profileErr.code === '23505') {
      return json({ error: 'Ten nick jest już zajęty. Wybierz inny.' })
    }
    return json({ error: 'Błąd tworzenia profilu — spróbuj ponownie.' })
  }

  // ── 6. Initialise user_progress (back-compat with existing sync code) ─────
  await supabase.from('user_progress').upsert(
    { user_id: userId, is_tester: true },
    { onConflict: 'user_id' },
  )

  return json({ ok: true, userId })
})
