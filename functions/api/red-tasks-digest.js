// GET /api/red-tasks-digest?key=...
// Emails Roger a plain summary of every RED task (confirmation statement or
// accounts deadline due within a month) across all company clients — the
// same rows and same red/amber/green rule as the Tasks tab. Meant to be hit
// once a day by a scheduled job, not from the app's own UI.
//
// Reads directly from Supabase with the service-role key (never exposed to
// the browser — this only runs server-side in this function, same
// treatment as CH_API_KEY) so it isn't gated behind a logged-in session.
// Protected instead by a shared secret passed as ?key=, checked against the
// DIGEST_SECRET environment variable, so the URL can't be used by anyone
// who finds it.

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const COLORS = {
  ink: '#1C2430',
  slate: '#425064',
  accent: '#2F5D6B',
  accentDark: '#204450',
  paper: '#FAF9F5',
  line: '#DEDBD1',
  red: { bg: '#FDECEC', border: '#F3C6C6', text: '#B3261E' },
}

function buildHtml(rows) {
  const rowsHtml = rows
    .map(
      (r, i) => `
        <tr>
          <td style="padding:10px 12px; ${i > 0 ? `border-top:1px solid ${COLORS.line};` : ''} font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${COLORS.ink};">
            ${escapeHtml(r.clientName)}
          </td>
          <td style="padding:10px 12px; ${i > 0 ? `border-top:1px solid ${COLORS.line};` : ''} font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${COLORS.slate};">
            ${escapeHtml(r.companyNumber || '—')}
          </td>
          <td style="padding:10px 12px; ${i > 0 ? `border-top:1px solid ${COLORS.line};` : ''} font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${COLORS.slate};">
            ${escapeHtml(r.kind)}
          </td>
          <td style="padding:10px 12px; ${i > 0 ? `border-top:1px solid ${COLORS.line};` : ''} font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; color:${COLORS.red.text}; text-align:right; white-space:nowrap;">
            ${formatDate(r.dueDate)}
          </td>
        </tr>`
    )
    .join('\n')

  const body = rows.length
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.line}; border-radius:6px; overflow:hidden;">
      ${rowsHtml}
    </table>`
    : `<p style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:${COLORS.slate};">Nothing red today — every deadline is more than a month out.</p>`

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background-color:${COLORS.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border:1px solid ${COLORS.line}; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background-color:${COLORS.red.text}; height:5px; line-height:5px; font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; color:${COLORS.accentDark};">
                  RED tasks — due within a month
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${COLORS.slate}; margin-top:4px;">
                  ${rows.length} outstanding
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 32px 32px;">
                ${body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px; border-top:1px solid ${COLORS.line};">
                <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${COLORS.slate};">
                  Abacus Client Tasks · roger@abacusconsultancy.co.uk
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// Adds one calendar year to a "YYYY-MM-DD" date string, same rule as the
// Year End tab's own fallback when Companies House doesn't give us an
// explicit next year end.
function addYears(dateStr, years) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y + years, m - 1, d))
  return date.toISOString().slice(0, 10)
}

// Companies House lookup, inlined rather than calling the sibling
// /api/ch-sync route (Pages Functions don't give one function an easy way
// to invoke another internally) — same request as ch-sync.js, trimmed to
// just the fields this sweep needs.
async function lookupCompany(companyNumber, chApiKey) {
  const auth = btoa(`${chApiKey}:`)
  const res = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
    { headers: { Authorization: `Basic ${auth}` } }
  )
  if (!res.ok) return null
  const data = await res.json()
  return {
    companyStatus: data.company_status || null,
    nextYearEndDate: data.accounts?.next_accounts?.period_end_on || null,
    lastAccountsFiledDate: data.accounts?.last_accounts?.made_up_to || null,
    confirmationStatementNextMadeUpTo: data.confirmation_statement?.next_made_up_to || null,
  }
}

// Runs the same sweep as the Year End tab's "Check all" button (archive
// dissolved companies, refresh the confirmation statement date, roll the
// year end forward once accounts are filed for the current cycle) so the
// digest below is built from up-to-date data rather than whatever was last
// synced from the app's UI. due_date and accounts_due_date are Postgres
// generated columns (confirmation_statement_date + 14 days, year_end_date +
// 9 months), so updating the base columns here is enough for the very next
// SELECT to pick up fresh due dates.
async function syncWithCompaniesHouse(clients, supabaseUrl, serviceKey, chApiKey) {
  const base = supabaseUrl.replace(/\/$/, '')
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }
  const patch = (id, body) =>
    fetch(`${base}/rest/v1/cs_mailer_clients?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    })
  const insertHistory = (body) =>
    fetch(`${base}/rest/v1/cs_mailer_year_end_history`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

  for (const client of clients) {
    if (!client.company_number) continue
    try {
      const data = await lookupCompany(client.company_number, chApiKey)
      if (!data) continue
      const status = (data.companyStatus || '').toLowerCase()

      if (status === 'dissolved') {
        await patch(client.id, {
          archived: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'dissolved',
          company_status: status,
          accounts_last_synced_at: new Date().toISOString(),
        })
        client.archived = true
        continue
      }

      const updates = { accounts_last_synced_at: new Date().toISOString() }
      if (status) updates.company_status = status
      if (
        data.confirmationStatementNextMadeUpTo &&
        data.confirmationStatementNextMadeUpTo !== client.confirmation_statement_date
      ) {
        updates.confirmation_statement_date = data.confirmationStatementNextMadeUpTo
        client.confirmation_statement_date = data.confirmationStatementNextMadeUpTo
      }

      if (
        client.year_end_date &&
        data.lastAccountsFiledDate &&
        data.lastAccountsFiledDate >= client.year_end_date &&
        data.lastAccountsFiledDate !== client.accounts_last_filed_ch
      ) {
        await insertHistory({
          client_id: client.id,
          year_end_date: client.year_end_date,
          accounts_due_date: client.accounts_due_date,
        })
        updates.year_end_date = data.nextYearEndDate || addYears(client.year_end_date, 1)
        updates.accounts_last_filed_ch = data.lastAccountsFiledDate
        updates.year_end_completed_at = null
        client.year_end_date = updates.year_end_date
      }

      await patch(client.id, updates)
    } catch {
      // one client's Companies House check failing shouldn't stop the rest
      // of the sweep or the digest that follows
    }
  }
}

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  if (!env.DIGEST_SECRET || url.searchParams.get('key') !== env.DIGEST_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  // The project already has VITE_SUPABASE_URL set (it's the public project
  // URL, baked into the browser bundle, so there's nothing extra to add) —
  // fall back to that if a separate, non-VITE SUPABASE_URL isn't set.
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY environment variables',
      { status: 500 }
    )
  }
  if (!env.RESEND_API_KEY) {
    return new Response('Missing RESEND_API_KEY environment variable', { status: 500 })
  }

  const sbRes = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/cs_mailer_clients?select=id,client_name,company_number,due_date,accounts_due_date,confirmation_statement_date,year_end_date,accounts_last_filed_ch,accounts_due_date&archived=eq.false&client_kind=eq.company`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  )
  if (!sbRes.ok) {
    const text = await sbRes.text()
    return new Response(`Supabase query failed: ${text}`, { status: 502 })
  }
  let clients = await sbRes.json()

  // Run a fresh Companies House check before building the digest, same as
  // the "Check all" sweep in the Year End tab, so a statement or accounts
  // filing done outside this app doesn't still show up as red. Skipped
  // (not failed) if CH_API_KEY isn't configured, so the digest still goes
  // out with whatever data is already on file.
  if (env.CH_API_KEY) {
    await syncWithCompaniesHouse(clients, supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, env.CH_API_KEY)
    // due_date/accounts_due_date are generated columns, so re-read rather
    // than recompute them by hand — this also naturally drops anything the
    // sweep just archived (dissolved companies), since the filter below
    // still applies.
    const freshRes = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/rest/v1/cs_mailer_clients?select=id,client_name,company_number,due_date,accounts_due_date&archived=eq.false&client_kind=eq.company`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    )
    if (freshRes.ok) clients = await freshRes.json()
  }

  // Same red/amber/green rule as the Tasks tab: red = due within a month.
  const now = new Date()
  const oneMonth = new Date(now)
  oneMonth.setMonth(oneMonth.getMonth() + 1)

  const rows = []
  for (const c of clients) {
    if (c.due_date) {
      const due = new Date(c.due_date + 'T00:00:00')
      if (due <= oneMonth) {
        rows.push({
          clientName: c.client_name,
          companyNumber: c.company_number,
          kind: 'Confirmation statement',
          dueDate: c.due_date,
        })
      }
    }
    if (c.accounts_due_date) {
      const due = new Date(c.accounts_due_date + 'T00:00:00')
      if (due <= oneMonth) {
        rows.push({
          clientName: c.client_name,
          companyNumber: c.company_number,
          kind: 'Accounts',
          dueDate: c.accounts_due_date,
        })
      }
    }
  }
  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  const html = buildHtml(rows)
  const to = env.DIGEST_TO_ADDRESS || 'roger@abacusconsultancy.co.uk'
  const today = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SEND_FROM_ADDRESS || 'Abacus Client Tasks <roger@abacusconsultancy.co.uk>',
      to: [to],
      subject: `${rows.length} RED task${rows.length === 1 ? '' : 's'} — ${today}`,
      html,
      text: rows.length
        ? rows
            .map((r) => `${r.clientName} (${r.companyNumber || '—'}) — ${r.kind} due ${r.dueDate}`)
            .join('\n')
        : 'Nothing red today.',
    }),
  })

  if (!resendRes.ok) {
    const errText = await resendRes.text()
    return new Response(`Resend error: ${errText}`, { status: 502 })
  }

  return new Response(`OK — sent ${rows.length} red task(s) to ${to}`, { status: 200 })
}
