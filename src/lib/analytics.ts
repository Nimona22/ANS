import { supabase, isSupabaseConfigured } from './supabase';

type EventType = 
  | 'page_viewed'
  | 'name_search_performed'
  | 'registration_flow_started'
  | 'registration_completed'
  | 'marketplace_viewed'
  | 'purchase_flow_started'
  | 'purchase_completed'
  | 'wallet_connected';

interface TrackEventParams {
  eventType: EventType;
  walletAddress?: string;
  metadata?: Record<string, any>;
}

// Minimal session tracking without personal identifiers
let sessionId: string | null = null;
try {
  sessionId = sessionStorage.getItem('ans_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('ans_session_id', sessionId);
  }
} catch {
  // Gracefully fallback if sessionStorage is blocked
}

export async function trackEvent({ eventType, walletAddress, metadata }: TrackEventParams) {
  if (!isSupabaseConfigured || !supabase) {
    return; // Silently ignore if Supabase is not configured
  }

  try {
    const { error } = await supabase
      .from('analytics_events')
      .insert([
        {
          event_type: eventType,
          session_id: sessionId,
          wallet_address: walletAddress || null,
          metadata: metadata || {},
        },
      ]);

    if (error) {
      console.warn('Failed to track analytics event:', error.message);
    }
  } catch (err) {
    // Never block the user flow for analytics failures
    console.warn('Exception while tracking analytics event', err);
  }
}
