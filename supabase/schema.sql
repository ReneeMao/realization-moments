-- ═══════════════════════════════════════════════════════════════════
-- Realization Moments — Supabase Schema
-- Supabase Dashboard → SQL Editor → New query → paste → Run
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

-- Open policies for research prototype (tighten when you add auth)
CREATE POLICY "allow_all_reflections" ON reflections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_summaries"   ON summaries   FOR ALL USING (true) WITH CHECK (true);
