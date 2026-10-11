import { formatUnits, parseAbiItem, decodeEventLog } from 'viem';
import { ANS_ABI, ANS_ADDRESS } from './abis';
import { cleanName } from './activity';

export interface MarketplaceListing {
  name: string;
  seller: string;
  price: number; // in USDC
  expiry: number;
}

const STORAGE_KEY = 'ans_marketplace_candidates';

/**
 * Get candidate names that were listed for sale
 */
export function getTrackedListingNames(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Add a name to tracked marketplace candidates
 */
export function addTrackedListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    const current = getTrackedListingNames();
    if (!current.includes(clean)) {
      current.push(clean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    }
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to track listing:', err);
  }
}

/**
 * Remove a name from tracked marketplace candidates
 */
export function removeTrackedListing(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  try {
    const current = getTrackedListingNames();
    const updated = current.filter(n => cleanName(n) !== clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to untrack listing:', err);
  }
}

/**
 * Query on-chain contract to verify and fetch all truly active listings
 */
export function fetchActiveListings(publicClient: any, userOwnedNames: string[] = []): Promise<MarketplaceListing[]> {
  return (async () => {
    const tracked = getTrackedListingNames();
    const candidates = new Set([...tracked, ...userOwnedNames.map(cleanName)]);

    try {
      // 1. Try Explorer API first to bypass pruned history limits on public RPC
      const apiRes = await fetch(`https://explorer.testnet.arc.io/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=${ANS_ADDRESS}&topic0=0xc87e6029eb4b9211a0eb39f94b63248b8b1660b93a577aa53d04aeaf66ca77bc`);
      const apiData = await apiRes.json();
      
      if (apiData && apiData.status === '1' && Array.isArray(apiData.result)) {
        const abiItem = parseAbiItem('event NameListed(string name, address indexed seller, uint256 price)');
        for (const log of apiData.result) {
          try {
            const decoded = decodeEventLog({
              abi: [abiItem],
              data: log.data,
              topics: log.topics
            });
            if (decoded.args && (decoded.args as any).name) {
              candidates.add(cleanName((decoded.args as any).name));
            }
          } catch (e) {
            // Ignore decoding errors for individual logs
          }
        }
      } else {
        throw new Error('Explorer API failed or returned no results');
      }
    } catch (apiErr) {
      console.warn('Explorer API failed, falling back to recent RPC getLogs:', apiErr);
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 2000n ? currentBlock - 2000n : 0n;
        const logs = await publicClient.getLogs({
          address: ANS_ADDRESS,
          event: parseAbiItem('event NameListed(string name, address indexed seller, uint256 price)'),
          fromBlock,
          toBlock: 'latest'
        });
        
        for (const log of logs) {
          if (log.args && log.args.name) {
            candidates.add(cleanName(log.args.name));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch historical listing logs from RPC:', err);
      }
    }

    const candidatesArray = Array.from(candidates);

    const activeListings: MarketplaceListing[] = [];
    const validTracked: string[] = [];

    for (const cand of candidatesArray) {
      if (!cand) continue;
      try {
        const listing = await publicClient.readContract({
          address: ANS_ADDRESS,
          abi: ANS_ABI,
          functionName: 'getListing',
          args: [cand],
        });

        if (listing && listing.active && listing.seller !== '0x0000000000000000000000000000000000000000') {
          activeListings.push({
            name: `${cand}.arc`,
            seller: listing.seller,
            price: Number(formatUnits(listing.price, 6)),
            expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
          });
          validTracked.push(cand);
        }
      } catch {
        // Individual lookup failed or inactive
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validTracked));
    } catch {
      // ignore storage errors
    }

    return activeListings;
  })();
}
