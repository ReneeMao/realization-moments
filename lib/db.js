/**
 * db.js — all storage for reflections and summaries.
 *
 * All Supabase access is now proxied through the server-side /api/data
 * endpoint, which uses the service-role key. The browser no longer holds
 * any credentials capable of reading the database directly.
 *
 * Falls back to localStorage automatically when:
 *   - Supabase env vars are not configured (NEXT_PUBLIC_SUPABASE_URL absent), or
 *   - /api/data returns 503 (service-role key not configured on the server).
 *
 * Session identity: a UUID is generated on first visit and stored in
 * localStorage as rm_session_id. No login required.
 */

const SUPABASE_ENABLED =
  typeof window !== 'undefined' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL

// Flips to false at runtime if /api/data returns 503 — we then stay in
// localStorage mode for the rest of the session.
let serverDbAvailable = SUPABASE_ENABLED

// ── Session ID ───────────────────────────────────────────────────────────────

export function getSessionId() {
  if (typeof window === 'undefined') return null
  let id = localStorage.getItem('rm_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('rm_session_id', id)
  }
  return id
}

// ── Internal: call the server data route ─────────────────────────────────────

async function callData(payload) {
  const sessionId = getSessionId()
  const r = await fetch('/api/data', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...payload, sessionId }),
  })
  if (r.status === 503) {
    // Server has no service-role key configured — disable for this session.
    serverDbAvailable = false
    throw new Error('server-db-unavailable')
  }
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// ── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(data) {
  if (serverDbAvailable) {
    try {
      const { id } = await callData({ action: 'save_reflection', data })
      return id
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] saveReflection:', e)
        return null
      }
      // Fall through to localStorage.
    }
  }
  try {
    const id = `rm:${Date.now()}`
    localStorage.setItem(id, JSON.stringify({ ...data, id }))
    return id
  } catch { return null }
}

export async function loadReflections() {
  if (serverDbAvailable) {
    try {
      const { items } = await callData({ action: 'list_reflections' })
      return items.map(row => ({
        id:                   row.id,
        timestamp:            row.client_timestamp || new Date(row.created_at).getTime(),
        entryCard:            row.entry_card,
        userStory:            row.user_story,
        stage1Response:       row.stage1_response,
        focalPointText:       row.focal_point_text,
        cardResponses:        row.card_responses,
        confirmedStatements:  row.confirmed_statements,
        outputType:           row.output_type,
        outputText:           row.output_text,
      }))
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] loadReflections:', e)
        return []
      }
    }
  }
  try {
    const items = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('rm:')) {
        try { const v = localStorage.getItem(k); if (v) items.push(JSON.parse(v)) } catch {}
      }
    }
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  } catch { return [] }
}

export async function updateReflectionOutput(id, outputText) {
  if (serverDbAvailable) {
    try {
      await callData({ action: 'update_reflection_output', id, outputText })
      return
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] updateReflectionOutput:', e)
        return
      }
    }
  }
  try {
    const raw = localStorage.getItem(id)
    if (raw) localStorage.setItem(id, JSON.stringify({ ...JSON.parse(raw), outputText }))
  } catch {}
}

export async function deleteReflection(id) {
  if (serverDbAvailable) {
    try {
      await callData({ action: 'delete_reflection', id })
      return
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] deleteReflection:', e)
        return
      }
    }
  }
  try { localStorage.removeItem(id) } catch {}
}

// ── Summaries ────────────────────────────────────────────────────────────────

export async function saveSummary({ period, periodLabel, summaryText }) {
  if (serverDbAvailable) {
    try {
      await callData({ action: 'save_summary', period, periodLabel, summaryText })
      return
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] saveSummary:', e)
        return
      }
    }
  }
  try {
    const id = `rms:${Date.now()}`
    localStorage.setItem(id, JSON.stringify({ id, period, periodLabel, summaryText, timestamp: Date.now() }))
  } catch {}
}

export async function loadSummaries() {
  if (serverDbAvailable) {
    try {
      const { items } = await callData({ action: 'list_summaries' })
      return items.map(row => ({
        id: row.id, period: row.period, periodLabel: row.period_label,
        summaryText: row.summary_text, timestamp: new Date(row.created_at).getTime(),
      }))
    } catch (e) {
      if (e.message !== 'server-db-unavailable') {
        console.error('[db] loadSummaries:', e)
        return []
      }
    }
  }
  try {
    const items = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('rms:')) {
        try { const v = localStorage.getItem(k); if (v) items.push(JSON.parse(v)) } catch {}
      }
    }
    return items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
  } catch { return [] }
}
