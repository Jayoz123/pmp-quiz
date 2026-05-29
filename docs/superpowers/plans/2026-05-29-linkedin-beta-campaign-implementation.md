# LinkedIn Beta Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a controlled beta acquisition flow where LinkedIn visitors can request access, an admin can approve them, and Brevo sends one unused beta code by email.

**Architecture:** Keep the current beta-code registration flow as the source of truth. Add a `beta_applications` table for leads, extend `beta_codes` with assignment metadata, then add one Edge Function for approval/email sending and small UI surfaces for the landing page and admin queue.

**Tech Stack:** Supabase Postgres, Supabase Edge Functions on Deno, Brevo transactional email API, existing static app under `pmp-quiz-app/`, Cloudflare deployment.

---

### Task 1: Database Schema For Beta Applications

**Files:**
- Create: `pmp-quiz-app/migrations/27_beta_applications.sql`

- [ ] **Step 1: Write SQL verification before migration**

Use the migration itself as the test target and verify it defines:

```powershell
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'CREATE TABLE IF NOT EXISTS beta_applications'
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'assigned_to_email'
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'ENABLE ROW LEVEL SECURITY'
```

Expected before implementation: all commands fail because the file does not exist.

- [ ] **Step 2: Add the migration**

Create `pmp-quiz-app/migrations/27_beta_applications.sql` with an idempotent migration that adds `beta_applications`, assignment fields on `beta_codes`, RLS, and helper indexes.

- [ ] **Step 3: Run SQL verification**

Run:

```powershell
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'CREATE TABLE IF NOT EXISTS beta_applications'
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'assigned_to_email'
Select-String -Path 'pmp-quiz-app/migrations/27_beta_applications.sql' -Pattern 'ENABLE ROW LEVEL SECURITY'
```

Expected: each command prints at least one matching line.

- [ ] **Step 4: Commit**

```powershell
git add pmp-quiz-app/migrations/27_beta_applications.sql
git commit -m "feat: add beta applications schema"
```

### Task 2: Approval Edge Function

**Files:**
- Create: `supabase/functions/approve-beta-application/index.ts`
- Test: `outputs/_validate_approve_beta_application.ts`

- [ ] **Step 1: Write failing validation for request rules**

Create a local validation harness that checks the approval function rejects missing `applicationId`, refuses non-admin calls, and requires Brevo secrets. Expected before implementation: validation fails because the function does not exist.

- [ ] **Step 2: Implement minimal approval function**

The function must:

- accept `POST`,
- require an authenticated admin,
- atomically select one unassigned unused beta code,
- mark the application as sent,
- call `https://api.brevo.com/v3/smtp/email`,
- return `{ ok: true, code }` for admin diagnostics.

- [ ] **Step 3: Run validation**

Run the validation harness and confirm the tested request rules pass.

- [ ] **Step 4: Commit**

```powershell
git add supabase/functions/approve-beta-application/index.ts outputs/_validate_approve_beta_application.ts
git commit -m "feat: approve beta applications with Brevo"
```

### Task 3: Beta Landing Page

**Files:**
- Modify: `pmp-quiz-app/index.html`
- Modify: `pmp-quiz-app/app.js`
- Modify: `pmp-quiz-app/styles.css`
- Test: existing app smoke test plus browser check

- [ ] **Step 1: Add failing UI route check**

Add or extend a test so `#/beta` renders a beta access request form with an email field and submit action. Expected before implementation: test fails because the route does not exist.

- [ ] **Step 2: Implement the landing route**

Add a compact beta page with product summary, tester expectations, and form fields: email, name/nick, PMP stage, LinkedIn URL, consent checkbox.

- [ ] **Step 3: Connect submission**

Submission inserts a `beta_applications` row or calls a lightweight Edge Function if direct insert is blocked by RLS.

- [ ] **Step 4: Verify in browser**

Open the local app, navigate to `#/beta`, submit invalid and valid form states, and confirm no layout overlap on mobile width.

- [ ] **Step 5: Commit**

```powershell
git add pmp-quiz-app/index.html pmp-quiz-app/app.js pmp-quiz-app/styles.css pmp-quiz-app/tests/test_logic.js
git commit -m "feat: add beta access request page"
```

### Task 4: Admin Queue

**Files:**
- Modify: `pmp-quiz-app/app.js`
- Modify: `pmp-quiz-app/styles.css`
- Test: existing app smoke test plus browser check

- [ ] **Step 1: Add failing admin route check**

Add a test that expects an admin-only queue route to render applications and expose approve/reject actions. Expected before implementation: test fails because the route does not exist.

- [ ] **Step 2: Implement admin guard**

Use authenticated Supabase user email plus an `admin_users` table or configured admin list to restrict access.

- [ ] **Step 3: Implement queue actions**

List new applications, call `approve-beta-application`, and show sent/rejected/failed status.

- [ ] **Step 4: Verify manually**

Create a test application, approve it, and confirm a Brevo email is sent to the target address.

- [ ] **Step 5: Commit**

```powershell
git add pmp-quiz-app/app.js pmp-quiz-app/styles.css pmp-quiz-app/tests/test_logic.js
git commit -m "feat: add beta applications admin queue"
```

### Task 5: LinkedIn Launch Assets

**Files:**
- Create: `docs/linkedin-beta-campaign.md`

- [ ] **Step 1: Draft launch copy**

Write five LinkedIn posts: announcement, problem, product walkthrough, recruitment, and follow-up.

- [ ] **Step 2: Add operational checklist**

Include daily review cadence, acceptance criteria for testers, and when to pause invites.

- [ ] **Step 3: Commit**

```powershell
git add docs/linkedin-beta-campaign.md
git commit -m "docs: add linkedin beta launch assets"
```

## Self-Review

This plan covers the accepted phase 1 scope: Brevo setup, schema, approval/email sending, landing page, admin queue, and LinkedIn copy. It keeps full paid subscriptions, public self-service onboarding, and Supabase Auth email activation outside phase 1.
