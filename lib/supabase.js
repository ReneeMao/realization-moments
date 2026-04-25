/**
 * DEPRECATED — do not import.
 *
 * This file used to expose a browser-side Supabase client built with the
 * public anon key. It has been replaced by:
 *
 *   - lib/supabaseAdmin.js — server-only client with the service-role key
 *   - pages/api/data.js    — server-side proxy for all DB operations
 *   - lib/db.js            — client-side wrapper that POSTs to /api/data
 *
 * The browser no longer holds any Supabase credential. RLS is closed for the
 * anon role, so any code that still imports this module would not be able to
 * read or write rows even if it tried.
 *
 * Importing anything from here throws so the breakage is obvious at build /
 * dev time. Once you've confirmed nothing imports this, delete the file.
 */
const REASON =
  'lib/supabase.js is deprecated — use lib/db.js (which proxies through ' +
  '/api/data) instead. RLS is closed for the anon role; this module would ' +
  'not work even if you re-enabled it.'

export const supabase = new Proxy({}, {
  get() { throw new Error(REASON) },
})
