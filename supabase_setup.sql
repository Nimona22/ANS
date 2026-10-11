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

-- 2. User Profiles Table (Global profile metadata across all wallets)
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  twitter text,
  website text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure all columns exist if user_profiles was previously created
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS banner_url text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS twitter text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS email text;

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

-- Allow public inserts for profiles
DROP POLICY IF EXISTS "Allow public inserts of user_profiles" ON user_profiles;
CREATE POLICY "Allow public inserts of user_profiles"
  ON user_profiles FOR INSERT TO public
  WITH CHECK (true);

-- Allow public updates/upserts of profiles
DROP POLICY IF EXISTS "Disallow public updates of user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow public updates of user_profiles" ON user_profiles;
CREATE POLICY "Allow public updates of user_profiles"
  ON user_profiles FOR UPDATE TO public
  USING (true)
  WITH CHECK (true);

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
