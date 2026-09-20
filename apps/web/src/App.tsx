import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  cacheArena,
  cacheSports,
  clearUserCache,
  readCachedArena,
  readCachedSports,
  supabase,
} from "./lib/supabase";
import sportzArenaLogo from "./assets/sportzarena-logo.png";
import sportzArenaBackground from "./assets/sportzarena-background.png";
import cricketIcon from "./assets/cricket.png";
import footballIcon from "./assets/football.png";
import badmintonIcon from "./assets/badminton.png";
import tableTennisIcon from "./assets/table-tennis.png";
import pickleballIcon from "./assets/pickleball.png";
import carromIcon from "./assets/carrom.png";
import skatingIcon from "./assets/skating.png";
import volleyballIcon from "./assets/volleyball.png";
import { WorkspaceApp } from "./workspace/WorkspaceApp";
import type { AppRole, WorkspacePage } from "./workspace/types";
import { assertPasswordStrength, PASSWORD_HINT } from "./workspace/opsHelpers";
import { ThemeToggle } from "./components/ThemeToggle";

type Arena = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  current_period_ends_at?: string | null;
  status: string;
  address?: string;
  pincode?: string;
  contactPhone?: string;
};
const navigate = (path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function formatLandingCount(n: number) {
  if (!Number.isFinite(n) || n < 0) return "0+";
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M+`;
  }
  if (n >= 1_000) return `${Math.floor(n).toLocaleString("en-IN")}+`;
  return `${Math.floor(n)}+`;
}

/** OTP-created users must set a password once before password login works. */
function userNeedsPasswordSetup(user: User | null | undefined) {
  return Boolean(user) && user!.user_metadata?.password_set !== true;
}

async function saveAccountPassword(password: string) {
  assertPasswordStrength(password);
  const { error } = await supabase!.auth.updateUser({
    password,
    data: { password_set: true },
  });
  if (error) {
    if (/same.?password|different from the old/i.test(error.message)) {
      throw new Error("New password must be different from your current password");
    }
    if (/422|weak|pwned|compromised|characters/i.test(error.message)) {
      throw new Error(PASSWORD_HINT);
    }
    throw new Error(error.message);
  }
  const { data, error: sessionError } = await supabase!.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);
  if (!data.session) throw new Error("Session expired. Verify OTP again, then set your password.");
  return data.session;
}

function nextPathAfterAuth(arena: Arena | null, sportsCount: number, role: AppRole | null = null) {
  if (!arena) return "/onboarding/arena";
  // Staff join an existing arena — skip sports setup (owner configures sports).
  if (!sportsCount && role === "owner") return "/onboarding/sports";
  if (!sportsCount && role && role !== "owner") return "/app";
  if (!sportsCount) return "/onboarding/sports";
  return "/app";
}

function PasswordInput({
  label,
  name,
  value,
  onChange,
  autoComplete = "new-password",
  autoFocus,
  placeholder,
  required = true,
}: {
  label: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <label>
      {label}
      <span className="password-field">
        <input
          type={show ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          minLength={8}
          maxLength={72}
          required={required}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "🙈" : "👁"}
        </button>
      </span>
    </label>
  );
}

function digitsOnlyPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

async function apiRequest<T>(session: Session, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function pathToWorkspacePage(pathname: string): WorkspacePage {
  if (pathname === "/app/sales") return "sales";
  if (pathname === "/app/coaching") return "coaching";
  if (pathname === "/app/billing") return "billing";
  if (pathname === "/app/expiring") return "expiring";
  if (pathname === "/app/invoice") return "invoice";
  if (pathname === "/app/menu") return "menu";
  if (pathname === "/app/profile") return "profile";
  if (pathname === "/app/booking" || pathname === "/app/beverages") return "booking";
  return "home";
}

function workspacePageToPath(page: WorkspacePage, bevOnly = false) {
  if (page === "home") return "/app";
  if (page === "booking") return bevOnly ? "/app/beverages" : "/app/booking";
  return `/app/${page}`;
}

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [session, setSession] = useState<Session | null>(null);
  const [arena, setArena] = useState<Arena | null>(null);
  const [sports, setSports] = useState<string[]>([]);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const bootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setBootstrapDone(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user.id) {
        const cached = readCachedArena(data.session.user.id);
        if (cached) setArena(cached);
        const cachedSports = readCachedSports(data.session.user.id);
        if (cachedSports.length) setSports(cachedSports);
      } else {
        setBootstrapDone(true);
      }
      setAuthReady(true);
    }).catch(() => {
      if (!cancelled) {
        setAuthReady(true);
        setBootstrapDone(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") return; // already handled by getSession
      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        return;
      }
      if (event === "SIGNED_OUT") {
        const uid = session?.user.id;
        clearUserCache(uid);
        setSession(null);
        setArena(null);
        setSports([]);
        setRole(null);
        bootstrappedFor.current = null;
        setBootstrapDone(true);
        setBootstrapping(false);
        return;
      }
      // New login / user switch: drop previous arena so deleted/recreated users get onboarding.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        const prevId = bootstrappedFor.current;
        const nextId = nextSession?.user.id ?? null;
        if (prevId && nextId && prevId !== nextId) {
          clearUserCache(prevId);
          setArena(null);
          setSports([]);
          setRole(null);
          bootstrappedFor.current = null;
          setBootstrapDone(false);
        }
      }
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    if (!session) {
      setArena(null);
      setSports([]);
      setRole(null);
      bootstrappedFor.current = null;
      setBootstrapping(false);
      setBootstrapDone(true);
      return;
    }
    const userId = session.user.id;
    if (bootstrappedFor.current === userId) return;
    bootstrappedFor.current = userId;
    setBootstrapping(true);
    setBootstrapDone(false);
    apiRequest<{
      memberships: Array<{ role?: string; organizations: {
        id: string;
        name: string;
        address?: string | null;
        pincode?: string | null;
        contact_phone?: string | null;
        arena_subscriptions?: { trial_ends_at: string | null; current_period_ends_at?: string | null; status: string } | Array<{
          trial_ends_at: string | null;
          current_period_ends_at?: string | null;
          status: string;
        }>;
      } | Array<{
        id: string;
        name: string;
        address?: string | null;
        pincode?: string | null;
        contact_phone?: string | null;
        arena_subscriptions?: { trial_ends_at: string | null; current_period_ends_at?: string | null; status: string } | Array<{
          trial_ends_at: string | null;
          current_period_ends_at?: string | null;
          status: string;
        }>;
      }> | null }>;
      role?: AppRole | null;
      sports?: string[];
      subscription?: { status: string; trial_ends_at: string | null; current_period_ends_at?: string | null } | null;
    }>(session, "/me/bootstrap")
      .then(({ memberships, sports: sportNames, subscription: subFromApi, role: roleFromApi }) => {
        const rawOrg = memberships[0]?.organizations;
        const organization = Array.isArray(rawOrg) ? rawOrg[0] : rawOrg;
        const rawSub = organization?.arena_subscriptions;
        const nestedSub = Array.isArray(rawSub) ? rawSub[0] : rawSub;
        const subscription = subFromApi ?? nestedSub;
        const rawStatus = subscription?.status ?? "trialing";
        const next = organization
          ? {
            id: organization.id,
            name: organization.name,
            trial_ends_at: subscription?.trial_ends_at ?? null,
            current_period_ends_at: subscription?.current_period_ends_at ?? null,
            status: rawStatus === "created" ? "trialing" : rawStatus,
            address: organization.address ?? "",
            pincode: organization.pincode ?? "",
            contactPhone: organization.contact_phone ?? "",
          }
          : null;
        const nextRole = (roleFromApi ?? memberships[0]?.role ?? null) as AppRole | null;
        setRole(nextRole);
        setArena(next);
        cacheArena(userId, next);
        if (Array.isArray(sportNames)) {
          setSports(sportNames);
          cacheSports(userId, sportNames);
        }
      })
      .catch(() => {
        // Keep cached arena on API blips so refresh does not bounce to login/onboarding.
        const cached = readCachedArena(userId);
        if (cached) {
          setArena(cached);
          const cachedSports = readCachedSports(userId);
          if (cachedSports.length) setSports(cachedSports);
        } else {
          // New / recreated users must not inherit a previous arena in memory.
          setArena(null);
          setSports([]);
          setRole(null);
        }
      })
      .finally(() => {
        setBootstrapping(false);
        setBootstrapDone(true);
      });
  }, [session, authReady]);

  useEffect(() => {
    if (!supabase || !arena || !session || !bootstrapDone) return;
    // Prefer sports from bootstrap; refresh from DB when opening sports editor.
    if (sports.length) return;
    void supabase.from("sports").select("name").eq("organization_id", arena.id).eq("active", true)
      .then(({ data, error }) => {
        if (error) {
          const cached = readCachedSports(session.user.id);
          if (cached.length) setSports(cached);
          return;
        }
        const names = (data ?? []).map((sport) => sport.name);
        setSports(names);
        cacheSports(session.user.id, names);
      });
  }, [arena, session, bootstrapDone, sports.length]);

  // Auth redirects — only after account bootstrap finishes.
  useEffect(() => {
    if (!authReady || bootstrapping || !bootstrapDone) return;
    const publicPaths = ["/", "/login", "/signup", "/forgot-password", "/auth/callback", "/reset-password"];
    if (!session) {
      if (!publicPaths.includes(path) && path !== "/onboarding/password") navigate("/login");
      return;
    }
    // Recovery link / forgot-password OTP pages only.
    if (path === "/forgot-password" || path === "/reset-password") return;

    if (userNeedsPasswordSetup(session.user)) {
      if (path !== "/onboarding/password") navigate("/onboarding/password");
      return;
    }

    // Password already set — never stay on the create-password screen.
    if (path === "/onboarding/password") {
      navigate(nextPathAfterAuth(arena, sports.length, role));
      return;
    }

    // Already signed in — leave login/signup for the app.
    if (path === "/login" || path === "/signup") {
      navigate(nextPathAfterAuth(arena, sports.length, role));
      return;
    }
    if (publicPaths.includes(path)) return;
    if (!arena && path !== "/onboarding/arena") {
      navigate("/onboarding/arena");
      return;
    }
    if (arena && path === "/onboarding/arena") {
      navigate(nextPathAfterAuth(arena, sports.length, role));
      return;
    }
    // Staff cannot run sports onboarding — owner configures sports.
    if (arena && path === "/onboarding/sports" && role && role !== "owner") {
      navigate("/app");
      return;
    }
    if (arena && sports.length && path === "/onboarding/sports") {
      navigate("/app");
      return;
    }
    if (arena && !sports.length && role === "owner" && (path === "/app" || path.startsWith("/app/"))) {
      navigate("/onboarding/sports");
      return;
    }
    // Staff: never open Sales Report.
    if (role && role !== "owner" && path === "/app/sales") {
      navigate("/app");
    }
  }, [authReady, bootstrapping, bootstrapDone, session, arena, sports.length, path, role]);

  const holdAuthShell =
    path === "/forgot-password" || path === "/reset-password" || path === "/onboarding/password";
  if (!authReady || (session && (!bootstrapDone || bootstrapping) && !holdAuthShell)) {
    return <main className="auth-page"><p>Loading SportzArena…</p></main>;
  }
  if (path === "/") return <Landing />;
  if (path === "/forgot-password") return <ForgotPassword />;
  if (path === "/auth/callback") return <AuthCallback />;
  if (path === "/reset-password") return <ResetPassword />;
  if (!supabase) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <h1>Configuration needed</h1>
          <p>Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the root `.env`, then restart the web server.</p>
        </section>
      </main>
    );
  }
  if (path === "/onboarding/password") {
    if (!session) {
      return <main className="auth-page"><p>Redirecting to login…</p></main>;
    }
    if (!userNeedsPasswordSetup(session.user)) {
      return <main className="auth-page"><p>Continuing to your arena…</p></main>;
    }
    return (
      <SetPasswordOnboarding
        onDone={(next) => {
          setSession(next);
          setArena(null);
          setSports([]);
          setRole(null);
          clearUserCache(next.user.id);
          bootstrappedFor.current = null;
          setBootstrapDone(false);
          navigate("/app");
        }}
      />
    );
  }
  if (path === "/login") {
    if (session) {
      return <main className="auth-page"><p>Taking you to your arena…</p></main>;
    }
    return <AuthForm mode="login" onSession={(next) => {
      setSession(next);
      bootstrappedFor.current = null;
      setBootstrapDone(false);
    }} />;
  }
  if (path === "/signup") {
    if (session) {
      return <main className="auth-page"><p>Taking you to your arena…</p></main>;
    }
    return (
      <AuthForm
        mode="signup"
        onSession={(next) => {
          setSession(next);
          bootstrappedFor.current = null;
          setBootstrapDone(false);
        }}
        onRegistered={(nextArena, userId) => {
          setArena(nextArena);
          cacheArena(userId, nextArena);
          setSports([]);
          cacheSports(userId, []);
          setRole("owner");
        }}
      />
    );
  }
  if (!session) {
    return <main className="auth-page"><p>Redirecting to login…</p></main>;
  }
  if (userNeedsPasswordSetup(session.user)) {
    return <main className="auth-page"><p>Set your password to continue…</p></main>;
  }
  if (!arena) {
    if (path === "/onboarding/arena") {
      return (
        <Onboarding
          session={session}
          onComplete={(nextArena) => {
            setArena(nextArena);
            cacheArena(session.user.id, nextArena);
            navigate("/onboarding/sports");
          }}
        />
      );
    }
    return <main className="auth-page"><p>Taking you to arena setup…</p></main>;
  }
  if (path === "/onboarding/arena") {
    return (
      <Onboarding
        session={session}
        onComplete={(nextArena) => {
          setArena(nextArena);
          cacheArena(session.user.id, nextArena);
          navigate("/onboarding/sports");
        }}
      />
    );
  }
  if (path === "/onboarding/sports" || path === "/app/sports") {
    if (role && role !== "owner") {
      return <main className="auth-page"><p>Only the owner can manage sports…</p></main>;
    }
    return (
      <SportSelect
        key={path}
        initialSelected={sports}
        allowEmptyContinue={false}
        backLabel={path === "/app/sports" ? "Back to dashboard" : "Back"}
        onBack={() => navigate(path === "/app/sports" ? "/app" : "/")}
        continueLabel={path === "/app/sports" ? "Save sports →" : "Continue to dashboard →"}
        onComplete={async (savedSports) => {
          const result = await apiRequest<{ sports: string[] }>(session, "/onboarding/sports", {
            method: "POST",
            body: JSON.stringify({ sports: savedSports }),
          });
          setSports(result.sports);
          cacheSports(session.user.id, result.sports);
          navigate("/app");
        }}
      />
    );
  }
  // Owner waits for sports; staff can open the workspace even if owner has not set sports yet.
  if (!sports.length && role === "owner") {
    return <main className="auth-page"><p>Loading sports…</p></main>;
  }

  const sportArt: Record<string, string> = {
    "Cricket Turf": cricketIcon,
    Badminton: badmintonIcon,
    Football: footballIcon,
    Pickleball: pickleballIcon,
    "Table Tennis": tableTennisIcon,
    Carrom: carromIcon,
    Skating: skatingIcon,
    Volleyball: volleyballIcon,
  };

  const workspacePage = pathToWorkspacePage(path);
  const bevOnlyFromPath = path === "/app/beverages";
  const safePage = role && role !== "owner" && workspacePage === "sales" ? "home" : workspacePage;

  return (
    <WorkspaceApp
      session={session}
      arena={arena!}
      role={role ?? "owner"}
      sportNames={sports}
      sportArt={sportArt}
      initialPage={safePage}
      initialBevOnly={bevOnlyFromPath}
      onPageChange={(page, bevOnly) => navigate(workspacePageToPath(page, bevOnly))}
      onAddSports={() => navigate("/app/sports")}
      onLogout={() => {
        clearUserCache(session.user.id);
        supabase!.auth.signOut().then(() => navigate("/login"));
      }}
      onSubscriptionUpdated={(next) => setArena((current) => {
        if (!current) return current;
        const updated = { ...current, ...next };
        cacheArena(session.user.id, updated);
        return updated;
      })}
    />
  );
}

function Brand() { return <img className="brand-logo" src={sportzArenaLogo} alt="SportzArena" />; }

function useRevealOnScroll() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!nodes.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function useCountUp(target: number, durationMs = 1600, runId = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (runId < 1) {
      setValue(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    setValue(0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, runId]);
  return value;
}

function HeroDashboardPreview({ highlightToken = 0 }: { highlightToken?: number }) {
  const [runId, setRunId] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const revenue = useCountUp(48250, 1800, runId);
  const bookings = useCountUp(36, 1400, runId);
  const members = useCountUp(28, 1500, runId);
  const active = runId > 0;

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let intervalId = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        setRunId(1);
        intervalId = window.setInterval(() => {
          setRunId((n) => n + 1);
        }, 9000);
        observer.disconnect();
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!highlightToken) return;
    setRunId((n) => Math.max(1, n + 1));
    rootRef.current?.classList.add("is-demo-focus");
    const t = window.setTimeout(() => rootRef.current?.classList.remove("is-demo-focus"), 1800);
    return () => window.clearTimeout(t);
  }, [highlightToken]);

  return (
    <div className="lp-hero-visual anim-fade-up" style={{ animationDelay: "180ms" }} ref={rootRef} id="demo">
      <div className="lp-laptop-shell" aria-hidden="true">
        <div className="lp-laptop-lid">
          <div className="lp-laptop-camera" />
          <div className="lp-laptop-screen">
            <div className="lp-device-desk lp-device-desk-live">
              <div className="lp-desk-chrome">
                <span /><span /><span />
                <em>app.sportsarena.team</em>
              </div>
              <div className="lp-desk-body">
                <aside className="lp-desk-side">
                  <b>Dashboard</b>
                  <span>Bookings</span>
                  <span>Sales</span>
                  <span>Membership</span>
                  <span>Invoice</span>
                </aside>
                <div className="lp-desk-main">
                  <p className="lp-desk-hello">Welcome back 👋</p>
                  <div className="lp-desk-kpis">
                    <article>
                      <small>Revenue</small>
                      <strong>₹{revenue.toLocaleString("en-IN")}</strong>
                    </article>
                    <article>
                      <small>Bookings</small>
                      <strong>{bookings}</strong>
                    </article>
                    <article>
                      <small>Members</small>
                      <strong>{members}</strong>
                    </article>
                  </div>
                  <div className="lp-desk-charts">
                    <div className={`lp-chart-line ${active ? "is-running" : ""}`} />
                    <div className={`lp-chart-donut ${active ? "is-running" : ""}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-laptop-base">
          <div className="lp-laptop-notch" />
        </div>
      </div>

      <div className="lp-device-phone lp-device-phone-live">
        <div className="lp-phone-notch" />
        <p>Good Morning</p>
        <div className="lp-phone-kpis">
          <span>₹{Math.round(revenue / 1000)}k</span>
          <span>{bookings}</span>
        </div>
        <div className={`lp-phone-bars ${active ? "is-running" : ""}`}>
          <i /><i /><i /><i /><i /><i /><i />
        </div>
      </div>

      <div className="lp-hero-sports">
        {[
          { name: "Badminton", image: badmintonIcon },
          { name: "Carrom", image: carromIcon },
          { name: "Skating", image: skatingIcon },
          { name: "Volleyball", image: volleyballIcon },
        ].map((sport) => (
          <article key={sport.name}>
            <span className="lp-sport-icon"><img src={sport.image} alt="" /></span>
            <b>{sport.name}</b>
          </article>
        ))}
      </div>
      <p className="lp-script">More Sports More Possibilities</p>
    </div>
  );
}

function useAnimatedPrice(target: number) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const from = valueRef.current;
    const start = performance.now();
    const duration = 420;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

function PlanCard({
  plan,
  index,
}: {
  plan: { name: string; monthly: number; detail: string; features: string[]; featured?: boolean };
  index: number;
}) {
  const animatedPrice = useAnimatedPrice(plan.monthly);
  return (
    <article
      className={plan.featured ? "plan featured plan-centered" : "plan plan-centered"}
      data-reveal
      style={{ transitionDelay: `${120 + index * 90}ms` }}
    >
      <div className="plan-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          <circle cx="24" cy="24" r="22" fill="#e8f5e1" />
          <path d="M16 24.5 21.2 29.5 32 17.5" stroke="#1f7a1f" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3>{plan.name}</h3>
      <p>{plan.detail}</p>
      <h2 className="plan-price">₹{animatedPrice}<small>/month</small></h2>
      <p className="billing-note">Billed monthly · One arena</p>
      <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
      <button type="button" className="primary" onClick={() => navigate("/signup")}>
        Start 30-day free trial
      </button>
    </article>
  );
}

function Landing() {
  useRevealOnScroll();
  const [landingStats, setLandingStats] = useState({
    venues: "—",
    customers: "—",
    bookings: "—",
    uptime: "99.9%",
  });
  const [arenaNames, setArenaNames] = useState<string[]>([]);
  const [arenaIndex, setArenaIndex] = useState(0);
  const [demoPulse, setDemoPulse] = useState(0);

  function watchDemo() {
    const el = document.getElementById("demo");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      setDemoPulse((n) => n + 1);
      return;
    }
    window.location.hash = "demo";
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/public/landing-stats`);
        if (!res.ok) throw new Error("stats failed");
        const data = await res.json() as {
          venues?: number;
          customers?: number;
          bookings?: number;
          uptime?: string;
          arenas?: string[];
        };
        if (cancelled) return;
        setLandingStats({
          venues: formatLandingCount(Number(data.venues ?? 0)),
          customers: formatLandingCount(Number(data.customers ?? 0)),
          bookings: formatLandingCount(Number(data.bookings ?? 0)),
          uptime: data.uptime || "99.9%",
        });
        setArenaNames(
          Array.isArray(data.arenas)
            ? [...new Set(data.arenas.map((n) => String(n).trim()).filter(Boolean))]
            : [],
        );
        setArenaIndex(0);
      } catch {
        if (!cancelled) {
          setLandingStats({
            venues: "—",
            customers: "—",
            bookings: "—",
            uptime: "99.9%",
          });
          setArenaNames([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (arenaNames.length < 2) return;
    const timer = window.setInterval(() => {
      setArenaIndex((i) => (i + 1) % arenaNames.length);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [arenaNames]);

  const arenaMarqueeLoop = (() => {
    if (!arenaNames.length) return [] as string[];
    const copiesNeeded = Math.max(8, Math.ceil(16 / arenaNames.length));
    const half = Array.from({ length: copiesNeeded }, () => arenaNames).flat();
    return [...half, ...half];
  })();
  const arenaMarqueeDuration = Math.max(28, Math.round(arenaMarqueeLoop.length * 1.1));

  const plans = [
    {
      name: "Starter",
      monthly: 499,
      detail: "Everything one sports arena needs to bill and grow",
      features: [
        "Court & walk-in billing",
        "Invoices & WhatsApp receipts",
        "Coaching & memberships",
        "Sales reports",
        "Email OTP login for owners",
      ],
      featured: true,
    },
  ];
  const features = [
    { title: "Easy Bookings", text: "Book courts in seconds with rates, slots, and walk-in billing in one flow.", icon: "📅" },
    { title: "Customer Management", text: "Keep members, coaching, and walk-ins organized with clear records.", icon: "👥" },
    { title: "Billing & Payments", text: "Collect cash or online, apply discounts, and share WhatsApp receipts.", icon: "₹" },
    { title: "Track Profit & Expenses", text: "See revenue by sport, coaching, membership, and items at a glance.", icon: "📊" },
    { title: "Manage Arenas & Courts", text: "Configure sports, courts, and hourly rates for your arena layout.", icon: "🏟️" },
    { title: "Access Anywhere", text: "Run the same ops on phone or desktop — owners and staff stay in sync.", icon: "📱" },
  ];

  return (
    <main className="landing landing-v2">
      <nav className="landing-nav">
        <a className="landing-brand" href="/" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <img className="brand-logo" src={sportzArenaLogo} alt="" />
          <span className="landing-brand-text">
            <span>Sportz</span><span className="accent">Arena</span>
          </span>
        </a>
        <div className="landing-nav-links">
          <a className="is-active" href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#plans">Pricing</a>
          <a href="#about">About Us</a>
          <a href="#contact">Contact</a>
        </div>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <button type="button" className="btn-ghost" onClick={() => navigate("/login")}>Login</button>
          <button type="button" className="primary" onClick={() => navigate("/signup")}>Get Started Free</button>
        </div>
      </nav>

      <section className="lp-hero" id="home">
        <div className="lp-hero-glow lp-hero-glow-a" aria-hidden="true" />
        <div className="lp-hero-glow lp-hero-glow-b" aria-hidden="true" />
        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <p className="lp-badge anim-fade-up">All-in-One Sports Venue Management</p>
            <h1 className="anim-fade-up" style={{ animationDelay: "80ms" }}>
              Manage Your <span className="accent">Sports Arena</span> Business
            </h1>
            <p className="lp-lead anim-fade-up" style={{ animationDelay: "160ms" }}>
              Court bookings, invoices, coaching, memberships, and sales — one workspace built for Indian sports arenas.
            </p>
            <div className="lp-hero-actions anim-fade-up" style={{ animationDelay: "240ms" }}>
              <button type="button" className="primary large" onClick={() => navigate("/signup")}>
                Get Started Free →
              </button>
              <button
                type="button"
                className="btn-ghost large"
                onClick={watchDemo}
              >
                ▶ Watch Demo
              </button>
            </div>
            {arenaNames.length > 0 && (
              <div className="lp-arena-ticker lp-arena-ticker-hero anim-fade-up" style={{ animationDelay: "280ms" }} aria-live="polite">
                <p className="lp-arena-ticker-label">Partner arenas on SportzArena</p>
                <div className="lp-arena-ticker-window">
                  <div
                    className="lp-arena-ticker-track"
                    style={{ transform: `translateY(-${arenaIndex * 100}%)` }}
                  >
                    {arenaNames.map((name, i) => (
                      <div key={`hero-${name}-${i}`} className="lp-arena-ticker-item">
                        <strong>{name}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <ul className="lp-trust anim-fade-up" style={{ animationDelay: "320ms" }}>
              <li>No credit card required</li>
              <li>Easy setup</li>
              <li>30-day free trial</li>
            </ul>
          </div>

          <HeroDashboardPreview highlightToken={demoPulse} />
        </div>
      </section>

      <section className="lp-features" id="features">
        <p className="eyebrow" data-reveal>Features</p>
        <h2 data-reveal>Everything You Need to Run Your Sports Arena</h2>
        <p className="section-lead" data-reveal>From court booking to sales reports — tools that match how arenas actually operate.</p>
        <div className="lp-feature-grid">
          {features.map((feature, index) => (
            <article key={feature.title} data-reveal style={{ transitionDelay: `${index * 70}ms` }}>
              <span className="lp-feature-icon" aria-hidden="true">{feature.icon}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-about" id="about">
        <div className="lp-about-media" data-reveal>
          <img src={sportzArenaBackground} alt="Indoor sports court" />
          <div className="lp-about-overlay">
            <p>Built for Sports Venue Owners</p>
            <button type="button" className="primary" onClick={() => navigate("/signup")}>Get Started Free →</button>
          </div>
        </div>
        <div className="lp-stats" data-reveal>
          {[
            { value: landingStats.venues, label: "Sports Venues" },
            { value: landingStats.customers, label: "Happy Customers" },
            { value: landingStats.bookings, label: "Bookings Managed" },
            { value: landingStats.uptime, label: "Uptime" },
          ].map((stat) => (
            <article key={stat.label}>
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </article>
          ))}
          <p className="lp-script lp-script-inline">Join the SportzArena Family</p>
        </div>
      </section>

      <section className="plans-section" id="plans">
        {arenaMarqueeLoop.length > 0 && (
          <div className="lp-arena-marquee" aria-label="Partner arenas">
            <p className="lp-arena-marquee-label">Chosen by sports arenas across India</p>
            <div className="lp-arena-marquee-viewport">
              <div
                className="lp-arena-marquee-track"
                style={{ animationDuration: `${arenaMarqueeDuration}s` }}
              >
                {arenaMarqueeLoop.map((name, i) => (
                  <span key={`marquee-${name}-${i}`} className="lp-arena-marquee-chip">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className="eyebrow" data-reveal>Pricing</p>
        <h2 data-reveal>₹499 / month after free trial</h2>
        <p className="billing-summary" data-reveal>One arena · Full toolkit</p>
        <div className="plan-grid plan-grid-single">
          {plans.map((plan, index) => (
            <PlanCard key={plan.name} plan={plan} index={index} />
          ))}
        </div>
      </section>

      <footer className="lp-footer" id="contact">
        <div>
          <strong>SportzArena</strong>
          <p>Bill. Manage. Grow. — built for Indian sports arenas.</p>
          <div className="lp-contact">
            <p className="lp-contact-label">Contact us</p>
            <a className="lp-contact-link" href="mailto:sportsarenateam@gmail.com">
              sportsarenateam@gmail.com
            </a>
            <a className="lp-contact-link" href="tel:+917094526264">
              +91 70945 26264
            </a>
          </div>
        </div>
        <div className="lp-footer-actions">
          <button type="button" className="link" onClick={() => navigate("/login")}>Login</button>
          <button type="button" className="primary" onClick={() => navigate("/signup")}>Start free trial</button>
        </div>
      </footer>
    </main>
  );
}

function AuthForm({
  mode,
  onRegistered,
  onSession,
}: {
  mode: "login" | "signup";
  onRegistered?: (arena: Arena, userId: string) => void;
  onSession?: (session: Session) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginMethod, setLoginMethod] = useState<"otp" | "password">(mode === "signup" ? "otp" : "password");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");

  // Free trial is OTP-only. Arena name + password come after OTP verification.
  const showOtp = mode === "signup" || loginMethod === "otp";

  const authRedirectTo = `${window.location.origin}/auth/callback`;

  useEffect(() => {
    // Returning users bounced from free-trial OTP → password login.
    if (mode !== "login") return;
    const preferPassword = sessionStorage.getItem("sportzarena-prefer-password") === "1";
    const savedEmail = sessionStorage.getItem("sportzarena-login-email") || "";
    if (!preferPassword) return;
    setLoginMethod("password");
    if (savedEmail) {
      setPasswordEmail(savedEmail);
      setOtpEmail(savedEmail);
    }
    setMessage("This email is already registered. Sign in with your email and password.");
    sessionStorage.removeItem("sportzarena-prefer-password");
    sessionStorage.removeItem("sportzarena-login-email");
  }, [mode]);

  function goToPasswordLogin(email: string, notice?: string) {
    sessionStorage.setItem("sportzarena-login-email", email);
    sessionStorage.setItem("sportzarena-prefer-password", "1");
    if (mode === "signup") {
      navigate("/login");
      return;
    }
    setPasswordEmail(email);
    setLoginMethod("password");
    setOtpSent(false);
    setMessage(notice || "This email is already registered. Sign in with your password.");
  }

  async function lookupEmailStatus(email: string) {
    const statusResponse = await fetch(`${apiUrl}/auth/email-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const status = await statusResponse.json() as {
      exists?: boolean;
      hasPassword?: boolean;
      hasArena?: boolean;
      error?: string;
    };
    if (!statusResponse.ok) {
      throw new Error(status.error ?? "Unable to check email");
    }
    return status;
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim().toLowerCase();
    const password = String(form.get("password"));
    setBusy(true);
    setMessage("");
    try {
      const status = await lookupEmailStatus(email);
      if (!status.exists) {
        throw new Error("No account found for this email. Use Start Free Trial with Email OTP.");
      }

      const result = await supabase!.auth.signInWithPassword({ email, password });
      if (result.error) {
        const msg = result.error.message;
        if (/confirm|not confirmed/i.test(msg)) {
          throw new Error("Please confirm your email first, or wait a minute and try again.");
        }
        if (/rate limit|too many|429/i.test(msg)) {
          throw new Error("Too many login attempts. Wait about a minute, then try again.");
        }
        if (/invalid login credentials|invalid.*password|email not confirmed/i.test(msg)) {
          if (status.hasPassword === false) {
            throw new Error("Password is not set for this account yet. Use Email OTP (then set a password) or Forgot password.");
          }
          throw new Error("Password is wrong. Try again or use Forgot password.");
        }
        throw new Error(msg);
      }
      if (result.data.session) onSession?.(result.data.session);
      setMessage("Signed in — loading your arena…");
      navigate("/app");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Unable to continue";
      if (/429|rate limit|too many requests|only request this after/i.test(text)) {
        setMessage("Too many attempts. Wait 1 minute, then try again.");
      } else {
        setMessage(text);
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendEmailLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const email = otpEmail.trim().toLowerCase();
      if (!email) throw new Error("Enter your email");

      const status = await lookupEmailStatus(email);
      // Existing account with password → email + password login (not OTP).
      if (status.exists && status.hasPassword) {
        goToPasswordLogin(email);
        return;
      }
      // Signup with existing email but no password yet → stay on OTP to set one.
      // Login with no account → still allow OTP to start trial.
      if (mode === "signup" && status.exists && !status.hasPassword) {
        setMessage("Account found without a password — enter the OTP, then set one.");
      }

      sessionStorage.setItem("sportzarena-otp-email", email);
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: !status.exists,
          emailRedirectTo: authRedirectTo,
        },
      });
      if (error) throw new Error(error.message);
      setOtpSent(true);
      if (!(mode === "signup" && status.exists && !status.hasPassword)) {
        setMessage("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmailCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const email = (otpEmail.trim() || sessionStorage.getItem("sportzarena-otp-email") || "").toLowerCase();
      const token = otpCode.replace(/\D/g, "");
      if (!email) throw new Error("Enter your email again");
      if (token.length < 6) throw new Error("Enter the 6-digit OTP from your email");
      const { data, error } = await supabase!.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) {
        throw new Error(`${error.message}. You can also open the magic link in the same email.`);
      }
      if (data.session) onSession?.(data.session);
      sessionStorage.removeItem("sportzarena-otp-email");
      if (userNeedsPasswordSetup(data.session?.user)) {
        navigate("/onboarding/password");
      } else {
        navigate("/app");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid or expired OTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page auth-split">
      <aside className="auth-hero-panel">
        <div className="auth-hero-overlay" aria-hidden="true" />
        <div className="auth-hero-content">
          <button type="button" className="auth-hero-brand" onClick={() => navigate("/")}>
            <img src={sportzArenaLogo} alt="" />
            <span>
              <strong>Sportz<span className="accent">Arena</span></strong>
              <small>Manage • Book • Grow</small>
            </span>
          </button>
          <h1>
            Your Sports Venue,<br />
            <span className="accent">Our Smart Solution</span>
          </h1>
          <p>
            Easily manage bookings, customers, revenue and expenses — all in one place.
            Built for sports arena owners and venue managers.
          </p>
          <ul className="auth-hero-features">
            <li><span aria-hidden="true">📅</span>Easy Bookings</li>
            <li><span aria-hidden="true">📊</span>Track Revenue</li>
            <li><span aria-hidden="true">👥</span>Manage Customers</li>
            <li><span aria-hidden="true">🛡️</span>Control Expenses</li>
          </ul>
          <p className="auth-hero-script">More Sports More Possibilities</p>
        </div>
      </aside>

      <section className="auth-form-panel">
        <div className="auth-form-top">
          <ThemeToggle />
          {mode === "login" ? (
            <p className="auth-trial-link">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="link accent-link"
                onClick={() => {
                  sessionStorage.removeItem("sportzarena-prefer-password");
                  navigate("/signup");
                }}
              >
                Start Free Trial →
              </button>
            </p>
          ) : (
            <p className="auth-trial-link">
              Already have an account?{" "}
              <button type="button" className="link accent-link" onClick={() => navigate("/login")}>
                Login →
              </button>
            </p>
          )}
        </div>

        <div className="auth-card auth-card-modern auth-card-split">
          <img className="auth-brand" src={sportzArenaLogo} alt="SportzArena" />
          <h1>{mode === "login" ? "Welcome back 👋" : "Start free trial"}</h1>
          <p className="auth-lead">
            {mode === "signup"
              ? (otpSent
                ? `Enter the code sent to ${otpEmail}`
                : "Verify your email with OTP. After that you’ll set a password and create your arena.")
              : (showOtp
                ? (otpSent
                  ? `Enter the code sent to ${otpEmail}`
                  : "Use Email OTP, or switch to Password if you already have an account.")
                : "Log in with your email and password.")}
          </p>

          {mode === "login" ? (
            <div className="auth-method-tabs" role="tablist" aria-label="Login method">
              <button
                type="button"
                className={showOtp ? "active" : undefined}
                onClick={() => { setLoginMethod("otp"); setMessage(""); setOtpSent(false); }}
              >
                Email OTP
              </button>
              <button
                type="button"
                className={!showOtp ? "active" : undefined}
                onClick={() => { setLoginMethod("password"); setMessage(""); setOtpSent(false); }}
              >
                Password
              </button>
            </div>
          ) : null}

          {showOtp ? (
            !otpSent ? (
              <form onSubmit={sendEmailLogin}>
                <label>Email
                  <span className="input-with-icon">
                    <span className="input-icon" aria-hidden="true">✉</span>
                    <input
                      type="email"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      required
                      autoComplete="email"
                      inputMode="email"
                      placeholder=""
                      autoFocus
                    />
                  </span>
                </label>
                <button className="primary auth-login-btn" disabled={busy}>{busy ? "Sending…" : "Send OTP →"}</button>
              </form>
            ) : (
              <div className="auth-email-sent">
                <p className="auth-email-hint">
                  Check your inbox for the code. After OTP you&apos;ll set a password, then continue.
                </p>
                <form onSubmit={verifyEmailCode}>
                  <label>OTP code
                    <input
                      className="otp-input"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="••••••"
                      autoFocus
                    />
                  </label>
                  <button className="primary auth-login-btn" disabled={busy || otpCode.replace(/\D/g, "").length < 6}>
                    {busy ? "Verifying…" : "Verify OTP →"}
                  </button>
                </form>
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={async () => {
                    setOtpCode("");
                    setMessage("");
                    setBusy(true);
                    try {
                      const status = await lookupEmailStatus(otpEmail.trim().toLowerCase());
                      if (status.exists && status.hasPassword) {
                        goToPasswordLogin(otpEmail.trim().toLowerCase());
                        return;
                      }
                      const { error } = await supabase!.auth.signInWithOtp({
                        email: otpEmail.trim().toLowerCase(),
                        options: { shouldCreateUser: !status.exists, emailRedirectTo: authRedirectTo },
                      });
                      if (error) throw new Error(error.message);
                      setMessage("New OTP sent. Use the latest email.");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Unable to resend");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resend OTP
                </button>
                <button type="button" className="link" onClick={() => { setOtpSent(false); setOtpCode(""); setMessage(""); }}>
                  Change email
                </button>
              </div>
            )
          ) : (
            <form onSubmit={submitPassword}>
              <label>Email
                <span className="input-with-icon">
                  <span className="input-icon" aria-hidden="true">✉</span>
                  <input
                    type="email"
                    name="email"
                    required
                    autoComplete="email"
                    value={passwordEmail}
                    onChange={(e) => setPasswordEmail(e.target.value)}
                    placeholder=""
                  />
                </span>
              </label>
              <PasswordInput
                label="Password"
                name="password"
                autoComplete="current-password"
                placeholder=""
              />
              <div className="auth-forgot-row">
                <button className="link accent-link" type="button" onClick={() => navigate("/forgot-password")}>
                  Forgot Password?
                </button>
              </div>
              <button className="primary auth-login-btn" disabled={busy}>
                {busy ? "Please wait…" : "Login →"}
              </button>
            </form>
          )}

          <p className="notice">{message}</p>
          {mode === "login" && /No account found/i.test(message) ? (
            <p className="ops-muted">Use <strong>Start Free Trial</strong> with Email OTP to get started.</p>
          ) : null}

          <p className="auth-footer-trial">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="link accent-link"
                  onClick={() => {
                    sessionStorage.removeItem("sportzarena-prefer-password");
                    navigate("/signup");
                  }}
                >
                  Start Free Trial →
                </button>
              </>
            ) : (
              <>
                Already registered?{" "}
                <button type="button" className="link accent-link" onClick={() => navigate("/login")}>
                  Login →
                </button>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthCallback() {
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!supabase) throw new Error("Supabase is not configured");
        const url = new URL(window.location.href);
        const errorDescription = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (errorDescription) throw new Error(errorDescription);

        const code = url.searchParams.get("code");
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (!data.session) throw new Error("No session returned from login link");
        } else {
          const tokenHash = url.searchParams.get("token_hash");
          const type = url.searchParams.get("type");
          if (tokenHash && type) {
            const { data, error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as "email" | "magiclink" | "recovery" | "invite" | "signup" | "email_change",
            });
            if (error) throw error;
            if (!data.session) throw new Error("Unable to complete email login");
          } else {
            // Implicit / hash-based links (detectSessionInUrl)
            await new Promise((r) => setTimeout(r, 250));
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            if (!data.session) {
              throw new Error("Login link expired or already used. Request a new email from the login page.");
            }
          }
        }

        sessionStorage.removeItem("sportzarena-otp-email");
        if (!cancelled) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (userNeedsPasswordSetup(sessionData.session?.user)) navigate("/onboarding/password");
          else navigate("/onboarding/arena");
        }
      } catch (error) {
        if (cancelled) return;
        setMessage(error instanceof Error ? error.message : "Unable to complete login");
        window.setTimeout(() => navigate("/login"), 2500);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-theme-bar"><ThemeToggle /></div>
      <section className="auth-card">
        <h1>Email login</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function SetPasswordOnboarding({ onDone }: { onDone: (session: Session) => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      assertPasswordStrength(password, confirmPassword);
      const session = await saveAccountPassword(password);
      onDone(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-theme-bar"><ThemeToggle /></div>
      <section className="auth-card auth-card-modern">
        <img className="auth-brand" src={sportzArenaLogo} alt="" />
        <h1>Create your password</h1>
        <p>Email verified. Set a password so you can log in next time without waiting for OTP.</p>
        <p className="ops-muted">{PASSWORD_HINT}</p>
        <form onSubmit={submit}>
          <PasswordInput
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
            placeholder="Strong password"
          />
          <PasswordInput
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="Re-enter password"
          />
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save password & continue"}
          </button>
        </form>
        <p className="notice">{message}</p>
      </section>
    </main>
  );
}

function ForgotPassword() {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const normalized = email.trim().toLowerCase();
      if (!normalized) throw new Error("Enter your email");
      const { error } = await supabase!.auth.resetPasswordForEmail(normalized, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
      setStep("otp");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const token = otp.replace(/\D/g, "");
      if (token.length < 6) throw new Error("Enter the 6-digit OTP");
      const { data, error } = await supabase!.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "recovery",
      });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error("OTP verified, but no session was created. Try again.");
      sessionStorage.setItem("sportzarena-reset-email", email.trim().toLowerCase());
      // Dedicated page so session bootstrap cannot remount and lose the password step.
      navigate("/reset-password");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid or expired OTP");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-theme-bar"><ThemeToggle /></div>
      <section className="auth-card auth-card-modern">
        <button className="back" onClick={() => navigate("/login")}>← Back to login</button>
        <h1>Reset password</h1>
        <p>
          {step === "email" && "Enter your registered email. We’ll send a 6-digit code."}
          {step === "otp" && `Enter the 6-digit code sent to ${email}.`}
        </p>

        {step === "email" && (
          <form onSubmit={sendOtp}>
            <label>Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
            </label>
            <button className="primary" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
          </form>
        )}

        {step === "otp" && (
          <div className="auth-email-sent">
            <form onSubmit={verifyOtp}>
              <label>OTP code
                <input
                  className="otp-input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </label>
              <button className="primary" disabled={busy || otp.replace(/\D/g, "").length < 6}>
                {busy ? "Verifying…" : "Verify OTP"}
              </button>
            </form>
            <button type="button" className="link" disabled={busy} onClick={() => sendOtp()}>Resend OTP</button>
            <button type="button" className="link" onClick={() => { setStep("email"); setOtp(""); setMessage(""); }}>Change email</button>
          </div>
        )}

        <p className="notice">{message}</p>
      </section>
    </main>
  );
}

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setMessage("Session expired. Request a new OTP from Forgot password.");
        setReady(false);
        return;
      }
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="auth-page">
      <div className="auth-theme-bar"><ThemeToggle /></div>
      <section className="auth-card auth-card-modern">
        <button className="back" onClick={() => navigate("/forgot-password")}>← Back</button>
        <h1>Choose a new password</h1>
        <p>
          {ready
            ? "Enter a new password (forgot password does not need your old password — OTP already verified you)."
            : "Verify your reset OTP first, then set a new password."}
        </p>
        {ready ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                assertPasswordStrength(password, confirmPassword);
                await saveAccountPassword(password);
                sessionStorage.removeItem("sportzarena-reset-email");
                await supabase!.auth.signOut();
                setMessage("Password updated. Log in with your new password.");
                window.setTimeout(() => navigate("/login"), 1000);
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to update password");
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="ops-muted">{PASSWORD_HINT}</p>
            <PasswordInput label="New password" value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
            <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            <button className="primary" disabled={busy}>{busy ? "Saving…" : "Update password"}</button>
          </form>
        ) : (
          <button className="primary" type="button" onClick={() => navigate("/forgot-password")}>
            Request reset OTP
          </button>
        )}
        <p className="notice">{message}</p>
      </section>
    </main>
  );
}

function Onboarding({ session, onComplete }: { session: Session; onComplete: (arena: Arena) => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const pendingName = localStorage.getItem("sa_pending_arena_name") ?? "";

  return (
    <main className="auth-page">
      <div className="auth-theme-bar"><ThemeToggle /></div>
      <section className="auth-card wide-card">
        <h1>Name your sports arena</h1>
        <p>Email verified. Tell us your arena name to start the 30-day free trial, then choose sports.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const arenaName = String(form.get("name")).trim();
            const contactPhone = digitsOnlyPhone(phone);
            if (contactPhone && contactPhone.length !== 10) {
              setMessage("Contact phone must be exactly 10 digits");
              return;
            }
            setBusy(true);
            setMessage("");
            try {
              const result = await apiRequest<{
                organization: { id: string; name: string };
                subscription: { trialEndsAt: string | null; status: string };
              }>(session, "/onboarding/arena", {
                method: "POST",
                body: JSON.stringify({
                  arenaName,
                  address: String(form.get("address") ?? ""),
                  contactPhone,
                  timezone: "Asia/Kolkata",
                  currencyCode: "INR",
                }),
              });
              localStorage.removeItem("sa_pending_arena_name");
              onComplete({
                id: result.organization.id,
                name: result.organization.name,
                trial_ends_at: result.subscription.trialEndsAt,
                status: result.subscription.status,
                contactPhone,
              });
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Unable to create arena");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>Sports arena name<input name="name" required minLength={2} defaultValue={pendingName} /></label>
          <label>Address<input name="address" /></label>
          <label>Contact phone
            <input
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(digitsOnlyPhone(e.target.value))}
              maxLength={10}
              pattern="[0-9]{10}"
              title="Enter exactly 10 digits"
            />
          </label>
          <button className="primary" disabled={busy}>{busy ? "Creating arena…" : "Continue to sports"}</button>
        </form>
        <p className="notice">{message}</p>
      </section>
    </main>
  );
}

const sportOptions = [
  { name: "Cricket Turf", image: cricketIcon, tone: "cricket" },
  { name: "Badminton", image: badmintonIcon, tone: "badminton" },
  { name: "Football", image: footballIcon, tone: "football" },
  { name: "Pickleball", image: pickleballIcon, tone: "pickleball" },
  { name: "Table Tennis", image: tableTennisIcon, tone: "table-tennis" },
  { name: "Carrom", image: carromIcon, tone: "carrom" },
  { name: "Skating", image: skatingIcon, tone: "skating" },
  { name: "Volleyball", image: volleyballIcon, tone: "volleyball" },
] as const;

function SportArtwork({ sport }: { sport: (typeof sportOptions)[number] }) {
  return <img className="sport-tile-img" src={sport.image} alt="" />;
}

function SportSelect({
  onComplete,
  initialSelected = [],
  continueLabel = "Continue →",
  backLabel = "Back to home",
  onBack,
  allowEmptyContinue = false,
}: {
  onComplete: (sports: string[]) => void | Promise<void>;
  initialSelected?: string[];
  continueLabel?: string;
  backLabel?: string;
  onBack?: () => void;
  allowEmptyContinue?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const toggleSport = (name: string) => {
    setSelected((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  async function continueNext() {
    if ((!selected.length && !allowEmptyContinue) || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await onComplete(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sport-select-shell">
      <nav>
        <Brand />
        <div className="nav-right-actions">
          <ThemeToggle />
          <button className="link" onClick={() => (onBack ? onBack() : navigate("/"))}>{backLabel}</button>
        </div>
      </nav>
      <section className="sport-select">
        <header className="sport-select-header anim-fade-up">
          <p className="eyebrow">Setup</p>
          <h1>What sports do you run?</h1>
          <p>Pick every sport at your arena. Only these show on the dashboard — you can add more later.</p>
        </header>
        <div className="sport-tile-grid">
          {sportOptions.map((sport, index) => {
            const chosen = selected.includes(sport.name);
            return (
              <button
                key={sport.name}
                type="button"
                className={`sport-tile tone-${sport.tone} ${chosen ? "chosen" : ""}`}
                style={{ animationDelay: `${90 + index * 55}ms` }}
                onClick={() => toggleSport(sport.name)}
                aria-pressed={chosen}
              >
                <span className="sport-tile-check" aria-hidden="true">{chosen ? "✓" : ""}</span>
                <div className="sport-tile-visual">
                  <SportArtwork sport={sport} />
                </div>
                <b>{sport.name}</b>
              </button>
            );
          })}
        </div>
      </section>
      <footer className="sport-select-bar">
        <div>
          <strong>{selected.length ? `${selected.length} selected` : "Select at least one sport"}</strong>
          <span>{message || (selected.length ? selected.join(" · ") : "Football, cricket, badminton and more")}</span>
        </div>
        <button className="primary large" disabled={(!selected.length && !allowEmptyContinue) || busy} onClick={continueNext}>
          {busy ? "Saving…" : continueLabel}
        </button>
      </footer>
    </main>
  );
}
