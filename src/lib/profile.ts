import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export interface UserProfile {
  address: string;
  email?: string;
  displayName?: string;
  bio?: string; // max 160 chars
  twitter?: string; // handle without @
  website?: string;
  avatar?: string;
  avatarUrl?: string; // profile picture url or compressed data url
  bannerUrl?: string; // banner picture url or compressed data url
}

// In-memory profile cache for instantaneous retrieval across components
const profileMemoryCache = new Map<string, UserProfile>();

// Event listeners for profile changes
type ProfileListener = (profile: UserProfile) => void;
const listeners = new Map<string, Set<ProfileListener>>();

export function subscribeToProfile(address: string, callback: ProfileListener): () => void {
  const key = address.toLowerCase();
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key)!.add(callback);

  return () => {
    listeners.get(key)?.delete(callback);
    if (listeners.get(key)?.size === 0) {
      listeners.delete(key);
    }
  };
}

function notifyProfileChange(profile: UserProfile) {
  const key = profile.address.toLowerCase();
  profileMemoryCache.set(key, profile);
  listeners.get(key)?.forEach((fn) => {
    try {
      fn(profile);
    } catch (e) {
      console.error('Error notifying profile listener:', e);
    }
  });
}

/**
 * Loads a profile synchronously from cache or localStorage
 */
export const loadProfile = (address: string): UserProfile => {
  if (!address) return { address: '' };
  const key = address.toLowerCase();

  if (profileMemoryCache.has(key)) {
    return profileMemoryCache.get(key)!;
  }

  try {
    const raw = localStorage.getItem(`ans_profile_${key}`) || localStorage.getItem(`ans_profile_${address}`);
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfile;
      const normalized: UserProfile = { ...parsed, address };
      profileMemoryCache.set(key, normalized);
      return normalized;
    }
  } catch (err) {
    console.warn('Failed to parse cached profile for', address, err);
  }

  const fallback: UserProfile = { address };
  profileMemoryCache.set(key, fallback);
  return fallback;
};

/**
 * Saves a profile locally (localStorage & memory) and notifies listeners
 */
export const saveProfile = (profile: UserProfile): void => {
  if (!profile.address) return;
  const key = profile.address.toLowerCase();

  profileMemoryCache.set(key, profile);

  try {
    const json = JSON.stringify(profile);
    localStorage.setItem(`ans_profile_${key}`, json);
    localStorage.setItem(`ans_profile_${profile.address}`, json);
  } catch (err) {
    console.warn('Failed to save profile to localStorage:', err);
  }

  notifyProfileChange(profile);
};

/**
 * Fetches profile from Supabase globally and updates cache
 */
export async function fetchProfileGlobal(address: string): Promise<UserProfile | null> {
  if (!address || !isSupabaseConfigured || !supabase) {
    return loadProfile(address);
  }

  const key = address.toLowerCase();

  try {
    // Select ONLY safe public profile columns; never request email or sensitive fields
    const { data, error } = await supabase
      .from('user_profiles')
      .select('wallet_address, display_name, bio, avatar_url, banner_url, twitter, website')
      .eq('wallet_address', key)
      .maybeSingle();

    if (error) {
      // If table doesn't exist yet, warn gently without breaking UI
      if (error.code === 'PGRST205') {
        console.warn(
          'Supabase table "user_profiles" not found. Please run the supabase_setup.sql script in your Supabase SQL Editor.'
        );
      } else {
        console.warn('Error fetching profile from Supabase:', error.message);
      }
      return loadProfile(address);
    }

    if (data) {
      const existingLocal = loadProfile(address);
      const remoteProfile: UserProfile = {
        address,
        displayName: data.display_name ?? existingLocal.displayName,
        bio: data.bio ?? existingLocal.bio,
        avatarUrl: data.avatar_url ?? existingLocal.avatarUrl,
        bannerUrl: data.banner_url ?? existingLocal.bannerUrl,
        twitter: data.twitter ?? existingLocal.twitter,
        website: data.website ?? existingLocal.website,
        // Public queries never return email; preserve existing local-only email for this wallet if present
        email: existingLocal.email,
        avatar: existingLocal.avatar,
      };

      // Update local storage and memory
      saveProfile(remoteProfile);
      return remoteProfile;
    }
  } catch (err) {
    console.error('Unexpected error fetching global profile:', err);
  }

  return loadProfile(address);
}

/**
 * Saves profile locally and handles remote synchronization safely.
 * Direct unauthenticated client writes to Supabase user_profiles are disabled
 * to prevent unauthorized spoofing of wallet addresses.
 */
export async function saveProfileGlobal(
  profile: UserProfile
): Promise<{ success: boolean; error?: string; globalSaved: boolean }> {
  if (!profile.address) {
    return { success: false, error: 'Wallet address is required', globalSaved: false };
  }

  // 1. Immediately save to localStorage and local state (memory cache + subscriber notifications)
  saveProfile(profile);

  // 2. If Supabase is not configured, fallback gracefully to local-only persistence
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: true,
      globalSaved: false,
      error: 'Supabase is not configured. Changes saved locally.',
    };
  }

  try {
    const key = profile.address.toLowerCase();
    const payload = {
      wallet_address: key,
      display_name: profile.displayName?.trim() || null,
      bio: profile.bio?.trim() || null,
      avatar_url: profile.avatarUrl || null,
      banner_url: profile.bannerUrl || null,
      twitter: profile.twitter ? profile.twitter.trim().replace(/^@/, '') : null,
      website: profile.website?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_profiles')
      .upsert(payload, { onConflict: 'wallet_address' });

    if (error) {
      console.warn('Supabase profile remote sync warning:', error.message);
      return {
        success: true,
        globalSaved: false,
        error: `Saved locally. Remote sync: ${error.message}`,
      };
    }

    return {
      success: true,
      globalSaved: true,
    };
  } catch (err: any) {
    console.error('Failed to sync profile globally to Supabase:', err);
    return {
      success: true,
      globalSaved: false,
      error: `Saved locally. Remote sync: ${err?.message || 'Network error'}`,
    };
  }
}

/**
 * Compresses an image file in the browser using HTML5 Canvas.
 * Keeps aspect ratio, scales to max dimensions, and optimizes quality to yield ~20-60KB data URL.
 */
export function compressImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback to original data URL if 2d context unavailable
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Try webp first, fallback to jpeg
        let result = '';
        try {
          result = canvas.toDataURL('image/webp', quality);
          if (!result.startsWith('data:image/webp')) {
            result = canvas.toDataURL('image/jpeg', quality);
          }
        } catch {
          result = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(result);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Custom hook to get and automatically sync user profile
 */
export function useUserProfile(targetAddress: string | undefined) {
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile(targetAddress || ''));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!targetAddress) return;

    // Load initial local cache
    setProfile(loadProfile(targetAddress));

    // Listen for any local updates (e.g. from edits or other tabs/components)
    const unsubscribe = subscribeToProfile(targetAddress, (updated) => {
      setProfile(updated);
    });

    // Fetch globally from Supabase
    setIsLoading(true);
    fetchProfileGlobal(targetAddress)
      .then((remote) => {
        if (remote) {
          setProfile(remote);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    return () => {
      unsubscribe();
    };
  }, [targetAddress]);

  return { profile, setProfile, isLoading };
}
