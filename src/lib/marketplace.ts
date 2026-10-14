import { formatUnits, parseAbiItem, decodeEventLog, decodeAbiParameters } from 'viem';
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

const ACTIVE_CACHE_KEY = 'ans_active_listings_cache';

/**
 * Get cached active listings for instant 0ms UI rendering
 */
export function getCachedActiveListings(): MarketplaceListing[] {
  try {
    const raw = localStorage.getItem(ACTIVE_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Query on-chain contract to verify and fetch all truly active listings.
 * Uses parallel requests and fast timeouts for rapid loading.
 */
export function fetchActiveListings(publicClient: any, userOwnedNames: string[] = []): Promise<MarketplaceListing[]> {
  return (async () => {
    const tracked = getTrackedListingNames();
    const candidates = new Set([...tracked, ...userOwnedNames.map(cleanName), 'ferar', 'user1', 'nimox']);

    try {
      // 1. Try Explorer v2 API with a fast 1.2s timeout so it never stalls the UI
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);

      const apiRes = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`, {
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeoutId);

      if (apiRes && apiRes.ok) {
        const json = await apiRes.json();
        const items = json.items || [];
        for (const log of items) {
          if (log.topics?.[0] === '0xc87e6029eb4b9211a0eb39f94b63248b8b1660b93a577aa53d04aeaf66ca77bc') {
            try {
              const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], log.data);
              if (decoded[0]) {
                candidates.add(cleanName(decoded[0]));
              }
            } catch {}
          }
        }
      }
    } catch {
      // Explorer fetch failed or timed out; proceed immediately with candidates
    }

    const candidatesArray = Array.from(candidates).filter(Boolean);

    // 2. Query candidates concurrently in parallel with Promise.all
    const results = await Promise.all(
      candidatesArray.map(async (cand) => {
        try {
          const listing = await publicClient.readContract({
            address: ANS_ADDRESS,
            abi: ANS_ABI,
            functionName: 'getListing',
            args: [cand],
          });

          if (listing && listing.active && listing.seller !== '0x0000000000000000000000000000000000000000') {
            return {
              cand,
              listing: {
                name: `${cand}.arc`,
                seller: listing.seller,
                price: Number(formatUnits(listing.price, 6)),
                expiry: Date.now() + 90 * 24 * 60 * 60 * 1000,
              } as MarketplaceListing,
            };
          }
        } catch {
          // Inactive or not listed
        }
        return null;
      })
    );

    const activeListings: MarketplaceListing[] = [];
    const validTracked: string[] = [];

    for (const res of results) {
      if (res) {
        activeListings.push(res.listing);
        validTracked.push(res.cand);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validTracked));
      localStorage.setItem(ACTIVE_CACHE_KEY, JSON.stringify(activeListings));
    } catch {
      // ignore storage errors
    }

    return activeListings;
  })();
}

export interface SoldListing {
  name: string;
  seller: string;
  buyer: string;
  price: number;
  timestamp: number;
  txHash?: string;
}

const SOLD_STORAGE_KEY = 'ans_marketplace_sold';

export const INITIAL_SOLD_LISTINGS: SoldListing[] = [
  {
    name: 'user1.arc',
    seller: '0x5B16cCCB2A13Fd2c5feC3321f0cFA98bccBBDa7d',
    buyer: '0x815289D5c67E533d008fd38C51B1159cFa9BDa0c',
    price: 5.0,
    timestamp: 1791846041010,
    txHash: '0x446af6b1853eeca8fc74147a2a4aaf50b3243fef9023bf842a7b128a05c2cd07',
  },
];

export function getSoldListings(): SoldListing[] {
  try {
    const raw = localStorage.getItem(SOLD_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(INITIAL_SOLD_LISTINGS));
      return INITIAL_SOLD_LISTINGS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(INITIAL_SOLD_LISTINGS));
      return INITIAL_SOLD_LISTINGS;
    }

    // Filter out old fake mock names that do not exist on the smart contract, and maler.arc (which is not sold)
    const purged = parsed.filter((item: SoldListing) => {
      const c = cleanName(item.name);
      return c !== 'genesis' && c !== 'crypto' && c !== 'alpha' && c !== 'maler';
    });

    // Ensure confirmed on-chain sold listings are present
    for (const init of INITIAL_SOLD_LISTINGS) {
      if (!purged.some((p: SoldListing) => cleanName(p.name) === cleanName(init.name))) {
        purged.push(init);
      }
    }

    localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(purged));
    return purged;
  } catch {
    return INITIAL_SOLD_LISTINGS;
  }
}

export function recordSoldListing(item: SoldListing): void {
  try {
    const current = getSoldListings();
    const clean = cleanName(item.name);
    const updated = [item, ...current.filter(c => cleanName(c.name) !== clean)];
    localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
  } catch (err) {
    console.error('Failed to record sold listing:', err);
  }
}

/**
 * Fetch and sync all sold events directly from Blockscout v2 contract logs
 */
export async function syncSoldListingsFromLogs(): Promise<SoldListing[]> {
  try {
    const res = await fetch(`https://explorer.testnet.arc.io/api/v2/addresses/${ANS_ADDRESS}/logs`);
    if (!res.ok) return getSoldListings();
    const json = await res.json();
    const items = json.items || [];
    const current = getSoldListings();
    let updated = [...current];
    let changed = false;

    for (const item of items) {
      if (item.topics?.[0] === '0xe3202271e290250caf3bcfb96c2e7e8e5f63158e26901feb4c260069737892ef') {
        try {
          const seller = '0x' + item.topics[1].slice(26);
          const buyer = '0x' + item.topics[2].slice(26);
          const decoded = decodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], item.data);
          const name = decoded[0].endsWith('.arc') ? decoded[0] : `${decoded[0]}.arc`;
          const price = Number(decoded[1]) / 1e6;
          const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : 1791846041010;
          const txHash = item.transaction_hash;

          const exists = updated.some(s => cleanName(s.name) === cleanName(name) && s.txHash === txHash);
          if (!exists) {
            updated.unshift({
              name,
              seller,
              buyer,
              price,
              timestamp,
              txHash,
            });
            changed = true;
          }
        } catch {}
      }
    }

    if (changed) {
      localStorage.setItem(SOLD_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('ans_marketplace_updated'));
    }
    return updated;
  } catch (e) {
    return getSoldListings();
  }
}

