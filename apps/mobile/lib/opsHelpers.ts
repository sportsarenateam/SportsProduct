export type CartLine = {
  itemId: string | null;
  name: string;
  price: number;
  quantity: number;
  category: "EQUIPMENT" | "BEVERAGE";
};

export function mobileDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidMobile(value: string, required = false) {
  const digits = mobileDigits(value);
  if (!digits) return !required;
  return digits.length === 10;
}

export function sanitizeMobileInput(raw: string) {
  return mobileDigits(raw).slice(0, 10);
}

export function sanitizeAmountInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  return rest.length ? `${normalizedWhole || "0"}.${decimals}` : normalizedWhole;
}

export function parseAmount(value: string) {
  if (!value.trim()) return NaN;
  return Number(value);
}

export function adjustCartQty(cart: CartLine[], itemId: string | null, delta: number): CartLine[] {
  return cart
    .map((row) => (row.itemId === itemId ? { ...row, quantity: row.quantity + delta } : row))
    .filter((row) => row.quantity > 0);
}

export function upsertCartItem(
  cart: CartLine[],
  item: { id: string; name: string; price: number; category: "EQUIPMENT" | "BEVERAGE" },
  delta = 1,
): CartLine[] {
  const existing = cart.find((row) => row.itemId === item.id);
  if (existing) return adjustCartQty(cart, item.id, delta);
  if (delta <= 0) return cart;
  return [...cart, {
    itemId: item.id,
    name: item.name,
    price: Number(item.price),
    quantity: delta,
    category: item.category,
  }];
}

export function cartItemsTotal(cart: CartLine[]) {
  return cart.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
}

export function bookingAmount(pricePerHour: number, hours: number, courtCount: number) {
  if (courtCount <= 0 || hours <= 0) return 0;
  return Number(pricePerHour) * hours * courtCount;
}

export function grandTotal(booking: number, items: number, discount = 0, advance = 0) {
  return Math.max(0, booking + items - discount - advance);
}

export function daysUntil(iso: string | null | undefined) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export function formatPlanDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Label for nav / home so owners know when to renew (DB dates, device only for display). */
export function planRenewLabel(arena: {
  status: string;
  trial_ends_at: string | null;
  current_period_ends_at?: string | null;
}) {
  const status = arena.status === "created" ? "trialing" : arena.status;
  if (status === "trialing" && arena.trial_ends_at) {
    const days = daysUntil(arena.trial_ends_at) ?? 0;
    return days > 0
      ? `Trial · ${days}d left · renew before ${formatPlanDate(arena.trial_ends_at)}`
      : "Trial ended — renew now";
  }
  if (["active", "authenticated"].includes(status)) {
    if (arena.current_period_ends_at) {
      const days = daysUntil(arena.current_period_ends_at) ?? 0;
      if (days <= 0) return "Plan expired — renew now";
      if (days <= 7) return `Renew in ${days}d · ends ${formatPlanDate(arena.current_period_ends_at)}`;
      return `Plan active · renews ${formatPlanDate(arena.current_period_ends_at)}`;
    }
    return "Subscription active";
  }
  return "Subscription required";
}

export function byBillDesc(a: { bill_number?: number | null }, b: { bill_number?: number | null }) {
  return Number(b.bill_number || 0) - Number(a.bill_number || 0);
}

/** SpreadsheetML workbook (.xls) — opens in Excel / Google Sheets with multiple sheets. */
export function buildExcelWorkbookXml(
  sheets: Array<{ name: string; headers: string[]; rows: unknown[][] }>,
) {
  const esc = (value: unknown) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const body = sheets.map((sheet) => {
    const safeName = sheet.name.replace(/[\\/*?:\[\]]/g, " ").slice(0, 31) || "Sheet";
    const header = `<Row>${sheet.headers.map((h) => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("")}</Row>`;
    const rows = sheet.rows.map((row) => `<Row>${row.map((cell) => {
      const isNum = typeof cell === "number" && Number.isFinite(cell);
      return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${esc(cell)}</Data></Cell>`;
    }).join("")}</Row>`).join("");
    return `<Worksheet ss:Name="${esc(safeName)}"><Table>${header}${rows}</Table></Worksheet>`;
  }).join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${body}
</Workbook>`;
}

/** Plain multi-section CSV for Share on mobile (Excel opens each section as contiguous blocks). */
export function buildMultiSectionCsv(
  sheets: Array<{ name: string; headers: string[]; rows: unknown[][] }>,
) {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return sheets.map((sheet) => {
    const lines = [
      sheet.name,
      sheet.headers.map(escape).join(","),
      ...sheet.rows.map((row) => row.map(escape).join(",")),
    ];
    return lines.join("\n");
  }).join("\n\n");
}

export const PASSWORD_HINT =
  "Min 8 characters, with at least 1 letter, 1 number, and 1 special character (!@#$…).";

export function assertPasswordStrength(password: string, confirm?: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password.length > 72) throw new Error("Password must be 72 characters or fewer");
  if (!/[A-Za-z]/.test(password)) throw new Error("Password must include at least one letter");
  if (!/\d/.test(password)) throw new Error("Password must include at least one number");
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include at least one special character (e.g. !@#$%)");
  }
  if (confirm !== undefined && password !== confirm) {
    throw new Error("Password and confirm password must match");
  }
}
