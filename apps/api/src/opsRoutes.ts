import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { z } from "zod";

type AuthedRequest = Request & { user?: User; organizationId?: string; role?: "owner" | "manager" | "cashier" };

const cartItemSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  price: z.number().min(0),
  quantity: z.number().int().positive(),
  category: z.enum(["EQUIPMENT", "BEVERAGE"]).default("EQUIPMENT"),
});

async function ensureVenue(db: SupabaseClient, organizationId: string) {
  const { data: existing } = await db.from("venues").select("id").eq("organization_id", organizationId).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await db.from("venues").insert({ organization_id: organizationId, name: "Main Venue" }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Unable to create venue");
  return data.id as string;
}

async function ensureDefaultCourts(db: SupabaseClient, organizationId: string, venueId: string) {
  const { data: sports } = await db.from("sports").select("id,name").eq("organization_id", organizationId).eq("active", true);
  for (const sport of sports ?? []) {
    const { count } = await db.from("courts").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("sport_id", sport.id);
    if ((count ?? 0) > 0) continue;
    await db.from("courts").insert({
      organization_id: organizationId,
      venue_id: venueId,
      sport_id: sport.id,
      name: "Court 1",
      active: true,
    });
  }
}

async function ensureInventorySeed(db: SupabaseClient, organizationId: string) {
  const { count } = await db.from("inventory_items").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
  if ((count ?? 0) > 0) return;
  // Seed catalog names only — price/stock stay 0 until the owner sets them.
  await db.from("inventory_items").insert([
    { organization_id: organizationId, name: "Badminton Racket", category: "EQUIPMENT", price: 0, stock: 0 },
    { organization_id: organizationId, name: "Shuttlecock (Plastic)", category: "EQUIPMENT", price: 0, stock: 0 },
    { organization_id: organizationId, name: "Water Bottle (500ml)", category: "BEVERAGE", price: 0, stock: 0 },
    { organization_id: organizationId, name: "Energy Drink", category: "BEVERAGE", price: 0, stock: 0 },
  ]);
}

type Middleware = (req: AuthedRequest, res: Response, next: NextFunction) => unknown;

export function registerOpsRoutes(
  app: Express,
  db: SupabaseClient,
  authenticate: Middleware,
  membership: Middleware,
  requireEntitlement?: Middleware,
) {
  const json = express.json();
  // JWT + org membership + active trial/subscription required for ops writes/reads.
  const withOrg: Middleware[] = requireEntitlement
    ? [authenticate, membership, requireEntitlement]
    : [authenticate, membership];

  app.get("/ops/bootstrap", ...withOrg, async (req: AuthedRequest, res) => {
    try {
      const orgId = req.organizationId!;
      const venueId = await ensureVenue(db, orgId);
      await ensureDefaultCourts(db, orgId, venueId);
      await ensureInventorySeed(db, orgId);

      const [{ data: sports }, { data: inventory }] = await Promise.all([
        db.from("sports").select("id,name,default_hourly_rate,active,courts(id,name,active)").eq("organization_id", orgId).eq("active", true).order("name"),
        db.from("inventory_items").select("id,name,category,price,stock").eq("organization_id", orgId).order("name"),
      ]);

      res.json({
        sports: (sports ?? []).map((sport) => ({
          id: sport.id,
          name: sport.name,
          pricePerHour: Number(sport.default_hourly_rate),
          courts: ((sport.courts as Array<{ id: string; name: string; active: boolean }> | null) ?? [])
            .filter((court) => court.active)
            .map((court) => ({ id: court.id, name: court.name })),
        })),
        inventory: (inventory ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          price: Number(item.price),
          stock: item.stock,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Bootstrap failed" });
    }
  });

  app.get("/ops/inventory", ...withOrg, async (req: AuthedRequest, res) => {
    const { data, error } = await db.from("inventory_items").select("id,name,category,price,stock").eq("organization_id", req.organizationId!).order("name");
    if (error) return res.status(400).json({ error: error.message });
    res.json({ items: data ?? [] });
  });

  app.post("/ops/inventory", json, ...withOrg, async (req: AuthedRequest, res) => {
    const input = z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(120),
      category: z.enum(["EQUIPMENT", "BEVERAGE"]),
      price: z.number().min(0),
      stock: z.number().int().min(0),
    }).parse(req.body);
    if (input.id) {
      const { data, error } = await db.from("inventory_items").update({
        name: input.name, category: input.category, price: input.price, stock: input.stock,
      }).eq("id", input.id).eq("organization_id", req.organizationId!).select("id,name,category,price,stock").single();
      if (error) return res.status(400).json({ error: error.message });
      return res.json({ item: data });
    }
    const { data, error } = await db.from("inventory_items").insert({
      organization_id: req.organizationId!, name: input.name, category: input.category, price: input.price, stock: input.stock,
    }).select("id,name,category,price,stock").single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ item: data });
  });

  app.delete("/ops/inventory/:id", ...withOrg, async (req: AuthedRequest, res) => {
    const { error } = await db.from("inventory_items").delete().eq("id", req.params.id).eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.patch("/ops/sports/:id", json, ...withOrg, async (req: AuthedRequest, res) => {
    const input = z.object({ pricePerHour: z.number().min(0) }).parse(req.body);
    const { data, error } = await db.from("sports").update({ default_hourly_rate: input.pricePerHour })
      .eq("id", req.params.id).eq("organization_id", req.organizationId!).select("id,name,default_hourly_rate").single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ sport: data });
  });

  app.post("/ops/courts", json, ...withOrg, async (req: AuthedRequest, res) => {
    const input = z.object({ sportId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(req.body);
    const venueId = await ensureVenue(db, req.organizationId!);
    const { data, error } = await db.from("courts").insert({
      organization_id: req.organizationId!, venue_id: venueId, sport_id: input.sportId, name: input.name, active: true,
    }).select("id,name,sport_id").single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ court: data });
  });

  app.delete("/ops/courts/:id", ...withOrg, async (req: AuthedRequest, res) => {
    const { error } = await db.from("courts").delete().eq("id", req.params.id).eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  /** Sales Report list — owner only. Staff may still POST bookings. */
  app.get("/ops/transactions", ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Sales Report is available to the owner only" });
    const { data, error } = await db.from("pos_transactions")
      .select("*, pos_transaction_items(*), pos_transaction_courts(*)")
      .eq("organization_id", req.organizationId!)
      .order("bill_number", { ascending: false })
      .limit(300);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ transactions: data ?? [] });
  });

  app.post("/ops/transactions", json, ...withOrg, async (req: AuthedRequest, res) => {
    try {
      const input = z.object({
        customerName: z.string().trim().min(1),
        customerMobile: z.string().trim().default(""),
        sportId: z.string().uuid().nullable().optional(),
        sportName: z.string().optional(),
        courtNames: z.array(z.string()).default([]),
        courtIds: z.array(z.string().uuid()).default([]),
        bookingDate: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        durationHours: z.number().min(0).default(0),
        bookingAmount: z.number().min(0).default(0),
        items: z.array(cartItemSchema).default([]),
        discount: z.number().min(0).default(0),
        advance: z.number().min(0).default(0),
        paymentMode: z.enum(["CASH", "ONLINE", "SPLIT"]),
        splitCash: z.number().min(0).default(0),
        splitOnline: z.number().min(0).default(0),
        bookingMethod: z.enum(["WALK_IN", "PLAYO", "TURF_TOWN", "OFFLINE"]).default("WALK_IN"),
      }).parse(req.body);

      if (input.customerMobile) {
        const digits = input.customerMobile.replace(/\D/g, "");
        if (digits.length !== 10) {
          return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
        }
      }

      const orgId = req.organizationId!;
      const itemsTotal = input.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const grandTotal = Math.max(0, input.bookingAmount + itemsTotal - input.discount - input.advance);

      const { data: latest } = await db.from("pos_transactions").select("bill_number").eq("organization_id", orgId).order("bill_number", { ascending: false }).limit(1);
      const next = (latest?.[0]?.bill_number ?? 0) + 1;
      if (next > 999999) return res.status(400).json({ error: "Bill number limit reached for this arena" });
      const billNumber = next;

      const { data: tx, error } = await db.from("pos_transactions").insert({
        organization_id: orgId,
        bill_number: billNumber,
        customer_name: input.customerName,
        customer_mobile: input.customerMobile,
        sport_id: input.sportId ?? null,
        sport_name: input.sportName ?? null,
        booking_date: input.bookingDate || null,
        start_time: input.startTime ?? null,
        end_time: input.endTime ?? null,
        duration_hours: input.durationHours,
        booking_amount: input.bookingAmount,
        items_total: itemsTotal,
        discount: input.discount,
        advance: input.advance,
        grand_total: grandTotal,
        payment_mode: input.paymentMode,
        split_cash: input.splitCash,
        split_online: input.splitOnline,
        booking_method: input.bookingMethod,
        created_by: req.user!.id,
      }).select("*").single();
      if (error || !tx) return res.status(400).json({ error: error?.message ?? "Unable to save bill" });

      if (input.items.length) {
        await db.from("pos_transaction_items").insert(input.items.map((item) => ({
          organization_id: orgId,
          transaction_id: tx.id,
          item_id: item.itemId ?? null,
          item_name: item.name,
          quantity: item.quantity,
          price_at_sale: item.price,
          category: item.category,
        })));
        for (const item of input.items) {
          if (!item.itemId) continue;
          const { data: current } = await db.from("inventory_items").select("stock").eq("id", item.itemId).eq("organization_id", orgId).maybeSingle();
          if (!current) continue;
          await db.from("inventory_items").update({ stock: Math.max(0, current.stock - item.quantity) }).eq("id", item.itemId);
        }
      }

      if (input.courtNames.length) {
        await db.from("pos_transaction_courts").insert(input.courtNames.map((name, index) => ({
          organization_id: orgId,
          transaction_id: tx.id,
          court_id: input.courtIds[index] ?? null,
          court_name: name,
        })));
      }

      res.status(201).json({ transaction: tx });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message ?? "Invalid bill" });
      res.status(500).json({ error: error instanceof Error ? error.message : "Save failed" });
    }
  });

  app.delete("/ops/transactions/:id", ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the owner can delete sales records" });
    const { error } = await db.from("pos_transactions").delete().eq("id", req.params.id).eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.get("/ops/coaching", ...withOrg, async (req: AuthedRequest, res) => {
    const { data, error } = await db.from("coaching_registrations").select("*").eq("organization_id", req.organizationId!).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ entries: data ?? [] });
  });

  app.post("/ops/coaching", json, ...withOrg, async (req: AuthedRequest, res) => {
    const input = z.object({
      parentName: z.string().trim().min(1),
      childName: z.string().trim().min(1),
      age: z.number().int().min(0).max(100),
      mobileNumber: z.string().trim().default(""),
      level: z.enum(["Beginner", "Intermediate", "Advance"]).default("Beginner"),
      courtNumber: z.string().default(""),
      startTime: z.string().default(""),
      endTime: z.string().default(""),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      amount: z.number().positive("Amount must be greater than 0"),
      discount: z.number().min(0).default(0),
      advance: z.number().min(0).default(0),
      paymentMode: z.enum(["CASH", "ONLINE"]).default("CASH"),
    }).parse(req.body);
    if (input.mobileNumber) {
      const digits = input.mobileNumber.replace(/\D/g, "");
      if (digits.length !== 10) {
        return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
      }
    }
    const { data: latest } = await db
      .from("coaching_registrations")
      .select("bill_number")
      .eq("organization_id", req.organizationId!)
      .order("bill_number", { ascending: false })
      .limit(1);
    const nextBill = (latest?.[0]?.bill_number ?? 0) + 1;
    if (nextBill > 999999) return res.status(400).json({ error: "Bill number limit reached for this arena" });
    const { data, error } = await db.from("coaching_registrations").insert({
      organization_id: req.organizationId!,
      bill_number: nextBill,
      parent_name: input.parentName,
      child_name: input.childName,
      age: input.age,
      mobile_number: input.mobileNumber,
      level: input.level,
      court_number: input.courtNumber,
      start_time: input.startTime,
      end_time: input.endTime,
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      amount: input.amount,
      discount: input.discount,
      advance: input.advance,
      payment_mode: input.paymentMode,
      created_by: req.user!.id,
    }).select("*").single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ entry: data });
  });

  app.delete("/ops/coaching/:id", ...withOrg, async (req: AuthedRequest, res) => {
    const { error } = await db.from("coaching_registrations").delete().eq("id", req.params.id).eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  app.get("/ops/membership-billing", ...withOrg, async (req: AuthedRequest, res) => {
    const { data, error } = await db.from("membership_billing").select("*").eq("organization_id", req.organizationId!).order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ entries: data ?? [] });
  });

  app.post("/ops/membership-billing", json, ...withOrg, async (req: AuthedRequest, res) => {
    const input = z.object({
      customerName: z.string().trim().min(1),
      customerMobile: z.string().trim().min(1, "Mobile number is required"),
      sportName: z.string().default(""),
      timing: z.string().default(""),
      bookingMethod: z.string().default("WALK_IN"),
      amount: z.number().positive("Amount must be greater than 0"),
      paymentMode: z.enum(["CASH", "ONLINE"]).default("CASH"),
      startDate: z.string().min(1, "Start date is required"),
      endDate: z.string().min(1, "End date is required"),
      items: z.array(cartItemSchema).default([]),
    }).parse(req.body);
    const mobileDigitsOnly = input.customerMobile.replace(/\D/g, "");
    if (mobileDigitsOnly.length !== 10) {
      return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
    }
    if (input.endDate < input.startDate) {
      return res.status(400).json({ error: "End date must be on or after start date" });
    }
    const { data: latest } = await db.from("membership_billing").select("bill_number").eq("organization_id", req.organizationId!).order("bill_number", { ascending: false }).limit(1);
    const next = (latest?.[0]?.bill_number ?? 0) + 1;
    if (next > 999999) return res.status(400).json({ error: "Bill number limit reached for this arena" });
    const billNumber = next;
    const { data, error } = await db.from("membership_billing").insert({
      organization_id: req.organizationId!,
      bill_number: billNumber,
      customer_name: input.customerName,
      customer_mobile: mobileDigitsOnly,
      sport_name: input.sportName,
      timing: input.timing,
      booking_method: input.bookingMethod,
      amount: input.amount,
      payment_mode: input.paymentMode,
      start_date: input.startDate,
      end_date: input.endDate,
      items: input.items,
      created_by: req.user!.id,
    }).select("*").single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json({ entry: data });
  });

  app.delete("/ops/membership-billing/:id", ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role === "cashier") return res.status(403).json({ error: "Insufficient role" });
    const { error } = await db.from("membership_billing").delete().eq("id", req.params.id).eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });

  /** Memberships expiring soon (for staff one-tap WhatsApp remind). Default within 1 day. */
  app.get("/ops/membership-reminders", ...withOrg, async (req: AuthedRequest, res) => {
    const withinDays = Math.max(0, Math.min(30, Number(req.query.withinDays ?? 1)));
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + withinDays);
    const untilIso = `${until.getFullYear()}-${pad(until.getMonth() + 1)}-${pad(until.getDate())}`;

    const { data, error } = await db
      .from("membership_billing")
      .select("id, bill_number, customer_name, customer_mobile, sport_name, timing, start_date, end_date, amount")
      .eq("organization_id", req.organizationId!)
      .not("end_date", "is", null)
      .gte("end_date", todayIso)
      .lte("end_date", untilIso)
      .order("end_date", { ascending: true })
      .limit(100);
    if (error) return res.status(400).json({ error: error.message });

    const entries = (data ?? []).filter((row) => String(row.customer_mobile || "").replace(/\D/g, "").length === 10);
    res.json({ entries, withinDays, from: todayIso, to: untilIso });
  });

  app.get("/ops/profile", ...withOrg, async (req: AuthedRequest, res) => {
    const { data, error } = await db.from("organizations")
      .select("id,name,address,pincode,contact_phone")
      .eq("id", req.organizationId!)
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({
      profile: {
        name: data.name,
        address: data.address ?? "",
        pincode: data.pincode ?? "",
        contactPhone: data.contact_phone ?? "",
      },
    });
  });

  app.patch("/ops/profile", json, ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the owner can update arena profile" });
    const input = z.object({
      name: z.string().trim().min(2).max(120).optional(),
      address: z.string().trim().max(300).optional(),
      pincode: z.string().trim().max(12).optional(),
      contactPhone: z.string().trim().max(15).optional(),
    }).parse(req.body);
    if (input.contactPhone) {
      const digits = input.contactPhone.replace(/\D/g, "");
      if (digits.length !== 10) return res.status(400).json({ error: "Mobile number must be exactly 10 digits" });
    }
    const { data, error } = await db.from("organizations").update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.contactPhone !== undefined ? { contact_phone: input.contactPhone } : {}),
    }).eq("id", req.organizationId!).select("id,name,address,pincode,contact_phone").single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({
      profile: {
        name: data.name,
        address: data.address ?? "",
        pincode: data.pincode ?? "",
        contactPhone: data.contact_phone ?? "",
      },
    });
  });

  /** Owner-only: list arena staff (manager role). */
  app.get("/ops/staff", ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the owner can manage staff" });
    const { data, error } = await db.from("organization_memberships")
      .select("user_id,role,active,created_at")
      .eq("organization_id", req.organizationId!)
      .eq("role", "manager")
      .order("created_at", { ascending: false });
    if (error) return res.status(400).json({ error: error.message });

    const rows = data ?? [];
    const staff = await Promise.all(rows.map(async (row) => {
      const [{ data: userData }, { data: profile }] = await Promise.all([
        db.auth.admin.getUserById(row.user_id),
        db.from("profiles").select("full_name").eq("id", row.user_id).maybeSingle(),
      ]);
      return {
        userId: row.user_id,
        email: userData.user?.email ?? "",
        fullName: profile?.full_name ?? "",
        role: "staff" as const,
        active: row.active,
        createdAt: row.created_at,
      };
    }));
    res.json({ staff });
  });

  /** Owner-only: invite staff by email (creates Auth user if needed, role=manager). */
  app.post("/ops/staff", json, ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the owner can add staff" });
    try {
      const input = z.object({
        email: z.string().trim().email().max(254),
        fullName: z.string().trim().max(120).optional().default(""),
      }).parse(req.body);
      const email = input.email.toLowerCase();

      let userId: string | null = null;
      for (let page = 1; page <= 10; page += 1) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const hit = (data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
        if (hit) {
          userId = hit.id;
          break;
        }
        if ((data.users ?? []).length < 200) break;
      }

      if (!userId) {
        const { data: created, error: createError } = await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            full_name: input.fullName,
            password_set: false,
            invited_as_staff: true,
          },
        });
        if (createError || !created.user) {
          return res.status(400).json({ error: createError?.message ?? "Unable to create staff user" });
        }
        userId = created.user.id;
        await db.from("profiles").upsert({
          id: userId,
          full_name: input.fullName || email.split("@")[0],
        }, { onConflict: "id" });
      } else if (input.fullName) {
        await db.from("profiles").upsert({ id: userId, full_name: input.fullName }, { onConflict: "id" });
      }

      const { data: existingMem } = await db.from("organization_memberships")
        .select("user_id,role,active")
        .eq("organization_id", req.organizationId!)
        .eq("user_id", userId)
        .maybeSingle();

      if (existingMem?.active && existingMem.role === "owner") {
        return res.status(409).json({ error: "This email is the arena owner" });
      }
      if (existingMem?.active && existingMem.role === "manager") {
        return res.status(409).json({ error: "This email is already staff on this arena" });
      }

      if (existingMem) {
        const { error: updError } = await db.from("organization_memberships").update({
          role: "manager",
          active: true,
        })
          .eq("organization_id", req.organizationId!)
          .eq("user_id", userId);
        if (updError) return res.status(400).json({ error: updError.message });
      } else {
        const { error: insError } = await db.from("organization_memberships").insert({
          organization_id: req.organizationId!,
          user_id: userId,
          role: "manager",
          active: true,
        });
        if (insError) return res.status(400).json({ error: insError.message });
      }

      res.status(201).json({
        ok: true,
        email,
        message: "Staff added. They can log in with Email OTP on this same app, then set a password.",
      });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Enter a valid staff email" });
      return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to add staff" });
    }
  });

  /** Owner-only: deactivate staff membership (keyed by user_id). */
  app.delete("/ops/staff/:userId", ...withOrg, async (req: AuthedRequest, res) => {
    if (req.role !== "owner") return res.status(403).json({ error: "Only the owner can remove staff" });
    const { data, error } = await db.from("organization_memberships")
      .update({ active: false })
      .eq("user_id", req.params.userId)
      .eq("organization_id", req.organizationId!)
      .eq("role", "manager")
      .select("user_id")
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Staff member not found" });
    res.json({ ok: true });
  });

  app.get("/ops/generated-invoices", ...withOrg, async (req: AuthedRequest, res) => {
    const { data, error } = await db.from("generated_invoices")
      .select("id,bill_number,customer_name,customer_mobile,grand_total,payload,created_at")
      .eq("organization_id", req.organizationId!)
      .order("bill_number", { ascending: false })
      .limit(200);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ invoices: data ?? [] });
  });

  app.post("/ops/generated-invoices", json, ...withOrg, async (req: AuthedRequest, res) => {
    try {
      const input = z.object({
        billNumber: z.number().int().min(1).max(999999),
        customerName: z.string().trim().min(1),
        customerMobile: z.string().trim().default(""),
        grandTotal: z.number().min(0),
        payload: z.record(z.string(), z.unknown()),
      }).parse(req.body);
      const { data, error } = await db.from("generated_invoices").insert({
        organization_id: req.organizationId!,
        bill_number: input.billNumber,
        customer_name: input.customerName,
        customer_mobile: input.customerMobile,
        grand_total: input.grandTotal,
        payload: input.payload,
        created_by: req.user!.id,
      }).select("id,bill_number,customer_name,customer_mobile,grand_total,payload,created_at").single();
      if (error || !data) return res.status(400).json({ error: error?.message ?? "Unable to save invoice" });
      res.status(201).json({ invoice: data });
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid invoice payload" });
      return res.status(500).json({ error: error instanceof Error ? error.message : "Unable to save invoice" });
    }
  });

  app.delete("/ops/generated-invoices/:id", ...withOrg, async (req: AuthedRequest, res) => {
    const { error } = await db.from("generated_invoices")
      .delete()
      .eq("id", req.params.id)
      .eq("organization_id", req.organizationId!);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  });
}
