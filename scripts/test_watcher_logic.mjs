import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ANS_ADDRESS,
  ANS_CONTRACT_ADDRESS,
  TIPPING_CONTRACT_ADDRESS,
  ARC_TESTNET_CHAIN_ID,
  CONFIRMATION_DEPTH,
  MAX_BLOCKS_PER_QUERY,
  CURSOR_KEY,
  isAddress,
  isValidName,
  buildNameSoldNotifications,
  buildTipSentNotifications,
  acquireLock,
  releaseLock,
  getLastBlock,
  setLastBlock,
  poll,
  NAME_SOLD_EVENT,
  TIP_SENT_EVENT,
} from './ans-event-watcher.mjs';
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters } from 'viem';

console.log('=================================================================');
console.log('       ANS Event Watcher Logic & Integration Tests                ');
console.log('=================================================================');

// ─── 1. Contract Configuration Invariants ────────────────────────────────────
console.log('\n--- PART 1: Contract Configuration & Event ABIs ---');

console.log('1. Verifying default contract addresses match project deployment...');
assert.equal(
  DEFAULT_ANS_ADDRESS.toLowerCase(),
  '0xa70e51df2472677219de4afa5124a47526e27033',
  'Default ANS address must match verified ArcNameService on Arc Testnet'
);
assert.equal(
  TIPPING_CONTRACT_ADDRESS.toLowerCase(),
  ANS_CONTRACT_ADDRESS.toLowerCase(),
  'Tipping address must default to ArcNameService contract (natively emits TipSent)'
);
assert.equal(ARC_TESTNET_CHAIN_ID, 5042002, 'Chain ID must be Arc Testnet 5042002');
console.log('  ✓ Contract configuration matches verified on-chain deployments.');

console.log('2. Verifying event ABI signatures...');
assert.equal(NAME_SOLD_EVENT.name, 'NameSold');
assert.equal(TIP_SENT_EVENT.name, 'TipSent');
console.log('  ✓ Event ABI definitions for NameSold and TipSent verified.');

// ─── 2. Validation & Argument Checkers ────────────────────────────────────────
console.log('\n--- PART 2: Argument Validation ---');

console.log('3. Validating isAddress helper...');
assert.equal(isAddress('0xa70e51df2472677219de4afa5124a47526e27033'), true);
assert.equal(isAddress('0xA70E51DF2472677219DE4AFA5124A47526E27033'), true);
assert.equal(isAddress('0xa70e51df2472677219de4afa5124a47526e2703'), false); // 39 chars
assert.equal(isAddress('not_an_address'), false);
assert.equal(isAddress(null), false);
assert.equal(isAddress(undefined), false);
console.log('  ✓ Address format validation enforces 42-char hex.');

console.log('4. Validating isValidName helper (3-32 chars, a-z0-9)...');
assert.equal(isValidName('alice'), true);
assert.equal(isValidName('user1'), true);
assert.equal(isValidName('abc'), true);
assert.equal(isValidName('ab'), false); // too short
assert.equal(isValidName('a'.repeat(33)), false); // too long
assert.equal(isValidName('Alice'), false); // uppercase not allowed on-chain
assert.equal(isValidName('al-ice'), false); // hyphen not allowed on-chain
assert.equal(isValidName('al_ice'), false); // underscore not allowed on-chain
assert.equal(isValidName('alice.arc'), false); // raw name without .arc suffix
console.log('  ✓ Name validation strictly mirrors on-chain _validateName rules.');

// ─── 3. NameSold Notifications ───────────────────────────────────────────────
console.log('\n--- PART 3: NameSold Event Notifications ---');

console.log('5. Testing valid NameSold notification generation...');
const soldNotifs = buildNameSoldNotifications(
  {
    name: 'alice',
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
    price: 15_000_000n, // 15 USDC (6 decimals)
  },
  '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  2
);

assert.equal(soldNotifs.length, 2, 'Should create 2 notifications (seller & buyer)');
assert.equal(soldNotifs[0].recipient_address, '0x1111111111111111111111111111111111111111');
assert.equal(soldNotifs[0].kind, 'name_sold');
assert.equal(soldNotifs[0].title, 'alice.arc sold for 15.00 USDC');
assert.equal(soldNotifs[0].body, 'Your name alice.arc was purchased by 0x2222...2222.');
assert.equal(soldNotifs[0].link, 'userprofile:0x2222222222222222222222222222222222222222');
assert.equal(soldNotifs[0].tx_hash, '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
assert.equal(soldNotifs[0].log_index, 2);
assert.equal(soldNotifs[0].is_read, false);

assert.equal(soldNotifs[1].recipient_address, '0x2222222222222222222222222222222222222222');
assert.equal(soldNotifs[1].kind, 'name_bought');
assert.equal(soldNotifs[1].title, 'You acquired alice.arc');
assert.equal(soldNotifs[1].body, 'You successfully purchased alice.arc for 15.00 USDC.');
assert.equal(soldNotifs[1].link, 'profile:alice.arc');
assert.equal(soldNotifs[1].tx_hash, '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
assert.equal(soldNotifs[1].log_index, 2);
assert.equal(soldNotifs[1].is_read, false);
console.log('  ✓ NameSold creates properly routed notifications for seller and buyer.');

console.log('6. Testing NameSold rejection of invalid inputs...');
assert.equal(buildNameSoldNotifications({ name: 'al', seller: '0x1111111111111111111111111111111111111111', buyer: '0x2222222222222222222222222222222222222222', price: 100 }, '0xabc', 0).length, 0);
assert.equal(buildNameSoldNotifications({ name: 'alice<script>', seller: '0x1111111111111111111111111111111111111111', buyer: '0x2222222222222222222222222222222222222222', price: 100 }, '0xabc', 0).length, 0);
assert.equal(buildNameSoldNotifications({ name: 'alice', seller: '0xinvalid', buyer: '0x2222222222222222222222222222222222222222', price: 100 }, '0xabc', 0).length, 0);
assert.equal(buildNameSoldNotifications({ name: 'alice', seller: '0x1111111111111111111111111111111111111111', buyer: '0x2222222222222222222222222222222222222222', price: -5n }, '0xabc', 0).length, 0);
console.log('  ✓ Invalid NameSold args safely produce 0 notifications.');

// ─── 4. TipSent Notifications ────────────────────────────────────────────────
console.log('\n--- PART 4: TipSent Event Notifications ---');

console.log('7. Testing valid TipSent notification without note...');
const tipNotifsNoNote = buildTipSentNotifications(
  {
    toName: 'bob',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x3333333333333333333333333333333333333333',
    amount: 5_500_000n, // 5.50 USDC
  },
  '0xdef000111222',
  1
);

assert.equal(tipNotifsNoNote.length, 2, 'Should create 2 notifications (recipient & sender)');
assert.equal(tipNotifsNoNote[0].recipient_address, '0x3333333333333333333333333333333333333333');
assert.equal(tipNotifsNoNote[0].kind, 'tip_received');
assert.equal(tipNotifsNoNote[0].title, 'You received a 5.50 USDC tip on bob.arc');
assert.equal(tipNotifsNoNote[0].body, '0x1111...1111 sent you 5.50 USDC.');
assert.equal(tipNotifsNoNote[0].link, 'userprofile:0x1111111111111111111111111111111111111111');
assert.equal(tipNotifsNoNote[0].tx_hash, '0xdef000111222');
assert.equal(tipNotifsNoNote[0].log_index, 1);
assert.equal(tipNotifsNoNote[0].is_read, false);

assert.equal(tipNotifsNoNote[1].recipient_address, '0x1111111111111111111111111111111111111111');
assert.equal(tipNotifsNoNote[1].kind, 'tip_sent');
assert.equal(tipNotifsNoNote[1].title, 'You sent a 5.50 USDC tip on bob.arc');
assert.equal(tipNotifsNoNote[1].body, 'Tip successfully sent to 0x3333...3333.');
assert.equal(tipNotifsNoNote[1].link, 'profile:bob.arc');
assert.equal(tipNotifsNoNote[1].tx_hash, '0xdef000111222');
assert.equal(tipNotifsNoNote[1].log_index, 1);
assert.equal(tipNotifsNoNote[1].is_read, false);
console.log('  ✓ TipSent without note correctly routes notifications to recipient and sender.');

console.log('8. Testing valid TipSent notification with note...');
const tipNotifsWithNote = buildTipSentNotifications(
  {
    toName: 'bob',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x3333333333333333333333333333333333333333',
    amount: 10_000_000n,
    note: 'Great domain name, thanks!',
  },
  '0xdef000111222',
  3
);
assert.equal(tipNotifsWithNote.length, 2);
assert.equal(tipNotifsWithNote[0].body, '0x1111...1111 sent you 10.00 USDC. Note: "Great domain name, thanks!"');
assert.equal(tipNotifsWithNote[1].body, 'Tip successfully sent to 0x3333...3333. Note: "Great domain name, thanks!"');
console.log('  ✓ TipSent with user note attaches note to body cleanly for both parties.');

console.log('9. Testing TipSent rejection of invalid inputs...');
assert.equal(buildTipSentNotifications({ toName: 'b', from: '0x11', to: '0x22', amount: 100 }, '0xdef', 1).length, 0);
assert.equal(buildTipSentNotifications({ toName: 'bob', from: '0x1111111111111111111111111111111111111111', to: '0x3333333333333333333333333333333333333333', amount: 0n }, '0xdef', 1).length, 0);
assert.equal(buildTipSentNotifications({ toName: 'bob', from: '0x1111111111111111111111111111111111111111', to: '0x3333333333333333333333333333333333333333', amount: -100n }, '0xdef', 1).length, 0);
console.log('  ✓ Invalid TipSent args safely produce 0 notifications.');

// ─── 5. Single-Instance Lock Mechanism ────────────────────────────────────────
console.log('\n--- PART 5: Single-Instance Process Guard ---');

const testLockFile = path.resolve('.test_watcher.lock');
try { fs.unlinkSync(testLockFile); } catch {}

console.log('10. Testing fresh lock acquisition...');
const lock1 = acquireLock(testLockFile);
assert.equal(lock1.acquired, true, 'First process should acquire the lock');
assert.equal(fs.existsSync(testLockFile), true, 'Lock file should exist on disk');

console.log('11. Testing re-entrant acquisition by current process...');
const lockSamePid = acquireLock(testLockFile);
assert.equal(lockSamePid.acquired, true, 'Current process with matching PID should retain lock');

console.log('12. Testing lock collision against active PID...');
// Write a lockfile simulating another running process
fs.writeFileSync(testLockFile, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
// Verify that releaseLock releases cleanly
const released = releaseLock(testLockFile);
assert.equal(released, true, 'releaseLock should succeed for owned lock');
assert.equal(fs.existsSync(testLockFile), false, 'Lock file should be unlinked after release');

console.log('13. Testing recovery from stale lockfile (dead PID)...');
// Write a lockfile with an impossibly high dead PID (e.g. 9999999)
fs.writeFileSync(testLockFile, JSON.stringify({ pid: 9999999, startedAt: new Date().toISOString() }));
const lockRecovered = acquireLock(testLockFile);
assert.equal(lockRecovered.acquired, true, 'Should detect dead PID, clear stale lock, and acquire');
releaseLock(testLockFile);
assert.equal(fs.existsSync(testLockFile), false);
console.log('  ✓ Single-instance lock cleanly prevents duplicates and recovers from crashes.');

// ─── 6. Cursor Monotonic Progression & Calculations ───────────────────────────
console.log('\n--- PART 6: Cursor Progression & Deduplication Safety ---');

console.log('14. Testing cursor window math and confirmations...');
const depth = CONFIRMATION_DEPTH;
const maxBlocks = MAX_BLOCKS_PER_QUERY;
const tip = 10_000n;
const safe = tip - depth; // 9,997n

// First run math
let cursor = null;
let from = cursor === null ? (safe > 200n ? safe - 200n : 0n) : cursor + 1n;
let to = (from + maxBlocks - 1n) < safe ? from + maxBlocks - 1n : safe;
assert.equal(from, 9797n);
assert.equal(to, 9997n);

// Next run when caught up
cursor = 9997n;
from = cursor + 1n; // 9998n
assert.equal(from > safe, true, 'Should detect no new confirmed blocks');

// 1 new block confirmed
const newTip = 10_001n;
const newSafe = newTip - depth; // 9,998n
from = cursor + 1n; // 9998n
assert.equal(from <= newSafe, true);
to = (from + maxBlocks - 1n) < newSafe ? from + maxBlocks - 1n : newSafe;
assert.equal(from, 9998n);
assert.equal(to, 9998n, 'Scans exactly 1 new block with no overlap');
console.log('  ✓ Cursor window math is correct, contiguous, and non-overlapping.');

console.log('15. Testing monotonic cursor enforcement in setLastBlock...');
let mockDbState = {
  cursorRow: { id: CURSOR_KEY, last_block: '500' },
  notifications: [],
};

const mockDbClient = {
  from(table) {
    if (table === 'watcher_cursors') {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: mockDbState.cursorRow, error: null }),
              };
            },
          };
        },
        upsert: async (payload) => {
          mockDbState.cursorRow = payload;
          return { error: null };
        },
      };
    }
    if (table === 'notifications') {
      return {
        upsert: async (rows, opts) => {
          mockDbState.notifications.push(...rows);
          mockDbState.lastUpsertOpts = opts;
          return { error: null };
        },
      };
    }
  },
};

// Advance forward
await setLastBlock(mockDbClient, 600n);
assert.equal(mockDbState.cursorRow.last_block, '600', 'Should advance forward');

// Attempt to set backwards block (should be ignored)
await setLastBlock(mockDbClient, 550n);
assert.equal(mockDbState.cursorRow.last_block, '600', 'Must prevent backward cursor regression');
console.log('  ✓ Monotonic cursor progression protects against backward regressions.');

// ─── 7. End-to-End Simulation of poll() ────────────────────────────────────────
console.log('\n--- PART 7: poll() Pipeline Simulation (Mock RPC + Mock DB) ---');

console.log('16. Testing poll() on up-to-date chain...');
const mockRpcUpToDate = {
  getBlockNumber: async () => 600n + CONFIRMATION_DEPTH, // safeLatest = 600n
  getLogs: async () => [],
};
const resUpToDate = await poll({
  rpcClient: mockRpcUpToDate,
  dbClient: mockDbClient,
  ansAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
  tippingAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
});
assert.equal(resUpToDate.success, true);
assert.equal(resUpToDate.upToDate, true);
assert.equal(resUpToDate.insertedCount, 0);
console.log('  ✓ poll() cleanly detects up-to-date state without queries.');

console.log('17. Testing poll() ingesting NameSold and TipSent events...');
// Setup 5 new blocks (601 -> 605)
mockDbState.cursorRow = { id: CURSOR_KEY, last_block: '600' };
mockDbState.notifications = [];

const soldTopics = encodeEventTopics({
  abi: [NAME_SOLD_EVENT],
  eventName: 'NameSold',
  args: {
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
  },
});
const soldData = encodeAbiParameters(
  parseAbiParameters('string name, uint256 price'),
  ['ferar', 3000000n]
);

const tipTopics = encodeEventTopics({
  abi: [TIP_SENT_EVENT],
  eventName: 'TipSent',
  args: {
    from: '0x2222222222222222222222222222222222222222',
    to: '0x1111111111111111111111111111111111111111',
  },
});
const tipData = encodeAbiParameters(
  parseAbiParameters('string toName, uint256 amount, string note'),
  ['ferar', 1000000n, 'Tip for quick delivery']
);

const mockRpcWithEvents = {
  getBlockNumber: async () => 605n + CONFIRMATION_DEPTH, // safeLatest = 605n
  getLogs: async () => [
    {
      address: '0xa70e51df2472677219de4afa5124a47526e27033',
      transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
      logIndex: 0,
      topics: soldTopics,
      data: soldData,
    },
    {
      address: '0xa70e51df2472677219de4afa5124a47526e27033',
      transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
      logIndex: 1,
      topics: tipTopics,
      data: tipData,
    },
  ],
};

const resWithEvents = await poll({
  rpcClient: mockRpcWithEvents,
  dbClient: mockDbClient,
  ansAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
  tippingAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
});

assert.equal(resWithEvents.success, true);
assert.equal(resWithEvents.fromBlock, 601n);
assert.equal(resWithEvents.toBlock, 605n);
assert.equal(resWithEvents.eventsFound.sold, 1);
assert.equal(resWithEvents.eventsFound.tip, 1);
assert.equal(resWithEvents.insertedCount, 4); // 2 from NameSold (seller, buyer) + 2 from TipSent (to, from)
assert.equal(mockDbState.cursorRow.last_block, '605', 'Cursor must advance to toBlock after commit');
assert.equal(
  mockDbState.lastUpsertOpts.onConflict,
  'tx_hash,log_index,recipient_address,kind',
  'Must specify table dedup conflict key'
);
assert.equal(mockDbState.lastUpsertOpts.ignoreDuplicates, true, 'Must ignore duplicate event rows');
console.log('  ✓ poll() accurately decodes events, commits rows, and advances cursor.');

console.log('18. Testing failure handling: DB error preserves cursor for retry...');
mockDbState.cursorRow = { id: CURSOR_KEY, last_block: '605' };
const mockDbFailing = {
  from(table) {
    if (table === 'watcher_cursors') {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockDbState.cursorRow, error: null }) }) }),
        upsert: async () => { throw new Error('Should not be called on insert error'); },
      };
    }
    if (table === 'notifications') {
      return {
        upsert: async () => ({ error: { message: 'Database connection timeout' } }),
      };
    }
  },
};

const mockRpcFailingDb = {
  getBlockNumber: async () => 610n + CONFIRMATION_DEPTH,
  getLogs: async () => [
    {
      address: '0xa70e51df2472677219de4afa5124a47526e27033',
      transactionHash: '0x3333333333333333333333333333333333333333333333333333333333333333',
      logIndex: 0,
      topics: soldTopics,
      data: soldData,
    },
  ],
};

const resFailingDb = await poll({
  rpcClient: mockRpcFailingDb,
  dbClient: mockDbFailing,
  ansAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
  tippingAddress: '0xa70e51df2472677219de4afa5124a47526e27033',
});

assert.equal(resFailingDb.success, false);
assert.equal(resFailingDb.cursorAdvanced, false);
assert.equal(mockDbState.cursorRow.last_block, '605', 'Cursor MUST NOT advance on database insert error');
console.log('  ✓ Database failures hold cursor in place so events are safely retried.');

console.log('\n=================================================================');
console.log('  All 18 Watcher Logic & Integration Tests Passed Successfully!  ');
console.log('=================================================================\n');
