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

-- If email column was previously present on user_profiles, safely migrate data and remove from public table
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

    ALTER TABLE user_profiles DROP COLUMN email;
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

-- Row Level Security (RLS) setup

-- Enable RLS on all tables
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE onchain_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE reputation_summaries ENABLE ROW LEVEL SECURITY;

-- Analytics Policies
-- Allow anonymous inserts to track events, but do not allow reads
DROP POLICY IF EXISTS "Allow public insert to analytics_events" ON analytics_events;
CREATE POLICY "Allow public insert to analytics_events" 
  ON analytics_events FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Disallow public reads of analytics_events" ON analytics_events;
CREATE POLICY "Disallow public reads of analytics_events"
  ON analytics_events FOR SELECT TO public
  USING (false);

-- User Profiles Policies
-- Allow reading public profile data by everyone
DROP POLICY IF EXISTS "Allow public reads of user_profiles" ON user_profiles;
CREATE POLICY "Allow public reads of user_profiles"
  ON user_profiles FOR SELECT TO public
  USING (true);

-- Disallow unrestricted public inserts, updates, and deletes on user_profiles.
-- Remote writes must be performed exclusively by an authorized backend endpoint / Edge Function
-- verifying cryptographic wallet ownership (ERC-1271/ERC-6492) using the service role key.
DROP POLICY IF EXISTS "Allow public inserts of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Disallow public inserts of user_profiles" ON user_profiles;
CREATE POLICY "Disallow public inserts of user_profiles"
  ON user_profiles FOR INSERT TO public
  WITH CHECK (false);

DROP POLICY IF EXISTS "Allow public updates of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Disallow public updates of user_profiles" ON user_profiles;
CREATE POLICY "Disallow public updates of user_profiles"
  ON user_profiles FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Disallow public deletes of user_profiles" ON user_profiles;
CREATE POLICY "Disallow public deletes of user_profiles"
  ON user_profiles FOR DELETE TO public
  USING (false);

-- Grant column-level SELECT on user_profiles to ensure email or other sensitive columns
-- cannot be accessed publicly even if re-added
REVOKE SELECT ON user_profiles FROM public, anon, authenticated;
GRANT SELECT (id, wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, created_at, updated_at)
  ON user_profiles TO anon, authenticated;

-- User Private Profiles Policies
-- Strictly disallow public access to private profile data (accessible only via service role)
DROP POLICY IF EXISTS "Disallow public access to user_private_profiles" ON user_private_profiles;
CREATE POLICY "Disallow public access to user_private_profiles"
  ON user_private_profiles FOR ALL TO public
  USING (false);

-- Onchain Activity Policies
-- Allow reading onchain activity
DROP POLICY IF EXISTS "Allow public reads of onchain_activity" ON onchain_activity;
CREATE POLICY "Allow public reads of onchain_activity"
  ON onchain_activity FOR SELECT TO public
  USING (true);

-- Disallow arbitrary inserts from clients. Only an indexer backend should insert.
DROP POLICY IF EXISTS "Disallow public inserts to onchain_activity" ON onchain_activity;
CREATE POLICY "Disallow public inserts to onchain_activity"
  ON onchain_activity FOR INSERT TO public
  WITH CHECK (false);

-- Reputation Summaries Policies
-- Allow reading reputation
DROP POLICY IF EXISTS "Allow public reads of reputation_summaries" ON reputation_summaries;
CREATE POLICY "Allow public reads of reputation_summaries"
  ON reputation_summaries FOR SELECT TO public
  USING (true);

-- Disallow arbitrary updates or inserts from clients
DROP POLICY IF EXISTS "Disallow public modification of reputation_summaries" ON reputation_summaries;
CREATE POLICY "Disallow public modification of reputation_summaries"
  ON reputation_summaries FOR ALL TO public
  USING (false);
