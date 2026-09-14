import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { Session } from "@supabase/supabase-js";

const extra = Constants.expoConfig?.extra ?? {};
const DEFAULT_API_URL = (extra.apiUrl as string | undefined) || "http://localhost:4000";
const STORAGE_KEY = "sportzarena.apiUrlOverride";

let runtimeApiUrl = DEFAULT_API_URL;

export function getApiUrl() {
  return runtimeApiUrl;
}

/** @deprecated use getApiUrl() — kept for existing screens */
export const apiUrl = DEFAULT_API_URL;

export async function loadApiUrlOverride() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved?.trim()) runtimeApiUrl = normalizeApiUrl(saved);
  } catch {
    // keep default
  }
  return runtimeApiUrl;
}

export async function setApiUrlOverride(next: string) {
  const normalized = normalizeApiUrl(next);
  runtimeApiUrl = normalized;
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  return normalized;
}

export async function clearApiUrlOverride() {
  runtimeApiUrl = DEFAULT_API_URL;
  await AsyncStorage.removeItem(STORAGE_KEY);
  return runtimeApiUrl;
}

function normalizeApiUrl(raw: string) {
  let value = String(raw || "").trim().replace(/\/$/, "");
  value = value.replace(/^https:(\d)/i, "https://$1").replace(/^http:(\d)/i, "http://$1");
  value = value.replace(/(\d{1,3}(?:\.\d{1,3}){3})\.(\d{2,5})(?=\/?$)/, "$1:$2");
  return value;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function reachabilityHint() {
  return (
    `Current API: ${runtimeApiUrl}. `
    + `If LAN fails, run: npx cloudflared tunnel --url http://127.0.0.1:4000 `
    + `then paste the https://….trycloudflare.com URL below and Retry.`
  );
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: T & { error?: string };
    try {
      body = JSON.parse(text) as T & { error?: string };
    } catch {
      throw new Error(
        `API returned non-JSON (${response.status}). Check API_URL points at the Arena API, not a web page.`,
      );
    }
    if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `API timed out after ${DEFAULT_TIMEOUT_MS / 1000}s. ${reachabilityHint()}`,
      );
    }
    if (error instanceof TypeError || /network request failed/i.test(String((error as Error)?.message))) {
      throw new Error(`Cannot reach API. ${reachabilityHint()}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetchJson<T>(`${runtimeApiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function apiRequest<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  return fetchJson<T>(`${runtimeApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function opsRequest<T>(
  session: Session,
  organizationId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  return fetchJson<T>(`${runtimeApiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "x-organization-id": organizationId,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
