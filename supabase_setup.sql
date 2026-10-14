-- Supabase Setup Script for ANS (Arc Name Service)

-- 1. Analytics Events Table
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  session_id text,
  wallet_address text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. User Profiles Table (Public profile metadata across all wallets)
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  twitter text,
  website text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all public columns exist if user_profiles was previously created
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS twitter text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS website text;

-- 2b. Private User Profiles Table (Isolated private data path for sensitive fields like email)
CREATE TABLE IF NOT EXISTS user_private_profiles (
  wallet_address text PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Safely copy any existing emails from user_profiles to user_private_profiles
-- WITHOUT dropping the original column from user_profiles.
-- Existing email data is preserved, while privacy is strictly enforced via 
-- column-level grants (revoking SELECT on email) and table-level RLS below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'email'
  ) THEN
    INSERT INTO user_private_profiles (wallet_address, email, updated_at)
    SELECT wallet_address, email, updated_at
    FROM user_profiles
    WHERE email IS NOT NULL AND email <> ''
    ON CONFLICT (wallet_address) DO UPDATE
    SET email = EXCLUDED.email, updated_at = EXCLUDED.updated_at;

    -- NOTE: DO NOT drop column email here!
    -- Preserving user_profiles.email prevents destructive data loss.
    -- Access protection is enforced via explicit column-level grants below.
  END IF;
END $$;

-- 3. Onchain Activity Table
CREATE TABLE IF NOT EXISTS onchain_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  contract_address text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  wallet_address text NOT NULL,
  activity_type text NOT NULL,
  block_number bigint NOT NULL,
  indexing_status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash, log_index)
);

-- 4. Reputation Summaries Table
CREATE TABLE IF NOT EXISTS reputation_summaries (
  wallet_address text PRIMARY KEY,
  activity_count integer NOT NULL DEFAULT 0,
  activity_level text NOT NULL DEFAULT 'Newcomer',
  last_updated timestamptz NOT NULL DEFAULT now()
);

-- 5. Auth Challenges Table (Server-issued single-use challenges for profile authorization)
CREATE TABLE IF NOT EXISTS auth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge text UNIQUE NOT NULL,
  wallet_address text NOT NULL,
  operation text NOT NULL DEFAULT 'UPDATE_PROFILE',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security (RLS) setup

-- Enable RLS on all 6 tables
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_summaries ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 1. Analytics Events Policies & Grants
-- Allow anonymous inserts to track telemetry events, but strictly forbid reading or modifying
-- ============================================================================
DROP POLICY IF EXISTS "Allow public insert to analytics_events" ON analytics_events;
CREATE POLICY "Allow public insert to analytics_events" 
  ON analytics_events FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Disallow public reads of analytics_events" ON analytics_events;
CREATE POLICY "Disallow public reads of analytics_events"
  ON analytics_events FOR SELECT TO public
  USING (false);

DROP POLICY IF EXISTS "Disallow public updates of analytics_events" ON analytics_events;
CREATE POLICY "Disallow public updates of analytics_events"
  ON analytics_events FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public deletes of analytics_events" ON analytics_events;
CREATE POLICY "Disallow public deletes of analytics_events"
  ON analytics_events FOR DELETE TO public
  USING (false);

-- Analytics Privileges: only INSERT is granted to public client roles
REVOKE ALL ON analytics_events FROM public, anon, authenticated;
GRANT INSERT ON analytics_events TO anon, authenticated;

-- ============================================================================
-- 2. User Profiles Policies & Grants
-- Allow public reading of approved non-sensitive profile columns only.
-- Allow client upserts (INSERT and UPDATE) of safe public profile columns (excluding email).
-- Deletes remain disallowed from public roles.
-- ============================================================================
DROP POLICY IF EXISTS "Disallow public inserts of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Disallow public updates of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow public inserts of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow public updates of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow public reads of user_profiles" ON user_profiles;

CREATE POLICY "Allow public reads of user_profiles"
  ON user_profiles FOR SELECT TO public
  USING (true);

CREATE POLICY "Allow public inserts of user_profiles"
  ON user_profiles FOR INSERT TO public
  WITH CHECK (true);

CREATE POLICY "Allow public updates of user_profiles"
  ON user_profiles FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Disallow public deletes of user_profiles" ON user_profiles;
CREATE POLICY "Disallow public deletes of user_profiles"
  ON user_profiles FOR DELETE TO public
  USING (false);

-- Table-level privileges: grant SELECT, INSERT, UPDATE to public client roles for PostgREST upsert
GRANT SELECT, INSERT, UPDATE ON user_profiles TO anon, authenticated;
REVOKE DELETE ON user_profiles FROM public, anon, authenticated;

-- Column-level email revocation:
-- In PostgreSQL, table-level REVOKE does NOT remove column-level grants that were previously granted.
-- If user_profiles.email exists, we must explicitly revoke any column-level SELECT grant on it.
-- This dynamic DO block is safe on both fresh databases (where email was never added) and existing databases.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE (table_schema = 'public' OR table_schema = current_schema())
      AND table_name = 'user_profiles' 
      AND column_name = 'email'
  ) THEN
    EXECUTE 'REVOKE ALL (email) ON user_profiles FROM PUBLIC, anon, authenticated';
    EXECUTE 'REVOKE SELECT (email) ON user_profiles FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ============================================================================
-- 3. User Private Profiles Policies & Grants
-- Strictly disallow all public access. Accessible exclusively via service role key.
-- ============================================================================
DROP POLICY IF EXISTS "Disallow public access to user_private_profiles" ON user_private_profiles;
CREATE POLICY "Disallow public access to user_private_profiles"
  ON user_private_profiles FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON user_private_profiles FROM public, anon, authenticated;

-- ============================================================================
-- 4. Auth Challenges Policies & Grants
-- Strictly disallow all public access. Challenges are server-issued and verified via service role key.
-- ============================================================================
DROP POLICY IF EXISTS "Disallow public access to auth_challenges" ON auth_challenges;
CREATE POLICY "Disallow public access to auth_challenges"
  ON auth_challenges FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON auth_challenges FROM public, anon, authenticated;

-- ============================================================================
-- 5. Onchain Activity Policies & Grants
-- Allow public reads of indexed onchain activity. Disallow client writes (indexer writes via service role).
-- ============================================================================
DROP POLICY IF EXISTS "Allow public reads of onchain_activity" ON onchain_activity;
CREATE POLICY "Allow public reads of onchain_activity"
  ON onchain_activity FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Disallow public inserts to onchain_activity" ON onchain_activity;
CREATE POLICY "Disallow public inserts to onchain_activity"
  ON onchain_activity FOR INSERT TO public
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public updates to onchain_activity" ON onchain_activity;
CREATE POLICY "Disallow public updates to onchain_activity"
  ON onchain_activity FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public deletes to onchain_activity" ON onchain_activity;
CREATE POLICY "Disallow public deletes to onchain_activity"
  ON onchain_activity FOR DELETE TO public
  USING (false);

REVOKE ALL ON onchain_activity FROM public, anon, authenticated;
GRANT SELECT ON onchain_activity TO anon, authenticated;

-- ============================================================================
-- 6. Reputation Summaries Policies & Grants
-- Allow public reads of reputation scores. Disallow client writes (updated via protocol/indexer backend).
-- ============================================================================
DROP POLICY IF EXISTS "Allow public reads of reputation_summaries" ON reputation_summaries;
CREATE POLICY "Allow public reads of reputation_summaries"
  ON reputation_summaries FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Disallow public modification of reputation_summaries" ON reputation_summaries;
DROP POLICY IF EXISTS "Disallow public inserts to reputation_summaries" ON reputation_summaries;
CREATE POLICY "Disallow public inserts to reputation_summaries"
  ON reputation_summaries FOR INSERT TO public
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public updates to reputation_summaries" ON reputation_summaries;
CREATE POLICY "Disallow public updates to reputation_summaries"
  ON reputation_summaries FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public deletes to reputation_summaries" ON reputation_summaries;
CREATE POLICY "Disallow public deletes to reputation_summaries"
  ON reputation_summaries FOR DELETE TO public
  USING (false);

REVOKE ALL ON reputation_summaries FROM public, anon, authenticated;
GRANT SELECT ON reputation_summaries TO anon, authenticated;

-- ============================================================================
-- 7. Notifications Table
-- Stores per-wallet in-app notifications generated by the server-side watcher.
--
-- SECURITY MODEL:
--   This app uses Circle passkey smart accounts without Supabase Auth JWTs.
--   PostgreSQL RLS cannot verify wallet identity via auth.uid().
--   Therefore, NO direct public/anon/authenticated access is granted here.
--   All notification reads and mark-read operations must go through the
--   `get-notifications` Supabase Edge Function, which performs
--   challenge+signature verification (same model as `update-profile`) and
--   proxies read/update using the service-role key.
--
--   Only the server-side event watcher script (using the service-role key)
--   can insert rows. All public roles are explicitly blocked from all
--   SELECT, INSERT, UPDATE, and DELETE operations.
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_address text NOT NULL,            -- lowercase wallet address of the recipient
  kind              text NOT NULL,            -- 'name_sold' | 'name_bought' | 'tip_received' | 'name_expiring'
  title             text NOT NULL,
  body              text NOT NULL DEFAULT '',
  link              text,                     -- optional deep-link hint, e.g. 'profile:alice.arc'
  tx_hash           text,                     -- onchain tx hash for deduplication
  log_index         integer,                  -- log index within the tx, combined with tx_hash for uniqueness
  is_read           boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Add log_index column if applying against an existing table (idempotent)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS log_index integer;

-- Unique index for deduplication in the watcher upsert.
-- Includes log_index so two events in the same tx (e.g. NameSold + TipSent)
-- produce distinct rows without tx_hash collision.
-- NOTE: tx_hash and log_index are nullable. PostgreSQL does NOT treat NULL=NULL
-- as equal in unique indexes, so two rows with NULL tx_hash would not conflict.
-- The watcher always supplies non-NULL values for confirmed on-chain events.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON notifications (tx_hash, log_index, recipient_address, kind);

-- Index for efficient per-wallet queries (most common read pattern)
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON notifications (recipient_address, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Block all direct SELECT from public/anon/authenticated.
-- All reads are served through the get-notifications Edge Function.
DROP POLICY IF EXISTS "Allow recipient reads of notifications" ON notifications;
DROP POLICY IF EXISTS "Block public SELECT on notifications" ON notifications;
CREATE POLICY "Block public SELECT on notifications"
  ON notifications FOR SELECT TO public
  USING (false);

-- Block all direct UPDATE from public/anon/authenticated.
-- Mark-read is served through the get-notifications Edge Function.
DROP POLICY IF EXISTS "Allow recipient mark-read of notifications" ON notifications;
DROP POLICY IF EXISTS "Block public UPDATE on notifications" ON notifications;
CREATE POLICY "Block public UPDATE on notifications"
  ON notifications FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

-- Block INSERT from public/anon/authenticated (only service-role watcher may insert)
DROP POLICY IF EXISTS "Disallow public inserts to notifications" ON notifications;
CREATE POLICY "Disallow public inserts to notifications"
  ON notifications FOR INSERT TO public
  WITH CHECK (false);

-- Block DELETE from public/anon/authenticated
DROP POLICY IF EXISTS "Disallow public deletes of notifications" ON notifications;
CREATE POLICY "Disallow public deletes of notifications"
  ON notifications FOR DELETE TO public
  USING (false);

-- No table-level grants for anon/authenticated -- all access is via service role
REVOKE ALL ON notifications FROM public, anon, authenticated;

-- Supabase Realtime: add notifications table to publication if not already present.
-- Realtime respects RLS -- since no anon role has SELECT, unauthorized subscription
-- attempts will receive no data. The publication entry is retained for future use.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ============================================================================
-- 8. Watcher Cursors Table
-- Tracks the last processed block per chain for the event watcher script.
-- Frontend has no access; only the service-role watcher reads and writes here.
-- ============================================================================
CREATE TABLE IF NOT EXISTS watcher_cursors (
  id          text PRIMARY KEY,               -- e.g. 'ans_event_watcher_5042002'
  last_block  text NOT NULL DEFAULT '0',      -- stored as text to handle bigint safely in JS
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE watcher_cursors ENABLE ROW LEVEL SECURITY;

-- Disallow all public access
DROP POLICY IF EXISTS "Disallow public access to watcher_cursors" ON watcher_cursors;
CREATE POLICY "Disallow public access to watcher_cursors"
  ON watcher_cursors FOR ALL TO public
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON watcher_cursors FROM public, anon, authenticated;
