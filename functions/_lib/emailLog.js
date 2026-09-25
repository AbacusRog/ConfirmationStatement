// Shared by /api/send, /api/send-pack and /api/scheduled-packs. Writes one
// row to cs_mailer_email_log — the permanent "who/when/what" record of
// every client email this app has actually sent. Filenames/folders
// starting with "_" aren't routed by Cloudflare Pages Functions, so this
// file is safe to import without becoming its own endpoint.
//
// Always uses the service-role key, never the caller's own session token:
// /api/send has no signed-in user to write as at all, and even where one
// exists (/api/send-pack, /api/scheduled-packs) this is the server
// recording its own action after the fact, not a user-initiated write —
// the table's RLS policy only allows reading from a signed-in session,
// nothing writes to it from the browser.
//
// Best-effort by design: a logging failure is never worth turning a
// successful send into an error response over, so every caller just
// awaits this and carries on regardless of the outcome.
export async function logSentEmail(env, { clientId, clientName, toEmail, subject, kind, sentAt }) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/cs_mailer_email_log`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        client_id: clientId || null,
        client_name: clientName || null,
        to_email: toEmail,
        subject,
        kind,
        ...(sentAt ? { sent_at: sentAt } : {}),
      }),
    })
  } catch {
    // logging is a nice-to-have, never worth failing the send over
  }
}
