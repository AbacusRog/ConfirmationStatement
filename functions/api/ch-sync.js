// POST /api/ch-sync  { companyNumber }
// Fetches a company's profile from Companies House and returns the fields
// this app cares about. Does NOT write to the database itself — the app
// saves whatever it wants from the response, so you can review before
// accepting a sync.

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
    `https://api.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
    { headers: { Authorization: `Basic ${auth}` } }
  )

  if (chRes.status === 404) {
    return new Response('No company found with that number at Companies House', { status: 404 })
  }
  if (!chRes.ok) {
    const text = await chRes.text()
    return new Response(`Companies House lookup failed: ${text}`, { status: chRes.status })
  }

  const data = await chRes.json()

  // Flatten Companies House's registered office address into the same
  // addr1/addr2/town/county/postcode shape this app stores on a client, so
  // it can be applied directly. "premises" (building name/number) often
  // isn't repeated in address_line_1, so it's prefixed on when present.
  const reg = data.registered_office_address
  const registeredOfficeAddress = reg
    ? {
        addr1: [reg.premises, reg.address_line_1].filter(Boolean).join(', ') || null,
        addr2: reg.address_line_2 || null,
        town: reg.locality || null,
        county: reg.region || null,
        postcode: reg.postal_code || null,
      }
    : null

  // next_accounts.period_end_on is the end date of the NEXT accounting
  // period — i.e. the year end you need to track and file for next.
  // last_accounts.made_up_to is the year end of the most recently filed
  // accounts, useful to confirm nothing's been missed.
  const result = {
    companyName: data.company_name || null,
    companyStatus: data.company_status || null,
    nextYearEndDate: data.accounts?.next_accounts?.period_end_on || null,
    chAccountsNextDue: data.accounts?.next_due || null, // CH's own due date — may differ from year_end+9mo for first-year accounts
    lastAccountsFiledDate: data.accounts?.last_accounts?.made_up_to || null,
    lastAccountsType: data.accounts?.last_accounts?.type || null,
    confirmationStatementNextDue: data.confirmation_statement?.next_due || null,
    // next_made_up_to is the period-end date for the confirmation statement
    // currently due — storing this as confirmation_statement_date lets our
    // own generated due_date column (period end + 14 days) line up with
    // Companies House's own next_due above.
    confirmationStatementNextMadeUpTo: data.confirmation_statement?.next_made_up_to || null,
    confirmationStatementLastMadeUpTo: data.confirmation_statement?.last_made_up_to || null,
    registeredOfficeAddress,
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}
