/**
 * db.js — all storage for reflections and summaries.
 *
 * Uses Supabase when env vars are present.
 * Falls back to localStorage automatically so the app works without a DB.
 *
 * Session identity: a UUID is generated on first visit and stored in
 * localStorage as rm_session_id. No login required.
 */

import { supabase } from './supabase'

const SUPABASE_READY =
  typeof window !== 'undefined' &&
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

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

// ── Reflections ──────────────────────────────────────────────────────────────

export async function saveReflection(data) {
  const sessionId = getSessionId()

  if (SUPABASE_READY) {
    const { data: row, error } = await supabase
      .from('reflections')
      .insert({
        session_id:           sessionId,
        entry_card:           data.entryCard,
        user_story:           data.userStory,
        stage1_response:      data.stage1Response,
        focal_point_text:     data.focalPointText,
        card_responses:       data.cardResponses,
        confirmed_statements: data.confirmedStatements,
        output_type:          data.outputType,
        output_text:          data.outputText,
        client_timestamp:     data.timestamp,
      })
      .select('id')
      .single()

    if (error) { console.error('[db] saveReflection:', error); return null }
    return row.id
  }

  // localStorage fallback
  try {
    const id = `rm:${Date.now()}`
    localStorage.setItem(id, JSON.stringify({ ...data, id }))
    return id
  } catch { return null }
}

export async function loadReflections() {
  const sessionId = getSessionId()

  if (SUPABASE_READY) {
    const { data, error } = await supabase
      .from('reflections')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })

    if (error) { console.error('[db] loadReflections:', error); return [] }

    return data.map(row => ({
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
  }

  // localStorage fallback
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
  if (SUPABASE_READY) {
    const { error } = await supabase
      .from('reflections').update({ output_text: outputText }).eq('id', id)
    if (error) console.error('[db] updateReflectionOutput:', error)
    return
  }
  try {
    const raw = localStorage.getItem(id)
    if (raw) localStorage.setItem(id, JSON.stringify({ ...JSON.parse(raw), outputText }))
  } catch {}
}

export async function deleteReflection(id) {
  if (SUPABASE_READY) {
    const { error } = await supabase.from('reflections').delete().eq('id', id)
    if (error) console.error('[db] deleteReflection:', error)
    return
  }
  try { localStorage.removeItem(id) } catch {}
}

// ── Summaries ────────────────────────────────────────────────────────────────

export async function saveSummary({ period, periodLabel, summaryText }) {
  const sessionId = getSessionId()

  if (SUPABASE_READY) {
    const { error } = await supabase.from('summaries').insert({
      session_id:   sessionId,
      period,
      period_label: periodLabel,
      summary_text: summaryText,
    })
    if (error) console.error('[db] saveSummary:', error)
    return
  }
  try {
    const id = `rms:${Date.now()}`
    localStorage.setItem(id, JSON.stringify({ id, period, periodLabel, summaryText, timestamp: Date.now() }))
  } catch {}
}

export async function loadSummaries() {
  const sessionId = getSessionId()

  if (SUPABASE_READY) {
    const { data, error } = await supabase
      .from('summaries').select('*').eq('session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) { console.error('[db] loadSummaries:', error); return [] }
    return data.map(row => ({
      id: row.id, period: row.period, periodLabel: row.period_label,
      summaryText: row.summary_text, timestamp: new Date(row.created_at).getTime(),
    }))
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
