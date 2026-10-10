import { formatUnits } from 'viem';
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
    const candidates = Array.from(new Set([...tracked, ...userOwnedNames.map(cleanName)]));

    const activeListings: MarketplaceListing[] = [];
    const validTracked: string[] = [];

    for (const cand of candidates) {
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
