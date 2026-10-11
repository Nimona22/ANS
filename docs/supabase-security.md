# Supabase User Profile Security Architecture & Remediation Report

This document details the security model, cryptographic authorization protocol, replay protection mechanism, Circle Smart Account compatibility findings, and migration procedures for user profile security in ANS (Arc Name Service).

---

## 1. Vulnerability Analysis & Hardening Remediations

### Vulnerability A: Unrestricted Profile Writes (Impersonation & Spoofing)
* **Original State:** `supabase_setup.sql` permitted public `INSERT` and `UPDATE` on `user_profiles` with `WITH CHECK (true)`. Anyone possessing the Supabase anon key could overwrite any wallet's profile.
* **Remediation:**
  1. In `supabase_setup.sql`, explicit disallow policies (`WITH CHECK (false)`) are applied to `INSERT`, `UPDATE`, and `DELETE` on `user_profiles`. Direct unauthenticated client writes are blocked at the database engine level.
  2. In `src/lib/profile.ts`, `saveProfileGlobal()` disables direct unsafe client-side upserts. Profiles save locally (`localStorage`, in-memory cache, and component subscribers) with zero disruption.
  3. A dedicated Supabase Edge Function (`supabase/functions/update-profile/index.ts`) implements cryptographic wallet verification before writing via the service-role key.

### Vulnerability B: Signature Payload Unbinding (Finding C-01 from Security Audit)
* **Identified Vulnerability:** The initial Edge Function only verified a generic string `"Update ANS Profile for <walletAddress> at <timestamp>"`. The profile data (`displayName`, `bio`, etc.) was separate in the JSON body, allowing an attacker to reuse an intercepted valid signature to overwrite the victim's profile with arbitrary malicious content.
* **Remediation:**
  1. **Canonical Payload Hashing:** The Edge Function computes a deterministic `keccak256` hash of the sanitized profile payload:
     $$\text{Payload Hash} = \text{keccak256}(\text{JSON}(\{\text{avatarUrl}, \text{bannerUrl}, \text{bio}, \text{displayName}, \text{twitter}, \text{website}\}))$$
  2. **Strict Message Binding:** The signed message binds the wallet address, Arc Testnet chain ID (`5042002`), single-use server challenge, payload hash, and operation:
     ```text
     Arc Name Service Profile Update
     Wallet: 0x1234567890abcdef1234567890abcdef12345678
     Chain ID: 5042002
     Challenge: <server_challenge_nonce>
     Payload Hash: 0x<keccak256_hash>
     Action: UPDATE_PROFILE
     ```
  3. Any alteration to the profile payload immediately invalidates the payload hash and causes the Edge Function to reject the request (`HTTP 400`).

### Vulnerability C: Replay Protection & Timestamp Reliance (Finding H-02 from Security Audit)
* **Identified Vulnerability:** The previous implementation relied on a client-supplied timestamp with a 5-minute window, allowing unlimited replay attacks during that period.
* **Remediation:**
  1. Created `auth_challenges` table with Row Level Security blocking public access.
  2. Implemented a two-phase challenge-response protocol:
     - `POST /update-profile` with `{ action: 'request_challenge', walletAddress }`: The server issues a cryptographically secure, unpredictable UUID nonce expiring in 120 seconds.
     - `POST /update-profile` with `{ action: 'submit_update', ... }`: The Edge Function executes an atomic conditional update:
       ```sql
       UPDATE auth_challenges
       SET consumed_at = now()
       WHERE challenge = :challenge
         AND wallet_address = :walletAddress
         AND operation = 'UPDATE_PROFILE'
         AND consumed_at IS NULL
         AND expires_at > now()
       RETURNING id;
       ```
     - If 0 rows are updated, the request is rejected immediately as invalid, expired, or already consumed. Concurrent duplicate submissions fail atomically.

### Vulnerability D: Irreversible Email Column Drop & Data Black Hole (Finding M-01 from Security Audit)
* **Identified Vulnerability:** The previous migration ran `ALTER TABLE user_profiles DROP COLUMN email;` without providing any authenticated API for users to access or update their private email data, causing permanent data loss for existing users.
* **Remediation:**
  1. **Non-Destructive Preservation:** Removed `DROP COLUMN email` from `supabase_setup.sql`. Existing emails in `user_profiles` are preserved and copied non-destructively to `user_private_profiles`.
  2. **Column-Level Privilege Revocation:** Enforced privacy at the database privilege level:
     ```sql
     REVOKE SELECT ON user_profiles FROM public, anon, authenticated;
     GRANT SELECT (id, wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, created_at, updated_at)
       ON user_profiles TO anon, authenticated;
     ```
     Because `email` is not in the column grant list, anonymous and authenticated clients cannot read it. Attempting `.select('*')` or `.select('email')` returns a permission denied error.
  3. In `src/lib/profile.ts`, `fetchProfileGlobal()` queries only approved public columns, preserving any local-only email for the active wallet in `localStorage`.

### Vulnerability E: Missing Schema Validation & Information Disclosure (Findings M-02 & L-01)
* **Remediation:**
  1. Edge Function enforces strict size and type constraints:
     - `displayName`: string, $\le 50$ chars.
     - `bio`: string, $\le 160$ chars.
     - `twitter`: regex `^[A-Za-z0-9_]{1,15}$`.
     - `website`: string, $\le 200$ chars, strictly `https://`.
     - `avatarUrl`: string, $\le 350\text{KB}$, strictly `https://` or `data:image/(jpeg|png|webp);base64,...`.
     - `bannerUrl`: string, $\le 750\text{KB}$, strictly `https://` or `data:image/(jpeg|png|webp);base64,...`.
  2. Error responses return generic, sanitized messages (e.g. `Server configuration error`, `Cryptographic ownership verification failed`) while logging diagnostics server-side.

---

## 2. Circle Modular Smart Account Compatibility Deep Dive

### Implementation Analysis
* **Core Package:** `@circle-fin/modular-wallets-core` v1.0.16.
* **Architecture:** ERC-4337 smart contract accounts using ERC-6900 modular plugins (`circle_6900_v1`) with WebAuthn P-256 Passkeys managed by `CIRCLE_WEIGHTED_WEB_AUTHN_MULTISIG_PLUGIN`.
* **Signing Flow:**
  When `account.signMessage({ message })` is called:
  1. The SDK hashes the message via `hashMessage(message)`.
  2. It wraps the hash via `toReplaySafeHash({ address, chainId, hash })` using an EIP-712 domain separator bound to `CIRCLE_WEIGHTED_WEB_AUTHN_MULTISIG_PLUGIN`.
  3. The passkey signs the challenge with P-256.
  4. The signature is encoded with WebAuthn metadata (`authenticatorData`, `clientDataJSON`, `r`, `s`) and wrapped with Circle's plugin prefix.

### Counterfactual Account Blocker
1. **Un-deployed Smart Accounts:** When a user creates a new wallet via Passkey in `usePasskeyAuth`, the smart account is **counterfactual** (not deployed on Arc Testnet until their first transaction, such as name registration).
2. **Missing ERC-6492 Wrapper:** Circle's `signMessage` does not wrap signatures with the ERC-6492 magic suffix (`0x6492...`) or factory calldata.
3. **RPC Verification Failure:** Calling standard `arcPublicClient.verifyMessage()` on Arc Testnet (`5042002`) checks `getCode(address)`, sees `0x` (un-deployed), falls back to standard ECDSA recovery, and fails on the WebAuthn signature.
4. **Current Interim State:**
   - To prevent false promises and failed transactions, remote profile writes remain **disabled** in `src/lib/profile.ts`.
   - Local profile caching (`localStorage`, memory store) remains fully operational.
   - The Edge Function and database schema are hardened with full payload binding and challenge protection, ready for integration once Circle deployed-account verification is wired.

---

## 3. Database Migration & Deployment Instructions

> [!IMPORTANT]
> Do NOT run migrations or deploy Edge Functions until approved. Follow these manual steps when ready.

### Step 1: Run SQL in Supabase Dashboard
1. Open your [Supabase Dashboard](https://app.supabase.com) and navigate to project `zytmsjuprufxfgvpxfyt`.
2. Go to **SQL Editor** in the left sidebar.
3. Paste the contents of [`supabase_setup.sql`](../supabase_setup.sql).
4. Click **Run**.
   - Applies RLS on all tables.
   - Revokes public writes on `user_profiles`.
   - Creates `auth_challenges` table with strict private RLS.
   - Establishes column-level `GRANT SELECT` on only public columns.
   - Non-destructively mirrors existing emails to `user_private_profiles` without dropping the column.

### Step 2: Deploy the Edge Function (Optional / When Ready)
```bash
# Link project
npx supabase link --project-ref zytmsjuprufxfgvpxfyt

# Deploy the hardened update-profile Edge Function
npx supabase functions deploy update-profile --no-verify-jwt
```
*Note: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by the Supabase Edge Functions runtime.*

---

## 4. Verification & Testing Summary

* **Automated Security Test:** `node scripts/test_profile_security.mjs`
  - Validates static SQL invariants and column grants.
  - Tests canonical payload hashing.
  - Tests payload tampering detection.
  - Tests wallet mismatch rejection.
  - Tests challenge expiration rejection.
  - Tests atomic challenge reuse / replay rejection.
  - Tests input validation (URL schemes, field length limits).
