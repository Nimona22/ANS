import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0';
import { createPublicClient, http, type Address } from 'https://esm.sh/viem@2.9.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Arc Testnet RPC client for signature and ERC-1271/ERC-6492 validation
const arcPublicClient = createPublicClient({
  chain: {
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  },
  transport: http('https://rpc.testnet.arc.io'),
});

interface UpdateProfileRequest {
  walletAddress: string;
  profile: {
    displayName?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    twitter?: string | null;
    website?: string | null;
  };
  message: string;
  signature: `0x${string}`;
}

serve(async (req) => {
  // 1. Handle CORS preflight
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
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service role credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: UpdateProfileRequest = await req.json();
    const { walletAddress, profile, message, signature } = body;

    if (!walletAddress || !message || !signature) {
      return new Response(
        JSON.stringify({ error: 'walletAddress, message, and signature are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Validate message format and timestamp to prevent replay attacks
    // Expected message format: "Update ANS Profile for <walletAddress> at <timestamp>"
    const match = message.match(/Update ANS Profile for (0x[a-fA-F0-9]{40}) at (\d+)/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication message structure' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const msgAddress = match[1].toLowerCase();
    const timestamp = parseInt(match[2], 10);
    const now = Math.floor(Date.now() / 1000);

    if (msgAddress !== walletAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Message address mismatch' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reject challenges older than 5 minutes or in the future by > 60 seconds
    if (Math.abs(now - timestamp) > 300) {
      return new Response(
        JSON.stringify({ error: 'Signature challenge has expired. Please try again.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Cryptographically verify wallet ownership
    // viem's verifyMessage natively supports:
    // - Standard ECDSA signatures (EOAs)
    // - ERC-1271 (smart contract accounts like deployed Circle Modular Accounts)
    // - ERC-6492 (counterfactual smart accounts before first onchain transaction)
    const isValid = await arcPublicClient.verifyMessage({
      address: walletAddress as Address,
      message,
      signature,
    });

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: 'Cryptographic ownership verification failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Verification successful: persist using Supabase Service Role client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const safePayload = {
      wallet_address: walletAddress.toLowerCase(),
      display_name: profile.displayName || null,
      bio: profile.bio || null,
      avatar_url: profile.avatarUrl || null,
      banner_url: profile.bannerUrl || null,
      twitter: profile.twitter || null,
      website: profile.website || null,
      updated_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabaseAdmin
      .from('user_profiles')
      .upsert(safePayload, { onConflict: 'wallet_address' });

    if (dbError) {
      console.error('Database write error:', dbError);
      return new Response(
        JSON.stringify({ error: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Profile updated successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Unhandled error in update-profile edge function:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
