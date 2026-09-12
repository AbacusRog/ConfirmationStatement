// POST /api/send  { to, subject, body, companyName, statementDate, dueDate }
// Sends via Resend using the RESEND_API_KEY environment variable
// configured in the Cloudflare Pages project settings.
//
// statementDate / dueDate are ISO strings (YYYY-MM-DD). Both are optional —
// if omitted, the email is sent without the notice box.

const COLORS = {
  ink: '#1C2430',
  slate: '#425064',
  accent: '#2F5D6B',
  accentDark: '#204450',
  accentLight: '#E4EEF0',
  paper: '#FAF9F5',
  line: '#DEDBD1',
  red: { bg: '#FDECEC', border: '#F3C6C6', text: '#B3261E' },
  amber: { bg: '#FBF0DF', border: '#EAD3AA', text: '#9A5B12' },
  green: { bg: '#E4EEF0', border: '#C4D8DC', text: '#204450' },
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function urgency(dueIso) {
  const due = new Date(dueIso + 'T00:00:00')
  const now = new Date()
  const oneMonth = new Date(now)
  oneMonth.setMonth(oneMonth.getMonth() + 1)
  const twoMonths = new Date(now)
  twoMonths.setMonth(twoMonths.getMonth() + 2)
  if (due <= oneMonth) return 'red'
  if (due <= twoMonths) return 'amber'
  return 'green'
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildHtml({ body, companyName, statementDate, dueDate, logoUrl }) {
  const paragraphs = body
    .split('\n\n')
    .map(
      (para) =>
        `<p style="margin:0 0 16px 0; font-family:Georgia,'Times New Roman',serif; font-size:15px; line-height:1.65; color:${COLORS.ink};">${escapeHtml(
          para
        ).replace(/\n/g, '<br>')}</p>`
    )
    .join('\n')

  let noticeBlock = ''
  if (statementDate && dueDate) {
    const u = urgency(dueDate)
    const c = COLORS[u]
    noticeBlock = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background-color:${c.bg}; border:1px solid ${c.border}; border-radius:6px; padding:16px 18px;">
          <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; font-weight:bold; color:${COLORS.accentDark}; text-align:center; margin-bottom:8px;">
            CONFIRMATION STATEMENT
          </div>
          <div style="font-family:Georgia,'Times New Roman',serif; font-size:15px; color:${COLORS.ink}; line-height:1.5;">
            The confirmation statement for the period ending <strong>${formatDate(
              statementDate
            )}</strong> is due for <strong>${escapeHtml(companyName)}</strong>.
          </div>
          <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:bold; color:${c.text}; margin-top:8px;">
            File by ${formatDate(dueDate)}
          </div>
        </td>
      </tr>
    </table>`
  }

  // The watermark is a low-opacity PNG baked in ahead of time (rather than
  // relying on CSS opacity, which many email clients strip), shown as a
  // centred background image behind the letter content. Clients that don't
  // support background-image on table cells (older desktop Outlook) will
  // just show a plain white background instead — a safe fallback.
  const contentBg = logoUrl
    ? `background-color:#FFFFFF; background-image:url('${logoUrl}'); background-repeat:no-repeat; background-position:center 40px;`
    : `background-color:#FFFFFF;`

  // Desktop Outlook (Windows) ignores CSS background-image entirely and
  // needs Microsoft's own VML markup instead. This block is wrapped in
  // Outlook-only conditional comments, so every other client just skips
  // it and uses the CSS version above.
  const outlookVmlOpen = logoUrl
    ? `<!--[if gte mso 9]>
    <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;">
      <v:fill type="frame" src="${logoUrl}" color="#FFFFFF" />
      <v:textbox inset="0,0,0,0">
    <![endif]-->`
    : ''
  const outlookVmlClose = logoUrl
    ? `<!--[if gte mso 9]>
      </v:textbox>
    </v:rect>
    <![endif]-->`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background-color:${COLORS.paper};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.paper}; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border:1px solid ${COLORS.line}; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background-color:${COLORS.accent}; height:5px; line-height:5px; font-size:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <div style="font-family:Georgia,'Times New Roman',serif; font-size:19px; color:${COLORS.accentDark};">
                  Abacus Consultancy
                </div>
              </td>
            </tr>
            <tr>
              <td style="${contentBg} padding:12px 32px 32px 32px;">
                ${outlookVmlOpen}
                ${noticeBlock}
                ${paragraphs}
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;">
                  <tr>
                    <td style="background-color:${COLORS.accent}; border-radius:6px;">
                      <a href="https://square.link/u/UWw0m3xb" style="display:inline-block; padding:11px 22px; font-family:Arial,Helvetica,sans-serif; font-size:14px; font-weight:bold; color:#FFFFFF; text-decoration:none;">
                        Pay filing fee by card — £54.00
                      </a>
                    </td>
                  </tr>
                </table>
                ${outlookVmlClose}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px 32px; border-top:1px solid ${COLORS.line};">
                <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:${COLORS.slate};">
                  Abacus Consultancy · roger@abacusconsultancy.co.uk
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

export async function onRequestPost(context) {
  const { request, env } = context

  let payload
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const { to, subject, body, companyName, statementDate, dueDate } = payload
  if (!to || !subject || !body) {
    return new Response('Missing to, subject, or body', { status: 400 })
  }

  const logoUrl = env.SITE_URL ? `${env.SITE_URL.replace(/\/$/, '')}/logo-watermark.png` : ''

  const html = buildHtml({
    body,
    companyName: companyName || '',
    statementDate,
    dueDate,
    logoUrl,
  })

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SEND_FROM_ADDRESS || 'Roger <roger@abacusconsultancy.co.uk>',
      to: [to],
      bcc: [env.BCC_ADDRESS || 'roger@abacusconsultancy.co.uk'],
      subject,
      html,
      text: body,
    }),
  })

  if (!resendRes.ok) {
    const errText = await resendRes.text()
    return new Response(`Resend error: ${errText}`, { status: 502 })
  }

  return new Response('OK', { status: 200 })
}
