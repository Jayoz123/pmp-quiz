// supabase/functions/submit-beta-application/index.ts
//
// Public beta access request endpoint. The landing page calls this function
// instead of writing directly to beta_applications, so the table can keep RLS
// locked down while the server validates input and filters trivial bots.
//
// Deploy:  supabase functions deploy submit-beta-application --no-verify-jwt
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Payload = {
  email?: string
  name?: string
  linkedin_url?: string
  pmp_stage?: string
  consent?: boolean
  honeypot?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const cleanText = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Nieprawidlowe zgloszenie.' }, 400)
  }

  const honeypot = String(payload.honeypot || '').trim()
  if (honeypot) {
    return json({ ok: true })
  }

  const email = String(payload.email || '')
  const normalizedEmail = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return json({ error: 'Podaj prawidlowy adres email.' }, 400)
  }

  const consent = payload.consent === true
  if (!consent) {
    return json({ error: 'Zgoda na kontakt w sprawie bety jest wymagana.' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase.from('beta_applications').insert({
    email: normalizedEmail,
    name: cleanText(payload.name, 120),
    linkedin_url: cleanText(payload.linkedin_url, 300),
    pmp_stage: cleanText(payload.pmp_stage, 120),
    consent,
    status: 'new',
  })

  if (error) {
    if (error.code === '23505') {
      return json({ ok: true, duplicate: true })
    }
    return json({ error: 'Nie udalo sie zapisac zgloszenia. Sprobuj ponownie.' }, 500)
  }

  return json({ ok: true })
})
