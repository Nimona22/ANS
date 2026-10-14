/**
 * ANS Notifications Library
 *
 * Provides typed helpers for reading and marking-as-read the ANS in-app
 * notifications stored in Supabase.
 *
 * Security model:
 *   The `notifications` table has no direct public/anon access at the
 *   database level (all RLS policies block public SELECT and UPDATE).
 *   All notification operations go through the `get-notifications`
 *   Supabase Edge Function, which verifies wallet ownership via a
 *   server-issued challenge and ERC-1271/personal_sign signature before
 *   serving any data.
 *
 *   This prevents any client from reading or marking another wallet's
 *   notifications by simply passing a different address in a query.
 *
 * UX trade-off:
 *   Real-time Supabase channel subscriptions cannot be secured without
 *   a Supabase Auth JWT. They have been removed.
 *
 *   Notifications are fetched on demand when the user opens the bell
 *   dropdown. This avoids repeated signature prompts. The caller may
 *   also call `refresh()` explicitly (e.g. after a marketplace purchase).
 *
 *   Each fetch and mark-read requires the user to sign one challenge.
 *   Mark-read and fetch are batched into a single action to minimize prompts.
 *
 * Note on Circle counterfactual smart accounts:
 *   Circle smart accounts that have never been deployed on-chain cannot
 *   satisfy ERC-1271 verification. verifyMessage will return false and
 *   the Edge Function will return 401. This is the correct fail-closed
 *   response. If support for counterfactual accounts is required, a
 *   Circle-specific verification flow must be implemented.
 *
 * Never import or expose the service-role key in this file.
 */

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { supabaseUrl, isSupabaseConfigured } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationKind =
  | 'name_sold'      // Your name was sold to a buyer
  | 'name_bought'    // You purchased a name
  | 'name_expiring'  // A name you own is expiring soon
  | 'tip_received'   // You received a USDC tip
  | 'tip_sent'       // You sent a USDC tip
  | 'tx_success'     // Transaction succeeded
  | 'tx_failed';     // Transaction failed

export interface ANSNotification {
  id: string;
  recipient_address: string;   // lowercase checksummed address
  kind: NotificationKind;
  title: string;
  body: string;
  /** Optional deep-link destination, e.g. "profile:alice.arc" or "marketplace" */
  link?: string | null;
  tx_hash?: string | null;
  is_read: boolean;
  created_at: string;          // ISO timestamp
}

/**
 * Callback type for signing a notification access challenge.
 * Receives the canonical message string, must return the hex signature.
 * Wire to: getSmartAccount(credential).signMessage({ message })
 */
export type SignChallengeCallback = (message: string) => Promise<string>;

// ─── Edge Function URL helper ─────────────────────────────────────────────────

function getEdgeFunctionUrl(functionName: string): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

const getAnonKey = () =>
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';

// ─── Core API ────────────────────────────────────────────────────────────────

interface ChallengeResponse {
  success: boolean;
  challenge: string;
  message: string;
  expiresAt: string;
}

async function requestChallenge(walletAddress: string): Promise<ChallengeResponse | null> {
  const url = getEdgeFunctionUrl('get-notifications');
  if (!url) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getAnonKey(),
      },
      body: JSON.stringify({ action: 'request_challenge', walletAddress }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[notifications] requestChallenge failed:', err);
      return null;
    }
    return await res.json() as ChallengeResponse;
  } catch (err) {
    console.error('[notifications] requestChallenge network error:', err);
    return null;
  }
}

export interface EdgeFunctionCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  isAccountUndeployed?: boolean;
  userCancelled?: boolean;
}

async function callEdgeFunction(
  action: 'fetch' | 'mark_read',
  walletAddress: string,
  signChallenge: SignChallengeCallback,
  extra?: Record<string, unknown>
): Promise<EdgeFunctionCallResult | null> {
  const url = getEdgeFunctionUrl('get-notifications');
  if (!url) return null;

  const challengeData = await requestChallenge(walletAddress);
  if (!challengeData) {
    console.error('[notifications] Failed to obtain challenge from Edge Function');
    return { success: false, error: 'Challenge request failed' };
  }

  let signature: string;
  try {
    signature = await signChallenge(challengeData.message);
  } catch (err: unknown) {
    const isCancel =
      (err as { name?: string })?.name === 'NotAllowedError' ||
      String(err).toLowerCase().includes('cancel') ||
      String(err).toLowerCase().includes('abort');
    if (!isCancel) {
      console.error('[notifications] Signing rejected or failed:', err);
    }
    return { success: false, userCancelled: isCancel, error: 'Signing rejected' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: getAnonKey(),
      },
      body: JSON.stringify({
        action,
        walletAddress,
        challenge: challengeData.challenge,
        message: challengeData.message,
        signature,
        ...extra,
      }),
    });

    if (res.status === 403) {
      const err = await res.json().catch(() => ({}));
      if (err?.error === 'ACCOUNT_NOT_DEPLOYED') {
        return { success: false, isAccountUndeployed: true, error: 'ACCOUNT_NOT_DEPLOYED' };
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[notifications] ${action} Edge Function error:`, err);
      return { success: false, error: err?.error || `HTTP ${res.status}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (err) {
    console.error(`[notifications] ${action} network error:`, err);
    return { success: false, error: 'Network error' };
  }
}

export interface FetchNotificationsResponse {
  notifications: ANSNotification[];
  isAccountUndeployed: boolean;
  userCancelled?: boolean;
  error?: string | null;
}

/**
 * Detailed notification fetch returning deployment status and error details.
 */
export async function fetchNotificationsDetailed(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<FetchNotificationsResponse> {
  if (!isSupabaseConfigured) {
    return { notifications: [], isAccountUndeployed: false };
  }
  const result = await callEdgeFunction('fetch', walletAddress, signChallenge);
  if (!result) {
    return { notifications: [], isAccountUndeployed: false, error: 'Connection failed' };
  }
  if (result.isAccountUndeployed) {
    return { notifications: [], isAccountUndeployed: true, error: 'ACCOUNT_NOT_DEPLOYED' };
  }
  if (result.userCancelled) {
    return { notifications: [], isAccountUndeployed: false, userCancelled: true };
  }
  if (!result.success) {
    return { notifications: [], isAccountUndeployed: false, error: result.error ?? 'Request failed' };
  }
  const r = result.data as { notifications?: unknown[] } | undefined;
  return {
    notifications: ((r?.notifications ?? []) as ANSNotification[]),
    isAccountUndeployed: false,
  };
}

/**
 * Fetch notifications for a wallet.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function fetchNotifications(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<ANSNotification[]> {
  const res = await fetchNotificationsDetailed(walletAddress, signChallenge);
  return res.notifications;
}

/**
 * Mark a single notification as read.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function markRead(
  id: string,
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await callEdgeFunction('mark_read', walletAddress, signChallenge, { id });
}

/**
 * Mark ALL notifications for a wallet as read.
 * Requires the wallet owner to sign a server-issued challenge.
 */
export async function markAllRead(
  walletAddress: string,
  signChallenge: SignChallengeCallback
): Promise<void> {
  if (!isSupabaseConfigured) return;
  await callEdgeFunction('mark_read', walletAddress, signChallenge);
}

// ─── React Hook ──────────────────────────────────────────────────────────────

export interface UseNotificationsResult {
  notifications: ANSNotification[];
  unreadCount: number;
  isLoading: boolean;
  isAccountUndeployed: boolean;
  hasCachedSession: boolean;
  /**
   * Manually load/refresh notifications.
   * Prompts the user to sign once per session unless force is true.
   */
  refresh: (force?: boolean) => Promise<void>;
  /** Optimistically marks one notification read, then persists via Edge Function. */
  markOneRead: (id: string) => Promise<void>;
  /** Optimistically marks all notifications read, then persists via Edge Function. */
  markAllAsRead: () => Promise<void>;
}

// ─── Client-side Transaction Notifications ─────────────────────────────────────

/** Helper to retrieve local client-side transaction notifications */
export function getClientNotifications(walletAddress: string): ANSNotification[] {
  if (!walletAddress || typeof window === 'undefined') return [];
  try {
    const key = `ans_client_notifs_${walletAddress.toLowerCase()}`;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ANSNotification[]) : [];
  } catch {
    return [];
  }
}

/**
 * Dispatch a client-side transaction status notification (success or failure with reason).
 * Immediately persists to localStorage and dispatches a notification update event.
 */
export function addClientNotification(
  walletAddress: string | null | undefined,
  data: {
    kind: NotificationKind;
    title: string;
    body: string;
    tx_hash?: string | null;
    link?: string | null;
  }
): void {
  if (!walletAddress || typeof window === 'undefined') return;
  const norm = walletAddress.toLowerCase();
  const newNotif: ANSNotification = {
    id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    recipient_address: norm,
    kind: data.kind,
    title: data.title,
    body: data.body,
    tx_hash: data.tx_hash || null,
    link: data.link || null,
    is_read: false,
    created_at: new Date().toISOString(),
  };

  try {
    const key = `ans_client_notifs_${norm}`;
    const existing: ANSNotification[] = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [newNotif, ...existing.filter((x) => x.id !== newNotif.id)].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.warn('[notifications] Failed to persist client notification', err);
  }

  window.dispatchEvent(
    new CustomEvent('ans_notifications_updated', {
      detail: { wallet: norm, notif: newNotif },
    })
  );
}

function mergeWithClientNotifications(
  serverNotifs: ANSNotification[],
  clientNotifs: ANSNotification[]
): ANSNotification[] {
  const map = new Map<string, ANSNotification>();
  for (const c of clientNotifs) {
    map.set(c.id, c);
  }
  for (const s of serverNotifs) {
    map.set(s.id, s);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// In-memory session cache so opening the bell does not prompt for passkey PIN every time
const sessionNotificationCache = new Map<string, { notifications: ANSNotification[]; timestamp: number }>();

export function useNotifications(
  walletAddress: string | null | undefined,
  signChallenge: SignChallengeCallback | null | undefined
): UseNotificationsResult {
  const normAddr = walletAddress?.toLowerCase() || '';

  const [notifications, setNotifications] = useState<ANSNotification[]>(() => {
    const client = normAddr ? getClientNotifications(normAddr) : [];
    const server =
      normAddr && sessionNotificationCache.has(normAddr)
        ? sessionNotificationCache.get(normAddr)!.notifications
        : [];
    return mergeWithClientNotifications(server, client);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountUndeployed, setIsAccountUndeployed] = useState(false);

  // Sync state if wallet address switches
  useEffect(() => {
    if (normAddr) {
      const client = getClientNotifications(normAddr);
      const server = sessionNotificationCache.has(normAddr)
        ? sessionNotificationCache.get(normAddr)!.notifications
        : [];
      setNotifications(mergeWithClientNotifications(server, client));
    } else {
      setNotifications([]);
    }
  }, [normAddr]);

  // Listen for live client-side transaction updates
  useEffect(() => {
    if (!normAddr || typeof window === 'undefined') return;
    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<{ wallet: string; notif: ANSNotification }>;
      if (custom.detail?.wallet === normAddr) {
        setNotifications((prev) => {
          const client = getClientNotifications(normAddr);
          const server = sessionNotificationCache.has(normAddr)
            ? sessionNotificationCache.get(normAddr)!.notifications
            : prev.filter((n) => !n.id.startsWith('client_'));
          return mergeWithClientNotifications(server, client);
        });
      }
    };
    window.addEventListener('ans_notifications_updated', handleUpdate);
    return () => window.removeEventListener('ans_notifications_updated', handleUpdate);
  }, [normAddr]);

  const hasCachedSession = Boolean(normAddr && sessionNotificationCache.has(normAddr));

  const refresh = useCallback(
    async (force = false) => {
      if (!walletAddress || !signChallenge || !isSupabaseConfigured) {
        const client = normAddr ? getClientNotifications(normAddr) : [];
        setNotifications(client);
        setIsAccountUndeployed(false);
        return;
      }

      const norm = walletAddress.toLowerCase();
      // If we already have a cached session and force wasn't requested, use cached items
      if (!force && sessionNotificationCache.has(norm)) {
        const client = getClientNotifications(norm);
        setNotifications(mergeWithClientNotifications(sessionNotificationCache.get(norm)!.notifications, client));
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetchNotificationsDetailed(walletAddress, signChallenge);
        setIsAccountUndeployed(res.isAccountUndeployed);
        if (res.notifications) {
          sessionNotificationCache.set(norm, {
            notifications: res.notifications,
            timestamp: Date.now(),
          });
          const client = getClientNotifications(norm);
          setNotifications(mergeWithClientNotifications(res.notifications, client));
        }
        if (!res.isAccountUndeployed && !res.userCancelled && res.error) {
          toast.error('Could not load notifications');
        }
      } catch (err) {
        console.error('[notifications] refresh error:', err);
        toast.error('Could not load notifications');
      } finally {
        setIsLoading(false);
      }
    },
    [walletAddress, signChallenge, normAddr]
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markOneRead = useCallback(
    async (id: string) => {
      if (!walletAddress) return;
      // Optimistic update locally
      const updated = notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      setNotifications(updated);

      if (id.startsWith('client_')) {
        if (normAddr) {
          const key = `ans_client_notifs_${normAddr}`;
          try {
            const current = getClientNotifications(normAddr);
            const saved = current.map((n) => (n.id === id ? { ...n, is_read: true } : n));
            localStorage.setItem(key, JSON.stringify(saved));
          } catch {}
        }
        return;
      }

      if (normAddr) {
        const cached = sessionNotificationCache.get(normAddr);
        if (cached) {
          sessionNotificationCache.set(normAddr, {
            notifications: cached.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
            timestamp: Date.now(),
          });
        }
      }

      if (signChallenge && !isAccountUndeployed) {
        try {
          await markRead(id, walletAddress, signChallenge);
        } catch {
          // Keep local read state even if background sync fails
        }
      }
    },
    [walletAddress, signChallenge, isAccountUndeployed, notifications, normAddr]
  );

  const markAllAsRead = useCallback(async () => {
    if (!walletAddress) return;
    const updated = notifications.map((n) => ({ ...n, is_read: true }));
    setNotifications(updated);

    if (normAddr) {
      const key = `ans_client_notifs_${normAddr}`;
      try {
        const current = getClientNotifications(normAddr);
        const saved = current.map((n) => ({ ...n, is_read: true }));
        localStorage.setItem(key, JSON.stringify(saved));
      } catch {}

      const cached = sessionNotificationCache.get(normAddr);
      if (cached) {
        sessionNotificationCache.set(normAddr, {
          notifications: cached.notifications.map((n) => ({ ...n, is_read: true })),
          timestamp: Date.now(),
        });
      }
    }

    if (signChallenge && !isAccountUndeployed) {
      try {
        await markAllRead(walletAddress, signChallenge);
      } catch {
        // Keep local read state even if background sync fails
      }
    }
  }, [walletAddress, signChallenge, isAccountUndeployed, notifications, normAddr]);

  return {
    notifications,
    unreadCount,
    isLoading,
    isAccountUndeployed,
    hasCachedSession,
    refresh,
    markOneRead,
    markAllAsRead,
  };
}
