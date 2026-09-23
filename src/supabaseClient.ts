import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey)

export type Client = {
  id: string
  client_code: string | null
  client_name: string
  email: string | null
  forename: string | null
  surname: string | null
  confirmation_statement_date: string | null
  due_date: string | null // confirmation statement filing due date
  last_sent_at: string | null

  // Year End tracking
  company_number: string | null
  year_end_date: string | null
  accounts_due_date: string | null // generated: year_end_date + 9 months
  accounts_last_filed_ch: string | null // last filed date reported by Companies House
  accounts_last_synced_at: string | null // when we last checked Companies House
  year_end_completed_at: string | null // set when this cycle is ticked off

  // Archiving
  archived: boolean
  archived_at: string | null
  archived_reason: string | null
  company_status: string | null // last status Companies House reported
}
