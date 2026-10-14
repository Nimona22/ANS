import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { createPublicClient, http, type Address, isAddress } from 'https://esm.sh/viem@2.9.20';

/**
 * ANS get-notifications Edge Function
 * ====================================
 * Serves notification reads and mark-read operations for verified wallet owners.
 *
 * Security model:
 *   - Accepts wallet address, a server-issued challenge, a signed message, and a signature.
 *   - Validates the challenge was server-issued, unexpired, and not yet consumed.
 *   - Verifies the ERC-1271 / personal_sign signature on Arc Testnet via verifyMessage.
 *   - Only after successful verification does it read or update notifications using
 *     the service-role key (bypassing RLS on the locked-down notifications table).
 *
 * Supported actions (POST JSON body):
 *   { action: 'request_challenge', walletAddress: '0x...' }
 *     → Returns a single-use challenge string the client must sign.
 *
 *   { action: 'fetch', walletAddress, challenge, message, signature }
 *     → Returns up to 50 most-recent notifications for the wallet.
 *
 *   { action: 'mark_read', walletAddress, challenge, message, signature, id?: string }
 *     → Marks one notification (by id) or all notifications as read.
 *       If `id` is omitted, all unread notifications for the wallet are marked read.
 *
 * Note on Circle counterfactual accounts:
 *   Circle smart accounts that have never been deployed on-chain cannot satisfy
 *   ERC-1271 signature verification because the contract does not exist yet.
 *   In that case, verifyMessage will fail and return 401. This matches the same
 *   behavior as the `update-profile` Edge Function and is the correct fail-closed
 *   response — we cannot verify ownership without an on-chain contract or JWT.
 *
 *   If the app needs to support counterfactual accounts, a Circle-specific
 *   challenge flow (using Circle's API to verify the passkey) must be added.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ARC_TESTNET_CHAIN_ID = 5042002;
const CHALLENGE_TTL_SECONDS = 120; // 2 minutes
const CHALLENGE_OPERATION = 'GET_NOTIFICATIONS';

const arcPublicClient = createPublicClient({
  chain: {
    id: ARC_TESTNET_CHAIN_ID,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  },
  transport: http('https://rpc.testnet.arc.io', { timeout: 10_000 }),
});

/**
 * Builds the canonical message the client must sign.
 * Bound to wallet, chain, challenge, action, and timestamp to prevent replay.
 */
function buildChallengeMessage(walletAddress: string, challenge: string): string {
  return [
    'Arc Name Service Notification Access',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Chain ID: ${ARC_TESTNET_CHAIN_ID}`,
    `Challenge: ${challenge}`,
    `Action: ${CHALLENGE_OPERATION}`,
  ].join('\n');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Atomically consume a valid, unexpired, unclaimed challenge for the given wallet.
 * Returns true on success, false on any validation failure.
 */
async function consumeChallenge(
  supabaseAdmin: ReturnType<typeof createClient>,
  challenge: string,
  walletAddress: string
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('auth_challenges')
    .update({ consumed_at: nowIso })
    .eq('challenge', challenge)
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('operation', CHALLENGE_OPERATION)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .select('id')
    .maybeSingle();

  return !error && data !== null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[CONFIG ERROR] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Request body must be a JSON object' }, 400);
    }

    const action = (body.action as string) || 'fetch';

    // =========================================================================
    // ACTION: REQUEST CHALLENGE
    // =========================================================================
    if (action === 'request_challenge') {
      const walletAddress = body.walletAddress as string | undefined;
      if (!walletAddress || !isAddress(walletAddress)) {
        return jsonResponse({ error: 'A valid walletAddress is required' }, 400);
      }
      const normalized = walletAddress.toLowerCase();

      // Rate limit: max 5 active challenges per wallet per 60 seconds
      const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from('auth_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('wallet_address', normalized)
        .eq('operation', CHALLENGE_OPERATION)
        .gt('created_at', oneMinuteAgo);

      if ((count ?? 0) >= 5) {
        return jsonResponse({ error: 'Too many challenge requests. Please wait a moment.' }, 429);
      }

      const challenge = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
      const message = buildChallengeMessage(normalized, challenge);

      const { error: insertErr } = await supabaseAdmin.from('auth_challenges').insert({
        challenge,
        wallet_address: normalized,
        operation: CHALLENGE_OPERATION,
        expires_at: expiresAt,
      });

      if (insertErr) {
        console.error('[DB ERROR] Failed to record auth challenge:', insertErr.message);
        return jsonResponse({ error: 'Failed to generate challenge' }, 500);
      }

      return jsonResponse({ success: true, challenge, message, expiresAt });
    }

    // =========================================================================
    // SHARED: verify wallet ownership for fetch / mark_read actions
    // =========================================================================
    if (action === 'fetch' || action === 'mark_read') {
      const { walletAddress, challenge, message, signature } = body as {
        walletAddress?: unknown;
        challenge?: unknown;
        message?: unknown;
        signature?: unknown;
        id?: unknown;
      };

      if (!walletAddress || !challenge || !message || !signature) {
        return jsonResponse(
          { error: 'walletAddress, challenge, message, and signature are required' },
          400
        );
      }
      if (
        typeof walletAddress !== 'string' ||
        typeof challenge !== 'string' ||
        typeof message !== 'string' ||
        typeof signature !== 'string'
      ) {
        return jsonResponse(
          { error: 'walletAddress, challenge, message, and signature must be valid strings' },
          400
        );
      }
      if (!isAddress(walletAddress)) {
        return jsonResponse({ error: 'Invalid wallet address format' }, 400);
      }
      if (!signature.startsWith('0x') || signature.length < 4) {
        return jsonResponse(
          { error: 'Signature must be a hex string starting with 0x' },
          400
        );
      }

      const normalized = walletAddress.toLowerCase();

      // Validate the message structure — prevents arbitrary message substitution
      const expectedMessage = buildChallengeMessage(normalized, challenge);
      if (message !== expectedMessage) {
        return jsonResponse(
          { error: 'Message does not match expected canonical format for this challenge' },
          400
        );
      }

      // Atomically consume the challenge (prevents replay attacks)
      const consumed = await consumeChallenge(supabaseAdmin, challenge, normalized);
      if (!consumed) {
        return jsonResponse(
          { error: 'Challenge is invalid, expired, or has already been consumed' },
          401
        );
      }

      // Verify ERC-1271 / personal_sign signature on Arc Testnet
      let isValidSignature = false;
      try {
        isValidSignature = await arcPublicClient.verifyMessage({
          address: normalized as Address,
          message,
          signature: signature as `0x${string}`,
        });
      } catch (verifyErr: unknown) {
        const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
        console.warn(
          `[VERIFY WARNING] Signature verification error for ${normalized}:`,
          msg,
          '(Note: counterfactual Circle smart accounts require on-chain deployment before ERC-1271 validation succeeds)'
        );
        isValidSignature = false;
      }

      if (!isValidSignature) {
        // Distinguish undeployed counterfactual smart accounts from signature forgery
        let isDeployed = true;
        try {
          const bytecode = await arcPublicClient.getBytecode({ address: normalized as Address });
          isDeployed = Boolean(bytecode && bytecode !== '0x');
        } catch {
          // If RPC check fails, fall through to default 401
        }

        if (!isDeployed) {
          return jsonResponse(
            {
              error: 'ACCOUNT_NOT_DEPLOYED',
              message:
                'Circle smart account is not yet deployed on Arc Testnet. In-app notifications will become available once your wallet is activated by its first on-chain transaction.',
            },
            403
          );
        }

        return jsonResponse({ error: 'Cryptographic ownership verification failed' }, 401);
      }

      // -----------------------------------------------------------------------
      // ACTION: FETCH notifications
      // -----------------------------------------------------------------------
      if (action === 'fetch') {
        const { data, error: fetchErr } = await supabaseAdmin
          .from('notifications')
          .select('id, recipient_address, kind, title, body, link, tx_hash, is_read, created_at')
          .eq('recipient_address', normalized)
          .order('created_at', { ascending: false })
          .limit(50);

        if (fetchErr) {
          console.error('[DB ERROR] Failed to fetch notifications:', fetchErr.message);
          return jsonResponse({ error: 'Failed to fetch notifications' }, 500);
        }

        return jsonResponse({ success: true, notifications: data ?? [] });
      }

      // -----------------------------------------------------------------------
      // ACTION: MARK_READ
      // -----------------------------------------------------------------------
      if (action === 'mark_read') {
        const rawId = (body as { id?: unknown }).id;
        if (rawId !== undefined && (typeof rawId !== 'string' || !rawId.trim())) {
          return jsonResponse({ error: 'id must be a non-empty string when provided' }, 400);
        }
        const id = typeof rawId === 'string' ? rawId.trim() : undefined;

        let updateQuery = supabaseAdmin
          .from('notifications')
          .update({ is_read: true })
          .eq('recipient_address', normalized)
          .eq('is_read', false);

        if (id) {
          updateQuery = updateQuery.eq('id', id);
        }

        const { error: updateErr } = await updateQuery;

        if (updateErr) {
          console.error('[DB ERROR] Failed to mark notifications read:', updateErr.message);
          return jsonResponse({ error: 'Failed to mark notifications as read' }, 500);
        }

        return jsonResponse({ success: true });
      }
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[UNHANDLED ERROR] in get-notifications edge function:', msg);
    return jsonResponse({ error: 'An unexpected internal error occurred' }, 500);
  }
});
