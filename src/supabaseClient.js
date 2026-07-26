import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn(
    'Missing Supabase env vars. Copy .env.example to .env and fill in your project URL and publishable key.'
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey)