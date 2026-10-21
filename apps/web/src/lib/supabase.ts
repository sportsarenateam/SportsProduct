import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function isConfiguredValue(value: string | undefined): value is string {
  return Boolean(value?.trim() && !/(?:your-project|your-publishable|your-anon|placeholder|server-only|change[-_ ]?me|\bxxx\b)/i.test(value));
}

function isValidSupabaseUrl(value: string | undefined): value is string {
  if (!isConfiguredValue(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export const missingSupabaseConfig = [
  ...(!isValidSupabaseUrl(url) ? ["VITE_SUPABASE_URL"] : []),
  ...(!isConfiguredValue(key) ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
];

// Persist session in localStorage so refresh / mobile browser reopen keeps the user signed in.
export const supabase = isValidSupabaseUrl(url) && isConfiguredValue(key)
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
        storageKey: "sportzarena-auth",
      },
    })
  : null;

const ARENA_CACHE_KEY = "sportzarena-arena";
const SPORTS_CACHE_KEY = "sportzarena-sports";

export function cacheArena(userId: string, arena: {
  id: string;
  name: string;
  trial_ends_at: string | null;
  current_period_ends_at?: string | null;
  status: string;
  address?: string;
  pincode?: string;
  contactPhone?: string;
} | null) {
  if (!arena) {
    localStorage.removeItem(`${ARENA_CACHE_KEY}:${userId}`);
    return;
  }
  localStorage.setItem(`${ARENA_CACHE_KEY}:${userId}`, JSON.stringify(arena));
}

export function readCachedArena(userId: string) {
  try {
    const raw = localStorage.getItem(`${ARENA_CACHE_KEY}:${userId}`);
    return raw ? JSON.parse(raw) as {
      id: string;
      name: string;
      trial_ends_at: string | null;
      current_period_ends_at?: string | null;
      status: string;
      address?: string;
      pincode?: string;
      contactPhone?: string;
    } : null;
  } catch {
    return null;
  }
}

export function cacheSports(userId: string, sports: string[]) {
  localStorage.setItem(`${SPORTS_CACHE_KEY}:${userId}`, JSON.stringify(sports));
}

export function readCachedSports(userId: string) {
  try {
    const raw = localStorage.getItem(`${SPORTS_CACHE_KEY}:${userId}`);
    return raw ? JSON.parse(raw) as string[] : [];
  } catch {
    return [];
  }
}

export function clearUserCache(userId?: string) {
  if (!userId) return;
  localStorage.removeItem(`${ARENA_CACHE_KEY}:${userId}`);
  localStorage.removeItem(`${SPORTS_CACHE_KEY}:${userId}`);
}
