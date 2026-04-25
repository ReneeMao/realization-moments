/**
 * POST /api/reflect
 * Proxies a prompt to the OpenAI API.
 * The API key lives only in server environment variables — never in the browser.
 *
 * Body (preferred):
 *   { system: string, user: string, json?: boolean }
 *
 * Body (legacy, still supported):
 *   { prompt: string, json?: boolean }
 *   The handler auto-splits the prompt at the first "\n\nSTAGE:" marker
 *   and sends the prefix as the OpenAI `system` role. This matches how the
 *   prompt builders in pages/index.js construct their strings (`${SYS}\n\nSTAGE: …`).
 *
 * Why split into system + user roles?
 *   The model treats `system` content with higher priority than `user` content,
 *   so the INSTRUCTION PRIORITY hierarchy and INPUT DELIMITER DEFENSE in the
 *   system prompt are followed more reliably when delivered as `system`.
 *
 * `json` flag drops temperature to 0.5 for prompts that return structured
 * JSON (pS3, pS4) — reduces malformed-JSON fallbacks.
 *
 * Returns: { text: string }
 */
import OpenAI from 'openai'

// ── Rate limiting ────────────────────────────────────────────────────────────
// Per-IP in-memory token bucket. Note: Vercel serverless functions do not
// share memory across instances or after cold starts, so this is best-effort
// only — it stops a casual scripter, not a determined attacker. For stronger
// protection, plug in Upstash Redis or Vercel KV here.
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT     = 30          // requests per IP per window
const buckets        = new Map()   // ip -> { count, resetAt }

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim()
  if (Array.isArray(fwd) && fwd[0])              return fwd[0]
  return req.socket?.remoteAddress || 'unknown'
}

function checkRateLimit(ip) {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now >= b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true, remaining: RATE_LIMIT - 1, retryAfter: 0 }
  }
  if (b.count >= RATE_LIMIT) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count += 1
  return { ok: true, remaining: RATE_LIMIT - b.count, retryAfter: 0 }
}

// Periodically prune stale buckets so the map doesn't grow unbounded on long
// warm-instance lifetimes. Cheap O(n) sweep at most once per minute.
let lastSweep = 0
function sweepBuckets(now) {
  if (now - lastSweep < RATE_WINDOW_MS) return
  lastSweep = now
  for (const [ip, b] of buckets) if (now >= b.resetAt) buckets.delete(ip)
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = getClientIp(req)
  sweepBuckets(Date.now())
  const rl = checkRateLimit(ip)
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT))
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining))
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment and try again.',
    })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error:
        'OPENAI_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables.',
    })
  }

  // Build messages array from either { system, user } or legacy { prompt }.
  let { system, user, prompt, json } = req.body || {}
  let messages

  if (typeof system === 'string' && typeof user === 'string' && user.length > 0) {
    messages = [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ]
  } else if (typeof prompt === 'string' && prompt.length > 0) {
    // Legacy path: split SYS prefix from stage-specific instructions.
    const marker   = '\n\nSTAGE:'
    const stageIdx = prompt.indexOf(marker)
    if (stageIdx > 0) {
      messages = [
        { role: 'system', content: prompt.slice(0, stageIdx).trim() },
        { role: 'user',   content: prompt.slice(stageIdx + 2).trim() }, // keep "STAGE: ..." in user message
      ]
    } else {
      messages = [{ role: 'user', content: prompt }]
    }
  } else {
    return res.status(400).json({ error: 'Missing or invalid prompt' })
  }

  // Lower temperature for prompts that return structured JSON (pS3, pS4).
  const temperature = json ? 0.5 : 0.7

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',       // change to 'gpt-4o-mini' to reduce cost
      max_tokens: 1200,
      temperature,
      messages,
    })

    const text = completion.choices[0]?.message?.content || ''
    return res.status(200).json({ text })

  } catch (err) {
    console.error('[reflect] OpenAI error:', err)
    const message = err?.error?.message || err?.message || 'OpenAI API error'
    return res.status(500).json({ error: message })
  }
}
