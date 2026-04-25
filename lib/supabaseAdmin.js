/**
 * supabaseAdmin — server-only Supabase client.
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security. This MUST
 * never be imported from client code. Next.js will refuse to bundle this for
 * the browser as long as we only import it from `pages/api/*` files.
 *
 * If the service role key is not set, exports `null` so callers can fall
 * back to localStorage cleanly.
 */
import { createClient } from '@supabase/supabase-js'

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null

if (!supabaseAdmin) {
  // Logged once on cold start. Fine — gives the operator a hint.
  console.warn(
    '[supabaseAdmin] Missing env. Set NEXT_PUBLIC_SUPABASE_URL and ' +
    'SUPABASE_SERVICE_ROLE_KEY in Vercel → Project Settings → Environment ' +
    'Variables. The client will fall back to localStorage until then.'
  )
}
