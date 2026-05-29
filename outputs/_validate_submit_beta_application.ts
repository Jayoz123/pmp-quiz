// Structural validation for supabase/functions/submit-beta-application/index.ts.
//
// Run with:
//   node outputs/_validate_submit_beta_application.ts

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const functionPath = path.join(root, 'supabase', 'functions', 'submit-beta-application', 'index.ts')

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
  ['beta_applications', 'writes beta applications'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'uses service role server-side only'],
  ['honeypot', 'rejects bot honeypot submissions'],
  ['consent', 'requires contact consent'],
  ['email.trim().toLowerCase()', 'normalizes email before insert'],
  ['status: \'new\'', 'creates applications in the new state'],
  ['pmp_stage', 'stores the applicant PMP preparation stage'],
  ['linkedin_url', 'stores the optional LinkedIn profile URL'],
  ['23505', 'handles duplicate email submissions idempotently'],
]

for (const [snippet, purpose] of requiredSnippets) {
  assert(src.includes(snippet), `Expected source to include ${JSON.stringify(snippet)}: ${purpose}`)
}

console.log('submit-beta-application structural validation passed')
