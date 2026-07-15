import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// This client deliberately uses only the publishable key. Never put a service-role key in Vite variables.
export const supabase = url && key ? createClient(url, key) : null
