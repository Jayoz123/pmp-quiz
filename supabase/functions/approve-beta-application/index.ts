// supabase/functions/approve-beta-application/index.ts
//
// Admin-only approval flow for beta applications:
//   1. verify caller token
//   2. verify caller is present in public.beta_admins
//   3. assign one unused + unassigned beta code
//   4. send the invitation through Brevo
//   5. mark the application as sent, or failed if Brevo rejects the email
//
// Deploy:  supabase functions deploy approve-beta-application --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
//          BREVO_API_KEY, BREVO_SENDER_EMAIL, and BREVO_SENDER_NAME must be set.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email'

type BetaApplication = {
  id: string
  email: string
  name: string | null
  status: 'new' | 'approved' | 'sent' | 'rejected' | 'failed'
  assigned_code: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const inviteEmailHtml = (name: string | null, code: string) => {
  const greeting = name?.trim() ? `Czesc ${escapeHtml(name.trim())},` : 'Czesc,'
  const safeCode = escapeHtml(code)
  return `<!doctype html>
<html>
  <body style="font-family:Arial,sans-serif;line-height:1.55;color:#172033">
    <p>${greeting}</p>
    <p>Przydzielilem Ci dostep testowy do PM Academy, aplikacji do przygotowania do egzaminu PMP.</p>
    <p>
      Link do aplikacji:<br>
      <a href="https://pmp.nord-star.pl">https://pmp.nord-star.pl</a>
    </p>
    <p>Twoj jednorazowy kod beta:</p>
    <p style="font-size:18px;font-weight:700;letter-spacing:0.04em">${safeCode}</p>
    <p>Kod sluzy do zalozenia jednego konta. Przy rejestracji wpisz email, haslo, nick i powyzszy kod.</p>
    <p>Najbardziej zalezy mi na feedbacku po kilku quizach: czy pytania sa zrozumiale, czy statystyki pomagaja i czy aplikacja jest wygodna na telefonie.</p>
    <p>Dzieki za pomoc,<br>PM Academy</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="font-size:12px;color:#64748b;line-height:1.5">
      Otrzymujesz tego maila, bo zapisales sie do bety PM Academy na
      <a href="https://pmp.nord-star.pl" style="color:#64748b">pmp.nord-star.pl</a>.
      Jesli to pomylka albo nie chcesz dalszych wiadomosci, odpisz na tego maila z trescia "wypisz".
    </p>
    <p style="font-size:12px;color:#64748b">PM Academy &middot; nord-star.pl</p>
  </body>
</html>`
}

const inviteEmailText = (name: string | null, code: string) => {
  const greeting = name?.trim() ? `Czesc ${name.trim()},` : 'Czesc,'
  return `${greeting}

Przydzielilem Ci dostep testowy do PM Academy, aplikacji do przygotowania do egzaminu PMP.

Link do aplikacji:
https://pmp.nord-star.pl

Twoj jednorazowy kod beta:
${code}

Kod sluzy do zalozenia jednego konta. Przy rejestracji wpisz email, haslo, nick i powyzszy kod.

Najbardziej zalezy mi na feedbacku po kilku quizach: czy pytania sa zrozumiale, czy statystyki pomagaja i czy aplikacja jest wygodna na telefonie.

Dzieki za pomoc,
PM Academy

--
Otrzymujesz tego maila, bo zapisales sie do bety PM Academy na pmp.nord-star.pl.
Jesli to pomylka albo nie chcesz dalszych wiadomosci, odpisz na tego maila z trescia "wypisz".
PM Academy - nord-star.pl`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return json({ error: 'Brak autoryzacji.' }, 401)
  }

  let payload: { applicationId?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidlowe zadanie.' }, 400)
  }

  const applicationId = String(payload.applicationId || '').trim()
  if (!applicationId) {
    return json({ error: 'Brak identyfikatora zgloszenia.' }, 400)
  }

  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') || 'PM Academy'
  if (!brevoApiKey || !senderEmail) {
    return json({ error: 'Brak konfiguracji Brevo.' }, 500)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData?.user) {
    return json({ error: 'Sesja wygasla - zaloguj sie ponownie.' }, 401)
  }
  const adminUserId = userData.user.id

  const { data: admin, error: adminErr } = await supabase
    .from('beta_admins')
    .select('user_id')
    .eq('user_id', adminUserId)
    .maybeSingle()

  if (adminErr) {
    return json({ error: 'Blad weryfikacji uprawnien admina.' }, 500)
  }
  if (!admin) {
    return json({ error: 'Brak uprawnien admina.' }, 403)
  }

  const { data: application, error: appErr } = await supabase
    .from('beta_applications')
    .select('id, email, name, status, assigned_code')
    .eq('id', applicationId)
    .maybeSingle<BetaApplication>()

  if (appErr || !application) {
    return json({ error: 'Nie znaleziono zgloszenia.' }, 404)
  }
  if (application.status === 'sent' && application.assigned_code) {
    return json({
      ok: true,
      applicationId: application.id,
      code: application.assigned_code,
      email: application.email.trim().toLowerCase(),
      status: 'sent',
      alreadySent: true,
    })
  }
  if (application.status === 'rejected') {
    return json({ error: 'To zgloszenie zostalo odrzucone.' }, 409)
  }

  const now = new Date().toISOString()
  let code = application.assigned_code

  if (!code) {
    const { data: candidate, error: candidateErr } = await supabase
      .from('beta_codes')
      .select('code')
      .eq('used', false)
      .is('assigned_to_email', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (candidateErr) {
      return json({ error: 'Blad pobierania wolnego kodu.' }, 500)
    }
    if (!candidate?.code) {
      return json({ error: 'Brak wolnych kodow beta.' }, 409)
    }

    const { data: assigned, error: assignErr } = await supabase
      .from('beta_codes')
      .update({
        assigned_to_email: application.email.trim().toLowerCase(),
        assigned_application_id: application.id,
        assigned_at: now,
      })
      .eq('code', candidate.code)
      .eq('used', false)
      .is('assigned_to_email', null)
      .select('code')
      .maybeSingle()

    if (assignErr || !assigned?.code) {
      return json({ error: 'Ten kod zostal wlasnie przydzielony. Sprobuj ponownie.' }, 409)
    }

    code = assigned.code

    const { error: updateAppErr } = await supabase
      .from('beta_applications')
      .update({
        status: 'approved',
        assigned_code: code,
        approved_at: now,
        failed_at: null,
        last_error: null,
        updated_at: now,
      })
      .eq('id', application.id)

    if (updateAppErr) {
      await supabase
        .from('beta_codes')
        .update({
          assigned_to_email: null,
          assigned_application_id: null,
          assigned_at: null,
        })
        .eq('code', code)
        .eq('used', false)
      return json({ error: 'Nie udalo sie zaktualizowac zgloszenia.' }, 500)
    }
  }

  const normalizedEmail = application.email.trim().toLowerCase()
  const brevoRes = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'api-key': brevoApiKey,
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: normalizedEmail, name: application.name || undefined }],
      replyTo: { email: senderEmail, name: senderName },
      subject: 'Dostep testowy do PM Academy',
      htmlContent: inviteEmailHtml(application.name, code),
      textContent: inviteEmailText(application.name, code),
      headers: {
        'List-Unsubscribe': `<mailto:${senderEmail}?subject=unsubscribe>`,
      },
    }),
  })

  if (!brevoRes.ok) {
    const body = await brevoRes.text().catch(() => '')
    const lastError = `Brevo ${brevoRes.status}: ${body.slice(0, 500)}`
    await supabase
      .from('beta_applications')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        last_error: lastError,
        updated_at: new Date().toISOString(),
      })
      .eq('id', application.id)
    return json({ error: 'Brevo odrzucilo wysylke maila.', details: lastError }, 502)
  }

  const sentAt = new Date().toISOString()
  await supabase
    .from('beta_codes')
    .update({ sent_at: sentAt })
    .eq('code', code)

  const { error: sentErr } = await supabase
    .from('beta_applications')
    .update({
      status: 'sent',
      sent_at: sentAt,
      failed_at: null,
      last_error: null,
      updated_at: sentAt,
    })
    .eq('id', application.id)

  if (sentErr) {
    return json({ error: 'Mail zostal wyslany, ale nie udalo sie zapisac statusu.' }, 500)
  }

  return json({ ok: true, applicationId: application.id, code, email: normalizedEmail, status: 'sent' })
})
