# Confirmation Statement Mailer

Search for a client company, check/fill in their email and name, review the
templated reminder, and send it — without leaving the app or touching Outlook.

## 1. Set up Supabase

1. Create a new Supabase project (or use an existing one — see note below).
2. Open the SQL Editor and run everything in `supabase/schema.sql`. This
   creates the `cs_mailer_clients` table.
3. Go to **Table Editor → cs_mailer_clients → Insert → Import data from CSV**,
   and upload `clients_import.csv` (346 clients from your spreadsheet — 121
   of them have no email yet; the app will flag those so you can fill them
   in as you go).
4. Go to **Project Settings → API** and copy the **Project URL** and
   **anon public key** — you'll need these in step 3 below.

> **Using an existing Supabase project (e.g. the payslip mailer's)?** The
> table is named `cs_mailer_clients`, not `clients`, specifically so it
> won't collide with a `clients` table another app already created in that
> same project. If you ever see `create table if not exists` silently do
> nothing followed by a "column does not exist" error, it means something
> in that project already owns the table name you're trying to use.

## 2. Set up Resend (email sending)

If you already have Resend set up for the payslip mailer, you can reuse the
same account and verified domain — just create a new API key for this app
(or reuse the existing one).

1. In Resend, confirm `abacusconsultancy.co.uk` is a verified sending domain.
2. Create an API key.

## 3. Deploy to Cloudflare Pages

1. Upload this folder to a new GitHub repo (same web-upload workflow you
   already use).
2. In Cloudflare Pages, create a new project connected to that repo.
   - Build command: `npm run build`
   - Build output directory: `dist`
3. In the Pages project's **Settings → Environment variables**, add:
   - `VITE_SUPABASE_URL` — from Supabase step 1.4
   - `VITE_SUPABASE_ANON_KEY` — from Supabase step 1.4
   - `RESEND_API_KEY` — from Resend step 2
   - `SEND_FROM_ADDRESS` — e.g. `Roger <roger@abacusconsultancy.co.uk>`
     (optional — defaults to this if not set)
   - `BCC_ADDRESS` — e.g. `roger@abacusconsultancy.co.uk` (optional —
     every email sent also BCCs this address by default; set it if you
     want a different inbox copied instead)
   - `SITE_URL` — the URL this app ends up deployed at once you know it,
     e.g. `https://cs-mailer-abc.pages.dev` or your custom domain, with no
     trailing slash. This is what makes the logo watermark load in emails —
     see step 5 below.
4. Redeploy.

## 4. Set up your login

The app is now login-gated, the same as your other internal tools — no
one can see client data or send emails without signing in.

1. In Supabase, go to **Authentication → Providers** and confirm **Email**
   is enabled (it is by default).
2. Go to **Authentication → Users → Add user**, and create an account for
   yourself with your email and a password of your choice. Tick "Auto
   Confirm User" if it's offered, so you don't need to click an email
   confirmation link.
3. Optional but recommended: go to **Authentication → Settings** and turn
   **off** "Allow new users to sign up" — the app has no sign-up form
   anyway, but this closes the door at the database level too, in case
   anyone ever finds the Supabase URL directly.
4. Open the deployed app and sign in with that email and password.

There's no "forgot password" flow built in — if you ever need to reset it,
do that from the Supabase dashboard directly (Authentication → Users →
select your user → reset password).

## 5. Point the watermark at your deployed URL

The confirmation statement emails now include your logo as a faint
watermark behind the message. It's served as a static file from the app
itself (`public/logo-watermark.png`), so it needs to know its own URL:

1. Deploy the app once (steps 1–4 above) and note the URL Cloudflare gives
   it, e.g. `https://cs-mailer-abc.pages.dev` (or your custom domain if
   you attach one).
2. Set the `SITE_URL` environment variable (step 3 above) to that URL, with
   no trailing slash, and redeploy.
3. Send yourself a test email to confirm the watermark shows up — some
   email clients (older desktop Outlook in particular) don't support
   background images on emails and will just show a plain white
   background instead, which is an acceptable fallback.

## Using it day to day

1. A Companies House confirmation statement email lands in your inbox as
   normal.
2. Open the app, start typing the company name, and select it from the
   dropdown.
3. If the email, name, or confirmation statement date is missing, fill it
   in — it's saved back to the client record automatically so you only
   ever do this once per client. The filing due date (14 days after the
   statement date) is calculated automatically.
4. Check the message (subject and body are both editable if you need to
   tweak anything for that client), then click **Send to client**. The
   email includes a highlighted notice box with the company name and both
   dates, colour-coded red/amber/green by how soon it's due — same
   convention as the company register.
5. The app records when you last sent this client a reminder, so you can
   see at a glance who's been chased this cycle.

## Updating the confirmation statement dates in bulk

When you have a fresh export with confirmation statement dates for lots of
clients at once (rather than adding them one at a time in the app):

1. Re-run `supabase/schema.sql` first if you haven't already — it now adds
   `confirmation_statement_date` and a `due_date` column that's calculated
   automatically.
2. Run `supabase/load_confirmation_dates.sql` in the SQL Editor — it walks
   you through creating a staging table, importing your CSV into it, and
   copying the dates across by matching client code.

## Notes

- The `cs_mailer_clients` table has RLS enabled, requiring a signed-in
  session — the anon key alone (without logging in) can't read or write
  anything, matching your other internal apps.
- The email is sent from `roger@abacusconsultancy.co.uk` via Resend, so it
  should land looking like a normal email from you, not a no-reply address.
- Every send is BCC'd to you automatically.
- If you type a forename into a client that didn't have one, the "Hi ..."
  greeting in the message updates itself automatically — as long as you
  haven't already hand-edited the message. Once you start editing the
  message yourself, it stops auto-updating so it never overwrites your
  changes.
- Use **+ New client** (next to the search box) to add a company that
  isn't in the list yet, or click **Edit** next to any search result to
  correct their details — no need to go into Supabase for either.
- The confirmation statement notice inside the email is centred, bold,
  and the same size as the "Abacus Consultancy" heading above it.
