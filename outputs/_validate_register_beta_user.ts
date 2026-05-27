// validation copy of register-beta-user/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
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

  const { data: claimed, error: claimErr } = await supabase
    .from('beta_codes')
    .update({ used: true, used_by: userId, used_at: now })
    .eq('code', normalizedCode)
    .eq('used', false)
    .select('code')
    .maybeSingle()

  if (claimErr || !claimed) {
    await supabase.auth.admin.deleteUser(userId)
    return json({ error: 'Ten kod został właśnie wykorzystany. Poproś o nowy kod.' })
  }

  const { error: profileErr } = await supabase.from('user_profiles').insert({
    user_id:            userId,
    nick:               normalizedNick,
    email:              normalizedEmail,
    auth_provider:      'email',
    is_tester:          true,
    tester_since:       now,
    beta_code_used:     normalizedCode,
    can_report_bugs:    true,
    can_see_debug_info: false,
  })

  if (profileErr) {
    await supabase.from('beta_codes')
      .update({ used: false, used_by: null, used_at: null })
      .eq('code', normalizedCode)
    await supabase.auth.admin.deleteUser(userId)

    if (profileErr.code === '23505') {
      return json({ error: 'Ten nick jest już zajęty. Wybierz inny.' })
    }
    return json({ error: 'Błąd tworzenia profilu — spróbuj ponownie.' })
  }

  await supabase.from('user_progress').upsert(
    { user_id: userId, is_tester: true },
    { onConflict: 'user_id' },
  )

  return json({ ok: true, userId })
})
