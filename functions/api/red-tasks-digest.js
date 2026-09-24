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
    `${supabaseUrl.replace(/\/$/, '')}/rest/v1/cs_mailer_clients?select=id,client_name,company_number,due_date,accounts_due_date&archived=eq.false&client_kind=eq.company`,
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
  const clients = await sbRes.json()

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
