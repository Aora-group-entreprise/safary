import { createClient } from '@supabase/supabase-js';

// Browser traffic always uses the same origin. Cloudflare Workers proxies /api/*
// to the Supabase project; Vite provides the equivalent proxy in local development.
const url = typeof window !== 'undefined'
  ? `${window.location.origin}/api`
  : 'https://tzznkrxnwbadgwsvlsle.supabase.co';

const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
  || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || 'sb_publishable_-FjX828dyVXfm94U1vWG7g_UVHeXyyv';

const safaryFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, header) => headers.set(header, value));
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('safary_session') : null;
  if (token) headers.set('x-client-info', `safary-session:${token}`);
  return fetch(input, { ...init, headers });
};

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: safaryFetch },
}) : null;
