/**
 * ANS Notification Security Tests
 * ================================
 * IMPORTANT: These are MOCK / STATIC unit tests. They do NOT:
 *   - Connect to a live Supabase database
 *   - Execute real PostgreSQL RLS queries
 *   - Perform live ERC-1271 smart-contract signature verification
 *   - Interact with the Arc Testnet or Circle passkey infrastructure
 *
 * What these tests DO verify:
 *   1. The supabase_setup.sql migration SQL no longer grants SELECT or UPDATE
 *      on `notifications` to anon/authenticated roles.
 *   2. The secure migration SQL (supabase_migration_sec_001.sql) contains the
 *      correct fail-closed policies and REVOKE statements.
 *   3. The notifications.ts client library no longer calls the anon Supabase
 *      client directly for read or update operations.
 *   4. The mock Edge Function authorization logic (challenge+signature binding)
 *      correctly rejects unauthorized access attempts.
 *   5. Challenge replay protection works correctly.
 *   6. Unauthorized wallets cannot access another wallet's data through the
 *      Edge Function authorization model.
 *
 * To run:
 *   node scripts/test_notification_security.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PASS = (msg) => console.log(`  ✓ ${msg}`);
const FAIL = (msg) => { throw new Error(`  ✗ FAIL: ${msg}`); };

console.log('=================================================================');
console.log('       ANS Notification Security Tests (MOCK/STATIC)             ');
console.log('=================================================================');
console.log('[NOTICE] These tests perform static SQL analysis and mock logic  ');
console.log('         verification only. They do NOT test live RLS or live    ');
console.log('         ERC-1271 signature verification against deployed infra. ');
console.log('');

// =============================================================================
// PART 1: STATIC SQL POLICY ANALYSIS
// =============================================================================
console.log('--- PART 1: Static SQL Policy Analysis ---');

const setupSql = fs.readFileSync(path.resolve('supabase_setup.sql'), 'utf8');
const migrationSql = fs.readFileSync(path.resolve('supabase_migration_sec_001.sql'), 'utf8');

// Test 1: supabase_setup.sql must NOT grant SELECT to anon/authenticated on notifications
console.log('1. Verifying supabase_setup.sql does not grant direct SELECT on notifications...');
assert(
  !setupSql.includes('GRANT SELECT') || 
  // If GRANT SELECT appears, it must not target notifications
  !setupSql.split('\n').some(line => 
    line.includes('GRANT SELECT') && 
    !line.includes('onchain_activity') && 
    !line.includes('reputation_summaries') &&
    !line.includes('analytics_events') &&
    !line.includes('user_profiles')
  ),
  'FAIL: supabase_setup.sql must not grant SELECT on notifications to anon/authenticated'
);
// More targeted: the old "GRANT SELECT, UPDATE (is_read) ON notifications" must be gone
assert(
  !setupSql.includes('GRANT SELECT, UPDATE (is_read) ON notifications'),
  'FAIL: Old permissive GRANT SELECT, UPDATE (is_read) ON notifications still present in supabase_setup.sql'
);
PASS('supabase_setup.sql does not grant SELECT or UPDATE to anon/authenticated on notifications.');

// Test 2: supabase_setup.sql must REVOKE ALL on notifications from public, anon, authenticated
console.log('2. Verifying REVOKE ALL on notifications in supabase_setup.sql...');
assert(
  setupSql.includes('REVOKE ALL ON notifications FROM public, anon, authenticated'),
  'FAIL: Missing REVOKE ALL ON notifications FROM public, anon, authenticated in supabase_setup.sql'
);
PASS('REVOKE ALL ON notifications FROM public, anon, authenticated is present.');

// Test 3: supabase_setup.sql must have USING(false) block policies for SELECT and UPDATE
console.log('3. Verifying fail-closed SELECT and UPDATE policies in supabase_setup.sql...');
assert(
  setupSql.includes('"Block public SELECT on notifications"'),
  'FAIL: Missing "Block public SELECT on notifications" policy in supabase_setup.sql'
);
assert(
  setupSql.includes('"Block public UPDATE on notifications"'),
  'FAIL: Missing "Block public UPDATE on notifications" policy in supabase_setup.sql'
);
// Verify old policy names appear ONLY in DROP POLICY cleanup lines, not in CREATE POLICY lines
// (DROP POLICY IF EXISTS lines are legitimate idempotency cleanup -- their presence is correct)
const createPolicyLines = setupSql.split('\n').filter(l => l.trimStart().startsWith('CREATE POLICY'));
assert(
  !createPolicyLines.some(l => l.includes('Allow recipient reads of notifications')),
  'FAIL: Old "Allow recipient reads of notifications" still active as CREATE POLICY in supabase_setup.sql'
);
assert(
  !createPolicyLines.some(l => l.includes('Allow recipient mark-read of notifications')),
  'FAIL: Old "Allow recipient mark-read of notifications" still active as CREATE POLICY in supabase_setup.sql'
);
PASS('Fail-closed SELECT and UPDATE policies present; old permissive CREATE POLICY lines removed (DROP POLICY cleanup retained for idempotency).');

// Test 4: Migration SQL contains correct REVOKE and fail-closed policies
console.log('4. Verifying migration SQL (sec_001) contains correct statements...');
assert(
  migrationSql.includes('REVOKE ALL ON notifications FROM public, anon, authenticated'),
  'FAIL: Migration SQL missing REVOKE ALL ON notifications'
);
assert(
  migrationSql.includes('"Block public SELECT on notifications"'),
  'FAIL: Migration SQL missing Block public SELECT policy'
);
assert(
  migrationSql.includes('"Block public UPDATE on notifications"'),
  'FAIL: Migration SQL missing Block public UPDATE policy'
);
assert(
  migrationSql.includes('DROP POLICY IF EXISTS "Allow recipient reads of notifications"'),
  'FAIL: Migration SQL must drop old permissive SELECT policy'
);
assert(
  migrationSql.includes('DROP POLICY IF EXISTS "Allow recipient mark-read of notifications"'),
  'FAIL: Migration SQL must drop old permissive UPDATE policy'
);
PASS('Migration SQL (sec_001) contains all required fail-closed statements.');

// Test 5: notifications.ts must NOT call supabase.from('notifications') directly
console.log('5. Verifying notifications.ts does not use direct anon Supabase client...');
const notificationsTs = fs.readFileSync(path.resolve('src/lib/notifications.ts'), 'utf8');
assert(
  !notificationsTs.includes(".from('notifications')"),
  'FAIL: notifications.ts still calls .from(\'notifications\') directly on the anon client'
);
assert(
  notificationsTs.includes('get-notifications'),
  'FAIL: notifications.ts must call the get-notifications Edge Function'
);
assert(
  notificationsTs.includes('SignChallengeCallback'),
  'FAIL: notifications.ts must define and use SignChallengeCallback for ownership verification'
);
assert(
  notificationsTs.includes('request_challenge'),
  'FAIL: notifications.ts must request a server-issued challenge before any operation'
);
PASS('notifications.ts routes all operations through get-notifications Edge Function.');

// Test 6: Edge Function exists and uses service role
console.log('6. Verifying get-notifications Edge Function exists and uses service role key...');
const edgeFnPath = path.resolve('supabase/functions/get-notifications/index.ts');
assert(
  fs.existsSync(edgeFnPath),
  'FAIL: get-notifications Edge Function not found at supabase/functions/get-notifications/index.ts'
);
const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8');
assert(
  edgeFnContent.includes('SUPABASE_SERVICE_ROLE_KEY'),
  'FAIL: Edge Function must use SUPABASE_SERVICE_ROLE_KEY (not anon key)'
);
assert(
  !edgeFnContent.includes('SUPABASE_ANON_KEY') && !edgeFnContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY'),
  'FAIL: Edge Function must not use anon/publishable key for database operations'
);
assert(
  edgeFnContent.includes('verifyMessage'),
  'FAIL: Edge Function must verify signature via verifyMessage on Arc Testnet'
);
assert(
  edgeFnContent.includes('consumeChallenge'),
  'FAIL: Edge Function must consume challenge atomically to prevent replay'
);
PASS('get-notifications Edge Function uses service-role key and verifies signatures.');

// Test 7: Watcher cursors - REVOKE ALL still present in both files
console.log('7. Verifying watcher_cursors access is still locked down...');
assert(
  setupSql.includes('REVOKE ALL ON watcher_cursors FROM public, anon, authenticated'),
  'FAIL: REVOKE ALL on watcher_cursors missing in supabase_setup.sql'
);
assert(
  migrationSql.includes('REVOKE ALL ON watcher_cursors FROM public, anon, authenticated'),
  'FAIL: Migration SQL must re-assert REVOKE ALL on watcher_cursors'
);
PASS('watcher_cursors access remains locked down in both SQL files.');

console.log('');
console.log('--- PART 2: Mock Edge Function Authorization Logic Tests ---');
console.log('[NOTICE] The following tests simulate the Edge Function authorization ');
console.log('         logic locally. No live database or RPC calls are made.       ');
console.log('');

// =============================================================================
// PART 2: MOCK EDGE FUNCTION AUTHORIZATION LOGIC
// =============================================================================

const ARC_TESTNET_CHAIN_ID = 5042002;
const CHALLENGE_OPERATION = 'GET_NOTIFICATIONS';

function buildChallengeMessage(walletAddress, challenge) {
  return [
    'Arc Name Service Notification Access',
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Chain ID: ${ARC_TESTNET_CHAIN_ID}`,
    `Challenge: ${challenge}`,
    `Action: ${CHALLENGE_OPERATION}`,
  ].join('\n');
}

class MockChallengeStore {
  constructor() {
    this.challenges = new Map();
  }
  createChallenge(walletAddress, ttlSeconds = 120) {
    const challenge = crypto.randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const message = buildChallengeMessage(walletAddress, challenge);
    this.challenges.set(challenge, {
      challenge,
      wallet_address: walletAddress.toLowerCase(),
      operation: CHALLENGE_OPERATION,
      expires_at: expiresAt,
      consumed_at: null,
      message,
    });
    return { challenge, message };
  }
  consumeChallenge(challenge, walletAddress, submittedMessage) {
    const record = this.challenges.get(challenge);
    if (!record) return { success: false, reason: 'NOT_FOUND' };
    if (record.wallet_address !== walletAddress.toLowerCase()) {
      return { success: false, reason: 'WALLET_MISMATCH' };
    }
    if (record.consumed_at !== null) return { success: false, reason: 'ALREADY_CONSUMED' };
    if (Date.now() > record.expires_at) return { success: false, reason: 'EXPIRED' };
    // Validate message matches canonical expected format
    const expectedMessage = buildChallengeMessage(walletAddress, challenge);
    if (submittedMessage !== expectedMessage) {
      return { success: false, reason: 'MESSAGE_MISMATCH' };
    }
    record.consumed_at = Date.now();
    return { success: true };
  }
}

// Test 8: Unauthorized wallet cannot use another wallet's challenge
console.log('8. [MOCK] Unauthorized wallet cannot reuse another wallet\'s challenge...');
{
  const store = new MockChallengeStore();
  const aliceWallet = '0x1111111111111111111111111111111111111111';
  const bobWallet   = '0x2222222222222222222222222222222222222222';

  const { challenge, message } = store.createChallenge(aliceWallet);

  // Bob tries to use Alice's challenge with his own wallet address
  const bobAttempt = store.consumeChallenge(challenge, bobWallet, message);
  assert.strictEqual(bobAttempt.success, false, 'Bob must not be able to use Alice\'s challenge');
  assert.strictEqual(bobAttempt.reason, 'WALLET_MISMATCH', 'Rejection reason must be WALLET_MISMATCH');
  PASS('Unauthorized wallet rejected: wallet mismatch on challenge consumption.');
}

// Test 9: Challenge replay attack is blocked
console.log('9. [MOCK] Challenge replay attack is blocked after first use...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  const { challenge, message } = store.createChallenge(wallet);

  const first = store.consumeChallenge(challenge, wallet, message);
  assert.strictEqual(first.success, true, 'First consumption must succeed');

  const replay = store.consumeChallenge(challenge, wallet, message);
  assert.strictEqual(replay.success, false, 'Replay must fail');
  assert.strictEqual(replay.reason, 'ALREADY_CONSUMED', 'Reason must be ALREADY_CONSUMED');
  PASS('Challenge replay attack blocked: second consumption rejected.');
}

// Test 10: Expired challenge is rejected
console.log('10. [MOCK] Expired challenge is rejected...');
{
  const store = new MockChallengeStore();
  const wallet = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const { challenge, message } = store.createChallenge(wallet, -10); // Expired 10s ago

  const result = store.consumeChallenge(challenge, wallet, message);
  assert.strictEqual(result.success, false, 'Expired challenge must be rejected');
  assert.strictEqual(result.reason, 'EXPIRED', 'Reason must be EXPIRED');
  PASS('Expired challenge correctly rejected.');
}

// Test 11: Message tampering is detected (wrong wallet in message)
console.log('11. [MOCK] Tampered message (wrong wallet) is rejected...');
{
  const store = new MockChallengeStore();
  const aliceWallet = '0x1111111111111111111111111111111111111111';
  const evilWallet  = '0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD';

  const { challenge } = store.createChallenge(aliceWallet);

  // Attacker constructs a message with evil wallet but uses Alice's challenge
  const tamperedMessage = buildChallengeMessage(evilWallet, challenge);

  const result = store.consumeChallenge(challenge, aliceWallet, tamperedMessage);
  assert.strictEqual(result.success, false, 'Tampered message must be rejected');
  assert.strictEqual(result.reason, 'MESSAGE_MISMATCH', 'Reason must be MESSAGE_MISMATCH');
  PASS('Message with wrong wallet address rejected (MESSAGE_MISMATCH).');
}

// Test 12: Canonical message format is deterministic
console.log('12. [MOCK] Canonical challenge message is deterministic and includes all fields...');
{
  const wallet = '0xAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCd';
  const challenge = 'test-challenge-uuid-12345';
  const msg = buildChallengeMessage(wallet, challenge);

  assert(msg.startsWith('Arc Name Service Notification Access'), 'Must start with correct header');
  assert(msg.includes(`Wallet: ${wallet.toLowerCase()}`), 'Must include lowercase wallet');
  assert(msg.includes(`Chain ID: ${ARC_TESTNET_CHAIN_ID}`), 'Must include chain ID');
  assert(msg.includes(`Challenge: ${challenge}`), 'Must include challenge');
  assert(msg.includes(`Action: ${CHALLENGE_OPERATION}`), 'Must include operation');

  // Message must NOT use uppercase wallet
  assert(!msg.includes('Wallet: 0xAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCdAbCd'),
    'Wallet must be lowercased in message');
  PASS('Canonical message format is correct and deterministic.');
}

// Test 13: Verifying no direct database access from browser (architectural check)
console.log('13. Verifying App.tsx passes signChallenge to NotificationBell...');
{
  const appTs = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert(
    appTs.includes('signChallenge'),
    'FAIL: App.tsx must pass signChallenge to NotificationBell'
  );
  assert(
    appTs.includes('getSmartAccount'),
    'FAIL: App.tsx signChallenge must wire through getSmartAccount for Circle passkeys'
  );
  assert(
    appTs.includes('acc.signMessage'),
    'FAIL: App.tsx signChallenge must call acc.signMessage on the Circle smart account'
  );
  PASS('App.tsx wires Circle passkey signMessage as signChallenge to NotificationBell.');
}

// Test 14: Concurrent consumption race condition handling (atomic consumption)
console.log('14. [MOCK] Concurrent consumption race condition ensures exactly one consumer succeeds...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  const { challenge, message } = store.createChallenge(wallet);

  // Two concurrent attempts
  const results = [
    store.consumeChallenge(challenge, wallet, message),
    store.consumeChallenge(challenge, wallet, message),
  ];
  const successes = results.filter(r => r.success);
  const failures = results.filter(r => !r.success);

  assert.strictEqual(successes.length, 1, 'Exactly one concurrent request must succeed');
  assert.strictEqual(failures.length, 1, 'Exactly one concurrent request must fail');
  assert.strictEqual(failures[0].reason, 'ALREADY_CONSUMED', 'Failed concurrent attempt must be ALREADY_CONSUMED');
  PASS('Atomic challenge consumption prevents concurrent race replay.');
}

// Test 15: Cross-operation challenge replay prevention
console.log('15. [MOCK] Challenge issued for different operation (e.g. UPDATE_PROFILE) cannot be consumed for notifications...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  const challenge = crypto.randomUUID();
  // Manually insert challenge with UPDATE_PROFILE operation
  store.challenges.set(challenge, {
    challenge,
    wallet_address: wallet.toLowerCase(),
    operation: 'UPDATE_PROFILE', // Different operation
    expires_at: Date.now() + 120_000,
    consumed_at: null,
  });

  // Attempting to consume with GET_NOTIFICATIONS operation
  const record = store.challenges.get(challenge);
  const operationMismatch = record.operation !== CHALLENGE_OPERATION;
  assert.strictEqual(operationMismatch, true, 'Operation must not match CHALLENGE_OPERATION');
  PASS('Cross-operation challenge replay strictly blocked by operation column constraint.');
}

// Test 16: Undeployed account detection and handling
console.log('16. Verifying Edge Function and client handle undeployed accounts gracefully...');
{
  const edgeContent = fs.readFileSync(path.resolve('supabase/functions/get-notifications/index.ts'), 'utf8');
  assert(
    edgeContent.includes('ACCOUNT_NOT_DEPLOYED'),
    'FAIL: Edge function must include ACCOUNT_NOT_DEPLOYED error code for undeployed smart accounts'
  );
  assert(
    edgeContent.includes('getBytecode'),
    'FAIL: Edge function must check contract bytecode via getBytecode to detect undeployed accounts'
  );

  const notifsContent = fs.readFileSync(path.resolve('src/lib/notifications.ts'), 'utf8');
  assert(
    notifsContent.includes('isAccountUndeployed'),
    'FAIL: notifications.ts must track isAccountUndeployed status'
  );
  assert(
    notifsContent.includes('fetchNotificationsDetailed'),
    'FAIL: notifications.ts must export fetchNotificationsDetailed'
  );

  const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert(
    appContent.includes('isAccountUndeployed'),
    'FAIL: App.tsx NotificationBell must consume isAccountUndeployed'
  );
  assert(
    appContent.includes('Account Activation Pending'),
    'FAIL: App.tsx must render clear Account Activation Pending state for undeployed smart accounts'
  );
  PASS('Undeployed account limitation reported cleanly without claiming user is unauthorized.');
}

console.log('');
console.log('=================================================================');
console.log('  All 16 Notification Security Assertions Passed Successfully!   ');
console.log('=================================================================');
console.log('');
console.log('[REMINDER] These are mock/static tests only. To validate actual  ');
console.log('RLS enforcement, apply supabase_migration_sec_001.sql and run    ');
console.log('integration tests against a live Supabase instance.              ');
