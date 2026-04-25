/**
 * POST /api/data
 *
 * Server-side proxy for all reflections + summaries DB operations.
 * Uses the Supabase service-role key (which bypasses RLS) but scopes every
 * query to the request's session_id, so two browsers cannot read each other's
 * data even though they both hit the same endpoint.
 *
 * Body: { action: string, sessionId: string, ...payload }
 *
 * Why server-side?
 *   The previous design used the public Supabase anon key in the browser,
 *   which combined with `allow_all_*` policies meant anyone with the URL
 *   and anon key could read every user's reflections. RLS is now closed
 *   (see supabase/schema.sql); only this route, holding the service-role
 *   key, can touch the tables.
 */
import { supabaseAdmin } from '../../lib/supabaseAdmin'

const UUID_RE = /^[0-9a-f-]{16,64}$/i  // permissive — accepts UUID v4 + similar

// Light per-IP rate limit (write actions are the costly ones).
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT     = 60
const buckets        = new Map()

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

function rateLimit(ip) {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now >= b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (b.count >= RATE_LIMIT) return false
  b.count += 1
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!rateLimit(clientIp(req))) {
    return res.status(429).json({ error: 'Too many requests' })
  }

  if (!supabaseAdmin) {
    // Surface a distinct error so the client can fall back to localStorage.
    return res.status(503).json({ error: 'Server DB not configured' })
  }

  const { action, sessionId } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId' })
  }

  try {
    switch (action) {
      // ── Reflections ──────────────────────────────────────────────────
      case 'list_reflections': {
        const { data, error } = await supabaseAdmin
          .from('reflections')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return res.status(200).json({ items: data })
      }

      case 'save_reflection': {
        const d = req.body.data || {}
        const { data, error } = await supabaseAdmin
          .from('reflections')
          .insert({
            session_id:           sessionId,
            entry_card:           d.entryCard,
            user_story:           d.userStory,
            stage1_response:      d.stage1Response,
            focal_point_text:     d.focalPointText,
            card_responses:       d.cardResponses,
            confirmed_statements: d.confirmedStatements,
            output_type:          d.outputType,
            output_text:          d.outputText,
            client_timestamp:     d.timestamp,
          })
          .select('id')
          .single()
        if (error) throw error
        return res.status(200).json({ id: data.id })
      }

      case 'update_reflection_output': {
        const { id, outputText } = req.body
        if (!id) return res.status(400).json({ error: 'Missing id' })
        // session_id filter ensures one user can't mutate another user's row,
        // even if they somehow learn the row's UUID.
        const { error } = await supabaseAdmin
          .from('reflections')
          .update({ output_text: outputText })
          .eq('id', id)
          .eq('session_id', sessionId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      case 'delete_reflection': {
        const { id } = req.body
        if (!id) return res.status(400).json({ error: 'Missing id' })
        const { error } = await supabaseAdmin
          .from('reflections')
          .delete()
          .eq('id', id)
          .eq('session_id', sessionId)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      // ── Summaries ────────────────────────────────────────────────────
      case 'list_summaries': {
        const { data, error } = await supabaseAdmin
          .from('summaries')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: false })
        if (error) throw error
        return res.status(200).json({ items: data })
      }

      case 'save_summary': {
        const { period, periodLabel, summaryText } = req.body
        if (!period || !summaryText) return res.status(400).json({ error: 'Missing fields' })
        const { error } = await supabaseAdmin.from('summaries').insert({
          session_id:   sessionId,
          period,
          period_label: periodLabel,
          summary_text: summaryText,
        })
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      default:
        return res.status(400).json({ error: 'Unknown action' })
    }
  } catch (err) {
    console.error('[data] error:', err)
    return res.status(500).json({ error: err?.message || 'Server error' })
  }
}
