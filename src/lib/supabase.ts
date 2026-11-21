import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
let configuredUrl = '';
let configuredAnonKey = '';

export function normalizeSupabaseUrl(rawUrl?: string): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/(rest|auth|storage|functions)\/v1\/?.*$/i, '').replace(/\/+$/, '');
  }
}

configuredUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined
);
configuredAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || ''
).trim();

export function getSupabaseOrigin(): string {
  return configuredUrl;
}

export function initSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const nextUrl = normalizeSupabaseUrl(url) || configuredUrl;
  const nextKey = (anonKey || configuredAnonKey || '').trim();
  if (!nextUrl || !nextKey) return null;

  if (!client || nextUrl !== configuredUrl || nextKey !== configuredAnonKey) {
    configuredUrl = nextUrl;
    configuredAnonKey = nextKey;
    client = createClient(nextUrl, nextKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (client) return client;
  return initSupabaseClient();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(configuredUrl && configuredAnonKey);
}
