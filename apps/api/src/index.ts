import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import express, { type NextFunction, type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import Razorpay from "razorpay";
import { createClient, type User } from "@supabase/supabase-js";
import { z } from "zod";
import { registerOpsRoutes } from "./opsRoutes.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const env = z.object({
  PORT: z.coerce.number().default(4000),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),
  /** Optional override: "test" | "live". Defaults from key prefix (rzp_live_ → live). */
  RAZORPAY_MODE: z.enum(["test", "live"]).optional(),
}).parse(process.env);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
const razorpayMode: "test" | "live" = env.RAZORPAY_MODE
  ?? (env.RAZORPAY_KEY_ID.startsWith("rzp_live_") ? "live" : "test");
const app = express();
const allowedOrigins = (process.env.APP_URL ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Allow local web + LAN / tunnel mobile testing without throwing (throws crashed the API).
    if (
      !origin
      || allowedOrigins.includes(origin)
      || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(origin)
      || /\.(loca\.lt|ngrok-free\.app|ngrok\.io|exp\.direct|trycloudflare\.com)$/i.test(origin)
      || /^https?:\/\/.*\.(loca\.lt|trycloudflare\.com)$/i.test(origin)
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));

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

/** Public: does this email already have an Auth account? */
app.post("/auth/email-status", express.json(), async (req, res) => {
  try {
    const email = z.string().trim().email().max(254).parse(req.body?.email).toLowerCase();
    const user = await findAuthUserByEmail(email);
    if (!user) return res.json({ exists: false, hasArena: false, hasPassword: false });

    const { data: membership } = await db.from("organization_memberships")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    return res.json({
      exists: true,
      hasArena: Boolean(membership?.organization_id),
      hasPassword: user.user_metadata?.password_set === true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a valid email" });
    return res.status(500).json({ error: "Unable to check email" });
  }
});

/** Creates auth user + profile + arena in one step (avoids browser signup email rate limits). */
app.post("/auth/register", express.json(), async (req, res) => {
  try {
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

    const { data: created, error: createError } = await db.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
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

    const { data: provisioned, error: provisionError } = await db.rpc("provision_owner_arena", {
      p_actor_id: created.user.id,
      p_arena_name: input.arenaName,
      p_address: "",
      p_contact_phone: "",
      p_timezone: "Asia/Kolkata",
      p_currency_code: "INR",
    });

    if (provisionError || !provisioned) {
      // Do not leave a login-capable user without an arena.
      await db.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: provisionError?.message ?? "Account created but arena setup failed. Please try again." });
    }

    return res.status(201).json({
      email,
      userId: created.user.id,
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
  const input = z.object({
    arenaName: z.string().trim().min(2).max(120),
    address: z.string().trim().max(500).optional().default(""),
    contactPhone: z.string().trim().max(40).optional().default(""),
    timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
    currencyCode: z.string().trim().regex(/^[A-Za-z]{3}$/).default("INR"),
  }).parse(req.body);
  const { data, error } = await db.rpc("provision_owner_arena", {
    p_actor_id: req.user!.id, p_arena_name: input.arenaName, p_address: input.address,
    p_contact_phone: input.contactPhone, p_timezone: input.timezone,
    p_currency_code: input.currencyCode.toUpperCase(),
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});
app.post("/onboarding/sports", express.json(), authenticate, async (req: AuthedRequest, res) => {
  const input = z.object({
    sports: z.array(z.enum(["Cricket Turf", "Badminton", "Football", "Pickleball", "Table Tennis", "Carrom", "Zumba Class", "Tennis"])).min(1).max(8),
  }).parse(req.body);
  const { data, error } = await db.rpc("save_owner_onboarding_sports", {
    p_actor_id: req.user!.id, p_sport_names: [...new Set(input.sports)],
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ sports: data });
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
    mode: razorpayMode,
    plans: (data ?? []).map((plan) => ({
      id: plan.id,
      name: plan.name,
      monthlyPrice: Number(plan.monthly_price),
    })),
  });
});

app.get("/subscriptions/config", (_req, res) => {
  res.json({
    mode: razorpayMode,
    keyId: env.RAZORPAY_KEY_ID,
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

    const amountPaise = Math.round(Number(plan.monthly_price) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 100) {
      return res.status(422).json({ error: "Invalid plan price" });
    }

    // One-time order checkout works with Razorpay test keys (no subscription plan IDs required).
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `sa_${String(req.organizationId).slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: {
        organization_id: String(req.organizationId),
        plan_id: plan.id,
        product: "SportzArena",
      },
    });

    // Keep trial/active status — only attach the pending order id (do not wipe entitlement).
    const { data: existing } = await db.from("arena_subscriptions")
      .select("status,trial_ends_at")
      .eq("organization_id", req.organizationId)
      .maybeSingle();
    await db.from("arena_subscriptions").upsert({
      organization_id: req.organizationId,
      plan_id: plan.id,
      razorpay_order_id: order.id,
      status: existing?.status && existing.status !== "created" ? existing.status : "trialing",
      trial_ends_at: existing?.trial_ends_at ?? null,
    }, { onConflict: "organization_id" });

    res.status(201).json({
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      keyId: env.RAZORPAY_KEY_ID,
      mode: razorpayMode,
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
      paymentId: z.string().min(1),
      orderId: z.string().min(1),
      signature: z.string().min(1),
    }).parse(req.body);

    const { data: record, error } = await db.from("arena_subscriptions")
      .select("razorpay_order_id,plan_id")
      .eq("organization_id", req.organizationId)
      .eq("razorpay_order_id", input.orderId)
      .maybeSingle();
    if (error || !record?.razorpay_order_id) {
      return res.status(404).json({ error: "Payment order was not found for this arena" });
    }

    const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
      .update(`${input.orderId}|${input.paymentId}`)
      .digest("hex");
    const supplied = Buffer.from(input.signature);
    const calculated = Buffer.from(expected);
    if (supplied.length !== calculated.length || !crypto.timingSafeEqual(supplied, calculated)) {
      return res.status(400).json({ error: "Invalid Razorpay payment signature" });
    }

    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);
    await db.from("arena_subscriptions").update({
      status: "active",
      current_period_ends_at: periodEnd.toISOString(),
    }).eq("organization_id", req.organizationId);

    res.status(200).json({ verified: true, status: "active", periodEndsAt: periodEnd.toISOString() });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid payload" });
    res.status(500).json({ error: error instanceof Error ? error.message : "Unable to verify payment" });
  }
});

app.post("/webhooks/razorpay", express.raw({ type: "application/json" }), async (req, res) => {
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(req.body).digest("hex"); const received = Buffer.from(req.header("x-razorpay-signature") ?? ""); const signed = Buffer.from(expected);
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

app.listen(Number(env.PORT), "0.0.0.0", () => console.log(`Arena API listening on 0.0.0.0:${env.PORT}`));
