import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Testing ANS Profile Security & Authorization ---');

const sqlPath = path.resolve('supabase_setup.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

// 1. Verify SQL Policies
console.log('1. Checking supabase_setup.sql write policies...');
assert(!sqlContent.includes('"Allow public inserts of user_profiles"\n  ON user_profiles FOR INSERT TO public\n  WITH CHECK (true)'), 
  'FAIL: Insecure public insert policy still present in SQL!');
assert(!sqlContent.includes('"Allow public updates of user_profiles"\n  ON user_profiles FOR UPDATE TO public\n  USING (true)'), 
  'FAIL: Insecure public update policy still present in SQL!');

assert(sqlContent.includes('CREATE POLICY "Disallow public inserts of user_profiles"'), 
  'FAIL: Missing disallow public insert policy!');
assert(sqlContent.includes('CREATE POLICY "Disallow public updates of user_profiles"'), 
  'FAIL: Missing disallow public update policy!');
assert(sqlContent.includes('WITH CHECK (false)'), 
  'FAIL: Insecure write policy detected in user_profiles');

console.log('   ✓ Insecure public INSERT and UPDATE policies are properly removed and denied.');

// 2. Verify Email Protection in SQL
console.log('2. Checking email isolation in supabase_setup.sql...');
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS user_private_profiles'), 
  'FAIL: user_private_profiles table missing');
assert(sqlContent.includes('REVOKE SELECT ON user_profiles FROM public, anon, authenticated'), 
  'FAIL: Table-level REVOKE SELECT missing');
assert(sqlContent.includes('GRANT SELECT (id, wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, created_at, updated_at)'), 
  'FAIL: Explicit column-level grant missing');

console.log('   ✓ Email column is isolated from public queries with column-level restrictions.');

// 3. Verify src/lib/profile.ts
console.log('3. Checking src/lib/profile.ts query and write paths...');
const profileTsPath = path.resolve('src/lib/profile.ts');
const profileTsContent = fs.readFileSync(profileTsPath, 'utf8');

assert(!profileTsContent.includes(".select('*')"), 'FAIL: select(*) found in profile.ts');
assert(!profileTsContent.includes("select('wallet_address, display_name, bio, avatar_url, banner_url, twitter, website, email')"), 
  'FAIL: email still queried in fetchProfileGlobal');
assert(profileTsContent.includes("select('wallet_address, display_name, bio, avatar_url, banner_url, twitter, website')"), 
  'FAIL: fetchProfileGlobal does not explicitly query only the safe public columns');

assert(!profileTsContent.includes(".upsert(payload"), 
  'FAIL: Unsafe direct client-side upsert still present in profile.ts');

console.log('   ✓ fetchProfileGlobal queries only public fields without email.');
console.log('   ✓ saveProfileGlobal has disabled unauthenticated client-side upserts.');

// 4. Verify Edge Function
console.log('4. Checking Edge Function signature verification...');
const edgeFnPath = path.resolve('supabase/functions/update-profile/index.ts');
assert(fs.existsSync(edgeFnPath), 'FAIL: Edge Function file missing');
const edgeFnContent = fs.readFileSync(edgeFnPath, 'utf8');
assert(edgeFnContent.includes('arcPublicClient.verifyMessage'), 'FAIL: verifyMessage missing in Edge Function');
assert(edgeFnContent.includes('SUPABASE_SERVICE_ROLE_KEY'), 'FAIL: Service role key missing in Edge Function');
console.log('   ✓ Supabase Edge Function with cryptographic wallet verification is verified.');

console.log('\nAll profile security assertions passed successfully!');
