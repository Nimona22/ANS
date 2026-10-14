-- =============================================================================
-- ANS Security Migration: sec_001 — Notifications Table Hardening
-- =============================================================================
-- Purpose:
--   Remove unrestricted public access to the `notifications` table.
--   The previous policies used USING (true) for SELECT and UPDATE, which
--   allowed any Supabase client with the anon key to read all notification
--   rows and mark any wallet's notifications as read, regardless of ownership.
--
-- Secure model after this migration:
--   - No public/anon/authenticated role has SELECT or UPDATE on notifications.
--   - Only the service-role key (held server-side) can read or write rows.
--   - The `get-notifications` Edge Function (supabase/functions/get-notifications/)
--     performs challenge+signature verification before proxying read and mark-read
--     operations on behalf of a verified wallet.
--   - Insertions remain exclusive to the server-side watcher script.
--
-- Identity constraint:
--   This app uses Circle passkey smart accounts without Supabase Auth JWTs.
--   PostgreSQL RLS cannot verify wallet identity without auth.uid().
--   There is no safe fallback: all notification access must go through a
--   server-side function that cryptographically verifies ownership.
--
-- Forward-only / idempotent:
--   Safe to re-run. Uses DROP POLICY IF EXISTS and explicit REVOKE.
--   Does NOT drop or recreate tables, existing indexes, or data.
--
-- Apply:
--   Paste into Supabase Dashboard > SQL Editor and run as project admin.
-- =============================================================================

-- ============================================================================
-- 1. Revoke all direct table access to `notifications` from public roles.
-- ============================================================================
REVOKE ALL ON notifications FROM public, anon, authenticated;

-- ============================================================================
-- 2. Drop insecure policies that allowed unrestricted reads and updates.
-- ============================================================================
-- These policies allowed any anon client to read ALL rows (not just their own):
DROP POLICY IF EXISTS "Allow recipient reads of notifications" ON notifications;

-- This policy allowed any anon client to mark ANY row as read:
DROP POLICY IF EXISTS "Allow recipient mark-read of notifications" ON notifications;

-- ============================================================================
-- 3. Re-create tight, fail-closed policies for all operations.
--    SELECT and UPDATE are completely blocked for all public roles.
-- ============================================================================

-- Block all SELECT from public/anon/authenticated (served via Edge Function only)
DROP POLICY IF EXISTS "Block public SELECT on notifications" ON notifications;
CREATE POLICY "Block public SELECT on notifications"
  ON notifications FOR SELECT TO public
  USING (false);

-- Block all UPDATE from public/anon/authenticated (served via Edge Function only)
DROP POLICY IF EXISTS "Block public UPDATE on notifications" ON notifications;
CREATE POLICY "Block public UPDATE on notifications"
  ON notifications FOR UPDATE TO public
  USING (false)
  WITH CHECK (false);

-- Retain: nobody can insert from the frontend (only service-role watcher)
DROP POLICY IF EXISTS "Disallow public inserts to notifications" ON notifications;
CREATE POLICY "Disallow public inserts to notifications"
  ON notifications FOR INSERT TO public
  WITH CHECK (false);

-- Retain: nobody can delete from the frontend
DROP POLICY IF EXISTS "Disallow public deletes of notifications" ON notifications;
CREATE POLICY "Disallow public deletes of notifications"
  ON notifications FOR DELETE TO public
  USING (false);

-- ============================================================================
-- 4. Confirm RLS is enabled (idempotent).
-- ============================================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. Watcher cursors: confirm no grants accidentally added.
-- ============================================================================
REVOKE ALL ON watcher_cursors FROM public, anon, authenticated;

-- ============================================================================
-- NOTE: deduplication index
-- ============================================================================
-- notifications_dedup_idx covers (tx_hash, log_index, recipient_address, kind).
-- tx_hash and log_index are nullable. PostgreSQL does NOT treat NULL = NULL in
-- unique indexes, so two rows with NULL tx_hash would not conflict. The watcher
-- always supplies non-NULL values for confirmed on-chain events, so dedup works
-- correctly in practice. No index changes are required.
--
-- The Realtime publication entry for `notifications` is retained. Supabase
-- Realtime respects RLS — since no anon role has SELECT, unauthorized
-- subscription attempts will receive no rows.

-- ============================================================================
-- END OF MIGRATION sec_001
-- ============================================================================
