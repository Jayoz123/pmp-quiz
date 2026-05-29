// Structural validation for supabase/functions/approve-beta-application/index.ts.
//
// Run with:
//   node outputs/_validate_approve_beta_application.ts

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const functionPath = path.join(root, 'supabase', 'functions', 'approve-beta-application', 'index.ts')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(fs.existsSync(functionPath), `Missing function file: ${functionPath}`)

const src = fs.readFileSync(functionPath, 'utf8')

const requiredSnippets = [
  ['Deno.serve', 'serves as a Supabase Edge Function'],
  ["req.method !== 'POST'", 'rejects non-POST requests'],
  ['Authorization', 'reads the caller authorization header'],
  ['auth.getUser(token)', 'verifies the authenticated caller token'],
  ['beta_admins', 'checks the admin allow-list'],
  ['applicationId', 'requires an applicationId payload field'],
  ['BREVO_API_KEY', 'reads the Brevo API key from Edge Function secrets'],
  ['BREVO_SENDER_EMAIL', 'reads the Brevo sender email from secrets'],
  ['BREVO_SENDER_NAME', 'reads the Brevo sender name from secrets'],
  ['https://api.brevo.com/v3/smtp/email', 'uses the Brevo transactional email endpoint'],
  ['assigned_to_email', 'marks a beta code as assigned before registration'],
  ['assigned_application_id', 'links the assigned code to the application'],
  ["application.status === 'sent'", 'does not resend an invitation that is already sent'],
  ['status: \'sent\'', 'marks successful applications as sent'],
  ['status: \'failed\'', 'marks failed applications as failed'],
  [".eq('used', false)", 'only assigns unused beta codes'],
  [".is('assigned_to_email', null)", 'only assigns unassigned beta codes'],
]

for (const [snippet, purpose] of requiredSnippets) {
  assert(src.includes(snippet), `Expected source to include ${JSON.stringify(snippet)}: ${purpose}`)
}

console.log('approve-beta-application structural validation passed')
