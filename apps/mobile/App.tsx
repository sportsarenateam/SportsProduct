import { useEffect, useState, Component, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session, User } from "@supabase/supabase-js";
import { apiRequest, clearApiUrlOverride, getApiUrl, loadApiUrlOverride, opsRequest, setApiUrlOverride } from "./lib/api";
import { supabase, supabaseConfigError } from "./lib/supabase";
import type { AppRole, Arena, InventoryItem, MobilePage, SportConfig } from "./lib/types";
import { Screen, Card, Muted, PrimaryButton, LinkButton, Title, Field, Label, colors } from "./components/ui";
import { LoginScreen } from "./screens/LoginScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { SetPasswordScreen } from "./screens/SetPasswordScreen";
import { ForgotPasswordScreen } from "./screens/ForgotPasswordScreen";
import { BookingScreen } from "./screens/BookingScreen";
import { CoachingScreen } from "./screens/CoachingScreen";
import { MembershipScreen } from "./screens/MembershipScreen";
import { MembershipExpiringScreen } from "./screens/MembershipExpiringScreen";
import { InvoiceScreen } from "./screens/InvoiceScreen";
import { MenuScreen } from "./screens/MenuScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SalesScreen } from "./screens/SalesScreen";
import { SubscriptionScreen } from "./screens/SubscriptionScreen";
import { SportsScreen } from "./screens/SportsScreen";
import { ArenaOnboardingScreen } from "./screens/ArenaOnboardingScreen";
import { WorkspaceNavigator } from "./navigation/WorkspaceNavigator";
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import * as SplashScreen from "expo-splash-screen";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "App crashed" };
  }

  render() {
    if (this.state.error) {
      return (
        <Screen>
          <Title>Something went wrong</Title>
          <Card>
            <Muted>{this.state.error}</Muted>
            <PrimaryButton label="Try again" onPress={() => this.setState({ error: null })} />
          </Card>
        </Screen>
      );
    }
    return this.props.children;
  }
}

function userNeedsPasswordSetup(user: User | null | undefined) {
  return Boolean(user) && user!.user_metadata?.password_set !== true;
}

function isEntitled(arena: Arena) {
  const now = Date.now();
  const status = arena.status === "created" ? "trialing" : arena.status;
  if (status === "trialing" && arena.trial_ends_at && new Date(arena.trial_ends_at).getTime() > now) return true;
  if (status === "active" || status === "authenticated") {
    // Paid plan: if renew date is set and past, block access (same rule as API).
    if (arena.current_period_ends_at && new Date(arena.current_period_ends_at).getTime() <= now) return false;
    return true;
  }
  return false;
}

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  return (
    <ErrorBoundary>
      <AppBody />
    </ErrorBoundary>
  );
}

function AppBody() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [arena, setArena] = useState<Arena | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [sports, setSports] = useState<SportConfig[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [page, setPage] = useState<MobilePage>("home");
  const [selectedSport, setSelectedSport] = useState<SportConfig | null>(null);
  const [bevOnly, setBevOnly] = useState(false);
  const [opsError, setOpsError] = useState("");
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const [authGate, setAuthGate] = useState<"landing" | "login" | "forgot">("landing");
  const [apiUrlDraft, setApiUrlDraft] = useState(getApiUrl());
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    loadApiUrlOverride().then((url) => {
      setApiUrlDraft(url);
      setApiReady(true);
    });
  }, []);

  useEffect(() => {
    if (supabaseConfigError) {
      setAuthReady(true);
      setBootstrapDone(true);
      setAuthError(supabaseConfigError);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) {
        setAuthReady(true);
        setAuthError((current) => current || "Auth is taking too long. Pull to reload.");
      }
    }, 8000);
    supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setAuthReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setAuthError(err instanceof Error ? err.message : "Unable to start auth");
        setAuthReady(true);
      })
      .finally(() => clearTimeout(timer));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!authReady || !apiReady) return;
    if (!session) {
      setArena(null);
      setRole(null);
      setSports([]);
      setInventory([]);
      setBootstrapDone(true);
      setBootstrapping(false);
      setPage("home");
      return;
    }

    setBootstrapping(true);
    setBootstrapDone(false);
    setOpsError("");

    apiRequest<{
      memberships: Array<{
        role?: string;
        organizations: {
          id: string;
          name: string;
          address?: string | null;
          pincode?: string | null;
          contact_phone?: string | null;
        } | Array<{
          id: string;
          name: string;
          address?: string | null;
          pincode?: string | null;
          contact_phone?: string | null;
        }> | null;
      }>;
      role?: AppRole | null;
      sports?: string[];
      subscription?: { status: string; trial_ends_at: string | null; current_period_ends_at?: string | null } | null;
    }>(session, "/me/bootstrap")
      .then(async ({ memberships, role: roleFromApi, subscription }) => {
        const rawOrg = memberships[0]?.organizations;
        const organization = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
        const nextRole = (roleFromApi ?? memberships[0]?.role ?? null) as AppRole | null;
        setRole(nextRole);

        if (!organization) {
          setArena(null);
          return;
        }

        const rawStatus = subscription?.status ?? "trialing";
        const nextArena: Arena = {
          id: organization.id,
          name: organization.name,
          trial_ends_at: subscription?.trial_ends_at ?? null,
          current_period_ends_at: subscription?.current_period_ends_at ?? null,
          status: rawStatus === "created" ? "trialing" : rawStatus,
          address: organization.address ?? "",
          pincode: organization.pincode ?? "",
          contactPhone: organization.contact_phone ?? "",
        };
        setArena(nextArena);

        if (!isEntitled(nextArena)) {
          setSports([]);
          setInventory([]);
          return;
        }

        const ops = await opsRequest<{ sports: SportConfig[]; inventory: InventoryItem[] }>(
          session,
          nextArena.id,
          "/ops/bootstrap",
        );
        setSports(ops.sports);
        setInventory(ops.inventory);
        if (nextRole === "owner" && ops.sports.length === 0) {
          setPage("sports");
        }
      })
      .catch((err) => {
        setOpsError(err instanceof Error ? err.message : "Unable to load account");
        setArena(null);
      })
      .finally(() => {
        setBootstrapping(false);
        setBootstrapDone(true);
      });
  }, [session, authReady, apiReady, bootKey]);

  async function refreshOps() {
    if (!session || !arena) return;
    const ops = await opsRequest<{ sports: SportConfig[]; inventory: InventoryItem[] }>(
      session,
      arena.id,
      "/ops/bootstrap",
    );
    setSports(ops.sports);
    setInventory(ops.inventory);
  }

  if (!fontsLoaded || !authReady || !apiReady || (session && !bootstrapDone)) {
    return (
      <Screen scroll={false} navy>
        <StatusBar style="light" />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={colors.green} size="large" />
          <Muted light>{bootstrapping ? "Loading your arena…" : "Starting…"}</Muted>
          <Muted light>API: {getApiUrl()}</Muted>
        </View>
      </Screen>
    );
  }

  if (authError && !session) {
    return (
      <Screen>
        <Title>Cannot start</Title>
        <Card>
          <Muted>{authError}</Muted>
          <Muted>Check root .env SUPABASE_URL / SUPABASE_ANON_KEY, then restart Expo with -c.</Muted>
        </Card>
      </Screen>
    );
  }

  if (!session) {
    if (authGate === "landing") {
      return <LandingScreen onSignIn={() => setAuthGate("login")} />;
    }
    if (authGate === "forgot") {
      return <ForgotPasswordScreen onBack={() => setAuthGate("login")} />;
    }
    return (
      <LoginScreen
        onSession={setSession}
        onBack={() => setAuthGate("landing")}
        onForgotPassword={() => setAuthGate("forgot")}
      />
    );
  }

  if (userNeedsPasswordSetup(session.user)) {
    return <SetPasswordScreen onDone={setSession} />;
  }

  if (opsError) {
    return (
      <Screen>
        <Title>Cannot reach API</Title>
        <Card>
          <Muted>{opsError}</Muted>
          <Label>API URL</Label>
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            value={apiUrlDraft}
            onChangeText={setApiUrlDraft}
            placeholder="https://….trycloudflare.com"
          />
          <Muted>
            A real phone cannot use 127.0.0.1 (that is the phone itself). Use the live API,
            or on PC run: npx cloudflared tunnel --url http://127.0.0.1:4000 and paste the https URL.
          </Muted>
          <PrimaryButton
            label="Use live API (api.sportsarena.team)"
            onPress={async () => {
              const url = await setApiUrlOverride("https://api.sportsarena.team");
              setApiUrlDraft(url);
              setOpsError("");
              setBootKey((k) => k + 1);
            }}
          />
          <PrimaryButton
            label="Save API URL & retry"
            onPress={async () => {
              await setApiUrlOverride(apiUrlDraft);
              setOpsError("");
              setBootKey((k) => k + 1);
            }}
          />
          <PrimaryButton label="Retry connection" onPress={() => { setOpsError(""); setBootKey((k) => k + 1); }} />
          <LinkButton
            label="Clear saved API override"
            onPress={async () => {
              const url = await clearApiUrlOverride();
              setApiUrlDraft(url);
              setOpsError("");
              setBootKey((k) => k + 1);
            }}
          />
          <LinkButton label="Sign out" onPress={() => supabase.auth.signOut()} />
        </Card>
      </Screen>
    );
  }

  if (!arena) {
    return (
      <ArenaOnboardingScreen
        session={session}
        onComplete={(next) => {
          setArena(next);
          setRole("owner");
          setPage("sports");
          setBootKey((k) => k + 1);
        }}
      />
    );
  }

  const isOwner = role === "owner";
  const showPaywall = !isEntitled(arena) || (showUpgrade && isOwner);

  if (showPaywall) {
    if (isOwner) {
      return (
        <SubscriptionScreen
          session={session}
          arena={arena}
          upgradingDuringTrial={showUpgrade && isEntitled(arena)}
          onActivated={async (next) => {
            setShowUpgrade(false);
            setArena((current) => (current ? { ...current, ...next } : current));
            setMessage("Subscription activated. Welcome aboard!");
            try {
              const ops = await opsRequest<{ sports: SportConfig[]; inventory: InventoryItem[] }>(
                session,
                arena.id,
                "/ops/bootstrap",
              );
              setSports(ops.sports);
              setInventory(ops.inventory);
              if (ops.sports.length === 0) setPage("sports");
            } catch {
              // Paywall clears; bootstrap may retry on next open.
            }
          }}
          onDismiss={showUpgrade && isEntitled(arena) ? () => setShowUpgrade(false) : undefined}
        />
      );
    }
    return (
      <Screen>
        <Title>Arena access paused</Title>
        <Card>
          <Muted>Ask the arena owner to renew the SportzArena subscription. Staff cannot make payments.</Muted>
          <PrimaryButton label="Sign out" onPress={() => supabase.auth.signOut()} />
        </Card>
      </Screen>
    );
  }

  if (isOwner && sports.length === 0) {
    return (
      <SportsScreen
        session={session}
        onSaved={async () => {
          await refreshOps();
          setMessage("Sports saved.");
        }}
      />
    );
  }

  return (
    <WorkspaceNavigator
      session={session}
      arena={arena}
      role={role ?? "manager"}
      sports={sports}
      inventory={inventory}
      message={message}
      onMessage={setMessage}
      onRefreshOps={refreshOps}
      onArenaSaved={(next) => setArena((current) => (current ? { ...current, ...next } : current))}
      onUpgrade={isOwner ? () => setShowUpgrade(true) : undefined}
      onLogout={() => supabase.auth.signOut()}
    />
  );

}
