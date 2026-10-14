/**
 * Test script for deployed Supabase Edge Function `get-notifications`
 * 
 * Verifies live HTTP behavior:
 *   1. Unsupported HTTP methods (GET) are rejected (405).
 *   2. Invalid actions are rejected (400).
 *   3. Malformed wallet addresses are rejected (400).
 *   4. Valid challenge requests succeed and return canonical message & UUID (200).
 *   5. Missing signatures are rejected (400).
 *   6. Malformed signatures are rejected (400).
 *   7. Invalid / forged signatures are rejected (401/403).
 *   8. Ephemeral controlled wallet can sign and consume a challenge once (200).
 *   9. Replaying a consumed challenge is rejected (401).
 *
 * SAFETY:
 *   - Uses an ephemeral in-memory test wallet generated for this test run.
 *   - Does NOT expose secret keys or private keys.
 *   - Does NOT modify application code or database schemas.
 */

import fs from 'node:fs';
import path from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Parse .env for public config
const envPath = path.resolve('.env');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

function getEnvVar(key) {
  const match = envContent.match(new RegExp(`^${key}\\s*=\\s*['"]?([^'"\\r\\n]+)`, 'm'));
  return match ? match[1].trim() : process.env[key];
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL') || 'https://zytmsjuprufxfgvpxfyt.supabase.co';
const anonKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || '';
const endpointUrl = `${supabaseUrl}/functions/v1/get-notifications`;

console.log('=================================================================');
console.log('       Testing Deployed Supabase Edge Function: get-notifications');
console.log('=================================================================');
console.log(`Endpoint: ${endpointUrl}`);
console.log(`API Key:  [REDACTED, length: ${anonKey.length}]`);
console.log('');

const headers = {
  'Content-Type': 'application/json',
  apikey: anonKey,
};

let passed = 0;
let total = 0;

function reportResult(name, success, details) {
  total++;
  if (success) {
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } else {
    console.log(`  ✗ [FAIL] ${name}`);
  }
  if (details) {
    console.log(`     Details: ${details}`);
  }
}

async function run() {
  // Test 1: Unsupported HTTP method (GET)
  {
    console.log('1. Testing unsupported HTTP method (GET)...');
    const res = await fetch(endpointUrl, {
      method: 'GET',
      headers: { apikey: anonKey },
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 405 && body.error === 'Method not allowed';
    reportResult(
      'GET method rejected with HTTP 405',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 2: Invalid action
  {
    console.log('2. Testing invalid action...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'unsupported_test_action' }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 400 && typeof body.error === 'string' && body.error.includes('Unknown action');
    reportResult(
      'Invalid action rejected with HTTP 400',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 3: Malformed wallet address
  {
    console.log('3. Testing malformed wallet address in request_challenge...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'request_challenge',
        walletAddress: '0xinvalid_address_format',
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 400 && body.error === 'A valid walletAddress is required';
    reportResult(
      'Malformed wallet address rejected with HTTP 400',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Generate ephemeral controlled test wallet for signature tests
  const ephemeralPriv = generatePrivateKey();
  const testAccount = privateKeyToAccount(ephemeralPriv);
  console.log(`[INFO] Created ephemeral test account: ${testAccount.address} (controlled by test script)`);

  // Test 4: Valid challenge request
  let challengeRecord = null;
  {
    console.log('4. Testing valid challenge request...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'request_challenge',
        walletAddress: testAccount.address,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok =
      res.status === 200 &&
      body.success === true &&
      typeof body.challenge === 'string' &&
      typeof body.message === 'string' &&
      typeof body.expiresAt === 'string';
    if (ok) challengeRecord = body;
    reportResult(
      'Challenge request returns valid challenge & message (HTTP 200)',
      ok,
      `Status ${res.status}, challenge: [UUID], expiresAt: ${body.expiresAt}`
    );
  }

  // Test 5: Missing signature in fetch
  {
    console.log('5. Testing missing signature in fetch...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        walletAddress: testAccount.address,
        challenge: '00000000-0000-0000-0000-000000000000',
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 400 && typeof body.error === 'string' && body.error.includes('required');
    reportResult(
      'Fetch with missing signature rejected with HTTP 400',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 6: Missing signature in mark_read
  {
    console.log('6. Testing missing signature in mark_read...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'mark_read',
        walletAddress: testAccount.address,
        challenge: '00000000-0000-0000-0000-000000000000',
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 400 && typeof body.error === 'string' && body.error.includes('required');
    reportResult(
      'Mark_read with missing signature rejected with HTTP 400',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 7: Malformed hex signature
  {
    console.log('7. Testing malformed signature format (non-hex)...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        walletAddress: testAccount.address,
        challenge: '00000000-0000-0000-0000-000000000000',
        message: 'invalid_format',
        signature: 'not_a_hex_signature',
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 400 && typeof body.error === 'string' && body.error.includes('hex string');
    reportResult(
      'Non-hex signature rejected with HTTP 400',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 8: Invalid / forged signature with valid challenge
  {
    console.log('8. Testing forged signature on valid challenge...');
    // Request fresh challenge
    const chalRes = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'request_challenge',
        walletAddress: testAccount.address,
      }),
    });
    const chalData = await chalRes.json();
    
    // Send forged signature
    const dummySignature = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1b';
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        walletAddress: testAccount.address,
        challenge: chalData.challenge,
        message: chalData.message,
        signature: dummySignature,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = (res.status === 401 || res.status === 403) && typeof body.error === 'string';
    reportResult(
      'Forged signature rejected with HTTP 401/403',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 9: Real signature verification using controlled ephemeral wallet
  let consumedChallenge = null;
  let consumedMessage = null;
  let validSig = null;
  {
    console.log('9. Testing legitimate signature verification with controlled ephemeral wallet...');
    // Request fresh challenge
    const chalRes = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'request_challenge',
        walletAddress: testAccount.address,
      }),
    });
    const chalData = await chalRes.json();
    consumedChallenge = chalData.challenge;
    consumedMessage = chalData.message;

    // Sign message legitimately using our controlled test account
    validSig = await testAccount.signMessage({ message: consumedMessage });

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        walletAddress: testAccount.address,
        challenge: consumedChallenge,
        message: consumedMessage,
        signature: validSig,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 200 && body.success === true && Array.isArray(body.notifications);
    reportResult(
      'Legitimate signature authorized fetch successfully (HTTP 200)',
      ok,
      `Status ${res.status}, notifications count: ${body.notifications?.length}`
    );
  }

  // Test 10: Replaying consumed challenge MUST be rejected
  {
    console.log('10. Testing replay attack using previously consumed challenge...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fetch',
        walletAddress: testAccount.address,
        challenge: consumedChallenge,
        message: consumedMessage,
        signature: validSig,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 401 && typeof body.error === 'string' && body.error.includes('consumed');
    reportResult(
      'Replay attack rejected with HTTP 401 (already consumed)',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 11: mark_read with legitimate signature
  let markReadChallenge = null;
  let markReadMessage = null;
  let markReadSig = null;
  {
    console.log('11. Testing mark_read authorization with legitimate signature...');
    const chalRes = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'request_challenge',
        walletAddress: testAccount.address,
      }),
    });
    const chalData = await chalRes.json();
    markReadChallenge = chalData.challenge;
    markReadMessage = chalData.message;
    markReadSig = await testAccount.signMessage({ message: markReadMessage });

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'mark_read',
        walletAddress: testAccount.address,
        challenge: markReadChallenge,
        message: markReadMessage,
        signature: markReadSig,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 200 && body.success === true;
    reportResult(
      'Legitimate signature authorized mark_read successfully (HTTP 200)',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  // Test 12: Replaying mark_read consumed challenge MUST be rejected
  {
    console.log('12. Testing replay attack on mark_read...');
    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'mark_read',
        walletAddress: testAccount.address,
        challenge: markReadChallenge,
        message: markReadMessage,
        signature: markReadSig,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const ok = res.status === 401 && typeof body.error === 'string' && body.error.includes('consumed');
    reportResult(
      'Replay attack on mark_read rejected with HTTP 401 (already consumed)',
      ok,
      `Status ${res.status}, body: ${JSON.stringify(body)}`
    );
  }

  console.log('');
  console.log('=================================================================');
  console.log(`  Tests completed: ${passed} / ${total} passed`);
  console.log('=================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('[UNHANDLED TEST ERROR]:', err);
  process.exit(1);
});
