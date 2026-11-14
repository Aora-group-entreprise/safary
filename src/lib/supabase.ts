import { createClient } from '@supabase/supabase-js';

const url=(import.meta.env.VITE_SUPABASE_URL as string|undefined)||'https://tzznkrxnwbadgwsvlsle.supabase.co';
const key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined)
  ||(import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined)
  ||'sb_publishable_-FjX828dyVXfm94U1vWG7g_UVHeXyyv';

const safaryFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('safary_session') : null;
  if (token) headers.set('x-safary-session', token);
  else headers.delete('x-safary-session');
  return fetch(input, { ...init, headers });
};

export const isSupabaseConfigured=Boolean(url&&key);
export const supabase=isSupabaseConfigured?createClient(url,key,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:safaryFetch},
}):null;
