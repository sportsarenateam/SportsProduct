import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import express, { type NextFunction, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import {
  cashfreeModeLabel,
  createCashfreeOrder,
  getCashfreeOrder,
  getCashfreePayments,
  type CashfreeEnv,
} from "./cashfree.js";
import { registerOpsRoutes } from "./opsRoutes.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const env = z.object({
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CASHFREE_APP_ID: z.string().min(1),
  CASHFREE_SECRET_KEY: z.string().min(1),
  CASHFREE_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  /** Cashfree webhook signing secret (Dashboard → Developers → Webhooks). */
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  /** Legacy Razorpay — optional while migrating subscription checkout to Cashfree. */
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_MODE: z.enum(["test", "live"]).optional(),
}).parse(process.env);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const cashfreeEnv: CashfreeEnv = env.CASHFREE_ENV;
const cashfreeConfig = {
  appId: env.CASHFREE_APP_ID,
  secretKey: env.CASHFREE_SECRET_KEY,
  env: cashfreeEnv,
};
const payMode = cashfreeModeLabel(cashfreeEnv);
const app = express();
const allowedOrigins = (env.APP_URL ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const appOrigin = allowedOrigins[0] || "http://localhost:5173";
const productionWebOrigins = [
  "https://sportsarena.team",
  "https://www.sportsarena.team",
];
function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(normalized)) return true;
  if (productionWebOrigins.includes(normalized)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(normalized)) return true;
  if (/\.(loca\.lt|ngrok-free\.app|ngrok\.io|exp\.direct|trycloudflare\.com|vercel\.app)$/i.test(normalized)) return true;
  if (/^https?:\/\/.*\.(loca\.lt|trycloudflare\.com|vercel\.app)$/i.test(normalized)) return true;
  return false;
}
app.use(cors({
  origin(origin, callback) {
    // Allow local web + LAN / tunnel mobile testing without throwing (throws crashed the API).
    if (isAllowedOrigin(origin)) return callback(null, true);
    console.warn("CORS blocked origin:", origin);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Organization-Id"],
  optionsSuccessStatus: 204,
}));

/** Simple in-memory rate limit (per process) for public auth abuse. */
const authHitMap = new Map<string, { count: number; resetAt: number }>();
function allowAuthAttempt(bucket: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const row = authHitMap.get(bucket);
  if (!row || now >= row.resetAt) {
    authHitMap.set(bucket, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= limit) return false;
  row.count += 1;
  return true;
}
function clientIp(req: Request) {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

type AuthedRequest = Request & { user?: User; organizationId?: string; role?: "owner" | "manager" | "cashier" };
async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Bearer token is required" });
  const { data: auth } = await db.auth.getUser(token);
  if (!auth.user) return res.status(401).json({ error: "Invalid user session" });
  req.user = auth.user;
  next();
}
async function membership(req: AuthedRequest, res: Response, next: NextFunction) {
  const requestedOrganizationId = req.header("x-organization-id");
  if (!req.user) return res.status(401).json({ error: "Invalid user session" });
  if (!requestedOrganizationId) return res.status(400).json({ error: "Arena context is required" });
  let membershipQuery = db.from("organization_memberships").select("organization_id,role").eq("user_id", req.user.id).eq("active", true);
  membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId);
  const { data: record } = await membershipQuery.maybeSingle();
  if (!record) return res.status(403).json({ error: "No access to this arena" });
  req.organizationId = record.organization_id; req.role = record.role;
  next();
}
const requireRole = (...roles: AuthedRequest["role"][]) => (req: AuthedRequest, res: Response, next: NextFunction) =>
  roles.includes(req.role) ? next() : res.status(403).json({ error: "Insufficient role" });
async function requireEntitlement(req: AuthedRequest, res: Response, next: NextFunction) {
  const { data: subscription } = await db.from("arena_subscriptions")
    .select("status,trial_ends_at,current_period_ends_at").eq("organization_id", req.organizationId!).maybeSingle();
  const now = Date.now();
  const allowed = subscription && (
    (subscription.status === "trialing" && !!subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() > now)
    || (["active", "authenticated"].includes(subscription.status)
      && (!subscription.current_period_ends_at || new Date(subscription.current_period_ends_at).getTime() > now))
  );
  if (!allowed) return res.status(402).json({ error: "An active trial or subscription is required" });
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true }));

/** Public marketing stats for the landing page (no auth). */
app.get("/public/landing-stats", async (_req, res) => {
  try {
    const [venuesRes, arenasRes, customersRes, posMobilesRes, bookingsRes, invoiceRes] = await Promise.all([
      db.from("organizations").select("id", { count: "exact", head: true }),
      db.from("organizations").select("name").order("created_at", { ascending: false }).limit(40),
      db.from("customers").select("phone"),
      db.from("pos_transactions").select("customer_mobile"),
      db.from("pos_transactions").select("id", { count: "exact", head: true }),
      db.from("generated_invoices").select("customer_mobile"),
    ]);
    if (venuesRes.error) throw venuesRes.error;
    if (arenasRes.error) throw arenasRes.error;
    if (customersRes.error) throw customersRes.error;
    if (posMobilesRes.error) throw posMobilesRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (invoiceRes.error) throw invoiceRes.error;

    const mobiles = new Set<string>();
    for (const row of customersRes.data ?? []) {
      const phone = String((row as { phone?: string }).phone ?? "").replace(/\D/g, "").slice(-10);
      if (phone.length === 10) mobiles.add(phone);
    }
    for (const row of [...(posMobilesRes.data ?? []), ...(invoiceRes.data ?? [])]) {
      const phone = String((row as { customer_mobile?: string }).customer_mobile ?? "").replace(/\D/g, "").slice(-10);
      if (phone.length === 10) mobiles.add(phone);
    }

    const arenas = (arenasRes.data ?? [])
      .map((row) => String((row as { name?: string }).name ?? "").trim())
      .filter(Boolean);

    res.json({
      venues: venuesRes.count ?? 0,
      customers: mobiles.size,
      bookings: bookingsRes.count ?? 0,
      uptime: "99.9%",
      arenas,
    });
  } catch (err) {
    console.error("landing-stats", err);
    res.status(500).json({ error: "Unable to load landing stats" });
  }
});

async function findAuthUserByEmail(email: string) {
  const normalized = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

/** Service-role provisioning — does not depend on RPC grants for private.provision_owner_arena. */
async function provisionOwnerArena(input: {
  actorId: string;
  arenaName: string;
  address?: string;
  contactPhone?: string;
  timezone?: string;
  currencyCode?: string;
}) {
  const arenaName = input.arenaName.trim();
  const timezone = (input.timezone?.trim() || "Asia/Kolkata");
  const currencyCode = (input.currencyCode?.trim() || "INR").toUpperCase();
  if (arenaName.length < 2 || arenaName.length > 120) throw new Error("Arena name must be between 2 and 120 characters");
  if ((input.address?.length ?? 0) > 500 || (input.contactPhone?.length ?? 0) > 40) {
    throw new Error("Arena contact details are too long");
  }
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Currency code must be a three-letter ISO code");

  const { data: existingMembership } = await db.from("organization_memberships")
    .select("organization_id")
    .eq("user_id", input.actorId)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingMembership?.organization_id) {
    const [{ data: org }, { data: sub }] = await Promise.all([
      db.from("organizations").select("id,name").eq("id", existingMembership.organization_id).maybeSingle(),
      db.from("arena_subscriptions")
        .select("status,trial_ends_at,current_period_ends_at")
        .eq("organization_id", existingMembership.organization_id)
        .maybeSingle(),
    ]);
    return {
      organization: { id: existingMembership.organization_id, name: org?.name ?? arenaName },
      subscription: {
        status: sub?.status ?? "trialing",
        trialEndsAt: sub?.trial_ends_at ?? null,
        currentPeriodEndsAt: sub?.current_period_ends_at ?? null,
      },
      alreadyProvisioned: true,
    };
  }

  const { data: organization, error: orgError } = await db.from("organizations").insert({
    name: arenaName,
    address: input.address?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    timezone,
    currency_code: currencyCode,
  }).select("id,name").single();
  if (orgError || !organization) throw new Error(orgError?.message ?? "Unable to create arena");

  const { error: memberError } = await db.from("organization_memberships").insert({
    organization_id: organization.id,
    user_id: input.actorId,
    role: "owner",
    active: true,
  });
  if (memberError) throw new Error(memberError.message);

  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: subscription, error: subError } = await db.from("arena_subscriptions").insert({
    organization_id: organization.id,
    status: "trialing",
    trial_ends_at: trialEndsAt,
  }).select("status,trial_ends_at,current_period_ends_at").single();
  if (subError || !subscription) throw new Error(subError?.message ?? "Unable to start trial");

  await db.from("activity_log").insert({
    organization_id: organization.id,
    actor_id: input.actorId,
    action: "created",
    entity_type: "organization",
    entity_id: organization.id,
    after_data: organization,
  });

  return {
    organization: { id: organization.id, name: organization.name },
    subscription: {
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEndsAt: subscription.current_period_ends_at,
    },
    alreadyProvisioned: false,
  };
}

const ONBOARDING_SPORTS = [
  "Cricket Turf", "Badminton", "Football", "Pickleball", "Table Tennis", "Carrom", "Skating", "Volleyball",
] as const;

async function saveOwnerOnboardingSports(actorId: string, sportNames: string[]) {
  const unique = [...new Set(sportNames)];
  if (!unique.length) throw new Error("Select at least one sport");
  for (const name of unique) {
    if (!ONBOARDING_SPORTS.includes(name as typeof ONBOARDING_SPORTS[number])) {
      throw new Error(`Unsupported sport: ${name}`);
    }
  }

  const { data: membership } = await db.from("organization_memberships")
    .select("organization_id")
    .eq("user_id", actorId)
    .eq("role", "owner")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership?.organization_id) throw new Error("Owner arena was not found");

  const organizationId = membership.organization_id;

  const { data: existingSports } = await db.from("sports")
    .select("id,name,default_hourly_rate,active")
    .eq("organization_id", organizationId);
  const selected = new Set(unique);
  for (const row of existingSports ?? []) {
    if (!selected.has(row.name) && row.active) {
      await db.from("sports").update({ active: false }).eq("id", row.id);
    }
  }

  for (const name of unique) {
    const existing = (existingSports ?? []).find((row) => row.name === name);
    if (existing) {
      await db.from("sports").update({ active: true }).eq("id", existing.id);
    } else {
      const { error } = await db.from("sports").insert({
        organization_id: organizationId,
        name,
        default_hourly_rate: 0,
        active: true,
      });
      if (error) throw new Error(error.message);
    }
  }

  return unique;
}

/** Public: does this email already have an Auth account? */
app.post("/auth/email-status", express.json(), async (req, res) => {
  try {
    if (!allowAuthAttempt(`email-status:${clientIp(req)}`, 30, 60_000)) {
      return res.status(429).json({ error: "Too many attempts. Wait a minute and try again." });
    }
    const email = z.string().trim().email().max(254).parse(req.body?.email).toLowerCase();
    const user = await findAuthUserByEmail(email);
    // Avoid leaking arena/password details to anonymous callers.
    if (!user) return res.json({ exists: false });

    return res.json({
      exists: true,
      hasPassword: user.user_metadata?.password_set === true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a valid email" });
    return res.status(500).json({ error: "Unable to check email" });
  }
});

/** Creates auth user + profile + arena. Email must be confirmed before password login. */
app.post("/auth/register", express.json(), async (req, res) => {
  try {
    if (!allowAuthAttempt(`register:${clientIp(req)}`, 8, 60_000)) {
      return res.status(429).json({ error: "Too many signup attempts. Wait a minute and try again." });
    }
    const input = z.object({
      arenaName: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(254),
      password: z.string().min(8).max(72),
    }).parse(req.body);

    const email = input.email.toLowerCase();

    // Controlled signup: reject if Auth user already exists.
    const existing = await findAuthUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists. Please log in instead.",
      });
    }

    // Never auto-confirm — attacker must not own arbitrary emails without inbox proof.
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: false,
      user_metadata: { full_name: input.arenaName, arena_name: input.arenaName, password_set: true },
      app_metadata: { sportzarena_owner: true },
    });

    if (createError || !created.user) {
      const message = createError?.message ?? "Unable to create account";
      const alreadyExists = /already|registered|exists/i.test(message);
      return res.status(alreadyExists ? 409 : 400).json({
        error: alreadyExists
          ? "An account with this email already exists. Please log in instead."
          : message,
      });
    }

    // Trigger should create profiles; ensure row exists if trigger was delayed.
    await db.from("profiles").upsert({
      id: created.user.id,
      full_name: input.arenaName,
    }, { onConflict: "id" });

    const { data: provisioned, error: provisionError } = await (async () => {
      try {
        return { data: await provisionOwnerArena({
          actorId: created.user.id,
          arenaName: input.arenaName,
        }), error: null as Error | null };
      } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error("Arena setup failed") };
      }
    })();

    if (provisionError || !provisioned) {
      // Do not leave an Auth user without an arena.
      await db.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: provisionError?.message ?? "Account created but arena setup failed. Please try again." });
    }

    // Trigger Supabase confirmation email (via Resend SMTP) — password login blocked until confirmed.
    await db.auth.admin.generateLink({
      type: "signup",
      email,
      options: { redirectTo: `${appOrigin}/auth/callback` },
    }).catch((err) => console.warn("Confirmation email generateLink failed:", err));

    return res.status(201).json({
      email,
      userId: created.user.id,
      needsEmailConfirmation: true,
      organization: provisioned.organization,
      subscription: provisioned.subscription,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid signup details" });
    }
    return res.status(500).json({ error: error instanceof Error ? error.message : "Signup failed" });
  }
});

app.get("/me/bootstrap", authenticate, async (req: AuthedRequest, res) => {
  const [profileResult, membershipsResult] = await Promise.all([
    db.from("profiles").select("id,full_name,phone").eq("id", req.user!.id).maybeSingle(),
    db.from("organization_memberships")
      .select("organization_id,role,organizations(id,name,address,pincode,contact_phone,timezone,currency_code,arena_subscriptions(plan_id,status,trial_ends_at,current_period_ends_at))")
      .eq("user_id", req.user!.id).eq("active", true),
  ]);
  if (profileResult.error || membershipsResult.error) return res.status(500).json({ error: "Unable to load account" });

  const memberships = membershipsResult.data ?? [];
  const firstOrg = memberships[0] as {
    organization_id?: string;
    organizations?: { id?: string } | { id?: string }[] | null;
  } | undefined;
  const orgRelation = firstOrg?.organizations;
  const organizationId = firstOrg?.organization_id
    ?? (Array.isArray(orgRelation) ? orgRelation[0]?.id : orgRelation?.id)
    ?? null;

  // Always load subscription from the table directly (nested embed can be object or array).
  let subscription: { plan_id: string; status: string; trial_ends_at: string | null; current_period_ends_at: string | null } | null = null;
  let sportNames: string[] = [];
  if (organizationId) {
    const [{ data: subRow }, { data: sportRows }] = await Promise.all([
      db.from("arena_subscriptions")
        .select("plan_id,status,trial_ends_at,current_period_ends_at")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      db.from("sports")
        .select("name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
    ]);
    subscription = subRow;
    sportNames = (sportRows ?? []).map((row) => row.name);
  }

  res.json({
    profile: profileResult.data,
    memberships,
    role: (memberships[0] as { role?: string } | undefined)?.role ?? null,
    sports: sportNames,
    subscription,
  });
});
app.post("/onboarding/arena", express.json(), authenticate, async (req: AuthedRequest, res) => {
  try {
    const input = z.object({
      arenaName: z.string().trim().min(2).max(120),
      address: z.string().trim().max(500).optional().default(""),
      contactPhone: z.string().trim().max(40).optional().default(""),
      timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
      currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/).default("INR"),
    }).parse(req.body);
    const data = await provisionOwnerArena({
      actorId: req.user!.id,
      arenaName: input.arenaName,
      address: input.address,
      contactPhone: input.contactPhone,
      timezone: input.timezone,
      currencyCode: input.currencyCode.toUpperCase(),
    });
    res.status(201).json(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid arena details" });
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to create arena" });
  }
});
app.post("/onboarding/sports", express.json(), authenticate, async (req: AuthedRequest, res) => {
  try {
    const input = z.object({
      sports: z.array(z.enum(["Cricket Turf", "Badminton", "Football", "Pickleball", "Table Tennis", "Carrom", "Skating", "Volleyball"])).min(1).max(8),
    }).parse(req.body);
    const sports = await saveOwnerOnboardingSports(req.user!.id, [...new Set(input.sports)]);
    res.status(201).json({ sports });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid sports selection" });
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : "Unable to save sports" });
  }
});
app.get("/subscriptions/status", authenticate, membership, async (req: AuthedRequest, res) => {
  const { data, error } = await db.from("arena_subscriptions")
    .select("plan_id,status,trial_ends_at,current_period_ends_at")
    .eq("organization_id", req.organizationId).maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data ?? { status: "none" });
});
app.get("/reports/sessions.xlsx", authenticate, membership, requireEntitlement, requireRole("owner"), async (req: AuthedRequest, res) => {
  const { from = new Date().toISOString().slice(0, 10), to = new Date().toISOString() } = req.query as Record<string, string>;
  const { data, error } = await db.from("sessions").select("guest_name,booking_source,starts_at,ends_at,total_amount").eq("organization_id", req.organizationId).gte("starts_at", from).lte("starts_at", to).order("starts_at");
  if (error) return res.status(400).json({ error: error.message });
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Sessions");
  sheet.columns = [{ header: "Start", key: "starts_at", width: 23 }, { header: "Customer", key: "guest_name", width: 24 }, { header: "Source", key: "booking_source", width: 18 }, { header: "Amount", key: "total_amount", width: 14 }];
  sheet.addRows(data ?? []); res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); res.setHeader("Content-Disposition", "attachment; filename=arena-report.xlsx");
  await book.xlsx.write(res); res.end();
});
app.get("/invoices/:invoiceId.pdf", authenticate, membership, requireEntitlement, async (req: AuthedRequest, res) => {
  const { data: invoice, error } = await db.from("invoices").select("invoice_number,issued_at,total_amount,sessions(guest_name,booking_source,starts_at,ends_at,courts(name),sports(name)),organizations(name,address)").eq("id", req.params.invoiceId).eq("organization_id", req.organizationId).single();
  if (error || !invoice) return res.sendStatus(404);
  const organization = Array.isArray(invoice.organizations) ? invoice.organizations[0] : invoice.organizations;
  const session = Array.isArray(invoice.sessions) ? invoice.sessions[0] : invoice.sessions;
  const pdf = new PDFDocument({ margin: 48 }); res.setHeader("Content-Type", "application/pdf"); pdf.pipe(res);
  const details = session as { guest_name?: string; booking_source?: string; sports?: { name?: string } | { name?: string }[]; courts?: { name?: string } | { name?: string }[] } | null;
  const sport = Array.isArray(details?.sports) ? details?.sports[0]?.name : details?.sports?.name;
  const court = Array.isArray(details?.courts) ? details?.courts[0]?.name : details?.courts?.name;
  pdf.fontSize(22).text(organization?.name ?? "Sports Arena").fontSize(10).text(organization?.address ?? "").moveDown().fontSize(18).text(`Invoice ${invoice.invoice_number}`).fontSize(11).text(`Issued: ${new Date(invoice.issued_at).toLocaleString("en-IN")}`).moveDown().text(`Customer: ${details?.guest_name ?? "Walk-in customer"}`).text(`Source: ${details?.booking_source ?? ""}`).text(`Sport / court: ${sport ?? ""} / ${court ?? ""}`).moveDown().fontSize(16).text(`Total: ₹${invoice.total_amount}`); pdf.end();
});

app.get("/subscriptions/plans", async (_req, res) => {
  const { data, error } = await db.from("subscription_plans")
    .select("id,name,monthly_price,active")
    .eq("active", true)
    .order("monthly_price");
  if (error) return res.status(400).json({ error: error.message });
  res.json({
    provider: "cashfree",
    mode: payMode,
    plans: (data ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: Number(plan.monthly_price),
    })),
  });
});

app.get("/subscriptions/config", (_req, res) => {
  res.json({
    provider: "cashfree",
    mode: payMode,
    currency: "INR",
    plan: { id: "basic", name: "Starter", monthlyPrice: 499 },
  });
});

app.post("/subscriptions/checkout", express.json(), authenticate, membership, requireRole("owner"), async (req: AuthedRequest, res) => {
  try {
    const input = z.object({ planId: z.string().min(1) }).parse(req.body);
    const { data: plan } = await db.from("subscription_plans")
      .select("id,name,monthly_price,active")
      .eq("id", input.planId)
      .eq("active", true)
      .single();
    if (!plan) return res.status(422).json({ error: "Subscription plan is unavailable" });

    const amountRupees = Number(plan.monthly_price);
    if (!Number.isFinite(amountRupees) || amountRupees < 1) {
      return res.status(422).json({ error: "Invalid plan price" });
    }

    const { data: org } = await db.from("organizations")
      .select("contact_phone,name")
      .eq("id", req.organizationId)
      .maybeSingle();

    const phoneDigits = String(org?.contact_phone ?? "").replace(/\D/g, "");
    const customerPhone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : "9999999999";
    const orderId = `sa_${String(req.organizationId).replace(/-/g, "").slice(0, 12)}_${Date.now()}`;
    // Prefer the browser Origin (Vercel URL) so mobile return works; fall back to APP_URL.
    const requestOrigin = String(req.get("origin") || "").replace(/\/$/, "");
    const safeOrigin = requestOrigin && (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin))
      ? requestOrigin
      : appOrigin.replace(/\/$/, "");
    const returnUrl = `${safeOrigin}/app?cf_order={order_id}`;

    const order = await createCashfreeOrder(cashfreeConfig, {
      orderId,
      amount: amountRupees,
      customerId: String(req.organizationId).replace(/-/g, "").slice(0, 50),
      customerEmail: req.user?.email || "owner@sportzarena.app",
      customerPhone,
      returnUrl,
      tags: {
        organization_id: String(req.organizationId),
        plan_id: plan.id,
        product: "SportzArena",
      },
    });

    const { data: existing } = await db.from("arena_subscriptions")
      .select("status,trial_ends_at")
      .eq("organization_id", req.organizationId)
      .maybeSingle();

    const baseRow = {
      organization_id: req.organizationId,
      plan_id: plan.id,
      status: existing?.status && existing.status !== "created" ? existing.status : "trialing",
      trial_ends_at: existing?.trial_ends_at ?? null,
      updated_at: new Date().toISOString(),
    };

    // Cashfree only — never touch razorpay_order_id (may be dropped on this DB).
    let upsertError = (await db.from("arena_subscriptions").upsert({
      ...baseRow,
      cashfree_order_id: order.order_id,
    }, { onConflict: "organization_id" })).error;

    if (upsertError && /cashfree_order_id/i.test(upsertError.message)) {
      upsertError = (await db.from("arena_subscriptions").upsert({
        ...baseRow,
        razorpay_subscription_id: order.order_id,
      }, { onConflict: "organization_id" })).error;
    }
    if (upsertError) {
      console.error("subscription checkout upsert failed:", upsertError.message);
      return res.status(500).json({
        error: upsertError.message.includes("cashfree_order_id")
          ? "Missing DB column cashfree_order_id. Run the Cashfree migration SQL in Supabase, then reload the API schema cache."
          : `Unable to save payment order: ${upsertError.message}`,
      });
    }

    res.status(201).json({
      provider: "cashfree",
      orderId: order.order_id,
      paymentSessionId: order.payment_session_id,
      amount: Math.round(amountRupees * 100),
      amountRupees,
      currency: "INR",
      mode: payMode,
      env: cashfreeEnv,
      planId: plan.id,
      planName: plan.name,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to start checkout" });
  }
});

app.post("/subscriptions/verify", express.json(), authenticate, membership, requireRole("owner"), async (req: AuthedRequest, res) => {
  try {
    const input = z.object({
      orderId: z.string().min(1),
      paymentId: z.string().optional(),
    }).parse(req.body);

    const orgKey = String(req.organizationId ?? "").replace(/-/g, "");
    const orderBelongsToArena = input.orderId.includes(orgKey.slice(0, 12));

    let storedOrderId: string | null = null;
    let orderColumn: "cashfree_order_id" | "razorpay_subscription_id" = "cashfree_order_id";

    const primary = await db.from("arena_subscriptions")
      .select("cashfree_order_id,razorpay_subscription_id,plan_id,status")
      .eq("organization_id", req.organizationId)
      .maybeSingle();

    if (primary.error && /cashfree_order_id/i.test(primary.error.message)) {
      const legacy = await db.from("arena_subscriptions")
        .select("razorpay_subscription_id,plan_id,status")
        .eq("organization_id", req.organizationId)
        .maybeSingle();
      if (legacy.error) return res.status(500).json({ error: legacy.error.message });
      storedOrderId = legacy.data?.razorpay_subscription_id ?? null;
      orderColumn = "razorpay_subscription_id";
    } else if (primary.error) {
      return res.status(500).json({ error: primary.error.message });
    } else {
      storedOrderId = primary.data?.cashfree_order_id ?? primary.data?.razorpay_subscription_id ?? null;
      orderColumn = primary.data?.cashfree_order_id ? "cashfree_order_id" : "razorpay_subscription_id";
    }

    const orderMatches = storedOrderId === input.orderId || orderBelongsToArena;
    if (!orderMatches) {
      return res.status(404).json({
        error: "Payment order was not found for this arena",
        detail: storedOrderId ? "order_mismatch" : "order_missing",
      });
    }

    const order = await getCashfreeOrder(cashfreeConfig, input.orderId);
    const cashfreeStatus = String(order.order_status || "UNKNOWN").toUpperCase() || "UNKNOWN";
    const paid = ["PAID", "SUCCESS"].includes(cashfreeStatus);
    if (!paid) {
      const payments = await getCashfreePayments(cashfreeConfig, input.orderId).catch(() => []);
      const paymentPaid = Array.isArray(payments) && payments.some((p) =>
        ["SUCCESS", "PAID"].includes(String(p.payment_status || "").toUpperCase())
      );
      if (!paymentPaid) {
        const statusHint = cashfreeStatus === "ACTIVE"
          ? "ACTIVE means the order is created but not paid yet."
          : cashfreeStatus === "PENDING"
            ? "PENDING means Cashfree is still processing the payment."
            : cashfreeStatus === "EXPIRED"
              ? "EXPIRED means this checkout timed out — start a new payment."
              : cashfreeStatus === "FAILED" || cashfreeStatus === "CANCELLED"
                ? "Payment did not succeed — try again."
                : "Finish payment in Cashfree, then check status again.";
        return res.status(400).json({
          error: `Payment not completed yet (status: ${cashfreeStatus}). ${statusHint}`,
          cashfreeStatus,
        });
      }
    }

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    const patch: Record<string, string> = {
      status: "active",
      current_period_ends_at: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
      [orderColumn]: input.orderId,
    };

    let { error: activateError } = await db.from("arena_subscriptions")
      .update(patch)
      .eq("organization_id", req.organizationId);
    if (activateError && /cashfree_order_id/i.test(activateError.message)) {
      delete patch.cashfree_order_id;
      patch.razorpay_subscription_id = input.orderId;
      ({ error: activateError } = await db.from("arena_subscriptions")
        .update(patch)
        .eq("organization_id", req.organizationId));
    }
    if (activateError) {
      return res.status(500).json({ error: activateError.message });
    }

    res.status(200).json({
      verified: true,
      status: "active",
      periodEndsAt: periodEnd.toISOString(),
      paymentId: input.paymentId ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid payload" });
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to verify payment" });
  }
});

app.post("/webhooks/cashfree", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""), "utf8");
    const webhookSecret = env.CASHFREE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const timestamp = req.header("x-webhook-timestamp") ?? "";
      const signature = req.header("x-webhook-signature") ?? "";
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(timestamp + rawBody.toString("utf8"))
        .digest("base64");
      const received = Buffer.from(signature);
      const signed = Buffer.from(expected);
      if (!timestamp || received.length !== signed.length || !crypto.timingSafeEqual(received, signed)) {
        return res.sendStatus(400);
      }
    } else if (env.CASHFREE_ENV === "production") {
      console.error("CASHFREE_WEBHOOK_SECRET is required in production");
      return res.sendStatus(500);
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      type?: string;
      data?: {
        order?: { order_id?: string };
        payment?: { payment_status?: string };
      };
    };
    const orderId = String(payload.data?.order?.order_id ?? "").trim();
    const paymentStatus = String(payload.data?.payment?.payment_status ?? "").toUpperCase();
    const eventType = String(payload.type ?? "").toUpperCase();
    const successHint = paymentStatus === "SUCCESS"
      || eventType.includes("SUCCESS")
      || eventType.includes("PAID");
    if (!orderId || !successHint) return res.sendStatus(200);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(orderId)) return res.sendStatus(200);

    // Never trust webhook body alone — confirm payment with Cashfree API.
    const order = await getCashfreeOrder(cashfreeConfig, orderId);
    const orderPaid = ["PAID", "SUCCESS"].includes(String(order.order_status ?? "").toUpperCase());
    if (!orderPaid) {
      const payments = await getCashfreePayments(cashfreeConfig, orderId).catch(() => []);
      const paymentOk = payments.some((p) => ["SUCCESS", "PAID"].includes(String(p.payment_status ?? "").toUpperCase()));
      if (!paymentOk) return res.sendStatus(200);
    }

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    // Activate only by known order id — never by attacker-controlled organization_id tags.
    const { error } = await db.from("arena_subscriptions").update({
      status: "active",
      current_period_ends_at: periodEnd.toISOString(),
      cashfree_order_id: orderId,
    }).eq("cashfree_order_id", orderId);
    if (error && /cashfree_order_id/i.test(error.message)) {
      await db.from("arena_subscriptions").update({
        status: "active",
        current_period_ends_at: periodEnd.toISOString(),
      }).eq("razorpay_subscription_id", orderId);
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Cashfree webhook error:", error);
    res.sendStatus(500);
  }
});

app.post("/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res) => {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return res.sendStatus(404);
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex");
  const received = Buffer.from(req.header("x-razorpay-signature") ?? "");
  const signed = Buffer.from(expected);
  if (received.length !== signed.length || !crypto.timingSafeEqual(received, signed)) return res.sendStatus(400);
  const event = JSON.parse(req.body.toString()) as { payload: { subscription?: { entity?: { id: string; status: string; current_end: number } } } };
  const eventId = req.header("x-razorpay-event-id") ?? crypto.createHash("sha256").update(req.body).digest("hex");
  const { error } = await db.from("razorpay_webhook_events").insert({ event_id: eventId, payload: event });
  if (error?.code === "23505") return res.sendStatus(200); if (error) return res.status(500).json({ error: "Webhook persistence failed" });
  const subscription = event.payload.subscription?.entity;
  if (subscription) await db.from("arena_subscriptions").update({ status: subscription.status, current_period_ends_at: new Date(subscription.current_end * 1000).toISOString() }).eq("razorpay_subscription_id", subscription.id);
  res.sendStatus(200);
});
registerOpsRoutes(app, db, authenticate, membership, requireEntitlement);

app.listen(Number(env.PORT), "0.0.0.0", () => console.log(`Arena API listening on 0.0.0.0:${env.PORT} · payments=${payMode} (cashfree)`));
