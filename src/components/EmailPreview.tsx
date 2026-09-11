import { useEffect, useRef, useState } from 'react'
import { supabase, Client } from '../supabaseClient'

function buildBody(companyName: string, forename: string) {
  const greeting = forename.trim() ? `Hi ${forename.trim()}` : 'Hi'
  return `${greeting}

We have ${companyName}'s Confirmation Statement (Annual Return) form to complete.

The Confirmation Statement is confirmation of general information about a company's directors and secretary, registered office address, shareholders and share capital. It is an annual statutory document filed at Companies House which all companies must complete. There is further information as set out below in Companies House email.

The Annual Return can be filed electronically. The statutory filing fee is £50.00. This is new increased fee from 1st May 2024: https://changestoukcompanylaw.campaign.gov.uk/changes-to-companies-house-fees/

To file electronically please either transfer the £54.00 to my account, or if you choose to pay by credit/debit card, please click on the link below. There is an additional £4.00 to cover my administration of this.

Paypal address:- roger@abacusconsultancy.co.uk

Debit/Credit Card:- Filing Payment Charge: https://square.link/u/UWw0m3xb

As the company director, you're legally responsible for filing your confirmation statements on time - even if your company is dormant or not trading. You're still legally responsible even if you use an agent or accountant to do this for you.

If you have any queries, then please do not hesitate to contact me.

Regards

Roger`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Matches the red/amber/green convention used in the company register:
// red = due within 1 month, amber = due within 2 months, green = beyond that.
function urgency(dueDateStr: string): 'red' | 'amber' | 'green' {
  const due = new Date(dueDateStr + 'T00:00:00')
  const now = new Date()
  const oneMonth = new Date(now)
  oneMonth.setMonth(oneMonth.getMonth() + 1)
  const twoMonths = new Date(now)
  twoMonths.setMonth(twoMonths.getMonth() + 2)
  if (due <= oneMonth) return 'red'
  if (due <= twoMonths) return 'amber'
  return 'green'
}

const urgencyStyles = {
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  amber: { bg: 'bg-warnbg', border: 'border-warn/40', text: 'text-warn' },
  green: { bg: 'bg-accent-light', border: 'border-accent/30', text: 'text-accent-dark' },
}

export default function EmailPreview({
  client,
  onSent,
}: {
  client: Client
  onSent: () => void
}) {
  const [email, setEmail] = useState(client.email ?? '')
  const [forename, setForename] = useState(client.forename ?? '')
  const [surname, setSurname] = useState(client.surname ?? '')
  const [statementDate, setStatementDate] = useState(client.confirmation_statement_date ?? '')
  const [subject, setSubject] = useState(
    `Confirmation Statement – ${client.client_name}`
  )
  const [body, setBody] = useState(buildBody(client.client_name, client.forename ?? ''))
  const lastAutoBodyRef = useRef(body)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Reset the draft whenever a different client is selected
  useEffect(() => {
    setEmail(client.email ?? '')
    setForename(client.forename ?? '')
    setSurname(client.surname ?? '')
    setStatementDate(client.confirmation_statement_date ?? '')
    setSubject(`Confirmation Statement – ${client.client_name}`)
    const freshBody = buildBody(client.client_name, client.forename ?? '')
    setBody(freshBody)
    lastAutoBodyRef.current = freshBody
    setStatus('idle')
  }, [client.id])

  // If the greeting name is filled in (or changed) and the message hasn't
  // been hand-edited since the last auto-fill, refresh the "Hi ..." line
  // so you don't have to update it yourself.
  useEffect(() => {
    const autoBody = buildBody(client.client_name, forename)
    setBody((prev) => (prev === lastAutoBodyRef.current ? autoBody : prev))
    lastAutoBodyRef.current = autoBody
  }, [forename, client.client_name])

  const dueDate = statementDate ? addDays(statementDate, 14) : ''
  const missingEmail = !email.trim()
  const missingDate = !statementDate
  const canSend = !missingEmail && !missingDate
  const nameChanged =
    forename !== (client.forename ?? '') || surname !== (client.surname ?? '')
  const dateChanged = statementDate !== (client.confirmation_statement_date ?? '')
  const style = dueDate ? urgencyStyles[urgency(dueDate)] : urgencyStyles.green

  async function handleSend() {
    if (!canSend) return
    setSending(true)
    setErrorMsg('')
    try {
      // Save any name/email/date additions back to the client record first
      const updates: Record<string, string | null> = {}
      if (email !== (client.email ?? '')) updates.email = email.trim()
      if (forename !== (client.forename ?? '')) updates.forename = forename.trim() || null
      if (surname !== (client.surname ?? '')) updates.surname = surname.trim() || null
      if (dateChanged) updates.confirmation_statement_date = statementDate || null

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('cs_mailer_clients')
          .update(updates)
          .eq('id', client.id)
        if (updateError) throw updateError
      }

      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email.trim(),
          subject,
          body,
          companyName: client.client_name,
          statementDate,
          dueDate,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Send failed')
      }

      const { error: logError } = await supabase
        .from('cs_mailer_clients')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', client.id)
      if (logError) throw logError

      setStatus('sent')
      onSent()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="rounded-md border border-line bg-white p-4">
        <div className="font-serif text-lg text-ink mb-3">{client.client_name}</div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-650 mb-1">
              Client email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent transition-colors ${
                missingEmail ? 'border-warn bg-warnbg' : 'border-line focus:border-accent'
              }`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Forename
              </label>
              <input
                value={forename}
                onChange={(e) => setForename(e.target.value)}
                placeholder="—"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-650 mb-1">
                Surname
              </label>
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="—"
                className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-650 mb-1">
            Confirmation statement period ends
          </label>
          <input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            className={`rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent transition-colors ${
              missingDate ? 'border-warn bg-warnbg' : 'border-line focus:border-accent'
            }`}
          />
          {dueDate && (
            <span className="ml-3 text-xs text-slate-650">
              Filing due by {formatDate(dueDate)}
            </span>
          )}
        </div>

        {missingEmail && (
          <p className="mt-2 text-xs text-warn">
            No email on file for this client yet — add one above to send.
          </p>
        )}
        {missingDate && (
          <p className="mt-2 text-xs text-warn">
            No confirmation statement date on file — add the period-end date
            from the Companies House email to send.
          </p>
        )}
        {(nameChanged || dateChanged) && !missingEmail && !missingDate && (
          <p className="mt-2 text-xs text-accent-dark">
            Changes above will be saved to this client's record when you send.
          </p>
        )}
      </div>

      {dueDate && (
        <div className={`rounded-md border p-4 ${style.bg} ${style.border}`}>
          <div className="text-xs font-medium text-slate-650 uppercase tracking-wide mb-1">
            Notice included in the email
          </div>
          <div className="text-[15px] text-ink">
            Confirmation statement for the period ending{' '}
            <strong>{formatDate(statementDate)}</strong> is due for{' '}
            <strong>{client.client_name}</strong>.
          </div>
          <div className={`mt-1 text-[15px] font-medium ${style.text}`}>
            File by {formatDate(dueDate)}
          </div>
        </div>
      )}

      <div className="rounded-md border border-line bg-white p-4">
        <label className="block text-xs font-medium text-slate-650 mb-1">
          Subject
        </label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-md border border-line px-3 py-2 text-sm mb-4 outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
        />
        <label className="block text-xs font-medium text-slate-650 mb-1">
          Message
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="w-full rounded-md border border-line px-3 py-2.5 text-[14px] leading-relaxed font-serif outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSend}
          disabled={sending || !canSend}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {sending ? 'Sending…' : 'Send to client'}
        </button>
        {status === 'sent' && (
          <span className="text-sm text-accent-dark">
            Sent to {email}.
          </span>
        )}
        {status === 'error' && (
          <span className="text-sm text-warn">Couldn't send: {errorMsg}</span>
        )}
        {client.last_sent_at && status === 'idle' && (
          <span className="text-sm text-slate-650">
            Last sent {new Date(client.last_sent_at).toLocaleDateString('en-GB')}
          </span>
        )}
      </div>
    </div>
  )
}
