// POST /api/ch-officers  { companyNumber }
// Fetches a company's officers (directors, secretaries, etc.) from
// Companies House. Does NOT write to the database itself — the app
// decides what to insert/update/mark resigned.

export async function onRequestPost(context) {
  const { request, env } = context

  let payload
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const { companyNumber } = payload
  if (!companyNumber) {
    return new Response('Missing companyNumber', { status: 400 })
  }

  if (!env.CH_API_KEY) {
    return new Response('Companies House API key is not configured (CH_API_KEY)', {
      status: 500,
    })
  }

  const auth = btoa(`${env.CH_API_KEY}:`)
  const chRes = await fetch(
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(
      companyNumber
    )}/officers?items_per_page=100`,
    { headers: { Authorization: `Basic ${auth}` } }
  )

  if (chRes.status === 404) {
    // Some companies (very new, or LLPs) can 404 on the officers endpoint
    // even though the company itself exists — treat as "no officers on
    // file" rather than an error.
    return new Response(JSON.stringify({ items: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (!chRes.ok) {
    const text = await chRes.text()
    return new Response(`Companies House officers lookup failed: ${text}`, { status: chRes.status })
  }

  const data = await chRes.json()

  const items = (data.items || []).map((item) => {
    // The appointment id sits at the end of the officer's "self" link,
    // e.g. "/company/06500244/appointments/AbC123xYz" — this is what
    // uniquely identifies this person's appointment to THIS company, so
    // we can tell them apart from someone with the same name and detect
    // when they've resigned on a later sync.
    const selfLink = item.links?.self || ''
    const appointmentId = selfLink.split('/appointments/')[1] || null

    const address = item.address
      ? [
          item.address.premises,
          item.address.address_line_1,
          item.address.address_line_2,
          item.address.locality,
          item.address.region,
          item.address.postal_code,
          item.address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : null

    return {
      appointmentId,
      fullName: item.name || null,
      officerRole: item.officer_role || null,
      appointedOn: item.appointed_on || null,
      resignedOn: item.resigned_on || null,
      nationality: item.nationality || null,
      occupation: item.occupation || null,
      dateOfBirthMonth: item.date_of_birth?.month ?? null,
      dateOfBirthYear: item.date_of_birth?.year ?? null,
      address,
    }
  })

  return new Response(JSON.stringify({ items }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
