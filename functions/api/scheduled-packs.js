// /api/scheduled-packs — the list behind the "Scheduled emails" panel on
// the Accounts Pack tab.
//
//   GET     -> list every Accounts Pack email still waiting to send
//   PATCH   { id, scheduledAt } -> move one to a new date/time
//   DELETE  { id }              -> cancel one
//
// "id" throughout is our own cs_mailer_scheduled_packs row id, not Resend's
// email id (resend_id) — the browser never needs to know Resend's id.
//
// Resend is what's actually holding and sending these emails; this table
// is only our own record of what's outstanding so it can be listed. Every
// GET checks each row's real status with Resend and quietly drops (from
// both the response and the table) anything Resend no longer shows as
// scheduled — which is how a row disappears from the list once the email
// has actually gone out.
//
// Requires a signed-in user, same as /api/send-pack (this lists client
// email addresses and subjects). Talks to Supabase using the caller's own
// access token rather than the service-role key, so the existing
// "authenticated users only" row-level-security policy on
// cs_mailer_scheduled_packs applies exactly as it does from the browser.

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

function supabaseUrl(env) {
  return (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
}
function anonKey(env) {
  return env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
}

async function verifyUser(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return { ok: false, status: 401, error: 'Not signed in' }

  const url = supabaseUrl(env)
  const anon = anonKey(env)
  if (!url || !anon) return { ok: false, status: 500, error: 'Server is missing the Supabase URL / anon key' }

  const res = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: anon } })
  if (!res.ok) return { ok: false, status: 401, error: 'Session expired. Sign in again.' }
  return { ok: true, token, supabaseUrl: url, anonKey: anon }
}

function sbHeaders(who, extra) {
  return { apikey: who.anonKey, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json', ...extra }
}

async function resendGet(id, env) {
  const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  })
  if (!res.ok) return null // gone, or never existed — either way, not still scheduled
  return res.json().catch(() => null)
}

async function deleteRow(who, id) {
  await fetch(`${who.supabaseUrl}/rest/v1/cs_mailer_scheduled_packs?id=eq.${id}`, {
    method: 'DELETE',
    headers: sbHeaders(who),
  }).catch(() => {})
}

export async function onRequestGet(context) {
  const { request, env } = context
  const who = await verifyUser(request, env)
  if (!who.ok) return json(who.status, { error: who.error })
  if (!env.RESEND_API_KEY) return json(500, { error: 'RESEND_API_KEY is not set' })

  const sbRes = await fetch(
    `${who.supabaseUrl}/rest/v1/cs_mailer_scheduled_packs?select=id,resend_id,client_name,to_email,subject,scheduled_at&order=scheduled_at.asc`,
    { headers: sbHeaders(who) }
  )
  if (!sbRes.ok) return json(502, { error: `Supabase query failed: ${await sbRes.text()}` })
  const rows = await sbRes.json()

  const pending = []
  for (const row of rows) {
    const data = await resendGet(row.resend_id, env)
    // Resend's own last_event is literally the string "scheduled" while an
    // email is still waiting to go out (not null/empty as you might
    // expect) — anything else (sent, delivered, bounced, canceled, or the
    // id no longer existing at all) means it's not scheduled any more, so
    // it drops off the list.
    const stillScheduled = !!data && (data.last_event === 'scheduled' || !data.last_event)
    if (stillScheduled) {
      pending.push({
        id: row.id,
        clientName: row.client_name,
        toEmail: row.to_email,
        subject: row.subject,
        scheduledAt: data.scheduled_at || row.scheduled_at,
      })
    } else {
      await deleteRow(who, row.id)
    }
  }

  return json(200, { scheduled: pending })
}

export async function onRequestPatch(context) {
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
  const { id, scheduledAt } = payload || {}
  if (!id || !scheduledAt) return json(400, { error: 'Missing id or scheduledAt' })

  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime())) return json(400, { error: 'scheduledAt is not a valid date' })
  if (when.getTime() <= Date.now()) return json(400, { error: 'scheduledAt must be in the future' })
  if (when.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
    return json(400, { error: 'Resend can only schedule an email up to 30 days ahead' })
  }
  const iso = when.toISOString()

  const rowRes = await fetch(`${who.supabaseUrl}/rest/v1/cs_mailer_scheduled_packs?id=eq.${id}&select=resend_id`, {
    headers: sbHeaders(who),
  })
  if (!rowRes.ok) return json(502, { error: `Supabase query failed: ${await rowRes.text()}` })
  const [row] = await rowRes.json()
  if (!row) return json(404, { error: 'That scheduled email is no longer on the list — it may have already been sent.' })

  const resendRes = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.resend_id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_at: iso }),
  })
  if (!resendRes.ok) {
    // Most likely reason: it's already gone out and Resend won't move it.
    await deleteRow(who, id)
    return json(409, { error: 'Could not reschedule — it may have already been sent. It has been removed from the list.' })
  }

  const updRes = await fetch(`${who.supabaseUrl}/rest/v1/cs_mailer_scheduled_packs?id=eq.${id}`, {
    method: 'PATCH',
    headers: sbHeaders(who, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ scheduled_at: iso }),
  })
  if (!updRes.ok) return json(502, { error: `Supabase update failed: ${await updRes.text()}` })

  return json(200, { ok: true, scheduledAt: iso })
}

export async function onRequestDelete(context) {
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
  const { id } = payload || {}
  if (!id) return json(400, { error: 'Missing id' })

  const rowRes = await fetch(`${who.supabaseUrl}/rest/v1/cs_mailer_scheduled_packs?id=eq.${id}&select=resend_id`, {
    headers: sbHeaders(who),
  })
  if (!rowRes.ok) return json(502, { error: `Supabase query failed: ${await rowRes.text()}` })
  const [row] = await rowRes.json()
  if (row) {
    // A cancel on an id that's already sent (or already cancelled) just
    // fails — either way the row is stale, so it's removed regardless.
    await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.resend_id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
    }).catch(() => {})
  }
  await deleteRow(who, id)

  return json(200, { ok: true })
}
