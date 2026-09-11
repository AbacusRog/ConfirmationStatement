// POST /api/send  { to, subject, body }
// Sends via Resend using the RESEND_API_KEY environment variable
// configured in the Cloudflare Pages project settings.

export async function onRequestPost(context) {
  const { request, env } = context

  let payload
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const { to, subject, body } = payload
  if (!to || !subject || !body) {
    return new Response('Missing to, subject, or body', { status: 400 })
  }

  const html = body
    .split('\n\n')
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n')

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.SEND_FROM_ADDRESS || 'Roger <roger@abacusconsultancy.co.uk>',
      to: [to],
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
