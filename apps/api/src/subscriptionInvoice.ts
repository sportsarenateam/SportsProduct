import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionInvoiceRow = {
  id: string;
  organization_id: string;
  invoice_number: string;
  cashfree_order_id: string;
  plan_id: string | null;
  plan_name: string;
  amount: number;
  currency: string;
  period_starts_at: string;
  period_ends_at: string;
  customer_email: string;
  customer_name: string;
  arena_name: string;
  arena_address: string;
  payment_provider: string;
  emailed_at: string | null;
  created_at: string;
};

export type InvoiceIssuerConfig = {
  supportEmail: string;
  supportPhone: string;
  legalName: string;
  gstin?: string;
};

const logoCandidates = [
  fileURLToPath(new URL("../../web/src/assets/sportzarena-logo.png", import.meta.url)),
  fileURLToPath(new URL("../../mobile/assets/sportzarena-logo.png", import.meta.url)),
];

function inr(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatShortDate(iso: string, includeYear = true) {
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    ...(includeYear ? { year: "numeric" } : {}),
  });
}

function formatWhen(iso: string) {
  return formatShortDate(iso);
}

async function allocateInvoiceNumber(db: SupabaseClient) {
  const { data, error } = await db.rpc("next_subscription_invoice_number");
  if (!error && data) return String(data);
  const year = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" });
  const { count } = await db.from("subscription_invoices").select("id", { count: "exact", head: true });
  return `SA-${year}-${String((count ?? 0) + 1001).padStart(4, "0")}`;
}

export function buildSubscriptionInvoicePdf(row: SubscriptionInvoiceRow, config: InvoiceIssuerConfig) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    const logo = logoCandidates.find((path) => existsSync(path));
    if (logo) {
      try {
        doc.image(logo, margin, 40, { fit: [72, 72], align: "center", valign: "center" });
      } catch {
        // A missing or unsupported logo must not prevent invoice download.
      }
    }
    const issuerX = margin + 92;
    const issuerWidth = contentWidth - 92;
    doc.fontSize(11).fillColor("#0f172a")
      .text(config.legalName, issuerX, 42, { width: issuerWidth, align: "right" });
    doc.fontSize(9).fillColor("#475569")
      .text("https://sportsarena.team", issuerX, 60, { width: issuerWidth, align: "right" })
      .text(config.supportEmail, issuerX, 74, { width: issuerWidth, align: "right" })
      .text(config.supportPhone, issuerX, 88, { width: issuerWidth, align: "right" });
    if (config.gstin) {
      doc.text(`GSTIN ${config.gstin}`, issuerX, 102, { width: issuerWidth, align: "right" });
    }

    doc.fillColor("#0f172a").fontSize(20).text("Subscription invoice", margin, 132, { width: contentWidth });
    doc.fontSize(10).fillColor("#475569")
      .text(`Invoice ${row.invoice_number}`, margin, 162, { width: contentWidth })
      .text(`Date ${formatWhen(row.created_at)}`, margin, 177, { width: contentWidth })
      .text(`Payment ${row.payment_provider} · Order ${row.cashfree_order_id}`, margin, 192, { width: contentWidth });

    const billToTop = 232;
    doc.fillColor("#0f172a").fontSize(11).text("Bill to", margin, billToTop, { width: contentWidth });
    doc.fontSize(10).fillColor("#334155").text(row.arena_name, margin, billToTop + 18, { width: contentWidth });

    const customerName = row.customer_name.trim();
    const customerEmail = row.customer_email.trim();
    if (customerName && customerName.toLowerCase() !== customerEmail.toLowerCase()) {
      doc.text(customerName, margin, billToTop + 33, { width: contentWidth });
    }
    const emailY = billToTop + (customerName && customerName.toLowerCase() !== customerEmail.toLowerCase() ? 48 : 33);
    doc.text(customerEmail, margin, emailY, { width: contentWidth });
    if (row.arena_address) {
      doc.text(row.arena_address, margin, emailY + 15, { width: contentWidth });
    }

    const addressHeight = row.arena_address
      ? doc.heightOfString(row.arena_address, { width: contentWidth })
      : 0;
    const tableTop = Math.max(330, emailY + 24 + addressHeight);
    const tableX = margin;
    const tableWidth = contentWidth;
    const descX = tableX + 8;
    const descWidth = 240;
    const periodX = descX + descWidth + 12;
    const periodWidth = 150;
    const amountX = periodX + periodWidth + 8;
    const amountWidth = tableX + tableWidth - 8 - amountX;
    const headerHeight = 28;

    doc.rect(tableX, tableTop, tableWidth, headerHeight).fill("#0f766e");
    doc.fillColor("#ffffff").fontSize(10)
      .text("Description", descX, tableTop + 8, { width: descWidth })
      .text("Period", periodX, tableTop + 8, { width: periodWidth })
      .text("Amount", amountX, tableTop + 8, { width: amountWidth, align: "right" });

    const startYear = new Date(row.period_starts_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    });
    const endYear = new Date(row.period_ends_at).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    });
    const sameYear = startYear === endYear;
    const period = `${formatShortDate(row.period_starts_at, !sameYear)} – ${formatShortDate(row.period_ends_at)}`;
    const description = `${row.plan_name} plan — SportzArena operations software`;
    doc.font("Helvetica").fontSize(10);
    const rowTextOptions = { lineGap: 2 };
    const bodyHeight = Math.max(
      doc.heightOfString(description, { ...rowTextOptions, width: descWidth }),
      doc.heightOfString(period, { ...rowTextOptions, width: periodWidth }),
      doc.heightOfString(inr(Number(row.amount)), { ...rowTextOptions, width: amountWidth }),
    );
    const rowHeight = Math.max(44, bodyHeight + 16);
    const rowTop = tableTop + headerHeight;
    doc.rect(tableX, rowTop, tableWidth, rowHeight).fill("#f8fafc");
    doc.fillColor("#0f172a").fontSize(10)
      .text(description, descX, rowTop + 8, { width: descWidth, lineGap: 2 })
      .text(period, periodX, rowTop + 8, { width: periodWidth, lineGap: 2 })
      .text(inr(Number(row.amount)), amountX, rowTop + 8, { width: amountWidth, align: "right" });

    const totalY = rowTop + rowHeight + 22;
    doc.fillColor("#0f172a").fontSize(14)
      .text(`Total paid  ${inr(Number(row.amount))}`, margin, totalY, { width: contentWidth, align: "right" });

    const noteY = totalY + 44;
    doc.fontSize(9).fillColor("#64748b")
      .text("This invoice is issued by SportzArena for the SaaS subscription. Cashfree collects the payment as our payment gateway and does not issue this invoice.", margin, noteY, { width: contentWidth })
      .moveDown(0.6)
      .text(config.gstin
        ? "This is a tax invoice for the subscription period shown above."
        : "This is a payment receipt for the subscription period shown above. A GST tax invoice will be issued once GSTIN is registered on the SportzArena account.", { width: contentWidth });

    doc.end();
  });
}

export async function issueSubscriptionInvoice(
  db: SupabaseClient,
  _config: InvoiceIssuerConfig,
  input: {
    organizationId: string;
    cashfreeOrderId: string;
    planId?: string | null;
    periodEndsAt: string;
    fallbackEmail?: string | null;
  },
): Promise<{ invoice: SubscriptionInvoiceRow; alreadyIssued: boolean }> {
  const { data: existing } = await db.from("subscription_invoices")
    .select("*")
    .eq("cashfree_order_id", input.cashfreeOrderId)
    .maybeSingle();

  let row = existing as SubscriptionInvoiceRow | null;
  let alreadyIssued = Boolean(row);

  if (!row) {
    const [{ data: org }, { data: ownerMem }, { data: plan }] = await Promise.all([
      db.from("organizations").select("name,address,pincode,contact_phone").eq("id", input.organizationId).maybeSingle(),
      db.from("organization_memberships")
        .select("user_id")
        .eq("organization_id", input.organizationId)
        .eq("role", "owner")
        .eq("active", true)
        .maybeSingle(),
      db.from("subscription_plans").select("id,name,monthly_price").eq("id", input.planId || "basic").maybeSingle(),
    ]);

    let customerEmail = input.fallbackEmail?.trim().toLowerCase() || "";
    let customerName = "";
    if (ownerMem?.user_id) {
      const { data: authUser } = await db.auth.admin.getUserById(ownerMem.user_id);
      customerEmail = authUser.user?.email?.toLowerCase() || customerEmail;
      const meta = authUser.user?.user_metadata as { full_name?: string } | undefined;
      customerName = String(meta?.full_name ?? "").trim();
      const { data: profile } = await db.from("profiles").select("full_name").eq("id", ownerMem.user_id).maybeSingle();
      if (profile?.full_name) customerName = profile.full_name;
    }
    if (!customerEmail) {
      throw new Error("Owner email is required to issue a subscription invoice");
    }

    const invoiceNumber = await allocateInvoiceNumber(db);
    const now = new Date();
    const addressParts = [org?.address, org?.pincode].filter(Boolean).join(", ");

    const insert = {
      organization_id: input.organizationId,
      invoice_number: invoiceNumber,
      cashfree_order_id: input.cashfreeOrderId,
      plan_id: plan?.id ?? input.planId ?? "basic",
      plan_name: plan?.name ?? "Starter",
      amount: Number(plan?.monthly_price ?? 499),
      currency: "INR",
      period_starts_at: now.toISOString(),
      period_ends_at: new Date(input.periodEndsAt).toISOString(),
      customer_email: customerEmail,
      customer_name: customerName,
      arena_name: org?.name || "Sports Arena",
      arena_address: addressParts,
      payment_provider: "cashfree",
    };

    const { data: created, error } = await db.from("subscription_invoices").insert(insert).select("*").single();
    if (error?.code === "23505") {
      const { data: raced } = await db.from("subscription_invoices")
        .select("*")
        .eq("cashfree_order_id", input.cashfreeOrderId)
        .maybeSingle();
      if (!raced) throw new Error(error.message);
      row = raced as SubscriptionInvoiceRow;
      alreadyIssued = true;
    } else if (error || !created) {
      throw new Error(error?.message ?? "Unable to save subscription invoice");
    } else {
      row = created as SubscriptionInvoiceRow;
    }
  }

  if (!row) throw new Error("Unable to load subscription invoice");
  return { invoice: row, alreadyIssued };
}
