# Realization Moments

A structured, non-clinical reflection tool for young adults navigating bicultural,
diaspora, or immigrant identity. Each session moves through five stages and
leaves the person with a small artifact — a "pot" they can keep, revise, or set
aside.

This is a research prototype, not a therapy product. It is grounded in published
work on narrative identity, narrative therapy, critical consciousness,
motivational interviewing, immigrant identity development, AI-mediated
self-reflection, and layered emotional reflection. It does not diagnose,
treat, or replace human support.

---

## What it does

A guided five-stage flow:

1. **Entry** — pick one of six starting cards (a moment, a pattern, something
   different, something someone said, two parts of you that want different
   things, or a thought / feeling / sensation right now).
2. **Reflective summary** — the model reflects back what it heard, in the
   person's own words, and looks gently for a "unique outcome" (White) — a
   moment when the dominant story didn't fully define them.
3. **Guided reflection** — four Socratic questions covering another side, the
   bigger picture, a moment that did not fit, and what matters most. Default
   layout shows one question at a time with a "see all" toggle.
4. **Emergence check-back** — four tentative threads (newly seen, still
   unresolved, what may guide, who you may be becoming) which the person can
   confirm, mark as close, or reject. At least two marks required to continue;
   the rest are optional.
5. **Closing note** — a short artifact in one of three modes: *what I'm seeing
   now*, *what matters going forward*, or *what I want to keep with me*. The
   recommended mode is auto-suggested based on which thread they confirmed,
   and they can override.

The artifact comes back as an illustrated pot — body shape, glaze color, glaze
style, and plant on top all derive from the person's own writing (see "Pot
visual system" below).

---

## Frameworks

Listed in the system prompt and in the prompt builder comments:

1. McAdams & McLean (2013) — narrative identity
2. White (2007) — narrative therapy maps (externalizing, re-authoring,
   unique outcomes)
3. Morgan (2000) & Denborough (2014) — re-membering and migrations of identity
4. Freire (2005) & Jemal (2017) — critical consciousness
5. Miller & Rollnick (2013) — motivational interviewing
6. Schwartz et al. (2018) & Benet-Martínez & Haritatos (2005) — immigrant
   identity development
7. Kim et al. (2025) — Reflective Agency Framework (IO, CR, RA, TM, SE)
8. Han (2025) — narrative-centered emotional reflection (4 layers)

The Schwartz value supercategories also drive the pot's glaze color, and the
Ekman emotion families drive the pot's body shape.

---

## Architecture

Next.js (Pages Router), React, Supabase, OpenAI.

```
pages/
  index.js              UI + 5-stage state machine + pot visual system
  api/
    reflect.js          OpenAI proxy (system/user role split, rate limit, JSON temp)
    data.js             Supabase proxy (service-role key, session-scoped queries)
lib/
  db.js                 Client-side wrapper that POSTs to /api/data (with
                        localStorage fallback when the server isn't configured)
  supabaseAdmin.js      Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY
  supabase.js           DEPRECATED — old anon-key client; throws on import
supabase/
  schema.sql            Tables + RLS (anon access denied; only service_role works)
```

### Why both `/api/reflect` and `/api/data`?

The browser holds **no** credentials. The OpenAI key and the Supabase
service-role key both live only in Vercel environment variables. `/api/reflect`
is the only path that talks to OpenAI; `/api/data` is the only path that
touches the database. Each request carries a session UUID generated and stored
client-side; `/api/data` filters every query by that UUID, so two browsers with
two different UUIDs cannot see each other's reflections.

Without auth, the only "identity" is the localStorage UUID. Anyone who learns
another user's UUID could impersonate them. This is acceptable for a research
prototype. For production, swap in Supabase Auth and key rows by `auth.uid()`.

---

## Local setup

Requires Node 18+ and a Supabase project.

```bash
git clone https://github.com/ReneeMao/realization-moments.git
cd realization-moments
npm install
cp .env.example .env.local   # then fill in the four env vars below
npm run dev
```

### Required environment variables

| Var | Where it lives | Used by |
| --- | --- | --- |
| `OPENAI_API_KEY` | server only | `pages/api/reflect.js` |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | `lib/db.js`, `lib/supabaseAdmin.js` |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | `lib/supabaseAdmin.js` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | unused (kept for compat) | — |

If `SUPABASE_SERVICE_ROLE_KEY` is missing, `/api/data` returns 503 and the
client falls back to localStorage cleanly — useful for quick local dev without
a Supabase project.

### Database setup

In the Supabase dashboard, open SQL Editor and run `supabase/schema.sql`. This
creates the `reflections` and `summaries` tables, enables RLS with no anon
policies, and drops the old permissive `allow_all_*` policies if they exist.

Verify the lockdown:

```sql
SET ROLE anon;
SELECT * FROM reflections;   -- should fail with permission denied
RESET ROLE;
```

---

## Pot visual system

Every reflection produces a unique pot. The visual is fully derived — there is
no random component beyond a deterministic seed.

**Body shape** (from Ekman emotion families in the story):

- `round` — happy / loving / settled (calm, peaceful, gratitude)
- `tall`  — surprised / fearful (awe, anxiety, vulnerability)
- `oval`  — angry / sad (frustration, grief, conflict)

If no emotion words are detected, falls back to geometry derived from
`groundedness`, `openness`, and `complexity`.

**Glaze color** (from Schwartz value supercategories):

- `olive`    — Conservation
- `honey`    — Self-Enhancement
- `sage`     — Self-Transcendence
- `lavender` — Openness-to-change
- `terracotta` / `bluegrey` — emotion-coded fallback layer

**Glaze style** (from confidence + complexity of the writing):

- `wash`   — clear, settled story
- `pooled` — meaning gathering at the center
- `drift`  — diagonal zone, two pulls
- `satin`  — high certainty, aligned statements

**Plant** (only in the blooming phase, from vitality):

`sprout` → `pair` → `bud` → `flower` → `branch`

See `derivePotVisual` in `pages/index.js` for the full scoring logic.

---

## Privacy & safety

- **No accounts.** Identity is a localStorage UUID.
- **No credentials in the browser.** Anon-key access to the database is
  denied; the OpenAI key never leaves the server.
- **Per-IP rate limiting.** 30 req/min on `/api/reflect`, 60 req/min on
  `/api/data`. Best-effort only across serverless cold starts.
- **Privacy nudge.** The first stage shows a one-sentence reminder to avoid
  full names, schools, workplaces, or immigration details.
- **Safety off-ramp.** If the user's writing suggests self-harm, suicidal
  ideation, abuse, or severe distress, the system prompt instructs the model
  to halt the reflection and surface 988 / 741741 / findahelpline.com instead.
  This is enforced at the prompt level — the model is told to ignore everything
  else and respond only with the safety message.
- **Prompt injection defense.** User narratives are wrapped in
  `<USER_STORY>…</USER_STORY>` tags and the system prompt explicitly tells the
  model to treat their contents as narrative content only, never as
  instructions (OWASP LLM01).
- **Languages.** English and Simplified Chinese supported across all UI copy,
  prompts, and error fallbacks.

---

## Deploying to Vercel

1. Push to GitHub.
2. Import the repo into Vercel.
3. Add environment variables (`OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`) under Project Settings → Environment Variables.
4. Re-run `supabase/schema.sql` against the Supabase project to make sure RLS
   is closed.
5. Deploy.

Vercel's serverless functions don't share memory across instances, so the
in-memory rate-limit map is best-effort. For stronger protection plug in
Upstash Redis or Vercel KV in `pages/api/reflect.js` and `pages/api/data.js`.

---

## Disclaimers

This tool is not therapy, counseling, crisis support, or clinical care. It
cannot diagnose anything or make decisions about a person's wellbeing. It is
not a replacement for human connection or professional help. All outputs are
AI-generated drafts and may be incomplete or wrong. The person retains
interpretive authority over their own story; nothing the tool produces is a
final truth about who they are.

If you are in distress, please reach out to a person who can actually be with
you, or to one of the resources below.

- **988** Suicide & Crisis Lifeline (call or text)
- **741741** Crisis Text Line (text HOME)
- **findahelpline.com**

---

## License

This is a research prototype. See the repository owner for licensing.
