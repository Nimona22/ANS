export interface NameActivityItem {
  id: string;
  name: string; // e.g. "nimox.arc"
  action:
    | 'Registered Name'
    | 'Received Tip'
    | 'Sent Tip'
    | 'Bought Name'
    | 'Sold Name'
    | 'Gifted Name'
    | 'Listed for Sale'
    | 'Renewed Name'
    | 'Transferred Name';
  amount: string; // e.g. "1.5 USDC", "50 USDC", "-"
  from: string; // e.g. "Arc Protocol", "0x5B16...", "bob.arc"
  to?: string;
  timestamp: number; // millisecond timestamp
  txHash?: string;
  note?: string;
}

export function cleanName(name: string): string {
  return name.toLowerCase().replace(/\.arc$/i, '').replace('.arc', '').trim();
}

/**
 * Format timestamp into human-readable relative time
 */
export function formatRelativeTime(timestampMs: number): string {
  if (!timestampMs || isNaN(timestampMs)) return 'Recently';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 120) return '1 minute ago';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
  if (diffSeconds < 7200) return '1 hour ago';
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
  if (diffSeconds < 172800) return 'Yesterday';
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)} days ago`;
  if (diffSeconds < 31536000) {
    const months = Math.floor(diffSeconds / 2592000);
    return months <= 1 ? '1 month ago' : `${months} months ago`;
  }
  const years = Math.floor(diffSeconds / 31536000);
  return years <= 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Calculate registration / renewal price based on name character length and duration
 */
export function calculateRegistrationPriceUSDC(name: string, durationMonths: number = 3): string {
  const clean = cleanName(name);
  const len = clean.length;
  const dur = Number(durationMonths) || 3;

  if (len === 3) {
    if (dur <= 3) return '5 USDC';
    if (dur <= 6) return '9 USDC';
    if (dur <= 9) return '12 USDC';
    return '15 USDC';
  } else if (len === 4) {
    if (dur <= 3) return '3 USDC';
    if (dur <= 6) return '5.5 USDC';
    if (dur <= 9) return '7.5 USDC';
    return '9 USDC';
  } else if (len === 5) {
    if (dur <= 3) return '1.5 USDC';
    if (dur <= 6) return '2.75 USDC';
    if (dur <= 9) return '3.75 USDC';
    return '4.5 USDC';
  } else {
    // 6+ characters
    if (dur <= 3) return '0.5 USDC';
    if (dur <= 6) return '0.9 USDC';
    if (dur <= 9) return '1.2 USDC';
    return '1.5 USDC';
  }
}

/**
 * Get stored activities from localStorage
 */
export function getStoredActivities(name: string): NameActivityItem[] {
  const clean = cleanName(name);
  if (!clean) return [];
  try {
    const raw = localStorage.getItem(`ans_activity_${clean}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record a new activity item into localStorage and dispatch update event
 */
export function recordActivity(item: Omit<NameActivityItem, 'id'>): NameActivityItem {
  const clean = cleanName(item.name);
  const newItem: NameActivityItem = {
    ...item,
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: clean.endsWith('.arc') ? clean : `${clean}.arc`,
  };

  try {
    const existing = getStoredActivities(clean);
    // Avoid duplicate transactions if same txHash and action
    const filtered = item.txHash
      ? existing.filter(e => !(e.txHash === item.txHash && e.action === item.action))
      : existing;

    const updated = [newItem, ...filtered];
    localStorage.setItem(`ans_activity_${clean}`, JSON.stringify(updated));

    // Also store in a recent activities feed
    const globalRaw = localStorage.getItem('ans_global_activities');
    const globalList: NameActivityItem[] = globalRaw ? JSON.parse(globalRaw) : [];
    const updatedGlobal = [newItem, ...globalList.filter(g => g.id !== newItem.id)].slice(0, 50);
    localStorage.setItem('ans_global_activities', JSON.stringify(updatedGlobal));

    if (item.action === 'Registered Name' || item.action === 'Gifted Name') {
      addRecentlyRegisteredName(clean);
    }

    window.dispatchEvent(new CustomEvent('ans_activity_updated', { detail: newItem }));
  } catch (err) {
    console.error('Failed to save activity:', err);
  }

  return newItem;
}

/**
 * Get recently registered names from storage & activity logs
 */
export function getRecentlyRegisteredNames(): string[] {
  try {
    const raw = localStorage.getItem('ans_recent_registered');
    const list: string[] = raw ? JSON.parse(raw) : [];

    // Also extract from global activities
    const globalRaw = localStorage.getItem('ans_global_activities');
    if (globalRaw) {
      const activities = JSON.parse(globalRaw);
      for (const act of activities) {
        if ((act.action === 'Registered Name' || act.action === 'Gifted Name') && act.name) {
          const formatted = act.name.endsWith('.arc') ? act.name : `${act.name}.arc`;
          if (!list.includes(formatted)) {
            list.unshift(formatted);
          }
        }
      }
    }

    // Include nimox.arc by default as confirmed on-chain registered identity
    if (!list.includes('nimox.arc')) {
      list.push('nimox.arc');
    }

    return list.slice(0, 8);
  } catch {
    return ['nimox.arc'];
  }
}

/**
 * Record a newly registered name to recent registrations list
 */
export function addRecentlyRegisteredName(name: string): void {
  const clean = cleanName(name);
  if (!clean) return;
  const fullName = `${clean}.arc`;
  try {
    const current = getRecentlyRegisteredNames();
    const updated = [fullName, ...current.filter(n => cleanName(n) !== clean)].slice(0, 12);
    localStorage.setItem('ans_recent_registered', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('ans_recent_registered_updated', { detail: fullName }));
  } catch (err) {
    console.error('Failed to add recently registered name:', err);
  }
}

/**
 * Get the user's primary/main name preference for their wallet
 */
export function getUserPrimaryName(address?: string | null): string | null {
  if (!address) return null;
  try {
    const stored = localStorage.getItem(`ans_primary_${address.toLowerCase()}`);
    if (stored) {
      return stored.endsWith('.arc') ? stored : `${stored}.arc`;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Set which name the user will use as their main one
 */
export function setUserPrimaryName(address: string, name: string): void {
  if (!address || !name) return;
  const clean = cleanName(name);
  const fullName = `${clean}.arc`;
  try {
    localStorage.setItem(`ans_primary_${address.toLowerCase()}`, clean);
    window.dispatchEvent(
      new CustomEvent('ans_primary_changed', { detail: { address, primaryName: fullName } })
    );
  } catch (err) {
    console.error('Failed to set primary name:', err);
  }
}

/**
 * Detect on-chain registration timestamp and duration
 */
export function detectRegistrationDetails(
  clean: string,
  expirySeconds: number,
  memberSinceSeconds?: number
): { registrationTimestamp: number; durationMonths: number; priceUSDC: string } {
  const standardDurations = [
    { months: 3, seconds: 90 * 86400 },
    { months: 6, seconds: 180 * 86400 },
    { months: 9, seconds: 270 * 86400 },
    { months: 12, seconds: 360 * 86400 },
  ];

  // If memberSince exists and matches expiry - memberSince
  if (memberSinceSeconds && memberSinceSeconds > 0) {
    const diff = expirySeconds - memberSinceSeconds;
    const match = standardDurations.find(d => Math.abs(d.seconds - diff) < 1800); // within 30 mins
    if (match) {
      return {
        registrationTimestamp: memberSinceSeconds * 1000,
        durationMonths: match.months,
        priceUSDC: calculateRegistrationPriceUSDC(clean, match.months),
      };
    }
  }

  // Fallback: estimate from expiry remaining from current time (or block time)
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = expirySeconds - nowSec;
  // Find standard duration that encompasses remaining
  const matchedDur = standardDurations.find(d => d.seconds >= remaining - 3600) || standardDurations[0];
  const regTimestamp = Math.max(1, (expirySeconds - matchedDur.seconds)) * 1000;

  return {
    registrationTimestamp: regTimestamp,
    durationMonths: matchedDur.months,
    priceUSDC: calculateRegistrationPriceUSDC(clean, matchedDur.months),
  };
}

/**
 * Get realistic activities for a name, fusing on-chain facts and recorded local transactions
 */
export function getRealisticNameActivities(options: {
  name: string;
  hasOnchainOwner: boolean;
  ownerAddress?: string;
  expirySeconds?: number;
  memberSinceSeconds?: number;
  isMockName?: boolean;
}): NameActivityItem[] {
  const { name, hasOnchainOwner, ownerAddress, expirySeconds, memberSinceSeconds, isMockName } = options;
  const clean = cleanName(name);

  // 1. Get any real activities explicitly recorded in localStorage
  const stored = getStoredActivities(clean);

  // 2. If it's registered on-chain:
  if (hasOnchainOwner && expirySeconds && expirySeconds > 0) {
    const hasRegEvent = stored.some(
      a => a.action === 'Registered Name' || a.action === 'Gifted Name'
    );

    let list = [...stored];
    if (!hasRegEvent) {
      const regInfo = detectRegistrationDetails(clean, expirySeconds, memberSinceSeconds);
      const onchainRegEvent: NameActivityItem = {
        id: `onchain_reg_${clean}`,
        name: `${clean}.arc`,
        action: 'Registered Name',
        amount: regInfo.priceUSDC,
        from: 'Arc Protocol',
        to: ownerAddress,
        timestamp: regInfo.registrationTimestamp,
      };
      list.push(onchainRegEvent);
    }

    // Sort newest first
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }

  // 3. If stored activities exist, return them
  if (stored.length > 0) {
    return stored.sort((a, b) => b.timestamp - a.timestamp);
  }

  // 4. For purely mock names (preview only when not registered on-chain):
  if (isMockName) {
    return [
      {
        id: `mock_reg_${clean}`,
        name: `${clean}.arc`,
        action: 'Registered Name',
        amount: calculateRegistrationPriceUSDC(clean, 12),
        from: 'Arc Protocol',
        timestamp: Date.now() - 180 * 24 * 60 * 60 * 1000,
      },
    ];
  }

  return [];
}
