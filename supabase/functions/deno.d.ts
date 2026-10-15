/// <reference lib="esnext" />
/// <reference lib="dom" />

/**
 * Global Deno type declarations for Supabase Edge Functions.
 */
declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  export const env: Env;

  export interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onError?: (error: unknown) => Response | Promise<Response>;
    onListen?: (params: { hostname: string; port: number }) => void;
  }

  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: ServeOptions
  ): void;

  export function serve(
    options: ServeOptions,
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

// Ambient declarations for Deno standard library HTTP server
declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: {
      port?: number;
      hostname?: string;
      signal?: AbortSignal;
      onError?: (error: unknown) => Response | Promise<Response>;
      onListen?: (params: { hostname: string; port: number }) => void;
    }
  ): void;
}

// Ambient declarations for esm.sh packages used in Supabase Edge Functions
declare module 'https://esm.sh/@supabase/supabase-js@2.42.0' {
  export * from '@supabase/supabase-js';
}

declare module 'https://esm.sh/viem@2.9.20' {
  export * from 'viem';
}
