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
import { WorkspaceApp } from "./workspace/WorkspaceApp";
import type { AppRole, WorkspacePage } from "./workspace/types";
import { ThemeToggle } from "./components/ThemeToggle";

type Arena = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  status: string;
  address?: string;
  pincode?: string;
  contactPhone?: string;
};
const navigate = (path: string) => { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); };
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** OTP-created users must set a password once before password login works. */
function userNeedsPasswordSetup(user: User | null | undefined) {
  return Boolean(user) && user!.user_metadata?.password_set !== true;
}

async function saveAccountPassword(password: string) {
  const { error } = await supabase!.auth.updateUser({
    password,
    data: { password_set: true },
  });
  // If they re-enter the same password, still mark setup complete and continue.
  if (error && !/same.?password|different from the old/i.test(error.message)) {
    throw new Error(error.message);
  }
  if (error) {
    const { error: metaError } = await supabase!.auth.updateUser({ data: { password_set: true } });
    if (metaError) throw new Error(metaError.message);
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
          {show ? "Hide" : "Show"}
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
        arena_subscriptions?: { trial_ends_at: string | null; status: string } | Array<{
          trial_ends_at: string | null;
          status: string;
        }>;
      } | Array<{
        id: string;
        name: string;
        address?: string | null;
        pincode?: string | null;
        contact_phone?: string | null;
        arena_subscriptions?: { trial_ends_at: string | null; status: string } | Array<{
          trial_ends_at: string | null;
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
    navigate("/login");
    return <main className="auth-page"><p>Taking you to login…</p></main>;
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
      <p className="billing-note">Billed monthly · Cancel anytime</p>
      <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
      <button type="button" className="primary" onClick={() => navigate("/login")}>
        Start 30-day free trial
      </button>
    </article>
  );
}

function Landing() {
  useRevealOnScroll();
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
  const activityIcons = [
    { name: "Cricket Turf", image: cricketIcon },
    { name: "Badminton", image: badmintonIcon },
    { name: "Football", image: footballIcon },
    { name: "Pickleball", image: pickleballIcon },
    { name: "Table Tennis", image: tableTennisIcon },
    { name: "Skating", image: skatingIcon },
  ];

  return (
    <main className="landing">
      <nav>
        <Brand />
        <div className="landing-nav-actions">
          <ThemeToggle />
          <button className="link" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}>Pricing</button>
          <button className="link" onClick={() => navigate("/login")}>Log in</button>
          <button className="primary" onClick={() => navigate("/login")}>Start free</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-media" aria-hidden="true">
          <img src={sportzArenaBackground} alt="" />
        </div>
        <div className="hero-copy">
          <p className="brand-wordmark anim-fade-up" style={{ animationDelay: "60ms" }}>SportzArena</p>
          <h1 className="anim-fade-up" style={{ animationDelay: "160ms" }}>Bill. Manage. Grow.</h1>
          <p className="hero-lead anim-fade-up" style={{ animationDelay: "260ms" }}>
            Court bookings, invoices, coaching and sales — one workspace built for Indian sports arenas.
          </p>
          <div className="hero-actions anim-fade-up" style={{ animationDelay: "360ms" }}>
            <button className="primary large cta-pulse" onClick={() => navigate("/login")}>
              Start 30-day free trial <span className="cta-arrow">→</span>
            </button>
            <button className="hero-link" onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}>
              See pricing
            </button>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <p className="eyebrow" data-reveal>Sports you already run</p>
        <h2 data-reveal>Turf, courts, and classes in one place</h2>
        <p className="section-lead" data-reveal>Switch sports without switching tools — rates, courts, and bills stay together.</p>
        <div className="landing-sports">
          {activityIcons.map((sport, index) => (
            <article key={sport.name} data-reveal style={{ transitionDelay: `${index * 70}ms` }}>
              <img src={sport.image} alt="" />
              <b>{sport.name}</b>
            </article>
          ))}
          <article className="more-sports" data-reveal style={{ transitionDelay: `${activityIcons.length * 70}ms` }}>
            <strong>+</strong>
            <b>Carrom, skating & more</b>
          </article>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <p className="eyebrow" data-reveal>How it works</p>
        <h2 data-reveal>Live in minutes. Pay after your trial.</h2>
        <p className="section-lead" data-reveal>No card required to start. Keep working for 30 days, then continue with a simple monthly plan.</p>
        <div className="feature-grid">
          {[
            { title: "1. Verify email", text: "OTP login, set your password, name your arena." },
            { title: "2. Run daily ops", text: "Book courts, sell equipment, coach, and invoice from one dashboard." },
            { title: "3. Subscribe when ready", text: "After the trial, pay securely to keep staff and billing online." },
          ].map((step, index) => (
            <article key={step.title} data-reveal style={{ transitionDelay: `${index * 100}ms` }}>
              <h2>{step.title}</h2>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="plans-section" id="plans">
        <p className="eyebrow" data-reveal>Pricing</p>
        <h2 data-reveal>₹499 / month after free trial</h2>
        <p className="billing-summary" data-reveal>One arena · Full toolkit · Cancel anytime</p>
        <div className="plan-grid plan-grid-single">
          {plans.map((plan, index) => (
            <PlanCard key={plan.name} plan={plan} index={index} />
          ))}
        </div>
      </section>
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
  const [loginMethod, setLoginMethod] = useState<"otp" | "password">(mode === "login" ? "password" : "otp");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");

  const authRedirectTo = `${window.location.origin}/auth/callback`;

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
    const arenaName = String(form.get("arenaName") ?? "").trim();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const status = await lookupEmailStatus(email);
        if (!status.exists) {
          throw new Error("No account found for this email. Use Email OTP to get started.");
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
        return;
      }

      const status = await lookupEmailStatus(email);
      if (status.exists) {
        throw new Error("This email is already registered. Please log in instead.");
      }

      const registerResponse = await fetch(`${apiUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arenaName, email, password }),
      });
      const registerBody = await registerResponse.json() as {
        error?: string;
        organization?: { id: string; name: string };
        subscription?: { trialEndsAt: string | null; status: string };
      };
      if (!registerResponse.ok) {
        if (registerResponse.status === 409) {
          throw new Error(registerBody.error ?? "This email is already registered. Please log in instead.");
        }
        throw new Error(registerBody.error ?? "Unable to create account");
      }

      const login = await supabase!.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session) {
        throw new Error(login.error?.message ?? "Account created. Please log in.");
      }
      onSession?.(login.data.session);
      if (registerBody.organization && onRegistered) {
        onRegistered({
          id: registerBody.organization.id,
          name: registerBody.organization.name,
          trial_ends_at: registerBody.subscription?.trialEndsAt ?? null,
          status: registerBody.subscription?.status ?? "trialing",
        }, login.data.session.user.id);
      } else {
        navigate("/onboarding/sports");
      }
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
      // Returning users with a password must use Password login — do not spam OTP.
      if (mode === "login" && status.exists && status.hasPassword) {
        setPasswordEmail(email);
        setLoginMethod("password");
        setOtpSent(false);
        setMessage("This email is already registered. Sign in with your password.");
        return;
      }
      if (mode === "signup" && status.exists) {
        setPasswordEmail(email);
        setLoginMethod("password");
        setMessage("This email is already registered. Please log in with your password.");
        return;
      }

      sessionStorage.setItem("sportzarena-otp-email", email);
      const { error } = await supabase!.auth.signInWithOtp({
        email,
        options: {
          // Only create Auth users for brand-new emails.
          shouldCreateUser: !status.exists,
          emailRedirectTo: authRedirectTo,
        },
      });
      if (error) throw new Error(error.message);
      setOtpSent(true);
      setMessage(status.exists && !status.hasPassword
        ? "Account found without a password — enter the OTP, then set one."
        : "");
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
    <main className="auth-page">
      <div className="auth-theme-bar">
        <ThemeToggle />
      </div>
      <section className="auth-card auth-card-modern">
        <button className="back" onClick={() => navigate("/")}>← SportzArena</button>
        <img className="auth-brand" src={sportzArenaLogo} alt="" />
        <h1>{mode === "login" ? "Welcome back" : "Start free"}</h1>
        <p>
          {mode === "login"
            ? (loginMethod === "otp"
              ? (otpSent ? `Enter the code sent to ${otpEmail}` : "New here? Enter your email for a one-time code. Returning users should use Password.")
              : "Sign in with the password you created after OTP.")
            : (loginMethod === "otp"
              ? (otpSent ? `Enter the code sent to ${otpEmail}` : "Verify your email with OTP, then set a password.")
              : "Create with email and password, then choose sports.")}
        </p>

        {mode === "login" || mode === "signup" ? (
          <div className="auth-method-tabs" role="tablist" aria-label="Login method">
            <button type="button" className={loginMethod === "otp" ? "active" : ""} onClick={() => { setLoginMethod("otp"); setMessage(""); }}>Email OTP</button>
            <button type="button" className={loginMethod === "password" ? "active" : ""} onClick={() => { setLoginMethod("password"); setMessage(""); }}>
              {mode === "signup" ? "Email & password" : "Password"}
            </button>
          </div>
        ) : null}

        {(mode === "login" || mode === "signup") && loginMethod === "otp" ? (
          !otpSent ? (
            <form onSubmit={sendEmailLogin}>
              <label>Email
                <input
                  type="email"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@yourarena.com"
                  autoFocus
                />
              </label>
              <button className="primary" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button>
            </form>
          ) : (
            <div className="auth-email-sent">
              <p className="auth-email-hint">
                Check your inbox for the code. After OTP you’ll set a password, then continue.
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
                <button className="primary" disabled={busy || otpCode.replace(/\D/g, "").length < 6}>
                  {busy ? "Verifying…" : "Verify OTP"}
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
                      setPasswordEmail(otpEmail.trim().toLowerCase());
                      setLoginMethod("password");
                      setOtpSent(false);
                      setMessage("This email is already registered. Sign in with your password.");
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
            {mode === "signup" && (
              <label>
                Sports arena name
                <input name="arenaName" required minLength={2} maxLength={120} placeholder="e.g. GreenField Sports Arena" />
              </label>
            )}
            <label>Email
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                value={passwordEmail}
                onChange={(e) => setPasswordEmail(e.target.value)}
              />
            </label>
            <PasswordInput
              label="Password"
              name="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
            <button className="primary" disabled={busy}>
              {busy ? "Please wait…" : "Log in with password"}
            </button>
          </form>
        )}

        <p className="notice">{message}</p>
        {mode === "login" && /No account found/i.test(message) ? (
          <p className="ops-muted">Use <strong>Email OTP</strong> above to verify your email and start.</p>
        ) : null}
        {mode === "login" ? (
          <button className="link" type="button" onClick={() => { setLoginMethod("otp"); setMessage(""); setOtpSent(false); }}>
            New arena? Start with Email OTP
          </button>
        ) : null}
        {loginMethod === "password" && mode === "login" && (
          <button className="link" onClick={() => navigate("/forgot-password")}>Forgot password?</button>
        )}
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
      if (password.length < 8) throw new Error("Password must be at least 8 characters");
      if (password.length > 72) throw new Error("Password must be 72 characters or fewer");
      if (password !== confirmPassword) throw new Error("Password and confirm password must match");
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
        <form onSubmit={submit}>
          <PasswordInput
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
            placeholder="At least 8 characters"
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
            ? "Enter a new password and confirm it."
            : "Verify your reset OTP first, then set a new password."}
        </p>
        {ready ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                if (password.length < 8) throw new Error("Password must be at least 8 characters");
                if (password !== confirmPassword) throw new Error("Password and confirm password must match");
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
