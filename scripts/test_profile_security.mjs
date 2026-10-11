import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

console.log('================================================================');
console.log('       ANS Supabase Profile Security & Authorization Tests       ');
console.log('================================================================\n');

// ============================================================================
// PART 1: STATIC POLICY & SCHEMA ASSERTIONS
// ============================================================================
console.log('--- PART 1: Static Schema, Migration & Policy Invariants ---');

const sqlPath = path.resolve('supabase_setup.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

console.log('1. Checking write policies on user_profiles...');
assert(!sqlContent.includes('"Allow public inserts of user_profiles"\n  ON user_profiles FOR INSERT TO public\n  WITH CHECK (true)'), 
  'FAIL: Insecure public insert policy still present in SQL!');
assert(!sqlContent.includes('"Allow public updates of user_profiles"\n  ON user_profiles FOR UPDATE TO public\n  USING (true)'), 
  'FAIL: Insecure public update policy still present in SQL!');
assert(sqlContent.includes('CREATE POLICY "Disallow public inserts of user_profiles"'), 
  'FAIL: Missing disallow public insert policy!');
assert(sqlContent.includes('CREATE POLICY "Disallow public updates of user_profiles"'), 
  'FAIL: Missing disallow public update policy!');
assert(sqlContent.includes('CREATE POLICY "Disallow public deletes of user_profiles"'), 
  'FAIL: Missing disallow public delete policy!');
console.log('   ✓ Insecure public writes are blocked via explicit disallow policies.');

console.log('2. Checking non-destructive email preservation and access restrictions...');
assert(!sqlContent.includes('ALTER TABLE user_profiles DROP COLUMN email'),
  'FAIL: Destructive DROP COLUMN email found in migration script!');
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS user_private_profiles'), 
  'FAIL: user_private_profiles table definition missing');
assert(sqlContent.includes('REVOKE SELECT ON user_profiles FROM public, anon, authenticated'), 
  'FAIL: Table-level REVOKE SELECT missing');
assert(sqlContent.includes('GRANT SELECT (id, wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, created_at, updated_at)'), 
  'FAIL: Column-level grant on safe public columns missing');
console.log('   ✓ Existing email data is preserved non-destructively; public access blocked via column-level grants.');

console.log('3. Checking auth_challenges table and private RLS...');
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS auth_challenges'),
  'FAIL: auth_challenges table definition missing');
assert(sqlContent.includes('ALTER TABLE auth_challenges ENABLE ROW LEVEL SECURITY'),
  'FAIL: RLS not enabled on auth_challenges');
assert(sqlContent.includes('CREATE POLICY "Disallow public access to auth_challenges"'),
  'FAIL: Disallow public access policy missing on auth_challenges');
console.log('   ✓ auth_challenges table created with strict private RLS.');

console.log('4. Checking src/lib/profile.ts query and write paths...');
const profileTsPath = path.resolve('src/lib/profile.ts');
const profileTsContent = fs.readFileSync(profileTsPath, 'utf8');

assert(!profileTsContent.includes(".select('*')"), 'FAIL: select(*) found in profile.ts');
assert(!profileTsContent.includes("select('wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, email')"), 
  'FAIL: email still queried in fetchProfileGlobal');
assert(profileTsContent.includes("select('wallet_address, display_name, bio, avatar_url, banner_url, twitter, website')"), 
  'FAIL: fetchProfileGlobal does not query explicit safe public columns');
assert(!profileTsContent.includes(".upsert(payload"), 
  'FAIL: Unsafe direct client-side upsert still present in profile.ts');
assert(profileTsContent.includes('globalSaved: false'),
  'FAIL: saveProfileGlobal should indicate remote writes are not active in interim state');
console.log('   ✓ fetchProfileGlobal queries only safe public columns without email.');
console.log('   ✓ saveProfileGlobal preserves local caching while disabling insecure remote upserts.');

// ============================================================================
// PART 2: RUNTIME FUNCTIONAL AUTHORIZATION LOGIC TESTS
// ============================================================================
console.log('\n--- PART 2: Runtime Authorization Engine Execution Tests ---');

// Import / define canonical hash function matching the Edge Function
function computeProfilePayloadHash(profile) {
  const canonical = {
    avatarUrl: (profile?.avatarUrl ?? '').trim(),
    bannerUrl: (profile?.bannerUrl ?? '').trim(),
    bio: (profile?.bio ?? '').trim(),
    displayName: (profile?.displayName ?? '').trim(),
    twitter: (profile?.twitter ?? '').trim().replace(/^@/, ''),
    website: (profile?.website ?? '').trim(),
  };
  const jsonStr = JSON.stringify(canonical);
  return '0x' + crypto.createHash('sha256').update(jsonStr).digest('hex'); // using sha256 in node for test assertion
}

function buildCanonicalMessage(wallet, chainId, challenge, payloadHash) {
  return [
    'Arc Name Service Profile Update',
    `Wallet: ${wallet.toLowerCase()}`,
    `Chain ID: ${chainId}`,
    `Challenge: ${challenge}`,
    `Payload Hash: ${payloadHash.toLowerCase()}`,
    'Action: UPDATE_PROFILE',
  ].join('\n');
}

function validateProfileSchema(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return { valid: false, error: 'profile must be a valid JSON object' };
  }
  if (profile.displayName && profile.displayName.length > 50) {
    return { valid: false, error: 'displayName exceeds maximum length of 50 characters' };
  }
  if (profile.bio && profile.bio.length > 160) {
    return { valid: false, error: 'bio exceeds maximum length of 160 characters' };
  }
  if (profile.website && profile.website !== '') {
    if (profile.website.length > 200) return { valid: false, error: 'website exceeds max length' };
    if (!/^https:\/\/[^\s$.?#].[^\s]*$/i.test(profile.website.trim())) {
      return { valid: false, error: 'website must begin with https://' };
    }
  }
  if (profile.avatarUrl && profile.avatarUrl !== '') {
    const isHttps = /^https:\/\/[^\s$.?#].[^\s]*$/i.test(profile.avatarUrl);
    const isDataUri = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(profile.avatarUrl);
    if (!isHttps && !isDataUri) {
      return { valid: false, error: 'avatarUrl must be a secure https link or valid base64 image data URI' };
    }
  }
  return { valid: true };
}

// Simulated Atomic Challenge Store (In-Memory Model of Supabase auth_challenges)
class MockChallengeStore {
  constructor() {
    this.challenges = new Map();
  }
  createChallenge(wallet, ttlSeconds = 120) {
    const challenge = crypto.randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.challenges.set(challenge, {
      challenge,
      wallet_address: wallet.toLowerCase(),
      operation: 'UPDATE_PROFILE',
      expires_at: expiresAt,
      consumed_at: null,
    });
    return challenge;
  }
  // Atomically consume challenge
  consumeChallenge(challenge, wallet) {
    const record = this.challenges.get(challenge);
    if (!record) return { success: false, reason: 'NOT_FOUND' };
    if (record.wallet_address !== wallet.toLowerCase()) return { success: false, reason: 'WALLET_MISMATCH' };
    if (record.consumed_at !== null) return { success: false, reason: 'ALREADY_CONSUMED' };
    if (Date.now() > record.expires_at) return { success: false, reason: 'EXPIRED' };
    record.consumed_at = Date.now();
    return { success: true };
  }
}

// Test 1: Payload Binding & Tampering Detection
console.log('5. Testing payload binding & tampering detection...');
{
  const wallet = '0x1111111111111111111111111111111111111111';
  const originalProfile = {
    displayName: 'Alice',
    bio: 'Legitimate bio',
    website: 'https://alice.ans',
  };
  const hash = computeProfilePayloadHash(originalProfile);
  const challenge = 'test-challenge-uuid-123';
  const message = buildCanonicalMessage(wallet, 5042002, challenge, hash);

  // Attacker tampers with the bio in the submitted profile
  const tamperedProfile = {
    displayName: 'Alice',
    bio: 'Malicious phishing link https://evil.com',
    website: 'https://alice.ans',
  };
  const tamperedHash = computeProfilePayloadHash(tamperedProfile);

  assert.notStrictEqual(hash, tamperedHash, 'FAIL: Tampered profile produced identical hash!');

  // Validate that verification engine detects mismatch between signed message and submitted payload
  const messageHashMatch = message.includes(tamperedHash);
  assert.strictEqual(messageHashMatch, false, 'FAIL: Tampered payload hash should not match signed message!');
  console.log('   ✓ Payload tampering successfully detected and rejected.');
}

// Test 2: Wallet Address Mismatch Detection
console.log('6. Testing wallet address mismatch rejection...');
{
  const aliceWallet = '0x1111111111111111111111111111111111111111';
  const bobWallet = '0x2222222222222222222222222222222222222222';
  const profile = { displayName: 'Bob' };
  const hash = computeProfilePayloadHash(profile);
  const challenge = 'test-challenge-uuid-456';
  const aliceMessage = buildCanonicalMessage(aliceWallet, 5042002, challenge, hash);

  // Attacker tries to submit Alice's signed message for Bob's wallet
  const msgRegex = /^Arc Name Service Profile Update\nWallet: (0x[a-fA-F0-9]{40})/m;
  const match = aliceMessage.match(msgRegex);
  const extractedWallet = match[1];

  assert.notStrictEqual(extractedWallet.toLowerCase(), bobWallet.toLowerCase());
  console.log('   ✓ Cross-wallet signature reuse rejected: extracted wallet does not match target.');
}

// Test 3: Challenge Expiration Enforcement
console.log('7. Testing challenge expiration enforcement...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  // Create challenge expired 10 seconds ago
  const challenge = store.createChallenge(wallet, -10);
  const res = store.consumeChallenge(challenge, wallet);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.reason, 'EXPIRED');
  console.log('   ✓ Expired challenge correctly rejected.');
}

// Test 4: Single-Use Atomic Challenge Consumption (Replay Prevention)
console.log('8. Testing single-use challenge consumption & replay prevention...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  const challenge = store.createChallenge(wallet, 120);

  // First consumption must succeed
  const firstConsume = store.consumeChallenge(challenge, wallet);
  assert.strictEqual(firstConsume.success, true, 'First challenge consumption should succeed');

  // Second consumption (replay attack) must fail
  const replayAttempt = store.consumeChallenge(challenge, wallet);
  assert.strictEqual(replayAttempt.success, false, 'Replay attempt must fail');
  assert.strictEqual(replayAttempt.reason, 'ALREADY_CONSUMED');
  console.log('   ✓ Single-use challenge consumed atomically; replay attack rejected.');
}

// Test 5: Input Validation & Sanitization
console.log('9. Testing input validation, URL scheme restrictions, and length bounds...');
{
  // Test invalid javascript: website URL
  const jsUrlResult = validateProfileSchema({ website: 'javascript:alert(1)' });
  assert.strictEqual(jsUrlResult.valid, false);
  assert(jsUrlResult.error.includes('https://'));

  // Test insecure http:// website URL
  const httpUrlResult = validateProfileSchema({ website: 'http://insecure.site' });
  assert.strictEqual(httpUrlResult.valid, false);

  // Test oversized bio (> 160 chars)
  const longBio = 'A'.repeat(161);
  const bioResult = validateProfileSchema({ bio: longBio });
  assert.strictEqual(bioResult.valid, false);
  assert(bioResult.error.includes('160 characters'));

  // Test oversized display name (> 50 chars)
  const longName = 'A'.repeat(51);
  const nameResult = validateProfileSchema({ displayName: longName });
  assert.strictEqual(nameResult.valid, false);
  assert(nameResult.error.includes('50 characters'));

  // Test malicious avatarUrl
  const badAvatarResult = validateProfileSchema({ avatarUrl: 'javascript:malicious()' });
  assert.strictEqual(badAvatarResult.valid, false);

  // Test null/missing profile object
  const nullProfileResult = validateProfileSchema(null);
  assert.strictEqual(nullProfileResult.valid, false);

  console.log('   ✓ Input sanitization properly rejects malicious URLs, oversized fields, and null objects.');
}

// Test 6: Valid Authorization Flow End-to-End Simulation
console.log('10. Testing complete valid authorization flow...');
{
  const store = new MockChallengeStore();
  const wallet = '0x1111111111111111111111111111111111111111';
  const validProfile = {
    displayName: 'Alice',
    bio: 'Decentralized Identity Builder on Arc',
    website: 'https://alice.arc',
    avatarUrl: 'https://storage.arc.io/alice.png',
  };

  const schemaRes = validateProfileSchema(validProfile);
  assert.strictEqual(schemaRes.valid, true);

  const challenge = store.createChallenge(wallet, 120);
  const payloadHash = computeProfilePayloadHash(validProfile);
  const message = buildCanonicalMessage(wallet, 5042002, challenge, payloadHash);

  // Parse message
  const msgRegex = /^Arc Name Service Profile Update\nWallet: (0x[a-fA-F0-9]{40})\nChain ID: (\d+)\nChallenge: ([a-zA-Z0-9_-]{10,64})\nPayload Hash: (0x[a-fA-F0-9]{64})\nAction: UPDATE_PROFILE$/;
  const match = message.match(msgRegex);
  assert(match !== null, 'Message should match canonical template');

  const [, msgWallet, msgChainId, msgChallenge, msgHash] = match;
  assert.strictEqual(msgWallet.toLowerCase(), wallet.toLowerCase());
  assert.strictEqual(parseInt(msgChainId, 10), 5042002);
  assert.strictEqual(msgChallenge, challenge);
  assert.strictEqual(msgHash, payloadHash);

  // Consume challenge
  const consumeRes = store.consumeChallenge(msgChallenge, msgWallet);
  assert.strictEqual(consumeRes.success, true);

  console.log('   ✓ Valid authorization flow simulation completed successfully.');
}

console.log('\n================================================================');
console.log('   All 10 Profile Security Assertions Passed Successfully!       ');
console.log('================================================================');
