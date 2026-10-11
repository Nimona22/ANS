# Supabase User Profile Security Architecture

This document describes the security model, remediations applied, and manual deployment steps for user profile security in ANS (Arc Name Service).

---

## 1. Vulnerability Analysis & Remediations

### Vulnerability A: Unrestricted Profile Writes (Impersonation / Spoofing)
- **Previous state**: `supabase_setup.sql` had public `INSERT` (`WITH CHECK (true)`) and `UPDATE` (`USING (true) WITH CHECK (true)`) policies on `user_profiles`. Anyone possessing the Supabase anon/publishable key could send HTTP REST requests or client SDK calls with any arbitrary `wallet_address` and overwrite another wallet's display name, avatar, bio, or links without cryptographic proof.
- **Remediation**:
  1. In `supabase_setup.sql`, the permissive write policies were removed. Explicit `WITH CHECK (false)` disallow policies were applied to `INSERT`, `UPDATE`, and `DELETE` on `user_profiles`. Direct unauthenticated client writes are blocked at the database level.
  2. In `src/lib/profile.ts`, `saveProfileGlobal()` disables direct unsafe client-side upserts to Supabase. Local profile editing and caching (`localStorage`, memory cache, and component subscriptions) are preserved with zero disruption.
  3. A dedicated Supabase Edge Function (`supabase/functions/update-profile/index.ts`) has been implemented to verify wallet signatures (supporting ERC-1271 & ERC-6492 for Circle Modular Smart Accounts on Arc Testnet) before writing via the service-role key.

### Vulnerability B: Public Exposure of Sensitive Data (Email Addresses)
- **Previous state**: `user_profiles` included an `email` column, and `src/lib/profile.ts` requested `email` in its SELECT query. Because Postgres row-level security applies at the row level, anyone querying `user_profiles` with `.select('*')` or `.select('email')` could harvest users' emails.
- **Remediation**:
  1. In `src/lib/profile.ts`, `fetchProfileGlobal()` explicitly selects **only** public profile fields (`wallet_address, display_name, bio, avatar_url, banner_url, twitter, website`). It never requests `email` or sensitive data.
  2. In `supabase_setup.sql`, column-level privileges revoke general table SELECT from `public`, `anon`, and `authenticated`, granting SELECT only on the approved public columns.
  3. A dedicated private table `user_private_profiles` is established with strict RLS (`ALL TO public USING (false)`). Any existing emails on `user_profiles` are migrated to `user_private_profiles`, and the column is removed from the public table.
  4. In `src/App.tsx`, the UI guards the email display so that even in local cache scenarios, an email is only visible to the wallet owner (`isOwner && profile.email`).

---

## 2. Manual Steps Required in Supabase

Because database migrations and Edge Function deployments require explicit approval, complete the following steps in your Supabase project:

### Step 1: Run the Database Migration
1. Go to your [Supabase Dashboard](https://app.supabase.com).
2. Open your ANS project (`zytmsjuprufxfgvpxfyt`).
3. Navigate to **SQL Editor** in the left sidebar.
4. Copy the entire contents of [`supabase_setup.sql`](../supabase_setup.sql) and paste it into the SQL Editor.
5. Click **Run**.
   - This applies RLS on all tables, disables public writes to `user_profiles`, establishes column-level grants for public reads, creates `user_private_profiles`, and migrates existing email data.

### Step 2: (Optional) Deploy Edge Function for Remote Profile Sync
If you wish to re-enable remote global profile syncing with cryptographic verification:
1. Ensure the Supabase CLI is installed (`npm i -g supabase` or `brew install supabase/tap/supabase`).
2. Link your project:
   ```bash
   npx supabase link --project-ref zytmsjuprufxfgvpxfyt
   ```
3. Deploy the `update-profile` function:
   ```bash
   npx supabase functions deploy update-profile --no-verify-jwt
   ```
4. Verify that `SUPABASE_SERVICE_ROLE_KEY` is available in your function secrets (it is automatically provided in Supabase Edge Functions runtime).

---

## 3. Verification & Validation Checklist

- [x] **No `SELECT *`**: `fetchProfileGlobal()` in `src/lib/profile.ts` specifies only explicit public fields (`wallet_address, display_name, bio, avatar_url, banner_url, twitter, website`).
- [x] **Email Protection**: Email is never queried globally, column-level grants prevent anon reads of email, and private emails are isolated in `user_private_profiles`.
- [x] **Write Authorization**: Unsafe client-side upsert using client-provided address is removed; public insert/update policies are revoked.
- [x] **Zero Service Role in Frontend**: No service-role key is in frontend code or git repository.
- [x] **Local Editing & Caching**: Local profile changes, avatar/banner uploads, and cache subscriptions remain fully operational.
- [x] **Circle Smart Account Compatibility**: Verification architecture is built for Circle Modular ERC-4337 smart accounts using ERC-1271 / ERC-6492 over Arc Testnet RPC.
