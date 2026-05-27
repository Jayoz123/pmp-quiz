// supabase/functions/reset-beta-password/index.ts
//
// Password reset WITHOUT Supabase email auth (no SMTP configured for the beta).
//
// The tester proves their identity with the pair they were given at invite time:
//   email + the ORIGINAL beta code they registered with + a new password (×2,
//   the second copy is checked client-side). We accept the reset only if a
//   user_profiles row exists for that email whose beta_code_used == the code.
//   The code is NOT re-consumed (it's already used=true after registration —
//   that's expected and fine).
//
// Conscious trade-off: if the (email, code) pair leaks together, someone could
// reset the password. Acceptable for a closed beta; real email-reset is backlog
// once SMTP is wired up.
//
// Anti-enumeration: "email not found" and "wrong code for this email" return the
// SAME vague message, so an attacker can't probe which emails are registered
// (same principle as resolve-nick).
//
// Deploy:  supabase functions deploy reset-beta-password --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Same beta-code shape as register-beta-user / the client: PMP-XXXX-XXXX-ish,
// upper-cased + trimmed. We only enforce a loose length/charset here; the real
// guard is the exact match against beta_code_used.
const CODE_RE = /^[A-Z0-9-]{12,}$/

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

  let payload: { email?: string; code?: string; newPassword?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidłowe żądanie.' }, 400)
  }

  const { email, code, newPassword } = payload

  // ── 0. Validate input ──────────────────────────────────────────────────────
  if (!email || !code || !newPassword) {
    return json({ error: 'Brak emaila, kodu lub nowego hasła.' }, 400)
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: 'Podaj prawidłowy adres email.' }, 400)
  }
  if (newPassword.length < 6) {
    return json({ error: 'Hasło musi mieć co najmniej 6 znaków.' }, 400)
  }
  const normalizedCode  = code.toUpperCase().trim()
  if (!CODE_RE.test(normalizedCode)) {
    // Malformed code → same vague message as a wrong code (anti-enumeration).
    return json({ error: 'Nieprawidłowy email lub kod.' })
  }
  const normalizedEmail = email.trim().toLowerCase()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 1. Look up the profile by email and verify the original beta code ────────
  // Reads the denormalized email column (migration 14). Case-insensitive match
  // on lower(email) (matches idx_user_profiles_email).
  const { data: profile, error: profErr } = await supabase
    .from('user_profiles')
    .select('user_id, beta_code_used')
    .ilike('email', normalizedEmail)
    .maybeSingle()

  // Uniform message whether the email is unknown OR the code doesn't match.
  if (profErr || !profile || !profile.user_id) {
    return json({ error: 'Nieprawidłowy email lub kod.' })
  }
  const storedCode = String(profile.beta_code_used || '').toUpperCase().trim()
  if (!storedCode || storedCode !== normalizedCode) {
    return json({ error: 'Nieprawidłowy email lub kod.' })
  }

  // ── 2. Set the new password via the admin API ────────────────────────────────
  const { error: updErr } = await supabase.auth.admin.updateUserById(
    profile.user_id,
    { password: newPassword },
  )
  if (updErr) {
    return json({ error: 'Nie udało się zmienić hasła — spróbuj ponownie.' })
  }

  // ── 3. Best-effort: invalidate the device bind so the next login re-registers ─
  // Forces the multi-device guard to re-claim the device on next sign-in (and
  // any other device that was active loses its bind). Non-critical — ignore
  // errors (e.g. no row yet, table absent in some envs).
  try {
    await supabase.from('user_sessions').delete().eq('user_id', profile.user_id)
  } catch (_e) { /* non-critical */ }

  return json({ ok: true })
})
