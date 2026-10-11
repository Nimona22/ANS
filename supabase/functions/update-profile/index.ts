import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { createPublicClient, http, keccak256, type Address, isAddress } from 'https://esm.sh/viem@2.9.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ARC_TESTNET_CHAIN_ID = 5042002;
const CHALLENGE_TTL_SECONDS = 120; // 2 minutes

// Arc Testnet RPC client
const arcPublicClient = createPublicClient({
  chain: {
    id: ARC_TESTNET_CHAIN_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  },
  transport: http('https://rpc.testnet.arc.io'),
});

export interface SafeProfileInput {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  twitter?: string | null;
  website?: string | null;
}

/**
 * Computes deterministic canonical keccak256 hash of profile payload
 */
export function computeProfilePayloadHash(profile: SafeProfileInput): `0x${string}` {
  const canonical = {
    avatarUrl: (profile?.avatarUrl ?? '').trim(),
    bannerUrl: (profile?.bannerUrl ?? '').trim(),
    bio: (profile?.bio ?? '').trim(),
    displayName: (profile?.displayName ?? '').trim(),
    twitter: (profile?.twitter ?? '').trim().replace(/^@/, ''),
    website: (profile?.website ?? '').trim(),
  };
  const jsonStr = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  return keccak256(encoder.encode(jsonStr));
}

/**
 * Generates the canonical authorization message string bound to wallet, chainId, challenge, and payload
 */
export function buildCanonicalMessage(
  walletAddress: string,
  chainId: number,
  challenge: string,
  payloadHash: string
): string {
  return [
    'Arc Name Service Profile Update',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Chain ID: ${chainId}`,
    `Challenge: ${challenge}`,
    `Payload Hash: ${payloadHash.toLowerCase()}`,
    'Action: UPDATE_PROFILE',
  ].join('\n');
}

/**
 * Strict schema validation for profile fields
 */
function validateProfilePayload(profile: any): { valid: boolean; error?: string; sanitized?: SafeProfileInput } {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { valid: false, error: 'profile must be a valid JSON object' };
  }

  // Display Name: max 50 chars
  if (profile.displayName !== undefined && profile.displayName !== null) {
    if (typeof profile.displayName !== 'string') return { valid: false, error: 'displayName must be a string' };
    if (profile.displayName.length > 50) return { valid: false, error: 'displayName exceeds maximum length of 50 characters' };
  }

  // Bio: max 160 chars
  if (profile.bio !== undefined && profile.bio !== null) {
    if (typeof profile.bio !== 'string') return { valid: false, error: 'bio must be a string' };
    if (profile.bio.length > 160) return { valid: false, error: 'bio exceeds maximum length of 160 characters' };
  }

  // Twitter handle: max 15 alphanumeric + underscore characters
  if (profile.twitter !== undefined && profile.twitter !== null && profile.twitter !== '') {
    if (typeof profile.twitter !== 'string') return { valid: false, error: 'twitter must be a string' };
    const cleaned = profile.twitter.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{1,15}$/.test(cleaned)) {
      return { valid: false, error: 'twitter must be a valid username (1-15 alphanumeric characters or underscores)' };
    }
  }

  // Website: max 200 chars, strictly https://
  if (profile.website !== undefined && profile.website !== null && profile.website !== '') {
    if (typeof profile.website !== 'string') return { valid: false, error: 'website must be a string' };
    if (profile.website.length > 200) return { valid: false, error: 'website exceeds maximum length of 200 characters' };
    if (!/^https:\/\/[^\s$.?#].[^\s]*$/i.test(profile.website.trim())) {
      return { valid: false, error: 'website must begin with https:// and be a valid URL' };
    }
  }

  // Avatar URL: max 300KB data-uri or 500 chars https://
  if (profile.avatarUrl !== undefined && profile.avatarUrl !== null && profile.avatarUrl !== '') {
    if (typeof profile.avatarUrl !== 'string') return { valid: false, error: 'avatarUrl must be a string' };
    if (profile.avatarUrl.length > 350000) return { valid: false, error: 'avatarUrl payload exceeds size limit' };
    const isHttps = /^https:\/\/[^\s$.?#].[^\s]*$/i.test(profile.avatarUrl);
    const isDataUri = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(profile.avatarUrl);
    if (!isHttps && !isDataUri) {
      return { valid: false, error: 'avatarUrl must be a secure https:// link or valid base64 image data URI' };
    }
  }

  // Banner URL: max 700KB data-uri or 500 chars https://
  if (profile.bannerUrl !== undefined && profile.bannerUrl !== null && profile.bannerUrl !== '') {
    if (typeof profile.bannerUrl !== 'string') return { valid: false, error: 'bannerUrl must be a string' };
    if (profile.bannerUrl.length > 750000) return { valid: false, error: 'bannerUrl payload exceeds size limit' };
    const isHttps = /^https:\/\/[^\s$.?#].[^\s]*$/i.test(profile.bannerUrl);
    const isDataUri = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(profile.bannerUrl);
    if (!isHttps && !isDataUri) {
      return { valid: false, error: 'bannerUrl must be a secure https:// link or valid base64 image data URI' };
    }
  }

  return {
    valid: true,
    sanitized: {
      displayName: profile.displayName ? profile.displayName.trim() : null,
      bio: profile.bio ? profile.bio.trim() : null,
      twitter: profile.twitter ? profile.twitter.trim().replace(/^@/, '') : null,
      website: profile.website ? profile.website.trim() : null,
      avatarUrl: profile.avatarUrl ? profile.avatarUrl.trim() : null,
      bannerUrl: profile.bannerUrl ? profile.bannerUrl.trim() : null,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[CONFIG ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const action = body.action || 'submit_update';

    // =========================================================================
    // ACTION 1: REQUEST CHALLENGE (Server-issued, single-use, expiring nonce)
    // =========================================================================
    if (action === 'request_challenge') {
      const { walletAddress } = body;
      if (!walletAddress || typeof walletAddress !== 'string' || !isAddress(walletAddress)) {
        return new Response(
          JSON.stringify({ error: 'A valid walletAddress is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Simple rate limit: max 5 active challenges per wallet created in last 60 seconds
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from('auth_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('wallet_address', normalizedAddress)
        .gt('created_at', oneMinuteAgo);

      if ((count ?? 0) >= 5) {
        return new Response(
          JSON.stringify({ error: 'Too many challenge requests. Please wait a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const challenge = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();

      const { error: insertErr } = await supabaseAdmin.from('auth_challenges').insert({
        challenge,
        wallet_address: normalizedAddress,
        operation: 'UPDATE_PROFILE',
        expires_at: expiresAt,
      });

      if (insertErr) {
        console.error('[DB ERROR] Failed to record auth challenge:', insertErr);
        return new Response(
          JSON.stringify({ error: 'Failed to generate challenge' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          challenge,
          chainId: ARC_TESTNET_CHAIN_ID,
          expiresAt,
          operation: 'UPDATE_PROFILE',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // ACTION 2: SUBMIT UPDATE (Cryptographic validation & atomic consumption)
    // =========================================================================
    if (action === 'submit_update') {
      const { walletAddress, challenge, profile, message, signature } = body;

      if (!walletAddress || !challenge || !profile || !message || !signature) {
        return new Response(
          JSON.stringify({ error: 'walletAddress, challenge, profile, message, and signature are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!isAddress(walletAddress)) {
        return new Response(
          JSON.stringify({ error: 'Invalid wallet address format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // 1. Validate profile fields
      const valResult = validateProfilePayload(profile);
      if (!valResult.valid || !valResult.sanitized) {
        return new Response(
          JSON.stringify({ error: valResult.error || 'Invalid profile data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const sanitized = valResult.sanitized;

      // 2. Compute canonical payload hash
      const computedPayloadHash = computeProfilePayloadHash(sanitized);

      // 3. Verify message structure and bindings
      // Expected canonical format:
      // Arc Name Service Profile Update\nWallet: <0xaddress>\nChain ID: <chainId>\nChallenge: <challenge>\nPayload Hash: <hash>\nAction: UPDATE_PROFILE
      const msgRegex = /^Arc Name Service Profile Update\nWallet: (0x[a-fA-F0-9]{40})\nChain ID: (\d+)\nChallenge: ([a-zA-Z0-9_-]{10,64})\nPayload Hash: (0x[a-fA-F0-9]{64})\nAction: UPDATE_PROFILE$/;
      const match = message.match(msgRegex);
      if (!match) {
        return new Response(
          JSON.stringify({ error: 'Invalid or malformed authentication message format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const [, msgAddress, msgChainIdStr, msgChallenge, msgPayloadHash] = match;

      if (msgAddress.toLowerCase() !== normalizedAddress) {
        return new Response(
          JSON.stringify({ error: 'Message wallet address mismatch' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (parseInt(msgChainIdStr, 10) !== ARC_TESTNET_CHAIN_ID) {
        return new Response(
          JSON.stringify({ error: 'Chain ID mismatch: must be Arc Testnet (5042002)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (msgChallenge !== challenge) {
        return new Response(
          JSON.stringify({ error: 'Challenge in message does not match submission' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (msgPayloadHash.toLowerCase() !== computedPayloadHash.toLowerCase()) {
        return new Response(
          JSON.stringify({ error: 'Payload hash mismatch: signature does not authorize the submitted profile content' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 4. Atomically validate and consume challenge to prevent replay
      const nowIso = new Date().toISOString();
      const { data: consumedChallenge, error: consumeErr } = await supabaseAdmin
        .from('auth_challenges')
        .update({ consumed_at: nowIso })
        .eq('challenge', challenge)
        .eq('wallet_address', normalizedAddress)
        .eq('operation', 'UPDATE_PROFILE')
        .is('consumed_at', null)
        .gt('expires_at', nowIso)
        .select('id')
        .maybeSingle();

      if (consumeErr || !consumedChallenge) {
        return new Response(
          JSON.stringify({ error: 'Challenge is invalid, expired, or has already been consumed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 5. Cryptographically verify signature on Arc Testnet
      let isValidSignature = false;
      try {
        isValidSignature = await arcPublicClient.verifyMessage({
          address: normalizedAddress as Address,
          message,
          signature,
        });
      } catch (verifyErr: any) {
        console.warn(`[VERIFY WARNING] Signature verification execution error for ${normalizedAddress}:`, verifyErr?.message);
        isValidSignature = false;
      }

      if (!isValidSignature) {
        console.warn(`[AUTH FAILED] Signature verification failed for ${normalizedAddress}. (Note: counterfactual Circle smart accounts require on-chain deployment before standard ERC-1271 validation succeeds)`);
        return new Response(
          JSON.stringify({ error: 'Cryptographic ownership verification failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // 6. Signature verified: persist safe profile data using Service Role
      const safePayload = {
        wallet_address: normalizedAddress,
        display_name: sanitized.displayName,
        bio: sanitized.bio,
        avatar_url: sanitized.avatarUrl,
        banner_url: sanitized.bannerUrl,
        twitter: sanitized.twitter,
        website: sanitized.website,
        updated_at: new Date().toISOString(),
      };

      const { error: dbError } = await supabaseAdmin
        .from('user_profiles')
        .upsert(safePayload, { onConflict: 'wallet_address' });

      if (dbError) {
        console.error('[DB ERROR] Database write error:', dbError.message);
        return new Response(
          JSON.stringify({ error: 'Failed to update user profile in database' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Profile updated successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[UNHANDLED ERROR] in update-profile edge function:', err?.message || err);
    return new Response(
      JSON.stringify({ error: 'An unexpected internal error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
