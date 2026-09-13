import { createClient } from '@supabase/supabase-js'

// Both values are public by design: the URL is discoverable and the
// publishable key is safe in the open (RLS is the security boundary).
// Overridable via app/web/.env for a different project.
const url = import.meta.env.VITE_SUPABASE_URL ?? 'https://svrcpzerrbxnzywddyzz.supabase.co'
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_4gNqjXKJzTd6xpBrNaN1fg_xn1g530S'

export const OWNER_EMAIL = 'mizrahi.kobi@gmail.com'

export const supabase = createClient(url, publishableKey)
