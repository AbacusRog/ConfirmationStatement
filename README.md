# Abacus Client Tasks

Two tools sharing one client list:

- **Confirmation Statements** — search a client, check their details,
  review the templated Companies House reminder, and send it.
- **Year End** — every client listed by accounts filing deadline, with a
  traffic light for how close it is, one-click sync against Companies
  House, and a "mark completed" action that rolls the year end forward to
  next year automatically.

## 1. Set up Supabase

1. Create a new Supabase project (or use an existing one — see note below).
2. Open the SQL Editor and run everything in `supabase/schema.sql`. This
   creates the `cs_mailer_clients` table plus the Year End columns and
   history table. **This file is safe to re-run** any time you update the
   app — every statement is written so re-running it just adds whatever's
   new without touching your data.
3. If this is a brand new project (not already running the confirmation
   statement mailer), go to **Table Editor → cs_mailer_clients → Insert →
   Import data from CSV**, and upload `clients_import.csv`.
4. Go to **Project Settings → API** and copy the **Project URL** and
   **anon public key** — you'll need these in step 4 below.

> **Using an existing Supabase project?** The table is named
> `cs_mailer_clients`, not `clients`, specifically so it won't collide with
> a `clients` table another app already created in that same project.

## 2. Set up Resend (email sending)

1. In Resend, confirm `abacusconsultancy.co.uk` is a verified sending domain.
2. Create an API key.

## 3. Get a Companies House API key

Only needed for the Year End tab's sync feature — the rest of the app
works without it.

1. Go to https://developer.company-information.service.gov.uk/ and sign in
   or register.
2. Create a new application (any name, e.g. "Abacus Client Tasks"), choose
   **Live** (not sandbox/test), and add a REST API key to it.
3. Copy the key — you'll add it as `CH_API_KEY` in step 4.

This is a free tier with a generous rate limit (600 requests per 5 minutes)
— plenty for checking clients one at a time.

## 4. Deploy to Cloudflare Pages

1. Upload this folder to a GitHub repo (or update your existing one).
2. In Cloudflare Pages, create a project connected to that repo (or use
   your existing one).
   - Build command: `npm run build`
   - Build output directory: `dist`
3. In the Pages project's **Settings → Environment variables**, add:
   - `VITE_SUPABASE_URL` — from Supabase step 1.4
   - `VITE_SUPABASE_ANON_KEY` — from Supabase step 1.4
   - `RESEND_API_KEY` — from Resend step 2
   - `SEND_FROM_ADDRESS` — e.g. `Roger <roger@abacusconsultancy.co.uk>`
     (optional — defaults to this if not set)
   - `BCC_ADDRESS` — e.g. `roger@abacusconsultancy.co.uk` (optional —
     every email sent also BCCs this address by default)
   - `SITE_URL` — this app's own URL once deployed, e.g.
     `https://cs.abacusapps.us`, no trailing slash (needed for the logo
     image in emails)
   - `CH_API_KEY` — from step 3, as a **Secret**, not plain text (needed
     for Year End syncing)
4. Redeploy.

## 5. Set up your login

1. In Supabase, go to **Authentication → Providers** and confirm **Email**
   is enabled.
2. Go to **Authentication → Users → Add user**, create an account for
   yourself, and tick "Auto Confirm User" if offered.
3. Optional: go to **Authentication → Settings** and turn off "Allow new
   users to sign up".
4. Open the deployed app and sign in.

## Using the Confirmation Statements tab

1. A Companies House confirmation statement email lands in your inbox.
2. Open the app, start typing the company name, and select it.
3. Fill in anything missing (email, name, confirmation statement date) —
   it saves back to the client record so you only do it once. The filing
   due date (14 days later) calculates itself.
4. Check the message, then click **Send to client** (available both above
   and below the message).

## Using the Year End tab

1. Every client is listed, sorted soonest-due first, with a coloured dot:
   red (due within a month), amber (within two months), green (not due
   soon), or grey (no year end date on file yet).
2. **Link a client to Companies House**: click "Not linked — find on
   Companies House" (or "Re-link" if you need to fix a wrong match),
   search by name, and pick the right company from the results. As soon
   as it's linked, the app checks Companies House and shows you what it
   found.
3. **Sync**: click Sync on any linked client at any time to re-check
   Companies House. It shows you the next year end date, Companies
   House's own accounts due date (worth comparing — first-year accounts
   sometimes get 21 months instead of the usual 9, so this can catch that
   automatically), and the last filed date — then you choose whether to
   **Apply** those to the client or dismiss them.
4. **Year end date**: click it to edit directly if you'd rather set it by
   hand than sync. The accounts due date (9 months later) calculates
   itself.
5. **Mark completed**: once you've filed a client's accounts, click "Mark
   completed → roll to next year". This logs the completed cycle,
   advances the year end date by a year for next time, and shows an
   **Undo** link in case you clicked it by mistake.

## Bulk-loading data

If you have a spreadsheet with confirmation statement dates, company
numbers, or year end dates for many clients at once (rather than adding
them one at a time in the app):

- `supabase/load_confirmation_dates.sql` — confirmation statement dates by
  client code.
- `supabase/load_year_end_data.sql` — company numbers and/or year end
  dates by client code.

Both use the same staging-table pattern: run the file's numbered SQL
steps one at a time in the SQL Editor, importing your CSV into the
staging table via Table Editor in between.

## Notes

- The `cs_mailer_clients` table has RLS enabled, requiring a signed-in
  session — the anon key alone can't read or write anything.
- Every confirmation statement email is BCC'd to you automatically, and
  shows your logo in the header (via `SITE_URL`).
- There's a **Send to client** button both above and below the message.
- Use **+ New client** to add a company that isn't in the list yet, or
  **Edit** next to any search result to correct their details (including
  the new company number / year end fields) — no need to go into Supabase
  for either.
- The Year End tab's accounts due date is always calculated as year end +
  9 months, per UK filing rules for most private companies. Companies
  House's own reported due date can differ for a company's very first set
  of accounts (which get up to 21 months) — the sync panel flags this
  when it happens so you're not caught out.
- `CH_API_KEY` is used server-side only (in the Cloudflare Pages
  Functions) — it's never sent to the browser.
