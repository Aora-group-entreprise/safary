import { createClient } from '@supabase/supabase-js';

// Publishable key: designed for browser use. Database access is enforced by RLS.
const url=(import.meta.env.VITE_SUPABASE_URL as string|undefined)||'https://tzznkrxnwbadgwsvlsle.supabase.co';
const key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined)
  ||(import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined)
  ||'sb_publishable_-FjX828dyVXfm94U1vWG7g_UVHeXyyv';
export const isSupabaseConfigured=Boolean(url&&key);
export const supabase=isSupabaseConfigured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
