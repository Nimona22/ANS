#!/usr/bin/env node
/**
 * ANS Event Watcher — Arc Testnet -> Supabase Notifications
 * =========================================================
 * Polls the ArcNameService on Arc Testnet for NameSold and TipSent events
 * and inserts ANS in-app notifications into Supabase.
 *
 * Verified Arc Testnet Contracts:
 *   ArcNameService: 0xa70e51df2472677219de4afa5124a47526e27033
 *   ANSReputation:  0x8a80287eb12d7bc38e52ed2ef59b0fb3de49f8ad
 *   USDC:           0x3600000000000000000000000000000000000000
 *
 * Both NameSold and TipSent events are natively defined and emitted by
 * the deployed ArcNameService contract at 0xa70e51df2472677219de4afa5124a47526e27033.
 *
 * Run with:
 *   node scripts/ans-event-watcher.mjs
 *   node scripts/ans-event-watcher.mjs --once
 *
 * Required environment variables:
 *   SUPABASE_URL          -- e.g. https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY  -- service-role key (NEVER the anon/publishable key)
 *   RPC_URL               -- Arc Testnet JSON-RPC endpoint (optional, falls back to public)
 *   ANS_CONTRACT_ADDRESS  -- optional override for ArcNameService contract address
 *   TIPPING_CONTRACT_ADDRESS -- optional override (defaults to ANS_CONTRACT_ADDRESS)
 *   START_BLOCK           -- optional starting block for first run
 *   WATCHER_LOCK_FILE     -- optional custom path for process lock file (defaults to .watcher.lock)
 *
 * SECURITY NOTE:
 *   SUPABASE_SERVICE_KEY must only appear in server-side environment variables.
 *   It bypasses RLS to insert confirmed notifications. Never commit it or expose it to the browser.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';

// -- Configuration ------------------------------------------------------------

export const DEFAULT_ANS_ADDRESS = '0xa70e51df2472677219de4afa5124a47526e27033';
export const ANS_CONTRACT_ADDRESS = (process.env.ANS_CONTRACT_ADDRESS || DEFAULT_ANS_ADDRESS).toLowerCase();
export const TIPPING_CONTRACT_ADDRESS = (process.env.TIPPING_CONTRACT_ADDRESS || ANS_CONTRACT_ADDRESS).toLowerCase();

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const POLL_INTERVAL_MS = 15_000;
export const MAX_BLOCKS_PER_QUERY = 500n;

/**
 * Confirmation depth: do not process the most recent N blocks to avoid
 * reorg fluctuations. Events are processed only after reaching safe depth.
 */
export const CONFIRMATION_DEPTH = 3n;

export const CURSOR_KEY = `ans_event_watcher_${ARC_TESTNET_CHAIN_ID}`;

export const arcTestnet = {
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Arc', symbol: 'ARC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network', 'https://rpc.testnet.arc.io'] },
    public:  { http: ['https://rpc.testnet.arc.network', 'https://rpc.testnet.arc.io'] },
  },
};

// -- ABI Event Definitions: verified against contracts/ArcNameService.sol ----
export const NAME_SOLD_EVENT = parseAbiItem(
  'event NameSold(string name, address indexed seller, address indexed buyer, uint256 price)'
);
export const TIP_SENT_EVENT = parseAbiItem(
  'event TipSent(string toName, address indexed from, address indexed to, uint256 amount, string note)'
);

// -- Single-Instance Lock -----------------------------------------------------

export const DEFAULT_LOCK_FILE = path.resolve(process.env.WATCHER_LOCK_FILE || '.watcher.lock');

/**
 * Attempts to acquire an exclusive single-instance process lock.
 * If a lock file exists, inspects the PID to verify if the process is active.
 * If active, fails to acquire. If stale/dead, cleans up and acquires.
 */
export function acquireLock(lockPath = DEFAULT_LOCK_FILE) {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    const lockPayload = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      chainId: ARC_TESTNET_CHAIN_ID,
      ansAddress: ANS_CONTRACT_ADDRESS,
    };
    fs.writeFileSync(fd, JSON.stringify(lockPayload, null, 2), 'utf8');
    fs.closeSync(fd);
    return { acquired: true, path: lockPath, pid: process.pid };
  } catch (err) {
    if (err.code === 'EEXIST') {
      try {
        const raw = fs.readFileSync(lockPath, 'utf8');
        const parsed = JSON.parse(raw);
        const existingPid = parsed?.pid;

        let isRunning = false;
        if (existingPid && typeof existingPid === 'number') {
          if (existingPid === process.pid) {
            return { acquired: true, path: lockPath, pid: process.pid };
          }
          try {
            process.kill(existingPid, 0);
            isRunning = true;
          } catch (probeErr) {
            // EPERM means process exists but we lack permissions to signal it (still running)
            // ESRCH means process does NOT exist (stale lock)
            isRunning = probeErr.code === 'EPERM';
          }
        }

        if (isRunning) {
          return {
            acquired: false,
            path: lockPath,
            existingPid,
            startedAt: parsed?.startedAt,
            reason: 'ALREADY_RUNNING',
          };
        }

        // Previous process crashed or terminated without releasing lock
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Ignore if concurrently unlinked
        }
        return acquireLock(lockPath);
      } catch {
        // Corrupt lock file -> clean and retry
        try {
          fs.unlinkSync(lockPath);
        } catch {}
        return acquireLock(lockPath);
      }
    }
    throw err;
  }
}

/**
 * Releases the single-instance lock file if owned by the current process.
 */
export function releaseLock(lockPath = DEFAULT_LOCK_FILE) {
  try {
    if (fs.existsSync(lockPath)) {
      const raw = fs.readFileSync(lockPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.pid === process.pid) {
        fs.unlinkSync(lockPath);
        return true;
      }
    }
  } catch {
    // Ignore release errors during shutdown
  }
  return false;
}

// -- Argument validation ------------------------------------------------------

export function isAddress(s) {
  return typeof s === 'string' && /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function isValidName(s) {
  return typeof s === 'string' && /^[a-z0-9]{3,32}$/.test(s);
}

// -- Notification builders ----------------------------------------------------

/**
 * Builds notifications for a confirmed NameSold event.
 * Validates args strictly and creates entries for both seller and buyer.
 */
export function buildNameSoldNotifications(args, txHash, logIndex) {
  if (!args || typeof args !== 'object') return [];
  const { name, seller, buyer, price } = args;

  if (!isValidName(name) || !isAddress(seller) || !isAddress(buyer) || price == null) {
    console.warn('[watcher] NameSold: invalid args, skipping', { name, seller, buyer });
    return [];
  }

  let priceBigInt;
  try {
    priceBigInt = BigInt(price);
    if (priceBigInt < 0n) return [];
  } catch {
    return [];
  }

  const priceUsdc = (Number(priceBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);
  const dedupBase = { tx_hash: txHash, log_index: safeLogIndex };

  return [
    {
      ...dedupBase,
      recipient_address: seller.toLowerCase(),
      kind: 'name_sold',
      title: `${name}.arc sold for ${priceUsdc} USDC`,
      body: `Your name ${name}.arc was purchased by ${buyer.slice(0, 6)}...${buyer.slice(-4)}.`,
      link: `userprofile:${buyer.toLowerCase()}`,
      is_read: false,
    },
    {
      ...dedupBase,
      recipient_address: buyer.toLowerCase(),
      kind: 'name_bought',
      title: `You acquired ${name}.arc`,
      body: `You successfully purchased ${name}.arc for ${priceUsdc} USDC.`,
      link: `profile:${name}.arc`,
      is_read: false,
    },
  ];
}

/**
 * Builds notifications for a confirmed TipSent event.
 * Uses the emitted recipient wallet address 'to' (rec.owner in contract).
 */
export function buildTipSentNotifications(args, txHash, logIndex) {
  if (!args || typeof args !== 'object') return [];
  const { toName, from, to, amount, note } = args;

  if (!isValidName(toName) || !isAddress(from) || !isAddress(to) || amount == null) {
    console.warn('[watcher] TipSent: invalid args, skipping', { toName, from, to });
    return [];
  }

  let amountBigInt;
  try {
    amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) return [];
  } catch {
    return [];
  }

  const amountUsdc = (Number(amountBigInt) / 1_000_000).toFixed(2);
  const safeLogIndex = typeof logIndex === 'number' ? logIndex : Number(logIndex || 0);

  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  const noteSuffix = trimmedNote ? ` Note: "${trimmedNote.slice(0, 100)}"` : '';

  return [
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: to.toLowerCase(),
      kind: 'tip_received',
      title: `You received a ${amountUsdc} USDC tip on ${toName}.arc`,
      body: `${from.slice(0, 6)}...${from.slice(-4)} sent you ${amountUsdc} USDC.${noteSuffix}`,
      link: `userprofile:${from.toLowerCase()}`,
      is_read: false,
    },
    {
      tx_hash: txHash,
      log_index: safeLogIndex,
      recipient_address: from.toLowerCase(),
      kind: 'tip_sent',
      title: `You sent a ${amountUsdc} USDC tip on ${toName}.arc`,
      body: `Tip successfully sent to ${to.slice(0, 6)}...${to.slice(-4)}.${noteSuffix}`,
      link: `profile:${toName}.arc`,
      is_read: false,
    },
  ];
}

// -- Cursor helpers -----------------------------------------------------------

/**
 * Returns the last successfully committed block, or null on first run.
 * Throws on real database errors so caller never assumes first run on failure.
 */
export async function getLastBlock(client) {
  const { data, error } = await client
    .from('watcher_cursors')
    .select('last_block')
    .eq('id', CURSOR_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Database error reading cursor: ${error.message} (code: ${error.code})`);
  }

  return data?.last_block ? BigInt(data.last_block) : null;
}

/**
 * Advance the cursor ONLY after events have been safely committed.
 * Guarantees monotonic progression: never sets an older block.
 * Returns true on success, false on failure (caller must NOT advance on false).
 */
export async function setLastBlock(client, block) {
  const blockBigInt = BigInt(block);
  const current = await getLastBlock(client).catch(() => null);
  if (current !== null && blockBigInt < current) {
    console.warn(`[watcher] Requested block ${blockBigInt} is behind cursor ${current}; preserving forward cursor.`);
    return true;
  }

  const { error } = await client.from('watcher_cursors').upsert(
    { id: CURSOR_KEY, last_block: blockBigInt.toString(), updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  );
  if (error) {
    console.error('[watcher] setLastBlock DB error -- cursor NOT advanced:', error.message);
    return false;
  }
  return true;
}

// -- Main Polling Engine ------------------------------------------------------

let isCurrentlyPolling = false;

/**
 * Executes a single scan and ingest pass over confirmed blocks.
 * Accepts client overrides for modular testability.
 */
export async function poll({
  rpcClient,
  dbClient,
  ansAddress = ANS_CONTRACT_ADDRESS,
  tippingAddress = TIPPING_CONTRACT_ADDRESS,
  confirmationDepth = CONFIRMATION_DEPTH,
  maxBlocksPerQuery = MAX_BLOCKS_PER_QUERY,
} = {}) {
  if (isCurrentlyPolling) {
    console.warn('[watcher] Previous poll still in progress, skipping this tick');
    return { success: false, inProgress: true };
  }
  isCurrentlyPolling = true;

  try {
    const latestBlock = await rpcClient.getBlockNumber();
    const safeLatest = latestBlock > confirmationDepth
      ? latestBlock - confirmationDepth
      : 0n;

    let fromBlock;
    try {
      const lastCommitted = await getLastBlock(dbClient);
      if (lastCommitted === null) {
        const envStart = process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : null;
        if (envStart !== null) {
          fromBlock = envStart <= safeLatest ? envStart : safeLatest;
        } else {
          fromBlock = safeLatest > 200n ? safeLatest - 200n : 0n;
        }
        console.log(`[watcher] First run -- starting from block ${fromBlock}`);
      } else {
        fromBlock = lastCommitted + 1n;
      }
    } catch (err) {
      console.error('[watcher] Could not read cursor from database, skipping tick:', err.message);
      return { success: false, error: err.message };
    }

    if (fromBlock > safeLatest) {
      // Up to date with safe confirmed blocks
      return {
        success: true,
        upToDate: true,
        fromBlock,
        safeLatest,
        latestBlock,
        insertedCount: 0,
      };
    }

    const toBlock = (fromBlock + maxBlocksPerQuery - 1n) < safeLatest
      ? fromBlock + maxBlocksPerQuery - 1n
      : safeLatest;

    console.log(`[watcher] Scanning blocks ${fromBlock} -> ${toBlock} (chain tip: ${latestBlock}, safe tip: ${safeLatest})`);

    const soldLogs = [];
    const tipLogs = [];

    if (ansAddress === tippingAddress) {
      const rawLogs = await rpcClient.getLogs({
        address: ansAddress,
        events: [NAME_SOLD_EVENT, TIP_SENT_EVENT],
        fromBlock,
        toBlock,
      });

      for (const log of rawLogs) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_SOLD_EVENT, TIP_SENT_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameSold') soldLogs.push({ ...log, decoded });
          else if (decoded.eventName === 'TipSent') tipLogs.push({ ...log, decoded });
        } catch (decErr) {
          console.warn('[watcher] Failed decoding event log in tx:', log.transactionHash, decErr.message);
        }
      }
    } else {
      const [rawSold, rawTip] = await Promise.all([
        rpcClient.getLogs({
          address: ansAddress,
          events: [NAME_SOLD_EVENT],
          fromBlock,
          toBlock,
        }),
        rpcClient.getLogs({
          address: tippingAddress,
          events: [TIP_SENT_EVENT],
          fromBlock,
          toBlock,
        }),
      ]);

      for (const log of rawSold) {
        if (log.address.toLowerCase() !== ansAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [NAME_SOLD_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'NameSold') soldLogs.push({ ...log, decoded });
        } catch {}
      }

      for (const log of rawTip) {
        if (log.address.toLowerCase() !== tippingAddress) continue;
        try {
          const decoded = decodeEventLog({
            abi: [TIP_SENT_EVENT],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'TipSent') tipLogs.push({ ...log, decoded });
        } catch {}
      }
    }

    const totalLogs = soldLogs.length + tipLogs.length;
    if (totalLogs > 0) {
      console.log(`[watcher] Found ${totalLogs} confirmed event log(s) (${soldLogs.length} NameSold, ${tipLogs.length} TipSent)`);
    }

    const toInsert = [];

    for (const item of soldLogs) {
      if (!item.transactionHash) continue;
      const notifs = buildNameSoldNotifications(
        item.decoded.args,
        item.transactionHash,
        item.logIndex ?? 0
      );
      toInsert.push(...notifs);
    }

    for (const item of tipLogs) {
      if (!item.transactionHash) continue;
      const notifs = buildTipSentNotifications(
        item.decoded.args,
        item.transactionHash,
        item.logIndex ?? 0
      );
      toInsert.push(...notifs);
    }

    if (toInsert.length > 0) {
      const { error } = await dbClient
        .from('notifications')
        .upsert(toInsert, {
          onConflict: 'tx_hash,log_index,recipient_address,kind',
          ignoreDuplicates: true,
        });

      if (error) {
        // Cursor is held at fromBlock - 1n; events will be safely retried
        console.error(
          `[watcher] Insert error (${toInsert.length} rows NOT saved, cursor held at ${fromBlock - 1n}):`,
          error.message
        );
        return { success: false, error: error.message, cursorAdvanced: false };
      }

      console.log(`[watcher] Successfully saved ${toInsert.length} notification(s)`);
    }

    // Only advance cursor after successful commit (or when there were no events)
    const cursorAdvanced = await setLastBlock(dbClient, toBlock);
    if (!cursorAdvanced) {
      return { success: false, error: 'Failed to advance cursor in database', cursorAdvanced: false };
    }

    return {
      success: true,
      fromBlock,
      toBlock,
      safeLatest,
      latestBlock,
      eventsFound: { sold: soldLogs.length, tip: tipLogs.length },
      insertedCount: toInsert.length,
      hasBacklog: toBlock < safeLatest,
    };
  } catch (err) {
    console.error('[watcher] Poll error (cursor NOT advanced):', err.message);
    return { success: false, error: err.message, cursorAdvanced: false };
  } finally {
    isCurrentlyPolling = false;
  }
}

// -- CLI Execution Guard ------------------------------------------------------

const isMainModule = Boolean(
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()
);

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
ANS Event Watcher CLI
=====================
Usage:
  node scripts/ans-event-watcher.mjs [options]

Options:
  --once                Execute one poll pass and exit
  --start-block <num>   Override start block on first run
  --lockfile <path>     Custom path for process lock file (default: .watcher.lock)
  --help, -h            Show this help text

Required Environment Variables:
  SUPABASE_URL          Project Supabase URL (e.g. https://xxx.supabase.co)
  SUPABASE_SERVICE_KEY  Service-role key (bypasses RLS to write notifications)

Optional Environment Variables:
  RPC_URL               Arc Testnet JSON-RPC endpoint (default: https://rpc.testnet.arc.network)
  ANS_CONTRACT_ADDRESS  ArcNameService address (default: 0xa70e51df2472677219de4afa5124a47526e27033)
  TIPPING_CONTRACT_ADDRESS Override for tipping contract (default: ANS_CONTRACT_ADDRESS)
  START_BLOCK           Start block if no cursor recorded yet
`);
    process.exit(0);
  }

  const runOnce = args.includes('--once');
  const startBlockIndex = args.indexOf('--start-block');
  if (startBlockIndex !== -1 && args[startBlockIndex + 1]) {
    process.env.START_BLOCK = args[startBlockIndex + 1];
  }
  const lockfileIndex = args.indexOf('--lockfile');
  const lockFilePath = lockfileIndex !== -1 && args[lockfileIndex + 1]
    ? path.resolve(args[lockfileIndex + 1])
    : DEFAULT_LOCK_FILE;

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RPC_URL      = process.env.RPC_URL || 'https://rpc.testnet.arc.network';

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      '[watcher] Missing required environment variables:\n' +
      '  SUPABASE_URL         -- your Supabase project URL\n' +
      '  SUPABASE_SERVICE_KEY -- service-role key (from Supabase Project Settings > API)\n\n' +
      'Run as:\n' +
      '  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=<key> node scripts/ans-event-watcher.mjs\n\n' +
      'SECURITY NOTE: Do NOT use the anon/publishable key. The watcher requires the service-role key to write notifications.'
    );
    process.exit(1);
  }

  // Reject public publishable/anon key as service key
  if (
    SUPABASE_KEY === process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    SUPABASE_KEY === process.env.VITE_SUPABASE_ANON_KEY
  ) {
    console.error(
      '[watcher] SECURITY ERROR: SUPABASE_SERVICE_KEY cannot be the public publishable/anon key!\n' +
      'The watcher requires the server-side service-role key to insert notifications into the locked-down notifications table.'
    );
    process.exit(1);
  }

  // Acquire single-instance process lock
  const lockResult = acquireLock(lockFilePath);
  if (!lockResult.acquired) {
    console.error(
      `[watcher] ERROR: Another instance of ANS Event Watcher is already running!\n` +
      `  Active PID: ${lockResult.existingPid}\n` +
      `  Started at: ${lockResult.startedAt}\n` +
      `  Lock file:  ${lockResult.path}\n\n` +
      `Only one watcher instance is permitted to process events and update the cursor.\n` +
      `If this is a stale lock from an abnormal termination, ensure PID ${lockResult.existingPid} is stopped, delete ${lockFilePath}, and restart.`
    );
    process.exit(1);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const rpc = createPublicClient({
    chain: arcTestnet,
    transport: http(RPC_URL, { timeout: 15_000 }),
  });

  console.log('[watcher] ANS Event Watcher started successfully');
  console.log(`[watcher]    ANS Contract:     ${ANS_CONTRACT_ADDRESS}`);
  console.log(`[watcher]    Tipping Contract: ${TIPPING_CONTRACT_ADDRESS}`);
  console.log(`[watcher]    Chain ID:         ${ARC_TESTNET_CHAIN_ID}`);
  console.log(`[watcher]    RPC Endpoint:     ${RPC_URL}`);
  console.log(`[watcher]    Supabase Project: ${SUPABASE_URL}`);
  console.log(`[watcher]    Confirmations:    ${CONFIRMATION_DEPTH} blocks`);
  console.log(`[watcher]    Process PID:      ${process.pid}`);
  console.log(`[watcher]    Lock File:        ${lockFilePath}`);
  console.log(`[watcher]    Run Mode:         ${runOnce ? 'Single pass (--once)' : 'Continuous polling'}`);

  let intervalId = null;
  let isShuttingDown = false;

  const shutdown = (code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log('\n[watcher] Shutting down cleanly and releasing lock...');
    if (intervalId) clearInterval(intervalId);
    releaseLock(lockFilePath);
    process.exit(code);
  };

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('exit', () => releaseLock(lockFilePath));

  const runTick = async () => {
    const res = await poll({
      rpcClient: rpc,
      dbClient: db,
      ansAddress: ANS_CONTRACT_ADDRESS,
      tippingAddress: TIPPING_CONTRACT_ADDRESS,
      confirmationDepth: CONFIRMATION_DEPTH,
      maxBlocksPerQuery: MAX_BLOCKS_PER_QUERY,
    });

    if (runOnce) {
      shutdown(res.success ? 0 : 1);
      return;
    }

    if (res.hasBacklog && !isShuttingDown) {
      // Drain backlog chunks quickly with short pause
      setTimeout(runTick, 250);
    }
  };

  runTick();
  if (!runOnce) {
    intervalId = setInterval(runTick, POLL_INTERVAL_MS);
  }
}
