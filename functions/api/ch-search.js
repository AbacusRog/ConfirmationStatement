// GET /api/ch-search?q=company+name
// Searches Companies House for companies matching a name, so you can pick
// the right one and save its company number against a client. Keeps the
// CH_API_KEY server-side — the browser never sees it.

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const q = url.searchParams.get('q')

  if (!q || q.trim().length < 2) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!env.CH_API_KEY) {
    return new Response('Companies House API key is not configured (CH_API_KEY)', {
      status: 500,
    })
  }

  const chUrl = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(
    q.trim()
  )}&items_per_page=10`

  const auth = btoa(`${env.CH_API_KEY}:`)

  const chRes = await fetch(chUrl, {
    headers: { Authorization: `Basic ${auth}` },
  })

  if (!chRes.ok) {
    const text = await chRes.text()
    return new Response(`Companies House search failed: ${text}`, { status: chRes.status })
  }

  const data = await chRes.json()
  const items = (data.items || []).map((item) => ({
    company_number: item.company_number,
    title: item.title,
    company_status: item.company_status,
    date_of_creation: item.date_of_creation,
    address_snippet: item.address_snippet,
  }))

  return new Response(JSON.stringify({ items }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
