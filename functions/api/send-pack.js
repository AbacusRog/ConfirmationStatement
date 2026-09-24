// POST /api/send-pack
//   Authorization: Bearer <Supabase access token>
//   { to, subject, html, text, attachments: [{ filename, content /* base64 */ }] }
//
// Sends the Accounts Pack email via Resend with the PDFs attached and BCCs
// the firm. Unlike /api/send, this endpoint requires a signed-in user: it
// carries client documents, so it must not be callable by anyone who finds
// the URL. The token is checked against Supabase Auth.
//
// Environment (Cloudflare Pages -> Settings -> Environment variables):
//   RESEND_API_KEY, SEND_FROM_ADDRESS, BCC_ADDRESS (optional)
//   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (already set for the build;
//   Pages also exposes them to functions). SUPABASE_URL / SUPABASE_ANON_KEY
//   are accepted as alternatives.

const MAX_TOTAL_BYTES = 38 * 1024 * 1024 // Resend allows 40 MB per email, base64 included
const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+$/

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

async function verifyUser(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { ok: false, status: 401, error: 'Not signed in' }

  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anon) return { ok: false, status: 500, error: 'Server is missing the Supabase URL / anon key' }

  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } })
  if (!res.ok) return { ok: false, status: 401, error: 'Session expired. Sign in again.' }
  return { ok: true }
}

export async function onRequestPost(context) {
  const { request, env } = context

  const who = await verifyUser(request, env)
  if (!who.ok) return json(who.status, { error: who.error })

  if (!env.RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY is not set' })

  let payload
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const { to, subject, html, text, attachments } = payload || {}
  if (!to || !EMAIL_RE.test(String(to).trim())) return json(400, { error: 'A valid recipient email is required' })
  if (!subject || !html) return json(400, { error: 'Missing subject or html' })
  if (!Array.isArray(attachments) || attachments.length === 0) return json(400, { error: 'No attachments supplied' })

  let total = 0
  for (const a of attachments) {
    if (!a || typeof a.filename !== 'string' || typeof a.content !== 'string' || !a.filename) {
      return json(400, { error: 'Each attachment needs a filename and base64 content' })
    }
    total += a.content.length
  }
  if (total > MAX_TOTAL_BYTES) return json(413, { error: 'Attachments are too large to send in one email (limit about 28 MB of PDFs)' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.SEND_FROM_ADDRESS || 'Roger <roger@abacusconsultancy.co.uk>',
      to: [String(to).trim()],
      bcc: [env.BCC_ADDRESS || 'roger@abacusconsultancy.co.uk'],
      subject,
      html,
      text: text || undefined,
      attachments: attachments.map((a) => ({ filename: a.filename, content: a.content })),
    }),
  })

  if (!res.ok) return json(502, { error: `Resend error: ${await res.text()}` })
  return json(200, { ok: true })
}
