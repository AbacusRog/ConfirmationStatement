import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

interface ScheduledItem {
  id: string
  clientName: string
  toEmail: string
  subject: string
  scheduledAt: string
}

const card = 'rounded-md border border-line bg-white p-4'
const inputCls =
  'rounded-md border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors'

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Every Accounts Pack email currently sitting with Resend waiting to send.
 * Lets you move one to a different date/time or cancel it outright. A row
 * disappears on its own, next time this list loads, once Resend shows the
 * email as no longer scheduled (i.e. it's already gone out).
 */
export default function ScheduledPacks({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<ScheduledItem[] | null>(null)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  async function authHeaders(): Promise<Record<string, string> | null> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return null
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
  }

  async function load() {
    const headers = await authHeaders()
    if (!headers) return
    try {
      const res = await fetch('/api/scheduled-packs', { headers })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setItems(data.scheduled ?? [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load scheduled emails.')
    }
  }

  useEffect(() => {
    load()
    // A light poll so a row drops off on its own once it's gone out, even
    // if nobody triggers a reload by scheduling or editing another one.
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  function startEdit(item: ScheduledItem) {
    setEditingId(item.id)
    setEditValue(toLocalInputValue(new Date(item.scheduledAt)))
    setRowError(null)
  }

  async function saveEdit(id: string) {
    const when = new Date(editValue)
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setRowError({ id, message: 'Pick a time in the future.' })
      return
    }
    if (when.getTime() > Date.now() + 30 * 24 * 60 * 60 * 1000) {
      setRowError({ id, message: 'Resend can only schedule up to 30 days ahead.' })
      return
    }
    const headers = await authHeaders()
    if (!headers) return
    setBusyId(id)
    setRowError(null)
    try {
      const res = await fetch('/api/scheduled-packs', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id, scheduledAt: when.toISOString() }),
      })
      if (!res.ok) {
        let msg = await res.text()
        try {
          msg = JSON.parse(msg).error ?? msg
        } catch {
          /* plain text */
        }
        throw new Error(msg)
      }
      setEditingId(null)
      await load()
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : 'Could not reschedule.' })
    } finally {
      setBusyId(null)
    }
  }

  async function cancelSend(id: string) {
    const headers = await authHeaders()
    if (!headers) return
    setBusyId(id)
    try {
      const res = await fetch('/api/scheduled-packs', { method: 'DELETE', headers, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error(await res.text())
      setConfirmDeleteId(null)
      await load()
    } catch (e) {
      setRowError({ id, message: e instanceof Error ? e.message : 'Could not cancel.' })
    } finally {
      setBusyId(null)
    }
  }

  if (items === null && !error) return null // hasn't loaded yet — nothing to show
  if (!error && items && items.length === 0) return null // nothing scheduled

  return (
    <section className={card}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-serif text-lg text-ink">Scheduled emails</h2>
        <button onClick={load} className="text-xs font-medium text-accent hover:text-accent-dark">
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-warn mb-2">Could not load scheduled emails: {error}</p>}

      {items && items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">{item.clientName}</div>
                  <div className="text-xs text-slate-650 truncate">
                    {item.subject} &middot; to {item.toEmail}
                  </div>
                </div>

                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className={inputCls}
                    />
                    <button
                      onClick={() => saveEdit(item.id)}
                      disabled={busyId === item.id}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50 transition-colors"
                    >
                      {busyId === item.id ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={busyId === item.id} className="text-xs font-medium text-slate-650 hover:text-ink">
                      Cancel
                    </button>
                  </div>
                ) : confirmDeleteId === item.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-warn">Cancel this send?</span>
                    <button
                      onClick={() => cancelSend(item.id)}
                      disabled={busyId === item.id}
                      className="rounded-md bg-warn px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                    >
                      {busyId === item.id ? 'Cancelling…' : 'Yes, cancel it'}
                    </button>
                    <button onClick={() => setConfirmDeleteId(null)} disabled={busyId === item.id} className="text-xs font-medium text-slate-650 hover:text-ink">
                      Never mind
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-ink whitespace-nowrap">{fmt(item.scheduledAt)}</span>
                    <button onClick={() => startEdit(item)} className="text-xs font-medium text-accent hover:text-accent-dark">
                      Change
                    </button>
                    <button onClick={() => setConfirmDeleteId(item.id)} className="text-xs font-medium text-warn hover:opacity-80">
                      Cancel send
                    </button>
                  </div>
                )}
              </div>
              {rowError?.id === item.id && <p className="text-xs text-warn mt-1">{rowError.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
