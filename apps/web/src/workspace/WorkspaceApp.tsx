import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import sportzArenaLogo from "../assets/sportzarena-logo.png";
import type { AppRole, CartItem, InventoryItem, SportConfig, WorkspacePage } from "./types";
import {
  bookingAmount as calcBookingAmount,
  cartItemsTotal,
  grandTotal as calcGrandTotal,
  isValidMobile,
  mobileDigits,
  parseAmount,
  sanitizeAmountInput,
  sanitizeMobileInput,
  upsertCartItem,
} from "./opsHelpers";

type Arena = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  status: string;
  address?: string;
  pincode?: string;
  contactPhone?: string;
};

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function opsRequest<T>(session: Session, organizationId: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "x-organization-id": organizationId,
      ...init.headers,
    },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) return resolve();
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load Razorpay"));
    document.body.appendChild(script);
  });
}

function resolveSportArt(name: string, art: Record<string, string>) {
  if (art[name]) return art[name];
  const key = Object.keys(art).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? art[key] : "";
}

const modules = [
  { id: "sales" as const, label: "Sales Report", tone: "purple", icon: "bag" },
  { id: "coaching" as const, label: "Coaching", tone: "teal", icon: "people" },
  { id: "billing" as const, label: "Membership", tone: "rose", icon: "doc" },
  { id: "invoice" as const, label: "Generate Invoice", tone: "indigo", icon: "doc" },
  { id: "menu" as const, label: "Manage Menu", tone: "indigo", icon: "grid" },
  { id: "profile" as const, label: "Profile", tone: "amber", icon: "people" },
  { id: "booking" as const, label: "Beverages & Equipment Only", tone: "amber", icon: "cup", bevOnly: true },
];

function Icon({ name }: { name: string }) {
  const path =
    name === "bag" ? "M7 7V6a5 5 0 0 1 10 0v1h2.2c.9 0 1.6.8 1.5 1.7l-.9 10A2 2 0 0 1 17.8 21H6.2a2 2 0 0 1-2-1.8l-.9-10A1.5 1.5 0 0 1 4.8 7H7Zm2 0h6V6a3 3 0 0 0-6 0v1Z"
    : name === "people" ? "M8.5 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm7 1a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM3 19.2C3 16.5 5.6 15 8.5 15s5.5 1.5 5.5 4.2V20H3v-.8Z"
    : name === "doc" ? "M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V8h4.5L14 3.5Z"
    : name === "grid" ? "M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
    : "M6 19a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.5A4.5 4.5 0 1 1 17 19H6Z";
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={path} /></svg>;
}

function isEntitled(arena: Arena) {
  const now = Date.now();
  const status = arena.status === "created" ? "trialing" : arena.status;
  if (status === "active" || status === "authenticated") return true;
  if (status === "trialing" && arena.trial_ends_at && new Date(arena.trial_ends_at).getTime() > now) return true;
  return false;
}

export function WorkspaceApp({
  session,
  arena,
  role = "owner",
  sportNames,
  sportArt,
  initialPage = "home",
  initialBevOnly = false,
  onPageChange,
  onAddSports,
  onLogout,
  onSubscriptionUpdated,
}: {
  session: Session;
  arena: Arena;
  role?: AppRole;
  sportNames: string[];
  sportArt: Record<string, string>;
  initialPage?: WorkspacePage;
  initialBevOnly?: boolean;
  onPageChange?: (page: WorkspacePage, bevOnly?: boolean) => void;
  onAddSports: () => void;
  onLogout: () => void;
  onSubscriptionUpdated?: (next: Partial<Arena>) => void;
}) {
  const isOwner = role === "owner";
  const visibleModules = modules.filter((module) => isOwner || module.id !== "sales");
  const [page, setPageState] = useState<WorkspacePage>(initialPage);
  const [sports, setSports] = useState<SportConfig[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [selectedSport, setSelectedSport] = useState<SportConfig | null>(null);
  const [bevOnly, setBevOnly] = useState(initialBevOnly);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const sportKey = useMemo(() => sportNames.join("|"), [sportNames]);
  const entitled = isEntitled(arena);
  const trialActive = entitled && (arena.status === "trialing" || arena.status === "created");
  const showPaywall = !entitled || showUpgrade;
  const canUseApp = entitled && !showUpgrade;
  const days = arena.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(arena.trial_ends_at).getTime() - Date.now()) / 86_400_000))
    : 0;

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [message]);

  function setPage(next: WorkspacePage, onlyBev = false) {
    if (!isOwner && next === "sales") {
      setPageState("home");
      onPageChange?.("home", false);
      return;
    }
    setPageState(next);
    setBevOnly(onlyBev);
    onPageChange?.(next, onlyBev);
  }

  useEffect(() => {
    setPageState(initialPage);
    setBevOnly(initialBevOnly);
  }, [initialPage, initialBevOnly]);

  async function refresh() {
    const data = await opsRequest<{ sports: SportConfig[]; inventory: InventoryItem[] }>(session, arena.id, "/ops/bootstrap");
    setSports(data.sports.filter((sport) => sportNames.includes(sport.name)));
    setInventory(data.inventory);
  }

  useEffect(() => {
    if (!canUseApp) return;
    let cancelled = false;
    refresh()
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load arena data");
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, arena.id, sportKey, canUseApp]);

  function openBooking(sport: SportConfig | null, onlyBev: boolean) {
    setSelectedSport(sport);
    setPage("booking", onlyBev);
  }

  function sportImage(name: string) {
    return resolveSportArt(name, sportArt);
  }

  return (
    <main className="app-shell workspace-shell">
      <nav>
        <div className="workspace-nav-left">
          <img className="brand-logo" src={sportzArenaLogo} alt="SportzArena" />
          <div className="workspace-arena-meta">
            <strong>{arena.name}</strong>
            <span>
              {arena.status === "trialing"
                ? (days > 0 ? `${days} days trial left` : "Trial ended")
                : ["active", "authenticated"].includes(arena.status)
                  ? "Subscription active"
                  : "Subscription required"}
            </span>
          </div>
        </div>
        <div className="workspace-nav-actions">
          {page !== "home" && canUseApp && <button className="link" onClick={() => setPage("home")}>← Dashboard</button>}
          {trialActive && !showUpgrade && (
            <button className="link" type="button" onClick={() => setShowUpgrade(true)}>Upgrade</button>
          )}
          <button className="link" onClick={onAddSports}>Add sports</button>
          <button className="link" onClick={onLogout}>Log out</button>
        </div>
      </nav>

      <section className="workspace">
        {message && <p className="workspace-notice">{message}</p>}

        {showPaywall && (
          isOwner ? (
            <SubscriptionGate
              session={session}
              arena={arena}
              upgradingDuringTrial={showUpgrade && isEntitled(arena)}
              onActivated={(next) => {
                setShowUpgrade(false);
                onSubscriptionUpdated?.(next);
                setMessage("Subscription activated. Welcome aboard!");
              }}
              onDismiss={showUpgrade && isEntitled(arena) ? () => setShowUpgrade(false) : undefined}
            />
          ) : (
            <div className="ops-panel subscription-gate">
              <div className="ops-card subscribe-card">
                <h2>Arena access paused</h2>
                <p>Ask the arena owner to renew the SportzArena subscription. Staff cannot make payments.</p>
              </div>
            </div>
          )
        )}

        {canUseApp && page === "home" && (
          <>
            <header className="workspace-welcome">
              <div className="workspace-welcome-top">
                <div>
                  <p className="workspace-kicker">Dashboard</p>
                  <h1>{arena.name}</h1>
                  <p>
                    {isOwner
                      ? "Book courts, bill walk-ins, and manage coaching and sales."
                      : "Book courts, bill walk-ins, and keep coaching running."}
                  </p>
                </div>
              </div>
              <div className="workspace-status-row">
                <div className="workspace-status-chip">
                  <span>Status</span>
                  <strong>
                    {arena.status === "trialing" || arena.status === "created"
                      ? (days > 0 ? `${days}d trial` : "Trial end")
                      : ["active", "authenticated"].includes(arena.status)
                        ? "Active"
                        : "Paywall"}
                  </strong>
                </div>
                <div className="workspace-status-chip">
                  <span>Sports</span>
                  <strong>{sports.length}</strong>
                </div>
                <div className="workspace-status-chip">
                  <span>Plan</span>
                  <strong>₹499/mo</strong>
                </div>
              </div>
            </header>

            {trialActive && isOwner && (
              <div className="trial-banner">
                <div>
                  <strong>{days > 0 ? `${days} days left on your free trial` : "Your free trial ends today"}</strong>
                  <p>Subscribe anytime to keep bookings and billing uninterrupted.</p>
                </div>
                <button type="button" className="primary" onClick={() => setShowUpgrade(true)}>
                  Choose a plan
                </button>
              </div>
            )}

            <p className="workspace-section-label">Quick actions</p>
            <div className="workspace-modules">
              {visibleModules.map((module) => (
                <button
                  key={module.id}
                  type="button"
                  className={`workspace-module tone-${module.tone}`}
                  onClick={() => {
                    if (module.bevOnly) openBooking(null, true);
                    else setPage(module.id);
                  }}
                >
                  <span className="workspace-module-icon"><Icon name={module.icon} /></span>
                  <span>{module.label}</span>
                </button>
              ))}
            </div>
            <div className="workspace-sports-head">
              <h2>Select Sport to Book</h2>
              {isOwner && <button type="button" className="link" onClick={onAddSports}>Manage sports</button>}
            </div>
            <div className="workspace-sport-grid">
              {sports.map((sport) => {
                const art = sportImage(sport.name);
                return (
                  <button key={sport.id} type="button" className="workspace-sport-card" onClick={() => openBooking(sport, false)}>
                    <div className="workspace-sport-art">
                      {art
                        ? <img className="sport-tile-img" src={art} alt="" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.classList.remove("is-hidden"); }} />
                        : null}
                      <span className={`workspace-sport-fallback${art ? " is-hidden" : ""}`}>{sport.name[0]}</span>
                    </div>
                    <div className="workspace-sport-meta">
                      <div className="workspace-sport-title">
                        <b>{sport.name}</b>
                        <span>Active</span>
                      </div>
                      <div className="workspace-sport-footer">
                        <small>{sport.courts.length} court{sport.courts.length === 1 ? "" : "s"}</small>
                        <strong>{sport.pricePerHour > 0 ? `₹${sport.pricePerHour}/hr` : "Rate not set"}</strong>
                      </div>
                    </div>
                  </button>
                );
              })}
              {!sports.length && <p className="workspace-empty">No sports selected yet. Use Add sports to continue.</p>}
            </div>
          </>
        )}

        {canUseApp && page === "booking" && (
          <BookingPanel
            session={session}
            arenaId={arena.id}
            sport={selectedSport}
            bevOnly={bevOnly}
            inventory={inventory}
            onDone={async () => { await refresh(); setPage("home"); setMessage("Bill saved successfully."); }}
            onBack={() => setPage("home")}
          />
        )}
        {canUseApp && page === "sales" && isOwner && <SalesPanel session={session} arenaId={arena.id} onBack={() => setPage("home")} />}
        {canUseApp && page === "coaching" && <CoachingPanel session={session} arenaId={arena.id} onBack={() => setPage("home")} />}
        {canUseApp && page === "billing" && <BillingPanel session={session} arenaId={arena.id} sports={sports} onBack={() => setPage("home")} />}
        {canUseApp && page === "invoice" && (
          <InvoicePanel
            session={session}
            arena={arena}
            onBack={() => setPage("home")}
          />
        )}
        {canUseApp && page === "profile" && (
          <ProfilePanel
            session={session}
            arena={arena}
            role={role}
            onBack={() => setPage("home")}
            onSaved={(next) => onSubscriptionUpdated?.(next)}
          />
        )}
        {canUseApp && page === "menu" && (
          <MenuPanel
            session={session}
            arenaId={arena.id}
            sports={sports}
            inventory={inventory}
            onChanged={refresh}
            onBack={() => setPage("home")}
          />
        )}
      </section>
    </main>
  );
}

function SubscriptionGate({
  session, arena, onActivated, onDismiss, upgradingDuringTrial,
}: {
  session: Session;
  arena: Arena;
  onActivated: (next: Partial<Arena>) => void;
  onDismiss?: () => void;
  upgradingDuringTrial?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payMode, setPayMode] = useState<"test" | "live" | null>(null);
  const planId = "basic" as const;

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      await loadRazorpay();
      const checkout = await opsRequest<{
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
        planName: string;
        mode?: "test" | "live";
      }>(session, arena.id, "/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      if (checkout.mode) setPayMode(checkout.mode);
      const RazorpayCheckout = (window as any).Razorpay;
      const rzp = new RazorpayCheckout({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        order_id: checkout.orderId,
        name: "SportzArena",
        description: `${checkout.planName} · monthly subscription`,
        prefill: {
          name: arena.name,
          email: session.user.email ?? undefined,
        },
        theme: { color: "#082b55" },
        // Production: show all common Indian methods Razorpay has enabled on the account.
        method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true,
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          const verified = await opsRequest<{ status: string; periodEndsAt?: string }>(session, arena.id, "/subscriptions/verify", {
            method: "POST",
            body: JSON.stringify({
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature,
            }),
          });
          onActivated({
            status: verified.status ?? "active",
          });
          setBusy(false);
        },
        modal: {
          ondismiss: () => setBusy(false),
        },
      });
      rzp.on("payment.failed", (response: { error?: { description?: string } }) => {
        setError(response?.error?.description ?? "Payment failed. Try UPI, card, or netbanking.");
        setBusy(false);
      });
      rzp.open();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start payment");
      setBusy(false);
    }
  }

  return (
    <div className="ops-panel subscription-gate">
      <div className="ops-card subscribe-card">
        <p className="subscribe-kicker">{upgradingDuringTrial ? "Upgrade anytime" : "Trial ended"}</p>
        <h2>{upgradingDuringTrial ? "Unlock SportzArena for your arena" : "Subscribe to keep your arena open"}</h2>
        <p>
          {upgradingDuringTrial
            ? `${arena.name} stays fully online after payment — bookings, invoices, coaching and sales in one place.`
            : `Your free trial for ${arena.name} has ended. Pay ₹499/month to restore access for your staff and customers.`}
        </p>
        <div className="subscribe-plans">
          <div className="subscribe-plan active">
            <strong>Starter</strong>
            <span className="subscribe-price">₹499<span>/mo</span></span>
            <small>One arena · daily operations · invoices · coaching · sales</small>
          </div>
        </div>
        <ul className="subscribe-perks">
          <li>Court & walk-in billing</li>
          <li>Coaching + membership records</li>
          <li>Invoices & sales reports</li>
          <li>Pay with UPI, card, or netbanking</li>
        </ul>
        {error && <p className="workspace-notice">{error}</p>}
        <button className="primary large" type="button" disabled={busy} onClick={startCheckout}>
          {busy ? "Opening secure checkout…" : "Pay ₹499 securely"}
        </button>
        <p className="ops-muted">
          Secured by Razorpay
          {payMode === "test" ? " · Test mode (no real charge)" : payMode === "live" ? " · Live payments" : ""}
          . After payment your arena unlocks immediately.
        </p>
        {onDismiss && (
          <button className="link" type="button" onClick={onDismiss}>Not now — keep using trial →</button>
        )}
      </div>
    </div>
  );
}

function BookingPanel({
  session, arenaId, sport, bevOnly, inventory, onDone, onBack,
}: {
  session: Session; arenaId: string; sport: SportConfig | null; bevOnly: boolean; inventory: InventoryItem[];
  onDone: () => Promise<void>; onBack: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [method, setMethod] = useState("WALK_IN");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [selectedCourts, setSelectedCourts] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "ONLINE" | "SPLIT">("CASH");
  const [splitCash, setSplitCash] = useState("");
  const [splitOnline, setSplitOnline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [itemBills, setItemBills] = useState<any[]>([]);
  const [itemMonth, setItemMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [itemQuery, setItemQuery] = useState("");

  async function loadItemBills() {
    if (!bevOnly) return;
    const data = await opsRequest<{ transactions: any[] }>(session, arenaId, "/ops/transactions");
    setItemBills((data.transactions ?? []).filter((row) => !String(row.sport_name ?? "").trim()));
  }

  useEffect(() => {
    loadItemBills().catch(() => undefined);
  }, [session.access_token, arenaId, bevOnly]);

  const hours = useMemo(() => {
    if (bevOnly) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff <= 0) diff += 24 * 60;
    return Math.max(0.5, diff / 60);
  }, [startTime, endTime, bevOnly]);

  const courtCount = selectedCourts.length;
  const bookingAmt = bevOnly || !sport ? 0 : calcBookingAmount(sport.pricePerHour, hours, courtCount);
  const itemsTotal = cartItemsTotal(cart);
  const discountNum = Number(discount || 0);
  const advanceNum = Number(advance || 0);
  const grand = calcGrandTotal(bookingAmt, itemsTotal, discountNum, advanceNum);

  function toggleCourt(id: string) {
    setSelectedCourts((current) => current.includes(id) ? current.filter((c) => c !== id) : [...current, id]);
  }

  function qtyFor(itemId: string) {
    return cart.find((row) => row.itemId === itemId)?.quantity ?? 0;
  }

  function setItemQty(item: InventoryItem, nextQty: number) {
    setCart((current) => {
      const existing = current.find((row) => row.itemId === item.id);
      if (!existing) {
        if (nextQty <= 0) return current;
        return upsertCartItem(current, item, nextQty);
      }
      if (nextQty <= 0) return current.filter((row) => row.itemId !== item.id);
      return current.map((row) => row.itemId === item.id ? { ...row, quantity: nextQty } : row);
    });
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (!bevOnly) {
        if (!isValidMobile(customerMobile, true)) throw new Error("Enter a valid 10-digit mobile number");
        if (!sport || !selectedCourts.length) throw new Error("Select at least one court");
      }
      if (bevOnly && !cart.length) throw new Error("Add at least one beverage or equipment item");
      const splitCashNum = Number(splitCash || 0);
      const splitOnlineNum = Number(splitOnline || 0);
      if (paymentMode === "SPLIT" && Math.abs(splitCashNum + splitOnlineNum - grand) > 0.5) {
        throw new Error("Split cash + online must match grand total");
      }
      const courtNames = sport?.courts.filter((court) => selectedCourts.includes(court.id)).map((court) => court.name) ?? [];
      await opsRequest(session, arenaId, "/ops/transactions", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerMobile: bevOnly ? "" : mobileDigits(customerMobile),
          sportId: sport?.id ?? null,
          sportName: sport?.name,
          courtNames,
          courtIds: selectedCourts,
          bookingDate: date,
          startTime,
          endTime,
          durationHours: hours,
          bookingAmount: bookingAmt,
          items: cart,
          discount: discountNum,
          advance: advanceNum,
          paymentMode,
          splitCash: splitCashNum,
          splitOnline: splitOnlineNum,
          bookingMethod: method,
        }),
      });
      if (bevOnly) await loadItemBills();
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  const filteredItemBills = itemBills.filter((row) => {
    const inMonth = !itemMonth || String(row.created_at ?? "").slice(0, 7) === itemMonth;
    const q = itemQuery.trim().toLowerCase();
    const match = !q
      || row.customer_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q);
    return inMonth && match;
  });
  const itemSalesTotal = filteredItemBills.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const itemSalesDiscount = filteredItemBills.reduce((sum, row) => sum + Number(row.discount || 0), 0);

  function exportItemCsv() {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = ["Bill", "Created", "Customer", "Discount", "Advance", "GrandTotal", "Payment"];
    const dataRows = filteredItemBills.map((row) => [
      row.bill_number, row.created_at, row.customer_name, row.discount ?? 0, row.advance ?? 0, row.grand_total, row.payment_mode,
    ]);
    const csv = [headers, ...dataRows].map((line) => line.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `beverages-equipment-${itemMonth || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ops-panel">
    <form onSubmit={checkout}>
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>{bevOnly ? "Beverages & Equipment" : `Book ${sport?.name ?? "Sport"}`}</h2>
        </div>
        <strong>Total ₹{grand.toFixed(0)}</strong>
      </header>

      {!bevOnly && (
        <section className="ops-card">
          <h3>1. Booking details</h3>
          <div className="ops-grid-3">
            <label>Customer<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
            <label>Mobile
              <input
                value={customerMobile}
                inputMode="numeric"
                maxLength={10}
                onChange={(e) => setCustomerMobile(sanitizeMobileInput(e.target.value))}
                required
              />
            </label>
            <label>Method
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="WALK_IN">Walk-in</option>
                <option value="PLAYO">Playo</option>
                <option value="TURF_TOWN">TurfTown</option>
                <option value="OFFLINE">Offline</option>
              </select>
            </label>
            <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label>Start<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
            <label>End<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          </div>
          <div className="ops-chip-row">
            {(sport?.courts ?? []).map((court) => (
              <button type="button" key={court.id} className={selectedCourts.includes(court.id) ? "chip active" : "chip"} onClick={() => toggleCourt(court.id)}>
                {court.name}
              </button>
            ))}
          </div>
          <p className="ops-muted">
            {courtCount === 0
              ? "Select one or more courts to calculate booking amount"
              : `${hours} hr × ₹${sport?.pricePerHour ?? 0} × ${courtCount} court(s) = ₹${bookingAmt.toFixed(0)}`}
          </p>
        </section>
      )}

      {bevOnly && (
        <section className="ops-card">
          <h3>Customer</h3>
          <div className="ops-grid-3">
            <label>Name<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
          </div>
        </section>
      )}

      <section className="ops-card">
        <h3>{bevOnly ? "1" : "2"}. Equipment & beverages</h3>
        <div className="ops-item-grid">
          {inventory.map((item) => {
            const qty = qtyFor(item.id);
            return (
              <div key={item.id} className={`ops-item ops-item-qty${qty ? " in-cart" : ""}`}>
                <b>{item.name}</b>
                <span>₹{Number(item.price)} · stock {item.stock}</span>
                <div className="ops-qty">
                  <button type="button" aria-label={`Decrease ${item.name}`} onClick={() => setItemQty(item, qty - 1)}>−</button>
                  <b>{qty}</b>
                  <button type="button" aria-label={`Increase ${item.name}`} onClick={() => setItemQty(item, qty + 1)}>+</button>
                </div>
              </div>
            );
          })}
        </div>
        {!!cart.length && (
          <ul className="ops-cart">
            {cart.map((item) => (
              <li key={`${item.itemId}-${item.name}`}>
                <span>{item.name} × {item.quantity}</span>
                <strong>₹{(Number(item.price) * Number(item.quantity)).toFixed(0)}</strong>
              </li>
            ))}
          </ul>
        )}
        <p className="ops-muted">Items subtotal: ₹{itemsTotal.toFixed(0)}</p>
      </section>

      <section className="ops-card">
        <h3>{bevOnly ? "2" : "3"}. Payment</h3>
        <div className="ops-grid-3">
          <label>Discount<input type="text" inputMode="decimal" value={discount} placeholder="Optional" onChange={(e) => setDiscount(sanitizeAmountInput(e.target.value))} /></label>
          <label>Advance<input type="text" inputMode="decimal" value={advance} placeholder="Optional" onChange={(e) => setAdvance(sanitizeAmountInput(e.target.value))} /></label>
          <label>Mode
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as "CASH" | "ONLINE" | "SPLIT")}>
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online</option>
              <option value="SPLIT">Split</option>
            </select>
          </label>
          {paymentMode === "SPLIT" && (
            <>
              <label>Cash part<input type="text" inputMode="decimal" value={splitCash} onChange={(e) => setSplitCash(sanitizeAmountInput(e.target.value))} /></label>
              <label>Online part<input type="text" inputMode="decimal" value={splitOnline} onChange={(e) => setSplitOnline(sanitizeAmountInput(e.target.value))} /></label>
            </>
          )}
        </div>
        <p className="ops-muted">Subtotal ₹{(bookingAmt + itemsTotal).toFixed(0)} − discount/advance = ₹{grand.toFixed(0)}</p>
        {error && <p className="workspace-notice">{error}</p>}
        <button className="primary large" disabled={busy}>{busy ? "Saving…" : `Save bill ₹${grand.toFixed(0)}`}</button>
      </section>
    </form>

    {bevOnly && (
      <section className="ops-card" style={{ marginTop: 16 }}>
        <header className="ops-panel-head" style={{ padding: 0, marginBottom: 12 }}>
          <div>
            <h3>Beverages & Equipment sales</h3>
            <p className="ops-muted">Same as Sales Report for item-only bills — filter by month and export CSV.</p>
          </div>
          <strong>₹{itemSalesTotal.toFixed(0)}</strong>
        </header>
        <div className="sales-dashboard" style={{ marginBottom: 12 }}>
          <article>
            <span>Bills</span>
            <strong>{filteredItemBills.length}</strong>
          </article>
          <article>
            <span>Total</span>
            <strong>₹{itemSalesTotal.toFixed(0)}</strong>
          </article>
          <article>
            <span>Discount given</span>
            <strong>₹{itemSalesDiscount.toFixed(0)}</strong>
          </article>
        </div>
        <div className="ops-inline" style={{ gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <label>
            Month
            <input type="month" value={itemMonth} onChange={(e) => setItemMonth(e.target.value)} />
          </label>
          <button type="button" className="link" onClick={() => setItemMonth("")}>All months</button>
          <button type="button" className="primary" onClick={exportItemCsv}>Export CSV</button>
        </div>
        <input
          className="ops-search"
          placeholder="Search customer / bill #"
          value={itemQuery}
          onChange={(e) => setItemQuery(e.target.value)}
        />
        <div className="ops-table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>Customer</th><th>Discount</th><th>Mode</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {filteredItemBills.length === 0 && (
                <tr><td colSpan={6} className="ops-muted">No item bills for this period.</td></tr>
              )}
              {filteredItemBills.map((row) => (
                <tr key={row.id}>
                  <td>#{row.bill_number}</td>
                  <td>{row.customer_name}</td>
                  <td>₹{Number(row.discount || 0).toFixed(0)}</td>
                  <td>{row.payment_mode}</td>
                  <td>₹{Number(row.grand_total).toFixed(0)}</td>
                  <td>
                    <button
                      type="button"
                      className="link"
                      onClick={async () => {
                        if (!window.confirm("Delete this bill?")) return;
                        await opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" });
                        await loadItemBills();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )}
    </div>
  );
}

function SalesPieChart({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) {
    return (
      <div className="sales-pie-empty">
        <p>No revenue yet to chart</p>
      </div>
    );
  }
  let angle = -90;
  const gradients = slices.filter((slice) => slice.value > 0).map((slice) => {
    const start = angle;
    const sweep = (slice.value / total) * 360;
    angle += sweep;
    return `${slice.color} ${start}deg ${angle}deg`;
  });
  return (
    <div className="sales-pie-wrap">
      <div className="sales-pie" style={{ background: `conic-gradient(${gradients.join(", ")})` }} aria-hidden="true" />
      <ul className="sales-pie-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <span style={{ background: slice.color }} />
            <b>{slice.label}</b>
            <em>₹{slice.value.toFixed(0)}</em>
            <small>{total ? Math.round((slice.value / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SalesPanel({ session, arenaId, onBack }: { session: Session; arenaId: string; onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [tab, setTab] = useState<"BOOKINGS" | "ITEMS" | "COACHING" | "MEMBERSHIP">("BOOKINGS");
  const [coaching, setCoaching] = useState<any[]>([]);
  const [membership, setMembership] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  async function load() {
    const [tx, coach, member] = await Promise.all([
      opsRequest<{ transactions: any[] }>(session, arenaId, "/ops/transactions"),
      opsRequest<{ entries: any[] }>(session, arenaId, "/ops/coaching"),
      opsRequest<{ entries: any[] }>(session, arenaId, "/ops/membership-billing"),
    ]);
    setRows(tx.transactions);
    setCoaching(coach.entries);
    setMembership(member.entries);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [session.access_token, arenaId]);

  function inSelectedMonth(iso: string | null | undefined) {
    if (!month) return true;
    if (!iso) return false;
    return String(iso).slice(0, 7) === month;
  }

  function isItemsOnly(row: any) {
    return !String(row.sport_name ?? "").trim();
  }

  const q = query.trim().toLowerCase();
  const monthRows = rows.filter((row) => inSelectedMonth(row.created_at));
  const filteredBookings = monthRows.filter((row) =>
    !isItemsOnly(row)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  );
  const filteredItems = monthRows.filter((row) =>
    isItemsOnly(row)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  );
  const filteredCoaching = coaching.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.child_name?.toLowerCase().includes(q)
      || row.parent_name?.toLowerCase().includes(q)
      || row.mobile_number?.includes(q)
      || String(row.bill_number ?? "").includes(q)
    ),
  );
  const filteredMembership = membership.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
      || row.timing?.toLowerCase().includes(q)
    ),
  );

  const bookingTotal = filteredBookings.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const bookingDiscount = filteredBookings.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const itemsTotal = filteredItems.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const itemsDiscount = filteredItems.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const coachingTotal = filteredCoaching.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const coachingDiscount = filteredCoaching.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const membershipTotal = filteredMembership.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const periodDiscount = bookingDiscount + itemsDiscount + coachingDiscount;
  const tabTotal =
    tab === "BOOKINGS" ? bookingTotal
    : tab === "ITEMS" ? itemsTotal
    : tab === "COACHING" ? coachingTotal
    : membershipTotal;

  const sportSlices = Object.entries(filteredBookings.reduce<Record<string, number>>((acc, row) => {
    const key = row.sport_name?.trim() || "Sport";
    acc[key] = (acc[key] ?? 0) + Number(row.grand_total || 0);
    return acc;
  }, {})).map(([label, value], index) => ({
    label,
    value,
    color: ["#082b55", "#58b91c", "#0d9488", "#e11d48", "#d97706", "#4f46e5", "#9333ea"][index % 7],
  }));
  const moduleSlices = [
    { label: "Bookings", value: bookingTotal, color: "#082b55" },
    { label: "Items", value: itemsTotal, color: "#d97706" },
    { label: "Coaching", value: coachingTotal, color: "#0d9488" },
    { label: "Membership", value: membershipTotal, color: "#e11d48" },
  ];

  async function removeBooking(id: string) {
    if (!window.confirm("Delete this booking bill?")) return;
    await opsRequest(session, arenaId, `/ops/transactions/${id}`, { method: "DELETE" });
    await load();
  }
  async function removeCoaching(id: string) {
    if (!window.confirm("Delete this coaching entry?")) return;
    await opsRequest(session, arenaId, `/ops/coaching/${id}`, { method: "DELETE" });
    await load();
  }
  async function removeMembership(id: string) {
    if (!window.confirm("Delete this membership entry?")) return;
    await opsRequest(session, arenaId, `/ops/membership-billing/${id}`, { method: "DELETE" });
    await load();
  }

  function exportCsv() {
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    let headers: string[];
    let dataRows: unknown[][];
    if (tab === "BOOKINGS" || tab === "ITEMS") {
      const source = tab === "ITEMS" ? filteredItems : filteredBookings;
      headers = ["Bill", "Created", "Customer", "Mobile", "Sport", "Discount", "Advance", "GrandTotal", "Payment"];
      dataRows = source.map((row) => [
        row.bill_number,
        row.created_at,
        row.customer_name,
        row.customer_mobile,
        row.sport_name || "Beverages & Equipment",
        row.discount ?? 0,
        row.advance ?? 0,
        row.grand_total,
        row.payment_mode,
      ]);
    } else if (tab === "COACHING") {
      headers = ["Bill", "Created", "Child", "Parent", "Mobile", "Discount", "Amount", "Payment"];
      dataRows = filteredCoaching.map((row) => [
        row.bill_number,
        row.created_at,
        row.child_name,
        row.parent_name,
        row.mobile_number,
        row.discount ?? 0,
        row.amount,
        row.payment_mode,
      ]);
    } else {
      headers = ["Bill", "Created", "Customer", "Mobile", "Sport", "Timing", "Amount"];
      dataRows = filteredMembership.map((row) => [
        row.bill_number,
        row.created_at,
        row.customer_name,
        row.customer_mobile,
        row.sport_name,
        row.timing,
        row.amount,
      ]);
    }
    const csv = [headers, ...dataRows].map((line) => line.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${tab.toLowerCase()}-${month || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Sales Report</h2>
          <p className="ops-muted">Sales stay in the database forever — they do not reset next month. Filter by month to review periods.</p>
        </div>
        <strong>{tab}: ₹{tabTotal.toFixed(0)}</strong>
      </header>

      <div className="sales-dashboard">
        <article>
          <span>Bookings</span>
          <strong>₹{bookingTotal.toFixed(0)}</strong>
          <small>{filteredBookings.length} bills</small>
        </article>
        <article>
          <span>Beverages & Equipment</span>
          <strong>₹{itemsTotal.toFixed(0)}</strong>
          <small>{filteredItems.length} bills</small>
        </article>
        <article>
          <span>Coaching</span>
          <strong>₹{coachingTotal.toFixed(0)}</strong>
          <small>{filteredCoaching.length} entries</small>
        </article>
        <article>
          <span>Membership</span>
          <strong>₹{membershipTotal.toFixed(0)}</strong>
          <small>{filteredMembership.length} entries</small>
        </article>
        <article>
          <span>Discount given</span>
          <strong>₹{periodDiscount.toFixed(0)}</strong>
          <small>{month || "All time"}</small>
        </article>
      </div>

      <div className="sales-charts">
        <section className="ops-card">
          <h3>Revenue by module</h3>
          <SalesPieChart slices={moduleSlices} />
        </section>
        <section className="ops-card">
          <h3>Revenue by sport</h3>
          <SalesPieChart slices={sportSlices.length ? sportSlices : [{ label: "No bookings", value: 0, color: "#cbd5e1" }]} />
        </section>
      </div>

      <div className="ops-tabs">
        {([
          ["BOOKINGS", "BOOKINGS"],
          ["ITEMS", "ITEMS"],
          ["COACHING", "COACHING"],
          ["MEMBERSHIP", "MEMBERSHIP"],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="ops-inline" style={{ gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button type="button" className="link" onClick={() => setMonth("")}>All months</button>
        <button type="button" className="primary" onClick={exportCsv}>Export CSV</button>
      </div>
      <input
        className="ops-search"
        placeholder="Search customer / sport / bill #"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {(tab === "BOOKINGS" || tab === "ITEMS") && (
        <div className="ops-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Customer</th>
                <th>{tab === "ITEMS" ? "Type" : "Sport"}</th>
                <th>Discount</th>
                <th>Mode</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(tab === "ITEMS" ? filteredItems : filteredBookings).map((row) => (
                <tr key={row.id}>
                  <td>#{row.bill_number}</td>
                  <td>{row.customer_name}</td>
                  <td>{tab === "ITEMS" ? "Beverages & Equipment" : (row.sport_name || "—")}</td>
                  <td>₹{Number(row.discount || 0).toFixed(0)}</td>
                  <td>{row.payment_mode}</td>
                  <td>₹{Number(row.grand_total).toFixed(0)}</td>
                  <td><button type="button" className="link" onClick={() => removeBooking(row.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "COACHING" && (
        <div className="ops-table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>Child</th><th>Parent</th><th>Dates</th><th>Discount</th><th>Paid</th><th></th></tr></thead>
            <tbody>
              {filteredCoaching.map((row) => (
                <tr key={row.id}>
                  <td>#{row.bill_number ?? "—"}</td>
                  <td>{row.child_name}</td>
                  <td>{row.parent_name}</td>
                  <td>{row.start_date || "—"} → {row.end_date || "—"}</td>
                  <td>₹{Number(row.discount || 0).toFixed(0)}</td>
                  <td>₹{Number(row.amount).toFixed(0)}</td>
                  <td><button type="button" className="link" onClick={() => removeCoaching(row.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "MEMBERSHIP" && (
        <div className="ops-table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>Customer</th><th>Sports</th><th>Timing</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {filteredMembership.map((row) => (
                <tr key={row.id}>
                  <td>#{row.bill_number}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.sport_name || "—"}</td>
                  <td>{row.timing}</td>
                  <td>₹{Number(row.amount).toFixed(0)}</td>
                  <td><button type="button" className="link" onClick={() => removeMembership(row.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CoachingPanel({ session, arenaId, onBack }: { session: Session; arenaId: string; onBack: () => void }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    parentName: "", childName: "", age: "10", mobileNumber: "", level: "Beginner",
    courtNumber: "Court 1", startTime: "17:00", endTime: "18:00",
    startDate: today, endDate: today,
    amount: "", discount: "", advance: "", paymentMode: "CASH",
  });

  async function load() {
    const data = await opsRequest<{ entries: any[] }>(session, arenaId, "/ops/coaching");
    setEntries(data.entries);
  }
  useEffect(() => { load().catch(() => undefined); }, [session.access_token, arenaId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!form.startDate || !form.endDate) throw new Error("Start date and end date are required");
      if (form.endDate < form.startDate) throw new Error("End date must be on or after start date");
      if (!isValidMobile(form.mobileNumber, true)) throw new Error("Enter a valid 10-digit mobile number");
      const amount = parseAmount(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount greater than 0");
      await opsRequest(session, arenaId, "/ops/coaching", {
        method: "POST",
        body: JSON.stringify({
          parentName: form.parentName,
          childName: form.childName,
          age: Number(form.age) || 0,
          mobileNumber: mobileDigits(form.mobileNumber),
          level: form.level,
          courtNumber: form.courtNumber,
          startTime: form.startTime,
          endTime: form.endTime,
          startDate: form.startDate,
          endDate: form.endDate,
          amount,
          discount: Number(form.discount || 0),
          advance: Number(form.advance || 0),
          paymentMode: form.paymentMode,
        }),
      });
      setForm((current) => ({
        ...current,
        parentName: "", childName: "", mobileNumber: "", amount: "", discount: "", advance: "",
        startDate: today, endDate: today,
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Coaching</h2>
        </div>
      </header>
      <form className="ops-card" onSubmit={save}>
        <div className="ops-grid-3">
          <label>Parent name<input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} required /></label>
          <label>Child name<input value={form.childName} onChange={(e) => setForm({ ...form, childName: e.target.value })} required /></label>
          <label>Mobile
            <input
              value={form.mobileNumber}
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => setForm({ ...form, mobileNumber: sanitizeMobileInput(e.target.value) })}
              required
            />
          </label>
          <label>Age<input type="number" min={0} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></label>
          <label>Level
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              <option>Beginner</option><option>Intermediate</option><option>Advance</option>
            </select>
          </label>
          <label>Court<input value={form.courtNumber} onChange={(e) => setForm({ ...form, courtNumber: e.target.value })} /></label>
          <label>Start date<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></label>
          <label>End date<input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></label>
          <label>Start time<input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></label>
          <label>End time<input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></label>
          <label>Fee amount<input type="text" inputMode="decimal" value={form.amount} placeholder="Enter amount" onChange={(e) => setForm({ ...form, amount: sanitizeAmountInput(e.target.value) })} required /></label>
          <label>Discount<input type="text" inputMode="decimal" value={form.discount} placeholder="Optional" onChange={(e) => setForm({ ...form, discount: sanitizeAmountInput(e.target.value) })} /></label>
          <label>Advance<input type="text" inputMode="decimal" value={form.advance} placeholder="Optional" onChange={(e) => setForm({ ...form, advance: sanitizeAmountInput(e.target.value) })} /></label>
          <label>Payment
            <select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
              <option value="CASH">Cash</option><option value="ONLINE">Online</option>
            </select>
          </label>
        </div>
        {error && <p className="workspace-notice">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Register coaching"}</button>
      </form>
      <div className="ops-table-wrap">
        <table>
          <thead><tr><th>Bill</th><th>Child</th><th>Parent</th><th>Dates</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>#{entry.bill_number ?? "—"}</td>
                <td>{entry.child_name}</td>
                <td>{entry.parent_name}</td>
                <td>{entry.start_date || "—"} → {entry.end_date || "—"}</td>
                <td>₹{Number(entry.amount).toFixed(0)}</td>
                <td>
                  <button type="button" className="link" onClick={async () => {
                    await opsRequest(session, arenaId, `/ops/coaching/${entry.id}`, { method: "DELETE" });
                    await load();
                  }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BillingPanel({
  session, arenaId, sports, onBack,
}: {
  session: Session; arenaId: string; sports: SportConfig[]; onBack: () => void;
}) {
  const [entries, setEntries] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [timing, setTiming] = useState("1 Hour");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseAmount(amount);
  const displayTotal = Number.isFinite(amountNum) ? amountNum : 0;

  async function load() {
    const data = await opsRequest<{ entries: any[] }>(session, arenaId, "/ops/membership-billing");
    setEntries(data.entries);
  }
  useEffect(() => { load().catch(() => undefined); }, [session.access_token, arenaId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (!isValidMobile(customerMobile, true)) throw new Error("Enter a valid 10-digit mobile number");
      if (!Number.isFinite(amountNum) || amountNum <= 0) throw new Error("Enter an amount greater than 0");
      await opsRequest(session, arenaId, "/ops/membership-billing", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerMobile: mobileDigits(customerMobile),
          sportName: selectedSports.join(", "),
          timing,
          bookingMethod: "WALK_IN",
          amount: amountNum,
          paymentMode,
          items: [],
        }),
      });
      setCustomerName(""); setCustomerMobile(""); setSelectedSports([]); setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Membership</h2>
        </div>
      </header>
      <form className="ops-card" onSubmit={save}>
        <div className="ops-grid-3">
          <label>Customer<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
          <label>Mobile
            <input
              value={customerMobile}
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => setCustomerMobile(sanitizeMobileInput(e.target.value))}
              required
            />
          </label>
          <label>Timings
            <select value={timing} onChange={(e) => setTiming(e.target.value)}>
              <option value="1 Hour">1 Hour</option>
              <option value="1.5 Hours">1.5 Hours</option>
              <option value="2 Hours">2 Hours</option>
              <option value="3 Hours">3 Hours</option>
              <option value="4 Hours">4 Hours</option>
              <option value="5 Hours">5 Hours</option>
              <option value="6 Hours">6 Hours</option>
            </select>
          </label>
          <label>Amount
            <input type="text" inputMode="decimal" value={amount} placeholder="Enter amount" onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))} />
          </label>
          <label>Payment
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="CASH">Cash</option><option value="ONLINE">Online</option>
            </select>
          </label>
        </div>
        <p className="ops-muted">Select sports for this membership (optional).</p>
        <div className="ops-chip-row">
          {sports.map((sport) => (
            <button type="button" key={sport.id} className={selectedSports.includes(sport.name) ? "chip active" : "chip"}
              onClick={() => setSelectedSports((current) => current.includes(sport.name) ? current.filter((name) => name !== sport.name) : [...current, sport.name])}>
              {sport.name}
            </button>
          ))}
        </div>
        {error && <p className="workspace-notice">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "Saving…" : `Save membership ₹${displayTotal.toFixed(0)}`}</button>
      </form>
      <div className="ops-table-wrap">
        <table>
          <thead><tr><th>Bill</th><th>Customer</th><th>Sports</th><th>Timings</th><th>Amount</th></tr></thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>#{entry.bill_number}</td>
                <td>{entry.customer_name}</td>
                <td>{entry.sport_name || "—"}</td>
                <td>{entry.timing}</td>
                <td>₹{Number(entry.amount).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type InvoiceDraft = {
  arenaName: string;
  arenaAddress?: string;
  arenaPincode?: string;
  arenaPhone?: string;
  billNumber: number;
  customerName: string;
  customerMobile: string;
  sportName?: string;
  courtNames?: string[];
  bookingDate?: string;
  startTime?: string;
  endTime?: string;
  bookingAmount: number;
  items: CartItem[];
  discount: number;
  advance: number;
  subTotal: number;
  grandTotal: number;
  paymentMode: string;
  bookingMethod: string;
};

function InvoicePanel({
  session, arena, onBack,
}: {
  session: Session; arena: Arena; onBack: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [sportName, setSportName] = useState("");
  const [courtNames, setCourtNames] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [bookingAmount, setBookingAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [billNumber, setBillNumber] = useState("1");
  const [preview, setPreview] = useState<InvoiceDraft | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{
    id: string;
    bill_number: number;
    customer_name: string;
    customer_mobile: string;
    grand_total: number;
    payload: InvoiceDraft;
    created_at: string;
  }>>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    const data = await opsRequest<{ invoices: typeof history }>(session, arena.id, "/ops/generated-invoices");
    setHistory(data.invoices.map((row) => ({ ...row, payload: row.payload as InvoiceDraft })));
  }

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [session.access_token, arena.id]);

  function pendingLine(): CartItem | null {
    const price = parseAmount(itemPrice);
    const qty = Number(itemQty);
    if (!itemName.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) return null;
    return { itemId: null, name: itemName.trim(), price, quantity: qty, category: "EQUIPMENT" };
  }

  function addLine() {
    const line = pendingLine();
    if (!line) {
      setError("Enter item name, price and quantity before adding");
      return;
    }
    setError("");
    setItems((current) => [...current, line]);
    setItemName(""); setItemPrice(""); setItemQty("1");
  }

  async function buildPreview(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!customerName.trim()) return setError("Customer name is required");
    if (!isValidMobile(customerMobile, true)) return setError("Enter a valid 10-digit mobile number");
    const pending = pendingLine();
    const allItems = pending ? [...items, pending] : items;
    if (pending) {
      setItems(allItems);
      setItemName(""); setItemPrice(""); setItemQty("1");
    }
    const booking = Number(bookingAmount || 0);
    const itemsTotal = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const disc = Number(discount || 0);
    const adv = Number(advance || 0);
    const subTotal = booking + itemsTotal;
    const grand = Math.max(0, subTotal - disc - adv);
    if (grand <= 0 && subTotal <= 0) return setError("Enter booking amount or add line items");
    const draft: InvoiceDraft = {
      arenaName: arena.name,
      arenaAddress: arena.address,
      arenaPincode: arena.pincode,
      arenaPhone: arena.contactPhone,
      billNumber: Number(billNumber) || 1,
      customerName,
      customerMobile: mobileDigits(customerMobile),
      sportName: sportName || undefined,
      courtNames: courtNames ? courtNames.split(",").map((s) => s.trim()).filter(Boolean) : [],
      bookingDate,
      startTime,
      endTime,
      bookingAmount: booking,
      items: allItems,
      discount: disc,
      advance: adv,
      subTotal,
      grandTotal: grand,
      paymentMode,
      bookingMethod: "WALK_IN",
    };
    setBusy(true);
    try {
      const saved = await opsRequest<{ invoice: { id: string } }>(session, arena.id, "/ops/generated-invoices", {
        method: "POST",
        body: JSON.stringify({
          billNumber: draft.billNumber,
          customerName: draft.customerName,
          customerMobile: draft.customerMobile,
          grandTotal: draft.grandTotal,
          payload: draft,
        }),
      });
      setSavedId(saved.invoice.id);
      setPreview(draft);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save invoice");
    } finally {
      setBusy(false);
    }
  }

  async function removeSaved(id: string) {
    if (!window.confirm("Remove this saved invoice?")) return;
    await opsRequest(session, arena.id, `/ops/generated-invoices/${id}`, { method: "DELETE" });
    if (savedId === id) {
      setPreview(null);
      setSavedId(null);
    }
    await loadHistory();
  }

  if (preview) {
    return (
      <InvoiceView
        draft={preview}
        onClose={() => { setPreview(null); setSavedId(null); }}
        onRemove={savedId ? () => removeSaved(savedId) : undefined}
      />
    );
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Generate Invoice</h2>
          <p className="ops-muted">Fill the form first — saved invoices appear at the bottom.</p>
        </div>
      </header>

      <form className="ops-card" onSubmit={buildPreview}>
        <div className="ops-grid-3">
          <label>Bill #<input type="number" min={1} max={999999} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} /></label>
          <label>Customer<input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required /></label>
          <label>Mobile
            <input
              value={customerMobile}
              inputMode="numeric"
              maxLength={10}
              onChange={(e) => setCustomerMobile(sanitizeMobileInput(e.target.value))}
              required
            />
          </label>
          <label>Sport<input value={sportName} onChange={(e) => setSportName(e.target.value)} /></label>
          <label>Courts<input value={courtNames} onChange={(e) => setCourtNames(e.target.value)} placeholder="Court 1, Court 2" /></label>
          <label>Date<input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} /></label>
          <label>Start<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
          <label>End<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
          <label>Booking amount<input type="text" inputMode="decimal" value={bookingAmount} placeholder="Enter amount" onChange={(e) => setBookingAmount(sanitizeAmountInput(e.target.value))} /></label>
          <label>Discount<input type="text" inputMode="decimal" value={discount} placeholder="Optional" onChange={(e) => setDiscount(sanitizeAmountInput(e.target.value))} /></label>
          <label>Advance<input type="text" inputMode="decimal" value={advance} placeholder="Optional" onChange={(e) => setAdvance(sanitizeAmountInput(e.target.value))} /></label>
          <label>Payment
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)}>
              <option value="CASH">Cash</option><option value="ONLINE">Online</option>
            </select>
          </label>
        </div>
        <h3>Items (name, price, qty)</h3>
        <div className="ops-inline">
          <input placeholder="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <input placeholder="Price" value={itemPrice} onChange={(e) => setItemPrice(sanitizeAmountInput(e.target.value))} />
          <input placeholder="Qty" value={itemQty} onChange={(e) => setItemQty(e.target.value.replace(/\D/g, "") || "1")} />
          <button type="button" className="primary" onClick={addLine}>Add item</button>
        </div>
        {!!items.length && (
          <ul className="ops-cart">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name} · ₹{item.price} × {item.quantity}</span>
                <strong>₹{(item.price * item.quantity).toFixed(0)}</strong>
                <button type="button" className="link" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="workspace-notice">{error}</p>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save & preview invoice"}</button>
      </form>

      <section className="ops-card" style={{ marginTop: 16 }}>
        <h3>Saved invoices</h3>
        {history.length === 0 && <p className="ops-muted">No saved invoices yet.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {history.map((row) => (
            <li key={row.id} style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <strong>#{row.bill_number} · {row.customer_name}</strong>
                <div className="ops-muted">₹{Number(row.grand_total).toFixed(0)} · {new Date(row.created_at).toLocaleString("en-IN")}</div>
              </div>
              <div className="ops-inline">
                <button type="button" className="link" onClick={() => { setSavedId(row.id); setPreview(row.payload); }}>Preview</button>
                <button type="button" className="link" onClick={() => removeSaved(row.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function InvoiceView({
  draft, onClose, onRemove,
}: {
  draft: InvoiceDraft;
  onClose: () => void;
  onRemove?: () => void | Promise<void>;
}) {
  function printInvoice() {
    window.print();
  }

  function shareWhatsApp() {
    const courts = draft.courtNames?.length ? draft.courtNames.join(", ") : "N/A";
    let message = `*${draft.arenaName}*\nPayment Receipt\n\n`;
    if (draft.arenaAddress) message += `${draft.arenaAddress}${draft.arenaPincode ? ` - ${draft.arenaPincode}` : ""}\n`;
    if (draft.arenaPhone) message += `Ph: +91 ${draft.arenaPhone}\n\n`;
    message += `Customer: ${draft.customerName}\n`;
    message += `Bill No: ${draft.billNumber}\n`;
    if (draft.sportName) {
      message += `Sport: ${draft.sportName}\n`;
      message += `Court: ${courts}\n`;
      if (draft.bookingDate) message += `Booking Date: ${draft.bookingDate}\n`;
      if (draft.startTime) message += `Time: ${draft.startTime} - ${draft.endTime}\n`;
      message += `Booking Amount: ₹${draft.bookingAmount}\n`;
    }
    if (draft.items.length) {
      message += "Items:\n";
      message += draft.items.map((i) => `- ${i.name} | Qty ${i.quantity} | ₹${i.price} | Total ₹${i.price * i.quantity}`).join("\n") + "\n";
    }
    if (draft.discount > 0) message += `Discount: −₹${draft.discount}\n`;
    message += `\n*Total: ₹${draft.grandTotal.toFixed(2)}*\n`;
    message += `Payment Mode: ${draft.paymentMode}\n\nThank you for choosing ${draft.arenaName}!`;
    const phone = draft.customerMobile ? `91${draft.customerMobile.replace(/^91/, "")}` : "";
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
  }

  return (
    <div className="ops-panel invoice-preview">
      <header className="ops-panel-head no-print">
        <div>
          <button type="button" className="link" onClick={onClose}>← Close</button>
          <h2>Invoice Preview</h2>
        </div>
        <div className="ops-inline">
          <button type="button" className="primary" onClick={shareWhatsApp}>WhatsApp</button>
          <button type="button" className="primary" onClick={printInvoice}>Print</button>
          {onRemove && <button type="button" className="link" onClick={() => { void onRemove(); }}>Remove</button>}
        </div>
      </header>
      <div id="printable-invoice" className="ops-card invoice-sheet">
        <div className="invoice-head">
          <img src={sportzArenaLogo} alt="" className="brand-logo" />
          <h1>{draft.arenaName}</h1>
          <p>Payment Receipt</p>
          {(draft.arenaAddress || draft.arenaPincode || draft.arenaPhone) && (
            <p className="ops-muted">
              {[draft.arenaAddress, draft.arenaPincode].filter(Boolean).join(" - ")}
              {draft.arenaPhone ? ` · +91 ${draft.arenaPhone}` : ""}
            </p>
          )}
        </div>
        <div className="invoice-meta">
          <div>
            <p className="ops-muted">Bill to</p>
            <strong>{draft.customerName}</strong>
            {draft.customerMobile && <p>+91 {draft.customerMobile}</p>}
          </div>
          <div>
            <p><b>Bill No:</b> #{draft.billNumber}</p>
            <p><b>Method:</b> {draft.bookingMethod.replace(/_/g, " ")}</p>
          </div>
        </div>
        {draft.sportName && (
          <table>
            <thead><tr><th>Sport</th><th>Date</th><th>Time</th><th>Amount</th></tr></thead>
            <tbody>
              <tr>
                <td>{draft.sportName}<br /><small>{draft.courtNames?.join(", ")}</small></td>
                <td>{draft.bookingDate || "—"}</td>
                <td>{draft.startTime} - {draft.endTime}</td>
                <td>₹{draft.bookingAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>
            {draft.items.length ? draft.items.map((item, idx) => (
              <tr key={`${item.name}-${idx}`}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>₹{Number(item.price).toFixed(2)}</td>
                <td>₹{(Number(item.price) * Number(item.quantity)).toFixed(2)}</td>
              </tr>
            )) : (
              <tr><td colSpan={4}>No items added</td></tr>
            )}
          </tbody>
        </table>
        <div className="invoice-totals">
          <p>Sub total: ₹{draft.subTotal.toFixed(2)}</p>
          {draft.discount > 0 && <p>Discount: −₹{draft.discount.toFixed(2)}</p>}
          {draft.advance > 0 && <p>Advance: −₹{draft.advance.toFixed(2)}</p>}
          <strong>Total: ₹{draft.grandTotal.toFixed(2)}</strong>
          <p>Payment: {draft.paymentMode}</p>
        </div>
        <p className="ops-muted">Thank you for choosing {draft.arenaName}!</p>
      </div>
    </div>
  );
}


function ProfilePanel({
  session, arena, role, onBack, onSaved,
}: {
  session: Session; arena: Arena; role: AppRole; onBack: () => void; onSaved: (next: Partial<Arena>) => void;
}) {
  const isOwner = role === "owner";
  const [name, setName] = useState(arena.name);
  const [address, setAddress] = useState(arena.address ?? "");
  const [pincode, setPincode] = useState(arena.pincode ?? "");
  const [contactPhone, setContactPhone] = useState(arena.contactPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [staffList, setStaffList] = useState<Array<{
    userId: string;
    email: string;
    fullName: string;
    active: boolean;
  }>>([]);

  useEffect(() => {
    opsRequest<{ profile: { name: string; address: string; pincode: string; contactPhone: string } }>(session, arena.id, "/ops/profile")
      .then(({ profile }) => {
        setName(profile.name);
        setAddress(profile.address);
        setPincode(profile.pincode);
        setContactPhone(profile.contactPhone);
      })
      .catch(() => undefined);
  }, [session.access_token, arena.id]);

  async function loadStaff() {
    if (!isOwner) return;
    const data = await opsRequest<{ staff: typeof staffList }>(session, arena.id, "/ops/staff");
    setStaffList(data.staff.filter((row) => row.active));
  }

  useEffect(() => {
    loadStaff().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.access_token, arena.id, isOwner]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!isOwner) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (contactPhone && !isValidMobile(contactPhone, true)) throw new Error("Enter a valid 10-digit mobile number");
      const { profile } = await opsRequest<{ profile: { name: string; address: string; pincode: string; contactPhone: string } }>(
        session,
        arena.id,
        "/ops/profile",
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            address,
            pincode,
            contactPhone: mobileDigits(contactPhone),
          }),
        },
      );
      onSaved({
        name: profile.name,
        address: profile.address,
        pincode: profile.pincode,
        contactPhone: profile.contactPhone,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function addStaff(event: FormEvent) {
    event.preventDefault();
    setStaffBusy(true);
    setStaffError("");
    setStaffMessage("");
    try {
      const result = await opsRequest<{ message?: string }>(session, arena.id, "/ops/staff", {
        method: "POST",
        body: JSON.stringify({ email: staffEmail.trim(), fullName: staffName.trim() }),
      });
      setStaffEmail("");
      setStaffName("");
      setStaffMessage(result.message ?? "Staff added.");
      await loadStaff();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unable to add staff");
    } finally {
      setStaffBusy(false);
    }
  }

  async function removeStaff(userId: string) {
    setStaffError("");
    try {
      await opsRequest(session, arena.id, `/ops/staff/${userId}`, { method: "DELETE" });
      await loadStaff();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unable to remove staff");
    }
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Arena Profile</h2>
          <p className="ops-muted">{isOwner ? "You are signed in as Owner." : "You are signed in as Staff."}</p>
        </div>
      </header>
      <form className="ops-card" onSubmit={save}>
        <p className="ops-muted">These details appear on generated invoices.</p>
        <div className="ops-grid-3">
          <label>Arena name<input value={name} onChange={(e) => setName(e.target.value)} required disabled={!isOwner} /></label>
          <label>Mobile
            <input
              value={contactPhone}
              inputMode="numeric"
              maxLength={10}
              disabled={!isOwner}
              onChange={(e) => setContactPhone(sanitizeMobileInput(e.target.value))}
            />
          </label>
          <label>Pincode<input value={pincode} disabled={!isOwner} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          <label className="ops-span-2">Address<input value={address} disabled={!isOwner} onChange={(e) => setAddress(e.target.value)} /></label>
        </div>
        {error && <p className="workspace-notice">{error}</p>}
        {saved && <p className="ops-muted">Profile saved.</p>}
        {isOwner && <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>}
      </form>

      {isOwner && (
        <section className="ops-card" style={{ marginTop: 16 }}>
          <h3>Staff</h3>
          <p className="ops-muted">
            They log in with the same app using Email OTP, then set a password.
          </p>
          <form onSubmit={addStaff} className="ops-grid-3" style={{ marginTop: 12 }}>
            <label>Staff email
              <input
                type="email"
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="staff@example.com"
                required
              />
            </label>
            <label>Name (optional)
              <input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Display name" />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="primary" type="submit" disabled={staffBusy}>
                {staffBusy ? "Adding…" : "Add staff"}
              </button>
            </div>
          </form>
          {staffError && <p className="workspace-notice">{staffError}</p>}
          {staffMessage && <p className="ops-muted">{staffMessage}</p>}
          <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
            {staffList.length === 0 && <li className="ops-muted">No staff yet.</li>}
            {staffList.map((row) => (
              <li key={row.userId} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
                <div>
                  <strong>{row.fullName || row.email}</strong>
                  <div className="ops-muted">{row.email}</div>
                </div>
                <button type="button" className="link" onClick={() => removeStaff(row.userId)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MenuPanel({
  session, arenaId, sports, inventory, onChanged, onBack,
}: {
  session: Session; arenaId: string; sports: SportConfig[]; inventory: InventoryItem[];
  onChanged: () => Promise<void>; onBack: () => void;
}) {
  const [tab, setTab] = useState<"INVENTORY" | "COURTS">("INVENTORY");
  const [localInv, setLocalInv] = useState(inventory);
  const [courtNames, setCourtNames] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => setLocalInv(inventory), [inventory]);

  async function saveItem(item: InventoryItem) {
    await opsRequest(session, arenaId, "/ops/inventory", {
      method: "POST",
      body: JSON.stringify(item),
    });
    await onChanged();
  }

  return (
    <div className="ops-panel">
      <header className="ops-panel-head">
        <div>
          <button type="button" className="link" onClick={onBack}>← Back</button>
          <h2>Manage Menu</h2>
        </div>
      </header>
      <div className="ops-tabs">
        <button type="button" className={tab === "INVENTORY" ? "active" : ""} onClick={() => setTab("INVENTORY")}>Equipment & Beverages</button>
        <button type="button" className={tab === "COURTS" ? "active" : ""} onClick={() => setTab("COURTS")}>Sports & Courts</button>
      </div>
      {error && <p className="workspace-notice">{error}</p>}
      {tab === "INVENTORY" && (
        <div className="ops-card">
          <p className="ops-muted">Price and name save when you leave the field. Stock drops automatically when items are sold on bills — that is not a price change.</p>
          <button className="primary" type="button" onClick={async () => {
            try {
              const existing = new Set(localInv.map((item) => item.name.toLowerCase()));
              let name = "New Item";
              let n = 2;
              while (existing.has(name.toLowerCase())) {
                name = `New Item ${n}`;
                n += 1;
              }
              await opsRequest(session, arenaId, "/ops/inventory", {
                method: "POST",
                body: JSON.stringify({ name, category: "EQUIPMENT", price: 0, stock: 0 }),
              });
              await onChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Unable to add item");
            }
          }}>+ Add item</button>
          <div className="ops-table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th></th></tr></thead>
              <tbody>
                {localInv.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        value={item.name}
                        onChange={(e) => setLocalInv((rows) => rows.map((row) => row.id === item.id ? { ...row, name: e.target.value } : row))}
                        onBlur={(e) => {
                          const next = { ...item, name: e.target.value };
                          setLocalInv((rows) => rows.map((row) => row.id === item.id ? next : row));
                          void saveItem(next);
                        }}
                      />
                    </td>
                    <td>
                      <select value={item.category} onChange={async (e) => {
                        const next = { ...item, category: e.target.value as InventoryItem["category"] };
                        setLocalInv((rows) => rows.map((row) => row.id === item.id ? next : row));
                        await saveItem(next);
                      }}>
                        <option value="EQUIPMENT">Equipment</option>
                        <option value="BEVERAGE">Beverage</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.price}
                        onChange={(e) => setLocalInv((rows) => rows.map((row) => row.id === item.id ? { ...row, price: Number(e.target.value) } : row))}
                        onBlur={(e) => {
                          const next = { ...item, price: Number(e.target.value) };
                          setLocalInv((rows) => rows.map((row) => row.id === item.id ? next : row));
                          void saveItem(next);
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.stock}
                        onChange={(e) => setLocalInv((rows) => rows.map((row) => row.id === item.id ? { ...row, stock: Number(e.target.value) } : row))}
                        onBlur={(e) => {
                          const next = { ...item, stock: Number(e.target.value) };
                          setLocalInv((rows) => rows.map((row) => row.id === item.id ? next : row));
                          void saveItem(next);
                        }}
                      />
                    </td>
                    <td>
                      <button type="button" className="link" onClick={async () => {
                        await opsRequest(session, arenaId, `/ops/inventory/${item.id}`, { method: "DELETE" });
                        await onChanged();
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "COURTS" && (
        <div className="ops-card">
          {sports.map((sport) => (
            <article key={sport.id} className="ops-sport-block">
              <div className="ops-sport-block-head">
                <h3>{sport.name}</h3>
                <label>₹/hr
                  <input type="number" defaultValue={sport.pricePerHour} onBlur={async (e) => {
                    try {
                      await opsRequest(session, arenaId, `/ops/sports/${sport.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ pricePerHour: Number(e.target.value) }),
                      });
                      await onChanged();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Unable to update price");
                    }
                  }} />
                </label>
              </div>
              <div className="ops-chip-row">
                {sport.courts.map((court) => (
                  <span key={court.id} className="chip">
                    {court.name}
                    <button type="button" onClick={async () => {
                      try {
                        await opsRequest(session, arenaId, `/ops/courts/${court.id}`, { method: "DELETE" });
                        await onChanged();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Unable to delete court");
                      }
                    }}>×</button>
                  </span>
                ))}
              </div>
              <div className="ops-inline">
                <input placeholder="New court name" value={courtNames[sport.id] ?? ""} onChange={(e) => setCourtNames({ ...courtNames, [sport.id]: e.target.value })} />
                <button type="button" className="primary" onClick={async () => {
                  const name = (courtNames[sport.id] ?? "").trim();
                  if (!name) return;
                  try {
                    setError("");
                    await opsRequest(session, arenaId, "/ops/courts", { method: "POST", body: JSON.stringify({ sportId: sport.id, name }) });
                    setCourtNames({ ...courtNames, [sport.id]: "" });
                    await onChanged();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Unable to add court");
                  }
                }}>Add court</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
