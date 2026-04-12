/**
 * POST /api/reflect
 * Proxies a prompt to the OpenAI API.
 * The API key lives only in server environment variables — never in the browser.
 *
 * Body:    { prompt: string }
 * Returns: { text: string }
 */
import OpenAI from 'openai'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { prompt } = req.body
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid prompt' })
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error:
        'OPENAI_API_KEY is not set. Add it in Vercel → Project Settings → Environment Variables.',
    })
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',       // change to 'gpt-4o-mini' to reduce cost
      max_tokens: 1200,
      temperature: 0.7,
      messages: [
        {
          // The full system + stage instructions are passed as a single user
          // message, matching how the prompts were designed.
          role: 'user',
          content: prompt,
        },
      ],
    })

    const text = completion.choices[0]?.message?.content || ''
    return res.status(200).json({ text })

  } catch (err) {
    console.error('[reflect] OpenAI error:', err)
    const message = err?.error?.message || err?.message || 'OpenAI API error'
    return res.status(500).json({ error: message })
  }
}
