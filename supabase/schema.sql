-- ═══════════════════════════════════════════════════════════════════
-- Realization Moments — Supabase Schema
-- Supabase Dashboard → SQL Editor → New query → paste → Run
--
-- IMPORTANT — read before deploying:
-- This schema denies anonymous (anon) access entirely. All reads and writes
-- happen server-side via /api/data using SUPABASE_SERVICE_ROLE_KEY (which
-- bypasses RLS). This means:
--   1. The `anon` key in the browser cannot read or modify any rows.
--   2. The Next.js server holds the service-role key and scopes every query
--      to the request's session_id, so two browsers with two different UUIDs
--      cannot see each other's reflections.
--   3. Without auth, the only "identity" is the localStorage UUID. Anyone
--      who learns another user's UUID (e.g. by seeing it on their screen)
--      could impersonate them. This is acceptable for a research prototype.
--      For production, add Supabase Auth and key rows by auth.uid().
-- ═══════════════════════════════════════════════════════════════════

-- ── Reflections ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflections (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at           timestamptz DEFAULT now() NOT NULL,
  session_id           text        NOT NULL,
  entry_card           text,
  user_story           text,
  stage1_response      text,
  focal_point_text     text,
  card_responses       jsonb,
  confirmed_statements jsonb,
  output_type          text,
  output_text          text,
  client_timestamp     bigint
);

CREATE INDEX IF NOT EXISTS reflections_session_idx ON reflections (session_id);
CREATE INDEX IF NOT EXISTS reflections_created_idx ON reflections (created_at DESC);

-- ── Summaries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS summaries (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now() NOT NULL,
  session_id   text        NOT NULL,
  period       text        NOT NULL,
  period_label text        NOT NULL,
  summary_text text        NOT NULL
);

CREATE INDEX IF NOT EXISTS summaries_session_idx ON summaries (session_id);

-- ── Row Level Security ────────────────────────────────────────────────
ALTER TABLE reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries   ENABLE ROW LEVEL SECURITY;

-- If you ran the previous "allow_all_*" policies, drop them so the new
-- restrictive defaults take effect.
DROP POLICY IF EXISTS "allow_all_reflections" ON reflections;
DROP POLICY IF EXISTS "allow_all_summaries"   ON summaries;

-- No anon policies are defined. With RLS enabled and no policy granting
-- access, the `anon` role (i.e. the browser-side client using the public
-- anon key) cannot SELECT, INSERT, UPDATE, or DELETE these rows.
--
-- The `service_role` key, used only by the Next.js API routes, bypasses
-- RLS entirely and is the only path through which data flows.
--
-- Verify with:
--   SET ROLE anon;
--   SELECT * FROM reflections;   -- should return 0 rows / permission denied
--   RESET ROLE;
