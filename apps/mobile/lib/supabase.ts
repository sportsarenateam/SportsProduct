import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import "react-native-url-polyfill/auto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const extra = Constants.expoConfig?.extra ?? {};
const supabaseUrl = (extra.supabaseUrl as string | undefined) ?? "";
const supabasePublishableKey = (extra.supabaseAnonKey as string | undefined) ?? "";

export const supabaseConfigError =
  !supabaseUrl || !supabasePublishableKey
    ? "Missing SUPABASE_URL or SUPABASE_ANON_KEY in the root .env file."
    : "";

export const supabase: SupabaseClient = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabasePublishableKey || "public-anon-key",
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
