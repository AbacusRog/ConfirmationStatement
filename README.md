# Abacus Client Tasks

Four tools sharing one client list:

- **Confirmation Statements** — search a client, check their details,
  review the templated Companies House reminder, and send it.
- **Year End** — every client listed by accounts filing deadline, with a
  traffic light for how close it is, one-click sync against Companies
  House, and a "mark completed" action that rolls the year end forward to
  next year automatically.
- **Tasks** — a compact, combined list of every upcoming deadline (company
  name, number, and due date only) across both confirmation statements and
  accounts, for a quick scan.
- **Documents** — engagement letters and AML periodic reviews, for a
  company, its directors (synced from Companies House), and any other
  individual client. This used to be its own separate app
  ("Client Document Generator") — see the **Merging in Documents**
  section below if you're upgrading from that.

Clients can be added by searching Companies House directly, and archived
(rather than deleted) once they're no longer active — archived clients are
hidden from all four tabs but can always be found and restored. Every
client is either a **company** or an **individual** (set when you add
them) — companies are the ones tracked on the Confirmation Statements,
Year End and Tasks tabs; individuals exist purely so the Documents tab has
somewhere to keep personal-tax clients and anyone else who needs a letter
but isn't a company in their own right.

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
     for Year End syncing, and also used by the RED-tasks email digest
     below to refresh each client from Companies House before it sends)
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase step 1.4 (the **service
     role** key, not the anon key — copy it as a **Secret**), needed only
     for the RED-tasks email digest below. Double-check the variable name
     is exactly `SUPABASE_SERVICE_ROLE_KEY` — Cloudflare's table truncates
     long names visually, so it's easy to save it one character short.
     (`VITE_SUPABASE_URL`, already set from step 1.4, is reused for this
     too — no separate URL variable needed.)
   - `DIGEST_SECRET` — any long random string you make up, as a **Secret**
     (needed for the RED-tasks email digest below)
   - `DIGEST_TO_ADDRESS` — e.g. `roger@abacusconsultancy.co.uk` (optional —
     defaults to this if not set)
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

## Using the Tasks tab

A single, dense list of every client with an outstanding confirmation
statement or accounts deadline, showing just the company name, its
Companies House number, and the due date — with the same traffic-light dot
as the other tabs. A client with both types of deadline outstanding gets a
row for each. Use the **All / Confirmation statements / Accounts** filter
above the list to narrow it to one type. Archived clients never appear
here.

The search box matches on company name **or director name** — type a
director's name to see every company they're currently a director of, each
as its own row. Director data comes from the same Companies House sync
used on the Year End tab and the Documents tab (resigned directors are
excluded), so a company needs its directors synced at least once before its
directors are searchable here. When a row matched on director rather than
company name, the row shows which director(s) matched underneath the
company name.

## Using the Accounts Pack tab

Turns a finished set of accounts into a client pack and emails it.

1. **Client**: search as usual. If there is no email address, type it in
   (it is saved to the client when you send) or use **Edit** in the list.
2. **Your documents**: drop in the Statutory Accounts, the Self Assessment
   return (SA100 with SA302 and payment summary), the Invoice and the
   Covering Letter. These are attached to the email untouched. The tab reads
   them in your browser; nothing is uploaded anywhere until you send.
3. **Corporation Tax**: the exact amount, payment reference and due date.
   These are filled in from the covering letter if you upload it. The due
   date otherwise defaults to year end + 9 months + 1 day.
4. **Email options**: tick which Money Laundering documents you need
   (Passport, Driving Licence, Current Utility Bill or Mobile Phone Bill,
   Personal Bank Statement; nothing ticked leaves the section out). The
   SmartVault message is on by default. The sense-check page in the Tax
   Payments sheet is on by default, and **the client can read it**, so turn
   it off if you would rather not send it.
5. **Build the documents**: creates *Accounts 2026.pdf* (a readable copy of
   the statutory accounts with linked contents, bookmarks and a financial
   review; every word of the statutory accounts is carried across and the
   tab tells you if any are not) and *<Name>_<year>_Tax_Payments.pdf*.
6. **Review and send**: shows the email exactly as the client will see it,
   the six attachments, and asks for a final confirmation. Choose **Send
   now** or **Send later** — for a scheduled send, pick a date and time (up
   to 30 days ahead) and Resend holds the email and sends it then. Either
   way it's sent through Resend with a BCC to you.

   Anything scheduled shows up in a **Scheduled emails** panel at the top
   of this tab, where you can change the date/time or cancel it — see
   below.

Notes:

- Scheduled emails are listed, edited and cancelled through
  `/api/scheduled-packs` (also requires sign-in), which talks to both
  Resend (to actually move or cancel the send) and a small
  `cs_mailer_scheduled_packs` table (just this app's own record of what's
  outstanding, so it can be listed — Resend is what's actually holding and
  sending each one). A row drops off the list on its own once Resend shows
  the email as no longer scheduled, i.e. once it's actually gone out — no
  separate cleanup needed. Needs the `supabase/schema.sql` update applied
  (adds that one table) if you're updating an existing install.

- Sending uses `/api/send-pack`, which **requires you to be signed in**
  (it checks your Supabase session). It needs `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` to be set in Cloudflare Pages (already there from
  step 4), plus `RESEND_API_KEY`, `SEND_FROM_ADDRESS` and optionally
  `BCC_ADDRESS`. The email logo comes from the site's own address, or from
  `VITE_SITE_URL` if you set it.
- The PDF readers were written against your practice software's layout and
  tested on the Zummo / Child And Family Advisory Service set. Check the
  first few packs from other clients against the originals; the
  "sense-checks" and financial review are rule-based and use only figures
  found in the documents.
- The older `/api/send` endpoint (confirmation statements) does not check
  who is calling it.
- The total attachment size is limited to about 26 MB.

## Daily RED tasks email

`/api/red-tasks-digest` sends you an email listing every RED task (the
same rows the Tasks tab would show with no filter applied — confirmation
statements and accounts due within a month, across all company clients).
It's a GET endpoint meant to be hit once a day by a scheduler rather than
clicked in the app, and it's protected by a secret so the URL alone isn't
enough to trigger it:

```
https://<your-site>/api/red-tasks-digest?key=<DIGEST_SECRET>
```

Before building the list, it runs the same Companies House check as the
Year End tab's "Check all" button for every company client (archiving any
now-dissolved company, refreshing the confirmation statement date, and
rolling the year end forward once accounts have been filed for the
current cycle), so the digest reflects up-to-date dates rather than
whatever was last synced from the app's UI. This needs `CH_API_KEY` to be
set (see step 4 above); if it isn't, the digest still sends using
whatever data is already on file. One client's Companies House check
failing doesn't stop the rest of the sweep or the email.

Visit that URL (with your real domain and the `DIGEST_SECRET` value you
set in Cloudflare) once yourself to check it sends before relying on it —
it emails whoever's in `DIGEST_TO_ADDRESS` (or `roger@abacusconsultancy.co.uk`
if that's not set) and returns a plain-text "OK — sent N red task(s)" so
you can tell it worked without waiting for the email.

To actually get it every morning, something needs to call that URL on a
schedule — Cloudflare Pages Functions don't run on their own timer, so
this needs a small scheduler on the outside (a Cloudflare Worker Cron
Trigger, or any scheduled task set up to fetch that URL each morning).

## Adding clients

Two ways to add a client, both on the Confirmation Statements tab:

- **+ From Companies House** — search by company name, pick the right
  result, and a client is created immediately with its name and company
  number, and (best-effort) its next year end date and current status
  pulled straight from Companies House. It then opens for editing so you
  can add the email address and anything else.
- **+ New client** — the manual form, for clients not yet on Companies
  House or where you'd rather type everything in yourself.

## Archiving clients

Use this for clients you no longer act for, rather than deleting them —
nothing is ever permanently removed.

- **Archive one**: open a client via **Edit** on the Confirmation
  Statements tab and click **Archive client** at the bottom of the form.
- **Archived clients**: click this link (on the Confirmation Statements or
  Year End tab) to see everything archived, with a **Restore** button for
  each.
- **Check all against Companies House**: on the Year End tab, this button
  checks every client with a company number, all in one pass:
  - anything reported as exactly "dissolved" is archived automatically —
    any other unusual status (liquidation, administration, receivership,
    etc.) is only flagged for you to look at, since those can still have
    live filing obligations, so they're never archived automatically;
  - the confirmation statement date is refreshed from Companies House's
    own records, so a statement that's already been filed (including
    ones filed outside this app) stops showing as due;
  - if Companies House's last-filed accounts date has caught up to the
    year end you have on file, that means the accounts for the current
    cycle are already filed — it's logged to history exactly like a
    manual "Mark completed" and the year end rolls forward automatically,
    so it drops off as due.
  A summary banner shows what changed once it's done. Unlike "Mark
  completed" on a single client, this bulk pass doesn't offer an Undo —
  if something rolled forward that shouldn't have, correct the year end
  date by hand via Edit.

## Directors

On the Year End tab, click **Directors** under any client with a company
number to see who's on file, and **Sync from Companies House** to pull the
current officers list — name, role, appointment date, and (once
resigned) their resignation date. Re-syncing updates existing directors
rather than duplicating them, matched on Companies House's own appointment
id for that person at that company.

Directors are stored in their own table, keyed on the **company number**
rather than the client record — so once the engagement letter tool is
merged into this app, the same director data (and any future app that
knows a company number) can use it without a separate import.

## Using the Documents tab

Generates the same engagement letter and AML periodic review PDFs as
before, now against this app's own client list instead of a separate one.

1. **Company** — search for and pick the company. If it has a company
   number, its active directors (synced from Companies House — see
   Directors, above) are loaded automatically as a checklist; untick any
   who shouldn't get a letter this time. Click **Sync from Companies
   House** here if the list looks out of date.
2. Click **Sync registered office address** under the company's name to
   pull its current registered office straight from Companies House —
   shown for you to check before it's applied with **Use this address**,
   the same review-then-apply pattern as everywhere else in this app.
3. Companies House's officer address is sometimes a service address
   rather than where the director actually wants post — click **Edit
   address** next to any director to override what prints on their
   letter. This is stored separately from the synced Companies House data,
   so it isn't lost or overwritten by the next sync.
4. **Individuals** — search for and add any other individual client (a
   personal tax client, a spouse, anyone not picked up as a Companies
   House officer). Use **+ New client** in either section to add someone
   who isn't in the list yet.
5. Tick **Engagement letter** and/or **AML periodic review** (the AML
   review only ever generates for the company, never for directors or
   individuals), set the reviewer name, and **Generate & download**.
   Every selected person/company gets their own PDF(s), downloaded
   straight to your computer.

A client's postal address (used on both documents) is set via **Edit** on
that client — see the "Postal address" section of the client form, which
applies to both companies and individuals.

## Merging in Documents

If you're upgrading from the old standalone "Client Document Generator"
app, its client data lived in `doc_generator_clients` in the same
Supabase project. Run `supabase/migrate_doc_generator.sql` once (after
`schema.sql`) to bring it across:

- Clients that already exist here (matched by client code) get their
  address, type and contact number filled in from the old table — nothing
  already on file is overwritten.
- Clients that only existed in the old table (mostly individuals) are
  added as new clients here, kind set from their old "type" field.
- The old app's "link this director to this company" table is **not**
  migrated — that manual step is retired in favour of syncing directors
  straight from Companies House (see Directors, above). Re-sync each
  company once, and its real officer list takes over.

Once you've checked everything looks right in the app, the migration
script's final comment has the two `drop table` statements to retire the
old `doc_generator_*` tables — run those (or just leave the old app
deployed a little longer as a fallback) whenever you're ready.

### Importing straight from the "All Clients Contact Info" export

If you'd rather import directly from that spreadsheet than rely on the
old app's table still being around, `supabase/load_all_clients_contact_info.sql`
does the same job in one paste-and-run — the spreadsheet's rows are
embedded in the file itself, so there's no separate CSV upload step. It's
matched on client code exactly like the migration script (fills blanks on
clients you already have, adds new individuals — mostly personal tax
clients — for the rest), and this is what makes them appear in the
Documents tab's individual picker. Regenerate this file (ask, and attach
a fresh export) any time the spreadsheet is updated — it isn't kept in
sync automatically.

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
  the company number / year end fields) — no need to go into Supabase for
  either. While editing a client with a company number, **Check against
  Companies House** looks up that one company on demand and lets you
  apply its confirmation statement date, year end date and status
  straight into the form before you save.
- The Year End tab's accounts due date is always calculated as year end +
  9 months, per UK filing rules for most private companies. Companies
  House's own reported due date can differ for a company's very first set
  of accounts (which get up to 21 months) — the sync panel flags this
  when it happens so you're not caught out.
- `CH_API_KEY` is used server-side only (in the Cloudflare Pages
  Functions) — it's never sent to the browser.
- The Documents tab's PDF generation runs entirely in your browser (no new
  server-side dependency or environment variable) — the letter templates
  and the fillable AML PDF ship inside the app itself.
