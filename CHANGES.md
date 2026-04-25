# Realization Moments — Critical Fixes & UX Patches

This drop covers the eight critical issues from the review plus the two UX changes
you asked for, the new entry card, and the emotion/value-driven pot mapping from
the *Emotional Experiences* spreadsheet.

## How to apply

The patched files mirror the original repo layout. To deploy on top of your
current branch, copy these into the same paths:

```
pages/index.js              ← rewritten (UX + i18n + pot logic)
pages/api/reflect.js        ← rewritten (system/user split + rate limit + JSON temp)
pages/api/data.js           ← NEW — server-side DB proxy
lib/db.js                   ← rewritten (now goes through /api/data)
lib/supabaseAdmin.js        ← NEW — service-role client (server-only)
supabase/schema.sql         ← rewritten (RLS hardened, anon access denied)
```

Then in Vercel → Project Settings → Environment Variables add:

```
SUPABASE_SERVICE_ROLE_KEY = <your service role key>
```

(Keep `NEXT_PUBLIC_SUPABASE_URL` as-is. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is no
longer used by the client — you can remove it or leave it; it has no effect with
the closed RLS policies.)

After deploy, re-run `supabase/schema.sql` in the Supabase SQL editor so the old
`allow_all_*` policies are dropped.

---

## Critical fixes

### 1. API role split — `pages/api/reflect.js`

The 8000-char system prompt was being sent as a single `user` message, so the
INSTRUCTION PRIORITY hierarchy and INPUT DELIMITER DEFENSE inside it had no extra
weight. The handler now accepts either `{ system, user }` or the legacy `{
prompt }`. For legacy callers it splits the prompt at the first `\n\nSTAGE:`
marker (every prompt builder uses this) and sends the prefix as `system`. Net
effect: the model treats the framework grounding as instructions, not as the
user's narrative.

### 2. Supabase RLS hardening — `supabase/schema.sql` + new server proxy

The previous `allow_all_*` policies meant anyone with the public anon key could
read every reflection in the database. Now:

- RLS is ON for both tables, with **no** anon policies — the anon role cannot
  read or write anything.
- The browser no longer holds any DB credential. `lib/db.js` now POSTs to a new
  server route `/api/data`, which runs under the service-role key and scopes
  every query to `eq('session_id', sessionId)`. Two browsers with two different
  UUIDs cannot read each other's rows.
- `lib/supabaseAdmin.js` is a server-only client; it lives in `lib/` but is only
  ever imported from `pages/api/*`, so Next.js will not bundle it for the
  browser.
- Falls back cleanly to `localStorage` if the service-role key isn't configured
  (server returns 503; the client switches to local mode for the session).

Caveat documented in the schema: without auth, the only "identity" is the
localStorage UUID. Anyone who learns another user's UUID could impersonate them.
Acceptable for a research prototype; for production add Supabase Auth and key
rows by `auth.uid()`.

### 3. Rate limiting on `/api/reflect`

Per-IP in-memory token bucket: 30 requests / 60 seconds. Returns 429 with a
`Retry-After` header. Map is swept periodically to avoid unbounded growth on
warm Vercel instances. Note: serverless cold starts wipe the map, so this is
best-effort — it stops a casual scripter, not a determined attacker. For
stronger protection, swap in Upstash Redis or Vercel KV. The `/api/data` route
has its own lighter limit (60/min/IP).

### 4. Error fallback i18n

Every visible English-only fallback string was extracted into `TRANS[lang]`:

- `errGenericSummary` (history synthesis)
- `errS1Short`, `errS1Deep` (stage 1 fallbacks)
- `errS3Fallback` (stage 3 four-question fallback array)
- `errS4Fallback` (stage 4 four-thread fallback array)
- `errS5` (stage 5 closing-note fallback)

When the user's language is `zh`, they now see Chinese fallbacks instead of
English ones if `/api/reflect` errors out.

### 5. Pot accent: score-and-pick

The old `if/else if` cascade in `derivePotVisual` exited on the first hit, so
"care" overrode "joy" overrode "hope" deterministically. The new logic scores
every regex against the story and picks the highest-scoring accent (ties fall
to the seed-based default). Strict `>` so a 0-score story keeps its
seed-derived accent.

### 6. Complexity tokens

`complexity` regex was missing common ambivalent connectives. Now matches
`but | though | however | and | yet | still | except | although`.

### 7. JSON-output temperature

`pS3` and `pS4` return strict JSON. Server now drops temperature to 0.5 when the
client passes `json:true`, so we get fewer malformed-JSON fallbacks. Stage 3 and
Stage 4 calls in `pages/index.js` both pass the flag.

### 8. Chinese consent page

The /consent page body copy was hardcoded in English JSX literals. All four
sections (`whatIsBody`, `whatIsNotBody`, `privacyBody`, `safetyBody`) are now
read from `TRANS[lang].consent.*` with full Chinese translations.

---

## UX changes

### Stage 3 — hybrid layout (`focus` default + `see all` toggle)

Default mode is **focus**: one question at a time, with prev/next buttons,
question counter ("Question 2 of 4"), and a row of dots showing which questions
have answers. A "See all questions" button in the top-right flips to the
existing 4-card collapsible view ("Focus on one" toggles back). The continue
button and the existing Respond-to-at-least-one rule work the same in both
modes — `s3Mode` and `s3Idx` are local state on `Home`, reset between sessions.

### Stage 4 — min 2 marks instead of mark-all-four

Previously `done = rvS.every((_,i) => rvM[i])` — all four threads had to be
marked. Now `done` requires at least 2 threads marked (any of fits / close /
remove). The remaining two are optional. A small `markedCount/2` indicator
appears under the Continue button. New TRANS key `stage4MinHint` ("Mark at
least 2 threads to continue. The rest are optional.") is shown above the
threads in both languages.

---

## Content additions

### New entry card

Sixth card on the landing page:

- en: "A thought, feeling, or sensation I am having right now."
- zh: "我此刻的一个想法、感受或身体感觉。"

Nudge copy in both languages invites in-the-moment noticing without requiring
the person to know what it means.

### Emotion → body, values → glaze color

Mapped from the *Emotional Experiences.xlsx* taxonomies:

**Body type** (Ekman 5 emotion families → 3 pot bodies):

- `round` — happy / loving / settled (calm, peaceful, grateful, comfort)
- `tall`  — surprised + fearful (awe, excitement, anxiety, vulnerability)
- `oval`  — angry + sad (frustration, grief, conflict, hurt, lostness)

If no emotion words are detected, the original geometry-based fallback (using
`groundedness` / `openness` / `complexity`) takes over.

**Glaze accent** (Schwartz 4 value supercategories → 4 of the 6 accents):

- `olive`    — Conservation (security, family, tradition, home, loyalty)
- `honey`    — Self-Enhancement (achievement, growth, ambition, success)
- `sage`     — Self-Transcendence (love, kindness, justice, wisdom, gratitude)
- `lavender` — Openness-to-change (creativity, freedom, curiosity, adventure)

The remaining two accents (`terracotta` / `bluegrey`) are kept as an
emotion-coded fallback layer — only consulted when no Schwartz value is named.
Stories that name no values and no emotion-coded language fall through to the
original seed-based default.

---

## Verification

`node --check` passes on all five JS files:

```
pages/index.js
pages/api/reflect.js
pages/api/data.js
lib/db.js
lib/supabaseAdmin.js
```

What I did **not** test (because the patch is a copy of files, not a built
deploy):

- Live OpenAI calls under the new system/user role split.
- Live Supabase calls under the closed RLS policies.
- The 429 path under load.
- Rendering of the Stage 3 focus mode on a real page.

Recommend running through one full reflection in dev (`npm run dev`) before
merging to main, and re-running the SQL migration on your Supabase project.
