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
  last_sent_at: string | null
}
